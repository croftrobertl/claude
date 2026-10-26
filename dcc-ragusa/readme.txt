=== DCC Ragusa ===
Contributors: doracanalcourt
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.2.1
License: GPLv2 or later

The walls of doracanalcourt.com. Minčeta watches the files, Bokar guards the login, Revelin keeps the sealed copies, Lovrijenac reads the warnings, Sveti Ivan checks every update.

== Description ==

A fortress that needs no coder to keep standing. It watches everything, blocks or quarantines only what it is certain of, undoes only what can be undone, and sends a messenger (an email) for everything else.

It costs guests nothing: on a front-end request the plugin returns before registering a single hook.

Four things it does on its own, each journaled and reversible:

* quarantine an executable file planted in the uploads folder (moved, never deleted);
* put a guarded file back from its sealed copy;
* rewrite the DCC Security block of .htaccess between its own markers;
* roll back a plugin update that breaks the site twice in a row.

Everything else is an alert to the site owner.

== Installation ==

1. Plugins → Add New → Upload Plugin → the Ragusa zip → Activate.
2. DCC → Ragusa: paste the healthchecks.io ping URL (Period 1 hour, Grace 1 hour) and, if you have one, the Wordfence Intelligence key.
3. From the command line: `wp ragusa zelenci install` for the sentinel.

== Changelog ==

= 0.2.1 =
* The PHP reading arrives. The probe's POST to wp-cron.php carried a `doing_wp_cron` value that wp-cron.php compares to a lock only spawn_cron() sets, so it returned before running the event; the POST now carries nothing. A second path was added, a GET of wp-login.php?ragusa_php=1 that the plugin's boot answers before any form or gate, and an admin page load refreshes a reading older than half a day. The probe is asked every tick while there is no reading, at most once per ten minutes, and `wp ragusa status` now says what happened: "php: not read from the web server yet; asked the web server at Oct 25, 9:31 PM EDT (wp-cron.php HTTP 200, wp-login.php HTTP 200, 3 attempts); no answer yet; probe event scheduled", then "php: 8.3.36 (litespeed), read from the tick under wp-cron.php at …" once it has, and a php.net line.
* `wp ragusa resolve` records the real shell account (the effective user from posix), not the owner of the wp-cli script, which was root.
* The staging checklist gains a scripted drill for the "who changed it" attribution on a real WP Staging version change.

= 0.2.0 =
* The important history stays: the event ring prunes info, practice and withdrawn rows first, then breached or needs-look rows only when they are older than 90 days and their finding is not open. A serious row with an open finding is never discarded for noise.
* The active list holds only unresolved findings; resolved ones move to a 30-day history. `wp ragusa status` counts only the unresolved.
* Who changed it: a file written inside a recorded plugin update's window, in a place that belongs to that plugin (its folder, or a folder of its name under wp-content, uploads, cache or mu-plugins), is tagged with that update and accepted as the baseline, with one info line per update. Known self-writers (llms.txt by AIOSEO) are info unless the file gains PHP.
* `wp ragusa findings` (unresolved; `--all`, `--format=json`) and `wp ragusa resolve <id>` (`--seen`), which records who did it.
* One clock: every time reads in the property's zone with the zone named, "Oct 24, 8:16 PM EDT", in status, the journal, the page and the emails.
* PHP Is Patched (Lovrijenac), once a day from cron: the running PHP is read from the web server (from the tick when wp-cron.php served it, otherwise from a one-off cron event that a loopback makes the web server run), php.net's active-branch list is fetched and cached for a day, and the site is judged: behind the branch's latest is Needs A Look; a security release more than three days old not applied is Breached; a branch no longer active is Needs A Look. php.net unreachable: the status says so and nothing is raised. The PHP settings files (.user.ini, php.ini, this root's and live's when staging sits inside it) are watched: any change is a finding with the diff. A fresh executable under uploads is found within one tick, quarantined and emailed at once, not only at the next walk.
* The Walls Report: one email every Monday at 7:00 AM Eastern, "Ragusa: The Walls Held This Week" or "Ragusa: 2 Things Need A Look", a short paragraph and one line per fortress (opened and closed, updates checked, PHP, disk, vault, last full scan). `wp ragusa report --dry-run` prints it. Staging sends nothing.

= 0.1.6 =
* Revelin reads SpeedyCache's exclusion rules every tick. A page rule for submit-booking, account, checkout, booking-confirmation or search-results whose text carries a slash is dead (SpeedyCache compares its rules against the address with the slashes trimmed), and a cached folder for one of those pages under wp-content/cache/speedycache/ means a guest can be served a stale page. Either is a Needs A Look, "A Booking Page Can Be Cached", naming the rule or folder and the fix ("Remove the slashes from the rule text." / "Delete the folder, then purge SpeedyCache and the server cache."). Read-only: no journal row, one email, resolves on the tick after the fix. JS and CSS rules, the /events/ rule and /guest/ (cached on purpose) are never flagged.

