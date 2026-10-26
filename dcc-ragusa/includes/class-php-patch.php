<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * "PHP Is Patched" (Lovrijenac), once a day from cron, never on a visitor
 * request. The running version is read in the WEB context: from the tick
 * itself when wp-cron.php served it, otherwise from a one-off cron event
 * that a loopback POST to wp-cron.php makes the web server run, or from a
 * GET of wp-login.php that the plugin's boot answers, or from the next
 * admin page load. WP-CLI's own PHP is never the reading. php.net's active-branch list is fetched
 * and cached for a day; when it cannot be reached, the status says so and
 * nothing is raised.
 *
 * Also the PHP settings files (.user.ini, php.ini) the host writes its
 * emergency mitigations to: any change is a finding with the diff.
 */
final class Php_Patch
{
    public const FEED_URL       = 'https://www.php.net/releases/active.php';
    public const FEED_CACHE     = 86400;
    public const SECURITY_GRACE = 3 * 86400;
    public const READING_OPTION = 'dcc_ragusa_php_web';
    public const READING_MAX    = 2 * 86400;
    public const PROBE_HOOK     = 'dccr_php_probe';
    public const SETTINGS_FILES = ['.user.ini', 'php.ini'];
    public const SETTINGS_MAX   = 64 * 1024;

    /** Tests: pretend the web reading is this. */
    public static ?array $reading_override = null;

    // ------------------------------------------------------- the reading

    public const PROBE_EVERY = 600;
    public const STALE_ADMIN = 12 * 3600;

    /** The tick ran under the web server: that is the reading. The probe event handler calls this too. */
    public static function record_here(string $source = 'tick'): void
    {
        if (PHP_SAPI === 'cli' && self::$reading_override === null) {
            return;
        }
        $r = self::$reading_override ?? ['version' => PHP_VERSION, 'sapi' => PHP_SAPI];
        self::save_reading($r['version'], $r['sapi'], $source);
    }

    /**
     * An admin or login request under the web server: record the reading
     * when there is none or it is older than half a day. One option read
     * on wp-admin page loads (never AJAX, never a visitor page).
     */
    public static function record_if_stale(string $source): void
    {
        if (PHP_SAPI === 'cli' && self::$reading_override === null) {
            return;
        }
        $r = self::reading();
        if ($r !== null && time() - (int) ($r['ts'] ?? 0) < self::STALE_ADMIN) {
            return;
        }
        self::record_here($source);
    }

    public static function save_reading(string $version, string $sapi, string $source = 'tick'): void
    {
        $value = [
            'version' => $version,
            'sapi'    => $sapi,
            'source'  => $source,
            'ts'      => time(),
            'upload_progress' => (string) ini_get('session.upload_progress.enabled'),
        ];
        if (get_option(self::READING_OPTION, null) === null) {
            add_option(self::READING_OPTION, $value, '', 'no');
        } else {
            update_option(self::READING_OPTION, $value, 'no');
        }
    }

    /** @return array{version:string,sapi:string,source:string,ts:int}|null */
    public static function reading(): ?array
    {
        $r = get_option(self::READING_OPTION, null);
        return is_array($r) && !empty($r['version']) ? $r + ['source' => 'tick', 'ts' => 0, 'sapi' => ''] : null;
    }

    /**
     * Every tick: while there is no fresh reading and the tick itself runs
     * under WP-CLI, ask the web server, at most once per tick interval.
     */
    public static function ensure_reading(): array
    {
        $r = self::reading();
        if ($r !== null && time() - (int) ($r['ts'] ?? 0) <= self::READING_MAX) {
            return [];
        }
        if (PHP_SAPI !== 'cli' && self::$reading_override === null) {
            return []; // record_here() at the tick start already did it
        }
        $probe = (array) State::get('php_probe', []);
        if (time() - (int) ($probe['asked'] ?? 0) < self::PROBE_EVERY) {
            return [];
        }
        return [self::probe()];
    }

