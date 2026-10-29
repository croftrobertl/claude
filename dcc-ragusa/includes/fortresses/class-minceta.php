<?php
namespace DCCR\Fortress;

use DCCR\Action\Quarantine;
use DCCR\Alerts;
use DCCR\Budget;
use DCCR\Checksums;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Htaccess;
use DCCR\Journal;
use DCCR\Packages;
use DCCR\Site;
use DCCR\State;
use DCCR\Text;
use DCCR\Vault;
use DCCR\Walker;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Minčeta · Watches The Files. Core against api.wordpress.org, wordpress.org
 * plugins against their published checksums, everything else against the
 * baseline Ragusa took on first sight. Size and mtime first, hash only what
 * changed, a full rehash weekly, all in resumable chunks under a time budget.
 */
final class Minceta
{
    public const PASS_INTERVAL = 3600;
    public const FULL_INTERVAL = 7 * 86400;
    public const QUOTA_BYTES   = 10 * 1024 * 1024 * 1024;
    public const DISK_ALERT    = 90;

    public const EXEC_EXT = ['php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'pht', 'phps', 'shtml', 'cgi', 'pl', 'py', 'sh'];

    /** Relative to uploads/: exact path and byte size. */
    public const STUB_ALLOWLIST = [
        'wp-staging/index.php'          => 679,
        'wp-staging/cache/index.php'    => 679,
        'wp-staging/logs/index.php'     => 679,
        'wp-staging/backups/index.php'  => 679,
        'wpforms/cache/index.php'       => 99,
        'motopress-calendar/index.php'  => 6,
        'mphb/index.php'                => 28,
        'mphb_protected_uploads/index.php' => 28,
    ];

    public const BENIGN_STUBS = ['<?php', '<?php // Silence is golden.', '<?php // Silence is golden', '<?php /* Silence is golden. */', '<?php exit;'];

    public const MU_VENDOR = ['endurance-page-cache.php', 'sso.php', 'wp-staging-optimizer.php'];

    public const CRITICAL_OPTIONS = ['siteurl', 'home', 'admin_email', 'users_can_register', 'default_role', 'active_plugins'];

    /** Files their owner regenerates on a schedule: a change is info, unless the file gains PHP. */
    public const SELF_WRITERS = ['llms.txt' => 'AIOSEO'];

    /** A file written this long after a recorded plugin update belongs to that update. */
    public const UPDATE_WINDOW = 1800;

    /** Directories (relative to ABSPATH) the walk never enters. */
    public const SKIP_DIRS = [
        'wp-content/uploads', 'wp-content/upgrade', 'wp-content/upgrade-temp-backup', 'wp-content/cache',
        'wp-content/languages', 'wp-content/jetpack-waf', 'wp-content/updraft', 'wp-content/ai1wm-backups',
        'wp-content/backups-dup-pro', 'wp-content/speedycache', 'wp-content/et-cache', 'wp-content/w3tc-config',
        'wp-content/wpstg-tmp', 'staging', 'cgi-bin', '.well-known', 'wp-content/mu-plugins/vendor',
    ];

    private static ?array $index = null;
    private static bool   $index_dirty = false;

    // -------------------------------------------------------- the index

    private static function index_file(): string
    {
        return Vault::dir() . '/index/files.json';
    }

    public static function index(): array
    {
        if (self::$index === null) {
            self::$index = [];
            $file = self::index_file();
            if (is_readable($file)) {
                $data = json_decode((string) file_get_contents($file), true);
                if (is_array($data) && isset($data['files']) && is_array($data['files'])) {
                    self::$index = $data['files'];
                }
            }
        }
        return self::$index;
    }

    private static function save_index(): void
    {
        if (!self::$index_dirty || self::$index === null) {
            return;
        }
        Vault::write_atomic(self::index_file(), (string) wp_json_encode(['v' => 1, 'files' => self::$index]));
        self::$index_dirty = false;
    }

    public static function reset_cache(): void
    {
        self::$index       = null;
        self::$index_dirty = false;
    }

    // ------------------------------------------------- the quick checks

    /** @return string[] */
    public static function quick(): array
    {
        $lines = Revelin::check_guards();
        $lines = array_merge($lines, self::check_options(), self::check_jetpack(), self::check_sentinels(), self::uploads_fresh());
        self::update_status();
        return $lines;
    }

    /**
     * Every tick, not only at the walk: an executable file that just landed
     * under uploads is found within ten minutes. Only folders whose own
     * time moved since the last look are read (a folder's mtime changes
     * when a file is added or removed in it), so the sweep is cheap.
     *
     * @return string[]
     */
    public static function uploads_fresh(): array
    {
        $last = (int) State::get('uploads_fresh_ts', 0);
        State::set('uploads_fresh_ts', time());
        if ($last === 0) {
            return []; // the first walk covers what is there
        }
        $root  = Site::uploads_dir();
        if (!is_dir($root)) {
            return [];
        }
        $since = $last - 60;
        $found = [];
        $p     = ['fps' => []];
        $stack = [$root];
        $n     = 0;
        while ($stack !== [] && $n++ < 20000) {
            $dir = array_pop($stack);
            $rel = Site::rel($dir);
            if (\DCCR\Drill::owns_path($rel) || Vault::owns($dir)) {
                continue;
            }
            $items = @scandir($dir) ?: [];
            $fresh = (int) @filemtime($dir) >= $since;
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') {
                    continue;
                }
                $abs = $dir . '/' . $item;
                if (is_dir($abs)) {
                    $stack[] = $abs;
                } elseif ($fresh && self::is_executable_name($item)) {
                    $found[] = $abs;
                }
            }
        }
        $lines = [];
        foreach ($found as $abs) {
            $before = count($p['fps']);
            self::uploads_file(substr($abs, strlen($root) + 1), $abs, $p);
            if (count($p['fps']) > $before) {
                /* translators: %s: path */
                $lines[] = sprintf(__('Fresh executable under uploads: %s.', 'dcc-ragusa'), Site::rel($abs));
            }
        }
        return $lines;
    }

    private static function baselines(): array
    {
        $b = get_option('dcc_ragusa_baselines', []);
        return is_array($b) ? $b : [];
    }

    private static function save_baselines(array $b): void
    {
        if (get_option('dcc_ragusa_baselines', null) === null) {
            add_option('dcc_ragusa_baselines', $b, '', 'no');
        } else {
            update_option('dcc_ragusa_baselines', $b, 'no');
        }
    }

    /** The six critical options, each change reported once and then accepted. */
    public static function check_options(): array
    {
        $lines = [];
        $b     = self::baselines();
        $seen  = $b['options'] ?? null;
        $now   = [];
        foreach (self::CRITICAL_OPTIONS as $name) {
            $value      = get_option($name);
            $now[$name] = is_scalar($value) ? (string) $value : sha1((string) wp_json_encode($value));
        }
        if ($seen === null) {
            $b['options'] = $now;
            self::save_baselines($b);
            return [__('Critical options baselined.', 'dcc-ragusa')];
        }
        foreach ($now as $name => $value) {
            if (($seen[$name] ?? null) === $value) {
                continue;
            }
            if ($name === 'active_plugins') {
                $old_set = (array) get_option('dcc_ragusa_active_plugins_seen', []);
                $cur_set = (array) get_option('active_plugins', []);
                if ($old_set !== [] && array_diff($cur_set, $old_set) === [] && array_diff($old_set, $cur_set) === []) {
                    continue; // a reorder or a --force reinstall: the same plugins, nothing to say
                }
            }
            $severity = $name === 'active_plugins' ? Events::NEEDS_LOOK : Events::BREACHED;
            $what     = $name === 'active_plugins'
                ? __('The list of active plugins changed.', 'dcc-ragusa')
                /* translators: 1: option, 2: old value, 3: new value */
                : sprintf(__('The option %1$s changed from "%2$s" to "%3$s".', 'dcc-ragusa'), $name, (string) ($seen[$name] ?? ''), $value);
            if ($name === 'active_plugins') {
                $old = (array) get_option('dcc_ragusa_active_plugins_seen', []);
                $cur = (array) get_option('active_plugins', []);
                $added   = array_values(array_diff($cur, $old));
                $removed = array_values(array_diff($old, $cur));
                if ($old !== []) {
                    $what .= ' ' . sprintf(
                        /* translators: 1: added, 2: removed */
                        __('Added: %1$s. Removed: %2$s.', 'dcc-ragusa'),
                        $added === [] ? '—' : implode(', ', array_map('dirname', $added)),
                        $removed === [] ? '—' : implode(', ', array_map('dirname', $removed))
                    );
                }
                if (get_option('dcc_ragusa_active_plugins_seen', null) === null) {
                    add_option('dcc_ragusa_active_plugins_seen', $cur, '', 'no');
                } else {
                    update_option('dcc_ragusa_active_plugins_seen', $cur, 'no');
                }
            }
            Events::record(Fortress::MINCETA, $severity, 'option-changed', $name, $what);
            Alerts::raise([
                'fortress' => Fortress::MINCETA,
                'severity' => $severity,
                'kind'     => 'option-changed',
                'target'   => $name . '@' . time(),
                /* translators: %s: option name */
                'title'    => sprintf(__('Option Changed: %s', 'dcc-ragusa'), $name),
                'what'     => $what,
                'did'      => __('Ragusa recorded it and changed nothing: options are never edited on its own.', 'dcc-ragusa'),
                'todo'     => $severity === Events::BREACHED
                    ? __('If you did not make this change, change the administrator passwords now and ask the site director to put the old value back.', 'dcc-ragusa')
                    : __('If you did not activate or deactivate a plugin, ask the site director to look.', 'dcc-ragusa'),
            ]);
            $lines[] = 'Option changed: ' . $name;
        }
        if ($now !== $seen) {
            $b['options'] = $now;
            self::save_baselines($b);
        }
        if (get_option('dcc_ragusa_active_plugins_seen', null) === null) {
            add_option('dcc_ragusa_active_plugins_seen', (array) get_option('active_plugins', []), '', 'no');
        }
        return $lines;
    }

    /** Jetpack's waf, protect and monitor stay on; the firewall's mode and rules file too. */
    public static function check_jetpack(): array
    {
        $lines   = [];
        $present = [];
        $raise   = static function (string $kind, string $target, string $title, string $what) use (&$present): void {
            $present[] = Events::fingerprint(Fortress::MINCETA, $kind, $target);
            Alerts::raise([
                'fortress' => Fortress::MINCETA,
                'severity' => Events::BREACHED,
                'kind'     => $kind,
                'target'   => $target,
                'title'    => $title,
                'what'     => $what,
                'did'      => __('Ragusa changed nothing: Jetpack is never touched.', 'dcc-ragusa'),
                'todo'     => __('Open Jetpack → Settings → Security and switch it back on, or ask the site director.', 'dcc-ragusa'),
            ]);
        };
        if (!class_exists('Jetpack') || !method_exists('Jetpack', 'is_module_active')) {
            $raise('jetpack-missing', 'jetpack', __('Jetpack Is Not Running', 'dcc-ragusa'), __('The Jetpack plugin is not active, so its firewall and brute-force protection are off.', 'dcc-ragusa'));
            $lines[] = 'Jetpack missing';
        } else {
            foreach (['waf', 'protect', 'monitor'] as $module) {
                if (!\Jetpack::is_module_active($module)) {
                    /* translators: %s: module */
                    $raise('jetpack-module-off', $module, sprintf(__('Jetpack Module Off: %s', 'dcc-ragusa'), $module), sprintf(__('Jetpack\'s %s module is switched off.', 'dcc-ragusa'), $module));
                    $lines[] = 'Jetpack module off: ' . $module;
                }
            }
            if (\Jetpack::is_module_active('waf')) {
                $mode = (string) get_option('jetpack_waf_mode', '');
                if ($mode !== '' && $mode !== 'normal') {
                    /* translators: %s: mode */
                    $raise('jetpack-waf-mode', 'waf', __('Firewall Not In Blocking Mode', 'dcc-ragusa'), sprintf(__('Jetpack\'s firewall mode is "%s" instead of "normal", so it logs but does not block.', 'dcc-ragusa'), $mode));
                }
                $rules = Site::content_dir() . '/jetpack-waf/rules/rules.php';
                if (is_file($rules) && trim((string) file_get_contents($rules)) === '<?php') {
                    $raise('jetpack-rules-empty', 'rules.php', __('Firewall Rules File Is Empty', 'dcc-ragusa'), __('jetpack-waf/rules/rules.php is the empty file Jetpack writes when the firewall is switched off.', 'dcc-ragusa'));
                }
            }
        }
        Alerts::resolve_missing(Fortress::MINCETA, ['jetpack-missing', 'jetpack-module-off', 'jetpack-waf-mode', 'jetpack-rules-empty'], $present);
        return $lines;
    }

    /**
     * wp-config.php by hash, the drop-ins and the root index.php. The PHP
     * settings files (.user.ini, php.ini) are Lovrijenac's (with the diff).
     * The walk skips every file named here: one owner, one finding per change.
     */
    public static function check_sentinels(): array
    {
        $lines  = [];
        $b      = self::baselines();
        $seen   = $b['sentinels'] ?? [];
        $first  = ($b['sentinels'] ?? null) === null;
        $root   = Site::abspath();
        $wc     = Site::content_dir();
        $files  = [
            'wp-config.php'                => $root . '/wp-config.php',
            'index.php'                    => $root . '/index.php',
            'wp-content/db.php'            => $wc . '/db.php',
            'wp-content/object-cache.php'  => $wc . '/object-cache.php',
            'wp-content/db-error.php'      => $wc . '/db-error.php',
            'wp-content/sunrise.php'       => $wc . '/sunrise.php',
            'wp-content/advanced-cache.php' => $wc . '/advanced-cache.php',
        ];
        $now     = [];
        $present = [];
        foreach ($files as $rel => $abs) {
            $now[$rel] = is_file($abs) ? (string) hash_file('sha256', $abs) : '';
            if ($first) {
                continue;
            }
            $was = (string) ($seen[$rel] ?? '');
            if ($was === $now[$rel]) {
                continue;
            }
            if ($rel === 'wp-content/advanced-cache.php') {
                Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::INFO, 'kind' => 'churn', 'target' => $rel, 'title' => __('Cache Drop-In Rewritten', 'dcc-ragusa'), 'what' => __('advanced-cache.php changed; SpeedyCache rewrites it.', 'dcc-ragusa')]);
                continue;
            }
            $what = $now[$rel] === ''
                /* translators: %s: path */
                ? sprintf(__('%s was removed.', 'dcc-ragusa'), $rel)
                : ($was === ''
                    /* translators: %s: path */
                    ? sprintf(__('%s appeared. Nothing of Rob\'s writes there.', 'dcc-ragusa'), $rel)
                    /* translators: %s: path */
                    : sprintf(__('%s changed.', 'dcc-ragusa'), $rel));
            $fp        = Events::fingerprint(Fortress::MINCETA, 'sentinel-changed', $rel . '@' . substr($now[$rel], 0, 8));
            $present[] = $fp;
            Events::record(Fortress::MINCETA, Events::BREACHED, 'sentinel-changed', $rel, $what);
            Alerts::raise([
                'fortress' => Fortress::MINCETA,
                'severity' => Events::BREACHED,
                'kind'     => 'sentinel-changed',
                'target'   => $rel . '@' . substr($now[$rel], 0, 8),
                /* translators: %s: path */
                'title'    => sprintf(__('Changed: %s', 'dcc-ragusa'), $rel),
                'what'     => $what,
                'did'      => $rel === 'wp-config.php'
                    ? __('Ragusa only hashes wp-config.php and never reads or restores it.', 'dcc-ragusa')
                    : __('Ragusa recorded it. This file is not one it restores on its own.', 'dcc-ragusa'),
                /* translators: %s: path */
                'todo'     => sprintf(__('If the site director changed %s on purpose, run wp ragusa seal %s. Otherwise ask them to inspect it now.', 'dcc-ragusa'), $rel, $rel),
            ]);
            $lines[] = 'Changed: ' . $rel;
        }
        if ($first || $now !== $seen) {
            $b['sentinels'] = $now;
            self::save_baselines($b);
        }
        return $lines;
    }

    // ---------------------------------------------------------- the walk

    /** Should this relative path be left out of the walk? */
    /** Files a per-tick check owns; the walk never reports them a second time. */
    public const OWNED_ELSEWHERE = [
        'wp-config.php', 'index.php', '.user.ini', 'php.ini',
        'wp-content/db.php', 'wp-content/object-cache.php', 'wp-content/db-error.php',
        'wp-content/sunrise.php', 'wp-content/advanced-cache.php',
    ];

    public static function skip(string $rel, bool $is_dir): bool
    {
        $base = basename($rel);
        if (!$is_dir && in_array($rel, self::OWNED_ELSEWHERE, true)) {
            return true;
        }
        if (\DCCR\Drill::owns_path($rel)) {
            return true; // practice leaves no trace in the walk
        }
        if ($is_dir) {
            if (in_array($rel, self::SKIP_DIRS, true)) {
                return true;
            }
            if ($base === '.git' || $base === 'node_modules' || str_starts_with($base, 'ragusa-vault')) {
                return true;
            }
            return str_starts_with($rel, 'wp-content/wpstg') || Vault::owns(Site::abspath() . '/' . $rel);
        }
        if ($base === 'error_log' || $base === 'php_errorlog' || $base === '.DS_Store' || str_ends_with($base, '.log')) {
            return true;
        }
        if (str_ends_with($base, '.ragusa-tmp') || str_contains($base, '.tmp-')) {
            return true;
        }
        return false;
    }

    /** @return array{phase:string,after:string,started:int,full:bool,pass:int,seen:int,changed:int,new:int} */
    private static function pass_state(): array
    {
        $p = (array) State::get('minceta.pass', []);
        return $p + ['phase' => 'idle', 'after' => '', 'started' => 0, 'full' => false, 'pass' => 0, 'seen' => 0, 'changed' => 0, 'new' => 0, 'fps' => []];
    }

    /** One chunk of the walk, within the budget. Returns a report line or ''. */
    public static function walk(Budget $budget, bool $force = false): string
    {
        $p = self::pass_state();
        if ($p['phase'] === 'idle') {
            $last = (int) State::get('last_full_pass', 0);
            $full = time() - (int) State::get('last_rehash', 0) >= self::FULL_INTERVAL;
            if (!$force && $last > 0 && time() - $last < self::PASS_INTERVAL) {
                return '';
            }
            $p = ['phase' => 'site', 'after' => '', 'started' => time(), 'full' => $full, 'pass' => ((int) State::get('minceta.pass_no', 0)) + 1, 'seen' => 0, 'changed' => 0, 'new' => 0, 'fps' => []];
            State::set('minceta.pass_no', $p['pass']);
        }
        $index = self::index();
        // The FIRST COMPLETE PASS is the baseline, however many ticks it
        // takes: the flag is set only when a pass finishes.
        $first = !(bool) State::get('minceta.baselined', false);
        $n     = 0;
        $root  = Site::abspath();
        $stop  = false;

        while (!$stop && $p['phase'] !== 'done') {
            [$walk_root, $prefix, $skip] = self::phase_root($p['phase']);
            $gen = Walker::iterate($walk_root, $p['after'], $skip);
            $any = false;
            foreach ($gen as $rel => $abs) {
                $any = true;
                $n++;
                $p['seen']++;
                $p['after'] = $rel;
                $site_rel   = $prefix === '' ? $rel : $prefix . '/' . $rel;
                if ($p['phase'] === 'uploads') {
                    self::uploads_file($rel, $abs, $p);
                } else {
                    self::site_file($site_rel, $abs, $p, $first);
                }
                if ($n % 25 === 0) {
                    Vault::progress();
                    if ($budget->exhausted()) {
                        $stop = true;
                        break;
                    }
                }
            }
            if (!$stop) {
                $p['phase'] = self::next_phase($p['phase']);
                $p['after'] = '';
            }
            unset($any);
        }

        if ($p['phase'] === 'done') {
            self::finish_pass($p, $first);
            $p = ['phase' => 'idle', 'after' => '', 'started' => 0, 'full' => false, 'pass' => $p['pass'], 'seen' => 0, 'changed' => 0, 'new' => 0, 'fps' => []];
        }
        State::set('minceta.pass', $p);
        self::save_index();
        /* translators: 1: files, 2: phase */
        return sprintf(__('Walked %1$d files (%2$s).', 'dcc-ragusa'), $n, $p['phase'] === 'idle' ? __('pass complete', 'dcc-ragusa') : $p['phase']);
    }

    private static function next_phase(string $phase): string
    {
        return match ($phase) {
            'site'    => 'content',
            'content' => 'uploads',
            default   => 'done',
        };
    }

    /** @return array{0:string,1:string,2:callable} */
    private static function phase_root(string $phase): array
    {
        $root = Site::abspath();
        switch ($phase) {
            case 'site':
                return [$root, '', static function (string $rel, bool $is_dir): bool {
                    if ($is_dir && $rel === 'wp-content') {
                        return true;
                    }
                    return self::skip($rel, $is_dir);
                }];
            case 'content':
                return [Site::content_dir(), 'wp-content', static fn(string $rel, bool $is_dir): bool => self::skip('wp-content/' . $rel, $is_dir)];
            default:
                return [Site::uploads_dir(), 'wp-content/uploads', static function (string $rel, bool $is_dir): bool {
                    $base = basename($rel);
                    if (\DCCR\Drill::owns_path($rel)) {
                        return true;
                    }
                    return $is_dir && (str_starts_with($base, 'ragusa-vault') || Vault::owns(Site::uploads_dir() . '/' . $rel));
                }];
        }
    }

    // ------------------------------------------------- core and content

    private static ?array $core_map = null;
    private static array  $plugin_maps = [];

    private static function core_map(): array
    {
        if (self::$core_map === null) {
            global $wp_version;
            self::$core_map = Checksums::core((string) $wp_version, function_exists('get_locale') ? get_locale() : 'en_US') ?? [];
        }
        return self::$core_map;
    }

    /** @return array|null sha256 map for a wordpress.org plugin, keyed by path inside the plugin */
    private static function plugin_map(string $slug): ?array
    {
        if (!array_key_exists($slug, self::$plugin_maps)) {
            $version = Revelin::plugin_version($slug);
            self::$plugin_maps[$slug] = $version === '' ? null : Checksums::plugin($slug, $version);
        }
        return self::$plugin_maps[$slug];
    }

    private static function expectation(string $site_rel): array
    {
        $core = self::core_map();
        if (isset($core[$site_rel])) {
            return ['src' => 'core', 'algo' => 'md5', 'hash' => strtolower((string) $core[$site_rel])];
        }
        if (preg_match('#^wp-content/plugins/([^/]+)/(.+)$#', $site_rel, $m)) {
            $map = self::plugin_map($m[1]);
            if ($map !== null) {
                return isset($map[$m[2]])
                    ? ['src' => 'wporg', 'algo' => 'sha256', 'hash' => $map[$m[2]]]
                    : ['src' => 'wporg-extra', 'algo' => 'sha256', 'hash' => null];
            }
        }
        return ['src' => 'base', 'algo' => 'sha256', 'hash' => null];
    }

    private static function hash(string $abs, string $algo): string
    {
        return (string) hash_file($algo, $abs);
    }

    private static function site_file(string $site_rel, string $abs, array &$p, bool $first): void
    {
        clearstatcache(true, $abs);
        $size  = (int) @filesize($abs);
        $mtime = (int) @filemtime($abs);
        $index = self::index();
        $known = $index[$site_rel] ?? null;
        $exp   = self::expectation($site_rel);

        $unchanged = $known !== null && !$p['full'] && (int) $known['s'] === $size && (int) $known['m'] === $mtime && ($known['x'] ?? '') === $exp['src'];
        if ($unchanged) {
            self::$index[$site_rel]['p'] = $p['pass'];
            self::$index_dirty = true;
            return;
        }
        $hash = self::hash($abs, $exp['algo']);
        $entry = ['s' => $size, 'm' => $mtime, 'h' => $hash, 'x' => $exp['src'], 'p' => $p['pass']];

        if ($exp['hash'] !== null) {
            // A published expectation: compare now.
            if ($hash !== $exp['hash']) {
                $p['changed']++;
                self::finding_published($site_rel, $exp['src'], $p);
            }
        } elseif ($known === null) {
            if (!$first) {
                $p['new']++;
                $by = self::attribution($site_rel, $mtime);
                if ($by !== null) {
                    self::attributed($site_rel, $by, $p, 'file-new');
                } else {
                    self::finding_new($site_rel, $exp['src'], $p);
                }
            }
        } elseif (($known['h'] ?? '') !== $hash) {
            $p['changed']++;
            if ($site_rel === '.htaccess') {
                $p['prev_h']['.htaccess'] = (string) ($known['h'] ?? ''); // what Newfold's backup should hold
            }
            $by = self::attribution($site_rel, $mtime);
            if ($by !== null) {
                self::attributed($site_rel, $by, $p, 'file-changed');
            } elseif (self::self_written($site_rel, $abs, $p)) {
                // info only, recorded in self_written()
            } else {
                self::finding_changed($site_rel, $exp['src'], $p);
            }
        }
        self::$index[$site_rel] = $entry;
        self::$index_dirty      = true;
    }

    private static function location(string $rel): array
    {
        $base = basename($rel);
        if ($rel === 'wp-content/advanced-cache.php') {
            return [Events::INFO, 'churn']; // SpeedyCache rewrites it
        }
        if (str_starts_with($rel, 'wp-content/mu-plugins/')) {
            if (in_array($base, self::MU_VENDOR, true)) {
                return [Events::INFO, 'mu-vendor'];
            }
            if (Revelin::guard_label(Site::abspath() . '/' . $rel) !== null) {
                return [Events::INFO, 'guard'];
            }
            return [str_starts_with($base, 'dcc-') ? Events::NEEDS_LOOK : Events::BREACHED, 'mu'];
        }
        if (str_starts_with($rel, 'wp-content/angie-snippets/')) {
            return [Events::INFO, 'angie'];
        }
        if (str_starts_with($rel, 'wp-content/plugins/dcc-ragusa/')) {
            return [Events::INFO, 'self'];
        }
        if (str_starts_with($rel, 'wp-content/plugins/')) {
            return [Events::NEEDS_LOOK, 'plugin'];
        }
        if (str_starts_with($rel, 'wp-content/themes/')) {
            return [Events::NEEDS_LOOK, 'theme'];
        }
        if (str_starts_with($rel, 'wp-admin/') || str_starts_with($rel, 'wp-includes/')) {
            return [Events::BREACHED, 'core-area'];
        }
        if (!str_contains($rel, '/')) {
            return [str_starts_with($base, 'wp-') || $base === 'index.php' ? Events::BREACHED : Events::NEEDS_LOOK, 'root'];
        }
        return [Events::NEEDS_LOOK, 'other'];
    }

    private static function finding_published(string $rel, string $src, array &$p): void
    {
        $core   = $src === 'core';
        $kind   = $core ? 'core-modified' : 'plugin-modified';
        $fp     = Events::fingerprint(Fortress::MINCETA, $kind, $rel);
        $p['fps'][] = $fp;
        Events::record(Fortress::MINCETA, $core ? Events::BREACHED : Events::NEEDS_LOOK, $kind, $rel, $core
            /* translators: %s: path */
            ? sprintf(__('%s does not match the WordPress checksum for this version.', 'dcc-ragusa'), $rel)
            /* translators: %s: path */
            : sprintf(__('%s does not match the published checksum for its plugin version.', 'dcc-ragusa'), $rel));
        Alerts::raise([
            'fortress' => Fortress::MINCETA,
            'severity' => $core ? Events::BREACHED : Events::NEEDS_LOOK,
            'kind'     => $kind,
            'target'   => $rel,
            'title'    => $core ? __('Core File Modified', 'dcc-ragusa') : __('Plugin File Modified', 'dcc-ragusa'),
            'what'     => $core
                /* translators: %s: path */
                ? sprintf(__('The WordPress file %s no longer matches the checksum WordPress.org publishes for this version.', 'dcc-ragusa'), $rel)
                /* translators: %s: path */
                : sprintf(__('The plugin file %s no longer matches the checksum WordPress.org publishes for its version.', 'dcc-ragusa'), $rel),
            'did'      => __('Ragusa recorded it and changed nothing: core and plugin files are never restored on its own.', 'dcc-ragusa'),
            'todo'     => $core
                ? __('Ask the site director to run wp core verify-checksums and, if needed, wp core download --force --skip-content.', 'dcc-ragusa')
                : __('Ask the site director to run wp plugin verify-checksums on it and reinstall the plugin if the change is not theirs.', 'dcc-ragusa'),
        ]);
    }

    /**
     * Who changed it: a recorded plugin (or core) update whose window covers
     * the file's time. The window runs from a minute before the update was
     * noticed to UPDATE_WINDOW after, so files a plugin writes outside its
     * own folder on its first run (wp-content/wp-staging/, uploads/<slug>/)
     * belong to the update too. Core and Ragusa's own files never: those
     * have their own rules.
     *
     * @return array{slug:string,version:string,id:int}|null
     */
    public static function attribution(string $rel, int $mtime): ?array
    {
        foreach (self::update_windows() as $w) {
            if (!empty($w['unseen'])) {
                continue; // an update nobody saw vouches for no file: a bumped version header is cheap to fake
            }
            if ($mtime >= $w['from'] && $mtime <= $w['to'] && self::belongs_to($rel, $w['slug'], $w['kind'] ?? 'plugin')) {
                return $w;
            }
        }
        return null;
    }

    /**
     * Where an update of this slug may write: its own folder, a folder of
     * its name under wp-content, uploads or cache, a must-use file of its
     * name. Core: the core areas and the bundled plugins and themes. Never
     * another plugin's folder, never a root file.
     */
    public static function belongs_to(string $rel, string $slug, string $kind = 'plugin'): bool
    {
        if ($kind === 'theme') {
            return $slug !== '' && str_starts_with($rel, 'wp-content/themes/' . $slug . '/');
        }
        if ($slug === 'core') {
            return str_starts_with($rel, 'wp-admin/') || str_starts_with($rel, 'wp-includes/')
                || preg_match('#^(wp-[a-z-]+\.php|index\.php|license\.txt|readme\.html)$#', $rel) === 1
                || str_starts_with($rel, 'wp-content/plugins/akismet/') || preg_match('#^wp-content/themes/twenty[a-z]+/#', $rel) === 1;
        }
        if ($slug === '' || $slug === 'dcc-ragusa') {
            return false;
        }
        $q = preg_quote($slug, '#');
        return preg_match('#^wp-content/plugins/' . $q . '/#', $rel) === 1                     // its own folder
            || preg_match('#^wp-content/mu-plugins/' . $q . '[a-z0-9-]*\.php$#', $rel) === 1    // a must-use file of its name
            || preg_match('#^wp-content/(uploads|cache)/' . $q . '(/|-[a-z0-9-]+/)#', $rel) === 1 // uploads/<slug>/, cache/<slug>-x/
            || preg_match('#^wp-content/' . $q . '(/|-[a-z0-9-]+/)#', $rel) === 1;               // wp-content/<slug>/
    }

    /** @return array<int,array{slug:string,version:string,id:int,from:int,to:int}> newest first */
    public static function update_windows(): array
    {
        $out = [];
        foreach (Journal::recent(30) as $row) {
            if (!in_array($row['action'], ['update-check', 'self-update', 'core-check', 'update-seen'], true) || $row['created_at'] < time() - 86400) {
                continue;
            }
            $before = (array) ($row['before'] ?? []);
            $out[]  = [
                'slug'    => (string) ($before['slug'] ?? $row['target']),
                'kind'    => $row['action'] === 'core-check' ? 'core' : (string) ($before['component'] ?? 'plugin'),
                'version' => (string) ($before['new_version'] ?? $before['version'] ?? ''),
                'old'     => (string) ($before['old_version'] ?? ''),
                'id'      => (int) $row['id'],
                'unseen'  => !empty($before['unseen']),
                'at'      => (int) ($before['installed_at'] ?? $row['created_at']),
                'from'    => (int) ($before['started'] ?? $row['created_at']) - 60,
                'to'      => (int) $row['created_at'] + self::UPDATE_WINDOW,
            ];
        }
        return $out;
    }

    /** The recorded update whose window and component cover this path, or null. */
    public static function window_for(string $rel, array $windows, int $pass_started): ?array
    {
        foreach ($windows as $w) {
            if ($pass_started <= $w['to'] && time() >= $w['from'] && self::belongs_to($rel, (string) $w['slug'], (string) ($w['kind'] ?? 'plugin'))) {
                return $w;
            }
        }
        return null;
    }

    private static function removed_by_update(string $rel, array $w, array &$p): void
    {
        $key = $w['kind'] . ':' . $w['slug'] . ':' . $w['version'];
        $p['removed'][$key][]  = $rel;
        $p['removed_by'][$key] = $w;
        Alerts::resolve(Events::fingerprint(Fortress::MINCETA, 'file-missing', $rel), true);
    }

    /**
     * Files an update removed, that its new version no longer ships: one info
     * line, on the update's journal row too. Never an email.
     */
    public static function record_removed(array $w, array $rels): void
    {
        if ($rels === []) {
            return;
        }
        $comp  = self::component_of($rels[0]);
        $label = trim($comp['name'] . ' ' . (string) $w['old'] . ' → ' . (string) $w['version']);
        $short = array_map(static fn($r) => self::inside($r, $w), $rels);
        Events::record(Fortress::MINCETA, Events::INFO, 'removed-by-update', (string) $w['slug'], sprintf(
            /* translators: 1: component and versions, 2: count, 3: files */
            _n('Removed by %1$s (the new version no longer ships it): %3$s', 'Removed by %1$s (the new version no longer ships them, %2$d files): %3$s', count($rels), 'dcc-ragusa'),
            $label,
            count($rels),
            implode(', ', array_slice($short, 0, 12)) . (count($short) > 12 ? ', …' : '')
        ), ['files' => $rels], (int) ($w['id'] ?? 0) ?: null);
        if ((int) ($w['id'] ?? 0) > 0) {
            Journal::annotate((int) $w['id'], sprintf('removed by this update: %s', implode(', ', array_slice($short, 0, 12)) . (count($short) > 12 ? ', …' : '')));
        }
    }

    private static function inside(string $rel, array $w): string
    {
        $prefix = Packages::prefix((string) ($w['kind'] ?? 'plugin'), (string) $w['slug']);
        return $prefix !== '' && str_starts_with($rel, $prefix) ? substr($rel, strlen($prefix)) : $rel;
    }

    /**
     * Whose file is it, and at what version now: a plugin, a theme, core, a
     * must-use plugin, or the site's own.
     *
     * @return array{kind:string,slug:string,name:string,version:string,wporg:bool}
     */
    public static function component_of(string $rel): array
    {
        if (preg_match('#^wp-content/plugins/([^/]+)/#', $rel, $m)) {
            $slug = $m[1];
            $file = Revelin::plugin_file($slug);
            $data = $file !== '' && function_exists('get_plugin_data') ? get_plugin_data(Site::plugins_dir() . '/' . $file, false, false) : [];
            $ver  = (string) ($data['Version'] ?? '');
            return ['kind' => 'plugin', 'slug' => $slug, 'name' => (string) (($data['Name'] ?? '') ?: $slug), 'version' => $ver, 'wporg' => $ver !== '' && Checksums::plugin($slug, $ver) !== null];
        }
        if (preg_match('#^wp-content/themes/([^/]+)/#', $rel, $m)) {
            $head = Sveti_Ivan::theme_header($m[1]);
            return ['kind' => 'theme', 'slug' => $m[1], 'name' => $head['name'] ?: $m[1], 'version' => $head['version'], 'wporg' => false];
        }
        if (str_starts_with($rel, 'wp-admin/') || str_starts_with($rel, 'wp-includes/') || preg_match('#^(wp-[a-z-]+\.php|index\.php|xmlrpc\.php)$#', $rel) === 1) {
            global $wp_version;
            return ['kind' => 'core', 'slug' => 'core', 'name' => 'WordPress', 'version' => (string) $wp_version, 'wporg' => true];
        }
        if (str_starts_with($rel, 'wp-content/mu-plugins/')) {
            return ['kind' => 'mu', 'slug' => basename($rel), 'name' => __('The must-use plugin', 'dcc-ragusa') . ' ' . basename($rel), 'version' => '', 'wporg' => false];
        }
        return ['kind' => 'other', 'slug' => '', 'name' => __('The site\'s own files', 'dcc-ragusa'), 'version' => '', 'wporg' => false];
    }

    /** The newest recorded update of a component in the last week, as a window-shaped row, or null. */
    public static function recent_update(array $comp): ?array
    {
        if (!in_array($comp['kind'], ['plugin', 'theme', 'core'], true)) {
            return null;
        }
        foreach (Journal::recent(60) as $row) {
            if (!in_array($row['action'], ['update-check', 'self-update', 'core-check', 'update-seen'], true) || $row['created_at'] < time() - 7 * 86400) {
                continue;
            }
            if ((string) $row['target'] !== ($comp['kind'] === 'core' ? 'core' : $comp['slug'])) {
                continue;
            }
            $b = (array) $row['before'];
            return ['slug' => (string) $row['target'], 'kind' => $comp['kind'], 'version' => (string) ($b['new_version'] ?? $b['version'] ?? ''), 'old' => (string) ($b['old_version'] ?? ''), 'id' => (int) $row['id'], 'unseen' => !empty($b['unseen']), 'at' => (int) ($b['installed_at'] ?? $row['created_at'])];
        }
        return null;
    }

    /**
     * A file that should be there is not. The email says whose it is, what
     * Ragusa knows about any update, how sure it is, and the one thing to do.
     * Returns the finding's fingerprint.
     */
    public static function raise_missing(string $rel, string $severity, ?array $w, ?bool $ships): string
    {
        $comp  = self::component_of($rel);
        $upd   = $w ?? self::recent_update($comp);
        $label = trim($comp['name'] . ($comp['version'] !== '' ? ' ' . $comp['version'] : ''));
        if ($upd !== null && $ships === null && $w === null) {
            $ships = Packages::ships((string) $upd['kind'], (string) $upd['slug'], (string) $upd['version'], $rel);
        }
        $what = [sprintf(
            /* translators: 1: path, 2: component and version */
            __('%1$s is gone. It belongs to %2$s.', 'dcc-ragusa'),
            $rel,
            $label
        )];
        if ($upd !== null) {
            $what[] = sprintf(
                /* translators: 1: name, 2: old version, 3: new version, 4: when, 5: journal */
                __('%1$s was updated from %2$s to %3$s at %4$s (journal %5$d).', 'dcc-ragusa'),
                $comp['name'],
                $upd['old'] !== '' ? $upd['old'] : '?',
                $upd['version'],
                Site::stamp((int) $upd['at']),
                (int) $upd['id']
            );
            $what[] = $ships === true
                /* translators: %s: version */
                ? sprintf(__('Version %s still includes this file, so the update should have left it in place.', 'dcc-ragusa'), $upd['version'])
                /* translators: %s: version */
                : sprintf(__('Ragusa could not get the list of files in version %s, so it cannot tell whether the update removed it.', 'dcc-ragusa'), $upd['version']);
        } elseif (in_array($comp['kind'], ['plugin', 'theme', 'core'], true)) {
            /* translators: %s: name */
            $what[] = sprintf(__('No update of %s was recorded in the last week.', 'dcc-ragusa'), $comp['name']);
        }
        $what[] = __('Ragusa is certain the file is gone; it cannot tell who removed it.', 'dcc-ragusa');
        $todo = match (true) {
            $comp['kind'] === 'plugin' && $comp['wporg'] => sprintf(
                /* translators: 1: name, 2: version, 3: slug */
                __('Forward this to the site director: reinstalling %1$s %2$s puts the file back (wp plugin install %3$s --version=%2$s --force).', 'dcc-ragusa'),
                $comp['name'],
                $comp['version'],
                $comp['slug']
            ),
            $comp['kind'] === 'core' => __('Forward this to the site director: wp core verify-checksums lists anything else that is wrong, and wp core download --force --skip-content puts core files back.', 'dcc-ragusa'),
            $comp['kind'] === 'plugin' || $comp['kind'] === 'theme' => sprintf(
                /* translators: %s: name */
                __('Forward this to the site director: if they did not remove it, they reinstall %s from its release.', 'dcc-ragusa'),
                $comp['name']
            ),
            default => __('Forward this to the site director today: they will know whether they removed it.', 'dcc-ragusa'),
        };
        $fp = Events::fingerprint(Fortress::MINCETA, 'file-missing', $rel);
        Events::record(Fortress::MINCETA, $severity, 'file-missing', $rel, implode(' ', $what), [], $upd !== null ? (int) $upd['id'] : null);
        Alerts::raise([
            'fortress' => Fortress::MINCETA,
            'severity' => $severity,
            'kind'     => 'file-missing',
            'target'   => $rel,
            /* translators: 1: file, 2: component */
            'title'    => sprintf(__('File Missing From %2$s: %1$s', 'dcc-ragusa'), basename($rel), $label),
            'what'     => implode(' ', $what),
            'did'      => __('Ragusa changed nothing; it restores only its own sealed copies.', 'dcc-ragusa'),
            'todo'     => $severity === Events::INFO ? '' : $todo,
        ]);
        return $fp;
    }

    /** Accepted as the baseline, tagged with the update; one info event per update at the pass end. */
    private static function attributed(string $rel, array $by, array &$p, string $kind): void
    {
        $p['attributed'][$by['slug'] . ' ' . $by['version']][] = $rel;
        $p['attributed_ids'][$by['slug'] . ' ' . $by['version']] = $by['id'];
        foreach (['file-new', 'file-changed', 'file-missing'] as $k) {
            Alerts::resolve(Events::fingerprint(Fortress::MINCETA, $k, $rel), true);
        }
    }

    /** A known self-writer regenerated its file, and it carries no PHP: info. */
    private static function self_written(string $rel, string $abs, array &$p): bool
    {
        if (!isset(self::SELF_WRITERS[$rel])) {
            return false;
        }
        if (self::has_php($abs)) {
            return false; // it gained PHP: the ordinary finding, with its severity
        }
        $owner = self::SELF_WRITERS[$rel];
        $fp    = Events::fingerprint(Fortress::MINCETA, 'self-written', $rel);
        $p['fps'][] = $fp;
        // Every change leaves a line in Recent Events (the finding is info: the digest has it once, the events always).
        Events::record(Fortress::MINCETA, Events::INFO, 'self-written', $rel, sprintf(
            /* translators: 1: file, 2: owner */
            __('%1$s Changed (Plain Text Only, As When %2$s Regenerates It).', 'dcc-ragusa'),
            basename($rel),
            $owner
        ));
        Alerts::resolve(Events::fingerprint(Fortress::MINCETA, 'file-changed', $rel), true);
        Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::INFO, 'kind' => 'self-written', 'target' => $rel,
            /* translators: 1: file, 2: owner */
            'title' => sprintf(__('%1$s Changed (Plain Text Only, As When %2$s Regenerates It)', 'dcc-ragusa'), basename($rel), $owner),
            /* translators: 1: file, 2: owner */
            'what'  => sprintf(__('%1$s changed and carries no PHP, which is how a regeneration by %2$s looks. Ragusa cannot tell who wrote it.', 'dcc-ragusa'), $rel, $owner)]);
        return true;
    }

    public const WPSTG_SSE = 'wp-content/wp-staging/sse/';

    /**
     * WP Staging's own files in its SSE folder, judged by content. WP Staging
     * 4.18.0 (Core/WPStaging.php, registerInitHook) deletes EVERY file older
     * than an hour in that folder once a day, on `init` of any request,
     * protection files included; DirectoryListing writes the four protection
     * files and SseEventCache its `<job>.sse.cache.php` files, which start
     * with `<?php exit(); ?>` and hold JSON. Their coming and going is WP
     * Staging's housekeeping. Anything else in the folder is a finding.
     */
    public static function wpstg_own(string $rel, string $abs): bool
    {
        if (!str_starts_with($rel, self::WPSTG_SSE) || str_contains(substr($rel, strlen(self::WPSTG_SSE)), '/')) {
            return false;
        }
        $base = basename($rel);
        if (!is_file($abs)) {
            // Gone: only the four protection files and WP Staging's cache files.
            return in_array($base, ['index.php', 'index.html', '.htaccess', 'web.config'], true) || preg_match('/^[A-Za-z0-9_-]+\.sse\.cache\.php$/', $base) === 1;
        }
        $c      = (string) @file_get_contents($abs, false, null, 0, 256 * 1024);
        $opens  = static fn(string $t): bool => preg_match('/<\?(php\b|=|\s)/i', $t) === 1; // PHP's open tags, not <?xml
        switch ($base) {
            case 'index.php':
                return self::comments_only_php($c);
            case 'index.html':
            case 'web.config':
                return !$opens($c);
            case '.htaccess':
                return !Htaccess::enables_execution($c) && !$opens($c);
        }
        if (preg_match('/^[A-Za-z0-9_-]+\.sse\.cache\.php$/', $base) === 1) {
            $header = "<?php exit(); ?>\n";
            return str_starts_with($c, $header) && !$opens(substr($c, strlen($header)));
        }
        return false;
    }

    /** PHP that does nothing: only the open tag, comments and whitespace. */
    public static function comments_only_php(string $code): bool
    {
        if (!function_exists('token_get_all')) {
            return false;
        }
        foreach (token_get_all($code) as $t) {
            if (!is_array($t) || !in_array($t[0], [T_OPEN_TAG, T_COMMENT, T_DOC_COMMENT, T_WHITESPACE, T_CLOSE_TAG], true)) {
                return false;
            }
        }
        return true;
    }

    public static function has_php(string $abs): bool
    {
        $head = (string) @file_get_contents($abs, false, null, 0, 512 * 1024);
        return preg_match('/<\?(php|=)|<script[^>]+language\s*=\s*["\']?php/i', $head) === 1;
    }

    private static function finding_new(string $rel, string $src, array &$p): void
    {
        [$severity, $where] = self::location($rel);
        if ($where === 'guard' || $where === 'self') {
            return; // Revelin's business
        }
        if (self::wpstg_own($rel, Site::abspath() . '/' . $rel)) {
            $p['wpstg_sse'] = (int) ($p['wpstg_sse'] ?? 0) + 1;
            return;
        }
        $kind = 'file-new';
        $fp   = Events::fingerprint(Fortress::MINCETA, $kind, $rel);
        $p['fps'][] = $fp;
        Alerts::resolve(Events::fingerprint(Fortress::MINCETA, 'file-missing', $rel)); // it is back
        /* translators: %s: path */
        $what = sprintf(__('A new file appeared: %s.', 'dcc-ragusa'), $rel);
        $nfd  = $rel === '.htaccess.nfd-backup' ? self::newfold_sentence($rel, $p) : '';
        if ($nfd !== '') {
            $what .= ' ' . $nfd;
        }
        if ($where === 'mu') {
            $what .= ' ' . __('Nothing legitimately adds a must-use plugin without the site director knowing.', 'dcc-ragusa');
        }
        Events::record(Fortress::MINCETA, $severity, $kind, $rel, $what);
        Alerts::raise([
            'fortress' => Fortress::MINCETA,
            'severity' => $severity,
            'kind'     => $kind,
            'target'   => $rel,
            /* translators: %s: path */
            'title'    => sprintf(__('New File: %s', 'dcc-ragusa'), basename($rel)),
            'what'     => $what,
            'did'      => __('Ragusa recorded it and changed nothing: it never quarantines outside the uploads folder.', 'dcc-ragusa'),
            /* translators: %s: path */
            'todo'     => sprintf(__('If this is the site director\'s, run wp ragusa seal %s. Otherwise ask them to inspect and remove it.', 'dcc-ragusa'), $rel),
        ]);
    }

    private static function finding_changed(string $rel, string $src, array &$p): void
    {
        [$severity, $where] = self::location($rel);
        if ($where === 'guard' || $where === 'self') {
            return;
        }
        if (self::wpstg_own($rel, Site::abspath() . '/' . $rel)) {
            $p['wpstg_sse'] = (int) ($p['wpstg_sse'] ?? 0) + 1;
            return;
        }
        if ($where === 'churn') {
            /* translators: %s: path */
            Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::INFO, 'kind' => 'churn', 'target' => $rel, 'title' => __('Cache Drop-In Rewritten', 'dcc-ragusa'), 'what' => sprintf(__('%s changed; SpeedyCache rewrites it.', 'dcc-ragusa'), $rel)]);
            return;
        }
        $kind = 'file-changed';
        $fp   = Events::fingerprint(Fortress::MINCETA, $kind, $rel);
        $p['fps'][] = $fp;
        /* translators: %s: path */
        $what = sprintf(__('%s changed since Ragusa last saw it.', 'dcc-ragusa'), $rel);
        $nfd  = in_array($rel, ['.htaccess', '.htaccess.nfd-backup'], true) ? self::newfold_sentence($rel, $p) : '';
        if ($nfd !== '') {
            $what .= ' ' . $nfd;
        }
        Events::record(Fortress::MINCETA, $severity, $kind, $rel, $what);
        Alerts::raise([
            'fortress' => Fortress::MINCETA,
            'severity' => $severity,
            'kind'     => $kind,
            'target'   => $rel,
            /* translators: %s: path */
            'title'    => sprintf(__('File Changed: %s', 'dcc-ragusa'), basename($rel)),
            'what'     => $what,
            'did'      => __('Ragusa recorded it and changed nothing.', 'dcc-ragusa'),
            'todo'     => $severity === Events::INFO
                ? ''
                : ($nfd !== '' && $rel === '.htaccess'
                    ? __('Ask the site director to compare it with the backup (diff .htaccess .htaccess.nfd-backup); if the difference is Newfold\'s, run wp ragusa seal .htaccess.', 'dcc-ragusa')
                    /* translators: %s: path */
                    : sprintf(__('If the site director changed it on purpose, run wp ragusa seal %s. Otherwise ask them to look.', 'dcc-ragusa'), $rel)),
        ]);
    }

    /**
     * The evidence that Newfold's Htaccess Manager made an .htaccess change:
     * it refreshes .htaccess.nfd-backup with the current file just before
     * each write. Said only when the backup's time fits; the finding stays,
     * because .htaccess decides what the server runs.
     */
    private static function newfold_sentence(string $rel, array $p): string
    {
        $m = Htaccess::newfold_marks(Site::abspath());
        if ($m === null || $m['gap'] === null || $m['gap'] < 0 || $m['gap'] > 5) {
            return '';
        }
        $prior = (string) ($p['prev_h']['.htaccess'] ?? (self::index()['.htaccess']['h'] ?? ''));
        $match = $prior !== '' && hash_equals($prior, $m['backup_hash']);
        if ($rel === '.htaccess') {
            $parts = [$match
                /* translators: %d: seconds */
                ? sprintf(__('Newfold Htaccess Manager (HostGator\'s) made this change: it refreshed its backup, .htaccess.nfd-backup, %d seconds before, and that backup holds exactly the .htaccess Ragusa had on record.', 'dcc-ragusa'), $m['gap'])
                /* translators: %d: seconds */
                : sprintf(__('Newfold Htaccess Manager (HostGator\'s) refreshed its backup, .htaccess.nfd-backup, %d seconds before this change, which is how it writes; but the backup is not the .htaccess Ragusa had on record, so another change may sit between them.', 'dcc-ragusa'), $m['gap'])];
        } else {
            $parts = [$match
                /* translators: %d: seconds */
                ? sprintf(__('It is Newfold Htaccess Manager\'s copy of the previous .htaccess, refreshed %d seconds before .htaccess changed, and it holds exactly the .htaccess Ragusa had on record.', 'dcc-ragusa'), $m['gap'])
                /* translators: %d: seconds */
                : sprintf(__('Newfold Htaccess Manager refreshes this backup just before it writes .htaccess (%d seconds apart here), but it is not the .htaccess Ragusa had on record.', 'dcc-ragusa'), $m['gap'])];
        }
        if ($m['version'] !== '' || $m['sha'] !== '') {
            $parts[] = sprintf(
                /* translators: 1: version, 2: sha256 prefix, 3: time */
                __('Its own block reads: Managed by Newfold Htaccess Manager v%1$s, STATE sha256 %2$s…, applied %3$s.', 'dcc-ragusa'),
                $m['version'] !== '' ? $m['version'] : '?',
                $m['sha'] !== '' ? substr($m['sha'], 0, 12) : '?',
                $m['applied'] > 0 ? Site::stamp($m['applied']) : '?'
            );
        }
        $changed = (int) @filemtime(Site::abspath() . '/.htaccess');
        $best    = null;
        foreach (self::update_windows() as $w) {
            $d = $changed - (int) $w['at'];
            if (!$w['unseen'] && $d >= 0 && $d <= 300 && ($best === null || $d < $best[0])) {
                $best = [$d, $w];
            }
        }
        if ($best !== null) {
            [$d, $w] = $best;
            $name    = $w['kind'] === 'plugin' ? self::component_of('wp-content/plugins/' . $w['slug'] . '/x')['name'] : ($w['kind'] === 'core' ? 'WordPress' : (string) $w['slug']);
            $parts[] = sprintf(
                /* translators: 1: seconds, 2: component, 3: old, 4: new, 5: journal */
                __('That was %1$d seconds after the %2$s update from %3$s to %4$s (journal %5$d).', 'dcc-ragusa'),
                $d,
                $name,
                $w['old'] !== '' ? $w['old'] : '?',
                $w['version'] !== '' ? $w['version'] : '?',
                (int) $w['id']
            );
        }
        $parts[] = __('Ragusa still reports it: .htaccess decides what the server runs.', 'dcc-ragusa');
        return implode(' ', $parts);
    }

    // ------------------------------------------------------------ uploads

    public static function is_executable_name(string $name): bool
    {
        $lower = strtolower($name);
        $parts = explode('.', $lower);
        if (count($parts) < 2) {
            return false;
        }
        return in_array(end($parts), self::EXEC_EXT, true);
    }

    private static function uploads_file(string $rel, string $abs, array &$p): void
    {
        $base = basename($rel);
        if ($base === '.htaccess' || $base === '.user.ini') {
            self::uploads_control_file($rel, $abs, $base, $p);
            return;
        }
        if (!self::is_executable_name($base)) {
            return;
        }
        clearstatcache(true, $abs);
        $size = (int) @filesize($abs);
        if (isset(self::STUB_ALLOWLIST[$rel]) && self::STUB_ALLOWLIST[$rel] === $size) {
            return;
        }
        $allow = (array) (self::baselines()['uploads_allow'] ?? []);
        if (isset($allow[Site::rel($abs)]) && (int) $allow[Site::rel($abs)] === $size) {
            return; // put back on request earlier
        }
        $head = $size <= 128 ? trim((string) preg_replace('/\s+/', ' ', (string) @file_get_contents($abs, false, null, 0, 128))) : '';
        if ($head !== '' && in_array($head, self::BENIGN_STUBS, true)) {
            Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::INFO, 'kind' => 'stub', 'target' => 'uploads/' . $rel, 'title' => __('New Index Stub In Uploads', 'dcc-ragusa'), 'what' => sprintf(
                /* translators: %s: path */
                __('uploads/%s is a plugin\'s own "silence is golden" stub.', 'dcc-ragusa'),
                $rel
            )]);
            return;
        }
        $p['fps'][] = Events::fingerprint(Fortress::MINCETA, 'quarantined', Site::rel($abs));
        Quarantine::run(['path' => $abs, 'reason' => __('an executable file inside the uploads folder', 'dcc-ragusa')]);
    }

    private static function uploads_control_file(string $rel, string $abs, string $base, array &$p): void
    {
        $b       = self::baselines();
        $seen    = (array) ($b['uploads_ht'] ?? []);
        // Every control file present on the first pass is the baseline.
        $first   = !(bool) State::get('uploads_ht_baselined', false);
        $content = (string) @file_get_contents($abs, false, null, 0, 4096);
        $hash    = hash('sha256', $content);
        if (!isset($b['uploads_ht'])) {
            $b['uploads_ht'] = [];
        }
        if (($seen[$rel] ?? null) === $hash) {
            return;
        }
        $dangerous = $base === '.htaccess' ? Htaccess::enables_execution($content) : Htaccess::ini_enables_execution($content);
        if ($first) {
            // First sight: baseline every control file, never quarantine.
            $b['uploads_ht'][$rel] = $hash;
            self::save_baselines($b);
            if ($dangerous) {
                Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::NEEDS_LOOK, 'kind' => 'uploads-control-baselined', 'target' => $rel, 'title' => __('Uploads Rule Baselined, Looks Permissive', 'dcc-ragusa'),
                    /* translators: %s: path */
                    'what' => sprintf(__('uploads/%s was present on first run and looks like it permits execution. Ragusa accepted it as the baseline and did not touch it.', 'dcc-ragusa'), $rel), 'did' => __('Nothing.', 'dcc-ragusa'), 'todo' => __('Ask the site director whether this file should exist.', 'dcc-ragusa')]);
            }
            return;
        }
        if ($dangerous) {
            $p['fps'][] = Events::fingerprint(Fortress::MINCETA, 'quarantined', Site::rel($abs));
            Quarantine::run(['path' => $abs, 'reason' => isset($seen[$rel])
                ? __('a changed uploads rule file that re-enables execution', 'dcc-ragusa')
                : __('a new uploads rule file that re-enables execution', 'dcc-ragusa')]);
            return;
        }
        $b['uploads_ht'][$rel] = $hash;
        self::save_baselines($b);
        Alerts::raise([
            'fortress' => Fortress::MINCETA,
            'severity' => Events::NEEDS_LOOK,
            'kind'     => 'uploads-control-changed',
            'target'   => $rel . '@' . substr($hash, 0, 8),
            'title'    => isset($seen[$rel]) ? __('Uploads Rule File Changed', 'dcc-ragusa') : __('New Uploads Rule File', 'dcc-ragusa'),
            'what'     => isset($seen[$rel])
                /* translators: %s: path */
                ? sprintf(__('uploads/%s changed. It does not re-enable execution.', 'dcc-ragusa'), $rel)
                /* translators: %s: path */
                : sprintf(__('A new uploads/%s appeared. It does not re-enable execution.', 'dcc-ragusa'), $rel),
            'did'      => __('Ragusa recorded it and left it in place.', 'dcc-ragusa'),
            'todo'     => __('If no plugin was just installed, ask the site director to look at it.', 'dcc-ragusa'),
        ]);
    }

    // --------------------------------------------------------- pass end

    /** A path the walk never visits now: skipped itself, or below a skipped folder. */
    public static function walk_ignores(string $rel): bool
    {
        if (self::skip($rel, false)) {
            return true;
        }
        for ($dir = dirname($rel); $dir !== '.' && $dir !== '' && $dir !== '/'; $dir = dirname($dir)) {
            if (self::skip($dir, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Drop from the baseline every path the walk no longer looks at (another
     * check owns it now, or its folder is skipped). Such a path is not
     * missing: the walk simply stopped visiting it. Returns the paths, and
     * writes one info line when there are any.
     *
     * @return string[]
     */
    public static function prune_unwatched(): array
    {
        $dropped = [];
        foreach (array_keys(self::index()) as $rel) {
            if (self::walk_ignores((string) $rel)) {
                unset(self::$index[$rel]);
                $dropped[] = (string) $rel;
            }
        }
        if ($dropped !== []) {
            self::$index_dirty = true;
            self::save_index();
            Events::record(Fortress::MINCETA, Events::INFO, 'baseline-pruned', 'walk', sprintf(
                /* translators: 1: count, 2: paths */
                _n('%1$d path left the file walk\'s baseline because another check owns it now (not missing): %2$s', '%1$d paths left the file walk\'s baseline because another check owns them now (not missing): %2$s', count($dropped), 'dcc-ragusa'),
                count($dropped),
                implode(', ', array_slice($dropped, 0, 12)) . (count($dropped) > 12 ? ', …' : '')
            ));
        }
        return $dropped;
    }

    private static function finish_pass(array $p, bool $first): void
    {
        self::prune_unwatched(); // never report as missing what the walk stopped visiting
        $index   = self::index();
        $missing = [];
        foreach ($index as $rel => $e) {
            if ((int) ($e['p'] ?? 0) !== $p['pass']) {
                if (str_starts_with($rel, 'wp-content/uploads/') || \DCCR\Drill::owns_path($rel)) {
                    unset(self::$index[$rel]);
                    self::$index_dirty = true;
                    continue;
                }
                $missing[] = $rel;
            }
        }
        $windows = self::update_windows();
        foreach ($missing as $rel) {
            unset(self::$index[$rel]);
            self::$index_dirty = true;
            [$severity, $where] = self::location($rel);
            if ($where === 'guard' || $where === 'self') {
                continue;
            }
            if (self::wpstg_own($rel, Site::abspath() . '/' . $rel)) {
                $p['wpstg_sse'] = (int) ($p['wpstg_sse'] ?? 0) + 1;
                continue; // WP Staging's daily cleanup
            }
            // Gone during an update's window, in that update's files: the update's
            // only if the new version no longer ships the file.
            $by    = self::window_for($rel, $windows, (int) $p['started']);
            $ships = $by === null ? null : Packages::ships((string) $by['kind'], (string) $by['slug'], (string) $by['version'], $rel);
            if ($by !== null && $ships === false) {
                self::removed_by_update($rel, $by, $p);
                continue;
            }
            if (($index[$rel]['x'] ?? '') === 'core') {
                $severity = Events::NEEDS_LOOK;
            }
            $p['fps'][] = self::raise_missing($rel, $severity, $by, $ships);
        }
        foreach ((array) ($p['removed'] ?? []) as $key => $rels) {
            self::record_removed((array) $p['removed_by'][$key], array_values(array_unique((array) $rels)));
        }
        // file-missing is not here: a file stays gone, so its finding stays
        // until the file is back, or `wp ragusa seal <path>` drops it.
        foreach ((array) ($p['attributed'] ?? []) as $update => $rels) {
            $rels = array_values(array_unique((array) $rels));
            Events::record(Fortress::MINCETA, Events::INFO, 'update-written', $update, sprintf(
                /* translators: 1: update, 2: count, 3: files */
                _n('%1$s wrote %2$d file outside its own folder, accepted as the baseline: %3$s', '%1$s wrote %2$d files outside its own folder, accepted as the baseline: %3$s', count($rels), 'dcc-ragusa'),
                $update,
                count($rels),
                implode(', ', array_slice($rels, 0, 12)) . (count($rels) > 12 ? ', …' : '')
            ), ['files' => $rels], (int) ($p['attributed_ids'][$update] ?? 0) ?: null);
        }
        if ((int) ($p['wpstg_sse'] ?? 0) > 0) {
            Events::record(Fortress::MINCETA, Events::INFO, 'wpstg-housekeeping', rtrim(self::WPSTG_SSE, '/'), sprintf(
                /* translators: %d: files */
                _n('%d of WP Staging\'s own files in its sse folder came or went (it empties that folder once a day); none carried code.', '%d of WP Staging\'s own files in its sse folder came or went (it empties that folder once a day); none carried code.', (int) $p['wpstg_sse'], 'dcc-ragusa'),
                (int) $p['wpstg_sse']
            ));
        }
        $kinds = ['core-modified', 'plugin-modified', 'file-new', 'file-changed', 'quarantined'];
        Alerts::resolve_missing(Fortress::MINCETA, $kinds, array_values(array_unique($p['fps'])));

        $total = count(self::$index ?? []);
        State::set('minceta.files', $total);
        State::set('last_full_pass', time());
        State::set('uploads_ht_baselined', true);
        State::set('minceta.baselined', true);
        if ($p['full']) {
            State::set('last_rehash', time());
        }
        State::set('minceta.last', ['seen' => $p['seen'], 'changed' => $p['changed'], 'new' => $p['new'], 'missing' => count($missing), 'full' => $p['full'], 'first' => $first, 'secs' => time() - $p['started']]);
        Events::record(Fortress::MINCETA, Events::INFO, $first ? 'baselined' : 'pass', 'walk', $first
            /* translators: %d: files */
            ? sprintf(__('First pass: %d files baselined.', 'dcc-ragusa'), $total)
            /* translators: 1: files, 2: changed, 3: new, 4: missing */
            : sprintf(__('Pass complete: %1$d files, %2$d changed, %3$d new, %4$d missing.', 'dcc-ragusa'), $total, $p['changed'], $p['new'], count($missing)));
        self::update_status();
    }

    /**
     * Accept a file or folder as it is now (a recorded plugin update, a
     * rollback, or `wp ragusa seal`). Returns how many files were new or
     * different from the index.
     */
    /** Files added, changed (size or time) and removed in a folder against the baseline, accepting nothing. */
    public static function compare_dir(string $abs): array
    {
        $abs    = rtrim($abs, '/');
        $prefix = Site::rel($abs) . '/';
        $index  = self::index();
        $out    = ['added' => [], 'changed' => [], 'removed' => []];
        $seen   = [];
        if (is_dir($abs)) {
            foreach (Vault::list_files($abs) as $f => $r) {
                $rel        = Site::rel((string) $f);
                $seen[$rel] = true;
                if (!isset($index[$rel])) {
                    $out['added'][] = $rel;
                } elseif ((int) $index[$rel]['s'] !== (int) @filesize((string) $f) || (int) $index[$rel]['m'] !== (int) @filemtime((string) $f)) {
                    $out['changed'][] = $rel;
                }
            }
        }
        foreach (array_keys($index) as $rel) {
            if (str_starts_with((string) $rel, $prefix) && !isset($seen[$rel])) {
                $out['removed'][] = (string) $rel;
            }
        }
        return $out;
    }

    public static function newest_mtime(string $abs): int
    {
        $max = 0;
        foreach (is_dir($abs) ? Vault::list_files($abs) : [] as $f => $r) {
            $max = max($max, (int) @filemtime((string) $f));
        }
        return $max;
    }

    /** Take paths out of the baseline (their absence was judged elsewhere). */
    public static function drop_from_index(array $rels): void
    {
        self::index();
        foreach ($rels as $rel) {
            if (isset(self::$index[$rel])) {
                unset(self::$index[$rel]);
                self::$index_dirty = true;
            }
        }
        self::save_index();
    }

    /** What the last rebaseline() found: files added, changed and removed (paths relative to the root). */
    public static array $last_diff = ['added' => [], 'changed' => [], 'removed' => []];

    public static function rebaseline(string $abs): int
    {
        $changed = 0;
        $abs   = rtrim($abs, '/');
        $index = self::index();
        $rels  = [];
        self::$last_diff = ['added' => [], 'changed' => [], 'removed' => []];
        if (is_dir($abs)) {
            foreach (Vault::list_files($abs) as $f => $r) {
                $rels[Site::rel($f)] = $f;
            }
            $prefix = Site::rel($abs) . '/';
            foreach (array_keys($index) as $rel) {
                if (str_starts_with($rel, $prefix) && !isset($rels[$rel])) {
                    unset(self::$index[$rel]);
                    self::$last_diff['removed'][] = (string) $rel;
                }
            }
        } elseif (is_file($abs)) {
            $rels[Site::rel($abs)] = $abs;
        }
        $pass = (int) State::get('minceta.pass_no', 0);
        self::$plugin_maps = [];
        foreach ($rels as $rel => $file) {
            $exp  = self::expectation($rel);
            $hash = self::hash($file, $exp['algo']);
            if (($index[$rel]['h'] ?? null) !== $hash) {
                $changed++;
                self::$last_diff[isset($index[$rel]) ? 'changed' : 'added'][] = (string) $rel;
            }
            self::$index[$rel] = ['s' => (int) filesize($file), 'm' => (int) filemtime($file), 'h' => $hash, 'x' => $exp['src'], 'p' => $pass];
            foreach (['file-new', 'file-changed', 'file-missing', 'plugin-modified', 'core-modified'] as $kind) {
                Alerts::resolve(Events::fingerprint(Fortress::MINCETA, $kind, $rel));
            }
        }
        self::$index_dirty = true;
        self::save_index();
        self::$plugin_maps = [];
        return $changed;
    }

    /**
     * A file (or folder) deleted on purpose: drop it from the baseline and
     * resolve what its absence raised. Returns how many entries or findings
     * were settled; zero means the baseline knew nothing about it.
     */
    /** Would forget() find anything for this path? (The confirmation screen asks before acting.) */
    public static function forget_would(string $abs): bool
    {
        $rel = Site::rel(rtrim($abs, '/'));
        foreach (array_keys(self::index()) as $k) {
            if ($k === $rel || str_starts_with($k, $rel . '/')) {
                return true;
            }
        }
        foreach (Alerts::active(Fortress::MINCETA) as $a) {
            $t = (string) ($a['target'] ?? '');
            if ($t === $rel || str_starts_with($t, $rel . '/')) {
                return true;
            }
        }
        return false;
    }

    public static function forget(string $abs): int
    {
        $rel   = Site::rel(rtrim($abs, '/'));
        $index = self::index();
        $rels  = [];
        foreach (array_keys($index) as $k) {
            if ($k === $rel || str_starts_with($k, $rel . '/')) {
                $rels[] = $k;
            }
        }
        $kinds = ['file-missing', 'file-new', 'file-changed', 'plugin-modified', 'core-modified'];
        $n     = 0;
        foreach (Alerts::active(Fortress::MINCETA) as $a) {
            $t = (string) ($a['target'] ?? '');
            if (in_array($a['kind'] ?? '', $kinds, true) && ($t === $rel || str_starts_with($t, $rel . '/')) && !in_array($t, $rels, true)) {
                $rels[] = $t;
            }
        }
        foreach ($rels as $r) {
            if (isset(self::$index[$r])) {
                unset(self::$index[$r]);
                self::$index_dirty = true;
                $n++;
            }
            foreach ($kinds as $kind) {
                $fp = Events::fingerprint(Fortress::MINCETA, $kind, $r);
                $a  = Alerts::get($fp);
                if ($a === null) {
                    continue;
                }
                if (Alerts::state($a) === 'open') {
                    Alerts::resolve($fp, true);
                }
                $n++; // seen or resolved already: the baseline knew it, and the seal still succeeds
            }
        }
        if (self::$index_dirty) {
            self::save_index();
        }
        return $n;
    }

    // --------------------------------------------------------------- disk

    /** Percent of the account quota in use, or null when it cannot be read. */
    public static function disk_pct(): ?float
    {
        $d = (array) State::get('disk', []);
        return isset($d['pct']) ? (float) $d['pct'] : null;
    }

    public static function disk(Budget $budget): string
    {
        $d = (array) State::get('disk', []);
        if (time() - (int) ($d['checked_at'] ?? 0) < 3600 && empty($d['walk'])) {
            return '';
        }
        $q = self::quota();
        if ($q !== null) {
            $pct    = $q['limit'] > 0 ? round($q['used'] / $q['limit'] * 100, 1) : null;
            $method = $q['guessed'] ? 'quota-largest' : 'quota';
            State::set('disk', ['checked_at' => time(), 'used' => $q['used'], 'limit' => $q['limit'], 'pct' => $pct, 'method' => $method, 'device' => $q['device']]);
            self::disk_alert($pct, $q['used'], $q['limit'], $method);
            self::update_status();
            return sprintf('Disk %s of %s (%s%%) on %s%s', Text::bytes($q['used']), Text::bytes($q['limit']), (string) $pct, $q['device'], $q['guessed'] ? ', the fullest filesystem (home device unknown)' : '');
        }
        // No quota command: a weekly chunked walk of the home directory, an approximation.
        $home = Site::home_dir();
        if ($home === null) {
            State::set('disk', ['checked_at' => time(), 'pct' => null, 'method' => 'none']);
            return __('Disk quota cannot be read on this host.', 'dcc-ragusa');
        }
        $walk = (array) ($d['walk'] ?? []);
        if ($walk === [] && time() - (int) ($d['walked_at'] ?? 0) < 7 * 86400) {
            State::set('disk', $d + ['checked_at' => time()]);
            return '';
        }
        $sum   = (int) ($walk['sum'] ?? 0);
        $after = (string) ($walk['after'] ?? '');
        $n     = 0;
        $done  = true;
        foreach (Walker::iterate($home, $after, static fn(string $rel, bool $is_dir): bool => $is_dir && ($rel === 'mail' || str_starts_with(basename($rel), '.'))) as $rel => $abs) {
            $sum  += (int) @filesize($abs);
            $after = $rel;
            if (++$n % 50 === 0 && $budget->exhausted()) {
                $done = false;
                break;
            }
        }
        if (!$done) {
            State::set('disk', $d + ['walk' => ['sum' => $sum, 'after' => $after]]);
            return 'Disk walk in progress';
        }
        $pct = round($sum / self::QUOTA_BYTES * 100, 1);
        State::set('disk', ['checked_at' => time(), 'walked_at' => time(), 'used' => $sum, 'limit' => self::QUOTA_BYTES, 'pct' => $pct, 'method' => 'walk', 'walk' => []]);
        self::disk_alert($pct, $sum, self::QUOTA_BYTES, 'walk');
        self::update_status();
        return sprintf('Disk about %s of %s (%s%%, counted by Ragusa)', Text::bytes($sum), Text::bytes(self::QUOTA_BYTES), (string) $pct);
    }

    private static function disk_alert(?float $pct, int $used, int $limit, string $method): void
    {
        $fp = Events::fingerprint(Fortress::MINCETA, 'disk', 'quota');
        if ($pct !== null && $pct >= self::DISK_ALERT) {
            Alerts::raise([
                'fortress' => Fortress::MINCETA,
                'severity' => Events::NEEDS_LOOK,
                'kind'     => 'disk',
                'target'   => 'quota',
                'title'    => __('Disk Space Is Running Out', 'dcc-ragusa'),
                /* translators: 1: used, 2: limit, 3: percent */
                'what'     => sprintf(__('The hosting account is using %1$s of its %2$s (%3$s%%). A full disk breaks bookings.', 'dcc-ragusa'), Text::bytes($used), Text::bytes($limit), (string) $pct),
                'did'      => $pct >= 95 ? __('Ragusa stopped keeping new rollback copies until there is room.', 'dcc-ragusa') : __('Ragusa changed nothing.', 'dcc-ragusa'),
                'todo'     => __('Ask the site director to clear old backups and logs, or raise the plan.', 'dcc-ragusa'),
                'notice'   => $method === 'walk' ? __('This figure is Ragusa\'s own count of the home directory, not the host\'s.', 'dcc-ragusa') : '',
            ]);
        } else {
            Alerts::resolve($fp);
        }
    }

    private static function run(array $cmd, int $timeout = 3): ?string
    {
        if (!function_exists('proc_open')) {
            return null;
        }
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        if (in_array('proc_open', $disabled, true)) {
            return null;
        }
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = @proc_open($cmd, $spec, $pipes);
        if (!is_resource($proc)) {
            return null;
        }
        fclose($pipes[0]);
        stream_set_timeout($pipes[1], $timeout);
        $out = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        return $out;
    }

    /** The device that holds the home directory, from `df -P ~`, or null. */
    public static function home_device(): ?string
    {
        $home = Site::home_dir();
        if ($home === null) {
            return null;
        }
        $out = self::run(['df', '-P', $home]);
        if ($out === null) {
            return null;
        }
        $lines = preg_split('/\r?\n/', trim($out)) ?: [];
        if (count($lines) < 2) {
            return null;
        }
        $first = preg_split('/\s+/', trim($lines[1])) ?: [];
        return isset($first[0]) && $first[0] !== '' ? $first[0] : null;
    }

    /**
     * @return array{used:int,limit:int,device:string,guessed:bool}|null bytes, from the quota command,
     *         for the filesystem that holds the home directory
     */
    public static function quota(): ?array
    {
        $device = self::home_device();
        foreach ([['quota', '-u', '-w'], ['quota', '-u'], ['quota', '-u', '-s']] as $cmd) {
            $out = self::run($cmd);
            if ($out === null) {
                return null;
            }
            $parsed = self::parse_quota($out, $device);
            if ($parsed !== null) {
                return $parsed;
            }
        }
        return null;
    }

    /** "8454M", "4K", "10240" (1K blocks) → bytes. */
    private static function quota_bytes(string $v): int
    {
        $v = rtrim($v, '*');
        if (!preg_match('/^(\d+(?:\.\d+)?)([KMGT]?)$/i', $v, $m)) {
            return 0;
        }
        $n = (float) $m[1];
        return (int) match (strtoupper($m[2])) {
            'K'     => $n * 1024,
            'M'     => $n * 1024 ** 2,
            'G'     => $n * 1024 ** 3,
            'T'     => $n * 1024 ** 4,
            default => $n * 1024, // plain numbers are 1K blocks
        };
    }

    /**
     * Parse `quota` output, which may list several filesystems and may be
     * wrapped onto two lines. With a device, that filesystem; without one,
     * the fullest, flagged as guessed.
     *
     * @return array{used:int,limit:int,device:string,guessed:bool}|null
     */
    public static function parse_quota(string $out, ?string $device = null): ?array
    {
        $rows    = [];
        $pending = null;
        foreach (preg_split('/\r?\n/', $out) ?: [] as $line) {
            $t = trim($line);
            if ($t === '' || preg_match('/^(Disk quotas|Filesystem)/i', $t)) {
                continue;
            }
            $parts = preg_split('/\s+/', $t) ?: [];
            if (str_starts_with($t, '/')) {
                if (count($parts) >= 4 && preg_match('/^\d/', $parts[1])) {
                    $rows[$parts[0]] = [$parts[1], $parts[2], $parts[3]];
                } else {
                    $pending = $parts[0]; // wrapped: numbers on the next line
                }
                continue;
            }
            if ($pending !== null && count($parts) >= 3 && preg_match('/^\d/', $parts[0])) {
                $rows[$pending] = [$parts[0], $parts[1], $parts[2]];
                $pending        = null;
            }
        }
        if ($rows === []) {
            return null;
        }
        $pick = null;
        if ($device !== null && isset($rows[$device])) {
            $pick = $device;
        }
        if ($pick === null) {
            $max = -1;
            foreach ($rows as $dev => $r) {
                $used = self::quota_bytes($r[0]);
                if ($used > $max) {
                    $max  = $used;
                    $pick = $dev;
                }
            }
        }
        [$used, $soft, $hard] = $rows[$pick];
        $limit = self::quota_bytes($hard) > 0 ? self::quota_bytes($hard) : self::quota_bytes($soft);
        return ['used' => self::quota_bytes($used), 'limit' => $limit, 'device' => (string) $pick, 'guessed' => $device === null || !isset($rows[$device])];
    }

    // ------------------------------------------------------------- status

    public static function update_status(): void
    {
        $files = (int) State::get('minceta.files', 0);
        $last  = (array) State::get('minceta.last', []);
        $disk  = (array) State::get('disk', []);
        $worst = Alerts::worst(Fortress::MINCETA);
        if ($files === 0) {
            $line = __('First Pass In Progress', 'dcc-ragusa');
        } elseif ($worst === Fortress::HOLDING) {
            /* translators: %s: number of files */
            $line = sprintf(__('All %s Files Match', 'dcc-ragusa'), number_format($files));
        } else {
            $n = count(Alerts::open(Fortress::MINCETA));
            /* translators: 1: files, 2: findings */
            $line = sprintf(_n('%1$s Files, %2$d Finding', '%1$s Files, %2$d Findings', $n, 'dcc-ragusa'), number_format($files), $n);
        }
        if (isset($disk['pct']) && $disk['pct'] !== null) {
            $line .= ' · ' . sprintf(
                /* translators: 1: used, 2: limit, 3: percent */
                __('Disk %1$s Of %2$s (%3$s%%)', 'dcc-ragusa'),
                Text::bytes((int) ($disk['used'] ?? 0)),
                Text::bytes((int) ($disk['limit'] ?? 0)),
                (string) $disk['pct']
            );
            if (($disk['method'] ?? '') === 'quota-largest') {
                $line .= ' ' . __('(Fullest Filesystem)', 'dcc-ragusa');
            } elseif (($disk['method'] ?? '') === 'walk') {
                $line .= ' ' . __('(Counted By Ragusa)', 'dcc-ragusa');
            }
        } elseif (($disk['method'] ?? '') === 'none') {
            $line .= ' · ' . __('Disk Quota Unreadable', 'dcc-ragusa');
        }
        Fortress::set_status(Fortress::MINCETA, $worst, $line, (int) State::get('last_full_pass', 0) ?: time());
        unset($last);
    }
}
