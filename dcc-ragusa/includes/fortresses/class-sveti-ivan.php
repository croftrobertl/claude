<?php
namespace DCCR\Fortress;

use DCCR\Action\Rollback;
use DCCR\Alerts;
use DCCR\Error_Log;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Ical;
use DCCR\Journal;
use DCCR\Loopback;
use DCCR\Markers;
use DCCR\Plugin;
use DCCR\Site;
use DCCR\State;
use DCCR\Text;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Sveti Ivan · Checks Every Update. The harbour fortress inspects every
 * ship that docks: pages, markers, the error log and the eight iCal
 * exports after any plugin install or update, from any route. One failure
 * is never enough; it must repeat five minutes later.
 */
final class Sveti_Ivan
{
    public const FOLLOWUP   = 120;
    public const REPEAT     = 300;
    public const HOST_RETRY = 900;
    public const WINDOW     = 3600;
    public const MAX_HOST   = 3;
    /** An update WordPress never reported finished is completed by the tick after this long. */
    public const OPEN_GRACE = 900;

    /** @var array<string,int> slug => journal id of the updates this request opened */
    private static array $open = [];
    private static bool $shutdown_set = false;
    /** @var callable tests record the registration instead of running it at process end */
    public static $shutdown_registrar = 'register_shutdown_function';

    /** @var callable|null prints each check in WP-CLI */
    public static $printer = null;

    public static function say(string $line): void
    {
        if (is_callable(self::$printer)) {
            (self::$printer)($line);
        }
    }

    // ------------------------------------------------------- upgrader hooks

    public static function on_pre_install($res, $hook_extra = [])
    {
        try {
            $type = is_array($hook_extra) ? ($hook_extra['type'] ?? '') : '';
            if ($type === 'plugin' || $type === 'core') {
                State::set('update.pre', ['ts' => time(), 'errlog' => Error_Log::snapshot(), 'type' => $type]);
                State::flush();
            }
            if ($type === 'plugin' && !empty($hook_extra['plugin'])) {
                self::open_update(dirname((string) $hook_extra['plugin']));
            }
        } catch (\Throwable $e) {
            // Never break the upgrader.
        }
        return $res;
    }

    public static function on_process_complete($upgrader, $hook_extra = []): void
    {
        try {
            $type = is_array($hook_extra) ? ($hook_extra['type'] ?? '') : '';
            if ($type === 'core') {
                self::after_core();
                return;
            }
            if ($type === 'theme') {
                $themes = [];
                if (!empty($hook_extra['themes']) && is_array($hook_extra['themes'])) {
                    $themes = $hook_extra['themes'];
                } elseif (!empty($hook_extra['theme'])) {
                    $themes = [(string) $hook_extra['theme']];
                } elseif (is_object($upgrader) && is_array($upgrader->result ?? null) && !empty($upgrader->result['destination_name'])) {
                    $themes = [(string) $upgrader->result['destination_name']];
                }
                foreach (array_unique(array_map('strval', $themes)) as $theme) {
                    self::after_theme($theme, (string) ($hook_extra['action'] ?? 'update'));
                }
                return;
            }
            if ($type !== 'plugin') {
                return;
            }
            $action = (string) ($hook_extra['action'] ?? '');
            $slugs  = [];
            if ($action === 'update') {
                $files = [];
                if (!empty($hook_extra['plugins']) && is_array($hook_extra['plugins'])) {
                    $files = $hook_extra['plugins'];
                } elseif (!empty($hook_extra['plugin'])) {
                    $files = [(string) $hook_extra['plugin']];
                }
                foreach ($files as $file) {
                    $d = dirname((string) $file);
                    if ($d !== '.' && $d !== '') {
                        $slugs[] = $d;
                    }
                }
            } elseif ($action === 'install') {
                $result = is_object($upgrader) && isset($upgrader->result) ? $upgrader->result : null;
                if (is_array($result) && !empty($result['destination_name'])) {
                    $slugs[] = (string) $result['destination_name'];
                }
            }
            foreach (array_unique($slugs) as $slug) {
                self::after_plugin($slug, $action);
            }
        } catch (\Throwable $e) {
            Events::record(Fortress::SVETI_IVAN, Events::NEEDS_LOOK, 'check-error', 'upgrader', Text::scrub($e->getMessage()));
        } finally {
            State::flush();
        }
    }

    private static function source(): string
    {
        if (defined('WP_CLI') && WP_CLI) {
            return 'cli';
        }
        if (wp_doing_cron()) {
            return 'auto';
        }
        if (is_admin()) {
            return 'admin';
        }
        // A front-end request: an update made from WordPress.com.
        if (($_GET['for'] ?? '') === 'jetpack') {
            return 'jetpack';
        }
        if (defined('REST_REQUEST') && REST_REQUEST) {
            return 'rest';
        }
        if (defined('XMLRPC_REQUEST') && XMLRPC_REQUEST) {
            return 'xmlrpc';
        }
        return 'web';
    }

