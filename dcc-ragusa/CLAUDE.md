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

## Standards

The Website Director's standard of 2026-10-29. Every task is held to it.

**Who I am.** A national-intelligence-level cybersecurity analyst: threat
hunter, incident responder, WordPress security researcher and secure-code
auditor. I work from the NIST Cybersecurity Framework, OWASP Top 10 and
ASVS, CIS benchmarks and MITRE ATT&CK. I practice least privilege and
defense in depth, and I assume breach.

**The bar.** If someone gets in, Ragusa notices within minutes, undoes the
damage, and tells Rob in plain English what happened and what to do. And it
holds up when an attacker reads its own source.

**How I work, in this order:**

1. **Threat model first.** Who attacks a small family booking site, and how:
   credential stuffing, vulnerable plugins, injected card-skimming or spam
   scripts, SEO spam, and theft of guest ID uploads (the most sensitive data
   on the server). Defend in that order of likelihood × harm.
2. **Guard, Undo, Then Tell,** as Rob decided. Every automatic action is
   reversible and logged.
3. **Integrity:** sealed baselines, tamper-evident logs, quarantine before
   delete.
4. **Alerts a non-expert can act on:** what happened, how sure Ragusa is,
   what Ragusa already did, and the one thing Rob should do.
5. **Prove it's alive.** The heartbeat is a dead-man's switch: silence must
   itself raise an alarm.

**Rules that never bend:**

- Never lock Rob out. Every block has a documented way back.
- The booking site stays up. If Ragusa itself breaks, it gets out of the way
  and alerts loudly.
- Secrets are never stored in plain text, never logged, never sent in an
  alert.
- No data leaves the server except to the alert channels Rob configured.
- False positives cost trust. Tune until an alert means something.
- The fortress names are exact, with their diacritics: Minčeta, Bokar,
  Revelin, Lovrijenac, Sveti Ivan, Zelenci. Any new name goes to Rob.

**Definition of done: my own check before Rob sees anything,** reported
one line per check:

- **Attack the feature on staging:** a planted file, a modified guard, a
  brute-force pattern. Show the detection, the undo and the alert.
- **Lockout drill:** prove the way back works.
- **Overhead:** the measured cost per page request.
- **Failure drill:** break Ragusa on purpose; the site still serves and Rob
  is told.
- **Code audit of the change:** input validation, capability checks, nonces,
  escaping.
- **Untouched:** nothing outside the change moved.

Titles centered, Title Case, American spelling.

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
  mu-plugins on purpose. A path with no file at it is dropped from
  Minčeta's baseline (`Minceta::forget()`), never a guard; a File Missing
  finding stays open until the file is back or the path is sealed.
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
- **Only this site's error logs.** `Error_Log::paths()` never reads a parent
  directory that is itself a WordPress root (staging sits inside live's web
  root), and skips lines from WP-CLI (`phar://`, `eval()'d code`). A fatal
  outside the updated plugin's own folder is an alert, never a rollback: the
  page and iCal checks are the evidence about the money path.
- **A recorded plugin update re-baselines its own files at once**, silently,
  with one info event; otherwise every update would email a Needs A Look per file.
- **Record the verification id on the rollback row before running the
  follow-up.** In WP-CLI the follow-up is a subprocess that may commit the
  row before the parent writes again (`Rollback::verify_now()`).
- **A finding has a life: open, resolved, seen or practice.** Only open,
  real findings colour a card or the headline (`Alerts::open()`,
  `Alerts::worst()`, `Fortress::settle()`). `Alerts::resolve()` keeps the
  finding on the card for a week; `Alerts::active()` is for display only.
  Never delete a finding to make a card calm.
- **Everything a drill does is practice.** `Drill::tag()` is read by
  `Events::record`, `Journal::create` and `Alerts::raise`; `Fortress::note()`
  is silent during a drill; the walk skips `Drill::owns_path()`. A drill's
  subprocess reads `State drill.active`.
- **Findings settle on their own rules**: Sveti Ivan (a newer version
  passes, or the rollback is undone; a late journal raises nothing), Revelin
  (a day of matching), Bokar (the role is as it was). Everything else has
  Mark As Seen, which needs the capability and a nonce and records who.
- **The .htaccess block order is alert-only.** `Htaccess::order_problem()`
  wants `# BEGIN DCC Pre-gzipped Cache` above `# BEGIN speedycache` (whose
  rule ends in `[L]`); Revelin raises `htaccess-order` naming the fix and
  never rewrites that block. Only the DCC Security block is ever rewritten.
  No speedycache block (staging has none) is `ORDER_NO_SPEEDY`: nothing to
  order, one info line, never a finding. A finding that can never clear
  teaches Rob to ignore the page. Markers are matched as WHOLE lines
  (`Htaccess::marker_offset()`): SpeedyCache also writes
  `# BEGIN SpeedyCacheheaders`, `Gzipspeedycache`, `LBCspeedycache` and
  `WEBPspeedycache` blocks, and a prefix match took the first (0.2.6).