= 0.1.5 =
* Without a `# BEGIN speedycache` block there is nothing to order: Revelin stays quiet, with one info line ("SpeedyCache has no rewrite block here; there is no block order to keep.") the first time it sees that, and never a finding. Staging has no SpeedyCache rewrite block, so 0.1.4's "The Pre-gzipped Cache Block Is Missing" stood there for good. The Needs A Look now comes only when the speedycache block is present and the DCC Pre-gzipped Cache block is missing or below it.

= 0.1.4 =
* `wp ragusa seal <path>` (and Seal on the page) accepts a path with no file at it: the file is dropped from Minčeta's baseline and whatever its absence raised is settled quietly ("Removed wp-content/… from the baseline."), so a deliberate deletion is never reported as missing. A guard is never dropped this way. A "File Missing" finding now stays open until the file is back or the path is sealed; it no longer resolved itself on the next pass.
* Revelin checks every tick that the `# BEGIN DCC Pre-gzipped Cache` block of .htaccess sits above `# BEGIN speedycache`, whose rule ends in [L]. The wrong order, or either block missing, is a Needs A Look that names the fix ("Move the DCC Pre-gzipped Cache block above # BEGIN speedycache.") and is never an auto-fix; it resolves once the order is right.

= 0.1.3 =
* Practice is labelled as practice: everything a drill does carries a "drill" tag; it shows grey on its card as Practice, never colours a card or the headline, never emails, leaves the page after a day (the table keeps it), and the walk never looks at the drill's own paths. An upgrade re-tags what earlier drills left.
* Findings clear themselves when the problem is gone: a rollback finding resolves when a newer version passes its checks or the rollback is undone; a restore finding after the file has matched its sealed copy for a full day; a role change when the role is as it was. A resolved finding stays on its card as "Resolved 3 Days Ago" for a week in a calm colour. A journal that finishes late, for a version no longer installed, raises nothing. Withdrawn events never count as changes.
* Mark As Seen on every open finding: a logged-in administrator and a nonce, recording who and when ("Seen By Rob, Today"). Never a link in an email. The headline returns to "The Walls Are Holding" once every finding is resolved, seen or practice. A real rollback, restore or quarantine is still breached and still emails.

= 0.1.2 =
* Only this site's error logs are read: a parent directory that is itself a WordPress root (live, seen from staging) is never read, and a fatal raised by WP-CLI (a phar location or eval()'d code) is never evidence. A fatal outside the updated plugin's own files is now an alert, "A New Fatal Elsewhere After This Update", not grounds for a rollback.
* A recorded plugin update re-baselines its own files silently, with one info line ("dcc-ledger 0.1.8: 17 files updated"); a rollback re-baselines again.
* A lost self-update check is recovered, not abandoned.
* The rollback row is committed in the same call as its verification, also when the follow-up subprocess runs at once; every drill fails loudly when a step does not match.
* Upgrading retakes Bokar's baseline quietly and withdraws 0.1.0's false role changes; a reordered plugin list (a --force reinstall) is not a change.
* `wp ragusa proof` names a login page that answered inside wp-load, and on staging sets WP Staging aside in both columns.
* The disk figure reaches the card on every reading; `wp ragusa status` reads "Overdue By 5 Hours" and "WP-Cron Is Off Here" when that constant is set; `wp help ragusa` reads cleanly.

= 0.1.1 =
* The 10-minute cron schedule is registered at file load, so activation can use it; the tick self-heals on every admin and cron boot, and Zelenci rings if Ragusa is active but silent for three hours.
* The first complete pass is the baseline however many ticks it takes; an upgrade from 0.1.0 treats the existing index as the baseline and withdraws the false "new file" findings quietly.
* The disk quota is read for the filesystem that holds the home directory (from `df -P ~`), or the fullest one with a note.
* Bokar reads roles from the capabilities meta, with a fallback for a clone whose meta keys kept the old prefix; `wp ragusa status` says which key it used.
* A staging login page answering instead of a page is "not checked", never a failure; the rollback drill uses its own probe, answered before any gate.
* The headline leads with "Something Needs A Look" when anything does.
* `wp ragusa proof`: the zero-weight measurement in a fresh front-end PHP process, with and without Ragusa.

= 0.1.0 =
* First build, to the approved design of 2026-10-21.