    /** @param array{id?:int,installed_at?:int,source?:string,old_version?:string,note?:string} $late the tick finishing an update WordPress never reported */
    private static function after_plugin(string $slug, string $action, array $late = []): void
    {
        $pending = (array) State::get('pending_update', []);
        $seal    = $pending[$slug] ?? null;
        unset($pending[$slug]);
        State::set('pending_update', $pending);
        $pre     = (array) State::get('update.pre', []);
        $kind    = $seal !== null ? 'update' : ($action === 'update' ? 'update' : 'install');
        $is_self = $slug === 'dcc-ragusa';
        $before  = [
            'slug'        => $slug,
            'kind'        => $kind,
            'source'      => self::source(),
            'old_version' => (string) ($seal['old_version'] ?? ''),
            'new_version' => Revelin::plugin_version($slug),
            'entry'       => $seal['entry'] ?? null,
            'started'     => (int) ($pre['ts'] ?? time()),
            'installed_at' => time(), // upgrader_process_complete: the copy is finished
            'errlog'      => $pre['errlog'] ?? Error_Log::snapshot(),
            'is_self'     => $is_self,
        ];
        if ($late !== []) {
            $before['source']       = (string) ($late['source'] ?? $before['source']);
            $before['installed_at'] = (int) ($late['installed_at'] ?? $before['installed_at']);
            if ($before['old_version'] === '') {
                $before['old_version'] = (string) ($late['old_version'] ?? '');
            }
            $id = self::adopt((int) ($late['id'] ?? 0), $before);
            if ($id > 0) {
                Journal::annotate($id, (string) ($late['note'] ?? ''));
            }
        } else {
            $id = $is_self ? 0 : self::take_open($slug, $before);
        }
        if ($id === 0) {
            $id = Journal::create($is_self ? 'self-update' : 'update-check', $slug, $before, $kind . ' from ' . $before['source'], false);
        }
        Events::record(Fortress::SVETI_IVAN, Events::INFO, 'update-seen', $slug, sprintf(
            /* translators: 1: slug, 2: old, 3: new, 4: source */
            __('%1$s %2$s → %3$s (%4$s); checks pending.', 'dcc-ragusa'),
            $slug,
            $before['old_version'] !== '' ? $before['old_version'] : '?',
            $before['new_version'] !== '' ? $before['new_version'] : '?',
            $before['source']
        ), [], $id);
        /* translators: 1: slug, 2: new version */
        self::say(sprintf(__('Ragusa · Sveti Ivan: %1$s updated to %2$s; checking.', 'dcc-ragusa'), $slug, $before['new_version']));

        if ($is_self) {
            State::set('self_update_pending', ['id' => $id, 'ts' => time()]);
            self::schedule($id, self::FOLLOWUP);
            self::say(__('Ragusa · Sveti Ivan: Ragusa itself was updated; its checks run in a fresh request in 2 minutes and it never rolls itself back.', 'dcc-ragusa'));
            return;
        }

        // Inline: the loopbacks already test fresh requests; the error log too.
        // Not while WordPress shows its maintenance page for this update (an
        // automatic update keeps it up until it has looked for a fatal error):
        // every page would answer 503, and guests would wait on the checks.
        if (self::maintenance_on()) {
            Journal::set_state($id, Journal::VERIFYING, ['verify' => ['inline' => 'deferred: maintenance mode']]);
            self::say(__('Ragusa · Sveti Ivan: WordPress is in maintenance mode for this update; the checks run in 2 minutes.', 'dcc-ragusa'));
        } else {
            $results = self::run_checks($before, true);
            Journal::set_state($id, Journal::VERIFYING, ['verify' => ['inline' => $results['checks']]]);
            foreach ($results['checks'] as $name => $c) {
                self::say(self::format_check($name, $c));
            }
            if ($results['failed'] !== []) {
                /* translators: %s: check names */
                self::say(sprintf(__('Ragusa · Sveti Ivan: %s failed; a repeat check decides, nothing is rolled back from one failure.', 'dcc-ragusa'), implode(', ', $results['failed'])));
            }
        }
        // The plugin's own files are the new baseline now, not a finding; a
        // rollback re-baselines again. A file it no longer has is the
        // update's only if the new version no longer ships it.
        \DCCR\Packages::finalize('plugin', $slug, $before['new_version']);
        $n    = Minceta::rebaseline(Site::plugins_dir() . '/' . $slug);
        $diff = Minceta::$last_diff;
        $w    = ['slug' => $slug, 'kind' => 'plugin', 'version' => $before['new_version'], 'old' => $before['old_version'], 'id' => $id, 'unseen' => false, 'at' => time()];
        self::judge_removed($w, $diff['removed']);
        Journal::set_state($id, Journal::VERIFYING, ['before' => ['files' => self::files_summary($diff)]]);
        Events::record(Fortress::MINCETA, Events::INFO, 'plugin-rebaselined', $slug, sprintf(
            /* translators: 1: slug, 2: version, 3: files */
            __('%1$s %2$s: %3$d files updated and accepted as the baseline.', 'dcc-ragusa'),
            $slug,
            $before['new_version'] !== '' ? $before['new_version'] : '?',
            $n
        ), [], $id);
        self::schedule($id, self::FOLLOWUP);
        if ($late === [] && self::source() === 'cli') {
            if (!self::cli_subprocess($id)) {
                self::say(__('Ragusa · Sveti Ivan: the in-process checks run on the next cron tick (no wp subprocess available).', 'dcc-ragusa'));
            }
        }
    }

    // ------------------------------------------- the write-ahead update row

    /**
     * upgrader_pre_install, before a single file is copied: the update's
     * journal row is written now, so an update that never reaches
     * upgrader_process_complete (a callback before Ragusa's ended the
     * request, the hook was removed, the process died) is still on record,
     * with the moment it started and how its request ended.
     */
    private static function open_update(string $slug): void
    {
        $slug = basename($slug);
        if ($slug === '' || $slug === '.' || $slug === 'dcc-ragusa') {
            return;
        }
        $before = [
            'slug'        => $slug,
            'kind'        => 'update',
            'source'      => self::source(),
            'old_version' => Revelin::plugin_version($slug),
            'new_version' => '',
            'started'     => time(),
            'errlog'      => Error_Log::snapshot(),
            'stage'       => 'started',
            'request'     => self::request_context(),
        ];
        global $wpdb;
        $why = '';
        try {
            $id = Journal::create('update-check', $slug, $before, 'update from ' . $before['source'] . ' | in progress', false);
        } catch (\Throwable $e) {
            $id  = 0;
            $why = $e->getMessage();
        }
        if ($id === 0) {
            $why = Text::scrub(mb_substr($why !== '' ? $why : (string) ($wpdb->last_error ?? ''), 0, 200));
            // Loud: the journal is the record, and an update without one is unseen.
            error_log('DCC Ragusa: could not write the journal row for the update of ' . $slug . ($why !== '' ? ': ' . $why : ''));
            Events::record(Fortress::SVETI_IVAN, Events::NEEDS_LOOK, 'journal-write-failed', $slug, sprintf(
                /* translators: 1: slug, 2: database error */
                __('The journal row for the update of %1$s could not be written (%2$s).', 'dcc-ragusa'),
                $slug,
                $why !== '' ? $why : __('no error given', 'dcc-ragusa')
            ));
            return;
        }
        $open        = (array) State::get('update.open', []);
        $open[$slug] = $id;
        State::set('update.open', array_slice($open, -20, null, true));
        State::flush();
        self::$open[$slug] = $id;
        if (!self::$shutdown_set) {
            self::$shutdown_set = true;
            (self::$shutdown_registrar)([self::class, 'on_shutdown']);
        }
    }

    /** Where this request came in; nothing a person typed, nothing secret. */
    private static function request_context(): array
    {
        $script = defined('WP_CLI') && WP_CLI ? 'wp-cli' : basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        return [
            'entry' => Text::slug($script !== '' ? $script : 'unknown', 40),
            'cron'  => wp_doing_cron(),
            'admin' => function_exists('is_admin') && is_admin(),
            'pid'   => (int) getmypid(),
        ];
    }

    /** The update this request opened for the slug, now finished by the hook: the same row. */
    private static function take_open(string $slug, array $before): int
    {
        $open = (array) State::get('update.open', []);
        $id   = (int) ($open[$slug] ?? 0);
        unset($open[$slug], self::$open[$slug]);
        State::set('update.open', $open);
        return self::adopt($id, $before);
    }

    /** Finish an open row with what is known now; its start, old version and log snapshot stay. */
    private static function adopt(int $id, array $before): int
    {
        $row = $id > 0 ? Journal::get($id) : null;
        if ($row === null || in_array($row['state'], Journal::TERMINAL, true) || !in_array((string) ($row['before']['stage'] ?? ''), ['started', 'ended-early'], true)) {
            return 0;
        }
        $b = (array) $row['before'];
        $before['started'] = (int) ($b['started'] ?? $before['started']);
        if ($before['old_version'] === '') {
            $before['old_version'] = (string) ($b['old_version'] ?? '');
        }
        if (isset($b['errlog'])) {
            $before['errlog'] = $b['errlog'];
        }
        $before['stage'] = 'complete';
        Journal::set_state($id, Journal::PLANNED, ['before' => $before, 'note' => $before['kind'] . ' from ' . $before['source']]);
        return $id;
    }

