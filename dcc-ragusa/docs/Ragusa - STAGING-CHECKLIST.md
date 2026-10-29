# Ragusa 0.2.8 — Staging Checklist

> **Upgrading from 0.2.7 (staging first, then live):** step 14 part A runs
> on 0.2.7 first (it reproduces the miss), then `wp plugin install
> "Ragusa 0.2.8.zip" --force` and `wp ragusa tick`, then part B. Nothing
> migrates. Rollback: `wp plugin install "Ragusa 0.2.7.zip" --force`.

> **Upgrading from 0.2.6 (staging first, then live):** `wp plugin install
> "Ragusa 0.2.7.zip" --force`, then `wp ragusa tick`. That tick takes the
> version snapshot every later tick compares against; an update made before
> it cannot be judged after the fact. On live, the two open WP Staging
> findings (Meta.php, Hash.php) predate 0.2.7: resolve each with
> `wp ragusa resolve <id> --note="removed by WP Staging 4.19.0, not in its file list"`.
> Then step 13. Rollback: `wp plugin install "Ragusa 0.2.6.zip" --force`.

> **Upgrading LIVE from 0.2.5:** `wp plugin install "Ragusa 0.2.6.zip"
> --force`, then `wp ragusa tick` and `wp ragusa findings`. Expect the open
> "The Pre-gzipped Cache Block Is Below SpeedyCache" to read Resolved on
> that tick and not come back on the next. To see the rule itself:
> `wp eval 'echo DCCR\Htaccess::order_problem(file_get_contents(ABSPATH . ".htaccess")) === "" ? "in order\n" : "PROBLEM\n";'`
> prints "in order". Staging has no speedycache block and is unaffected.
> Rollback: `wp plugin install "Ragusa 0.2.5.zip" --force`, or deactivate.

> **Upgrading the 0.2.4 install on staging:** `wp plugin install
> "Ragusa 0.2.5.zip" --force`, then `wp ragusa scan`. Expect no File
> Missing at all, the pass line ending "0 missing", and nothing in
> `wp ragusa findings`. The 0.2.4 → 0.2.5 upgrade writes no pruning line on
> staging, because the first pass after 0.2.4 already dropped those four
> paths and you resolved their findings. To see the rule work, follow
> "0.2.5: not visited is not missing" in step 12. Then append a comment
> to llms.txt and `wp ragusa scan`: Recent Events gains "llms.txt Changed
> (Plain Text Only, As When AIOSEO Regenerates It)." and nothing is
> raised. Rollback: `wp plugin install "Ragusa 0.2.4.zip" --force`.

> **Upgrading the 0.2.3 install on staging:** `wp plugin install
> "Ragusa 0.2.4.zip" --force`, then `wp ragusa tick`. Expect the tick to
> print "Removed N update-check events nobody will run." (N was 13 on Oct
> 27; WP-Cron is off here, so all of them go), and `wp cron event list`
> afterwards to show no `dccr_update_check`.
> `wp ragusa findings` lists no info line (llms.txt's included). Then the
> items marked **0.2.4** in step 12, and the WP Staging drill that waited
> on item 2. Rollback: `wp plugin install "Ragusa 0.2.3.zip" --force`
> (the 0.2.2 backup is the deeper one).

> **Upgrading the 0.2.2 install on staging:** `wp plugin install
> "Ragusa 0.2.3.zip" --force`, then `wp ragusa status` (no tick): the
> headline and rows already read from the live findings, and Sveti Ivan's
> row reads "all-in-one-seo-pack Failed Its Checks · Resolved …" for the
> finding you resolved. Then `wp ragusa tick`: the 0.2.1 PHP reading (Oct
> 26, 12:30 AM, "the probe event under wp-cron.php") is older than twelve
> hours, so that tick asks wp-login.php; `wp ragusa status` afterwards reads
> "php: 8.3.36 (litespeed), read from the wp-login.php probe at …". Then
> the whole of step 12 in one sitting. Rollback:
> `wp plugin install "Ragusa 0.2.2.zip" --force`.

> **Upgrading the 0.2.1 install on staging:** first `wp cron event list`
> and note what is due (the auto-update events are the ones to watch). Then
> `wp plugin install "Ragusa 0.2.2.zip" --force`, `wp ragusa tick` twice
> and `wp ragusa status`. Expect: the tick line ends "WP-Cron Is Off Here
> (DISABLE_WP_CRON); Ragusa Will Never Start It"; the php line reads "…
> wp-cron.php not touched (WP-Cron is off here)" while asking and then
> "read from the wp-login.php probe"; the Lovrijenac row shows the same PHP
> value as the php line; and `wp cron event list` afterwards shows the same
> due events, none run, and no `dccr_php_probe`. The journal has no new
> "update from auto" row. Then step 12's items marked **0.2.2**.
> Rollback: `wp plugin install "Ragusa 0.2.1.zip" --force`.

> **Upgrading the 0.2.0 install on staging:** `wp plugin install
> "Ragusa 0.2.1.zip" --force`, then `wp ragusa tick` twice and
> `wp ragusa status`. The first tick prints "PHP reading asked of the web
> server: wp-cron.php HTTP 200, wp-login.php HTTP 200; the answer lands on
> the next tick". After the second, status reads
> "php: 8.3.36 (litespeed), read from the wp-login.php probe at …" (or
> "the probe event under wp-cron.php"), and Lovrijenac's card ends in
> "PHP 8.3.36 Current". If it still reads "not read from the web server
> yet", the same status line now says what was asked, both answers, the
> number of attempts and whether the probe event is in the cron list: send
> me that line. Then step 12's items marked **0.2.1** and the three you
> have not run. Rollback: `wp plugin install "Ragusa 0.2.0.zip" --force`.

> **Upgrading the 0.1.6 install on staging:** `wp plugin install
> "Ragusa 0.2.0.zip" --force`, then `wp ragusa tick` and `wp ragusa status`.
> Expect the 0.1.6 → 0.2.0 event, "N resolved findings moved out of the
> active list into the history", `active findings: 5` (the unresolved ones
> only), and Lovrijenac's line ending in the PHP reading once the web
> server has answered the probe (one tick later: "PHP 8.3.36 Current").
> Then the items marked **0.2.0** in step 12. Rollback:
> `wp plugin install "Ragusa 0.1.6.zip" --force`.

