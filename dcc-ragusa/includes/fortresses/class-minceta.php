<?php
namespace DCCR\Fortress;

use DCCR\Action\Quarantine;
use DCCR\Alerts;
use DCCR\Budget;
use DCCR\Checksums;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Htaccess;
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
        $lines = array_merge($lines, self::check_options(), self::check_jetpack(), self::check_sentinels());
        self::update_status();
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

    /** wp-config.php by hash, the drop-ins, .user.ini, php.ini and the root index.php. */
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
            '.user.ini'                    => $root . '/.user.ini',
            'php.ini'                      => $root . '/php.ini',
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
    public static function skip(string $rel, bool $is_dir): bool
    {
        $base = basename($rel);
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
                self::finding_new($site_rel, $exp['src'], $p);
            }
        } elseif (($known['h'] ?? '') !== $hash) {
            $p['changed']++;
            self::finding_changed($site_rel, $exp['src'], $p);
        }
        self::$index[$site_rel] = $entry;
        self::$index_dirty      = true;
    }

    private static function location(string $rel): array
    {
        $base = basename($rel);
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

    private static function finding_new(string $rel, string $src, array &$p): void
    {
        [$severity, $where] = self::location($rel);
        if ($where === 'guard' || $where === 'self') {
            return; // Revelin's business
        }
        $kind = 'file-new';
        $fp   = Events::fingerprint(Fortress::MINCETA, $kind, $rel);
        $p['fps'][] = $fp;
        /* translators: %s: path */
        $what = sprintf(__('A new file appeared: %s.', 'dcc-ragusa'), $rel);
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
        $kind = 'file-changed';
        $fp   = Events::fingerprint(Fortress::MINCETA, $kind, $rel);
        $p['fps'][] = $fp;
        /* translators: %s: path */
        $what = sprintf(__('%s changed since Ragusa last saw it.', 'dcc-ragusa'), $rel);
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
                /* translators: %s: path */
                : sprintf(__('If the site director changed it on purpose, run wp ragusa seal %s. Otherwise ask them to look.', 'dcc-ragusa'), $rel),
        ]);
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
        $head = $size <= 128 ? trim((string) @file_get_contents($abs, false, null, 0, 128)) : '';
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

    private static function finish_pass(array $p, bool $first): void
    {
        $index   = self::index();
        $missing = [];
        foreach ($index as $rel => $e) {
            if ((int) ($e['p'] ?? 0) !== $p['pass']) {
                if (str_starts_with($rel, 'wp-content/uploads/')) {
                    continue;
                }
                $missing[] = $rel;
            }
        }
        foreach ($missing as $rel) {
            unset(self::$index[$rel]);
            self::$index_dirty = true;
            [$severity, $where] = self::location($rel);
            if ($where === 'guard' || $where === 'self') {
                continue;
            }
            if (($index[$rel]['x'] ?? '') === 'core') {
                $severity = Events::NEEDS_LOOK;
            }
            $fp = Events::fingerprint(Fortress::MINCETA, 'file-missing', $rel);
            $p['fps'][] = $fp;
            Events::record(Fortress::MINCETA, $severity, 'file-missing', $rel, sprintf(
                /* translators: %s: path */
                __('%s is gone.', 'dcc-ragusa'),
                $rel
            ));
            Alerts::raise([
                'fortress' => Fortress::MINCETA,
                'severity' => $severity,
                'kind'     => 'file-missing',
                'target'   => $rel,
                /* translators: %s: path */
                'title'    => sprintf(__('File Missing: %s', 'dcc-ragusa'), basename($rel)),
                /* translators: %s: path */
                'what'     => sprintf(__('%s was there at the last pass and is gone now.', 'dcc-ragusa'), $rel),
                'did'      => __('Ragusa recorded it; it restores only its own sealed copies.', 'dcc-ragusa'),
                'todo'     => $severity === Events::INFO ? '' : __('If the site director removed it, nothing to do. Otherwise ask them to look.', 'dcc-ragusa'),
            ]);
        }
        $kinds = ['core-modified', 'plugin-modified', 'file-new', 'file-changed', 'file-missing', 'quarantined'];
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

    /** Accept a file or folder as it is now (after an update passes, or `wp ragusa seal`). */
    public static function rebaseline(string $abs): void
    {
        $abs   = rtrim($abs, '/');
        $index = self::index();
        $rels  = [];
        if (is_dir($abs)) {
            foreach (Vault::list_files($abs) as $f => $r) {
                $rels[Site::rel($f)] = $f;
            }
            $prefix = Site::rel($abs) . '/';
            foreach (array_keys($index) as $rel) {
                if (str_starts_with($rel, $prefix) && !isset($rels[$rel])) {
                    unset(self::$index[$rel]);
                }
            }
        } elseif (is_file($abs)) {
            $rels[Site::rel($abs)] = $abs;
        }
        $pass = (int) State::get('minceta.pass_no', 0);
        foreach ($rels as $rel => $file) {
            $exp = self::expectation($rel);
            self::$index[$rel] = ['s' => (int) filesize($file), 'm' => (int) filemtime($file), 'h' => self::hash($file, $exp['algo']), 'x' => $exp['src'], 'p' => $pass];
            foreach (['file-new', 'file-changed', 'file-missing', 'plugin-modified', 'core-modified'] as $kind) {
                Alerts::resolve(Events::fingerprint(Fortress::MINCETA, $kind, $rel));
            }
        }
        self::$index_dirty = true;
        self::save_index();
        self::$plugin_maps = [];
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
            $n = count(Alerts::active(Fortress::MINCETA));
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