    /**
     * At the end of a request that opened an update: if Ragusa never heard
     * it finish, the row says how the request ended, with PHP's last fatal
     * error when there was one. The tick completes it.
     */
    public static function on_shutdown(?array $err = null): void
    {
        if (self::$open === []) {
            return;
        }
        try {
            $err   = $err ?? error_get_last();
            $fatal = is_array($err) && in_array((int) ($err['type'] ?? 0), [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR], true);
            $how   = $fatal
                /* translators: 1: message, 2: file, 3: line */
                ? sprintf(__('PHP fatal error: %1$s in %2$s line %3$d', 'dcc-ragusa'), mb_substr((string) $err['message'], 0, 300), Site::rel((string) ($err['file'] ?? '')), (int) ($err['line'] ?? 0))
                : __('no PHP error: the request finished without the upgrader telling Ragusa', 'dcc-ragusa');
            $how = Text::scrub(str_replace(Site::abspath() . '/', '', $how));
            foreach (self::$open as $slug => $id) {
                Journal::set_state($id, Journal::PLANNED, ['before' => ['stage' => 'ended-early', 'ended_at' => time(), 'ended' => $how]]);
                Journal::annotate($id, 'the request ended before WordPress reported the update finished: ' . $how);
            }
            self::$open = [];
        } catch (\Throwable $e) {
            // Shutdown must never add an error of its own.
        }
    }

    /** WordPress's own automatic updater lock: the time it was taken, while still held. */
    public static function auto_lock(): int
    {
        return (int) get_option('auto_updater.lock', 0);
    }

    /** A sentence when WordPress's automatic updater started long ago and never finished. */
    private static function lock_sentence(int $from, int $to): string
    {
        $lock = self::auto_lock();
        if ($lock <= 0 || $lock < $from - 3600 || $lock > $to || $lock > time() - self::OPEN_GRACE) {
            return '';
        }
        return sprintf(
            /* translators: %s: time */
            __('WordPress\'s automatic updater started a run at %s and never finished it (its lock is still held), so its request ended early.', 'dcc-ragusa'),
            Site::stamp($lock)
        );
    }

    /** WordPress shows its maintenance page while an update or its fatal-error check runs. */
    private static function maintenance_on(): bool
    {
        $file = Site::abspath() . '/.maintenance';
        clearstatcache(true, $file);
        return is_file($file) && (int) @filemtime($file) >= time() - 600;
    }

    /**
     * Every tick: an update this site opened and WordPress never reported
     * finished. Once its request has ended (or OPEN_GRACE has passed), the
     * version on disk decides: changed, the update is completed as a
     * recorded one, with its sealed copy and its window; unchanged, the row
     * is abandoned.
     *
     * @return string[]
     */
    public static function finish_open(): array
    {
        $lines = [];
        $open  = (array) State::get('update.open', []);
        foreach ($open as $slug => $id) {
            $slug = basename((string) $slug);
            $row  = Journal::get((int) $id);
            if ($row === null || in_array($row['state'], Journal::TERMINAL, true) || !in_array((string) ($row['before']['stage'] ?? ''), ['started', 'ended-early'], true)) {
                unset($open[$slug]);
                continue;
            }
            $b     = (array) $row['before'];
            $ended = (string) ($b['stage'] ?? '') === 'ended-early';
            if (!$ended && (int) ($b['started'] ?? 0) > time() - self::OPEN_GRACE) {
                continue; // it may still be copying
            }
            unset($open[$slug]);
            State::set('update.open', $open);
            $old = (string) ($b['old_version'] ?? '');
            $new = Revelin::plugin_version($slug);
            $how = $ended ? (string) ($b['ended'] ?? '') : __('its request never said how it ended', 'dcc-ragusa');
            $lock = self::lock_sentence((int) ($b['started'] ?? 0), time());
            if ($new === '' || $new === $old) {
                Journal::set_state((int) $id, Journal::ABANDONED, ['before' => ['stage' => 'abandoned']]);
                Journal::annotate((int) $id, sprintf('the update did not finish: the version is still %s (%s)', $new !== '' ? $new : '?', $how));
                /* translators: 1: slug, 2: version */
                $lines[] = sprintf(__('%1$s: an update started and did not finish; it is still %2$s.', 'dcc-ragusa'), $slug, $new !== '' ? $new : '?');
                continue;
            }
            $dir    = Site::plugins_dir() . '/' . $slug;
            $newest = Minceta::newest_mtime($dir);
            $note   = sprintf('completed by the tick: WordPress never told Ragusa this update finished (%s)', $how) . ($lock !== '' ? ' | ' . $lock : '');
            self::after_plugin($slug, 'update', [
                'id'           => (int) $id,
                'installed_at' => min(time(), max((int) ($b['started'] ?? 0), $newest)),
                'source'       => (string) ($b['source'] ?? 'auto'),
                'old_version'  => $old,
                'note'         => $note,
            ]);
            $text = sprintf(
                /* translators: 1: slug, 2: old, 3: new, 4: time, 5: journal, 6: how */
                __('%1$s %2$s → %3$s started at %4$s and WordPress never reported it finished (%6$s). Completed as journal %5$d; its checks run now.', 'dcc-ragusa'),
                $slug,
                $old !== '' ? $old : '?',
                $new,
                Site::stamp((int) ($b['started'] ?? time())),
                (int) $id,
                $how
            );
            Events::record(Fortress::SVETI_IVAN, Events::INFO, 'update-completed-late', $slug, $text . ($lock !== '' ? ' ' . $lock : ''), [], (int) $id);
            $lines[] = $text;
        }
        State::set('update.open', $open);
        return $lines;
    }

    /**
     * Files gone after an update: the update's (info, on its journal row)
     * when the new version no longer ships them; otherwise a finding.
     */
    private static function judge_removed(array $w, array $removed): void
    {
        $gone = [];
        foreach ($removed as $rel) {
            $ships = \DCCR\Packages::ships((string) $w['kind'], (string) $w['slug'], (string) $w['version'], (string) $rel);
            if ($ships === false) {
                $gone[] = (string) $rel;
            } else {
                Minceta::raise_missing((string) $rel, Events::NEEDS_LOOK, $w, $ships);
            }
        }
        Minceta::record_removed($w, $gone);
    }

    /** @return array{added:int,changed:int,removed:int,lists:array} */
    private static function files_summary(array $diff): array
    {
        $out = ['lists' => []];
        foreach (['added', 'changed', 'removed'] as $k) {
            $out[$k]          = count((array) ($diff[$k] ?? []));
            $out['lists'][$k] = array_slice(array_values((array) ($diff[$k] ?? [])), 0, 30);
        }
        return $out;
    }

    /** Name and version from a theme's style.css. */
    public static function theme_header(string $slug): array
    {
        $css  = Site::content_dir() . '/themes/' . basename($slug) . '/style.css';
        $head = is_file($css) ? (string) @file_get_contents($css, false, null, 0, 8192) : '';
        $name = preg_match('/^[\s*#@\/]*Theme Name:(.*)$/mi', $head, $m) ? trim($m[1], " \t*/") : '';
        $ver  = preg_match('/^[\s*#@\/]*Version:(.*)$/mi', $head, $m) ? trim($m[1], " \t*/") : '';
        return ['name' => $name, 'version' => $ver];
    }