> **Upgrading the 0.1.5 install on staging:** `wp plugin install
> "Ragusa 0.1.6.zip" --force`, then `wp ragusa tick` and open DCC → Ragusa.
> If staging's SpeedyCache rules carry the same slashes live had, Revelin
> reads Needs A Look, "A Booking Page Can Be Cached", naming each rule and
> "Remove the slashes from the rule text."; otherwise nothing new. Then the
> item marked **0.1.6** in step 9. Rollback: `wp plugin install "Ragusa 0.1.5.zip" --force`.

> **Upgrading the 0.1.4 install on staging:** `wp plugin install
> "Ragusa 0.1.5.zip" --force`, then `wp ragusa tick` and open DCC → Ragusa.
> Expect Revelin back on Holding: "The Pre-gzipped Cache Block Is Missing"
> reads Resolved, and Recent Events carries one info line, "SpeedyCache has
> no rewrite block here; there is no block order to keep." Nothing else
> changes. Rollback: `wp plugin install "Ragusa 0.1.4.zip" --force`.

> **Upgrading the 0.1.3 install on staging (or a live 0.1.3, as a normal
> update):** `wp plugin install "Ragusa 0.1.4.zip" --force`, then
> `wp ragusa status`. Expect the 0.1.3 → 0.1.4 event and nothing else new:
> no upgrade step touches the data. Then the two items marked **0.1.4**
> in step 9. Rollback: `wp plugin install "Ragusa 0.1.3.zip" --force`.

> **Upgrading the 0.1.2 install on staging:** `wp plugin install
> "Ragusa 0.1.3.zip" --force`, then open DCC → Ragusa. Expect the headline
> back on "The Walls Are Holding": the drills' events (5658, 5757, 5765 and
> their journal rows) re-tagged as Practice and grey, yesterday's late
> rollback findings (5746, 5747) shown as "Resolved", Bokar on "No Changes",
> and Revelin and Sveti Ivan Holding. Then the items marked **0.1.3**.

> **Upgrading the 0.1.1 install on staging:** `wp plugin install
> "Ragusa 0.1.2.zip" --force`, then `wp ragusa status`. Expect the 0.1.1 →
> 0.1.2 event, Bokar's baseline retaken on the next tick (one info event,
> no role changes), and the two false "role changed" findings gone. Then
> the items marked **0.1.2**.

> **Upgrading the 0.1.0 install already on staging:** `wp plugin install
> "Ragusa 0.1.1.zip" --force` (0.1.0's own Sveti Ivan will treat it as a
> self-update and schedule a check), then `wp ragusa status`. Expect:
> `tick: scheduled` (0.1.1 reschedules it on its first boot; the hand-made
> event from the 0.1.0 session can stay or go), Minčeta Holding with the
> existing index as the baseline and the 1,999 false "new file" findings
> withdrawn without an All Clear, and the 0.1.0 → 0.1.1 event in Recent
> Events. Then continue from step 2 for the items marked **0.1.1**.

Run every step on staging (`/staging/`, prefix `wpstg0_`). Nothing goes to
live until every box is ticked and Rob has read the page on his phone.

Staging sends no email and no heartbeat on its own. Only the two explicit
commands (`wp ragusa mail test`, `wp ragusa heartbeat test`) send anything
from there, and only when you run them.

## Before you start

- [ ] A database backup of staging (UpdraftPlus, or a cPanel SQL dump).
- [ ] Confirm the home directory is writable: `touch ~/ragusa-vault-test && rm ~/ragusa-vault-test`.
      If it is not, Ragusa falls back to `wp-content/uploads/ragusa-vault/`
      and says so on its page; that is worth knowing before install.
- [ ] Note the current front-end cost for the zero-weight proof (step 3):
      with Query Monitor, load `/` and `/accommodation/cottage-34/` logged in,
      and write down Database Queries and the number of PHP files loaded.

## 1. Install

- [ ] Plugins → Add New → Upload Plugin → `Ragusa 0.1.0.zip` → Activate
      (or `wp plugin install "Ragusa 0.1.0.zip" --activate`).
- [ ] The two tables exist:

      P=$(wp db prefix)
      wp db query "SHOW TABLES LIKE '${P}dcc_ragusa_%'"

      Expect `dcc_ragusa_events` and `dcc_ragusa_journal`.
- [ ] Exactly one Ragusa option autoloads:

      wp db query "SELECT option_name, autoload FROM ${P}options WHERE option_name LIKE 'dcc_ragusa_%'"

      Only `dcc_ragusa_settings` may say `yes` (or `on`). Everything else `no`.
- [ ] The cron event is scheduled: `wp cron event list | grep dccr_tick`
      shows `dccr_10min`. **0.1.1:** `wp ragusa status` also prints
      `tick: scheduled, next …`. If you ever see `NOT SCHEDULED`, any admin
      page load, cron tick or `wp ragusa` command reschedules it.