    /**
     * Ask the web server for its PHP, two ways, both cron-spawned and
     * neither visible to a visitor:
     *
     * 1. a one-off cron event, then a POST to wp-cron.php with NO
     *    doing_wp_cron parameter (with one, wp-cron.php compares it to a
     *    lock transient that only spawn_cron() sets, and returns before
     *    running anything), which the web SAPI serves and the event records;
     * 2. a GET of wp-login.php?ragusa_php=1, where the plugin's boot records
     *    the reading on plugins_loaded, before any login form or gate.
     */
    public static function probe(): string
    {
        $probe = (array) State::get('php_probe', []);
        $probe = ['asked' => time(), 'attempts' => (int) ($probe['attempts'] ?? 0) + 1, 'cron' => '', 'login' => '', 'event' => false];
        if (!Loopback::available()) {
            $probe['cron'] = $probe['login'] = __('loopbacks do not work here', 'dcc-ragusa');
            State::set('php_probe', $probe);
            return __('PHP reading: loopbacks do not work here; the web PHP cannot be read.', 'dcc-ragusa');
        }
        if (!wp_next_scheduled(self::PROBE_HOOK)) {
            wp_schedule_single_event(time(), self::PROBE_HOOK);
        }
        $probe['event'] = wp_next_scheduled(self::PROBE_HOOK) !== false;
        $url  = site_url('wp-cron.php');
        $resp = wp_remote_post($url, [
            'timeout'   => 8,
            'blocking'  => true,
            'headers'   => ['Cache-Control' => 'no-cache', 'User-Agent' => 'DCC-Ragusa/' . DCCR_VERSION],
            'sslverify' => apply_filters('https_local_ssl_verify', false, $url),
        ]);
        $probe['cron'] = is_wp_error($resp) ? Text::scrub($resp->get_error_message()) : 'HTTP ' . wp_remote_retrieve_response_code($resp);
        $login = add_query_arg(['ragusa_php' => '1', 'ragusa_check' => substr(bin2hex(random_bytes(4)), 0, 8)], site_url('wp-login.php'));
        $resp  = wp_remote_get($login, [
            'timeout'     => 8,
            'redirection' => 0,
            'headers'     => ['Cache-Control' => 'no-cache', 'User-Agent' => 'DCC-Ragusa/' . DCCR_VERSION],
            'sslverify'   => apply_filters('https_local_ssl_verify', false, $login),
            'cookies'     => [],
        ]);
        $probe['login'] = is_wp_error($resp) ? Text::scrub($resp->get_error_message()) : 'HTTP ' . wp_remote_retrieve_response_code($resp);
        State::set('php_probe', $probe);
        /* translators: 1: wp-cron.php answer, 2: wp-login.php answer */
        return sprintf(__('PHP reading asked of the web server: wp-cron.php %1$s, wp-login.php %2$s; the answer lands on the next tick.', 'dcc-ragusa'), $probe['cron'], $probe['login']);
    }

    /** The probe's state, for the status lines. */
    public static function probe_state(): array
    {
        return (array) State::get('php_probe', []);
    }