    /** A theme update or install: recorded, re-baselined, its removals judged. Themes never roll back. */
    private static function after_theme(string $slug, string $action): void
    {
        $slug    = basename($slug); // a folder name, never a path
        if ($slug === '' || $slug === '.' || $slug === '..') {
            return;
        }
        $pending = (array) State::get('pending_theme', []);
        $pre     = (array) ($pending[$slug] ?? []);
        unset($pending[$slug]);
        State::set('pending_theme', $pending);
        $new = self::theme_header($slug)['version'];
        \DCCR\Packages::finalize('theme', $slug, $new);
        $before = [
            'slug'         => $slug,
            'component'    => 'theme',
            'kind'         => $action === 'install' ? 'install' : 'update',
            'source'       => self::source(),
            'old_version'  => (string) ($pre['old_version'] ?? ''),
            'new_version'  => $new,
            'started'      => (int) ($pre['ts'] ?? time()),
            'installed_at' => time(),
        ];
        $id   = Journal::create('update-seen', $slug, $before, 'theme ' . $before['kind'] . ' from ' . $before['source'], false);
        Minceta::rebaseline(Site::content_dir() . '/themes/' . $slug);
        $diff = Minceta::$last_diff;
        self::judge_removed(['slug' => $slug, 'kind' => 'theme', 'version' => $new, 'old' => $before['old_version'], 'id' => $id, 'unseen' => false, 'at' => time()], $diff['removed']);
        Journal::set_state($id, Journal::COMMITTED, ['before' => ['files' => self::files_summary($diff)]]);
        Events::record(Fortress::SVETI_IVAN, Events::INFO, 'update-seen', $slug, sprintf(
            /* translators: 1: theme, 2: old, 3: new */
            __('Theme %1$s %2$s → %3$s recorded.', 'dcc-ragusa'),
            $slug,
            $before['old_version'] !== '' ? $before['old_version'] : '?',
            $new !== '' ? $new : '?'
        ), [], $id);
    }

    // ------------------------------------------------- updates nobody saw

    /** @return array{plugins:array<string,string>,themes:array<string,string>,core:string} */
    public static function versions_now(): array
    {
        global $wp_version;
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $plugins = [];
        foreach (get_plugins() as $file => $data) {
            $dir = dirname((string) $file);
            if ($dir !== '.' && $dir !== '') {
                $plugins[$dir] = (string) ($data['Version'] ?? '');
            }
        }
        $themes = [];
        foreach ((array) glob(Site::content_dir() . '/themes/*/style.css') as $css) {
            $slug          = basename(dirname((string) $css));
            $themes[$slug] = self::theme_header($slug)['version'];
        }
        return ['plugins' => $plugins, 'themes' => $themes, 'core' => (string) $wp_version];
    }

    /** Did a hook-recorded update already put this version in the journal? */
    private static function recorded(string $slug, string $version): bool
    {
        foreach (Journal::recent(60) as $row) {
            if (!in_array($row['action'], ['update-check', 'self-update', 'core-check', 'update-seen'], true) || $row['created_at'] < time() - 2 * 86400) {
                continue;
            }
            $b = (array) $row['before'];
            if ((string) $row['target'] === $slug && (string) ($b['new_version'] ?? $b['version'] ?? '') === $version) {
                return true;
            }
        }
        return false;
    }

    /**
     * Every tick: a version that changed without passing through the
     * upgrader hooks Ragusa watches (an update made by WordPress.com or
     * Jetpack over the REST API, by the host, by hand over SFTP) is recorded
     * in the journal now, with what is known, and its removed files judged.
     *
     * @return string[]
     */
    public static function detect_unseen(): array
    {
        $now  = self::versions_now();
        $prev = State::get('versions');
        State::set('versions', $now + ['ts' => time()]);
        if (!is_array($prev)) {
            return [];
        }
        $since = (int) ($prev['ts'] ?? time());
        $lines = [];
        $open  = (array) State::get('update.open', []); // still copying: finish_open() owns them
        foreach (['plugins' => 'plugin', 'themes' => 'theme'] as $key => $kind) {
            foreach ($now[$key] as $slug => $version) {
                $old = $prev[$key][$slug] ?? null;
                if ($old === null || $old === $version || $version === '' || $slug === 'dcc-ragusa' || isset($open[$slug]) || self::recorded((string) $slug, $version)) {
                    continue;
                }
                $lines[] = self::record_unseen($kind, (string) $slug, (string) $old, $version, $since);
            }
        }
        if (($prev['core'] ?? '') !== '' && $prev['core'] !== $now['core'] && !self::recorded('core', $now['core'])) {
            $lines[] = self::record_unseen('core', 'core', (string) $prev['core'], $now['core'], $since);
        }
        return $lines;
    }

    private static function record_unseen(string $kind, string $slug, string $old, string $new, int $since): string
    {
        $slug   = $kind === 'core' ? 'core' : basename($slug);
        $dir    = $kind === 'plugin' ? Site::plugins_dir() . '/' . $slug : ($kind === 'theme' ? Site::content_dir() . '/themes/' . $slug : '');
        $diff   = $dir !== '' ? Minceta::compare_dir($dir) : ['added' => [], 'changed' => [], 'removed' => []];
        $newest = $dir !== '' ? Minceta::newest_mtime($dir) : time();
        $known  = $kind === 'theme' ? \DCCR\Packages::known('theme', $slug, $new) : \DCCR\Packages::known($kind, $slug, $new);
        $before = [
            'slug'         => $slug,
            'component'    => $kind,
            'kind'         => $kind === 'core' ? 'core' : 'update',
            'source'       => 'unseen',
            'unseen'       => true,
            'old_version'  => $old,
            'new_version'  => $new,
            'version'      => $new,
            'started'      => $since,
            'installed_at' => min(time(), max($since, $newest)),
            'errlog'       => Error_Log::snapshot(),
            'entry'        => null,
            'files'        => self::files_summary($diff),
        ];
        $action = $kind === 'plugin' ? 'update-check' : ($kind === 'core' ? 'core-check' : 'update-seen');
        $id     = Journal::create($action, $slug, $before, 'update detected after the fact (it did not pass through the upgrader Ragusa watches)', false);
        if ($action === 'update-seen') {
            Journal::set_state($id, Journal::COMMITTED);
        } else {
            self::schedule($id, self::FOLLOWUP); // the smoke checks still run; nothing can be rolled back without a sealed copy
        }
        $comp = $kind === 'core' ? 'WordPress' : ($kind === 'plugin' ? Minceta::component_of('wp-content/plugins/' . $slug . '/x')['name'] : (self::theme_header($slug)['name'] ?: $slug));
        $text = sprintf(
            /* translators: 1: component, 2: old, 3: new, 4: from, 5: to, 6: journal */
            __('%1$s went from %2$s to %3$s between %4$s and %5$s without passing through the upgrader Ragusa watches (an update made by WordPress.com or Jetpack, the host, or by hand). Recorded as journal %6$d.', 'dcc-ragusa'),
            $comp,
            $old,
            $new,
            Site::stamp($since),
            Site::stamp(time()),
            $id
        );
        $lock = self::lock_sentence($since, time());
        if ($lock !== '') {
            $text .= ' ' . $lock;
            Journal::annotate($id, $lock);
        }
        if ($dir !== '') {
            Minceta::drop_from_index($diff['removed']);
            self::judge_removed(['slug' => $slug, 'kind' => $kind, 'version' => $new, 'old' => $old, 'id' => $id, 'unseen' => true, 'at' => $before['installed_at']], $diff['removed']);
        }
        if ($known || $kind === 'core') {
            Events::record(Fortress::SVETI_IVAN, Events::INFO, 'update-unseen', $slug, $text . ' ' . __('Its files are checked against the published list for that version.', 'dcc-ragusa'), [], $id);
        } else {
            Events::record(Fortress::SVETI_IVAN, Events::NEEDS_LOOK, 'update-unseen', $slug, $text, [], $id);
            Alerts::raise([
                'fortress'   => Fortress::SVETI_IVAN,
                'severity'   => Events::NEEDS_LOOK,
                'kind'       => 'update-unseen',
                'target'     => $slug . '@' . $new,
                /* translators: %s: component */
                'title'      => sprintf(__('Updated Without Ragusa Seeing It: %s', 'dcc-ragusa'), $comp),
                'what'       => $text . ' ' . __('Ragusa has no list of the files this version should contain, so it cannot vouch for them; any changed file in it is reported on its own.', 'dcc-ragusa'),
                'did'        => __('Ragusa recorded the update and changed nothing.', 'dcc-ragusa'),
                'todo'       => __('Forward this to the site director: if they made this update, nothing to do.', 'dcc-ragusa'),
                'journal_id' => $id,
            ]);
        }
        return $text;
    }