- [ ] DCC → Ragusa loads. The sentence at the top says the walls are not yet
      checked, and the amber notice says this is the staging site.

## 2. The first tick

- [ ] `wp ragusa tick`. Expect: users baselined, the guards sealed (the four
      `dcc-*` mu-plugins, `uploads/.htaccess`, `uploads/mphb_protected_uploads/.htaccess`,
      the DCC Security block), Ragusa's own files sealed, critical options
      baselined, the walk started.
- [ ] `wp ragusa scan` runs the walk to completion and prints the file count.
      Write down the count and how long it took. **0.1.1:** however many
      ticks the first pass takes, it ends with Minčeta saying "All N Files
      Match" and a single "First pass: N files baselined" event, and no
      "A new file appeared" events at all.
- [ ] **0.1.1:** `wp ragusa status` shows `bokar: 2 privileged of 15 users,
      roles read from wpstg0_capabilities` (or `… (fallback)` naming the
      key it found). On live expect 2 administrators and 15 users.
- [ ] **0.1.1:** Minčeta's card shows the disk as about 8.3 GB of 10 GB on
      `/dev/sdd`, not 4 kB. If it says "(Fullest Filesystem)", `df -P ~`
      did not name the device; tell me what `df -P ~` prints.
- [ ] `wp ragusa status`: every fortress is Holding (Lovrijenac says
      "No Feed Key Yet"). Loopbacks: note whether it says they work.
- [ ] `wp ragusa vault list`: the manifest verifies and every entry is intact.
      Note the vault path. It must be under `~/ragusa-vault/staging-…`, never
      the live folder.
- [ ] DCC → Ragusa on an iPhone (or a 390px window): one column, every
      card shows a word and an icon, nothing scrolls sideways, every button
      is comfortably tappable.

## 3. Zero weight for guests (the proof)

- [ ] **0.1.2:** `wp ragusa proof` on staging prints "Set aside in both
      columns: wp-staging" and then the table; if a login gate still
      answers, it says so instead of blaming the PHP binary.
- [ ] **0.1.1:** `wp ragusa proof`. It loads WordPress as a visitor request
      in a fresh PHP process twice, with Ragusa active and with it skipped,
      and prints both columns. Expect: database queries equal, PHP files
      included one more with Ragusa (`dcc-ragusa.php` itself), 0 DCCR
      classes, 0 hooks, 0 enqueued assets. Record the two columns.

- [ ] With Query Monitor, load `/` and `/accommodation/cottage-34/` logged
      in, as in "Before you start". Database Queries must be unchanged.
      PHP files loaded must be exactly one more (`dcc-ragusa/dcc-ragusa.php`).
      No `dccr` script or style in the Scripts and Styles panels.
- [ ] `curl -s https://doracanalcourt.com/staging/?ragusa_proof=1 | grep -c dccr` returns 0.
- [ ] Load the Elementor editor on a page and Plugins → Installed Plugins:
      no Ragusa notice, no slowdown, nothing in Query Monitor from Ragusa.

Record the before and after numbers in the handover.

## 4. Settings

- [ ] Alert Email: leave empty (the admin email) or set Rob's address. Save.
- [ ] Heartbeat URL: paste a **test** check's URL from healthchecks.io, not
      the live one. Save. The field now shows a masked value. Run
      `wp ragusa heartbeat test`; the test check at healthchecks.io shows the
      ping with a body that begins `ragusa 0.1.0`.
- [ ] `wp db query "SELECT option_value FROM ${P}options WHERE option_name='dcc_ragusa_secrets'"`
      shows an `s1:` blob, not the URL.
- [ ] `grep -r hc-ping ~/public_html/staging/error_log ~/public_html/staging/wp-content/debug.log 2>/dev/null` finds nothing.
- [ ] Rob's healthchecks.io settings for the live check: **Period 1 hour, Grace 1 hour**
      (the cPanel knock runs every 10 minutes).
- [ ] Wordfence key: skip on staging unless Rob already has one. If he has:
      paste it, then `wp ragusa tick` after 03:40 ET or set the feed time
      aside and run:

      wp eval 'DCCR\State::set("feed", []); DCCR\State::flush(); echo DCCR\Fortress\Lovrijenac::fetch_feed();'

      Note the feed size it reports. If it says "too large for this host",
      tell me the size.

## 5. The emails

- [ ] `wp ragusa mail test`. On Rob's iPhone the subject reads
      `Ragusa · Minčeta · Test Message` with the č intact, the body is three
      short paragraphs and a plain link, and the link opens DCC → Ragusa.

## 6. Zelenci

- [ ] `wp ragusa zelenci install`. The file `mu-plugins/dcc-ragusa-zelenci.php`
      exists and `wp ragusa vault list` shows it sealed as a guard.
- [ ] Must-Use plugins screen lists "Zelenci · Rings If Ragusa Falls".
- [ ] Deactivate Ragusa, wait eleven minutes, run `wp cron event run --due-now`
      twice (ten minutes apart) or just load wp-login.php twice ten minutes
      apart. On staging nothing is sent (it is not live); confirm instead
      that `wp option get dcc_ragusa_zelenci` shows `missing_since` set.
      Reactivate Ragusa; the next tick clears it.

## 7. The drills (the real actions and their reverses)

- [ ] **0.1.3:** after any drill, the headline is still "The Walls Are
      Holding", the drill's events show grey with a "Practice" tag, the
      card's findings list shows the drill's finding as Practice, no card
      changed state, and `wp ragusa journal` shows the rows with tag `drill`.
      A day later the practice events are gone from the page and still in
      `wp ragusa journal`.

Each drill stages a harmless case, runs the real action, reverses it, and
cleans up. Each prints every journal state transition.

