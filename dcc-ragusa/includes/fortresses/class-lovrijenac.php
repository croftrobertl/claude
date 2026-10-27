<?php
namespace DCCR\Fortress;

use DCCR\Alerts;
use DCCR\Budget;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Settings;
use DCCR\Site;
use DCCR\State;
use DCCR\Text;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lovrijenac · Reads The Warnings. The Wordfence Intelligence v3 scanner
 * feed once a day (streamed, size-limited, validated, reduced to this
 * site's slugs, last good copy kept), wordpress.org's closed-plugin signal
 * weekly, core's own update check, and a baked PHP end-of-life table.
 * It never installs anything from a feed.
 */
final class Lovrijenac
{
    public const FEED_URL   = 'https://www.wordfence.com/api/intelligence/v3/vulnerabilities/scanner';
    public const FEED_LIMIT = 64 * 1024 * 1024;
    public const FEED_HOUR  = 3;
    public const FEED_MIN   = 40;
    public const INFO_URL   = 'https://api.wordpress.org/plugins/info/1.2/';

    /** Written 2026-10-21; flagged stale after a year. */
    public const PHP_EOL = ['8.1' => '2025-12-31', '8.2' => '2026-12-31', '8.3' => '2027-12-31', '8.4' => '2028-12-31', '8.5' => '2029-12-31'];
    public const PHP_TABLE_DATE = '2026-10-21';

    /** @return string[] */
    public static function due(Budget $budget): array
    {
        $lines = [];
        if (self::feed_due()) {
            $lines[] = self::fetch_feed();
        }
        $lines = array_merge($lines, self::wporg_chunk($budget));
        $lines = array_merge($lines, \DCCR\Php_Patch::check_settings(), \DCCR\Php_Patch::ensure_reading());
        if (self::php_due()) {
            State::set('php_check_ts', time());
            $lines = array_merge($lines, \DCCR\Php_Patch::due());
        }
        // Judged every tick from the reading and the cached list (no request): a new reading is judged at once.
        \DCCR\Php_Patch::evaluate();
        self::evaluate();
        return $lines;
    }

    /** Once a day, in the first tick after 04:10 ET (after the feed). The tick holds the budget, so never twice a day. */
    public static function php_due(): bool
    {
        $last = (int) State::get('php_check_ts', 0);
        if ($last === 0) {
            return true;
        }
        $now  = Site::now();
        $same = (new \DateTimeImmutable('@' . $last))->setTimezone(Site::tz())->format('Y-m-d') === $now->format('Y-m-d');
        return !$same && ((int) $now->format('G') > 4 || ((int) $now->format('G') === 4 && (int) $now->format('i') >= 10));
    }

    // ---------------------------------------------------------------- feed

    public static function feed_due(): bool
    {
        if (Settings::secret('feed_key') === '') {
            return false;
        }
        $feed = (array) State::get('feed', []);
        $now  = Site::now();
        $last = (int) ($feed['ts'] ?? 0);
        $same_day = $last > 0 && (new \DateTimeImmutable('@' . $last))->setTimezone(Site::tz())->format('Y-m-d') === $now->format('Y-m-d');
        if ($same_day) {
            return false;
        }
        $h = (int) $now->format('G');
        $m = (int) $now->format('i');
        return $h > self::FEED_HOUR || ($h === self::FEED_HOUR && $m >= self::FEED_MIN);
    }

    private static function feed_dir(): string
    {
        return Vault::dir() . '/feed';
    }

    /** Fetch, validate, reduce. Returns a report line. */
    public static function fetch_feed(): string
    {
        $key = Settings::secret('feed_key');
        $tmp = self::feed_dir() . '/download.tmp';
        @unlink($tmp);
        $resp = wp_remote_get(self::FEED_URL, [
            'timeout'             => 25,
            'stream'              => true,
            'filename'            => $tmp,
            'limit_response_size' => self::FEED_LIMIT,
            'sslverify'           => true,
            'headers'             => ['Authorization' => 'Bearer ' . $key, 'Accept' => 'application/json', 'User-Agent' => 'DCC-Ragusa/' . DCCR_VERSION],
        ]);
        $state = (array) State::get('feed', []);
        $fail  = function (string $why) use (&$state, $tmp): string {
            @unlink($tmp);
            $state['ts']    = time();
            $state['error'] = $why;
            State::set('feed', $state);
            Events::record(Fortress::LOVRIJENAC, Events::NEEDS_LOOK, 'feed-rejected', 'wordfence', Text::scrub($why));
            Alerts::raise([
                'fortress' => Fortress::LOVRIJENAC,
                'severity' => Events::NEEDS_LOOK,
                'kind'     => 'feed-rejected',
                'target'   => 'wordfence',
                'title'    => __('Vulnerability Feed Not Read', 'dcc-ragusa'),
                /* translators: %s: reason */
                'what'     => sprintf(__('Today\'s vulnerability feed was rejected: %s.', 'dcc-ragusa'), $why),
                'did'      => __('Ragusa kept yesterday\'s good copy and will try again tomorrow.', 'dcc-ragusa'),
                'todo'     => __('Nothing unless this repeats for a week; then ask the site director to check the Wordfence key.', 'dcc-ragusa'),
            ]);
            return 'Feed rejected: ' . Text::scrub($why);
        };
        if (is_wp_error($resp)) {
            return $fail('request failed: ' . $resp->get_error_message());
        }
        $code = (int) wp_remote_retrieve_response_code($resp);
        if ($code !== 200) {
            return $fail($code === 401 || $code === 403 ? __('the key was refused (HTTP ' . $code . ')', 'dcc-ragusa') : 'HTTP ' . $code);
        }
        clearstatcache(true, $tmp);
        $size = (int) @filesize($tmp);
        if ($size < 1024) {
            return $fail('response too small (' . $size . ' bytes)');
        }
        $last_size = (int) ($state['raw_size'] ?? 0);
        if ($last_size > 0 && $size < $last_size * 0.25) {
            return $fail(sprintf('response shrank from %s to %s', Text::bytes($last_size), Text::bytes($size)));
        }
        $raw = (string) file_get_contents($tmp);
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $raw)) {
            return $fail('control characters in the payload');
        }
        $trim = trim($raw);
        if ($trim === '' || $trim[0] !== '{' || !str_ends_with($trim, '}') || !str_contains($raw, '"software"')) {
            return $fail('not a vulnerability feed (no JSON object with software records)');
        }
        unset($trim);
        $installed = self::installed();
        $hits      = [];
        foreach (array_keys($installed['plugins']) as $slug) {
            if (strpos($raw, '"slug":"' . $slug . '"') !== false || strpos($raw, '"slug": "' . $slug . '"') !== false) {
                $hits[] = $slug;
            }
        }
        $core_hit = strpos($raw, '"type":"core"') !== false || strpos($raw, '"type": "core"') !== false;
        $reduced  = [];
        $records  = 0;
        if ($hits !== [] || $core_hit) {
            $limit = self::memory_limit_bytes();
            if ($limit > 0 && $size * 6 > $limit - memory_get_usage()) {
                return $fail(sprintf('feed too large for this host to parse (%s)', Text::bytes($size)));
            }
            $data = json_decode($raw, true);
            unset($raw);
            if (!is_array($data)) {
                return $fail('not a JSON object');
            }
            $records = count($data);
            $valid   = 0;
            foreach ($data as $id => $rec) {
                if (!is_array($rec) || !isset($rec['id'], $rec['title'], $rec['software'], $rec['references']) || !is_array($rec['software'])) {
                    continue;
                }
                $valid++;
                foreach ($rec['software'] as $sw) {
                    if (!is_array($sw)) {
                        continue;
                    }
                    $type = (string) ($sw['type'] ?? '');
                    $slug = (string) ($sw['slug'] ?? '');
                    if ($type === 'core' || ($type === 'plugin' && isset($installed['plugins'][$slug])) || ($type === 'theme' && $slug === $installed['theme'])) {
                        $reduced[(string) $id] = self::slim($rec);
                        break;
                    }
                }
            }
            unset($data);
            if ($valid === 0) {
                return $fail('no record had the four expected fields');
            }
        } else {
            unset($raw);
        }
        @unlink($tmp);
        Vault::write_atomic(self::feed_dir() . '/last-good.json', (string) wp_json_encode(['ts' => time(), 'records' => $reduced]));
        State::set('feed', ['ts' => time(), 'raw_size' => $size, 'records' => $records, 'reduced' => count($reduced), 'error' => '']);
        Alerts::resolve(Events::fingerprint(Fortress::LOVRIJENAC, 'feed-rejected', 'wordfence'));
        Events::record(Fortress::LOVRIJENAC, Events::INFO, 'feed-read', 'wordfence', sprintf(
            /* translators: 1: size, 2: matching records */
            __('Feed read (%1$s); %2$d records concern this site.', 'dcc-ragusa'),
            Text::bytes($size),
            count($reduced)
        ));
        return sprintf('Feed read: %s, %d matching records', Text::bytes($size), count($reduced));
    }

    private static function slim(array $rec): array
    {
        $software = [];
        foreach ((array) $rec['software'] as $sw) {
            if (!is_array($sw)) {
                continue;
            }
            $software[] = [
                'type'              => (string) ($sw['type'] ?? ''),
                'slug'              => (string) ($sw['slug'] ?? ''),
                'name'              => (string) ($sw['name'] ?? ''),
                'affected_versions' => is_array($sw['affected_versions'] ?? null) ? $sw['affected_versions'] : [],
                'patched'           => !empty($sw['patched']),
                'patched_versions'  => array_values(array_map('strval', (array) ($sw['patched_versions'] ?? []))),
            ];
        }
        $copyrights = [];
        if (is_array($rec['copyrights'] ?? null)) {
            foreach ($rec['copyrights'] as $k => $c) {
                if ($k === 'message' && is_string($c)) {
                    $copyrights[] = $c;
                } elseif (is_array($c) && isset($c['notice'])) {
                    $copyrights[] = (string) $c['notice'];
                }
            }
        }
        return [
            'id'         => (string) ($rec['id'] ?? ''),
            'title'      => mb_substr((string) ($rec['title'] ?? ''), 0, 200),
            'software'   => $software,
            'references' => array_slice(array_values(array_filter((array) ($rec['references'] ?? []), 'is_string')), 0, 3),
            'published'  => (string) ($rec['published'] ?? ''),
            'cvss'       => is_array($rec['cvss'] ?? null) ? ['score' => (float) ($rec['cvss']['score'] ?? 0), 'rating' => (string) ($rec['cvss']['rating'] ?? '')] : null,
            'copyrights' => array_slice($copyrights, 0, 3),
        ];
    }

    private static function memory_limit_bytes(): int
    {
        $v = (string) ini_get('memory_limit');
        if ($v === '' || $v === '-1') {
            return 0;
        }
        $n = (int) $v;
        return match (strtolower(substr($v, -1))) {
            'g'     => $n * 1024 ** 3,
            'm'     => $n * 1024 ** 2,
            'k'     => $n * 1024,
            default => $n,
        };
    }

    /** @return array{plugins:array<string,array{version:string,name:string,file:string}>,theme:string,theme_version:string,core:string} */
    public static function installed(): array
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $plugins = [];
        foreach (get_plugins() as $file => $data) {
            $slug = dirname($file);
            if ($slug === '.') {
                $slug = basename($file, '.php');
            }
            $plugins[$slug] = ['version' => (string) ($data['Version'] ?? ''), 'name' => (string) ($data['Name'] ?? $slug), 'file' => (string) $file];
        }
        $theme   = function_exists('wp_get_theme') ? wp_get_theme() : null;
        global $wp_version;
        return [
            'plugins'       => $plugins,
            'theme'         => $theme ? (string) $theme->get_stylesheet() : '',
            'theme_version' => $theme ? (string) $theme->get('Version') : '',
            'core'          => (string) $wp_version,
        ];
    }

    /** Is $version inside any of the feed's affected ranges? */
    public static function affected(string $version, array $ranges): bool
    {
        if ($version === '') {
            return false;
        }
        foreach ($ranges as $r) {
            if (!is_array($r)) {
                continue;
            }
            $from = (string) ($r['from_version'] ?? '*');
            $to   = (string) ($r['to_version'] ?? '*');
            $fi   = !isset($r['from_inclusive']) || !empty($r['from_inclusive']);
            $ti   = !isset($r['to_inclusive']) || !empty($r['to_inclusive']);
            $ok_from = $from === '*' || version_compare($version, $from, $fi ? '>=' : '>');
            $ok_to   = $to === '*' || version_compare($version, $to, $ti ? '<=' : '<');
            if ($ok_from && $ok_to) {
                return true;
            }
        }
        return false;
    }

    /** @return array<int,array> findings from the last good copy */
    public static function matches(): array
    {
        $file = self::feed_dir() . '/last-good.json';
        if (!is_readable($file)) {
            return [];
        }
        $data = json_decode((string) file_get_contents($file), true);
        if (!is_array($data) || !isset($data['records']) || !is_array($data['records'])) {
            return [];
        }
        $installed = self::installed();
        $out       = [];
        foreach ($data['records'] as $rec) {
            foreach ((array) ($rec['software'] ?? []) as $sw) {
                $type = (string) ($sw['type'] ?? '');
                $slug = (string) ($sw['slug'] ?? '');
                $version = '';
                if ($type === 'plugin' && isset($installed['plugins'][$slug])) {
                    $version = $installed['plugins'][$slug]['version'];
                } elseif ($type === 'theme' && $slug === $installed['theme']) {
                    $version = $installed['theme_version'];
                } elseif ($type === 'core') {
                    $version = $installed['core'];
                    $slug    = 'core';
                } else {
                    continue;
                }
                if (self::affected($version, (array) ($sw['affected_versions'] ?? []))) {
                    $out[] = ['type' => $type, 'slug' => $slug, 'version' => $version, 'name' => (string) ($sw['name'] ?? $slug), 'record' => $rec, 'patched' => !empty($sw['patched']), 'patched_versions' => (array) ($sw['patched_versions'] ?? [])];
                }
            }
        }
        return $out;
    }

    // ----------------------------------------------------------- wordpress.org

    /** Ten slugs per tick, each at most weekly. @return string[] */
    private static function wporg_chunk(Budget $budget): array
    {
        $installed = self::installed();
        $seen      = (array) State::get('wporg', []);
        $n         = 0;
        foreach ($installed['plugins'] as $slug => $info) {
            if (time() - (int) ($seen[$slug]['checked'] ?? 0) < 7 * 86400) {
                continue;
            }
            if ($n >= 10 || $budget->remaining() < 1.5) {
                break;
            }
            $n++;
            $seen[$slug] = self::wporg_info($slug);
        }
        foreach (array_keys($seen) as $slug) {
            if (!isset($installed['plugins'][$slug])) {
                unset($seen[$slug]);
            }
        }
        State::set('wporg', $seen);
        return $n > 0 ? [sprintf('Checked %d plugins against wordpress.org', $n)] : [];
    }

    /** @return array{checked:int,closed:bool,reason:string,last_updated:string,tested:string,known:bool} */
    public static function wporg_info(string $slug): array
    {
        $url  = add_query_arg([
            'action'                     => 'plugin_information',
            'request[slug]'              => $slug,
            'request[fields][sections]'  => 0,
            'request[fields][versions]'  => 0,
            'request[fields][banners]'   => 0,
            'request[fields][icons]'     => 0,
            'request[fields][screenshots]' => 0,
        ], self::INFO_URL);
        $resp = wp_remote_get($url, ['timeout' => 10, 'limit_response_size' => 1024 * 1024, 'sslverify' => true]);
        $out  = ['checked' => time(), 'closed' => false, 'reason' => '', 'last_updated' => '', 'tested' => '', 'known' => false];
        if (is_wp_error($resp)) {
            $out['checked'] = time() - 6 * 86400; // retry tomorrow
            return $out;
        }
        $data = json_decode((string) wp_remote_retrieve_body($resp), true);
        if (!is_array($data)) {
            return $out;
        }
        if (!empty($data['closed'])) {
            $out['closed'] = true;
            $out['known']  = true;
            $out['reason'] = (string) ($data['reason_text'] ?? $data['reason'] ?? '');
            return $out;
        }
        if (isset($data['error'])) {
            return $out; // not a wordpress.org plugin
        }
        $out['known']        = true;
        $out['last_updated'] = (string) ($data['last_updated'] ?? '');
        $out['tested']       = (string) ($data['tested'] ?? '');
        return $out;
    }

    // ------------------------------------------------------------ evaluate

    /** Turn the feed, the wordpress.org signals, core and PHP into findings. */
    public static function evaluate(): void
    {
        $present   = [];
        $installed = self::installed();
        $vulns     = self::matches();
        foreach ($vulns as $v) {
            $fp        = Events::fingerprint(Fortress::LOVRIJENAC, 'vuln', $v['slug'] . '@' . $v['version']);
            $present[] = $fp;
            $rec       = $v['record'];
            $notice    = implode(' ', (array) ($rec['copyrights'] ?? []));
            $notice    = 'Vulnerability data provided by Wordfence Intelligence.' . ($notice !== '' ? ' ' . $notice : '');
            Alerts::raise([
                'fortress' => Fortress::LOVRIJENAC,
                'severity' => Events::NEEDS_LOOK,
                'kind'     => 'vuln',
                'target'   => $v['slug'] . '@' . $v['version'],
                /* translators: %s: plugin name */
                'title'    => sprintf(__('%s Has A Known Weakness', 'dcc-ragusa'), $v['name']),
                /* translators: 1: name, 2: version, 3: title */
                'what'     => sprintf(__('%1$s %2$s is affected by a published vulnerability: %3$s.', 'dcc-ragusa'), $v['name'], $v['version'], (string) $rec['title']),
                'did'      => __('Ragusa installed nothing: Lovrijenac never installs code from a feed.', 'dcc-ragusa'),
                'todo'     => $v['patched'] && $v['patched_versions'] !== []
                    /* translators: %s: version */
                    ? sprintf(__('Open Ragusa and tap Update Now, which updates to %s through Sveti Ivan\'s checks.', 'dcc-ragusa'), implode(' / ', array_slice($v['patched_versions'], 0, 2)))
                    : __('No fixed version is published yet. Ask the site director whether to deactivate this plugin until one is.', 'dcc-ragusa'),
                'notice'   => $notice,
            ]);
        }
        $seen = (array) State::get('wporg', []);
        foreach ($seen as $slug => $info) {
            if (!empty($info['closed'])) {
                $fp        = Events::fingerprint(Fortress::LOVRIJENAC, 'closed', $slug);
                $present[] = $fp;
                Alerts::raise([
                    'fortress' => Fortress::LOVRIJENAC,
                    'severity' => Events::NEEDS_LOOK,
                    'kind'     => 'closed',
                    'target'   => $slug,
                    /* translators: %s: slug */
                    'title'    => sprintf(__('Plugin Closed On WordPress.org: %s', 'dcc-ragusa'), $slug),
                    /* translators: 1: slug, 2: reason */
                    'what'     => sprintf(__('%1$s has been closed on WordPress.org (%2$s), so it will receive no more updates.', 'dcc-ragusa'), $slug, (string) ($info['reason'] ?: __('no reason given', 'dcc-ragusa'))),
                    'did'      => __('Ragusa changed nothing.', 'dcc-ragusa'),
                    'todo'     => __('Ask the site director whether to replace it.', 'dcc-ragusa'),
                ]);
            } elseif (!empty($info['known']) && $info['last_updated'] !== '' && strtotime((string) $info['last_updated']) !== false && time() - strtotime((string) $info['last_updated']) > 2 * 365 * 86400) {
                $fp        = Events::fingerprint(Fortress::LOVRIJENAC, 'stale', $slug);
                $present[] = $fp;
                Alerts::raise(['fortress' => Fortress::LOVRIJENAC, 'severity' => Events::INFO, 'kind' => 'stale', 'target' => $slug,
                    /* translators: %s: slug */
                    'title' => sprintf(__('Plugin Not Updated In Two Years: %s', 'dcc-ragusa'), $slug), 'what' => sprintf(__('%s was last updated on %s.', 'dcc-ragusa'), $slug, (string) $info['last_updated'])]);
            }
        }
        // Core.
        if (!function_exists('get_core_updates')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }
        $updates = function_exists('get_core_updates') ? (array) get_core_updates() : [];
        foreach ($updates as $u) {
            if (is_object($u) && ($u->response ?? '') === 'upgrade' && !empty($u->current) && version_compare((string) $u->current, $installed['core'], '>')) {
                $fp        = Events::fingerprint(Fortress::LOVRIJENAC, 'core-behind', (string) $u->current);
                $present[] = $fp;
                Alerts::raise(['fortress' => Fortress::LOVRIJENAC, 'severity' => Events::NEEDS_LOOK, 'kind' => 'core-behind', 'target' => (string) $u->current,
                    'title' => __('WordPress Core Update Available', 'dcc-ragusa'),
                    /* translators: 1: installed, 2: available */
                    'what' => sprintf(__('WordPress %1$s is installed and %2$s is available.', 'dcc-ragusa'), $installed['core'], (string) $u->current),
                    'did' => __('Ragusa changed nothing: core updates are checked but never installed or rolled back by it.', 'dcc-ragusa'),
                    'todo' => __('Update from Dashboard → Updates when convenient.', 'dcc-ragusa')]);
                break;
            }
        }
        // PHP: the baked table is the fallback while php.net has never answered (Php_Patch judges otherwise).
        $php  = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;
        $eol  = self::PHP_EOL[$php] ?? null;
        $feed = (array) State::get('php_feed', []);
        if (empty($feed['branches']) && $eol !== null && strtotime($eol) < time()) {
            $fp        = Events::fingerprint(Fortress::LOVRIJENAC, 'php-eol', $php);
            $present[] = $fp;
            Alerts::raise(['fortress' => Fortress::LOVRIJENAC, 'severity' => Events::NEEDS_LOOK, 'kind' => 'php-eol', 'target' => $php,
                /* translators: %s: php version */
                'title' => sprintf(__('PHP %s No Longer Receives Security Fixes', 'dcc-ragusa'), $php),
                /* translators: 1: version, 2: date */
                'what' => sprintf(__('This site runs PHP %1$s, whose security support ended on %2$s.', 'dcc-ragusa'), $php, $eol), 'did' => __('Ragusa changed nothing.', 'dcc-ragusa'), 'todo' => __('Ask the site director to move the account to a supported PHP version in cPanel.', 'dcc-ragusa')]);
        }
        if (time() - strtotime(self::PHP_TABLE_DATE) > 365 * 86400) {
            $fp        = Events::fingerprint(Fortress::LOVRIJENAC, 'php-table-stale', 'table');
            $present[] = $fp;
            Alerts::raise(['fortress' => Fortress::LOVRIJENAC, 'severity' => Events::INFO, 'kind' => 'php-table-stale', 'target' => 'table', 'title' => __('PHP Support Table Is Over A Year Old', 'dcc-ragusa'), 'what' => __('Ragusa\'s baked table of PHP end-of-life dates is more than a year old.', 'dcc-ragusa')]);
        }
        Alerts::resolve_missing(Fortress::LOVRIJENAC, ['vuln', 'closed', 'stale', 'core-behind', 'php-eol', 'php-table-stale'], $present);
        self::update_status(count($vulns), count($installed['plugins']));
    }

    private static function update_status(int $vulns, int $plugins): void
    {
        $feed = (array) State::get('feed', []);
        $when = (int) ($feed['ts'] ?? 0);
        if (Settings::secret('feed_key') === '') {
            $feed_line = __('No Feed Key Yet', 'dcc-ragusa');
        } elseif (!empty($feed['error'])) {
            $feed_line = __('Feed Rejected, Last Good Copy In Use', 'dcc-ragusa');
        } else {
            /* translators: %s: relative time */
            $feed_line = $when > 0 ? sprintf(__('Feed Read %s', 'dcc-ragusa'), Site::both($when)) : __('Feed Not Read Yet', 'dcc-ragusa');
        }
        $line = $vulns === 0
            /* translators: %d: plugins */
            ? sprintf(__('No Known Weakness In %d Plugins', 'dcc-ragusa'), $plugins)
            /* translators: %d: count */
            : sprintf(_n('%d Plugin Has A Known Weakness', '%d Plugins Have A Known Weakness', $vulns, 'dcc-ragusa'), $vulns);
        State::set('lovrijenac.base', $line . ' · ' . $feed_line);
        Fortress::set_status(Fortress::LOVRIJENAC, Alerts::worst(Fortress::LOVRIJENAC), $line . ' · ' . $feed_line . ' · ' . \DCCR\Php_Patch::line());
    }

    /**
     * Rebuild the card's PHP part from the live reading, keeping the rest of
     * the line and when it was checked. Called when a reading lands, and
     * before the status command and the page print the row.
     */
    public static function refresh_php(): void
    {
        $base = State::get('lovrijenac.base');
        if (!is_string($base) || $base === '') {
            return; // no tick yet: nothing to refresh
        }
        $s = Fortress::status(Fortress::LOVRIJENAC);
        Fortress::set_status(Fortress::LOVRIJENAC, Alerts::worst(Fortress::LOVRIJENAC), $base . ' · ' . \DCCR\Php_Patch::line(), (int) ($s['checked_at'] ?? 0) ?: null);
    }

    /**
     * "Update Now": core's updater for one slug, which runs through Revelin
     * and Sveti Ivan like any other update. Returns [ok, message].
     */
    public static function update_now(string $slug): array
    {
        $installed = self::installed();
        if (!isset($installed['plugins'][$slug])) {
            return [false, __('That plugin is not installed.', 'dcc-ragusa')];
        }
        $file = $installed['plugins'][$slug]['file'];
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/misc.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        wp_update_plugins();
        $skin     = new \Automatic_Upgrader_Skin();
        $upgrader = new \Plugin_Upgrader($skin);
        $result   = $upgrader->upgrade($file);
        if ($result === true) {
            /* translators: %s: slug */
            return [true, sprintf(__('%s was updated; Sveti Ivan is checking it.', 'dcc-ragusa'), $slug)];
        }
        if (is_wp_error($result)) {
            return [false, Text::scrub($result->get_error_message())];
        }
        return [false, __('WordPress reported no update available for it right now.', 'dcc-ragusa')];
    }
}
