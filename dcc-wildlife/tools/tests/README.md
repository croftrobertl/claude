# DCC Wildlife — test harness

Run everything:

```bash
bash tools/tests/run-all.sh            # every suite
bash tools/tests/run-all.sh species    # only suites whose filename contains "species"
```

The exit code is the result. **Never grep the output for `FAIL`** — a suite that
crashes exits 255 and prints no `FAIL` line at all, which is exactly how a
broken suite once looked green.

## Layout

| file | what it is |
|---|---|
| `run-all.sh` | discovery runner. Drop a file in and it runs. Lints every PHP and JS file first. |
| `wp-stubs.php` | just enough WordPress to call real plugin code. Tests seed `$GLOBALS['dccwl_test']` directly. |
| `elementor-stubs.php` | `Widget_Base` that RECORDS `add_control()` instead of rendering, so a test can interrogate the four widgets. |
| `lib.php` | assertions for the PHP suites. A suite that asserts nothing fails. |
| `lib.mjs` | browser harness: launches Chromium, builds a page from the plugin's real CSS and JS. |
| `render-fixture.php` | emits the plugin's real server output as JSON for the browser suites. Generated per run, never checked in. |
| `test-*.php` | PHP suites. No WordPress, no database, no network. |
| `ui-*.mjs` | browser suites. Need `npm install` here plus a local Chromium. |

## Browser suites

```bash
cd tools/tests && npm install      # playwright-core only; no browser download
```

They find Chromium under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`),
or `PLAYWRIGHT_CHROMIUM` if you point it at a binary. Without either they **skip
with exit 77** and the runner reports them as skipped. They must never pass by
default: a green tick from a suite that never opened a browser is worse than no
suite at all.

`node_modules/` is gitignored — install it per container.

## Two traps that have produced false results here

**This sandbox has no Raleway.** Text measures NARROWER here than on the live
site, so a row that fits locally can still wrap on a phone. The footnote row
passed at 361px locally and wrapped at 393px live. Anything that tests whether
a row FITS must leave headroom — around 12% — rather than asserting it merely
fits at the exact width.

**There is no live egress from this container.** Nothing here can confirm what
doracanalcourt.com actually serves: not the cached anonymous page, not the real
fonts, not the water feed. These suites prove the plugin's own behaviour. They
do not prove the site's.

## Writing a suite

- Assert on rendered output, computed layout, or a returned value. Never on
  "the function was called".
- Give every assertion a description that reads as a sentence.
- Measure first, then assert. Several assertions in here were written from a
  wrong assumption about the registry and had to be corrected against what the
  code actually does — `best` is prose, not months; `flags` is optional; the
  alligator is deliberately in two sections.
- No tautologies. `check(x ? true : true, …)` has happened; it passes forever
  and means nothing.
