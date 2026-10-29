=== DCC Ragusa ===
Contributors: doracanalcourt
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.2.9
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

= 0.2.9 =
* Updates made from WordPress.com are recorded. They run inside front-end requests (Jetpack's /?for=jetpack&jetpack=comms endpoint, the REST API, XML-RPC), which the guest gate never loaded Ragusa for: on live, Ultimate Addons for Elementor 2.9.6 was updated that way on Oct 29 with no event, no sealed copy and no journal row. A guest request now adds the three upgrader listeners and returns; they load Ragusa only when an upgrader fires them. Measured with WordPress's own add_filter: about 1 microsecond and 4.9 KB per request; still one file, no Ragusa class, no autoloader.
* The journal names the route: jetpack, rest, xmlrpc or web, besides auto, admin and cli.

= 0.2.8 =
* A plugin update's journal row is written at upgrader_pre_install, before a file is copied, not at upgrader_process_complete. If the request ends before Ragusa hears the update finish (another plugin's completion callback dies or exits, the hook is removed, the process is killed), the row says how it ended, with PHP's last fatal error, and the next tick completes it as a recorded update: its sealed copy, its window, its smoke checks. An update that started and changed nothing is abandoned, never invented.
* An update nobody saw says when WordPress's own automatic updater died holding its lock (the `auto_updater.lock` option it takes at the start of a run and deletes at the end).
* While WordPress shows its maintenance page for an update, the inline smoke checks wait for the follow-up two minutes later: every page would answer 503, and guests would wait on the checks.
* A failed journal insert returns 0. wpdb keeps the previous insert's id after a failed insert, and Ragusa would have written onto that row.
* An .htaccess change made by Newfold's Htaccess Manager says so: it refreshes .htaccess.nfd-backup just before each write, so when the backup is seconds older and holds exactly the .htaccess Ragusa had on record, the finding names Newfold, quotes its STATE line and names a recorded update just before it. It stays a finding.

= 0.2.7 =
* A file removed by a plugin, theme or core update is recorded as information, not emailed, when it disappears inside that update's window, in that component's files, and the new version no longer ships it. "Ships" is decided from the package the upgrader unpacked (listed as it arrives), WordPress.org's published file list for the version, or core's checksums. Anything else missing is still a finding, including a file the new version still ships that vanished during the update: a deletion hidden inside an update is what an attacker would try.
* Third-party updates are in the journal with component, old and new version, time, source and files added, changed and removed, themes included. An update that never passed through the upgrader Ragusa watches (WordPress.com or Jetpack over the REST API, the host, by hand) is noticed by its version change on the next tick, recorded as "unseen", and given the same smoke checks; it vouches for no file, and when nobody publishes its file list it is a finding of its own.
* The File Missing email names the component and its current version, says whether an update was recorded near that time and what it means, says how sure Ragusa is, and gives the one thing to do.

= 0.2.6 =
* The .htaccess order check matches its two markers as whole lines. On live, "# BEGIN speedycache" was matched as the prefix of SpeedyCache's "# BEGIN SpeedyCacheheaders" block, far above the DCC Pre-gzipped Cache block, so Revelin raised "The Pre-gzipped Cache Block Is Below SpeedyCache" every tick while the order was right (live serves X-SpeedyCache-Source: Server-pregz). SpeedyCache's Gzip, LBC and WEBP blocks are not the rewrite block either. Case, trailing spaces and CRLF line ends are allowed.

= 0.2.5 =
* A path the file walk no longer looks at is never reported missing. 0.2.4 handed wp-config.php, the root index.php, .user.ini, php.ini and the drop-ins to their per-tick owners, but the walk's stored baseline still listed them, so the first pass after the upgrade called them gone (wp-config.php as a breach). Such paths now leave the baseline quietly, with one info line, both at the upgrade and at the end of any pass, so a future change of owner cannot do this again.
* Every plain-text change to llms.txt writes a line in Recent Events ("llms.txt Changed (Plain Text Only, As When AIOSEO Regenerates It).") instead of only a first-time digest entry.