- [ ] `wp ragusa drill quarantine`: the dummy `uploads/ragusa-drill/evil.php`
      is moved out, the journal row goes Planned → Before → Acting →
      Verifying → Committed, the reverse puts it back, and the folder is gone
      at the end.
- [ ] `wp ragusa drill restore-guard`: an altered guard is put back from its
      sealed copy, the reverse puts the altered copy back, and the original
      content is written back at the end. Check the guard afterwards:
      `wp ragusa status` is Holding on the next tick.
- [ ] `wp ragusa drill htaccess`: on staging it reports that the DCC Security
      block is not present in this site's .htaccess and does nothing; on live
      (where the block is at line 1) one line inside
      the DCC block is altered, the block is rewritten, the SpeedyCache and
      Newfold blocks are untouched, and the file ends as it began.
- [ ] **0.1.2:** every drill ends with "Success: Drill finished." only when
      every `ok` line matched; a `FAILED` line makes the command exit with an
      error. The rollback drill's "rollback row state: committed" and both
      version lines must read `ok`.
- [ ] `wp ragusa drill rollback` (loopbacks work here): **0.1.1** uses the
      test plugin's own probe (`/?ragusa_drill_probe=1`, answered on
      `plugins_loaded` before WP Staging's login gate), so the staging gate
      no longer makes both versions fail. Expect: 1.0.0 installed and sealed,
      "Probe at 1.0.0: HTTP 200 with RAGUSA-DRILL-OK", 1.0.1 fails once,
      fails again, rollback to 1.0.0, verification committed, the reverse
      brings 1.0.1 back, the test plugin removed and the page markers back
      in use.
- [ ] **0.1.1:** Sveti Ivan's card on staging reads "… · Pages Are Behind The
      Staging Login: Not Checked" after any update check, and no update is
      ever failed for the login page. On live that suffix must not appear.
- [ ] `wp ragusa journal` shows all of it, newest first. DCC → Ragusa →
      Recent Events shows the same with Undo buttons on the committed rows
      (the drill already undid them, so they say Undone).

## 8. A real forced install (your route)

- [ ] **0.1.2:** `wp ragusa status` before and after shows no new Minčeta
      finding for the updated plugin; Recent Events carries one info line
      "<slug> <version>: N files updated and accepted as the baseline".
