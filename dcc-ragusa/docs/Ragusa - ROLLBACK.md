# Ragusa — Rollback

## First, what cannot go wrong

Ragusa never reads or writes bookings, payments or guest data, never edits
wp-config.php, never deletes a file, never deactivates or removes a plugin,
and never installs code from a feed. The test suite asserts the first by
scanning the source for any post or MotoPress write, and a mutation exists
to prove the assertion bites.

Every autonomous action is journaled before it happens and moves only what
can be moved back:

| Action | What moved | How to undo |
| --- | --- | --- |
| Quarantine | one file from uploads into `~/ragusa-vault/<site>/quarantine/<id>/` | `wp ragusa restore <id>` or the Undo button; the path is then allowlisted at that size |
| Restore a guard | the changed file into quarantine, the sealed copy into place | `wp ragusa restore <id>` puts the changed file back; then `wp ragusa seal <path>` to make it the good copy |
| Rewrite the .htaccess block | the previous .htaccess into quarantine | `wp ragusa restore <id>`, then `wp ragusa seal .htaccess` |
| Roll back a plugin | the new version into quarantine, the previous version into place, auto-update off for that plugin | `wp ragusa restore <id>` swaps them back and turns auto-update back on |

`<id>` is the journal number shown in the email, in Recent Events and in
`wp ragusa journal`. Quarantined copies are kept 90 days.

## If Ragusa restored something you changed on purpose

Your edit is in quarantine, not lost. Either:

    wp ragusa restore <id>          # your version is back
    wp ragusa seal <path>           # and it is now the good copy

or put your version back by hand and run `wp ragusa seal <path>`. Without
the seal, the next tick restores the sealed copy again (twice in 24 hours,
then it alerts instead).

## If Ragusa rolled back an update you wanted

    wp ragusa journal               # find the rollback row
    wp ragusa restore <id>          # the newer version returns, auto-update is on again

Sveti Ivan will check that version again on its next update. If the checks
fail because a marker was renamed on purpose:

    wp ragusa markers               # see the five pages and their markers
    wp ragusa markers set /explore/ "new-marker"
    wp ragusa markers reset         # back to the baked defaults

## If you removed a file on purpose

Seal the path before the next pass, or after it raised "File Missing":

    wp ragusa seal wp-content/mu-plugins/dcc-retired-helper.php
    # Success: Removed wp-content/mu-plugins/dcc-retired-helper.php from the baseline.

Nothing on disk changes; the finding, if any, reads Resolved. A guard
(`Revelin::MU_GUARDS`, the two uploads `.htaccess`) cannot be retired this
way: Ragusa would only put it back from the sealed copy.

## If an email says the Pre-gzipped Cache block is below SpeedyCache

Nothing was changed. SpeedyCache rewrote its `# BEGIN speedycache` block
above `# BEGIN DCC Pre-gzipped Cache`, and its rule ends in `[L]`, so the
pre-gzipped files are never served. Move the DCC Pre-gzipped Cache block
above `# BEGIN speedycache` (keep a copy first: `cp .htaccess ~/htaccess.bak-$(date +%s)`).
The finding resolves on the next tick. The same email, with its own title,
comes when SpeedyCache's block is there and the DCC one is missing. Without
a `# BEGIN speedycache` block (staging) there is nothing to order and
nothing is raised: one info line in Recent Events says so.

## If a finding stays on the page after the problem is gone

Nothing is stuck. A finding resolves itself when its condition goes away
(a newer version passes after a rollback, a guard has matched its sealed
copy for a day, a role is as it was), and then reads "Resolved" in a calm
colour for a week. Anything else gets Mark As Seen on its card: open DCC →
Ragusa and press it; it records who and when. Practice (a drill) is grey,
never counted, and leaves the page after a day.

## If an email says "A New Fatal Elsewhere After This Update"

Nothing was rolled back. A PHP fatal appeared in the error log after an
update, in a file that is not the updated plugin's. Read the line in the
email: a `wp eval` of yours, another plugin you updated by hand, or a cron
job. Only a fatal inside the updated plugin's own folder, or a failed page
or iCal check, can roll an update back.

## If a check keeps failing and it is not the update

The email says "Site Check Failing, Not The Update": Ragusa tried the
previous version, it failed too, and the newer version is back. Nothing is
left changed. Look at the page named in the email.

## If the plugin misbehaves

Deactivate it: Plugins → DCC Ragusa → Deactivate (or `wp plugin deactivate dcc-ragusa`).

- Deactivating removes nothing: the tables, the options and the vault stay.
- The cron events are unscheduled; nothing runs.
- Zelenci (if installed) emails Rob once a day that Ragusa is not standing
  and pings the heartbeat's /fail endpoint, on live only. Remove
  `mu-plugins/dcc-ragusa-zelenci.php` to silence it.
- The front end never carried anything of Ragusa's, so nothing changes for guests.

## If a Ragusa update breaks Ragusa

Ragusa never rolls itself back. The previous version is sealed in the vault:

    wp ragusa vault list            # find the plugin/dcc-ragusa entry
    wp ragusa restore <entry id>    # the previous version is swapped in

or `wp plugin install "Ragusa <previous version>.zip" --force`.

## If the vault manifest does not verify

Ragusa stops restoring anything and says so on the page. Inspect
`~/ragusa-vault/<site>/`, then reseal what you trust:

    wp ragusa seal wp-content/mu-plugins/dcc-user-enum-guard.php
    … (each guard)
    wp ragusa seal .htaccess

Resealing rewrites and re-signs the manifest.

## If you want it gone entirely

Deleting the plugin keeps the data, the journal and the vault unless
"Delete Ragusa's Data, Journal And Vault When The Plugin Is Deleted" was
ticked in Settings first. That switch is off by default. With it on,
deletion drops the two tables, removes every `dcc_ragusa_*` option, and
removes `~/ragusa-vault/<this site's folder>/` only. Another site's vault
folder and `~/mu-backups/` are never touched.
