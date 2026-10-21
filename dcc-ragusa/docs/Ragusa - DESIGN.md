# Ragusa — Design

> Status: **approved 2026-10-21 with the corrections in section 11**, and
> 0.1.0 is built to it. Written 2026-10-21 for the Website Director, from the
> brief relayed by Rob. Where section 11 changes an earlier section, section
> 11 wins; the A1 rule below is already corrected in place.
>
> The Croatian names are used on screen exactly as Rob wants them: Minčeta,
> Bokar, Revelin, Lovrijenac, Sveti Ivan. The ASCII slugs in code are
> `minceta`, `bokar`, `revelin`, `lovrijenac`, `sveti-ivan`.

## 0. What I verified, and what I could not

Rob's rule is verify, then speak. Everything below that rests on a source
is marked. Everything I could not reach is listed here so you do not have to
ask.

### Verified against source

| Fact | Where I read it |
| --- | --- |
| WordPress 7.1.3 rolls back a plugin auto-update only when the plugin was **active**, the update ran from **cron auto-update** (`WP_Automatic_Updater`), and a loopback scrape of the home page finds a **PHP fatal** (`has_fatal_error()`). A site that loads but no longer books passes that check. | `wp-admin/includes/class-wp-automatic-updater.php` at tag 7.1.3, lines 539–612 and 1751–1832 |
| Manual updates, Plugins-screen updates and WP-CLI updates get **no** fatal scrape at all. | Same file: the scrape lives only in `WP_Automatic_Updater::update()` |
| `wp plugin install --force` runs `Plugin_Upgrader::install()` with `overwrite_package => true`. Its `hook_extra` is `type => plugin, action => install` with **no `temp_backup`**, so core makes no backup of the old folder on that path. `upgrader_pre_install` fires before the old folder is cleared, which is where Revelin can seal. | `class-plugin-upgrader.php` at 7.1.3, lines 118–160; `class-wp-upgrader.php` lines 556–608 |
| A plugin **update** does carry `temp_backup` and core moves the old folder to `wp-content/upgrade-temp-backup/plugins/<slug>` and deletes it on success. | `class-plugin-upgrader.php` lines 228–240; `class-wp-upgrader.php` lines 1123–1290 |
| Core's own loopback feature-test is `WP_Site_Health::can_perform_loopback()`: a POST to `site_url('wp-cron.php')`, 10 s timeout, `https_local_ssl_verify` filter. | `class-wp-site-health.php` at 7.1.3, lines 3275–3330 |
| Core checksums come from `get_core_checksums($version, $locale)`, which calls `api.wordpress.org/core/checksums/1.0/`. | `wp-admin/includes/update.php` at 7.1.3, line 131 |
| Plugin checksums are at `https://downloads.wordpress.org/plugin-checksums/<slug>/<version>.json`, with a `files` map of path → hashes. | WP-CLI `php/WP_CLI/WpOrgApi.php`, `get_plugin_checksums()` |
| Wordfence Intelligence v3 feed: base `https://www.wordfence.com/api/intelligence/v3`, paths `/vulnerabilities/scanner` and `/vulnerabilities/production`, header `Authorization: Bearer <key>`. The record schema (id, title, software[] with type/name/slug/affected_versions/patched/patched_versions, references, published, copyrights, and in production also cvss/cve/description/remediation) is what wordfence-cli validates. | `wordfence-cli` `wordfence/api/intelligence.py` on main |
| Wordfence v1 and v2 feeds are switched off on 2026-03-09; v3 needs an API key from a wordfence.com account. | wordfence-cli issue #357 and its pull request #364 |
| The Wordfence production feed was "over 117 MB" in October 2025. | gosuccess/wordfence-api README |
| Wordfence requires MITRE attribution: "Any company or individual who uses Wordfence vulnerability database API needs to display the MITRE copyright claims included in that vulnerability record for any MITRE vulnerabilities that they display to their end user." The feed carries this in each record's `copyrights`. | Same README, quoting Wordfence |
| WPScan's free API tier is 25 requests a day **for non-commercial use**; commercial use needs a paid licence. | wpscan.com/pricing (via search) and the WPScan Public Source License in the wpscan README |
| Patchstack's Standard API developer tier is 500 requests a day, key by application with a use-case review, and its docs point commercial users to the paid API. | docs.patchstack.com (via search) |
| healthchecks.io: `/ping/<uuid>`, `/ping/<uuid>/start`, `/ping/<uuid>/fail`; HEAD, GET or POST; the body is stored if it looks like UTF-8, up to the instance's `Ping-Body-Limit` (10 kB on the hosted service); more than 5 pings a minute may be dropped. Period is the expected time between pings; Grace Time is the extra wait before alerting. | healthchecks/healthchecks `templates/docs/http_api.md` and `configuring_checks.md` |
| Jetpack's firewall lives in `wp-content/jetpack-waf/`: `bootstrap.php` (regenerated on every WAF update), `rules/rules.php` (the entry point), `rules/automatic-rules.php`, `rules/allow-ip.php`, `rules/block-ip.php`. Its mode is the option `jetpack_waf_mode`; deactivating empties `rules.php` to `<?php`. | Automattic/jetpack `projects/packages/waf/src/` on trunk |
| The DCC Ledger look: `.dccl` custom properties (brand `#0f6dbf`, dark `#0a4f8c`, accent `#f08080`, good `#1a7f4b`, warn `#8a6100`, bad `#b3261e`, ink `#1d2327`, muted `#646970`, line `#dcdcde`, radius 8px), tiles with a 3px coloured top border, chips, notices with a 4px left border, `text-wrap: balance` on headings, one column under 782px. | `dcc-ledger/assets/css/admin.css` on `claude/dcc-ledger`, plus its 390px and 1280px screenshots |
| Repo default branch is `claude/review-shared-chat-bExtl`; I started on `main` (6f9205c8) and created `claude/dcc-ragusa` from `origin/main`. | `git ls-remote --symref` |

### Not verified (and why)

- **The Wordfence Intelligence Terms and Conditions page itself.** This
  session's proxy refuses wordfence.com, wpscan.com, wordpress.org and the
  Wayback Machine. The search excerpt of Wordfence's help page says the feed
  is "publicly available for free for personal and commercial use". Please
  read the terms page once on your side before Rob creates the key.
- **The size of the v3 scanner feed.** I could not fetch it without a key.
  Section 5 says how to measure it in one command once Rob has the key, and
  the design degrades safely if it is too large.
- **How the DCC admin pages do the coral hover.** I found no `(hover: hover)`
  rule in the Ledger, Wildlife, Contact Form or Seasons branches. I will write
  the rule from the house rule as stated in the brief.
- **MotoPress's iCal exporter class** and the export URL shape. MotoPress is a
  paid plugin and is not in the repo. Section 2, Sveti Ivan, says what I need
  from you.
- **The `error_log` path on live** and how `dcc-error-log-health` rotates it.
  I assume `public_html/error_log`, rotated by truncation or rename.
- **Whether the `quota` binary exists on HostGator's shell.** The design tries
  it first and says on the card when it cannot.
- **Page marker strings.** I propose candidates in section 2; they must be
  taken from live HTML as the brief says.

---

## 1. Threat model for doracanalcourt.com

The site is a WordPress 7.1.3 install on HostGator shared hosting, PHP
8.3.36, 33-odd plugins, MotoPress Hotel Booking as the money path, Jetpack
(waf, protect, monitor, sso), SpeedyCache, auto-updates on for every plugin,
one person who owns it and does not code, and one director with SSH.

### What we are protecting, in order

1. **The booking path.** The 8 cottage pages, `/submit-booking/`, MotoPress's
   iCal exports (an empty export reads as "fully available" to an OTA), and
   the checkout. Every other asset matters because it can break this one.
2. **Administrator control.** Two administrator accounts today. Whoever holds
   one can do anything the fortresses could do.
3. **The guard add-ons.** Four mu-plugins and one `.htaccess` block that
   close known holes. They have no update server and no second copy.
4. **Disk headroom.** 8.4 of 10 GB used. A full disk breaks bookings before
   anyone notices.
5. **Rob's attention.** A fortress that cries wolf gets ignored. Alert-storm
   control is a security feature here, not a nicety.

### Who and what, ranked by likelihood on this site