    private static function after_core(): void
    {
        global $wp_version;
        $pre    = (array) State::get('update.pre', []);
        $before = [
            'slug'    => 'core',
            'kind'    => 'core',
            'source'  => self::source(),
            'version' => (string) $wp_version,
            'started' => (int) ($pre['ts'] ?? time()),
            'installed_at' => time(),
            'errlog'  => $pre['errlog'] ?? Error_Log::snapshot(),
        ];
        $id = Journal::create('core-check', 'core', $before, 'core update', false);
        Events::record(Fortress::SVETI_IVAN, Events::INFO, 'core-update-seen', 'core', __('WordPress core was updated; checks pending. Core is never rolled back.', 'dcc-ragusa'), [], $id);
        self::schedule($id, self::FOLLOWUP);
    }

    // ---------------------------------------------------------- scheduling

    /**
     * When the check is due. The tick runs it from `next_at` (`due()`); a
     * cron event is added only where WP-Cron runs, so a site with WP-Cron off
     * collects no events nobody will consume.
     */
    public static function schedule(int $id, int $delay): void
    {
        $at = time() + $delay;
        wp_clear_scheduled_hook(Plugin::CHECK_HOOK, [$id]);
        if (!Site::cron_off()) {
            wp_schedule_single_event($at, Plugin::CHECK_HOOK, [$id]);
        }
        Journal::set_state($id, Journal::VERIFYING, ['verify' => ['next_at' => $at]]);
    }

    /**
     * Every tick: remove check events nobody needs. With WP-Cron off, all of
     * them (the tick runs the checks); otherwise those whose row has finished.
     */
    public static function sweep_events(): int
    {
        if (!function_exists('_get_cron_array')) {
            return 0;
        }
        $n = 0;
        foreach ((array) _get_cron_array() as $ts => $hooks) {
            foreach ((array) ($hooks[Plugin::CHECK_HOOK] ?? []) as $event) {
                $args = (array) ($event['args'] ?? []);
                $row  = Journal::get((int) ($args[0] ?? 0));
                if (Site::cron_off() || $row === null || in_array($row['state'], Journal::TERMINAL, true)) {
                    wp_unschedule_event((int) $ts, Plugin::CHECK_HOOK, $args);
                    $n++;
                }
            }
        }
        return $n;
    }

    public static function scheduled_check(int $id): void
    {
        $row = Journal::get($id);
        if ($row !== null && !in_array($row['state'], Journal::TERMINAL, true)) {
            self::check($row);
        }
        State::flush();
    }

    /** Checks whose scheduled time passed (a lost event). @return string[] */
    public static function due(): array
    {
        $lines = [];
        foreach (self::finish_open() as $line) {
            $lines[] = $line;
        }
        foreach (self::detect_unseen() as $line) {
            $lines[] = $line;
        }
        $swept = self::sweep_events();
        if ($swept > 0) {
            /* translators: %d: events */
            $lines[] = sprintf(_n('Removed %d update-check event nobody will run.', 'Removed %d update-check events nobody will run.', $swept, 'dcc-ragusa'), $swept);
        }
        self::settle();
        foreach (Journal::recent(30, Journal::VERIFYING) as $row) {
            if (!in_array($row['action'], ['update-check', 'core-check', 'self-update'], true)) {
                continue;
            }
            $next = (int) ($row['verify']['next_at'] ?? 0);
            if ($next > 0 && $next <= time() - 60) {
                self::check($row);
                $lines[] = sprintf('Ran the due check for %s (journal %d)', $row['target'], $row['id']);
            }
        }
        return $lines;
    }

    public static function recover(array $row): string
    {
        if (in_array((string) ($row['before']['stage'] ?? ''), ['started', 'ended-early'], true)) {
            return ''; // an update still open: finish_open() completes or abandons it
        }
        $next = (int) ($row['verify']['next_at'] ?? 0);
        if ($row['state'] === Journal::PLANNED || $next === 0) {
            self::schedule((int) $row['id'], 60);
            return sprintf('Journal %d: check scheduled', $row['id']);
        }
        if ($next <= time()) {
            self::check($row);
            return sprintf('Journal %d: check run during recovery', $row['id']);
        }
        return sprintf('Journal %d: check still pending', $row['id']);
    }

    /**
     * After a rollback: a fresh check row that reports back to the rollback.
     * It only creates and schedules; the caller records the id on the
     * rollback row FIRST and then calls run_followup(), because in WP-CLI
     * the follow-up runs in a subprocess and may commit the rollback row
     * before this request writes to it again.
     */
    public static function after_rollback(int $rollback_id, string $slug): int
    {
        $before = [
            'slug'        => $slug,
            'kind'        => 'rollback-verify',
            'source'      => self::source(),
            'rollback_of' => $rollback_id,
            'started'     => time(),
            'errlog'      => Error_Log::snapshot(),
        ];
        $id = Journal::create('update-check', $slug, $before, 'verifying a rollback', false);
        self::schedule($id, self::FOLLOWUP);
        return $id;
    }

    /** @var callable|null tests replace the subprocess with an in-process runner */
    public static $followup_runner = null;

    /** Run a scheduled check now where that is possible (WP-CLI subprocess). */
    public static function run_followup(int $id): void
    {
        if (is_callable(self::$followup_runner)) {
            (self::$followup_runner)($id);
            return;
        }
        if (self::source() === 'cli') {
            self::cli_subprocess($id);
        }
    }

    // -------------------------------------------------------------- checks