- **The booking-cache check is read-only.** `Speedycache::dead_booking_rules()`
  flags only `type: page` rules naming one of `Speedycache::BOOKING_PAGES`
  whose text carries a slash (SpeedyCache compares against
  `trim(REQUEST_URI, '/')`); `cached_booking_folders()` looks only for those
  slugs under `wp-content/cache/speedycache/*/all/`. Never JS/CSS rules,
  never `/events/`, never `/guest/` (Rob keeps it cached). Revelin raises
  "A Booking Page Can Be Cached", writes no journal row, and never rewrites
  the option or touches the cache.
- **The event ring keeps the important history** (`Events::trim()`): info,
  practice and withdrawn rows go first; a breached or needs-look row goes
  only past 90 days with no open finding; the HARD_MAX valve at 10,000
  rows is the only exception. Never a blind cut at 2,000.
- **`Alerts` has two buckets.** `active` is unresolved only (open, seen,
  practice); `resolved` is the 30-day history. `unresolved()` is what
  counts; `active()` is for the page (plus a week of resolved);
  `history()` for the findings command and the report.
- **Who changed it** (`Minceta::attribution()`): a file written inside a
  recorded update's window (`UPDATE_WINDOW` after the journal row, a
  minute before it) in a place that `belongs_to()` the slug is accepted
  as the baseline, with one `update-written` info event per update.
  `SELF_WRITERS` (llms.txt by AIOSEO) are info unless `has_php()`.
  Everything else stays a finding; there is no ignore list.
- **One clock.** `Site::stamp()` is "Oct 24, 8:16 PM EDT"; `Site::both()`
  adds the relative form. No `gmdate()` in anything a person reads.
- **PHP Is Patched** (`Php_Patch`, not `Php_Check`, which is the `php -l`
  helper): the reading is the web server's, never WP-CLI's; php.net is
  cached a day; unreachable raises nothing. `judge()` is pure. The PHP
  settings files are watched, never restored. A fresh executable under
  uploads is swept every tick (`Minceta::uploads_fresh()`).
- **The probe never passes `doing_wp_cron`.** wp-cron.php compares that
  value to a lock transient only `spawn_cron()` sets and returns before
  running anything when it differs (0.2.0's bug). The POST carries no
  parameter and no body; the second path is `wp-login.php?ragusa_php=1`,
  answered in `Plugin::boot()`; an admin page load (never AJAX) refreshes a
  stale reading. `ensure_reading()` runs every tick, once per ten minutes.
- **WP-Cron off means wp-cron.php is never touched** (`Site::cron_off()`).
  wp-cron.php ignores DISABLE_WP_CRON and runs every due event, auto-updates
  included (0.2.1 set off three on staging). The probe and the loopback test
  use wp-login.php there; status and the page state the promise.
- **A fatal belongs to the update whose window and files it names**
  (`Sveti_Ivan::fatal_owner()`, `Error_Log::line_time()`), never to whichever
  check reads the log. A repeat check reads the log from the first failure's
  snapshot (`first_fail.errlog`): one line is one failure, never two.
- **A fatal counts against an update only if written after the install
  finished** (`before.installed_at`, set at upgrader_process_complete;
  `Sveti_Ivan::transient_reason()`), and a "Failed opening required" for a
  plugin file that exists now is transient. A repeat counts only lines
  stamped after `first_fail.ts`, even for rows from before the offset field.
  Never re-read the update's own snapshot on a repeat.
- **Print from the live findings.** `Fortress::refresh()` runs before the
  status command and the page print; `Fortress::row_line()` adds "Resolved …"
  or "Seen By …" to a row whose note named a finding (`note($slug, $line, $fp)`).
- **A stale PHP reading judges nothing** (`Php_Patch::stale()`, 12 hours):
  it is asked for again and no finding is raised from it.
- **Update-check events are a WP-Cron convenience, never a queue**
  (`Sveti_Ivan::schedule()`, `sweep_events()`): none where cron is off; the
  tick runs checks from `next_at`, clears a row's event when it runs it, and
  sweeps leftovers every tick.
- **WP Staging's sse folder is its own housekeeping, judged by content**
  (`Minceta::wpstg_own()`): WP Staging 4.18.0 deletes every file older than
  an hour there once a day (`Core/WPStaging.php` registerInitHook). Only its
  four protection files (index.php comments-only) and `*.sse.cache.php`
  starting `<?php exit(); ?>` with no code after pass; anything else there
  is a finding.
- **Not visited is not missing** (`Minceta::walk_ignores()`,
  `prune_unwatched()`): at every pass end and at upgrade, a baseline path
  the walk now skips leaves the baseline with one info line. Any change of
  owner or of `skip()` relies on this; never report such a path missing.
- **A removal is an update's only with three proofs** (`Packages::ships()`,
  `Minceta::window_for()`, `Sveti_Ivan::judge_removed()`): inside the
  update's window, in that component's files, and the new version no longer
  ships the file (the unpacked package's manifest, WordPress.org's checksums,
  core's checksums). A shipped file gone in the window is a finding. Unknown
  is a finding.
- **Updates nobody saw are recorded, never trusted** (`Sveti_Ivan::detect_unseen()`):
  a version change without a hook-recorded row becomes a journal row with
  source `unseen` on the next tick. Its window vouches for no file
  (`attribution()` skips it); without a published file list it is a finding.
- **One owner per file, one finding per change.** `Minceta::OWNED_ELSEWHERE`
  are skipped by the walk; .user.ini and php.ini are `Php_Patch`'s alone,
  Breached only when `Htaccess::ini_enables_execution()` turns true.
- **"Acted" means a journal action.** Action findings carry `journal_id` and
  `acted` (`Alerts::acted()`); the headline and the report say "acted" only
  for those. `wp ragusa restore` takes a finding's short id through them.
- **A hand resolve signs the journal row** (`Journal::annotate()`,
  `wp ragusa note`); history is only added to, never rewritten.
- **PHP is judged every tick** from the reading and the cached list; with
  no reading the probe asks every tick; the explicit login probe answers
  whenever Ragusa asked within five minutes.
- **The Lovrijenac row's PHP part is live** (`Php_Patch::line()` from the
  reading and the cached feed; `Lovrijenac::refresh_php()` on every reading,
  status and page render).
