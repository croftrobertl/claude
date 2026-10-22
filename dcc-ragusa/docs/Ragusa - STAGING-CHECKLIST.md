# Ragusa 0.1.3 — Staging Checklist

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