    /**
     * @return array{checks:array<string,array{ok:?bool,detail:string}>,failed:string[],host_up:bool}
     */
    public static function run_checks(array $before, bool $inline): array
    {
        $checks  = [];
        $host_up = true;

        $override = State::get('markers_override');
        $pages    = is_array($override) && $override !== [] ? $override : Markers::all();
        if (Loopback::available()) {
            $answered = 0;
            $gated    = 0;
            foreach ($pages as $path => $markers) {
                $r = Loopback::get($path);
                if ($r['code'] > 0) {
                    $answered++;
                }
                if (!$r['ok']) {
                    $checks['page ' . $path] = ['ok' => false, 'detail' => $r['code'] > 0
                        /* translators: %d: http code */
                        ? sprintf(__('returned HTTP %d', 'dcc-ragusa'), $r['code'])
                        /* translators: %s: error */
                        : sprintf(__('no answer (%s)', 'dcc-ragusa'), $r['error'])];
                    continue;
                }
                $missing = [];
                foreach ($markers as $m) {
                    if (!str_contains($r['body'], $m)) {
                        $missing[] = $m;
                    }
                }
                if ($missing !== [] && self::looks_like_login($r['body'])) {
                    // A staging gate answered instead of the page: not a failure, not a pass.
                    $gated++;
                    $checks['page ' . $path] = ['ok' => null, 'detail' => __('behind the staging login: not checked', 'dcc-ragusa')];
                    continue;
                }
                $checks['page ' . $path] = $missing === []
                    /* translators: %d: milliseconds */
                    ? ['ok' => true, 'detail' => sprintf(__('200 with its markers (%d ms)', 'dcc-ragusa'), $r['ms'])]
                    /* translators: %s: marker */
                    : ['ok' => false, 'detail' => sprintf(__('200 but marker missing: %s', 'dcc-ragusa'), implode(', ', $missing))];
            }
            $host_up = $answered > 0;
            if ($gated > 0 && $gated === count($pages)) {
                State::set('pages_gated', time());
            } else {
                State::delete('pages_gated');
            }
        } else {
            $checks['pages'] = ['ok' => null, 'detail' => __('loopbacks do not work on this host; pages not checked', 'dcc-ragusa')];
        }

        $fatals    = Error_Log::new_fatals((array) ($before['errlog'] ?? []));
        $slug      = (string) ($before['slug'] ?? '');
        $after_ts  = (int) ($before['after_ts'] ?? 0);
        $installed = (int) ($before['installed_at'] ?? 0);
        $own       = [];
        $transient = [];
        $else      = [];
        $theirs    = [];
        foreach ($fatals as $line) {
            $t = Error_Log::line_time($line);
            if ($after_ts > 0 && ($t === null || $t <= $after_ts)) {
                continue; // read at the first failure already: one line is one failure
            }
            if ($slug === 'core' || Error_Log::in_plugin($line, $slug)) {
                $why = self::transient_reason($line, $t, $installed, $slug);
                if ($why !== null) {
                    [$type, $text] = explode(':', $why, 2);
                    $transient[]   = ['line' => $line, 'why' => $text, 'type' => $type];
                } else {
                    $own[] = $line;
                }
            } elseif (($w = self::fatal_owner($line, $slug)) !== null) {
                // Written inside another update's window, in that update's files: that update's, not this one's.
                $theirs[] = ['line' => $line, 'w' => $w];
            } else {
                $else[] = $line;
            }
        }
        foreach ($theirs as $t) {
            Events::record(Fortress::SVETI_IVAN, Events::INFO, 'fatal-attributed', (string) $t['w']['slug'], sprintf(
                /* translators: 1: other slug, 2: journal id, 3: this slug, 4: the log line */
                __('A fatal in %1$s during its own update (journal %2$d) was credited to that update, not to %3$s: %4$s', 'dcc-ragusa'),
                (string) $t['w']['slug'],
                (int) $t['w']['id'],
                $slug,
                (string) $t['line']
            ), [], (int) $t['w']['id']);
        }
        foreach ($transient as $tr) {
            Events::record(Fortress::SVETI_IVAN, Events::INFO, 'fatal-transient', $slug, sprintf(
                /* translators: 1: slug, 2: reason, 3: the log line */
                __('A fatal in %1$s was not counted against the update (%2$s): %3$s', 'dcc-ragusa'),
                $slug,
                (string) $tr['why'],
                (string) $tr['line']
            ), [], (int) ($before['journal_id'] ?? 0) ?: null);
        }
        if ($own !== []) {
            $checks['error_log'] = ['ok' => false, 'detail' => __('new fatal in this plugin: ', 'dcc-ragusa') . $own[0]];
        } elseif ($else === [] && $theirs === [] && $transient !== []) {
            $copy    = count(array_filter($transient, static fn($t) => $t['type'] === 'copy'));
            $present = count($transient) - $copy;
            $parts   = [];
            if ($copy > 0) {
                /* translators: %d: count */
                $parts[] = sprintf(_n('%d written while the plugin was still being copied', '%d written while the plugin was still being copied', $copy, 'dcc-ragusa'), $copy);
            }
            if ($present > 0) {
                /* translators: %d: count */
                $parts[] = sprintf(_n('%d for a file missing for a moment and present now', '%d for files missing for a moment and present now', $present, 'dcc-ragusa'), $present);
            }
            /* translators: 1: count, 2: the reasons */
            $checks['error_log'] = ['ok' => true, 'detail' => sprintf(__('no new fatal; %1$d not counted (%2$s)', 'dcc-ragusa'), count($transient), implode('; ', $parts))];
        } elseif ($else === [] && $theirs !== []) {
            /* translators: 1: other slug, 2: journal id */
            $checks['error_log'] = ['ok' => null, 'detail' => sprintf(__('a new fatal in %1$s during its own update (journal %2$d): that update\'s, not this one\'s', 'dcc-ragusa'), (string) $theirs[0]['w']['slug'], (int) $theirs[0]['w']['id'])];
        } elseif ($else !== []) {
            // Someone else's fatal is not evidence against this update: an alert, not a rollback.
            $checks['error_log'] = ['ok' => null, 'detail' => __('a new fatal elsewhere, not in this plugin (alerted, not counted): ', 'dcc-ragusa') . $else[0]];
            Alerts::raise([
                'fortress' => Fortress::SVETI_IVAN,
                'severity' => Events::NEEDS_LOOK,
                'kind'     => 'fatal-elsewhere',
                'target'   => $slug . '@' . substr(sha1($else[0]), 0, 8),
                'title'    => __('A New Fatal Elsewhere After This Update', 'dcc-ragusa'),
                /* translators: 1: slug, 2: the log line */
                'what'     => sprintf(__('After the update of %1$s, a PHP fatal appeared in the error log that is not in that plugin\'s files: %2$s', 'dcc-ragusa'), $slug, $else[0]),
                'did'      => __('Ragusa did not roll the update back for it: a fatal outside the updated plugin is not evidence against the update, and the page and booking checks decide.', 'dcc-ragusa'),
                'todo'     => __('Read the line. If it names a plugin you updated by hand, or your own command, nothing to do. Otherwise ask the site director.', 'dcc-ragusa'),
            ]);
        } else {
            $checks['error_log'] = ['ok' => true, 'detail' => __('no new fatal', 'dcc-ragusa')];
        }

        if (!$inline) {
            $ical = Ical::check();
            $checks['ical'] = ['ok' => $ical['ok'], 'detail' => $ical['detail']];
        }

        $failed = [];
        foreach ($checks as $name => $c) {
            if ($c['ok'] === false) {
                $failed[] = $name;
            }
        }
        if (!Loopback::available() && $failed === []) {
            $host_up = true;
        }
        return ['checks' => $checks, 'failed' => $failed, 'host_up' => $host_up];
    }