- [ ] **0.1.2:** With staging's `error_log` empty, type a deliberate
      `wp eval 'nope();'` on STAGING during an update's check window. The
      check must say "no new fatal" (WP-CLI's own line is ignored). Then
      append a fake fatal naming another plugin's file to staging's
      `error_log` during a check: the update passes, and one Needs A Look
      "A New Fatal Elsewhere After This Update" appears, no rollback.
- [ ] **0.1.2:** Live's `~/public_html/error_log` is never read from
      staging: `wp eval 'var_dump(DCCR\Error_Log::paths());'` on staging
      lists only staging's own paths.

- [ ] `wp plugin install "Ledger <version>.zip" --force` (any DCC zip you
      have). In the output, Sveti Ivan prints each check as it runs, and the
      in-process checks from the `wp ragusa check --after=…` subprocess.
      Expect every check ✓ and "all checks passed". `wp ragusa vault list`
      shows the previous version sealed.
- [ ] Break a marker on purpose to see the alert path: edit the Guest Guide
      shortcode page so `data-dccwl-viewtrigger` is absent, then
      `wp ragusa markers set /explore/ "<the new marker>"` and confirm the
      next check passes; `wp ragusa markers reset` afterwards.

## 9. Seal, Restore and Mark As Seen from the page

- [ ] **0.1.3:** open a finding's card, press Mark As Seen. The confirmation
      is immediate (no second screen); the finding reads "Seen By <your
      name>, Today" in the calm colour, and the headline calms if nothing
      else is open. `wp ragusa journal` is unchanged; Recent Events carries
      a line saying who marked it.
- [ ] **0.1.3:** a finding that resolves on its own (reinstall a newer
      version after a rollback, or put a role back) reads "Resolved Just
      Now" and stays on the card for a week.

- [ ] **0.1.4:** `wp ragusa seal wp-content/mu-plugins/dcc-seasons-no-witch-flyer.php`
      and the same for `dcc-preload-scope.php` (both deleted on purpose):
      each answers "Success: Removed wp-content/… from the baseline." If the
      pass already raised File Missing for them, the cards read Resolved;
      `wp ragusa scan` afterwards reports nothing missing.
- [ ] **0.1.4:** `cp .htaccess ~/htaccess.bak-$(date +%s)-order-drill`, then
      move the `# BEGIN speedycache … # END speedycache` block above the
      `# BEGIN DCC Pre-gzipped Cache` block and `wp ragusa tick`. Revelin
      reads Needs A Look, "The Pre-gzipped Cache Block Is Below SpeedyCache",
      with "Move the DCC Pre-gzipped Cache block above # BEGIN speedycache."
      `.htaccess` is byte-for-byte what you wrote (no rewrite, no journal
      row). Put the backup back, `wp ragusa tick`: the finding reads Resolved.
      (Staging sends no email; the live one carries the same sentence.)
      **0.1.5:** staging has no speedycache block, so this drill needs both
      blocks pasted in from live's `.htaccess` first; with neither block
      present, a tick raises nothing.

- [ ] **0.1.6:** `wp option get speedycache_exclude --format=json`, note it,
      then add one page rule `/submit-booking/` in SpeedyCache's Exclude tab
      (or `mkdir -p wp-content/cache/speedycache/<host>/all/submit-booking`)
      and `wp ragusa tick`. Revelin reads "A Booking Page Can Be Cached" with
      the rule (or folder) and its fix; `wp ragusa journal` has no new row;
      the option is byte-for-byte what you set. Remove the rule (or folder),
      `wp ragusa tick`: Resolved. Also confirm a JS rule with a slash and the
      `/guest/` cache folder raise nothing.

- [ ] Append a comment to `mu-plugins/dcc-ical-privacy.php` over SSH. On the
      next tick Ragusa restores it (Recent Events shows it, with Undo).
- [ ] Tap Undo: the confirmation screen says what will change; confirm; your
      edited copy is back.
- [ ] Tap Seal on the finding (or `wp ragusa seal wp-content/mu-plugins/dcc-ical-privacy.php`):
      the next tick leaves your version alone and the finding resolves.

## 10. Staging and live separation

- [ ] `ls ~/ragusa-vault/`: only a `staging-…` folder from this install.
      No `live-…` folder was touched or created.
- [ ] `wp ragusa drill quarantine` on LIVE must refuse: do not run it there;
      the refusal is covered by the test suite.

## 12. The 0.2.0 drills

- [ ] **Flood:** `wp eval 'for ($i = 0; $i < 3000; $i++) { DCCR\Events::record("minceta", "needs-look", "file-new", "flood/$i.php", "flood"); }'`
      after noting the id of one real breached event (`wp db query`). The
      breached row is still there; the table went past 2,000 only with
      serious rows; `wp ragusa status` is unchanged. **This drill costs
      Recent Events its info history:** noise goes first by design, so every
      info row (passes, update lines, seals) is pruned before any serious
      one. Run it last, or accept that. Clean up:
      `wp db query "DELETE FROM wpstg0_dcc_ragusa_events WHERE target LIKE 'flood/%'"`.
- [ ] **Findings:** `wp ragusa findings` lists the unresolved ones with
      short ids and "Oct 24, 8:16 PM EDT" times; `--all --format=json`
      adds the history. `wp ragusa resolve <id>` on one of them: Recent
      Events shows "resolved by hand by <you> (shell)".
- [ ] **One clock:** `wp ragusa journal` and `wp ragusa status` read
      "Oct 24, 8:16 PM EDT (18 Hours Ago)" everywhere; no bare UTC.
- [ ] **0.2.3: a half-copied plugin is not a failure.** One command writes
      two fatal lines for a real update row, one stamped during the copy and
      one naming a plugin file that exists, runs the check, and cleans up:

          wp eval '
            $log = ABSPATH . "error_log"; $size = is_file($log) ? filesize($log) : 0;
            $row = DCCR\Journal::recent(1, null, "update-check")[0];
            $slug = $row["target"]; $done = (int) ($row["before"]["installed_at"] ?? $row["created_at"]);
            $file = WP_PLUGIN_DIR . "/$slug/$slug.php";
            $snap = DCCR\Error_Log::snapshot();
            file_put_contents($log, "[" . gmdate("d-M-Y H:i:s", $done - 4) . " UTC] PHP Fatal error: Uncaught Error: ragusa drill copy in " . WP_PLUGIN_DIR . "/$slug/x.php:1\n", FILE_APPEND);
            file_put_contents($log, "[" . gmdate("d-M-Y H:i:s") . " UTC] PHP Fatal error: Uncaught Error: Failed opening required \x27$file\x27 (include_path=\x27.\x27) in " . WP_PLUGIN_DIR . "/$slug/y.php:1\n", FILE_APPEND);
            $r = DCCR\Fortress\Sveti_Ivan::run_checks(["slug" => $slug, "errlog" => $snap, "installed_at" => $done], true);
            echo $slug, ": ", $r["checks"]["error_log"]["detail"], "\n";
            $h = fopen($log, "r+"); ftruncate($h, $size); fclose($h);
            DCCR\State::flush();'

      Expect "no new fatal; 2 not counted (written at …, while the plugin
      was still being copied …)", two info lines in Recent Events, and no
      finding. `tail -1 error_log` no longer shows a drill line.
- [ ] **0.2.2: nothing touches wp-cron.php.** With the server's access log,
      if HostGator exposes it (`~/access-logs/` or cPanel → Raw Access),
      grep for `staging/wp-cron.php` after two ticks and a page load of DCC
      → Ragusa: no line from this server's address. Without the log,
      `wp cron event list` before and after is the evidence.
- [ ] **0.2.2: a fatal is credited to its update.** One command records an
      AIOSEO-like update window, writes a fatal in AIOSEO's files to this
      site's error_log, runs Ragusa's own error-log check against it,
      prints the verdict, and cleans up after itself:

          wp eval '
            $log = ABSPATH . "error_log";
            $size = is_file($log) ? filesize($log) : 0;
            $id = DCCR\Journal::create("update-check", "all-in-one-seo-pack", ["slug" => "all-in-one-seo-pack", "kind" => "update", "new_version" => "drill", "started" => time() - 30], "drill: aioseo window", false);
            $snap = DCCR\Error_Log::snapshot();
            file_put_contents($log, "[" . gmdate("d-M-Y H:i:s") . " UTC] PHP Fatal error: Uncaught Error: ragusa drill in " . WP_PLUGIN_DIR . "/all-in-one-seo-pack/drill.php:1\n", FILE_APPEND);
            $r = DCCR\Fortress\Sveti_Ivan::run_checks(["slug" => "dcc-ragusa", "errlog" => $snap], true);
            echo $r["checks"]["error_log"]["detail"], "\n";
            DCCR\Journal::set_state($id, DCCR\Journal::ABANDONED, ["note" => "drill: aioseo window, done"]);
            global $wpdb; $wpdb->update(DCCR\Schema::journal(), ["created_at" => time() - 2 * 86400], ["id" => $id]); // out of every update window
            $h = fopen($log, "r+"); ftruncate($h, $size); fclose($h);
            DCCR\State::flush();'

      Expect: "a new fatal in all-in-one-seo-pack during its own update
      (journal N): that update's, not this one's"; `wp ragusa findings` has
      no "Fatal Elsewhere"; Recent Events has one info line on journal N;
      `tail -1 error_log` no longer shows the drill line.
