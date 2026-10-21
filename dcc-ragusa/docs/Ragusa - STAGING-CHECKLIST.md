# Ragusa 0.1.0 — Staging Checklist

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
- [ ] The cron event is scheduled: `wp cron event list | grep dccr_tick`.
- [ ] DCC → Ragusa loads. The sentence at the top says the walls are not yet
      checked, and the amber notice says this is the staging site.

## 2. The first tick

- [ ] `wp ragusa tick`. Expect: users baselined, the guards sealed (the four
      `dcc-*` mu-plugins, `uploads/.htaccess`, `uploads/mphb_protected_uploads/.htaccess`,
      the DCC Security block), Ragusa's own files sealed, critical options
      baselined, the walk started.
- [ ] `wp ragusa scan` runs the walk to completion and prints the file count.
      Write down the count and how long it took.
- [ ] `wp ragusa status`: every fortress is Holding (Lovrijenac says
      "No Feed Key Yet"). Loopbacks: note whether it says they work.
- [ ] `wp ragusa vault list`: the manifest verifies and every entry is intact.
      Note the vault path. It must be under `~/ragusa-vault/staging-…`, never
      the live folder.
- [ ] DCC → Ragusa on an iPhone (or a 390px window): one column, every
      card shows a word and an icon, nothing scrolls sideways, every button
      is comfortably tappable.

## 3. Zero weight for guests (the proof)

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
- [ ] `wp ragusa drill htaccess` (only if loopbacks work): one line inside
      the DCC block is altered, the block is rewritten, the SpeedyCache and
      Newfold blocks are untouched, and the file ends as it began.
- [ ] `wp ragusa drill rollback` (only if loopbacks work): the test plugin is
      installed at 1.0.0, sealed, "updated" to a 1.0.1 that answers 500 to
      Ragusa's checks, fails once, fails again, is rolled back to 1.0.0, is
      verified, the reverse brings 1.0.1 back, and the test plugin is removed.
- [ ] `wp ragusa journal` shows all of it, newest first. DCC → Ragusa →
      Recent Events shows the same with Undo buttons on the committed rows
      (the drill already undid them, so they say Undone).

## 8. A real forced install (your route)

- [ ] `wp plugin install "Ledger <version>.zip" --force` (any DCC zip you
      have). In the output, Sveti Ivan prints each check as it runs, and the
      in-process checks from the `wp ragusa check --after=…` subprocess.
      Expect every check ✓ and "all checks passed". `wp ragusa vault list`
      shows the previous version sealed.
- [ ] Break a marker on purpose to see the alert path: edit the Guest Guide
      shortcode page so `data-dccwl-viewtrigger` is absent, then
      `wp ragusa markers set /explore/ "<the new marker>"` and confirm the
      next check passes; `wp ragusa markers reset` afterwards.

## 9. Seal and Restore from the page

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
