# DCC Ragusa — notes for future sessions

Scoped to `dcc-ragusa/`. The repo root's `CLAUDE.md` belongs to the
Availability Calendar; this file governs this folder.

## Branch rule

Work on `claude/dcc-ragusa`, created from `origin/main`. Never commit to
`main` (it holds the shared site context) and never to another plugin's
branch. The repo's default branch is **not** main; always name the base.

## What this plugin is

The walls of doracanalcourt.com: a security plugin that watches everything,
blocks or quarantines only what it is certain of, undoes only what can be
undone, and emails Rob for the rest. Five fortresses, Croatian names with
their diacritics on screen, ASCII slugs in code:

| Name | Slug | Does |
| --- | --- | --- |
| Minčeta | `minceta` | file integrity, critical options, Jetpack modules, disk |
| Bokar | `bokar` | administrators, roles, application passwords, admin logins |
| Revelin | `revelin` | sealed copies, the vault, the pre-update plugin copies |
| Lovrijenac | `lovrijenac` | the vulnerability feed, wordpress.org signals, the heartbeat |
| Sveti Ivan | `sveti-ivan` | every plugin install and update, the smoke checks, the rollback |

Plus Zelenci, a must-use sentinel that rings if Ragusa falls.

`docs/Ragusa - DESIGN.md` is the approved design; section 11 holds the
Director's corrections of 2026-10-21. Read it before changing behaviour.

## Invariants — do not "fix" these without asking Rob

- **Zero weight for guests.** `dcc-ragusa.php` returns before any hook on a
  request that is not wp-admin, cron, WP-CLI or wp-login.php. The test
  suite proves it in a separate PHP process. Nothing is enqueued on the
  front end, ever.
- **Only `dcc_ragusa_settings` autoloads.** Every other option is
  autoload=no; a test scans the source for it.
- **Four autonomous actions, nothing else.** Quarantine (A1), restore a
  guard (A2), rewrite the .htaccess block (A3), roll back a plugin update
  (A4). Everything else is an alert. Never force-update, deactivate or
  delete a plugin; never edit wp-config.php; never roll back core or Ragusa
  itself.
- **Write-ahead journal.** Every action writes its next state before the
  step it names, and `Actions::recover()` finishes or reverses what a dead
  run left. Each action class has `run`, `recover` and `reverse`.
- **One failure is never enough.** Sveti Ivan repeats a failed check five
  minutes later; only the same check failing twice, with the home page
  still answering, can roll back. A silent host is a hiccup.
- **Uploads `.htaccess` files are judged by meaning.** Nineteen exist and
  some are protection. `Htaccess::enables_execution()` is the only rule;
  every control file present on the first pass is baselined.
- **Guards restore at most twice in 24 hours**, then alert. Seal
  (`wp ragusa seal <path>`) accepts the current file; the Director edits
  mu-plugins on purpose.
- **A forced install over an existing slug is an update** (Revelin seals
  from `upgrader_source_selection`, which fires before the old folder is
  cleared). A brand-new slug is an install and never rolls back.
- **Secrets never appear anywhere.** Heartbeat URL and feed key are sealed
  with the vault key, masked on screen, and `Text::scrub()` runs on every
  event, journal note and email. The URL is in no log line.
- **Staging sends nothing.** Role is decided from the prefix and URL on
  every run, never a stored flag. Staging has its own vault folder and may
  never touch the live one.
- **No guest data.** Bokar names only administrators; IPs are a salted hash
  plus a truncated display form, kept 90 days. MotoPress is never read or
  written; the source test asserts no post write exists.
- **The vault cap is 300 MB**, protected kinds are never evicted, and a copy
  that cannot fit is simply not sealed, with an alert saying so.
- **Core and wordpress.org plugin files are alert-only.** Ragusa restores
  only from its own sealed copies.
- **The cron schedule is registered in the main file, at load.** Activation
  runs after `plugins_loaded`, so anything registered in `boot()` does not
  exist yet when `Cron::schedule()` runs. `Cron::ensure()` on every watched
  boot is the belt to that brace.
- **The first complete pass is the baseline**, flagged by
  `minceta.baselined` only when a pass finishes; never judge "first" from
  an empty index, which the first chunk fills.
- **Bokar never trusts `WP_User::$roles` alone.** Roles come from the
  `{prefix}capabilities` meta, then any `*capabilities` key (a clone whose
  prefix changed), then the object.
- **A 200 that is a login form is "not checked".** `Sveti_Ivan::looks_like_login()`;
  the drill uses its own probe, answered on `plugins_loaded` before any gate.

## Facts baked in (from the Director's live checks, 2026-10-21)

- Markers: `Markers::defaults()`. Three belong to DCC plugins the Director
  updates; `wp ragusa markers set` exists for a deliberate rename.
- iCal rooms: `Ical::ROOMS`. The exporter is `\MPHB\iCal\Exporter::export($room_id)`,
  captured with `ob_start`, swallowing only the two header warnings.
- error_log: `ABSPATH/error_log`, `dirname(ABSPATH)/error_log`,
  `WP_CONTENT_DIR/debug.log`; rotated by rename then truncation.
- The eight benign stubs under uploads: `Minceta::STUB_ALLOWLIST` (path and size).
- Vendor mu-plugins that change as info: `Minceta::MU_VENDOR`.
- Healthchecks: Period 1 hour, Grace 1 hour (the cPanel knock runs every 10 minutes).
- Wordfence v3 scanner feed, Bearer key, once a day at 03:40 ET.

## Running the tests

    php tests/run-tests.php            # ~385 assertions, synthetic site in /tmp
    php tests/mutations.php            # 22 deliberate breakages, each must be caught
    php tests/render-screens.php       # renders the page to tests/screens/
    node tests/layout-check.js         # no sideways scroll at 390 and 360, 44px buttons, screenshots

The suite runs without WordPress: `tests/bootstrap.php` stubs the core
functions, `tests/lib/wpdb.php` is a SQLite-backed `$wpdb` that runs the
plugin's real SQL, and `tests/lib/site.php` builds the synthetic site. A
PHP warning fails the suite.

## Deliverable file names

- the zip is `Ragusa <version>.zip`
- every other file carries a `Ragusa - ` prefix (the docs in `docs/` already do)

## Building the zip

    cd $(git rev-parse --show-toplevel)
    rm -f "Ragusa "*.zip
    zip -rq "Ragusa 0.1.1.zip" dcc-ragusa -x 'dcc-ragusa/tests/*' 'dcc-ragusa/CLAUDE.md' 'dcc-ragusa/.gitignore'

The version in the file name must match `DCCR_VERSION` in `dcc-ragusa.php`.