- [ ] **0.2.2: the new mu-plugin.** `wp-content/mu-plugins/dcc-topbar.php`
      (Oct 26) reads "New File: dcc-topbar.php" (Needs A Look) after the
      next full pass unless already sealed: `wp ragusa seal wp-content/mu-plugins/dcc-topbar.php`.
      On live it is part of the first pass's baseline.
- [ ] **0.2.1: the probe, both paths.** `wp option delete dcc_ragusa_php_web`,
      `wp eval 'DCCR\State::delete("php_probe"); DCCR\State::flush();'`,
      then `wp ragusa tick`: the line "PHP reading asked of the web server:
      wp-cron.php HTTP 200, wp-login.php HTTP 200". `wp cron event list`
      shows `dccr_php_probe` once (until wp-cron.php runs it). A second
      `wp ragusa tick` then `wp ragusa status`: "php: 8.3.36 (litespeed),
      read from …" naming which path answered. On live, where the server's
      curl runs the tick under wp-cron.php, the first status after the
      first curl reads "read from the tick under wp-cron.php".
- [ ] **A stubbed old PHP:** `wp option update dcc_ragusa_php_web '{"version":"8.3.30","sapi":"litespeed","ts":'$(date +%s)'}' --format=json`,
      then `wp eval 'DCCR\State::delete("php_check_ts"); DCCR\State::flush();'`
      and `wp ragusa tick`. Lovrijenac reads "PHP 8.3.30, 8.3.36 Is Out"
      and the finding is "PHP Security Fix Not Applied: 8.3.36" (breached,
      since Oct 21 is more than three days ago), naming lsphp and the time
      of the reading. Then `wp option delete dcc_ragusa_php_web` and ONE
      tick: it asks the web server at once (no reading means no ten-minute
      wait), prints "it answered at once: 8.3.36, via the wp-login.php
      probe", and in the same tick Lovrijenac reads "PHP 8.3.36 Current",
      the finding reads Resolved and the walls hold. No `php_check_ts`
      deletion is needed (**0.2.4**: the reading is judged every tick).
- [ ] **Settings file:** append `; ragusa drill` to `~/public_html/staging/.user.ini`
      (create it if absent, then tick once first so it is baselined),
      tick: "PHP Settings File Changed: .user.ini" with the "+ ; ragusa
      drill" line in the finding. **0.2.4:** that is the only finding for
      the edit (no Minčeta "Changed: .user.ini", also after `wp ragusa
      scan`), it needs a look rather than a breach, and the headline reads
      "Something Needs A Look". Then append `auto_prepend_file = /tmp/x.php`
      and tick: "PHP Settings File Now Runs Extra Code: .user.ini",
      Breached, and the headline reads "A Wall Was Breached · Ragusa Needs
      You" (no "Acted": Ragusa did nothing). Remove both lines, tick (a
      finding for the removal), then `wp ragusa resolve` each.
- [ ] **0.2.5: not visited is not missing.** Put the four root files back
      into the walk's baseline as 0.2.3 left them, then run a pass:

          wp eval '
            $f = DCCR\Vault::dir() . "/index/files.json"; $d = json_decode(file_get_contents($f), true);
            foreach (["wp-config.php", "index.php", ".user.ini", "php.ini"] as $r) {
              if (is_file(ABSPATH . $r)) { $d["files"][$r] = ["s" => filesize(ABSPATH . $r), "m" => filemtime(ABSPATH . $r), "h" => "drill", "x" => "base", "p" => 1]; }
            }
            file_put_contents($f, json_encode($d));'
          wp ragusa scan

      Expect no File Missing, the pass line "… 0 missing", and one info
      line "N paths left the file walk's baseline because another check
      owns them now (not missing): wp-config.php, index.php, …".
- [ ] **A dropped `uploads/x.php`:** use a NEW name each run (`x3.php`,
      `x4.php` …): after `restore`, Ragusa allowlists the restored file at
      its size, so the same name and size is accepted the next time by
      design. `echo '<?php echo 1;' > wp-content/uploads/x3.php`,
      then `wp ragusa tick` (not scan): within that one tick the file is
      quarantined, the event is breached, and on live an email would have
      gone, and the headline reads "Ragusa Acted And Needs You".
      **0.2.4:** `wp ragusa findings` shows the finding with its journal
      row in the last column; `wp ragusa restore <the finding's id>` (or
      `<the journal number>`) puts it back; delete it by hand.