- **The shell account is `Cli::account()`** (posix effective user), never
  `get_current_user()`, which names the script's owner (root for the phar).
- **The Walls Report** (`Report`): Monday 7:00 AM Eastern, once a week by
  ISO week, suppressed on staging, `wp ragusa report --dry-run` anywhere.
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
- Healthchecks: Period 1 hour, Grace 1 hour. The cPanel knock on live is
  `*/19 * * * *` (ticks at :00, :19, :38, :57; its comment says 10 minutes),
  and live runs WP-Cron too, so visitor traffic also spawns the tick. Nothing
  in Ragusa assumes 10 minutes; see the 0.2.6 design note.
- Wordfence v3 scanner feed, Bearer key, once a day at 03:40 ET.
- PHP flaw of 2026-10-21 (CVE-2026-109618/109619, unauthenticated RCE,
  fixed only by updating PHP): live's web SAPI is LiteSpeed lsphp 8.3.36;
  HostGator added `session.upload_progress.enabled = 0` to
  `~/public_html/.user.ini` and `php.ini` as a mitigation. The feed is
  `https://www.php.net/releases/active.php` (JSON per branch, `tags`,
  `date`), reachable from the host.
- Live has a second cache in front: an nginx proxy cache (`x-proxy-cache:
  HIT/MISS`, `x-server-cache: true`), cleared by `do_action('epc_purge')`.
  Ragusa does not watch it (the Director's note of 2026-10-23).
- SpeedyCache "contain" exclusions written with slashes (`/submit-booking/`)
  never match: SpeedyCache trims the URI's slashes before comparing. Watched
  since 0.1.6 (`class-speedycache.php`); the option is `speedycache_exclude`,
  a list of rules with `type`, `prefix`, `content` (also accepted as JSON).
  Custom Checkout 0.35.3 sets `DONOTCACHEPAGE` on the checkout as well.

## Running the tests

    php tests/run-tests.php            # ~500 assertions, synthetic site in /tmp
    php tests/mutations.php            # 98 deliberate breakages, each must be caught
    php tests/render-screens.php       # renders the page to tests/screens/
    node tests/layout-check.js         # no sideways scroll at 1440, 768, 390 and 360, 44px buttons, screenshots

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
    zip -rq "Ragusa 0.2.7.zip" dcc-ragusa -x 'dcc-ragusa/tests/*' 'dcc-ragusa/CLAUDE.md' 'dcc-ragusa/.gitignore'

The version in the file name must match `DCCR_VERSION` in `dcc-ragusa.php`.