    /**
     * For `wp ragusa status`: the reading itself and how it was obtained,
     * then php.net's answer.
     *
     * @return string[]
     */
    public static function status_lines(): array
    {
        $r     = self::reading();
        $probe = self::probe_state();
        $feed  = (array) State::get('php_feed', []);
        $lines = [];
        if ($r === null) {
            $line = __('not read from the web server yet', 'dcc-ragusa');
            if (!empty($probe['asked'])) {
                /* translators: 1: when, 2: wp-cron.php answer, 3: wp-login.php answer, 4: attempts */
                $line .= '; ' . sprintf(__('asked the web server at %1$s (wp-cron.php %2$s, wp-login.php %3$s, %4$d attempts); no answer yet', 'dcc-ragusa'), Site::stamp((int) $probe['asked']), (string) $probe['cron'], (string) $probe['login'], (int) ($probe['attempts'] ?? 0));
                $line .= '; ' . (!empty($probe['event']) ? __('probe event scheduled', 'dcc-ragusa') : __('probe event NOT in the cron list', 'dcc-ragusa'));
            } elseif (PHP_SAPI === 'cli') {
                $line .= '; ' . __('not asked yet (first tick pending)', 'dcc-ragusa');
            }
            $lines[] = 'php: ' . $line;
        } else {
            $source = match ((string) ($r['source'] ?? 'tick')) {
                'probe' => __('the probe event under wp-cron.php', 'dcc-ragusa'),
                'login' => __('the wp-login.php probe', 'dcc-ragusa'),
                'admin' => __('an admin page load', 'dcc-ragusa'),
                default => __('the tick under wp-cron.php', 'dcc-ragusa'),
            };
            /* translators: 1: version, 2: sapi, 3: source, 4: when */
            $lines[] = 'php: ' . sprintf(__('%1$s (%2$s), read from %3$s at %4$s', 'dcc-ragusa'), (string) $r['version'], (string) $r['sapi'], $source, Site::stamp((int) $r['ts']));
        }
        if (!empty($feed['branches'])) {
            $branch = $r === null ? '' : (string) preg_replace('/^(\d+\.\d+).*/', '$1', (string) $r['version']);
            $latest = $feed['branches'][$branch]['version'] ?? '';
            /* translators: 1: when, 2: branches, 3: newest in the running branch */
            $lines[] = 'php.net: ' . sprintf(__('read %1$s, %2$d active branches%3$s', 'dcc-ragusa'), Site::stamp((int) $feed['ts']), count($feed['branches']), $latest !== '' ? ', ' . sprintf(__('newest %1$s is %2$s', 'dcc-ragusa'), $branch, $latest) : '');
        } elseif (!empty($feed['error'])) {
            $lines[] = 'php.net: ' . __('not reachable', 'dcc-ragusa') . ' (' . (string) $feed['error'] . ')';
        } else {
            $lines[] = 'php.net: ' . __('not read yet', 'dcc-ragusa');
        }
        return $lines;
    }

    // ------------------------------------------------------------ the feed

    /** Once a day: the feed, then the judgement. */
    public static function due(): array
    {
        $lines = [];
        $feed  = (array) State::get('php_feed', []);
        if (time() - (int) ($feed['ts'] ?? 0) >= self::FEED_CACHE) {
            $lines[] = self::fetch();
        }
        self::evaluate();
        return $lines;
    }

    public static function fetch(): string
    {
        $resp = wp_remote_get(self::FEED_URL, ['timeout' => 10, 'limit_response_size' => 256 * 1024, 'sslverify' => true, 'headers' => ['User-Agent' => 'DCC-Ragusa/' . DCCR_VERSION]]);
        $feed = (array) State::get('php_feed', []);
        if (is_wp_error($resp) || (int) wp_remote_retrieve_response_code($resp) !== 200) {
            $feed['error'] = is_wp_error($resp) ? $resp->get_error_message() : 'HTTP ' . wp_remote_retrieve_response_code($resp);
            $feed['ts']    = time() - self::FEED_CACHE + 3600; // try again in an hour
            State::set('php_feed', $feed);
            return __('php.net could not be reached; the PHP check waits.', 'dcc-ragusa');
        }
        $branches = self::parse((string) wp_remote_retrieve_body($resp));
        if ($branches === null) {
            $feed['error'] = 'unreadable';
            $feed['ts']    = time() - self::FEED_CACHE + 3600;
            State::set('php_feed', $feed);
            return __('php.net answered with something unreadable; the PHP check waits.', 'dcc-ragusa');
        }
        State::set('php_feed', ['ts' => time(), 'error' => '', 'branches' => $branches]);
        /* translators: %d: branches */
        return sprintf(__('php.net read: %d active branches.', 'dcc-ragusa'), count($branches));
    }