- [ ] **0.2.4: who changed it, on a real version change.** WP Staging
      empties its own `sse` folder once a day (item 2), so the drill writes
      into a folder of WP Staging's name instead. Scripted, from the staging
      root:

          ts=$(date +%s); cur=$(wp plugin get wp-staging --field=version)
          wp ragusa findings                                            # note what is open
          wp plugin install https://downloads.wordpress.org/plugin/wp-staging.4.16.0.zip --force
          wp ragusa tick                                                # Sveti Ivan: update-check wp-staging 4.16.0
          wp plugin update wp-staging                                   # back up to $cur: a second real change
          # inside the half hour after the update, stand in for a file the update writes:
          mkdir -p wp-content/wp-staging/ragusa-drill && echo "drill $ts" > wp-content/wp-staging/ragusa-drill/marker.txt
          wp ragusa scan
          wp ragusa findings                                            # nothing new
          wp ragusa journal --limit=3                                   # the two update-check rows

      Recent Events carries "wp-staging $cur wrote 1 file outside its own
      folder, accepted as the baseline: wp-content/wp-staging/ragusa-drill/marker.txt".
      The control: age the rows out of the window
      (`wp db query "UPDATE wpstg0_dcc_ragusa_journal SET created_at = created_at - 7200 WHERE target = 'wp-staging'"`),
      `echo more >> wp-content/wp-staging/ragusa-drill/marker.txt`,
      `wp ragusa scan`: that IS a "File Changed: marker.txt" finding.
      Clean up: `rm -r wp-content/wp-staging/ragusa-drill`,
      `wp ragusa seal wp-content/wp-staging/ragusa-drill/marker.txt` (drops
      it from the baseline and settles its finding), and
      `wp plugin get wp-staging --field=version` must read $cur.
- [ ] **0.2.4: WP Staging's sse folder.** `ls -la wp-content/wp-staging/sse/`
      (empty since its daily cleanup). Load DCC → Staging once if you want
      WP Staging to write there; either way `wp ragusa scan` raises no
      File Missing or New File for its own files. The control:
      `echo '<?php echo 1;' > wp-content/wp-staging/sse/drill.php`,
      `wp ragusa scan`: "New File: drill.php". Then `rm` it and
      `wp ragusa seal wp-content/wp-staging/sse/drill.php`.
- [ ] **0.2.4: a hand resolve signs the row.** `wp ragusa note 57 "resolved
      by hand Oct 26: false alarm, see 0.2.3"`; `wp ragusa journal` shows
      row 57's note ending with that line, signed "note by doracurt (shell)".
- [ ] **llms.txt:** let AIOSEO regenerate it (or edit a word): no finding,
      one info line "llms.txt Changed (Plain Text Only, As When AIOSEO
      Regenerates It)" in the daily digest list, and nothing in
      `wp ragusa findings` (**0.2.4**). Put `<?php` in it: a real "File Changed: llms.txt". Remove it,
      seal.
- [ ] **The report:** `wp ragusa report --dry-run` prints the subject and
      the five fortress lines with diacritics; `wp ragusa report` on staging
      says it is not sent from here.

## 13. The 0.2.7 drills (staging): updates and the files they remove

A throwaway plugin with two versions, built on the server, so every drill
is deterministic. From the home directory:

    rm -rf ~/walls-test && mkdir -p ~/walls-test/v1/walls-test-plugin ~/walls-test/v2/walls-test-plugin
    printf '<?php\n/**\n * Plugin Name: Walls Test Plugin\n * Version: 1.0.0\n */\n' > ~/walls-test/v1/walls-test-plugin/walls-test-plugin.php
    printf '<?php\n/**\n * Plugin Name: Walls Test Plugin\n * Version: 1.1.0\n */\n' > ~/walls-test/v2/walls-test-plugin/walls-test-plugin.php
    echo '<?php // old helper' > ~/walls-test/v1/walls-test-plugin/old-helper.php
    echo '<?php // kept 1.0' > ~/walls-test/v1/walls-test-plugin/kept.php
    echo '<?php // kept 1.1' > ~/walls-test/v2/walls-test-plugin/kept.php
    (cd ~/walls-test/v1 && zip -qr ../walls-test-1.0.0.zip walls-test-plugin)
    (cd ~/walls-test/v2 && zip -qr ../walls-test-1.1.0.zip walls-test-plugin)
    cd ~/public_html/staging && wp plugin install ~/walls-test/walls-test-1.0.0.zip && wp ragusa scan

- [ ] **An update that drops a file: info, no email.**
      `wp plugin install ~/walls-test/walls-test-1.1.0.zip --force && wp ragusa scan`.
      `wp ragusa findings` shows nothing for walls-test-plugin;
      `wp db query "SELECT id, action, note FROM wpstg0_dcc_ragusa_journal WHERE target = 'walls-test-plugin' ORDER BY id DESC LIMIT 1"`
      shows its update-check row with the note "removed by this update:
      old-helper.php" (`wp ragusa journal` cuts notes at 60 characters);
      Recent Events reads
      "Removed by Walls Test Plugin 1.0.0 → 1.1.0 (the new version no
      longer ships it): old-helper.php".
- [ ] **A deletion hidden inside the update window: needs a look.** At
      once, `rm wp-content/plugins/walls-test-plugin/kept.php && wp ragusa scan`:
      "File Missing From Walls Test Plugin 1.1.0: kept.php", needs a look,
      saying "Version 1.1.0 still includes this file, so the update should
      have left it in place." (staging shows it on the page; live would
      email). Put it back: install the 1.1.0 zip again with `--force`.
- [ ] **A hand deletion from a plugin that did not update: needs a look.**
      Age the rows out of the week:
      `wp db query "UPDATE wpstg0_dcc_ragusa_journal SET created_at = created_at - 8*86400 WHERE target = 'walls-test-plugin'"`,
      then `rm wp-content/plugins/walls-test-plugin/kept.php && wp ragusa scan`:
      the finding says "No update of Walls Test Plugin was recorded in the
      last week." and "Ragusa is certain the file is gone; it cannot tell
      who removed it."
