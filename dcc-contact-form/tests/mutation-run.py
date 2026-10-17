#!/usr/bin/env python3
"""
Mutation run for the 2026-10-17 audit fixes (1.7.1).

    python3 dcc-contact-form/tests/mutation-run.py

Each mutation reverts ONE fix, then the suites are re-run and must go red. A
mutation nothing notices is a fix nothing is testing.

Every patch is applied with `assert applied == 1`. That assertion exists
because of a real failure in the 1.7.0 round: the runner was written in shell
and the quoting mangled the patch strings, so several patches never applied at
all and the run reported "CAUGHT" for tests that had never seen a mutation,
and "ESCAPED" for one that had. A patch that does not apply is
indistinguishable from a test that does not look — so the application itself
is verified before any verdict is drawn.

Not shipped in the plugin zip.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PLUGIN = Path(__file__).resolve().parent.parent
REPO = PLUGIN.parent

PHP_SUITES = [
    "dcc-contact-form/tests/audit-1711-test.php",
    "dcc-contact-form/tests/security-test.php",
    "dcc-contact-form/tests/settings-test.php",
]
JS_SUITE = "dcc-contact-form/tests/browser-test.js"

# Each mutation is (label, patches, suites), where patches is either a single
# (file, find, replace) triple or a list of them — fix 7 is implemented twice
# over, so reverting one half alone is survivable by design and only a mutation
# that removes BOTH halves can be expected to show up.
MUTATIONS = [
    (
        "M1  fix 1: an unverified submission is rejected again",
        "includes/class-form-handler.php",
        "            if ($verdict === Recaptcha::SPAM) {",
        "            if ($verdict !== Recaptcha::PASS) {",
        "php",
    ),
    (
        "M1b fix 1: a LOW SCORE is treated as unverified (spam gets delivered)",
        "includes/class-recaptcha.php",
        """        return ((float) $data['score'] >= Settings::recaptcha_threshold())
            ? self::PASS
            : self::SPAM;""",
        """        return ((float) $data['score'] >= Settings::recaptcha_threshold())
            ? self::PASS
            : self::UNVERIFIED;""",
        "php",
    ),
    (
        "M1c fix 1: a forged token is accepted as unverified",
        "includes/class-recaptcha.php",
        "            return self::SPAM;\n        }\n\n        // A valid token minted",
        "            return self::UNVERIFIED;\n        }\n\n        // A valid token minted",
        "php",
    ),
    (
        "M1d fix 1: the Unverified marker is dropped from the subject",
        "includes/class-form-handler.php",
        "        $email_subject = $unverified\n            ? sprintf(",
        "        $email_subject = false\n            ? sprintf(",
        "php",
    ),
    (
        "M2  fix 2: honeypot catches are stored empty again",
        "includes/class-form-handler.php",
        "                self::store_spam($config, $form_id, $layer, $rows);",
        "                self::store_spam($config, $form_id, $layer, []);",
        "php",
    ),
    (
        "M2b fix 2: a human-looking trap catch is no longer flagged",
        "includes/class-form-handler.php",
        "$layer = Triage::looks_human($rows) ? 'honeypot:maybe-real' : 'honeypot';",
        "$layer = 'honeypot';",
        "php",
    ),
    (
        "M2c fix 2: the triage heuristic calls everything spam",
        "includes/class-triage.php",
        "        return self::reads_as_prose($values);",
        "        return false;",
        "php",
    ),
    (
        "M3  fix 3: the server-side length cap stops capping",
        "includes/class-form-handler.php",
        "        $max = self::max_len($type);\n        if (mb_strlen($value) <= $max) {",
        "        $max = self::max_len($type);\n        if (true) {",
        "php",
    ),
    (
        "M3b fix 3: the cap reports but no longer trims",
        "includes/class-form-handler.php",
        "        return mb_substr($value, 0, $max);",
        "        return $value;",
        "php",
    ),
    (
        "M3c fix 3: the daily spam-content cap never bites",
        "includes/class-entries.php",
        "        if ($tally['stored'] >= self::MAX_SPAM_ROWS_PER_DAY) {",
        "        if (false) {",
        "php",
    ),
    (
        "M3d fix 3: the cap also swallows real messages",
        "includes/class-form-handler.php",
        "        $entry_id = Entries::insert($rows, $subject, $form_id, $status);",
        "        $entry_id = Entries::insert_spam($rows, $subject, $form_id, $status);",
        "php",
    ),
    (
        "M4  fix 4: a failed notification is silent again",
        "includes/class-form-handler.php",
        "            Entries::set_status($entry_id, Entries::mail_failed_status($status));",
        "            // mutated: status not flagged",
        "php",
    ),
    (
        "M4b fix 4: the admin notice never renders",
        "includes/class-admin.php",
        "        if ($failed < 1 && $maybe_real < 1) {",
        "        if (true) {",
        "php",
    ),
    (
        "M4c fix 4: opening an entry no longer clears it",
        "includes/class-entries.php",
        "        self::set_status($id, $status . ':seen');",
        "        // mutated: never marked seen",
        "php",
    ),
    (
        "M5  fix 5: every tab shows everything",
        "includes/class-entries.php",
        '            case \'spam\':\n                return "spam_result LIKE \'spam:%\'";',
        '            case \'spam\':\n                return "1=1";',
        "php",
    ),
    (
        "M5b fix 5: unverified entries are hidden from their own tab",
        "includes/class-entries.php",
        '            case \'unverified\':\n                return "spam_result LIKE \'ham:unverified%\'";',
        '            case \'unverified\':\n                return "spam_result LIKE \'nothing%\'";',
        "php",
    ),
    (
        "M6  fix 6: the referer check never rejects (the original bug)",
        "includes/class-form-handler.php",
        "        $referer = isset($_SERVER['HTTP_REFERER']) ? trim((string) $_SERVER['HTTP_REFERER']) : '';",
        "        $referer = wp_get_referer() ?: '';",
        "php",
    ),
    (
        "M6b fix 6: an empty referer is refused (would block real guests)",
        "includes/class-form-handler.php",
        "        if ($referer === '') {\n            return true;\n        }",
        "        if ($referer === '') {\n            return false;\n        }",
        "php",
    ),
    (
        # EXPECTED SURVIVOR. Fix 7 is implemented twice: the hover rule is gated
        # to fine pointers AND the touch block re-asserts the resting blue at
        # the same (0,4,1) specificity, later in the file. Undo either half and
        # the other still produces blue, so this mutation is behaviourally
        # equivalent to the real code. M7c removes both and IS caught, which is
        # what demonstrates the pair is covered.
        "M7  fix 7: the hover rule escapes its media query (expected survivor)",
        "assets/css/widget.css",
        "@media (hover: hover) and (pointer: fine) {\n    .dcc-contact-form .dcc-submit:hover,",
        "@media all {\n    .dcc-contact-form .dcc-submit:hover,",
        "js",
    ),
    (
        "M7b fix 7: the touch re-assert is removed",
        "assets/css/widget.css",
        "@media (hover: none), (pointer: coarse) {",
        "@media (min-width: 99999px) {",
        "js",
    ),
    (
        "M7c fix 7: BOTH halves of the touch handling are removed",
        [
            ("assets/css/widget.css",
             "@media (hover: hover) and (pointer: fine) {\n    .dcc-contact-form .dcc-submit:hover,",
             "@media all {\n    .dcc-contact-form .dcc-submit:hover,"),
            ("assets/css/widget.css",
             "@media (hover: none), (pointer: coarse) {",
             "@media (min-width: 99999px) {"),
        ],
        "js",
    ),
    (
        "M8  fix 8: reCAPTCHA is loaded on page boot again",
        "assets/js/widget.js",
        "        if (siteKey && rcSrc) {\n            form.addEventListener('focusin', function () {\n                loadRecaptcha(rcSrc);\n            }, { once: true });\n        }",
        "        if (siteKey && rcSrc) {\n            loadRecaptcha(rcSrc);\n        }",
        "js",
    ),
    (
        "M8b fix 8: it is never loaded, so a submit cannot get a token",
        "assets/js/widget.js",
        "    function loadRecaptcha(src) {\n        if (rcLoad) { return rcLoad; }",
        "    function loadRecaptcha(src) {\n        return Promise.resolve(false);\n        if (rcLoad) { return rcLoad; }",
        "js",
    ),
    (
        "M9  fix 9: the tap extension shrinks below 44px",
        "assets/css/widget.css",
        "    transform: translateY(-50%);\n    height: 44px;",
        "    transform: translateY(-50%);\n    height: 24px;",
        "js",
    ),
    (
        "M9b fix 9: the extension grows until it swallows a neighbour",
        "assets/css/widget.css",
        "    transform: translateY(-50%);\n    height: 44px;",
        "    transform: translateY(-50%);\n    height: 240px;",
        "js",
    ),
]


def run(suites):
    """Run the chosen suites; return (red_count, total_count)."""
    red = 0
    total = 0
    for suite in PHP_SUITES if suites == "php" else [JS_SUITE]:
        total += 1
        cmd = ["php", suite] if suite.endswith(".php") else ["node", suite]
        proc = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=600)
        if proc.returncode != 0 or "FAIL" in proc.stdout:
            red += 1
    return red, total


def main():
    print("Baseline: every suite must be GREEN before mutating.\n")
    for suites in ("php", "js"):
        red, total = run(suites)
        print(f"  {suites}: {total - red}/{total} suites green")
        if red:
            print("BASELINE IS NOT GREEN — fix that before trusting any mutation.")
            return 1

    backup = Path(tempfile.mkdtemp(prefix="dcc-mut-"))
    shutil.copytree(PLUGIN, backup / "plugin", dirs_exist_ok=True)

    caught, escaped = [], []

    print(f"\n{len(MUTATIONS)} mutations.\n")
    for mutation in MUTATIONS:
        if len(mutation) == 5:
            label, rel, find, repl, suites = mutation
            patches = [(rel, find, repl)]
        else:
            label, patches, suites = mutation

        originals = {}
        for rel, find, repl in patches:
            target = PLUGIN / rel
            if rel not in originals:
                originals[rel] = target.read_text()

            current = target.read_text()
            # The assertion that makes this run mean anything.
            applied = current.count(find)
            assert applied == 1, (
                f"{label}: pattern found {applied} times in {rel}, expected exactly 1. "
                "The mutation would not have been applied and the verdict would be a lie."
            )
            target.write_text(current.replace(find, repl, 1))

        try:
            red, total = run(suites)
        finally:
            for rel, text in originals.items():
                (PLUGIN / rel).write_text(text)

        if red > 0:
            caught.append(label)
            print(f"  CAUGHT   {label}\n             ({red}/{total} suites went red)")
        else:
            escaped.append(label)
            print(f"  ESCAPED  {label}\n             *** nothing noticed this ***")

    print("\nRe-checking the baseline after restoring every file.")
    for suites in ("php", "js"):
        red, total = run(suites)
        if red:
            print(f"  {suites}: NOT RESTORED — compare against {backup}")
            return 1
    print("  restored clean.")

    print(f"\n{len(caught)}/{len(MUTATIONS)} caught, {len(escaped)} escaped.")
    for label in escaped:
        print(f"  ESCAPED: {label}")

    # A mutation marked "expected survivor" is behaviourally equivalent to the
    # real code, so its survival is a property of the design, not a gap.
    unexpected = [l for l in escaped if "expected survivor" not in l]
    if escaped and not unexpected:
        print("  (every escape is a documented equivalent mutation)")

    shutil.rmtree(backup, ignore_errors=True)
    return 0 if not unexpected else 1


if __name__ == "__main__":
    sys.exit(main())
