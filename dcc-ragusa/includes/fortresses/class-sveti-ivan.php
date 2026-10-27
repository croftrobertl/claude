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
        return wp_doing_cron() ? 'auto' : 'admin';
    }

    private static function after_plugin(string $slug, string $action): void
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
        $id = Journal::create($is_self ? 'self-update' : 'update-check', $slug, $before, $kind . ' from ' . $before['source'], false);
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
        $results = self::run_checks($before, true);
        Journal::set_state($id, Journal::VERIFYING, ['verify' => ['inline' => $results['checks']]]);
        foreach ($results['checks'] as $name => $c) {
            self::say(self::format_check($name, $c));
        }
        if ($results['failed'] !== []) {
            /* translators: %s: check names */
            self::say(sprintf(__('Ragusa · Sveti Ivan: %s failed; a repeat check decides, nothing is rolled back from one failure.', 'dcc-ragusa'), implode(', ', $results['failed'])));
        }
        // The plugin's own files are the new baseline now, not a finding; a
        // rollback re-baselines again.
        $n = Minceta::rebaseline(Site::plugins_dir() . '/' . $slug);
        Events::record(Fortress::MINCETA, Events::INFO, 'plugin-rebaselined', $slug, sprintf(
            /* translators: 1: slug, 2: version, 3: files */
            __('%1$s %2$s: %3$d files updated and accepted as the baseline.', 'dcc-ragusa'),
            $slug,
            $before['new_version'] !== '' ? $before['new_version'] : '?',
            $n
        ), [], $id);
        self::schedule($id, self::FOLLOWUP);
        if (self::source() === 'cli') {
            if (!self::cli_subprocess($id)) {
                self::say(__('Ragusa · Sveti Ivan: the in-process checks run on the next cron tick (no wp subprocess available).', 'dcc-ragusa'));
            }
        }
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
