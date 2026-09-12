# Repo conventions

## Naming files delivered to the user

Every file handed to the user is named with the prefix:

```
Contact Form - <name>
```

The plugin zip is therefore `Contact Form - <version>.zip`, e.g.
`Contact Form - 1.6.0.zip`. Anything else delivered takes the same prefix, e.g.
`Contact Form - Spam Report.md`.

The prefix REPLACES any earlier one rather than stacking: it is
`Contact Form - 1.6.0.zip`, never `Contact Form - Contact Form 1.6.0.zip`.

Files delivered before a naming convention changed keep the name they were
delivered under; they are not renamed retroactively. So the repo history
contains `dcc-contact-form.zip` (pre-convention) and `Contact Form 1.3.0.zip`
through `Contact Form 1.5.0.zip` (the earlier space-only prefix), and that is
expected.

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
