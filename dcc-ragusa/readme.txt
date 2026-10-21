=== DCC Ragusa ===
Contributors: doracanalcourt
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.1.0
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

= 0.1.0 =
* First build, to the approved design of 2026-10-21.