    /**
     * A fatal in the updated plugin's own files that is not evidence against
     * it, and why; null when it counts.
     *
     * 1. Stamped before the install finished (upgrader_process_complete):
     *    the copy was still being written. A request that loaded the plugin
     *    half-way through hit a missing file; that is the copy, not the code.
     * 2. "Failed opening required '<file>'" for a file inside the plugin that
     *    exists now: it was missing for a moment, and is not missing.
     */
    public static function transient_reason(string $line, ?int $t, int $installed_at, string $slug): ?string
    {
        if ($installed_at > 0 && $t !== null && $t < $installed_at) {
            /* translators: 1: when the fatal was written, 2: when the install finished */
            return 'copy:' . sprintf(__('written at %1$s, while the plugin was still being copied; the install finished at %2$s', 'dcc-ragusa'), Site::stamp($t), Site::stamp($installed_at));
        }
        $file = Error_Log::missing_file($line);
        if ($file !== null && $slug !== 'core' && Error_Log::in_plugin($file, $slug)) {
            clearstatcache(true, $file);
            if (is_file($file)) {
                /* translators: %s: file */
                return 'present:' . sprintf(__('%s was missing for a moment and is present now', 'dcc-ragusa'), basename($file));
            }
        }
        return null;
    }

    /**
     * Whose fatal is it? The recorded update (not this one) whose window the
     * fatal's time falls in AND whose files the line names: a plugin's own
     * folder, or core's areas for a core update. Null when none.
     *
     * @return array{slug:string,version:string,id:int,from:int,to:int}|null
     */
    public static function fatal_owner(string $line, string $self_slug): ?array
    {
        $t = Error_Log::line_time($line) ?? time();
        foreach (Minceta::update_windows() as $w) {
            if ($w['slug'] === $self_slug || $t < $w['from'] || $t > $w['to']) {
                continue;
            }
            $names = $w['slug'] === 'core'
                ? preg_match('#/wp-(includes|admin)/#', $line) === 1
                : Error_Log::in_plugin($line, $w['slug']);
            if ($names) {
                return $w;
            }
        }
        return null;
    }

    /** The drill's probe stands in for the five pages while it runs. */
    public static function override_markers(?array $pages): void
    {
        if ($pages === null) {
            State::delete('markers_override');
        } else {
            State::set('markers_override', $pages);
        }
        State::flush();
    }

    /** A 200 that is really a login form (WP Staging's gate, HTTP auth pages). */
    public static function looks_like_login(string $body): bool
    {
        return (bool) preg_match('/<input[^>]+type=["\']?password["\']?/i', $body)
            && (bool) preg_match('/<form\b/i', $body);
    }

    public static function format_check(string $name, array $c): string
    {
        $mark = $c['ok'] === null ? '–' : ($c['ok'] ? '✓' : '✗');
        return sprintf('Ragusa · Sveti Ivan: %s %s: %s', $mark, $name, (string) $c['detail']);
    }

    /** The decision: pass, repeat, retry a host hiccup, roll back, or alert. */
    public static function check(array $row): void
    {
        $id      = (int) $row['id'];
        $before  = $row['before'];
        $slug    = (string) $row['target'];
        // Run now: its cron event, if any, has nothing left to do.
        wp_clear_scheduled_hook(Plugin::CHECK_HOOK, [$id]);

        // A check that finishes late, for a version no longer installed, is
        // no evidence about anything: the plugin has moved on.
        if ($row['action'] === 'update-check' && empty($before['rollback_of']) && !empty($before['new_version'])) {
            $installed = Revelin::plugin_version($slug);
            if ($installed !== '' && $installed !== (string) $before['new_version']) {
                Journal::set_state($id, Journal::ABANDONED, ['note' => 'finished late; the installed version moved on to ' . $installed]);
                Events::record(Fortress::SVETI_IVAN, Events::INFO, 'check-moved-on', $slug, sprintf(
                    /* translators: 1: slug, 2: checked version, 3: installed version */
                    __('The check of %1$s %2$s finished late; %3$s is installed now, so it was set aside.', 'dcc-ragusa'),
                    $slug,
                    (string) $before['new_version'],
                    $installed
                ), [], $id);
                return;
            }
        }

        // A repeat reads the error log from where the first failure left it:
        // one fatal line must never count as two failures. A first failure
        // recorded before 0.2.2 has no offset: then only lines stamped after
        // it count. Never the update's own snapshot again.
        $scan                 = $before;
        $scan['journal_id']   = $id;
        $scan['installed_at'] = (int) ($before['installed_at'] ?? $row['created_at']);
        if (!empty($row['verify']['first_fail'])) {
            $scan['after_ts'] = (int) ($row['verify']['first_fail']['ts'] ?? time());
            if (!empty($row['verify']['first_fail']['errlog'])) {
                $scan['errlog'] = (array) $row['verify']['first_fail']['errlog'];
            }
        }
        $results = self::run_checks($scan, false);
        $attempt = (int) ($row['verify']['attempts'] ?? 0) + 1;
        $failed  = $results['failed'];
        $detail  = [];
        foreach ($failed as $name) {
            $detail[] = $name . ': ' . $results['checks'][$name]['detail'];
        }
        $patch = ['attempts' => $attempt, 'last' => $results['checks'], 'next_at' => 0, 'failed_detail' => implode('; ', $detail)];
        foreach ($results['checks'] as $name => $c) {
            self::say(self::format_check($name, $c));
        }

        if ($failed === []) {
            self::pass($row, $patch);
            return;
        }

        if (!$results['host_up']) {
            if ($attempt < self::MAX_HOST) {
                Journal::set_state($id, Journal::VERIFYING, ['verify' => $patch]);
                self::schedule($id, self::HOST_RETRY);
                Events::record(Fortress::SVETI_IVAN, Events::INFO, 'host-hiccup', $slug, __('The site did not answer at all; this is treated as a host hiccup and checked again in 15 minutes.', 'dcc-ragusa'), [], $id);
                return;
            }
            Journal::set_state($id, Journal::FAILED, ['verify' => $patch, 'note' => 'host did not answer three times']);
            Alerts::raise([
                'fortress' => Fortress::SVETI_IVAN,
                'severity' => Events::NEEDS_LOOK,
                'kind'     => 'update-unverified',
                'journal_id' => $id,
                'target'   => $slug,
                'title'    => __('Could Not Verify An Update', 'dcc-ragusa'),
                /* translators: %s: slug */
                'what'     => sprintf(__('After the update of %s, the site did not answer Ragusa\'s checks three times in a row.', 'dcc-ragusa'), $slug),
                'did'      => __('Ragusa did not roll anything back, because a site that does not answer at all is a host problem, not evidence about the update.', 'dcc-ragusa'),
                'todo'     => __('Open the site. If it loads and books, nothing to do. If not, ask the site director.', 'dcc-ragusa'),
            ]);
            Fortress::note(Fortress::SVETI_IVAN, __('Last Update Could Not Be Verified', 'dcc-ragusa'), Events::fingerprint(Fortress::SVETI_IVAN, 'update-unverified', $slug));
            return;
        }

        $first = $row['verify']['first_fail'] ?? null;
        if ($first === null) {
            $patch['first_fail'] = ['ts' => time(), 'failed' => $failed, 'errlog' => Error_Log::snapshot()];
            Journal::set_state($id, Journal::VERIFYING, ['verify' => $patch]);
            self::schedule($id, self::REPEAT);
            Events::record(Fortress::SVETI_IVAN, Events::INFO, 'check-failed-once', $slug, sprintf(
                /* translators: %s: detail */
                __('A check failed once (%s); repeating in 5 minutes before anything is decided.', 'dcc-ragusa'),
                implode('; ', $detail)
            ), [], $id);
            self::say(__('Ragusa · Sveti Ivan: failed once; the repeat in 5 minutes decides.', 'dcc-ragusa'));
            return;
        }

        $repeated = array_intersect((array) ($first['failed'] ?? []), $failed);
        if ($repeated === []) {
            // A different check failed this time: one more repeat, never a rollback on two different single failures.
            $patch['first_fail'] = ['ts' => time(), 'failed' => $failed, 'errlog' => Error_Log::snapshot()];
            Journal::set_state($id, Journal::VERIFYING, ['verify' => $patch]);
            self::schedule($id, self::REPEAT);
            return;
        }

        // The same check failed twice. Rollback, or alert.
        if (!empty($before['rollback_of'])) {
            Journal::set_state($id, Journal::FAILED, ['verify' => $patch, 'note' => 'the restored version fails too']);
            $rb = Journal::get((int) $before['rollback_of']);
            if ($rb !== null) {
                Rollback::finish($rb, false, $results['checks']);
            }
            return;
        }
        $entry    = !empty($before['entry']) ? Vault::entry((string) $before['entry']) : null;
        $eligible = $row['action'] === 'update-check'
            && ($before['kind'] ?? '') === 'update'
            && empty($before['is_self'])
            && $entry !== null
            && (time() - (int) ($before['started'] ?? 0)) <= self::WINDOW;
        if ($eligible) {
            Journal::set_state($id, Journal::FAILED, ['verify' => $patch, 'note' => 'failed twice; rolling back']);
            $r = Rollback::run([
                'slug'        => $slug,
                'entry'       => $entry,
                'check_id'    => $id,
                'new_version' => (string) ($before['new_version'] ?? ''),
                'old_version' => (string) ($before['old_version'] ?? ''),
            ]);
            self::say('Ragusa · Sveti Ivan: ' . $r['message']);
            return;
        }
        Journal::set_state($id, Journal::FAILED, ['verify' => $patch, 'note' => 'failed twice; no rollback possible']);
        $why = $entry === null
            ? __('there is no sealed copy of the previous version', 'dcc-ragusa')
            : (($before['kind'] ?? '') !== 'update' ? __('this was a new install, not an update', 'dcc-ragusa') : __('the failure appeared more than an hour after the update', 'dcc-ragusa'));
        Alerts::raise([
            'fortress' => Fortress::SVETI_IVAN,
            'severity' => Events::BREACHED,
            'kind'     => 'update-failed',
            'journal_id' => $id,
            'target'   => $slug,
            'title'    => __('Update Failed Its Checks', 'dcc-ragusa'),
            /* translators: 1: slug, 2: detail */
            'what'     => sprintf(__('After the update of %1$s, a check failed twice, five minutes apart: %2$s.', 'dcc-ragusa'), $slug, implode('; ', $detail)),
            /* translators: %s: reason */
            'did'      => sprintf(__('Ragusa did not roll it back because %s.', 'dcc-ragusa'), $why),
            'todo'     => __('Ask the site director to look at the site and, if needed, reinstall the previous version of the plugin.', 'dcc-ragusa'),
        ]);
        /* translators: %s: slug */
        Fortress::note(Fortress::SVETI_IVAN, sprintf(__('%s Failed Its Checks', 'dcc-ragusa'), $slug), Events::fingerprint(Fortress::SVETI_IVAN, 'update-failed', $slug));
    }

