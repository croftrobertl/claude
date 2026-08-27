# Repo conventions

## Delivering plugin zips

Name every new DCC Contact Form zip:

```
Contact Form <version>.zip
```

e.g. `Contact Form 1.3.0.zip`. The version in the filename is the plugin's own
version, not the date and not the other plugin's version. Zips delivered before
this convention kept the bare `dcc-contact-form.zip` name; they are not renamed
retroactively.

The zip still contains a single top-level `dcc-contact-form/` folder — only the
archive's filename changes, so Plugins -> Upload Plugin continues to install and
update in place.

## Releasing

A change to plugin behaviour gets a version bump in the same commit. The version
appears in three places and all three must agree:

- `dcc-contact-form/dcc-contact-form.php` -> `* Version:` header
- `dcc-contact-form/dcc-contact-form.php` -> `DCC_CONTACT_VERSION` constant
- `dcc-contact-form/readme.txt` -> `Stable tag:` + a `== Changelog ==` entry

Build the zip from the committed state and deliver one zip per version, so a
version number always identifies exactly one build.

Repo-level files (`CLAUDE.md`, `.gitignore`, the notes docs) are not part of the
plugin and are not shipped in the zip, so changing them needs no version bump.