= 0.2.4 =
* Update-check cron events no longer pile up where WP-Cron is off: none is scheduled there (the tick runs the checks from their due time), the event of a check the tick ran is removed, and every tick sweeps leftovers for finished rows (all of them where cron is off).
* WP Staging's sse folder: WP Staging 4.18.0 deletes every file older than an hour in wp-content/wp-staging/sse/ once a day, on any request, its own protection files included (Core/WPStaging.php, registerInitHook). Its own files there, recognised by content (the four protection files, and *.sse.cache.php files that begin with its exit header and hold no code), come and go with one info line per pass. Any other file there, or one of those names carrying code, is a finding as anywhere.
* A finding resolved by hand leaves a signed line on its journal row (`wp ragusa resolve <id> --note="…"`), and `wp ragusa note <journal id> "<text>"` adds one to any row. History is only added to.
* PHP: with no reading at all, the web server is asked every tick, not once per ten minutes; the tick says whether the answer landed at once; and the reading is judged every tick from the cached php.net list, so a host that patches PHP clears the finding within a tick instead of the next morning. The explicit login probe answers whenever Ragusa asked within five minutes.
* One finding per change: the PHP settings files (.user.ini, php.ini) are Lovrijenac's alone, and the file walk no longer reports the files the per-tick checks own (wp-config.php, the root index.php, the drop-ins). A settings-file edit is Breached only when it makes PHP run extra code (auto_prepend_file, auto_append_file, the engine on); otherwise it needs a look. "Ragusa Acted" appears in the headline and the report only for a finding whose journal action Ragusa took.
* llms.txt: "llms.txt Changed (Plain Text Only, As When AIOSEO Regenerates It)": what was seen, not who. Info lines never appear among the unresolved findings.
* `wp ragusa restore` takes the id `wp ragusa findings` shows, and that list prints the journal row each finding reports.
* The probe line says whether the answer landed; the not-counted summary names each reason.

= 0.2.3 =
* No false "Failed Its Checks". A first failure recorded before 0.2.2 (no log offset) no longer sends the repeat back to the update's own snapshot: only lines stamped after that first failure count. A fatal stamped before the install finished (upgrader_process_complete) is the copy in progress, not the code. A "Failed opening required" for a file of the plugin that exists now was missing for a moment. Both are recorded as an info line on the update's row and never counted.
* The headline and every row are worked out from the live findings whenever status or the page prints them, not from the last tick. A row that names a failure says when its finding was settled ("all-in-one-seo-pack Failed Its Checks · Resolved Oct 27, 9:10 AM EDT").
* A PHP reading older than twelve hours is asked for again (wp-login.php where WP-Cron is off) and nothing is judged from it meanwhile, so a host that has updated PHP since cannot raise a false "Security Fix Not Applied".

= 0.2.2 =
* Where WP-Cron is off (DISABLE_WP_CRON), Ragusa sends no request to wp-cron.php at all. wp-cron.php ignores that constant and runs every due event, so 0.2.1's PHP probe set off three plugin auto-updates on staging. The probe uses wp-login.php only, the loopback test uses wp-login.php too, a leftover probe event is removed, and status and the page say "WP-Cron Is Off Here; Ragusa Will Never Start It."
* A fatal is credited to the update whose window it falls in and whose files it names: AIOSEO's half-written auto-update no longer raises "A New Fatal Elsewhere" against Ragusa's own self-update; one info line goes on AIOSEO's journal row. The repeat check reads the error log only from where the first failure left it, so one fatal line can never count as two failures and roll a good update back. A plugin that keeps failing still rolls back.
* Lovrijenac's card reads the PHP reading the moment it lands (no lag of a tick), and the status command rebuilds that part before printing.

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
