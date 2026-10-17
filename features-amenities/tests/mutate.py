#!/usr/bin/env python3
"""
Mutation run for the Features & Amenities test suite.

    python3 tests/mutate.py

A green suite only means something if it can go red. This reintroduces each
bug the suite is supposed to guard, confirms `php tests/run.php` fails, then
restores the file byte-for-byte. A mutation that leaves the suite green is a
test that is not actually testing anything, and is reported as SURVIVED.

Dev tool: not shipped in the plugin zip.
"""
import io
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))
RUNNER = os.path.join(ROOT, "tests", "run.php")

# (label, relative file, find, replace) — each reintroduces one audit finding.
MUTATIONS = [
    (
        "fix 1: pet ban back in the packaged defaults",
        "includes/class-widget.php",
        "'No smoking inside the cottage. No children.'",
        "'No smoking inside the cottage. No children or pets are allowed.'",
    ),
    (
        "fix 2: front-end unconditional enqueue reintroduced",
        "includes/class-plugin.php",
        "\t\twp_register_style(",
        "\t\twp_enqueue_style( 'features-amenities' );\n\t\twp_register_style(",
    ),
    (
        "fix 2: Elementor registration hooks removed",
        "includes/class-plugin.php",
        "add_action( 'elementor/frontend/after_register_styles', [ $this, 'register_assets' ] );",
        "",
    ),
    (
        "fix 3: dark-mode override restored",
        "assets/css/widget.css",
        ".fal-search-wrap { position: relative; margin-bottom: 25px; }",
        "@media (prefers-color-scheme: dark) {\n"
        "\t.fal-container { color: #f0f0f0; }\n}\n\n"
        ".fal-search-wrap { position: relative; margin-bottom: 25px; }",
    ),
    (
        "fix 4: Read More hover un-gated (iOS sticky coral)",
        "assets/css/widget.css",
        "@media (hover: hover) and (pointer: fine) {\n"
        "\t.fal-container .fal-read-more:hover { background: transparent; text-decoration: underline; }\n}",
        ".fal-container .fal-read-more:hover { background: transparent; text-decoration: underline; }",
    ),
    (
        "fix 4: .fal-container prefix dropped from clear button",
        "assets/css/widget.css",
        ".fal-container .fal-search-clear {",
        ".fal-search-clear {",
    ),
    (
        "fix 4: clear button back to a 32px tap area",
        "assets/css/widget.css",
        "padding: 0; min-width: 44px; min-height: 44px;",
        "padding: 8px; min-width: 32px; min-height: 32px;",
    ),
    (
        "tap standard: input reserve back to 40px (area covers input text)",
        "assets/css/widget.css",
        "width: 100%; padding: 12px 44px 12px 40px;",
        "width: 100%; padding: 12px 40px;",
    ),
    (
        "fix 4: :focus rule dropped from clear button (kit coral returns)",
        "assets/css/widget.css",
        ".fal-container .fal-search-clear:focus { background: transparent; }\n",
        "",
    ),
    (
        "fix 4: :focus rule dropped from Read More (kit coral returns)",
        "assets/css/widget.css",
        ".fal-container .fal-read-more:focus { background: transparent; }\n",
        "",
    ),
    (
        "editor preview: asset registration moved behind is_admin()",
        "includes/class-plugin.php",
        "\t\tadd_action( 'elementor/frontend/after_register_scripts', [ $this, 'register_assets' ] );",
        "",
    ),
    (
        "fix 5: editor title label reverted",
        "includes/class-widget.php",
        "'Short label (e.g. Dining Area)'",
        "'Text / Title'",
    ),
]


BROWSER = os.path.join(ROOT, "tests", "browser", "touch.test.mjs")


def run_suite():
    """Red if EITHER suite fails. The browser run is skipped (exit 2) when no
    engine is available; a skip must not be read as a pass, so a mutation that
    only the browser run would catch is reported as SURVIVED in that case."""
    rc = subprocess.run(["php", RUNNER], capture_output=True, text=True, cwd=ROOT).returncode
    if rc != 0:
        return rc
    b = subprocess.run(["node", BROWSER], capture_output=True, text=True, cwd=ROOT).returncode
    return 0 if b in (0, 2) else b


def main():
    baseline = run_suite()
    if baseline != 0:
        print("ABORT: the suite is already red before any mutation.")
        return 1
    print("baseline: suite green\n")

    survived = []
    for label, rel, find, replace in MUTATIONS:
        path = os.path.join(ROOT, rel)
        original = io.open(path, encoding="utf-8").read()

        if original.count(find) != 1:
            print(f"  ERROR   {label}\n          anchor matched {original.count(find)} times; "
                  "the mutation could not be applied")
            survived.append(label)
            continue

        io.open(path, "w", encoding="utf-8").write(original.replace(find, replace, 1))
        try:
            rc = run_suite()
        finally:
            io.open(path, "w", encoding="utf-8").write(original)
            assert io.open(path, encoding="utf-8").read() == original, f"restore failed for {rel}"

        if rc != 0:
            print(f"  CAUGHT  {label}")
        else:
            print(f"  SURVIVED {label}  <-- the suite does not detect this")
            survived.append(label)

    final = run_suite()
    print("\n" + "-" * 56)
    print(f"{len(MUTATIONS) - len(survived)}/{len(MUTATIONS)} mutations caught")
    print("files restored, suite " + ("green" if final == 0 else "RED - restore problem"))
    return 1 if (survived or final != 0) else 0


if __name__ == "__main__":
    sys.exit(main())
