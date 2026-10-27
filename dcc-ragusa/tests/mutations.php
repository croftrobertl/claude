<?php
/**
 * The mutation run: break each guarantee on purpose, and check a test
 * catches it.
 *
 *     php tests/mutations.php
 *
 * Each mutation is applied to a throwaway copy of the plugin and the whole
 * suite runs against the copy. A mutation the suite still passes is a hole
 * in the tests, and is reported as a failure of this run.
 */

declare(strict_types=1);

$plugin = dirname(__DIR__);
$work   = sys_get_temp_dir() . '/dccr-mutations';
$only   = $argv[1] ?? ''; // php tests/mutations.php 0.2.1   runs only the mutations whose name contains it

$mutations = [
    [
        'name' => 'An existing uploads .htaccess gets quarantined (presence judged, not meaning)',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "\$dangerous = \$base === '.htaccess' ? Htaccess::enables_execution(\$content) : Htaccess::ini_enables_execution(\$content);",
        'to'   => '$dangerous = true;',
    ],
    [
        'name' => 'The first pass does not baseline the uploads control files',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "\$first   = !(bool) State::get('uploads_ht_baselined', false);",
        'to'   => '$first = false;',
    ],
    [
        'name' => 'The .htaccess rule matches the word php instead of a directive that enables it',
        'file' => 'includes/class-htaccess.php',
        'from' => "        \$lines = preg_split('/\\r?\\n/', \$content) ?: [];\n        \$in_files = false;",
        'to'   => "        if (stripos(\$content, 'php') !== false) { return true; }\n        \$lines = preg_split('/\\r?\\n/', \$content) ?: [];\n        \$in_files = false;",
    ],
    [
        'name' => 'A single failed check rolls the update back',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'edits' => [
            ['        if ($first === null) {', '        if (false) {'],
            ["        \$repeated = array_intersect((array) (\$first['failed'] ?? []), \$failed);", '        $repeated = $failed;'],
        ],
    ],
    [
        'name' => 'A host that does not answer counts as a failed update',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "        if (!\$results['host_up']) {",
        'to'   => '        if (false) {',
    ],
    [
        'name' => 'The sealed copy is put back without a syntax check',
        'file' => 'includes/actions/class-restore-guard.php',
        'from' => "        if (str_ends_with(\$rel, '.php')) {",
        'to'   => '        if (false) {',
    ],
    [
        'name' => 'Guard copies can be evicted from the vault',
        'file' => 'includes/class-vault.php',
        'from' => "            if (!empty(\$e['protected']) || in_array(\$e['kind'] ?? '', self::PROTECTED_KINDS, true)) {\n                continue;\n            }",
        'to'   => '',
    ],
    [
        'name' => 'The manifest signature is never checked',
        'file' => 'includes/class-vault.php',
        'from' => "        if (!is_readable(\$sig)) {\n            return false;\n        }",
        'to'   => '        return true;',
    ],
    [
        'name' => 'Emails are sent from staging',
        'file' => 'includes/class-alerts.php',
        'from' => "        if (!Site::is_live() && !self::\$force) {\n            // The page's amber notice",
        'to'   => "        if (false) {\n            // The page's amber notice",
    ],
    [
        'name' => 'The heartbeat URL is written into an event',
        'file' => 'includes/class-heartbeat.php',
        'from' => "        \$result = (\$code >= 200 && \$code < 300) ? 'sent' : 'failed';",
        'to'   => "        \$result = (\$code >= 200 && \$code < 300) ? 'sent' : 'failed';\n        Events::record(Fortress::LOVRIJENAC, Events::INFO, 'ping', \$target, 'pinged ' . \$target);",
    ],
    [
        'name' => 'A new mu-plugin is quarantined instead of reported',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        if (\$where === 'mu') {\n            \$what .= ' ' . __('Nothing legitimately adds a must-use plugin without the site director knowing.', 'dcc-ragusa');\n        }",
        'to'   => "        if (\$where === 'mu') {\n            Quarantine::run(['path' => Site::abspath() . '/' . \$rel, 'reason' => 'mutation']);\n        }",
    ],
    [
        'name' => 'An upload put back on request is not allowlisted',
        'file' => 'includes/actions/class-quarantine.php',
        'from' => "        \$b['uploads_allow'][\$rel] = (int) filesize(\$path);",
        'to'   => '',
    ],
    [
        'name' => 'The raw IP address is stored',
        'file' => 'includes/fortresses/class-bokar.php',
        'from' => "            \$hash    = self::hash_ip(\$ip);",
        'to'   => '            $hash    = $ip;',
    ],
    [
        'name' => 'Recovery abandons a restore whose rename had completed',
        'file' => 'includes/actions/class-restore-guard.php',
        'from' => "                if (self::sha(\$path) === (string) (\$row['after']['sha256'] ?? '-')) {",
        'to'   => '                if (false) {',
    ],
    [
        'name' => 'Secrets are stored in plain text',
        'file' => 'includes/class-crypto.php',
        'from' => "        if (function_exists('sodium_crypto_secretbox')) {\n            return 'sodium';\n        }",
        'to'   => '',
    ],
    [
        'name' => 'uploads/.htaccess is dropped from the guard set',
        'file' => 'includes/fortresses/class-revelin.php',
        'from' => "        \$out['uploads/.htaccess']                     = \$up . '/.htaccess';",
        'to'   => '',
    ],
    [
        'name' => 'The one-hour rollback window is ignored',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            && (time() - (int) (\$before['started'] ?? 0)) <= self::WINDOW;",
        'to'   => '            && true;',
    ],
    [
        'name' => '0.1.1 blocker 1: the 10-minute schedule is registered only in boot(), so activation cannot use it',
        'file' => 'dcc-ragusa.php',
        'from' => "add_filter('cron_schedules', ['DCCR\\\\Cron', 'schedules']);",
        'to'   => '',
    ],
    [
        'name' => '0.1.1 blocker 2: only the first chunk of the first pass is the baseline',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        \$first = !(bool) State::get('minceta.baselined', false);",
        'to'   => '        $first = self::index() === [];',
    ],
    [
        'name' => '0.1.1 blocker 3: the quota parser takes the first filesystem',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        if (\$device !== null && isset(\$rows[\$device])) {\n            \$pick = \$device;\n        }",
        'to'   => '        $pick = array_key_first($rows);',
    ],
    [
        'name' => '0.1.1 blocker 4: roles are trusted from WP_User instead of the capabilities meta',
        'file' => 'includes/fortresses/class-bokar.php',
        'from' => "            \$roles = self::roles_of((int) \$u->ID, (array) (\$u->roles ?? []));",
        'to'   => '            $roles = (array) ($u->roles ?? []);',
    ],
    [
        'name' => '0.1.1 item 5: a staging login page counts as a failed page check',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "                if (\$missing !== [] && self::looks_like_login(\$r['body'])) {",
        'to'   => '                if (false) {',
    ],
    [
        'name' => '0.1.2 blocker 1a: a parent directory that is another WordPress site is read as this site\'s log',
        'file' => 'includes/class-error-log.php',
        'from' => "        if (\$parent !== \$root && !self::is_wordpress_root(\$parent)) {",
        'to'   => '        if ($parent !== $root) {',
    ],
    [
        'name' => '0.1.2 blocker 1b: a WP-CLI fatal counts as evidence against an update',
        'file' => 'includes/class-error-log.php',
        'from' => "                if (self::is_cli_line(\$line)) {\n                    continue;\n                }",
        'to'   => '',
    ],
    [
        'name' => '0.1.2 item 2: an updated plugin\'s own files are raised as findings',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "        \$n = Minceta::rebaseline(Site::plugins_dir() . '/' . \$slug);",
        'to'   => '        $n = 0;',
    ],
    [
        'name' => '0.1.2 item 3: a lost self-update check is abandoned',
        'file' => 'includes/class-actions.php',
        'from' => "                } elseif (in_array(\$action, ['update-check', 'core-check', 'self-update'], true)) {",
        'to'   => "                } elseif (in_array(\$action, ['update-check', 'core-check'], true)) {",
    ],
    [
        'name' => '0.1.2 item 4: the rollback row is written after its follow-up may have committed it',
        'file' => 'includes/actions/class-rollback.php',
        'from' => "        \$check = Sveti_Ivan::after_rollback(\$id, \$slug);\n        Journal::set_state(\$id, Journal::VERIFYING, ['verify' => ['check_id' => \$check]]);\n        Sveti_Ivan::run_followup(\$check);",
        'to'   => "        \$check = Sveti_Ivan::after_rollback(\$id, \$slug);\n        Sveti_Ivan::run_followup(\$check);\n        Journal::set_state(\$id, Journal::VERIFYING, ['verify' => ['check_id' => \$check]]);",
    ],
    [
        'name' => '0.1.3 A: a drill event colours a card (practice counted as real)',
        'file' => 'includes/class-alerts.php',
        'from' => "        return array_filter(self::active(\$fortress), static fn(\$a) => self::state(\$a) === 'open');",
        'to'   => "        return array_filter(self::active(\$fortress), static fn(\$a) => in_array(self::state(\$a), ['open', 'practice'], true));",
    ],
    [
        'name' => '0.1.3 A: the walk looks at the drill\'s own files',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        if (\\DCCR\\Drill::owns_path(\$rel)) {\n            return true; // practice leaves no trace in the walk\n        }",
        'to'   => '',
    ],
    [
        'name' => '0.1.3 B: a rollback finding stays breached after a newer version passes',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            if (\$installed !== '' && version_compare(\$installed, \$rolled, '>')) {\n                Alerts::resolve(\$fp, \$quiet);\n            }",
        'to'   => '',
    ],
    [
        'name' => '0.1.3 B: a journal that finishes late raises a fresh breach',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            if (\$installed !== '' && \$installed !== (string) \$before['new_version']) {",
        'to'   => '            if (false) {',
    ],
    [
        'name' => '0.1.3 B: withdrawn events count as changes',
        'file' => 'includes/class-events.php',
        'from' => "                \"SELECT COUNT(*) FROM {\$table} WHERE fortress = %s AND ts >= %d AND tag = ''\",",
        'to'   => "                \"SELECT COUNT(*) FROM {\$table} WHERE fortress = %s AND ts >= %d\",",
    ],
    [
        'name' => '0.1.3 C: Mark As Seen without a nonce or the capability',
        'file' => 'includes/class-admin.php',
        'from' => "    public static function handle_seen(): void\n    {\n        self::guard();",
        'to'   => "    public static function handle_seen(): void\n    {",
    ],
    [
        'name' => '0.1.3 C: the headline stays breached with only practice and seen findings',
        'file' => 'includes/class-alerts.php',
        'from' => "        if ((int) (\$a['seen_at'] ?? 0) > 0) {\n            return 'seen';\n        }\n        return 'open';",
        'to'   => "        return 'open';",
    ],
    [
        'name' => '0.1.4 1: seal refuses a deleted path',
        'file' => 'includes/fortresses/class-revelin.php',
        'from' => "            return self::seal_missing(\$abs);",
        'to'   => "            return [false, sprintf(__('No file at %s.', 'dcc-ragusa'), Site::rel(\$abs))];",
    ],
    [
        'name' => '0.1.4 1: a file-missing finding resolves itself on the next pass',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        \$kinds = ['core-modified', 'plugin-modified', 'file-new', 'file-changed', 'quarantined'];",
        'to'   => "        \$kinds = ['core-modified', 'plugin-modified', 'file-new', 'file-changed', 'file-missing', 'quarantined'];",
    ],
    [
        'name' => '0.1.4 2: the order check reads the wrong block name',
        'file' => 'includes/class-htaccess.php',
        'from' => "    public const PREGZ_BEGIN  = '# BEGIN DCC Pre-gzipped Cache';",
        'to'   => "    public const PREGZ_BEGIN  = '# BEGIN DCC Pregzipped Cache';",
    ],
    [
        'name' => '0.1.5: an .htaccess with neither block (staging) raises a finding',
        'file' => 'includes/class-htaccess.php',
        'from' => "        if (\$speedy === false) {\n            return self::ORDER_NO_SPEEDY;\n        }",
        'to'   => "        if (false) {\n            return self::ORDER_NO_SPEEDY;\n        }",
    ],
    [
        'name' => '0.1.6: a JS or CSS rule with a slash is flagged (the type filter is gone)',
        'file' => 'includes/class-speedycache.php',
        'from' => "            if (\$rule['type'] !== 'page') {\n                continue;\n            }",
        'to'   => "            if (false) {\n                continue;\n            }",
    ],
    [
        'name' => '0.1.6: a page rule without slashes is flagged',
        'file' => 'includes/class-speedycache.php',
        'from' => "            if (str_contains(\$rule['content'], '/')) {",
        'to'   => "            if (true) {",
    ],
    [
        'name' => '0.1.6: /guest/ cached is flagged (every cached folder counts)',
        'file' => 'includes/class-speedycache.php',
        'from' => "            foreach ((array) glob(\$base . '/*/all/' . \$slug, GLOB_ONLYDIR) as \$dir) {",
        'to'   => "            foreach ((array) glob(\$base . '/*/all/*', GLOB_ONLYDIR) as \$dir) {",
    ],
    [
        'name' => '0.1.6: the booking-cache finding never resolves',
        'file' => 'includes/fortresses/class-revelin.php',
        'from' => "        if (\$rules === [] && \$folders === []) {\n            Alerts::resolve(\$fp);\n            return;\n        }",
        'to'   => "        if (\$rules === [] && \$folders === []) {\n            return;\n        }",
    ],
    [
        'name' => '0.2.0 1: the event ring cuts blindly at 2,000 (a breached row can be pushed out by noise)',
        'file' => 'includes/class-events.php',
        'from' => "        \$over -= self::delete_oldest(\$wpdb->prepare(\"severity = %s OR tag <> ''\", self::INFO), \$over);",
        'to'   => "        \$over -= self::delete_oldest('1=1', \$over);",
    ],
    [
        'name' => '0.2.0 2: resolved findings count as active',
        'file' => 'includes/class-alerts.php',
        'from' => "            && in_array(self::state(\$a), ['open', 'seen'], true));",
        'to'   => "            && in_array(self::state(\$a), ['open', 'seen', 'resolved'], true)) + array_filter(\$data['resolved'], static fn(\$a) => \$fortress === null || (\$a['fortress'] ?? '') === \$fortress);",
    ],
    [
        'name' => '0.2.0 3: a file written in an update window is a finding (no attribution)',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        if (\$slug === '' || \$slug === 'dcc-ragusa') {\n            return false;\n        }",
        'to'   => "        return false;",
    ],
    [
        'name' => '0.2.0 3: any file in the window is attributed, even in another plugin\'s folder',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "            if (\$mtime >= \$w['from'] && \$mtime <= \$w['to'] && self::belongs_to(\$rel, \$w['slug'])) {",
        'to'   => "            if (\$mtime >= \$w['from'] && \$mtime <= \$w['to']) {",
    ],
    [
        'name' => '0.2.0 3: a self-writer that gains PHP stays info',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        if (self::has_php(\$abs)) {\n            return false; // it gained PHP: the ordinary finding, with its severity\n        }",
        'to'   => "",
    ],
    [
        'name' => '0.2.0 4: wp ragusa findings lists resolved findings by default',
        'file' => 'includes/class-cli.php',
        'from' => "        \$set  = \$all ? Alerts::active() + Alerts::history() : Alerts::unresolved();",
        'to'   => "        \$set  = Alerts::active() + Alerts::history();",
    ],
    [
        'name' => '0.2.0 4: resolving by hand records nobody',
        'file' => 'includes/class-alerts.php',
        'from' => "        self::resolve(\$fp, true);\n        Events::record((string) \$a['fortress'], Events::INFO, 'resolved-by-hand',",
        'to'   => "        self::resolve(\$fp, true);\n        if (false) Events::record((string) \$a['fortress'], Events::INFO, 'resolved-by-hand',",
    ],
    [
        'name' => '0.2.0 5: the clock drops the zone',
        'file' => 'includes/class-site.php',
        'from' => "        return \$date . ', ' . \$t->format('g:i A T');",
        'to'   => "        return \$date . ', ' . \$t->format('g:i A');",
    ],
    [
        'name' => '0.2.0 6: a security release is a breach from day one (no three-day grace)',
        'file' => 'includes/class-php-patch.php',
        'from' => "        if (\$latest['security'] && \$age > self::SECURITY_GRACE) {",
        'to'   => "        if (\$latest['security']) {",
    ],
    [
        'name' => '0.2.0 6: a branch missing from php.net is not end of life',
        'file' => 'includes/class-php-patch.php',
        'from' => "        \$latest = \$branches[\$branch] ?? null;\n        if (\$latest === null) {",
        'to'   => "        \$latest = \$branches[\$branch] ?? null;\n        if (\$latest === null) {\n            return null;\n        }\n        if (false) {",
    ],
    [
        'name' => '0.2.0 6: a changed PHP settings file raises nothing',
        'file' => 'includes/class-php-patch.php',
        'from' => "            if (\$seen[\$abs] !== \$content) {\n                \$lines[] = self::changed(\$abs, (string) \$seen[\$abs], \$content, false);\n            }",
        'to'   => "",
    ],
    [
        'name' => '0.2.0 6: a fresh executable under uploads waits for the next walk',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "                } elseif (\$fresh && self::is_executable_name(\$item)) {",
        'to'   => "                } elseif (false) {",
    ],
    [
        'name' => '0.2.0 7: the report always says the walls held',
        'file' => 'includes/class-report.php',
        'from' => "        \$subject = \$n_open === 0",
        'to'   => "        \$subject = true",
    ],
    [
        'name' => '0.2.1 1: the probe passes doing_wp_cron again (wp-cron.php returns before running the event)',
        'file' => 'includes/class-php-patch.php',
        'from' => "        \$url  = site_url('wp-cron.php');",
        'to'   => "        \$url  = site_url('wp-cron.php?doing_wp_cron=' . sprintf('%.22F', microtime(true)));",
    ],
    [
        'name' => '0.2.1 1: the probe is asked once and never again',
        'file' => 'includes/class-php-patch.php',
        'from' => "        if (\$r !== null && time() - (int) (\$probe['asked'] ?? 0) < self::PROBE_EVERY) {",
        'to'   => "        if (!empty(\$probe['asked'])) {",
    ],
    [
        'name' => '0.2.1 1: the login path records nothing',
        'file' => 'includes/class-plugin.php',
        'from' => "            if (isset(\$_GET['ragusa_php'])) {",
        'to'   => "            if (false) {",
    ],
    [
        'name' => '0.2.1 2: the record names the script owner, not the account',
        'file' => 'includes/class-cli.php',
        'from' => "        return self::account() . ' (shell)';",
        'to'   => "        return get_current_user() . ' (shell)';",
    ],
    [
        'name' => '0.2.2 1: the probe POSTs wp-cron.php with WP-Cron off',
        'file' => 'includes/class-php-patch.php',
        'from' => "        if (Site::cron_off()) {\n            // wp-cron.php ignores DISABLE_WP_CRON",
        'to'   => "        if (false) {\n            // wp-cron.php ignores DISABLE_WP_CRON",
    ],
    [
        'name' => '0.2.2 1: the loopback test POSTs wp-cron.php with WP-Cron off',
        'file' => 'includes/class-loopback.php',
        'from' => "        if (Site::cron_off()) {",
        'to'   => "        if (false) {",
    ],
    [
        'name' => '0.2.2 2: a fatal in another update\'s window is blamed on this update',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            } elseif ((\$w = self::fatal_owner(\$line, \$slug)) !== null) {",
        'to'   => "            } elseif (false && (\$w = self::fatal_owner(\$line, \$slug)) !== null) {",
    ],
    [
        'name' => '0.2.2 2: any updated plugin owns any fatal in its window, whatever files it names',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            if (\$names) {\n                return \$w;\n            }",
        'to'   => "            return \$w;",
    ],
    [
        'name' => '0.2.2 2: the repeat re-reads the same fatal line (one failure counted twice)',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            \$scan['errlog'] = (array) \$row['verify']['first_fail']['errlog'];",
        'to'   => "",
    ],
    [
        'name' => '0.2.2 3: a reading that lands does not refresh the row',
        'file' => 'includes/class-php-patch.php',
        'from' => "        Fortress\\Lovrijenac::refresh_php();\n        State::flush();",
        'to'   => "        State::flush();",
    ],
    [
        'name' => '0.2.3 1a: a 0.2.1 first failure re-reads the update\'s own snapshot (row 57)',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            if (\$after_ts > 0 && (\$t === null || \$t <= \$after_ts)) {",
        'to'   => "            if (false) {",
    ],
    [
        'name' => '0.2.3 1b: a fatal stamped while the plugin was being copied counts',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "        if (\$installed_at > 0 && \$t !== null && \$t < \$installed_at) {",
        'to'   => "        if (false) {",
    ],
    [
        'name' => '0.2.3 1c: a file that was missing for a moment and is present now counts',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            if (is_file(\$file)) {",
        'to'   => "            if (false) {",
    ],
    [
        'name' => '0.2.3 2: status prints last tick\'s headline and rows',
        'file' => 'includes/class-cli.php',
        'from' => "        Schema::ensure();\n        Fortress::refresh();\n        \\WP_CLI::log(Fortress::overall());",
        'to'   => "        Schema::ensure();\n        \\WP_CLI::log(Fortress::overall());",
    ],
    [
        'name' => '0.2.3 2: a row that names a settled finding does not say so',
        'file' => 'includes/class-fortress.php',
        'from' => "        \$fp   = (string) (\$s['fp'] ?? '');\n        if (\$fp === '') {",
        'to'   => "        \$fp   = '';\n        if (\$fp === '') {",
    ],
    [
        'name' => '0.2.3 3: a stale reading is judged (a false breach after the host updated PHP)',
        'file' => 'includes/class-php-patch.php',
        'from' => "        if (self::stale(\$r)) {\n            return; // a fresh reading is asked for",
        'to'   => "        if (false) {\n            return; // a fresh reading is asked for",
    ],
    [
        'name' => '0.2.4 1: a check event is scheduled where WP-Cron is off',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "        if (!Site::cron_off()) {\n            wp_schedule_single_event(\$at, Plugin::CHECK_HOOK, [\$id]);",
        'to'   => "        if (true) {\n            wp_schedule_single_event(\$at, Plugin::CHECK_HOOK, [\$id]);",
    ],
    [
        'name' => '0.2.4 1: running a check leaves its event behind',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "        // Run now: its cron event, if any, has nothing left to do.\n        wp_clear_scheduled_hook(Plugin::CHECK_HOOK, [\$id]);",
        'to'   => "",
    ],
    [
        'name' => '0.2.4 1: leftover events are never swept',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "        \$swept = self::sweep_events();",
        'to'   => "        \$swept = 0;",
    ],
    [
        'name' => '0.2.4 2: anything in the sse folder passes as WP Staging\'s own',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "            return str_starts_with(\$c, \$header) && !\$opens(substr(\$c, strlen(\$header)));\n        }\n        return false;",
        'to'   => "            return str_starts_with(\$c, \$header) && !\$opens(substr(\$c, strlen(\$header)));\n        }\n        return true;",
    ],
    [
        'name' => '0.2.4 2: an sse index.php that runs code passes',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "            case 'index.php':\n                return self::comments_only_php(\$c);",
        'to'   => "            case 'index.php':\n                return true;",
    ],
    [
        'name' => '0.2.4 2: WP Staging\'s daily cleanup raises File Missing',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "            if (self::wpstg_own(\$rel, Site::abspath() . '/' . \$rel)) {\n                \$p['wpstg_sse'] = (int) (\$p['wpstg_sse'] ?? 0) + 1;\n                continue; // WP Staging's daily cleanup",
        'to'   => "            if (false) {\n                continue; // WP Staging's daily cleanup",
    ],
    [
        'name' => '0.2.4 4: with no reading the probe waits ten minutes',
        'file' => 'includes/class-php-patch.php',
        'from' => "        if (\$r !== null && time() - (int) (\$probe['asked'] ?? 0) < self::PROBE_EVERY) {",
        'to'   => "        if (time() - (int) (\$probe['asked'] ?? 0) < self::PROBE_EVERY) {",
    ],
    [
        'name' => '0.2.4 4: a new reading waits for the daily check to be judged',
        'file' => 'includes/fortresses/class-lovrijenac.php',
        'from' => "        // Judged every tick from the reading and the cached list (no request): a new reading is judged at once.\n        \\DCCR\\Php_Patch::evaluate();",
        'to'   => "",
    ],
    [
        'name' => '0.2.4 4: the probe Ragusa just asked for is answered with the stale rule',
        'file' => 'includes/class-php-patch.php',
        'from' => "            if (time() - (int) (\$probe['asked'] ?? 0) <= 300) {",
        'to'   => "            if (false) {",
    ],
    [
        'name' => '0.2.4 5: the walk reports the per-tick files a second time',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        if (!\$is_dir && in_array(\$rel, self::OWNED_ELSEWHERE, true)) {",
        'to'   => "        if (false) {",
    ],
    [
        'name' => '0.2.4 5: Minčeta watches .user.ini too (two findings for one edit)',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "            'index.php'                    => \$root . '/index.php',\n",
        'to'   => "            'index.php'                    => \$root . '/index.php',\n            '.user.ini'                    => \$root . '/.user.ini',\n",
    ],
    [
        'name' => '0.2.4 5: every settings-file edit is breached',
        'file' => 'includes/class-php-patch.php',
        'from' => "        \$severity = \$runs ? Events::BREACHED : Events::NEEDS_LOOK;",
        'to'   => "        \$severity = Events::BREACHED;",
    ],
    [
        'name' => '0.2.4 5: the headline says Ragusa acted when it did not',
        'file' => 'includes/class-fortress.php',
        'from' => "            self::BREACHED   => (Alerts::acted() !== []",
        'to'   => "            self::BREACHED   => (true",
    ],
    [
        'name' => '0.2.4 7: restore refuses the finding\'s id',
        'file' => 'includes/class-admin.php',
        'from' => "        \$found = Alerts::by_short_id(\$target);",
        'to'   => "        \$found = null;",
    ],
    [
        'name' => '0.2.4 7: an action finding does not carry its journal row',
        'file' => 'includes/class-alerts.php',
        'from' => "                array_filter(['journal_id' => (int) (\$f['journal_id'] ?? 0), 'acted' => !empty(\$f['acted'])])",
        'to'   => "                []",
    ],
];


if (is_dir($work)) {
    DCCR_rm($work);
}
function DCCR_rm(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($dir);
}
function DCCR_copy(string $from, string $to): void
{
    @mkdir($to, 0755, true);
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
    foreach ($it as $f) {
        $target = $to . '/' . substr($f->getPathname(), strlen($from) + 1);
        $f->isDir() ? @mkdir($target, 0755, true) : copy($f->getPathname(), $target);
    }
}

$failed = 0;
if ($only !== '') {
    $mutations = array_values(array_filter($mutations, static fn($m) => str_contains($m['name'], $only)));
}
foreach ($mutations as $i => $m) {
    DCCR_rm($work);
    DCCR_copy($plugin, $work);
    $file  = $work . '/' . $m['file'];
    $src   = (string) file_get_contents($file);
    $edits = $m['edits'] ?? [[$m['from'], $m['to']]];
    $bad   = false;
    foreach ($edits as [$from, $to]) {
        $n = substr_count($src, $from);
        if ($n !== 1) {
            echo sprintf("  ERROR  mutation %d (%s): anchor found %d times in %s\n", $i + 1, $m['name'], $n, $m['file']);
            $bad = true;
            break;
        }
        $src = str_replace($from, $to, $src);
    }
    if ($bad) {
        $failed++;
        continue;
    }
    file_put_contents($file, $src);
    $out  = [];
    $code = 0;
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($work . '/tests/run-tests.php') . ' 2>&1', $out, $code);
    $summary = '';
    foreach (array_reverse($out) as $line) {
        if (preg_match('/^\d+ passed, \d+ failed/', $line)) {
            $summary = $line;
            break;
        }
    }
    if ($code === 0) {
        echo sprintf("  NOT CAUGHT  %s (%s)\n", $m['name'], $summary);
        $failed++;
    } else {
        $first = '';
        foreach ($out as $line) {
            if (str_starts_with($line, '  FAIL') || str_starts_with($line, '  ERROR')) {
                $first = trim($line);
                break;
            }
        }
        echo sprintf("  caught      %s\n              %s\n", $m['name'], mb_substr($first, 0, 150));
    }
}
DCCR_rm($work);
echo sprintf("\n%d mutations, %d not caught\n", count($mutations), $failed);
exit($failed === 0 ? 0 : 1);
