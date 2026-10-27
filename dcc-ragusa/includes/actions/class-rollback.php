<?php
namespace DCCR\Action;

use DCCR\Alerts;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Fortress\Revelin;
use DCCR\Fortress\Sveti_Ivan;
use DCCR\Journal;
use DCCR\Php_Check;
use DCCR\Site;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A4: put the previous version of a plugin back from Revelin. Stage beside
 * the broken one, swap with a directory rename, keep the broken copy in
 * quarantine, purge caches, switch auto-update off for that plugin, then
 * re-check. If the old version fails the same checks, the problem is not
 * the update: the new version goes back and the row is Reversed.
 */
final class Rollback extends Base
{
    public const ACTION = 'rollback';

    /** @param array{slug:string,entry:array,check_id:int,new_version:string,old_version:string} $plan */
    public static function run(array $plan): array
    {
        $slug  = (string) $plan['slug'];
        $entry = (array) $plan['entry'];
        $dir   = Site::plugins_dir() . '/' . $slug;
        $rel   = Site::rel($dir);
        $id    = Journal::create(self::ACTION, $slug, [
            'slug'        => $slug,
            'entry'       => (string) ($entry['id'] ?? ''),
            'check_id'    => (int) ($plan['check_id'] ?? 0),
            'new_version' => (string) ($plan['new_version'] ?? ''),
            'old_version' => (string) ($plan['old_version'] ?? ''),
        ], 'update failed its checks twice');

        if (!Vault::verify_manifest() || !Vault::entry_intact($entry)) {
            return self::fail($id, 'the sealed copy or its manifest does not verify; not rolling back', Fortress::SVETI_IVAN, 'rollback-failed', $slug);
        }
        if (!is_dir($dir)) {
            return self::fail($id, 'the plugin folder is missing', Fortress::SVETI_IVAN, 'rollback-failed', $slug);
        }

        $plugin_file = Revelin::plugin_file($slug);
        $auto        = (array) get_option('auto_update_plugins', []);
        $before      = [
            'dir'         => $rel,
            'plugin_file' => $plugin_file,
            'auto_update' => $plugin_file !== '' && in_array($plugin_file, $auto, true),
            'files'       => count(Vault::list_files($dir)),
        ];
        Journal::set_state($id, Journal::BEFORE, ['before' => $before]);

        $staged     = Site::content_dir() . '/upgrade/ragusa-' . $slug . '-' . $id;
        $quarantine = Vault::quarantine_dir($id) . '/' . $slug;
        Journal::set_state($id, Journal::ACTING, ['after' => ['staged' => $staged, 'quarantine' => $quarantine, 'step' => 1]]);

        // Step 1: stage and verify.
        if (!Vault::extract($entry, $staged) || !Vault::verify_extracted($entry, $staged)) {
            Vault::rm_rf($staged);
            return self::fail($id, 'the sealed copy did not extract cleanly', Fortress::SVETI_IVAN, 'rollback-failed', $slug);
        }
        if ($plugin_file !== '') {
            $main = $staged . '/' . basename($plugin_file);
            if (is_file($main)) {
                $lint = Php_Check::lint($main);
                if (!$lint['ok']) {
                    Vault::rm_rf($staged);
                    return self::fail($id, 'the sealed copy failed the syntax check: ' . $lint['message'], Fortress::SVETI_IVAN, 'rollback-failed', $slug);
                }
            }
        }

        // Step 2: the broken version goes to quarantine.
        Journal::set_state($id, Journal::ACTING, ['after' => ['step' => 2]]);
        if (Vault::move_in($dir, $quarantine) === null) {
            Vault::rm_rf($staged);
            return self::fail($id, 'could not move the broken version aside', Fortress::SVETI_IVAN, 'rollback-failed', $slug);
        }

        // Step 3: the previous version takes its place.
        Journal::set_state($id, Journal::ACTING, ['after' => ['step' => 3]]);
        if (Vault::move_in($staged, $dir) === null) {
            Vault::move_in($quarantine, $dir);
            Journal::set_state($id, Journal::REVERSED, ['note' => 'could not place the previous version; broken version put back']);
            Events::record(Fortress::SVETI_IVAN, Events::NEEDS_LOOK, 'rollback-failed', $slug, __('The previous version could not be put in place; the update was left as it was.', 'dcc-ragusa'), [], $id);
            return ['ok' => false, 'id' => $id, 'message' => 'rollback reversed: could not place the previous version'];
        }

        // Steps 4–5: caches and the auto-update flag, both idempotent.
        self::after_swap($id, $before);

        // Verifying: a fresh check in a fresh request.
        Journal::set_state($id, Journal::VERIFYING, ['after' => ['step' => 5]]);
        self::verify_now($id, $slug);
        return ['ok' => true, 'id' => $id, 'message' => sprintf('rolled %s back to %s; verifying', $slug, (string) ($plan['old_version'] ?? ''))];
    }