    /**
     * php.net/releases/active.php: {"8": {"8.3": {"version": "8.3.30",
     * "date": "21 Oct 2026", "tags": ["security"], ...}, ...}}.
     *
     * @return array<string,array{version:string,date:int,security:bool}>|null
     */
    public static function parse(string $json): ?array
    {
        $data = json_decode($json, true);
        if (!is_array($data) || $data === []) {
            return null;
        }
        $out = [];
        foreach ($data as $major => $branches) {
            if (!is_array($branches)) {
                continue;
            }
            foreach ($branches as $branch => $rel) {
                if (!is_array($rel) || !preg_match('/^\d+\.\d+$/', (string) $branch) || empty($rel['version'])) {
                    continue;
                }
                $date = strtotime((string) ($rel['date'] ?? ''));
                $tags = array_map('strtolower', array_map('strval', (array) ($rel['tags'] ?? [])));
                $out[(string) $branch] = [
                    'version'  => (string) $rel['version'],
                    'date'     => $date === false ? 0 : $date,
                    'security' => in_array('security', $tags, true),
                ];
            }
        }
        return $out === [] ? null : $out;
    }

    // ---------------------------------------------------------- the rules

    /**
     * The three rules, as data: which finding the running version earns,
     * or none. Pure, for the tests.
     *
     * @return array{kind:string,severity:string,title:string,what:string,todo:string}|null
     */
    public static function judge(string $running, array $branches, int $now): ?array
    {
        if (!preg_match('/^(\d+\.\d+)\.(\d+)/', $running, $m)) {
            return null;
        }
        $branch = $m[1];
        $latest = $branches[$branch] ?? null;
        if ($latest === null) {
            return [
                'kind'     => 'php-eol',
                'severity' => Events::NEEDS_LOOK,
                /* translators: %s: branch */
                'title'    => sprintf(__('PHP %s Is No Longer Supported', 'dcc-ragusa'), $branch),
                /* translators: 1: running, 2: branch, 3: branches */
                'what'     => sprintf(__('This site runs PHP %1$s, and php.net no longer lists the %2$s branch as active (active: %3$s). It receives no security fixes.', 'dcc-ragusa'), $running, $branch, implode(', ', array_keys($branches))),
                'todo'     => __('Ask the site director to move the account to a supported PHP version in cPanel.', 'dcc-ragusa'),
            ];
        }
        if (version_compare($running, $latest['version'], '>=')) {
            return null;
        }
        $age = $latest['date'] > 0 ? $now - $latest['date'] : 0;
        if ($latest['security'] && $age > self::SECURITY_GRACE) {
            return [
                'kind'     => 'php-security',
                'severity' => Events::BREACHED,
                /* translators: %s: version */
                'title'    => sprintf(__('PHP Security Fix Not Applied: %s', 'dcc-ragusa'), $latest['version']),
                /* translators: 1: running, 2: latest, 3: days */
                'what'     => sprintf(__('This site runs PHP %1$s. PHP %2$s is a security release, out for %3$d days, and the web server is still on the older version. Only updating PHP itself fixes a PHP flaw.', 'dcc-ragusa'), $running, $latest['version'], (int) floor($age / 86400)),
                'todo'     => __('Ask the site director to confirm the host has moved the account to the fixed PHP (cPanel → MultiPHP, or the host\'s own update) and to read the web PHP version, not the command line\'s.', 'dcc-ragusa'),
            ];
        }
        return [
            'kind'     => 'php-behind',
            'severity' => Events::NEEDS_LOOK,
            /* translators: 1: running, 2: latest */
            'title'    => sprintf(__('PHP Is Behind: %1$s, %2$s Is Out', 'dcc-ragusa'), $running, $latest['version']),
            /* translators: 1: running, 2: latest, 3: branch */
            'what'     => sprintf(__('This site runs PHP %1$s; the newest %3$s release is %2$s.', 'dcc-ragusa'), $running, $latest['version'], $branch) . ($latest['security'] ? ' ' . __('It is a security release, out for less than three days; this becomes a breach after three.', 'dcc-ragusa') : ''),
            'todo'     => __('Nothing urgent. The host usually moves the account within days; ask the site director if it stays behind.', 'dcc-ragusa'),
        ];
    }