    private static function pass(array $row, array $patch): void
    {
        $id     = (int) $row['id'];
        $slug   = (string) $row['target'];
        $before = $row['before'];
        Journal::set_state($id, Journal::COMMITTED, ['verify' => $patch]);
        $n = count(array_filter($patch['last'], static fn($c) => $c['ok'] === true));
        Events::record(Fortress::SVETI_IVAN, Events::INFO, 'update-checked', $slug, sprintf(
            /* translators: 1: slug, 2: version, 3: number of checks */
            __('%1$s %2$s passed its %3$d checks.', 'dcc-ragusa'),
            $slug,
            (string) ($before['new_version'] ?? $before['version'] ?? ''),
            $n
        ), [], $id);
        self::say(__('Ragusa · Sveti Ivan: all checks passed.', 'dcc-ragusa'));

        if (!empty($before['rollback_of'])) {
            $rb = Journal::get((int) $before['rollback_of']);
            if ($rb !== null) {
                Rollback::finish($rb, true, $patch['last']);
            }
            Minceta::rebaseline(Site::plugins_dir() . '/' . $slug);
            return;
        }
        if ($row['action'] === 'self-update') {
            Revelin::seal_self();
            State::delete('self_update_pending');
            Minceta::rebaseline(rtrim(DCCR_DIR, '/'));
        }
        Alerts::resolve(Events::fingerprint(Fortress::SVETI_IVAN, 'update-failed', $slug));
        Alerts::resolve(Events::fingerprint(Fortress::SVETI_IVAN, 'update-unverified', $slug));
        self::settle();
        /* translators: %d: number of checks */
        Fortress::note(Fortress::SVETI_IVAN, sprintf(__('Last Update Passed All %d Checks', 'dcc-ragusa'), $n));
    }

    /**
     * A rollback finding resolves when a version newer than the rolled-back
     * one is installed (it passed its checks, or Sveti Ivan would have
     * said so), or when the rollback was reversed. Run after every pass
     * and on every tick, so a journal that finished late settles too.
     */
    public static function settle(bool $quiet = false): void
    {
        foreach (Alerts::open(Fortress::SVETI_IVAN) as $fp => $a) {
            if (($a['kind'] ?? '') !== 'update-rolled-back') {
                continue;
            }
            $slug   = (string) ($a['target'] ?? '');
            $rolled = (string) ($a['data']['rolled_back'] ?? '');
            if ($slug === '' || $rolled === '') {
                continue;
            }
            $installed = Revelin::plugin_version($slug);
            if ($installed !== '' && version_compare($installed, $rolled, '>')) {
                Alerts::resolve($fp, $quiet);
            }
        }
    }

    // ------------------------------------------------------------- WP-CLI

    /** Run `wp ragusa check --after=<id>` in a fresh process and print its output. */
    public static function cli_subprocess(int $id): bool
    {
        if (!function_exists('proc_open')) {
            return false;
        }
        $argv0 = (string) ($GLOBALS['argv'][0] ?? '');
        if ($argv0 === '') {
            return false;
        }
        $cmd = [];
        if (str_ends_with($argv0, '.phar') || str_ends_with($argv0, '.php')) {
            $cmd[] = PHP_BINARY;
        }
        $cmd[] = $argv0;
        $cmd   = array_merge($cmd, ['ragusa', 'check', '--after=' . $id, '--path=' . Site::abspath()]);
        $spec  = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc  = @proc_open($cmd, $spec, $pipes);
        if (!is_resource($proc)) {
            return false;
        }
        fclose($pipes[0]);
        stream_set_timeout($pipes[1], 120);
        $out = (string) stream_get_contents($pipes[1]);
        $err = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        foreach (preg_split('/\r?\n/', trim($out . "\n" . $err)) ?: [] as $line) {
            if ($line !== '') {
                self::say($line);
            }
        }
        State::reset();
        return true;
    }

    public static function status_line(): string
    {
        $line = Fortress::row_line(Fortress::SVETI_IVAN);
        if ((int) State::get('pages_gated', 0) > 0) {
            $line .= ' · ' . __('Pages Are Behind The Staging Login: Not Checked', 'dcc-ragusa');
        } elseif (!Loopback::available()) {
            $line .= ' · ' . __('Loopbacks Do Not Work On This Host: Pages Not Checked', 'dcc-ragusa');
        }
        return $line;
    }
}