    /**
     * Create the verification row, record its id on this row, and only
     * THEN run the follow-up: in WP-CLI that follow-up is a subprocess that
     * may commit this row before we return, and a write after it would put
     * the row back to Verifying.
     */
    private static function verify_now(int $id, string $slug): void
    {
        $check = Sveti_Ivan::after_rollback($id, $slug);
        Journal::set_state($id, Journal::VERIFYING, ['verify' => ['check_id' => $check]]);
        Sveti_Ivan::run_followup($check);
    }

    private static function after_swap(int $id, array $before): void
    {
        Journal::set_state($id, Journal::ACTING, ['after' => ['step' => 4, 'purged' => self::purge_caches()]]);
        $removed = false;
        if (!empty($before['auto_update']) && !empty($before['plugin_file'])) {
            $auto = (array) get_option('auto_update_plugins', []);
            $new  = array_values(array_diff($auto, [$before['plugin_file']]));
            if ($new !== $auto) {
                update_option('auto_update_plugins', $new);
                $removed = true;
            }
        }
        Journal::set_state($id, Journal::ACTING, ['after' => ['auto_update_removed' => $removed]]);
    }

    /** @return string[] what was purged */
    public static function purge_caches(): array
    {
        $done = [];
        try {
            if (class_exists('\\SpeedyCache\\Delete') && method_exists('\\SpeedyCache\\Delete', 'all_cache')) {
                \SpeedyCache\Delete::all_cache();
                $done[] = 'speedycache';
            }
        } catch (\Throwable $e) {
            $done[] = 'speedycache-error';
        }
        try {
            if (class_exists('\\Elementor\\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) {
                \Elementor\Plugin::$instance->files_manager->clear_cache();
                $done[] = 'elementor';
            }
        } catch (\Throwable $e) {
            $done[] = 'elementor-error';
        }
        if (function_exists('wp_cache_flush')) {
            wp_cache_flush();
            $done[] = 'object-cache';
        }
        return $done;
    }

    /** Called by Sveti Ivan once the post-rollback check has run. */
    public static function finish(array $row, bool $ok, array $results): void
    {
        $id   = (int) $row['id'];
        $slug = (string) $row['target'];
        if ($ok) {
            Journal::set_state($id, Journal::COMMITTED, ['verify' => ['results' => $results]]);
            Events::record(Fortress::SVETI_IVAN, Events::BREACHED, 'update-rolled-back', $slug, sprintf(
                /* translators: 1: slug, 2: new version, 3: old version */
                __('The update of %1$s to %2$s broke a check twice; version %3$s was put back.', 'dcc-ragusa'),
                $slug,
                (string) ($row['before']['new_version'] ?? ''),
                (string) ($row['before']['old_version'] ?? '')
            ), [], $id);
            Alerts::raise([
                'fortress' => Fortress::SVETI_IVAN,
                'severity' => Events::BREACHED,
                'kind'     => 'update-rolled-back',
                'target'   => $slug,
                'title'    => __('Update Rolled Back', 'dcc-ragusa'),
                /* translators: 1: slug, 2: new version, 3: what failed */
                'what'     => sprintf(__('The update of %1$s to version %2$s failed the same check twice, five minutes apart: %3$s.', 'dcc-ragusa'), $slug, (string) ($row['before']['new_version'] ?? ''), (string) ($row['verify']['failed_detail'] ?? __('see the Ragusa page', 'dcc-ragusa'))),
                /* translators: 1: old version, 2: journal id */
                'did'      => sprintf(__('Ragusa put version %1$s back from its sealed copy, purged the caches, checked the site again, kept the broken copy in quarantine as journal entry %2$d, and switched automatic updates off for this one plugin.', 'dcc-ragusa'), (string) ($row['before']['old_version'] ?? ''), $id),
                'todo'     => __('Nothing urgent: the site books again. When the plugin\'s next version is out, update it from the Plugins screen and Ragusa will check it. Ask the site director before turning its automatic updates back on.', 'dcc-ragusa'),
                'data'     => ['rolled_back' => (string) ($row['before']['new_version'] ?? ''), 'restored' => (string) ($row['before']['old_version'] ?? '')],
            ]);
            Fortress::note(Fortress::SVETI_IVAN, sprintf(
                /* translators: 1: slug, 2: old version */
                __('%1$s Rolled Back To %2$s', 'dcc-ragusa'),
                $slug,
                (string) ($row['before']['old_version'] ?? '')
            ), Events::fingerprint(Fortress::SVETI_IVAN, 'update-rolled-back', $slug));
            return;
        }
        // Both versions fail: not the update. Put the new one back.
        $swapped = self::reverse_swap($row);
        Journal::set_state($id, Journal::REVERSED, ['verify' => ['results' => $results], 'note' => $swapped ? 'both versions fail these checks; the update was put back' : 'both versions fail; could not put the update back']);
        Alerts::raise([
            'fortress' => Fortress::SVETI_IVAN,
            'severity' => Events::BREACHED,
            'kind'     => 'update-failed',
            'target'   => $slug,
            'title'    => __('Site Check Failing, Not The Update', 'dcc-ragusa'),
            /* translators: %s: slug */
            'what'     => sprintf(__('After the update of %s failed a check twice, Ragusa put the previous version back, and that version fails the same check.', 'dcc-ragusa'), $slug),
            'did'      => $swapped
                ? __('So this is not the update. Ragusa put the new version back and changed nothing else.', 'dcc-ragusa')
                : __('Ragusa could not put the new version back; the previous version is in place.', 'dcc-ragusa'),
            'todo'     => __('Ask the site director to look at the site: something other than this plugin is broken.', 'dcc-ragusa'),
        ]);
        Fortress::note(Fortress::SVETI_IVAN, __('A Check Fails With Either Version', 'dcc-ragusa'), Events::fingerprint(Fortress::SVETI_IVAN, 'update-failed', $slug));
    }

    /** Swap the folders back: the new version returns, the old one goes to quarantine. */
    private static function reverse_swap(array $row): bool
    {
        $id         = (int) $row['id'];
        $slug       = (string) $row['target'];
        $dir        = Site::plugins_dir() . '/' . $slug;
        $quarantine = (string) ($row['after']['quarantine'] ?? '');
        if ($quarantine === '' || !is_dir($quarantine)) {
            return false;
        }
        $aside = Vault::quarantine_dir($id) . '/reversed-' . $slug;
        if (is_dir($dir) && Vault::move_in($dir, $aside) === null) {
            return false;
        }
        if (Vault::move_in($quarantine, $dir) === null) {
            Vault::move_in($aside, $dir);
            return false;
        }
        if (!empty($row['after']['auto_update_removed']) && !empty($row['before']['plugin_file'])) {
            $auto = (array) get_option('auto_update_plugins', []);
            if (!in_array($row['before']['plugin_file'], $auto, true)) {
                $auto[] = $row['before']['plugin_file'];
                update_option('auto_update_plugins', $auto);
            }
        }
        self::purge_caches();
        return true;
    }

    public static function recover(array $row): string
    {
        $id         = (int) $row['id'];
        $slug       = (string) $row['target'];
        $dir        = Site::plugins_dir() . '/' . $slug;
        $staged     = (string) ($row['after']['staged'] ?? '');
        $quarantine = (string) ($row['after']['quarantine'] ?? '');
        switch ($row['state']) {
            case Journal::PLANNED:
            case Journal::BEFORE:
                return self::abandon($id, 'run died before acting; nothing was changed');
            case Journal::ACTING:
                $has_dir   = is_dir($dir);
                $has_stage = $staged !== '' && is_dir($staged);
                $has_quar  = $quarantine !== '' && is_dir($quarantine);
                if (!$has_dir && $has_stage) {
                    // Died between step 2 and 3: finish the swap.
                    if (Vault::move_in($staged, $dir) === null) {
                        Vault::move_in($quarantine, $dir);
                        Journal::set_state($id, Journal::REVERSED, ['note' => 'recovery could not place the previous version; broken version put back']);
                        return 'Journal ' . $id . ' reversed during recovery';
                    }
                    self::after_swap($id, $row['before']);
                    Journal::set_state($id, Journal::VERIFYING);
                    self::verify_now($id, $slug);
                    return 'Journal ' . $id . ' recovered: swap finished, verifying';
                }
                if (!$has_dir && !$has_stage && $has_quar) {
                    Vault::move_in($quarantine, $dir);
                    Journal::set_state($id, Journal::REVERSED, ['note' => 'staged copy missing; broken version put back']);
                    return 'Journal ' . $id . ' reversed: staged copy was missing';
                }
                if ($has_dir && $has_stage) {
                    Vault::rm_rf($staged);
                    return self::abandon($id, 'swap had not started; staged copy removed');
                }
                if ($has_dir && $has_quar) {
                    // Swap done, died before caches/flag.
                    self::after_swap($id, $row['before']);
                    Journal::set_state($id, Journal::VERIFYING);
                    self::verify_now($id, $slug);
                    return 'Journal ' . $id . ' recovered: finishing after the swap';
                }
                return self::abandon($id, 'nothing to recover');
            case Journal::VERIFYING:
                $check_id = (int) ($row['verify']['check_id'] ?? 0);
                $check    = $check_id > 0 ? Journal::get($check_id) : null;
                if ($check === null) {
                    self::verify_now($id, $slug);
                    return 'Journal ' . $id . ': verification scheduled again';
                }
                if (in_array($check['state'], Journal::TERMINAL, true)) {
                    self::finish($row, $check['state'] === Journal::COMMITTED, $check['verify']);
                    return 'Journal ' . $id . ' finished from its check';
                }
                return 'Journal ' . $id . ' still verifying';
        }
        return 'Journal ' . $id . ' needed nothing';
    }

    public static function reverse(array $row): array
    {
        if ($row['state'] !== Journal::COMMITTED) {
            return [false, __('Only a committed rollback can be undone.', 'dcc-ragusa')];
        }
        if (!self::reverse_swap($row)) {
            Journal::set_state((int) $row['id'], $row['state'], ['reversible' => false]);
            return [false, __('The quarantined copy is no longer there.', 'dcc-ragusa')];
        }
        Journal::set_state((int) $row['id'], Journal::REVERSED, ['note' => 'rollback undone on request: the new version is back']);
        Events::record(Fortress::SVETI_IVAN, Events::INFO, 'rollback-undone', (string) $row['target'], __('A rollback was undone on request; the newer version is back in place.', 'dcc-ragusa'), [], (int) $row['id']);
        Alerts::resolve(Events::fingerprint(Fortress::SVETI_IVAN, 'update-rolled-back', (string) $row['target']), true);
        Fortress::note(Fortress::SVETI_IVAN, sprintf(
            /* translators: %s: slug */
            __('%s Rollback Undone On Request', 'dcc-ragusa'),
            (string) $row['target']
        ));
        return [true, __('The newer version is back in place and automatic updates are on again for it.', 'dcc-ragusa')];
    }
}