    public static function evaluate(): void
    {
        $r    = self::reading();
        $feed = (array) State::get('php_feed', []);
        $kinds = ['php-eol', 'php-security', 'php-behind'];
        $present = [];
        if ($r === null) {
            $probe = self::probe_state();
            $line  = __('PHP Not Read From The Web Server Yet', 'dcc-ragusa');
            if (!empty($probe['asked'])) {
                /* translators: %s: when */
                $line .= ' · ' . sprintf(__('Asked At %s, No Answer Yet', 'dcc-ragusa'), Site::stamp((int) $probe['asked']));
            }
            State::set('php_check', ['line' => $line, 'ok' => false, 'current' => null]);
            return;
        }
        if (empty($feed['branches'])) {
            /* translators: %s: version */
            State::set('php_check', ['line' => sprintf(__('PHP %s · php.net Not Reachable', 'dcc-ragusa'), (string) $r['version']), 'ok' => false, 'current' => null]);
            return; // raise nothing without the list
        }
        $f = self::judge((string) $r['version'], (array) $feed['branches'], time());
        if ($f !== null) {
            $fp = Events::fingerprint(Fortress::LOVRIJENAC, $f['kind'], (string) $r['version']);
            $present[] = $fp;
            $a = Alerts::get($fp);
            if ($a === null || Alerts::state($a) !== 'open') {
                Events::record(Fortress::LOVRIJENAC, $f['severity'], $f['kind'], (string) $r['version'], $f['title']);
            }
            Alerts::raise([
                'fortress' => Fortress::LOVRIJENAC,
                'severity' => $f['severity'],
                'kind'     => $f['kind'],
                'target'   => (string) $r['version'],
                'title'    => $f['title'],
                'what'     => $f['what'] . ' ' . sprintf(
                    /* translators: 1: sapi, 2: when, 3: source */
                    __('(Read from the web server, %1$s, %2$s, via %3$s.)', 'dcc-ragusa'),
                    (string) $r['sapi'],
                    Site::stamp((int) ($r['ts'] ?? 0)),
                    (string) ($r['source'] ?? 'tick')
                ),
                'did'      => __('Ragusa changed nothing: PHP is the host\'s to update.', 'dcc-ragusa'),
                'todo'     => $f['todo'],
            ]);
        }
        Alerts::resolve_missing(Fortress::LOVRIJENAC, $kinds, $present);
        $branch = preg_replace('/^(\d+\.\d+).*/', '$1', (string) $r['version']);
        $latest = $feed['branches'][$branch]['version'] ?? '';
        $line   = $f === null
            /* translators: %s: version */
            ? sprintf(__('PHP %s Current', 'dcc-ragusa'), (string) $r['version'])
            : ($f['kind'] === 'php-eol'
                /* translators: %s: version */
                ? sprintf(__('PHP %s No Longer Supported', 'dcc-ragusa'), (string) $r['version'])
                /* translators: 1: running, 2: latest */
                : sprintf(__('PHP %1$s, %2$s Is Out', 'dcc-ragusa'), (string) $r['version'], $latest));
        State::set('php_check', ['line' => $line, 'ok' => true, 'current' => $f === null, 'version' => (string) $r['version']]);
    }

    /** For the status line and the report. */
    public static function line(): string
    {
        $c = (array) State::get('php_check', []);
        return (string) ($c['line'] ?? __('PHP Not Checked Yet', 'dcc-ragusa'));
    }

    // -------------------------------------------------- the settings files

    /** @return string[] absolute paths that exist: this root's, and live's when staging sits inside it */
    public static function settings_paths(): array
    {
        $dirs = [Site::abspath()];
        $parent = dirname(Site::abspath());
        if ($parent !== Site::abspath() && Error_Log::is_wordpress_root($parent)) {
            $dirs[] = $parent;
        }
        $out = [];
        foreach ($dirs as $dir) {
            foreach (self::SETTINGS_FILES as $name) {
                if (is_file($dir . '/' . $name)) {
                    $out[] = $dir . '/' . $name;
                }
            }
        }
        return $out;
    }

