=== DCC Ragusa ===
Contributors: doracanalcourt
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.1.1
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