| # | Threat | Why it is likely here | Fortress |
| --- | --- | --- | --- |
| T1 | A vulnerable plugin is exploited: a web shell lands in `uploads/`, a backdoor is appended to a plugin or theme file, a rogue administrator is created, `siteurl` or `admin_email` is changed, registration is opened with a privileged default role. | 33 plugins, several large (Elementor, Essential Addons, AIOSEO, WPForms, Jetpack), plus Angie (Elementor's AI agent). The DB already carries the scar of `apikey/apikey.php.suspected`. | Minčeta (files, options), Bokar (users), Lovrijenac (the warning before it happens) |
| T2 | A good-faith update breaks booking **without** a PHP fatal: a template change, a JavaScript error, a MotoPress API change, an empty iCal export. | Auto-updates are on for every plugin. Core's rollback only catches fatals, and only on cron auto-updates. | Sveti Ivan, Revelin |
| T3 | Credential compromise: a weak `/staff/` password, no 2FA, salts never rotated, an application password minted quietly, HostGator staff SSO. | Your 2026-10-13 audit found all three open items. | Bokar (records and reports), standing advice on the page |
| T4 | Host-level decay: disk quota full, `error_log` growth, short outages. | 82% of quota; the host has hiccups and the SSH drops. | Minčeta (disk), Sveti Ivan (no false rollbacks) |
| T5 | Supply chain: a plugin is closed on wordpress.org or changes hands; a stale experimental plugin stays installed. | MCP Adapter and the AI providers are experimental; closed plugins vanish silently from the update list. | Lovrijenac |
| T6 | Silent erosion: a Jetpack module switched off, the DCC `.htaccess` block overwritten by SpeedyCache or Newfold, a mu-plugin edited or removed, leftover cron hooks. | Three cache layers and two vendors rewrite `.htaccess`; HostGator writes to `mu-plugins/`. | Minčeta, Revelin |
| T7 | Friendly fire: the director edits a guarded file over SSH and Ragusa "restores" it. | You said you do this. | Revelin's Seal, and the overwritten copy is always kept |

### What each fortress covers, and deliberately does not

**Minčeta · Watches The Files**

- Covers: core files against api.wordpress.org checksums; wordpress.org
  plugins against their published checksums; every other plugin, the theme,
  `mu-plugins/`, Ragusa itself, the `wp-content/` drop-ins (`advanced-cache.php`,
  `db.php`, `object-cache.php`), `.user.ini` and `php.ini` (the classic
  `auto_prepend_file` hiding place), `index.php` at the root, and
  `wp-config.php` by hash only, against Revelin's baseline; executable files
  under `uploads/`; the six critical options plus Jetpack's `waf`, `protect`
  and `monitor` modules; disk quota.
- Does not: scan file *contents* for malware signatures (it checks integrity
  against a known-good, which is stronger and cannot be evaded by
  obfuscation, but it will not name a backdoor in a file that was never
  baselined); read post content, comments, bookings or guest data; restore
  core or wordpress.org plugin files (Rob's rule: restore only from Ragusa's
  own sealed copy, and Ragusa seals neither core nor a live plugin's files
  outside an update); touch Jetpack's rule files or IP lists; touch
  `advanced-cache.php`, `jetpack-waf/rules/*` or the non-DCC parts of
  `.htaccess` (expected churn, reported as info only).

**Bokar · Guards The Login**

- Covers: new administrators, role changes to or from administrator and
  editor, application passwords created or deleted, the first sighting of
  an administrator from a new IP, `users_can_register` and `default_role`
  (shared with Minčeta's option check), the baseline of 15 users and 2
  administrators.
- Does not: block, throttle or lock anyone out (Jetpack Protect does that);
  store an IP address in the clear, an email address or a phone number;
  name any non-administrator user (ID and role only, since some are guests);
  touch MotoPress customers.

**Revelin · Keeps The Sealed Copies**

- Covers: sealed copies of the four guard mu-plugins, the DCC `.htaccess`
  block, Ragusa itself, and the previous version of each plugin taken just
  before an update; the signed manifest; the 300 MB cap and eviction; the
  quarantine folder.
- Does not: back up the database, uploads, the theme or core (that is
  UpdraftPlus and your `~/mu-backups/`, which Revelin never touches); keep
  more than one previous version of a plugin; seal a copy it cannot fit.

**Lovrijenac · Reads The Warnings**

- Covers: known vulnerabilities for installed plugins and their versions,
  core and PHP, from one daily feed fetch; closed or abandoned plugins on
  wordpress.org; the heartbeat.
- Does not: install, update or remove anything on its own (its "Update Now"
  button runs core's updater, which runs through Sveti Ivan); execute or
  include anything from a feed; scan the site's own code for unknown
  vulnerabilities.

**Sveti Ivan · Checks Every Update**

- Covers: every plugin install and update, from any route (auto-update,
  Plugins screen, Lovrijenac's button, your WP-CLI); the smoke checks; the
  repeat-before-rollback rule; the rollback from Revelin; cache purge;
  switching off auto-update for one plugin that was rolled back; core
  updates (checked and reported only).
- Does not: roll back core, a theme, or Ragusa itself; block an update (there
  is no bypass flag because there is no gate: Sveti Ivan inspects after the
  ship has docked, it does not refuse entry); decide that a transient
  failure is a bad update.

### Outside every wall

These are named so nobody assumes Ragusa holds them.

- HTTP-layer attack blocking, brute force, scraping, DDoS: Jetpack WAF and
  Protect, and HostGator. See section 6.
- A compromise of the hosting account itself (cPanel password, SSH key,
  HostGator staff). Anyone running as the account user can read the vault
  key and edit the vault. Section 2, Revelin, says exactly what the HMAC
  does and does not protect against.
- Database tampering outside the six critical options. Ragusa does not read
  posts, bookings, payments or customers at all, by Rob's rule.
- The three AI API keys stored in plain text in `portal_options`
  (SITE-CONTEXT §8). Standing advice on the page; Ragusa never reads them.

---

## 2. "Clearly malicious", and the state and rollback matrix

### 2.1 Exactly what Ragusa acts on without asking

Rob allowed four autonomous actions. Each has one precise trigger. Anything
that does not meet the letter of a trigger is an alert.

**A1 · Quarantine a file.** (Corrected 2026-10-21: the uploads folder
holds 19 `.htaccess` files and some of them are protection.) All of these
must hold:

1. The file is under `wp-content/uploads/` (any depth), or under
   `wp-content/upgrade/` older than 24 hours. Ragusa's own vault, including
   its uploads fallback location, is excluded from the walk.
2. **Either** its name ends in an executable extension: `php`, `php3`,
   `php4`, `php5`, `php7`, `php8`, `phtml`, `phar`, `pht`, `phps`, `shtml`,
   `cgi`, `pl`, `py`, `sh`; or it has a double extension whose last part is
   one of those (`photo.jpg.php`). **Or** it is a `.htaccess` or `.user.ini`
   that is new or changed since the baseline **and re-enables execution**:
   `AddHandler`, `SetHandler` or `AddType` mapping to PHP or CGI,
   `php_flag engine on`, `php_admin_flag engine on`, `Options +ExecCGI`, or
   a `<FilesMatch>`/`<Files>` block that allows PHP. The meaning is judged,
   not the keyword: `php_flag engine off` is protection, and so is `Deny
   from all`. Every `.htaccess` and `.user.ini` present under uploads on
   first run is baselined (path and SHA-256) and is never quarantined; a
   change to one of them that does not re-enable execution is an alert.
3. It is not on the allowlist of the eight stubs, matched by exact relative
   path **and** byte size:
   `wp-staging/index.php` (679), `wp-staging/cache/index.php` (679),
   `wp-staging/logs/index.php` (679), `wp-staging/backups/index.php` (679),
   `wpforms/cache/index.php` (99), `motopress-calendar/index.php` (6),
   `mphb/index.php` (28), `mphb_protected_uploads/index.php` (28).
4. It is not a benign stub by content. A file of 128 bytes or less whose
   whole content, trimmed, is one of `<?php`, `<?php // Silence is golden.`,
   `<?php // Silence is golden`, `<?php /* Silence is golden. */` or
   `<?php exit;` is reported as **info** ("new index stub in uploads, looks
   like a plugin's own"), never quarantined. Plugins create these.

If 1–4 hold, the file is quarantined (moved, never deleted), and Rob gets
one email. Nothing in `uploads/` is ever hashed or opened beyond the first
4 kB of a PHP-named, `.htaccess` or `.user.ini` file.

Two of those `.htaccess` files are guards in Rob's sense and join Revelin's
sealed set: `uploads/.htaccess` (the 2026-10-13 rule denying `.php`,
`.phtml`, `.phar` and `.pht` in all of uploads) and
`uploads/mphb_protected_uploads/.htaccess` (`Deny from all`, protecting
guests' uploaded ID photos). A2 restores them if they change or disappear.

**A2 · Restore a guarded file from its sealed copy.** All of these must hold:

1. The file is one of the sealed set: `mu-plugins/dcc-user-enum-guard.php`,
   `dcc-postpass-guard.php`, `dcc-ical-export-guard.php`,
   `dcc-ical-privacy.php`, any file inside `plugins/dcc-ragusa/`.
2. Its SHA-256 differs from the sealed manifest, or the file is missing.
3. The manifest's HMAC verifies.
4. The sealed copy passes `php -l` (or, without `proc_open`, a
   `token_get_all` parse with balanced braces and no `T_INLINE_HTML` before
   the opening tag) at restore time.

For Ragusa's own files there is one more rule: Ragusa never restores
itself during a Ragusa install or update (section 2.5), and never restores
itself more than once in 24 hours. If its files still differ after that,
it alerts and stops.

**A3 · Rewrite the DCC `.htaccess` block.** All of these must hold:

1. The text between `# BEGIN DCC Security` and `# END DCC Security` differs
   from the sealed block, or the markers are missing.
2. The rest of `.htaccess` is left byte for byte as found.
3. The write is atomic: temp file in the same directory, then `rename()`.
4. The home page returns 200 within 10 s afterwards (loopback), or the
   previous `.htaccess` is put back by the same rename and the action is
   recorded as Reversed. Without loopbacks (section 2.4), A3 degrades to an
   alert with the one-line `wp ragusa restore` command for you.

Every other `.htaccess` change is info: SpeedyCache, Newfold and Jetpack
own their blocks.

**A4 · Roll back a plugin update.** All of these must hold:

1. Sveti Ivan's smoke checks failed after a plugin **update** (not an
   install of a new plugin, not core, not a theme, not Ragusa).
2. The same check failed again on the repeat run 5 minutes later.
3. The home page answered the repeat loopback at all (the host is up; this
   is not an outage).
4. Revelin holds a sealed copy of the previous version of **that** plugin,
   its HMAC verifies, and it extracts cleanly.

Rollback never happens for a failure that first appears more than 60
minutes after the update finished. After that window a failure is an alert,
because it is no longer evidence about the update.

**Everything else is an alert.** In particular: any change to a core file
(you restore with `wp core verify-checksums` and `wp core download --force`),
any change to a wordpress.org plugin's files outside an update, a changed
`db.php`, `.user.ini` or `wp-config.php` hash, a new file in `mu-plugins/`,
a new administrator, a role change, a new application password, a changed
critical option, a Jetpack module off, a vulnerable plugin, disk over 90%.

### 2.2 The journal: one state machine for every action

Every autonomous action is a row in `{prefix}dcc_ragusa_journal` and goes
through these states, written **before** the step that they describe
(write-ahead):

```
Planned → Before-State Recorded → Acting → Verifying → Committed
                                      ↘             ↘
                                       Reversed ←────┘
                              (Abandoned: nothing was changed)
```

A row holds: id, action (A1–A4), target path or slug, state, run token,
timestamps per state, `before` (hashes, sizes, mtimes, permissions, exact
paths), `after` (the same for what was put in place), `verify` (what was
checked and the result), `reversible` (yes/no and how), and `reversed_by`.

**If a run dies.** Every tick starts by reading rows that are not in a
terminal state and are older than 2 minutes (the run token tells it they
are not its own). The rule per state:

| Row left in | What the next run does |
| --- | --- |
| Planned | Marks Abandoned. Nothing was touched. |
| Before-State Recorded | Marks Abandoned. Nothing was touched. |
| Acting | Reads the filesystem and compares with `before` and `after`. If the target now equals `after` (the rename completed), moves on to Verifying. If it equals `before`, marks Abandoned. If neither (a partial copy, which only the copy fallback can produce), removes the partial, puts `before` back from the vault or quarantine, and marks Reversed. |
| Verifying | Runs the verification again and finishes as Committed or Reversed. |

Directory and file swaps use `rename()` on the same filesystem (the home
directory is one filesystem on cPanel), so "Acting" can only ever be found
complete or not started. The copy-then-unlink fallback exists only for the
case where the vault turns out to be on another filesystem, and the row
says which path was used.

### 2.3 The matrix

**A1 · Quarantine**

| | |
| --- | --- |
| Trigger | Minčeta's uploads walk finds a file meeting 2.1 A1. |
| Before-State | Path, size, mtime, mode, SHA-256 of the first 64 kB and of the whole file (it is hashed only now, when it is already condemned). |
| Acting | `rename()` to `<vault>/quarantine/<journal id>/<original relative path>`; mode set to 0600. Fallback: copy, verify hash, unlink. |
| Verifying | The source path no longer exists; the quarantined file's hash matches `before`. |
| Committed | Event "Quarantined <path>", email to Rob, card shows "1 File In Quarantine". |
| Reverse path | `wp ragusa restore <id>` or the Restore button: `rename()` back, mode restored. Available for as long as the quarantine folder is kept (90 days, then it is evicted oldest-first, and the journal row says "copy expired"). |
| Dies at Acting | See 2.2: either the rename happened or it did not. |
| What it cannot catch | A backdoor with a non-executable name that Apache would still run because of an `.htaccess` elsewhere. Ragusa watches for that `.htaccess` instead. |

**A2 · Restore a guarded file**

| | |
| --- | --- |
| Trigger | Minčeta's guarded-set check finds a hash mismatch or a missing file, and the manifest verifies. |
| Before-State | The current (changed) file is copied into `<vault>/quarantine/<id>/` first, with hash and mtime. It is never lost: if you edited it on purpose, your edit is in there. |
| Acting | Sealed copy extracted to a temp name in the same directory, `php -l` on the temp, then `rename()` over the target. |
| Verifying | Hash of the target equals the sealed hash; then the home page loopback returns 200 (when loopbacks work). For the iCal guards, the in-process iCal check (section 2.4) also still passes. |
| Committed | Event, email "Guarded File Restored", with the reseal command in case it was you. |
| Reverse path | `wp ragusa restore <id>` puts the quarantined (your) version back; or `wp ragusa seal <path>` after you put your version back yourself, which rewrites the manifest and stops the loop. |
| Dies at Acting | 2.2. The temp file is removed if found. |
| Loop guard | The same path is restored at most twice in 24 hours. A third mismatch is an alert "keeps changing", not a restore. |

**A3 · Rewrite the `.htaccess` block**

| | |
| --- | --- |
| Trigger | Minčeta reads `.htaccess` (one small file, every tick), the DCC block differs or is missing. |
| Before-State | Whole `.htaccess` copied to quarantine; hash recorded. |
| Acting | New content = file as found with only the marked block replaced (or appended at the top if the markers are gone, which is where the block lives today; confirm). Written to `.htaccess.ragusa-tmp`, `rename()` over. |
| Verifying | Home page loopback 200 within 10 s, plus the cottage page. |
| Committed | Event and email. |
| Reverse path | Automatic on failed verification: the quarantined copy is renamed back. Manual: `wp ragusa restore <id>`. |
| Dies at Acting | 2.2. |
| Without loopbacks | A3 is not autonomous: an alert with the command instead, because a bad `.htaccess` takes the whole site down and Ragusa could not see it. |

**A4 · Roll back a plugin update**

| | |
| --- | --- |
| Trigger | 2.1 A4: failed, failed again 5 minutes later, host up, sealed copy present. |
| Before-State | The new (broken) version's folder hash list; the update's source (auto, admin, CLI, Lovrijenac button), old and new version strings. |
| Acting | 1. Extract the sealed zip to `wp-content/upgrade/ragusa-<slug>-<id>/` and verify every file against the vault manifest. 2. `php -l` the main plugin file. 3. `rename()` `plugins/<slug>` → `<vault>/quarantine/<id>/<slug>` (same filesystem) or, failing that, to `wp-content/upgrade/ragusa-quarantine-<id>/`. 4. `rename()` the staged folder → `plugins/<slug>`. 5. Purge: `\SpeedyCache\Delete::all_cache()` if that class and method exist, Elementor's `Plugin::$instance->files_manager->clear_cache()` if present, `wp_cache_flush()`. 6. Remove the slug from the `auto_update_plugins` option (recorded in `after`, so it can be put back). |
| Verifying | The full smoke-check set again, in the next request (a scheduled single event 2 minutes later, or a `wp` subprocess from the CLI). |
| Committed | Email "Update Rolled Back", card "Needs A Look", the broken copy kept in quarantine for 90 days. Core's own update check will offer the update again; auto-update stays off for that plugin until Rob or you turn it on. |
| Reverse path | If the old version **also** fails the checks, the problem is not the update: the new version is renamed back into place, the auto-update flag is put back, state Reversed, and the email says "both versions fail these checks, so this is not the update". Manual: `wp ragusa restore <id>` swaps the folders the other way. |
| Dies at step 3 or 4 | 2.2: a rename is atomic. If step 3 happened and 4 did not, `plugins/<slug>` is missing: the next run sees `before` gone and `after` absent, so it completes step 4 from the staged folder (which is still there), then continues. If the staged folder is missing too, it puts the quarantined folder back and marks Reversed. |
| Dies at step 5 or 6 | The swap is done; purge and the flag are re-run, both idempotent. |

### 2.4 Sveti Ivan's smoke checks

Run after **every** plugin install or update, inline on
`upgrader_process_complete`, and again in a fresh request 2 minutes later,
because inline the old plugin code is still in memory. Inline the loopbacks
already test fresh requests; the in-process checks are only trusted from
the follow-up.

| Check | How | Needs |
| --- | --- | --- |
| Pages | GET `/`, `/accommodation/cottage-34/`, `/contact/`, `/submit-booking/`, `/explore/`, each with `?ragusa_check=<random>` so SpeedyCache (and Endurance) serve the real page; 10 s timeout; `https_local_ssl_verify` like core; expect 200 and the page's marker string. | Loopbacks |
| Markers | Baked defaults, to be taken from live HTML. Candidates I will verify against staging: `/` → `Dora Canal Court` in `<title>` and an `elementor-` class; cottage → `mphb_check_in_date` (MotoPress's booking form field); `/contact/` → the DCC contact form's root class; `/submit-booking/` → MotoPress's checkout wrapper class; `/explore/` → the Guest Guide root class. Please send me the five pages' HTML once, or run the `grep` lines I will include in the staging checklist. | — |
| No new fatal | Read `error_log` from the remembered byte offset. Rotation detection: if the file is smaller than the offset, or its inode changed, start from 0. Match `PHP Fatal error` and `PHP Parse error` lines newer than the update's start time. | Nothing |
| iCal exports | Call MotoPress's exporter in-process for rooms 1066, 1068, 1070, 1072, 1613, 1614, 1806, 1807 and require at least one `BEGIN:VEVENT` in each. **I need from you:** the class and method MotoPress uses to build the export (the handler behind its sync URL), or confirmation that a loopback GET of each room's export URL is acceptable as the fallback. | MotoPress |
| Loopback feature test | On first run and once a day: `WP_Site_Health::can_perform_loopback()`-style POST to `wp-cron.php`. If it fails, the card says "Loopbacks Do Not Work On This Host: Pages Are Not Checked", and only the in-process checks run. | — |

A failure is **never** acted on from one run. It schedules a repeat 5
minutes later. Only a repeated failure of the same check, with the home
page still answering, triggers A4. A loopback that times out while the
home page also times out is "host hiccup": re-check at 15 minutes, up to
three times, then an alert "could not verify update", never a rollback.

**From WP-CLI.** When `WP_CLI` is defined, Sveti Ivan prints every check as
it runs (`WP_CLI::log`, `::warning`, `::error`) right after the install.
For the follow-up checks that need the new code loaded, it runs
`wp ragusa check --after=<journal id>` as a subprocess through `proc_open`
and prints its output in the same terminal, so you see everything at once.
If `proc_open` or the `wp` path cannot be found, it says so and the
follow-up runs on the next cron tick instead.

### 2.5 Ragusa's own updates

Installing a new Ragusa zip (`wp plugin install "Ragusa 0.2.0.zip" --force`
or the Plugins screen):

1. `upgrader_pre_install` fires in the **old** code: Revelin seals the old
   version as `self/<old version>.zip`.
2. Files are replaced. `upgrader_process_complete` fires, still in the old
   code: it writes a journal row "Ragusa updated to <new version>, checks
   pending" and schedules a single event 2 minutes out. It does **not** run
   checks on itself.
3. The event runs under the **new** code: full smoke checks plus a self-test
   (its tables, the vault lock, the manifest HMAC, one `php -l` of its own
   main file). On pass, it re-baselines its own files and seals itself.
4. On fail, it alerts "Ragusa Update Needs A Look" and marks itself Needs A
   Look. It never rolls itself back. You can: `wp ragusa restore <id>` (the
   sealed previous version; the swap is the same directory rename, which is
   safe while the old files are already loaded in that process), or install
   the previous zip.

A2 is suspended for `plugins/dcc-ragusa/` from step 1 until step 3 passes,
so an in-flight install is never "restored".

### 2.6 Bokar's method, and why it is a snapshot

Bokar does not hook `user_register` or `set_user_role` on every request:
MotoPress registers guests on the front end at checkout, and the rule is no
hooks outside wp-admin, cron, login and the upgrader. Instead each tick
(≤ 0.2 s) it reads administrators and editors, each one's
`_application_passwords` count, `users_can_register` and `default_role`,
and compares with the stored baseline. Detection delay is therefore up to
one tick (10 minutes). The one live hook is `wp_login`, registered only when
`$pagenow` is `wp-login.php`, which records an administrator's login with
the salted IP hash and raises "first sight of a new IP" on the next tick.

---

## 3. Settings schema and boot validation

Rob's rule: site choices live in the plugin. There are four fields.

```
Option dcc_ragusa_settings            autoload = yes   (the one small row, ≤ 600 bytes)
{
  "schema":              1,
  "alert_email":         "",          // empty = get_option('admin_email'); validated with is_email()
  "delete_on_uninstall": false,
  "has_heartbeat":       false,       // display only; the URL itself is elsewhere
  "has_feed_key":        false
}

Option dcc_ragusa_secrets             autoload = no
  sodium_crypto_secretbox( json{ "heartbeat_url", "feed_key" }, nonce, vault key )
  base64, with the nonce prefixed. openssl AES-256-GCM if sodium is missing.
  Plain text, with an amber notice, only if both are missing (not the case on live).
```

Why the vault key and not `AUTH_KEY`: rotating the salts is on the standing
advice list, and a rotation would silently kill the heartbeat if it keyed
the ciphertext. The vault key lives outside the web root and survives it.

**Validation.** `Settings::load()` runs on the admin page, in cron, on
login and in the upgrader, never on the front end. It normalises every
field: unknown keys dropped, `schema` other than 1 or a non-array value →
defaults; `alert_email` failing `is_email()` → admin email; `heartbeat_url`
must be `https://hc-ping.com/<uuid>` or `https://hc-ping.com/<ping key>/<slug>`
(a self-hosted Healthchecks base is accepted if it is https and resolves);
`feed_key` must be 16–128 printable ASCII characters. Anything invalid is
replaced by the safe default, the page shows one amber notice naming the
field, and nothing is ever fatal. The secrets blob failing to decrypt is
"heartbeat URL needs re-pasting", not an error.

**On screen** both secrets are masked (`https://hc-ping.com/••••••••-••••…c2f1`)
with a Replace button. They never appear in an event, an email, a log line
or WP-CLI output; `wp ragusa status` prints "heartbeat: set, last ping 4
minutes ago".

---

## 4. Storage, cron cadence, work per tick, front-end cost

### 4.1 Storage budget

| Store | Where | Bound | Expected |
| --- | --- | --- | --- |
| Vault | `~/ragusa-vault/<site id>/` | **300 MB hard**, counted from a `ledger.json` of every file Revelin wrote, re-measured weekly with a walk | 100–250 MB once a few pre-update copies exist |
| · sealed guards + `.htaccess` block + Ragusa self | `guards/`, `self/` | never evicted; < 2 MB | — |
| · previous plugin versions | `plugins/<slug>/<version>.zip` | one per slug; oldest-first eviction | Jetpack ≈ 20–30 MB zipped, Elementor ≈ 15 MB, most others < 5 MB |
| · quarantine | `quarantine/<journal id>/` | 90 days, then oldest-first; counts toward the cap | small |
| · checksum sets | `checksums/<slug>-<version>.json` | replaced when the version changes | ≈ 150 kB per plugin |
| · file index | `index/<root>.jsonl` (path, size, mtime, sha256) | rewritten per full pass | ≈ 4–5 MB for ~28,000 files |
| · feed | `feed/last-good.json` (reduced to installed slugs) | one file; the raw download is deleted after reduction | < 200 kB |
| · key, lock, witness | `.key` (0600), `.lock`, `witness.txt` | bytes | — |
| Events | `{prefix}dcc_ragusa_events` | ring of 2,000 rows, trimmed on insert | ≈ 1 MB |
| Journal | `{prefix}dcc_ragusa_journal` | ring of 500 rows, terminal rows only are trimmed | < 1 MB |
| Options | `dcc_ragusa_settings` (autoload yes), `_secrets`, `_cursors`, `_alerts` (≤ 200 fingerprints), `_baselines` (users, options, modules), `_db_version` — all autoload no except the first | each ≤ 20 kB | — |
| Transients | none | — | — |

Site id: `<role>-<first 8 hex of sha256(ABSPATH . '|' . $table_prefix . '|' . home_url())>`, where role is `live` when the prefix is `portal_` and the host is `doracanalcourt.com` with an empty path, `staging` when the prefix is `wpstg0_` or the path starts with `/staging/`, else `other`. Decided on every run from those three facts, never from a stored flag. Staging gets `~/ragusa-vault/staging-…/` and cannot name the live folder.

Finding `~`: `getenv('HOME')`, else `posix_getpwuid(posix_geteuid())['dir']`,
else walk up from `ABSPATH` to the parent of `public_html`. If none works or
the folder is not writable, the vault falls back to
`wp-content/uploads/ragusa-vault/` with a deny-all `.htaccess` and
`index.php`, and the card says "Vault Is Inside The Web Root".

**Disk pressure rule (needs your yes).** Above 95% of the 10 GB quota,
Revelin stops sealing new pre-update copies (a full disk breaks bookings,
which is worse than a missing rollback copy), says so on the card, and the
alert for that update says it has no rollback copy. Below 95% it seals as
normal within the 300 MB cap.

### 4.2 Cron

One event, `dcc_ragusa_tick`, on a custom 10-minute schedule, plus
single events that Sveti Ivan schedules for its follow-ups. A tick takes an
atomic lock (`flock` on `<vault>/.lock`; fallback `add_option`
`dcc_ragusa_lock`, which fails on a duplicate). Stale lock: the holder
writes its progress time into the lock every chunk; a lock is stale when
`now − progress > 10 min`, or `progress − now > 1 h` (the clock jumped
backwards), and is then taken over and journaled.

Budget: **5 seconds** of work per tick measured with `hrtime()`, work
ordered by urgency, each item resumable from a cursor in
`dcc_ragusa_cursors`:

| Order | Work | Cadence | Cost per tick |
| --- | --- | --- | --- |
| 1 | Finish or reverse unfinished journal rows | every tick | ~0 |
| 2 | Sveti Ivan follow-ups and repeats that are due | when scheduled | up to the full budget (loopbacks are I/O wait, 10 s timeout each, so a follow-up may take a tick of its own) |
| 3 | Bokar snapshot diff | every tick | ≤ 0.2 s, 2 queries |
| 4 | Critical options + Jetpack modules + `.htaccess` DCC block + `wp-config.php` hash + drop-ins and `.user.ini` | every tick | ≤ 0.1 s |
| 5 | Minčeta walk (stat compare; hash only size/mtime changes; uploads executable rule) | continuous, chunked; a full pass should complete in 1–3 ticks | remaining budget up to ~3.5 s |
| 6 | Minčeta full rehash | weekly, Sunday from 03:00 ET, chunked | remaining budget |
| 7 | Disk quota | hourly (`quota`), or a weekly chunked walk if `quota` is missing | ≤ 0.3 s / chunk |
| 8 | Lovrijenac: wordpress.org closed-plugin check | weekly, 20 plugins per tick | ≤ 2 s |
| 9 | Lovrijenac: feed fetch and reduce | daily at 03:40 ET, its own tick, budget 25 s | once a day |
| 10 | Heartbeat | end of every tick: success ping if no fortress is Breached and the tick finished; `/fail` with a one-line reason otherwise | one HEAD request, 5 s timeout |

The witness: every success ping is a POST whose body (≤ 1 kB) carries the
manifest HMAC, the vault size and the counts. healthchecks.io stores the
last pings' bodies, which gives you an off-site record of the manifest
fingerprint that nobody with the account's shell can rewrite.

**Period and grace for Rob.** WP-Cron only runs when WordPress itself is
loaded, and SpeedyCache serves cached pages before that, so a quiet hour
with only cached hits sends no ping. Dynamic requests still spawn cron: the
OTAs pulling the eight iCal export URLs, Jetpack Monitor only if it reaches
WordPress, any admin visit. I could not measure how often the OTAs pull.

- With WP-Cron only: **Period 1 hour, Grace 7 hours.** Rob is paged after
  about 8 hours of silence, which a quiet night will not reach, and a dead
  site is reported by breakfast.
- With a system cron line: **Period 1 hour, Grace 1 hour.**

**System cron: I recommend one line, and it does not switch WordPress to
system cron.** Leave `DISABLE_WP_CRON` alone, so every other plugin is
unaffected, and add in cPanel:

```
*/10 * * * * /usr/bin/curl -s -o /dev/null "https://doracanalcourt.com/wp-cron.php?doing_wp_cron" >/dev/null 2>&1
```

This only guarantees that cron is kicked every 10 minutes when nobody
visits. WordPress still runs it the same way, under the same lock. Weigh it
with Rob; Ragusa works either way, with the grace time above.

### 4.3 Front-end cost: zero, and how it is proved

`dcc-ragusa.php` is the only file WordPress loads on a front-end request.
It defines three constants and returns at once unless one of these is true:
`is_admin()`, `wp_doing_cron()`, `WP_CLI`, or `$GLOBALS['pagenow'] ===
'wp-login.php'`. The upgrader only ever runs inside one of those. Nothing is
enqueued, no hook is added, no option is read beyond the one autoloaded row
that WordPress fetches in its single `alloptions` query anyway.

Proof on staging, in the checklist: with Query Monitor, load the home page
and a cottage page with Ragusa deactivated and activated, and compare the
database query count, the included-files count (one more: `dcc-ragusa.php`)
and the enqueued assets (no change). The checklist records both numbers.

---

## 5. Vulnerability feed: recommendation and licence

**Primary: Wordfence Intelligence Vulnerability Data Feed v3, scanner
variant.** Free, no cost tier, and Wordfence's help page describes it as
available "for personal and commercial use". It needs an API key from a
free wordfence.com account, which Rob creates and pastes into Ragusa. One
GET a day: `https://www.wordfence.com/api/intelligence/v3/vulnerabilities/scanner`
with `Authorization: Bearer <key>` (wordfence-cli prefixes its own licence
keys with `cli-`; the plain key form is what the docs describe for API
keys, and the staging checklist tests it with one `curl`). The record
schema is verified above.

Licence obligations Ragusa meets:

- **MITRE attribution.** Each record carries `copyrights`; the card and the
  alert print that record's notice under the finding ("Vulnerability data
  provided by Wordfence Intelligence · CVE record © MITRE, CC BY 4.0", or
  whatever the record says). The feed is never redistributed; only the
  reduced set for this site's slugs is kept, and only on this server.
- **Key confidentiality.** Stored encrypted, masked, never logged.
- **Please read the terms page once** (wordfence.com/wordfence-intelligence-terms-and-conditions)
  before the key is made; I could not open it from here.

Size and safety: the production feed was over 117 MB in October 2025, far
too big. The scanner feed is the reduced one. I could not measure it. Once
Rob has the key, one command tells us:

```
curl -sS -o /dev/null -w '%{http_code} %{size_download} bytes\n' \
  -H "Authorization: Bearer $KEY" https://www.wordfence.com/api/intelligence/v3/vulnerabilities/scanner
```

The fetch streams to `<vault>/feed/download.tmp` with `limit_response_size`
64 MB, 10 s connect timeout, 25 s total, TLS verified. Before decoding, the
raw text is searched for each installed slug as `"slug":"<slug>"`; if none
appears, there is nothing to decode. Otherwise it is decoded only if
`filesize × 6` fits in the memory left under `memory_limit` (512 MB on
live). The decoded set is reduced to records whose `software[].slug` is
installed, with their copyrights, and written as `last-good.json`. A payload
is rejected, keeping the last good copy, if: the HTTP status is not 200;
the body is under 25% of the last good raw size; it is not a JSON object;
any byte is a control character other than tab, LF and CR; or no record has
the four fields `id`, `title`, `software`, `references`. Parsing is by field
name, tolerant of extra fields, so a schema bump degrades to "feed format
changed, keeping last good copy" rather than a fatal.

If the scanner feed turns out to exceed 64 MB or the memory guard,
Lovrijenac says "Feed Too Large For This Host" on the card and runs on the
fallback only.

**Fallback (always on, no key, no licence issue): wordpress.org's own
signals.** `api.wordpress.org/plugins/info/1.2/` per installed wordpress.org
slug, weekly: a plugin that returns the closed error (with its reason), one
not updated in 2 years, or one whose "tested up to" is two majors behind,
is a Needs A Look finding. Core: `get_core_updates()` says whether 7.1.3 is
behind a security release. PHP: a baked end-of-life table (8.1 ended
2025-12-31; 8.2 ends 2026-12-31; 8.3 ends 2027-12-31; 8.4 ends 2028-12-31),
shown with its own "table written 2026-10-21" note, and flagged stale after
a year so the fortress never pretends to know what it has not been told.

**Rejected.** WPScan: the free tier is non-commercial only and the site is
a business. Patchstack Standard API: key by application with a use-case
review, documented as not for commercial use, and per-slug (34 requests a
day of a 500 budget would work, but the terms do not).

**Update Now.** The finding's button posts (nonce, `manage_options`) to
Ragusa, which calls core's `Plugin_Upgrader` for that one slug. That update
goes through Revelin's seal and Sveti Ivan's checks like any other.
Lovrijenac never installs anything from a feed and never follows a link in
one.

---

## 6. What "block attacks" means for Ragusa

**Ragusa blocks nothing at the request layer.** Jetpack WAF already runs
before WordPress on every request from `jetpack-waf/bootstrap.php`, Jetpack
Protect handles brute force, and the four DCC guard mu-plugins close the
enumeration, post-password and iCal holes. A second blocker would mean a
hook on every front-end request, which breaks the zero-weight rule, and two
firewalls with different rules are exactly how a guest's booking gets
blocked by one and allowed by the other.

So Rob's "block attacks" is met by **keeping the blockers standing**:

- Minčeta checks every tick that Jetpack's `waf`, `protect` and `monitor`
  modules are active, that `jetpack_waf_mode` is still `normal`, and that
  `jetpack-waf/rules/rules.php` is not the empty `<?php` that Jetpack writes
  when the firewall is switched off. Any of those → Breached alert within
  10 minutes. Ragusa never edits Jetpack's files, mode or IP lists.
- Revelin restores the four guard mu-plugins and the `.htaccess` block
  (A2, A3).
- Minčeta watches `.user.ini`, `php.ini`, `db.php` and the root
  `index.php`, the places a bypass of the WAF is planted.
- Quarantine (A1) removes a planted shell, which is the one thing the WAF
  cannot do after the fact.
- `xmlrpc.php` is not touched (Jetpack needs it), and Bokar records logins,
  it does not throttle them.

If you ever want Ragusa to hold a list of blocked IPs, the right place is
Jetpack's own `jetpack_waf_ip_block_list`, so there is one gate. I do not
recommend building it now.

---

## 7. Admin page wireframes and a sample email

Under the existing **DCC** menu (parent slug `dcc`), page slug `dcc-ragusa`,
title "Ragusa". Same tokens as the Ledger (`.dccr` with the `.dccl` values),
tiles become cards, chips carry status, buttons are WordPress `.button`
with a 44px minimum height on touch.

### 390px (iPhone)

```
┌──────────────────────────────────────┐
│ Ragusa                               │
│ The Walls Are Holding ·              │
│ Last Full Check 2 Hours Ago          │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ✓ HOLDING                        │ │  ← word + icon, 3px green top border
│ │ Minčeta                          │ │
│ │ Watches The Files                │ │
│ │ All 28,412 Files Match           │ │
│ │ Checked 12 Minutes Ago           │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ✓ HOLDING                        │ │
│ │ Bokar · Guards The Login         │ │
│ │ 2 Administrators, No Changes     │ │
│ │ Checked 12 Minutes Ago           │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ✓ HOLDING                        │ │
│ │ Revelin · Keeps The Sealed Copies│ │
│ │ 9 Copies, 184 MB Of 300 MB       │ │
│ │ Checked 12 Minutes Ago           │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ! NEEDS A LOOK                   │ │  ← amber top border
│ │ Lovrijenac · Reads The Warnings  │ │
│ │ 1 Plugin Has A Known Weakness    │ │
│ │ Feed Read 6 Hours Ago            │ │
│ │ [ Update Essential Addons Now ]  │ │  ← 44px button
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ✓ HOLDING                        │ │
│ │ Sveti Ivan · Checks Every Update │ │
│ │ Last Update Passed All 4 Checks  │ │
│ │ Checked Yesterday At 4:10 PM     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Recent Events                        │
│ ┌──────────────────────────────────┐ │
│ │ 3:12 AM Today · Minčeta          │ │
│ │ Guarded File Restored            │ │
│ │ dcc-postpass-guard.php put back  │ │
│ │ from its sealed copy.            │ │
│ │ Can Be Undone   [ Undo ]         │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Yesterday 4:08 PM · Sveti Ivan   │ │
│ │ Update Checked: Jetpack 15.4     │ │
│ │ 5 pages, no fatal, 8 iCal feeds. │ │
│ │ Nothing To Undo                  │ │
│ └──────────────────────────────────┘ │
│ … (20, then "Show Older")            │
│                                      │
│ Standing Advice                      │
│ • The /staff/ password is weak.      │
│ • The salts have not been rotated.   │
│ • There is no two-factor login.      │
│ • 3 leftover cron hooks from removed │
│   plugins (housekeeping).            │
│                                      │
│ Settings                             │
│ Alert Email      [rob@doracanal…   ] │
│ Heartbeat URL    https://hc-ping.…   │
│                  [ Replace ]         │
│ Feed Key         ••••••••••••  [Replace]│
│ [ ] Delete Ragusa's data when the    │
│     plugin is deleted                │
│ [ Save ]                             │
└──────────────────────────────────────┘
```

Tapping a card opens its detail below the cards (same page, `<details>`,
no JavaScript needed): the full list of findings for that fortress, each
with a Seal (Minčeta/Revelin findings) or Restore (journal rows) button.
Both buttons go to a confirmation screen that says in one sentence what
will change ("Seal will accept the current dcc-postpass-guard.php, 2,114
bytes, changed 3:02 AM today, as the good copy. Ragusa will restore to this
version from now on.") with a Confirm button and a Cancel link. Every form
carries a nonce and `manage_options`.

### 1280px (desktop)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Ragusa                                                                     │
│ The Walls Are Holding · Last Full Check 2 Hours Ago                        │
│                                                                            │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│ │ ✓ HOLDING            │ │ ✓ HOLDING            │ │ ✓ HOLDING            │ │
│ │ Minčeta              │ │ Bokar                │ │ Revelin              │ │
│ │ Watches The Files    │ │ Guards The Login     │ │ Keeps The Sealed Cop.│ │
│ │ All 28,412 Files     │ │ 2 Administrators,    │ │ 9 Copies, 184 MB Of  │ │
│ │ Match                │ │ No Changes           │ │ 300 MB               │ │
│ │ Checked 12 Min. Ago  │ │ Checked 12 Min. Ago  │ │ Checked 12 Min. Ago  │ │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
│ ┌──────────────────────┐ ┌──────────────────────┐                          │
│ │ ! NEEDS A LOOK       │ │ ✓ HOLDING            │                          │
│ │ Lovrijenac           │ │ Sveti Ivan           │                          │
│ │ Reads The Warnings   │ │ Checks Every Update  │                          │
│ │ 1 Plugin Has A Known │ │ Last Update Passed   │                          │
│ │ Weakness             │ │ All 4 Checks         │                          │
│ │ Feed Read 6 Hrs Ago  │ │ Yesterday 4:10 PM    │                          │
│ │ [Update Ess. Addons] │ │                      │                          │
│ └──────────────────────┘ └──────────────────────┘                          │
│                                                                            │
│ Recent Events                                                              │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ WHEN            FORTRESS    WHAT                      UNDO             │ │
│ │ 3:12 AM today   Minčeta     Guarded File Restored     [ Undo ]         │ │
│ │ Yesterday 4:08  Sveti Ivan  Update Checked: Jetpack   Nothing To Undo  │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ Standing Advice                      Settings                              │
│ • …                                  Alert Email  [ … ]                    │
│                                      Heartbeat URL  https://hc-ping.… [Replace]│
└────────────────────────────────────────────────────────────────────────────┘
```

Grid: `repeat(auto-fit, minmax(300px, 1fr))` gives one column at 390, two
at ~700, three at 1024 and up. Status is a word in uppercase small caps
beside an icon (✓ Holding, ! Needs A Look, ✕ Breached) and the card's top
border colour; never colour alone. Times are relative in America/New_York
with the absolute time in a `title`. Coral `#F08080` on hover only inside
`@media (hover: hover) and (pointer: fine)`. `overflow-x: hidden` on the
wrap at ≤ 782px, tested at 360px.

### Sample email

```
Subject: Ragusa · Minčeta · Guarded File Restored

At 3:12 AM on Tuesday, October 21, the file dcc-postpass-guard.php in
mu-plugins no longer matched its sealed copy.

Ragusa put the sealed copy back, checked that the site still loads, and
kept the changed file in quarantine as journal entry 142.

If you or the site director changed this file on purpose, run
wp ragusa seal mu-plugins/dcc-postpass-guard.php, or open Ragusa and tap
Seal. Otherwise, nothing to do.

Ragusa: https://doracanalcourt.com/wp-admin/admin.php?page=dcc-ragusa
```

Plain text, `wp_mail`, subject UTF-8. WordPress sets PHPMailer's charset to
UTF-8 so the subject is sent RFC 2047 encoded and "Minčeta" survives; the
staging checklist includes `wp ragusa mail test` (an explicit command, the
one way staging sends an email) so Rob confirms the č on his iPhone before
live. No nonce in the link, no guest data, three sentences in the order
what happened, what Ragusa did, what Rob should do.

Alert-storm control: a finding's fingerprint is `sha1(fortress|kind|target)`;
one email per fingerprint per 24 h; severity `low` goes into a single daily
digest at 7:40 AM ET ("Ragusa · Daily · 3 Small Things"); when a
fingerprint is absent from a full check after it was emailed, one "All
Clear" email ("Ragusa · Minčeta · All Clear: dcc-postpass-guard.php"). The
`/fail` ping carries the same subject line as its body, so Rob gets the
reason even if `wp_mail` is what broke.

Severity: **Breached** (A1–A4 happened, a core or drop-in file changed, a
new administrator, a module off, an update rolled back) → immediate email
and `/fail` on the next ping; **Needs A Look** (vulnerable plugin, option
changed, closed plugin, disk over 90%, loopbacks unavailable, no rollback
copy) → immediate email, success ping continues; **Info** (expected churn,
benign stub, housekeeping) → digest only.

---

## 8. Where I disagree, and what does not translate to PHP

1. **"Block attacks" is already done by Jetpack.** Section 6. I am
   recommending Ragusa block nothing and guard the blockers. If Rob reads
   his decision as "Ragusa must itself block something", I would want to
   hear what, because every candidate I can think of either fights the WAF
   or costs every guest a hook.
2. **Core is alert-only, including a modified core file.** The brief says
   so for updates; I am extending it to integrity. Restoring core from
   wordpress.org is a download, not a sealed copy, and moving a core file to
   quarantine takes the site down. You restore with two WP-CLI commands,
   which the alert prints.
3. **Signals and monotonic clocks do not exist across PHP requests.** A tick
   is one request; it budgets itself with `hrtime()`, writes progress into
   the lock, and the next tick decides staleness from that progress, with
   a guard for a clock that goes backwards. "Trap SIGTERM and clean up"
   becomes "write ahead, and let the next run finish or reverse" (2.2).
4. **No staging clone per patch.** Not possible on shared hosting in a cron
   tick, and the replacement is honest: smoke checks that test the money
   path, a sealed copy to return to, and a rule that one failure is never
   enough.
5. **Bokar is a 10-minute snapshot, not a live hook** (2.6), to keep the
   front end at zero. A rogue administrator created at 3:00 is reported by
   3:10. I think that trade is right; say if you want the live hook on
   admin-side requests only (it would still miss REST and front-end
   creations).
6. **The HMAC key is honest about its limits.** It lives at
   `~/ragusa-vault/<site>/.key`, 0600, 32 random bytes, outside the web
   root. It protects the manifest against corruption, half-written files,
   a staging/live mix-up, and anyone whose access stops at WordPress
   (a compromised admin, a plugin's upload hole, the theme editor, which is
   disabled anyway). It does **not** protect against code running as the
   account user, which can read the key, or against SSH or cPanel access.
   On shared hosting there is no place the account user cannot read. Two
   mitigations are in the design: the witness line in every heartbeat ping
   (an off-site copy of the manifest fingerprint, section 4.2), and the
   option for you to define `DCC_RAGUSA_VAULT_KEY` in `wp-config.php`
   yourself, which Ragusa prefers over the file (it never writes
   `wp-config.php`). That moves the key to a file the WAF-bypass places do
   not reach, but it is still readable by the account user.
7. **The mutation run.** For a PHP plugin this is what the Ledger does: a
   script that applies deliberate breakages (skip the repeat check, skip
   `php -l`, evict a sealed guard, drop the HMAC check, send a secret to
   the log) and proves the test suite catches each one.
8. **Rollback copies will not always fit, and it is better to say so than
   to stretch the cap.** Jetpack and Elementor together can be 40 MB or
   more zipped. Within 300 MB most sets fit; when one does not, the update
   proceeds, the card and the alert say "no rollback copy", and core's own
   fatal rollback still applies to auto-updates. I am not asking to raise
   the cap.
9. **Disk pressure rule at 95%** (4.1) is my addition; it needs your yes.
10. **Secrets keyed to the vault key, not the salts** (3), because salt
    rotation is on the advice list.

### A sentinel, and the names for Rob

I do recommend a small must-use sentinel, and I recommend it modestly. The
dead man's switch already covers a silent deactivation: no Ragusa, no
ping, Rob is paged after period + grace. The sentinel shortens that to
about 10 minutes and names the cause. It is one file in `mu-plugins/`,
under 100 lines, zero front-end cost (same early return), and it does only
this: on admin, cron and login requests, if `plugins/dcc-ragusa/` is
missing or inactive for more than 10 minutes, send one email a day
("Ragusa Is Not Standing") and one `/fail` ping, reading the same
encrypted secret with the same vault key. Ragusa seals the sentinel like
the other guards; the sentinel checks Ragusa. Neither can be deleted
silently by someone who only has the Plugins screen, and `DISALLOW_FILE_EDIT`
is already on.

It needs a Croatian name, and Rob chooses. Real places on or by the walls
that are not already taken, with why each fits:

- **Zvonik** · the city bell tower on Luža square, whose bell was rung by
  the two bronze soldiers, the Zelenci, to call the city. The sentinel's
  only job is to ring.
- **Orlando** · Orlandov stup, the column of freedom in front of the church
  of St Blaise. Not a fortress, which is honest: it defends nothing, it
  stands for the fact that the Republic still stands.
- **Sveti Luka** · Kula Svetog Luke, the oldest tower, by the Ploče gate,
  from 1467. A small old tower that has watched the harbour side longest.
- **Pile** · Vrata od Pila, the main gate, whose drawbridge was raised
  every night. The sentinel is the watchman who checks the bridge is up.

If Rob picks one, the file is `dcc-ragusa-<slug>.php` and the card on the
page reads "<Name> · Rings If Ragusa Falls".

---

## 9. The pieces, for the record

### Files

```
dcc-ragusa/
├── dcc-ragusa.php                 # headers, constants, early return, lazy autoloader
├── readme.txt
├── uninstall.php                  # keeps data unless delete_on_uninstall
├── includes/
│   ├── class-plugin.php           # boots only in admin / cron / login / CLI
│   ├── class-site.php             # live / staging / other, site id, paths
│   ├── class-settings.php         # schema, validation, secrets
│   ├── class-vault.php            # folder, key, manifest + HMAC, cap, eviction, lock
│   ├── class-journal.php          # the state machine, write-ahead rows, recovery
│   ├── class-events.php           # ring buffer, fingerprints, severities
│   ├── class-alerts.php           # storm control, digest, all-clear, wp_mail
│   ├── class-heartbeat.php        # success / fail pings, witness
│   ├── class-cron.php             # the tick, budget, work order, cursors
│   ├── class-loopback.php         # feature test, cache-busting GETs
│   ├── fortresses/
│   │   ├── class-minceta.php      # walks, checksums, baselines, options, disk, uploads rule
│   │   ├── class-bokar.php        # user snapshot diff, login record, IP hashing
│   │   ├── class-revelin.php      # seals, pre-update copies, quarantine, restores (A2, A3)
│   │   ├── class-lovrijenac.php   # feed fetch/reduce, wordpress.org signals, PHP table
│   │   └── class-sveti-ivan.php   # upgrader hooks, smoke checks, repeat rule, rollback (A4)
│   ├── actions/                   # one class per autonomous action A1–A4 (plan, before, act, verify, reverse)
│   ├── class-admin.php            # the page, confirmations, nonces
│   ├── class-cli.php              # wp ragusa …
│   └── views/                     # page.php, card.php, events.php, confirm.php, settings.php
├── assets/css/admin.css           # .dccr tokens copied from the Ledger
├── docs/
│   ├── Ragusa - DESIGN.md         # this file
│   ├── Ragusa - STAGING-CHECKLIST.md
│   └── Ragusa - ROLLBACK.md
└── tests/                         # bootstrap stubs, SQLite wpdb like the Ledger, fixtures, mutations, layout check
```

### WP-CLI

```
wp ragusa status                      one line per fortress, the top sentence, heartbeat state (masked)
wp ragusa scan [--full]               run a Minčeta pass now, chunked until done, printing progress
wp ragusa seal <path>                 accept a guarded file's current content; rewrites the manifest
wp ragusa vault list                  every sealed item with id, kind, size, sealed_at
wp ragusa restore <id>                reverse a journal row, or put a sealed/quarantined item back
wp ragusa heartbeat test              one success ping, prints the HTTP status (allowed on staging; explicit)
wp ragusa mail test                   one email to the alert address (allowed on staging; explicit)
wp ragusa journal [--state=…]         the state machine rows, newest first
wp ragusa check --after=<id>          the post-update checks for a journal row (what the CLI subprocess runs)
wp ragusa drill <action>              staging only: quarantine | restore-guard | htaccess | rollback
```

`drill` stages a harmless case, runs the real action and its reverse, and
prints each state transition: `quarantine` drops `uploads/ragusa-drill/evil.php`
(content `<?php echo 1;`); `restore-guard` appends a comment to a copy of
`dcc-ical-privacy.php` placed as the guarded file and expects it put back,
then reseals; `htaccess` alters one byte inside the DCC block;
`rollback` installs a two-line test plugin `ragusa-drill-plugin` at 1.0.0,
seals it, "updates" it to a 1.0.1 whose main file breaks the home-page
marker by dying on `?ragusa_check`, and expects the repeat-then-rollback
sequence, then removes the test plugin. On live, `drill` refuses with the
reason.

### Uninstall

`uninstall.php` reads `dcc_ragusa_settings` directly. If
`delete_on_uninstall` is false (the default) it does nothing. If true it
drops the two tables, deletes the five options, and removes
`~/ragusa-vault/<this site id>/` only, never another site's folder and never
`~/mu-backups/`.

---

## 10. What I need from you before building

1. A yes or changes on sections 2 (criteria and matrix), 4.1 (the 95% disk
   rule), 4.2 (system cron line, period and grace), 6 and 8.
2. MotoPress's iCal export entry point (class and method) or your okay for
   the loopback fallback.
3. The `error_log` path and how `dcc-error-log-health` rotates it.
4. The five pages' marker strings, or the HTML to pick them from.
5. Confirmation that the DCC `.htaccess` block sits at the top of the file.
6. Rob's choice of sentinel name, if he wants one.
7. The Wordfence terms page read on your side.

Then I build 0.1.0: synthetic fixtures only, a test for every rollback path
including dying at each state and resuming, a transient failure that must
not roll back, the mutation run, screenshots at 390 and 1280, and the
staging checklist and rollback note under `docs/` with the `Ragusa - `
names.

---

## 11. Decisions of 2026-10-21 (the Director's answers, checked on live)

Approved as written: sections 2 (with the A1 correction now in place), 4.1,
4.2, 6 and all ten points of section 8.

**The 10-minute knock is installed**, without touching `DISABLE_WP_CRON`:

```
*/10 * * * * /usr/bin/curl -s -o /dev/null --max-time 60 "https://doracanalcourt.com/wp-cron.php?doing_wp_cron" >/dev/null 2>&1
```

So the healthchecks.io settings for Rob are **Period 1 hour, Grace 1 hour**.

**The sentinel is Zelenci**, the two bronze bell-ringers who strike the
hours on the City Bell Tower. File `mu-plugins/dcc-ragusa-zelenci.php`,
card "Zelenci · Rings If Ragusa Falls". It is installed with
`wp ragusa zelenci install` (or copied by hand from `dcc-ragusa/mu/`), and
sealed like the other guards.

**A forced install over an existing slug is an update.**
`wp plugin install <zip> --force` is how every DCC release goes on. Revelin
seals the existing folder from `upgrader_source_selection` (which fires
after the package is unpacked and before the old folder is cleared, so the
slug is known for both routes), and A4 applies to it. Only a brand-new slug
is an "install".

**mu-plugins rules.**

- HostGator's and WP Staging's own files (`endurance-page-cache.php`,
  `sso.php`, `wp-staging-optimizer.php`) change as info.
- A new, unknown file in `mu-plugins/` is Breached: alert, never quarantine.
- A change to a `dcc-*` mu-plugin outside the guard set is Needs A Look,
  with the seal command in the email.

**Threat model corrections.** MCP Adapter is no longer installed and of the
AI stack only Angie is active. The plaintext keys are still in options:
`connectors_ai_openai_api_key`, `connectors_ai_anthropic_api_key`,
`connectors_ai_google_api_key` and `dccgg_gemini_key`. The standing advice
names them by option only, never by value.

**Housekeeping, info only, never acted on:**
`uploads/wp-file-manager-pro/fm_backup/` is an empty leftover with a
malformed `.htaccess` (`<FilesMatch>` closed by `</Files>`, so the folder
answers 500), and the leftover log folders of removed plugins (`wc-logs`,
`woocommerce_*`, `evf-logs`, `astra-sites`, `wpsc`).

**MotoPress iCal, in-process.** `( new \MPHB\iCal\Exporter() )->export( $room_id )`
echoes the `.ics` and calls `header()`; capture with `ob_start()`, swallow
only the "headers already sent" and "Cannot modify header" warnings with a
scoped `set_error_handler`, and require at least one `BEGIN:VEVENT` per
room (1066, 1068, 1070, 1072, 1613, 1614, 1806, 1807). No loopback. This is
what the live Sync Watchdog does and it has run for weeks.

**error_log.** `ABSPATH . 'error_log'` (about 580 kB today); the health
mu-plugin also watches `dirname(ABSPATH)/error_log` and
`WP_CONTENT_DIR/debug.log`. It rotates daily by `rename()` then
`file_put_contents($path, '')`, so the inode changes and the size drops,
and both rotation tests apply. Ragusa reads all three paths.

**Markers, verified in live HTML, logged out:**

| Page | Markers (all must be present) |
| --- | --- |
| `/` | `<title>Dora Canal Court` |
| `/accommodation/cottage-34/` | `name="mphbac_sheet_checkin"` and `id="mphb-js"` |
| `/contact/` | `dcc-contact-form` |
| `/submit-booking/` | `mphb_sc_checkout-wrapper` |
| `/explore/` | `data-dccwl-viewtrigger` |

Three of these belong to DCC plugins the Director updates, so a release
that renamed one would make Sveti Ivan roll back his own install. The CLI
output and the alert name the missing marker, and `wp ragusa markers`
lists them, `wp ragusa markers set <path> <marker>[,<marker>]` changes one
when a rename is intentional, and `wp ragusa markers reset` restores the
baked defaults.

**The DCC Security block is at line 1 of `.htaccess`.** A3 writes it there
when the markers are missing.

**Wordfence terms, read by the Director (version of 26 January 2026):**
"Wordfence Intelligence is offered at no fee"; the licence is perpetual,
worldwide, royalty-free and non-exclusive, including reproduce and
distribute provided the copyright designation is reproduced; the key is
confidential; they may rate-limit, throttle or revoke; there is no
non-commercial restriction. Wordfence v3 scanner is the primary feed, the
wordpress.org signals are the fallback, and each record's MITRE copyright
notice is shown on the card and in the alert. Rob creates the account and
the key himself after install.

**Added to the mutation run:** "an existing uploads `.htaccess` gets
quarantined" must be caught by the tests.

**0.1.1 (after the first staging run, 2026-10-21).** Four blockers found on
staging and fixed: the 10-minute schedule is registered at file load (an
activation hook runs after `plugins_loaded`, so a filter added in `boot()`
did not exist yet and the tick was never scheduled; it now also self-heals
on every watched boot, and Zelenci rings if Ragusa is active but silent for
three hours); the first complete pass is the baseline however many ticks it
takes (0.1.0 treated only the first chunk as such and flagged every later
file as new; an upgrade withdraws those findings quietly); the quota is read
for the filesystem that holds the home directory, found with `df -P ~`, or
the fullest one with a note; Bokar reads roles from the capabilities meta
with a fallback for a clone whose meta keys kept the old prefix. Also: a
staging login page answering instead of a page is "not checked", never a
failure, and the rollback drill uses its own probe answered on
`plugins_loaded` before any gate; the headline leads with "Something Needs A
Look"; `wp ragusa proof` measures the front end in a fresh PHP process with
and without Ragusa.
