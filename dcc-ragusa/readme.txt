=== DCC Ragusa ===
Contributors: doracanalcourt
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.1.2
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