    /** Every tick: a changed PHP settings file is a finding with the diff; the new content is the baseline. */
    public static function check_settings(): array
    {
        $lines = [];
        $b     = get_option('dcc_ragusa_baselines', []);
        $b     = is_array($b) ? $b : [];
        $seen  = (array) ($b['php_settings'] ?? []);
        $first = !isset($b['php_settings']);
        $now   = [];
        foreach (self::settings_paths() as $abs) {
            $content   = (string) @file_get_contents($abs, false, null, 0, self::SETTINGS_MAX);
            $now[$abs] = $content;
            if ($first || !array_key_exists($abs, $seen)) {
                if (!$first) {
                    $lines[] = self::changed($abs, '', $content, true);
                }
                continue;
            }
            if ($seen[$abs] !== $content) {
                $lines[] = self::changed($abs, (string) $seen[$abs], $content, false);
            }
        }
        foreach ($seen as $abs => $old) {
            if (!isset($now[$abs])) {
                $lines[] = self::changed((string) $abs, (string) $old, '', false);
            }
        }
        if ($first || $now !== $seen) {
            $b['php_settings'] = $now;
            if (get_option('dcc_ragusa_baselines', null) === null) {
                add_option('dcc_ragusa_baselines', $b, '', 'no');
            } else {
                update_option('dcc_ragusa_baselines', $b, 'no');
            }
            if ($first) {
                /* translators: %d: files */
                $lines[] = sprintf(__('PHP settings files baselined: %d.', 'dcc-ragusa'), count($now));
            }
        }
        return $lines;
    }

    private static function changed(string $abs, string $old, string $new, bool $appeared): string
    {
        $rel  = Site::rel($abs);
        $name = $rel === $abs ? basename(dirname($abs)) . '/' . basename($abs) : $rel;
        $diff = self::diff($old, $new);
        $what = $new === ''
            /* translators: %s: file */
            ? sprintf(__('%s was removed.', 'dcc-ragusa'), $name)
            : ($appeared
                /* translators: %s: file */
                ? sprintf(__('%s appeared.', 'dcc-ragusa'), $name)
                /* translators: %s: file */
                : sprintf(__('%s changed.', 'dcc-ragusa'), $name));
        Events::record(Fortress::LOVRIJENAC, Events::NEEDS_LOOK, 'php-settings-changed', $name, $what, ['diff' => $diff]);
        Alerts::raise([
            'fortress' => Fortress::LOVRIJENAC,
            'severity' => Events::NEEDS_LOOK,
            'kind'     => 'php-settings-changed',
            'target'   => $name . '@' . substr(hash('sha256', $new), 0, 8),
            /* translators: %s: file name */
            'title'    => sprintf(__('PHP Settings File Changed: %s', 'dcc-ragusa'), basename($abs)),
            'what'     => $what . ' ' . __('The host writes its emergency mitigations here; so would an intruder.', 'dcc-ragusa') . "\n\n" . $diff,
            'did'      => __('Ragusa recorded the new content as the baseline and changed nothing.', 'dcc-ragusa'),
            'todo'     => __('If the host announced a mitigation (a comment in the file usually says so), nothing to do. Otherwise ask the site director to look.', 'dcc-ragusa'),
        ]);
        return $what;
    }

    /** Removed lines with "- ", added with "+ ", at most 40 of each; never the unchanged ones. */
    public static function diff(string $old, string $new): string
    {
        $a   = preg_split('/\r?\n/', rtrim($old)) ?: [];
        $b   = preg_split('/\r?\n/', rtrim($new)) ?: [];
        $out = [];
        $n   = 0;
        foreach (array_diff($a, $b) as $line) {
            if ($line !== '' && $n++ < 40) {
                $out[] = '- ' . $line;
            }
        }
        $n = 0;
        foreach (array_diff($b, $a) as $line) {
            if ($line !== '' && $n++ < 40) {
                $out[] = '+ ' . $line;
            }
        }
        return $out === [] ? __('(only whitespace or order changed)', 'dcc-ragusa') : implode("\n", $out);
    }
}
