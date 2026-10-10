# Guest ID path-safety tests

```bash
php tests/id-files/run.php
```

No dependencies — plain PHP against a real temporary directory tree.

## Why these exist

`Id_Files::delete_for_booking()` unlinks a path derived from post meta.
`contain()` and `resolve()` are the only things between that meta and
`unlink()`, so they are pure static functions with no WordPress dependencies
and they are tested directly — against real symlinks, real traversal
sequences, and a real sibling directory that shares the store's name prefix.

Cases that must never pass, all asserted:

| Attempt | Why it matters |
|---|---|
| `../holiday.jpg` | escapes the store |
| `../../secrets/wp-config.php` | reaches site credentials |
| `%2e%2e%2f…`, `..\…` | encoded and Windows-style traversal |
| a symlink in the store pointing at `wp-config.php` | `realpath()` resolves it; a string check would not |
| `mphb_protected_uploads-old/licence.jpg` | prefix collision — why the base gets a trailing separator |
| the store directory itself, or any directory | only files are ever deleted |
| an attachment ID resolving outside the store | the ID is not trusted either |

## What is NOT tested here

Whether the live web server actually refuses to serve the store. No local test
can answer that — only the real server can. That check lives in the plugin, on
**DCC → Custom Checkout → Guest ID storage → "Check public access now"**: it
writes a throwaway probe file, requests it over HTTP, deletes it, and reports
the status code. That is what keeps the /privacy/ sentence honest.
