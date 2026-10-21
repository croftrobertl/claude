<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * One tick every 10 minutes, about 5 seconds of work, ordered by urgency,
 * each piece resumable from a cursor. WP-Cron runs it; the cPanel knock
 * only guarantees it is kicked.
 */
final class Cron
{
    public const SCHEDULE = 'dccr_10min';
    public const BUDGET   = 5.0;

    public static function schedules(array $s): array
    {
        $s[self::SCHEDULE] = ['interval' => 600, 'display' => __('Every 10 Minutes (Ragusa)', 'dcc-ragusa')];
        return $s;
    }

    public static function schedule(): void
    {
        if (!wp_next_scheduled(Plugin::TICK_HOOK)) {
            wp_schedule_event(time() + 60, self::SCHEDULE, Plugin::TICK_HOOK);
        }
    }

    public static function unschedule(): void
    {
        wp_unschedule_hook(Plugin::TICK_HOOK);
        wp_unschedule_hook(Plugin::CHECK_HOOK);
        wp_unschedule_hook(Plugin::DIGEST_HOOK);
    }

    /**
     * The tick. Returns a short report (also printed by `wp ragusa scan`).
     *
     * @return string[]
     */
    public static function tick(?Budget $budget = null, bool $force_walk = false): array
    {
        $report = [];
        Schema::ensure();
        if (!Vault::lock()) {
            return [__('Another tick holds the lock; skipped.', 'dcc-ragusa')];
        }
        $budget ??= new Budget(self::BUDGET);
        try {
            State::set('last_tick', time());
            State::set('vault_in_web_root', Vault::in_web_root());
            if (Fortress::status(Fortress::SVETI_IVAN)['state'] === Fortress::UNKNOWN) {
                Fortress::set_status(Fortress::SVETI_IVAN, Fortress::HOLDING, __('No Update Since Ragusa Was Installed', 'dcc-ragusa'));
            }

            // 1. Finish or reverse what a dead run left behind.
            foreach (Actions::recover() as $line) {
                $report[] = $line;
            }
            Vault::progress();

            // 2. Update checks and repeats that are due.
            foreach (Fortress\Sveti_Ivan::due() as $line) {
                $report[] = $line;
            }
            Vault::progress();

            // 3. The gate.
            $report[] = Fortress\Bokar::tick();
            Vault::progress();

            // 4. The cheap every-tick checks.
            foreach (Fortress\Minceta::quick() as $line) {
                $report[] = $line;
            }
            Vault::progress();

            // 5–6. The walk, within what is left of the budget.
            $walk = Fortress\Minceta::walk($budget, $force_walk);
            if ($walk !== '') {
                $report[] = $walk;
            }
            Vault::progress();

            // 7. Disk, hourly.
            $disk = Fortress\Minceta::disk($budget);
            if ($disk !== '') {
                $report[] = $disk;
            }

            // 8–9. The lookout.
            foreach (Fortress\Lovrijenac::due($budget) as $line) {
                $report[] = $line;
            }
            Vault::progress();

            if (Alerts::digest_due()) {
                Alerts::send_digest();
            }

            // 10. The heartbeat.
            $breached = [];
            foreach (Fortress::all() as $slug) {
                if (Fortress::status($slug)['state'] === Fortress::BREACHED) {
                    $breached[] = Fortress::name($slug);
                }
            }
            $result = $breached === []
                ? Heartbeat::ping(true)
                /* translators: %s: fortress names */
                : Heartbeat::ping(false, sprintf(__('Breached: %s', 'dcc-ragusa'), implode(', ', $breached)));
            /* translators: 1: tick length in seconds, 2: heartbeat result */
            $report[] = sprintf(__('Tick finished in %1$.1f s; heartbeat %2$s.', 'dcc-ragusa'), $budget->elapsed(), $result);
        } catch (\Throwable $e) {
            Events::record(Fortress::REVELIN, Events::NEEDS_LOOK, 'tick-error', get_class($e), Text::scrub($e->getMessage()));
            $report[] = 'Error: ' . Text::scrub($e->getMessage());
        } finally {
            State::flush();
            Vault::unlock();
        }
        return $report;
    }
}