- [ ] **An update nobody saw: recorded, and a finding.**
      `sed -i 's/1.1.0/1.2.0/' wp-content/plugins/walls-test-plugin/walls-test-plugin.php && wp ragusa tick`:
      the tick prints "… went from 1.1.0 to 1.2.0 … without passing
      through the upgrader Ragusa watches … Recorded as journal N", and
      `wp ragusa findings` has "Updated Without Ragusa Seeing It: Walls
      Test Plugin" (nobody publishes its file list).
- [ ] **Clean up:** `wp plugin delete walls-test-plugin`,
      `wp ragusa seal wp-content/plugins/walls-test-plugin` (drops the
      folder from the baseline and settles its findings),
      `wp ragusa resolve <the update-unseen id>`, `rm -rf ~/walls-test`.

## 14. The 0.2.8 drills: a real WP-Cron auto-update

**Live first, read-only: what happened at 11:11 CDT on Oct 29** (16:11 UTC).
Each answer narrows the cause; none changes anything.

    wp db query "SELECT id, fortress, kind, target, FROM_UNIXTIME(ts), LEFT(message, 140) FROM portal_dcc_ragusa_events WHERE ts BETWEEN UNIX_TIMESTAMP('2026-10-29 16:05:00') AND UNIX_TIMESTAMP('2026-10-29 16:20:00') ORDER BY id"
    wp eval 'var_export(DCCR\State::get("pending_update")); echo "\n"; var_export(DCCR\State::get("update.pre"));'
    wp option get auto_updater.lock
    grep -n '29-Oct-2026 16:1' ~/public_html/error_log | tail -20

(`UNIX_TIMESTAMP` reads in the MySQL session's zone; if the rows look an
hour or five off, widen the window.)

- A **"Sealed … before its update"** event for the plugin at 11:11, and its
  slug still in `pending_update`: Ragusa was loaded and saw the upgrader
  start; upgrader_process_complete never reached it. The error_log lines
  at 16:11 then name what ended the request.
- **No sealed event**: Ragusa never saw that upgrader run (not loaded in
  that request, or its hooks were removed).
- A **check-error** event: Ragusa itself failed inside the hook.
- `auto_updater.lock` still set with a time near 11:11 (`date -d @<value>`):
  WordPress's automatic updater run died before its end. Also: did the
  admin email "Some plugins were automatically updated" arrive for 11:11?
  WordPress sends it only at the end of a run that finished.

**Part A, staging, still on 0.2.7: reproduce.** A small WordPress.org
plugin with its own folder (Classic Editor; not Hello Dolly, a single file
Ragusa does not track), one release behind, active, auto-updates on:

    cd ~/public_html/staging
    wp plugin install classic-editor --version=<the release before the current one> --force --activate
    wp plugin auto-updates enable classic-editor
    wp plugin list --update=available --fields=name,version,update_version,auto_update

The last list must show classic-editor and **nothing else with
auto_update on**: wp-cron.php runs every due event and updates every
plugin set to auto-update (0.2.1's lesson). Then a real WP-Cron run:

    wp eval 'delete_site_transient("update_plugins"); wp_update_plugins();'
    wp cron event schedule wp_maybe_auto_update
    php wp-cron.php        # WordPress's own cron entry point, as the loopback runs it, without the web server
    sleep 20; wp plugin get classic-editor --field=version
    wp db query "SELECT id, action, state, note FROM wpstg0_dcc_ragusa_journal WHERE target = 'classic-editor' ORDER BY id DESC LIMIT 3"

- [ ] The version moved to the current release.
- [ ] Record whether 0.2.7 wrote a row. **No row** reproduces live: run the
      four read-only checks above against staging (prefix `wpstg0_`).
      **A row** means the plain WP-Cron path works, and the live miss is
      specific to that update: repeat part A with Ultimate Addons for
      Elementor one release behind 2.9.6 (`wp plugin list` gives its slug).

**Part B, staging, on 0.2.8.** Install the older release again, then the
same commands.

- [ ] One journal row for classic-editor, note `update from auto`,
      `wp db query "SELECT before_json FROM wpstg0_dcc_ragusa_journal WHERE id = <id>"`
      shows `"stage":"complete"` and `"request":{"entry":"wp-cron.php","cron":true,…}`.
- [ ] `verify_json` shows `"inline":"deferred: maintenance mode"` (WordPress
      keeps its maintenance page up through an auto-update) and the follow-up
      check ran on the next `wp ragusa tick` after two minutes.
- [ ] If part A had no row: in 0.2.8 the row exists and either reads
      complete, or reads "the request ended before WordPress reported the
      update finished: PHP fatal error: … in <file> line <n>", and the
      next `wp ragusa tick` prints "… WordPress never reported it finished
      … Completed as journal N". That file and line are the answer.
- [ ] **No "Updated Without Ragusa Seeing It"** for classic-editor.
- [ ] **Newfold:** staging has no Newfold module, so this is the harness's
      drill 7 only. On live, the next Newfold rewrite's finding should read
      "Newfold Htaccess Manager (HostGator's) made this change: … holds
      exactly the .htaccess Ragusa had on record", quote the STATE line,
      and name the update before it.
- [ ] Clean up: `wp plugin auto-updates disable classic-editor` and
      `wp plugin delete classic-editor` if it was not there before.

## 11. Before live

- [ ] Both numbers from step 3 recorded.
- [ ] The file count and walk time from step 2 recorded.
- [ ] Whether loopbacks work on this host recorded.
- [ ] Rob has opened DCC → Ragusa on his iPhone and read one email.
- [ ] Tell me the Wordfence feed size if it was fetched.

Then on live: install the zip, `wp ragusa tick`, `wp ragusa scan`, paste
the live heartbeat URL, `wp ragusa heartbeat test`, `wp ragusa zelenci install`,
and leave it. The first email Rob should ever get from live is an alert that
means something.
