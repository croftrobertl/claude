<?php
namespace DCCR\Action;

use DCCR\Alerts;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Journal;
use DCCR\Loopback;
use DCCR\Php_Check;
use DCCR\Site;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A2: put a guarded file back from its sealed copy. The changed file is
 * kept in quarantine first, so an edit made on purpose is never lost.
 * Restored at most twice in 24 hours; a third mismatch is an alert.
 */
final class Restore_Guard extends Base
{
    public const ACTION   = 'restore-guard';
    public const MAX_24H  = 2;

    /** @param array{label:string,path:string,entry:array} $plan */
    public static function run(array $plan): array
    {
        $path  = (string) $plan['path'];
        $rel   = Site::rel($path);
        $entry = (array) $plan['entry'];
        $label = (string) $plan['label'];

        $recent = Journal::count_since(self::ACTION, $rel, time() - 86400, [Journal::COMMITTED]);
        if ($recent >= self::MAX_24H) {
            Alerts::raise([
                'fortress' => Fortress::REVELIN,
                'severity' => Events::BREACHED,
                'kind'     => 'guard-keeps-changing',
                'target'   => $rel,
                'title'    => __('Guarded File Keeps Changing', 'dcc-ragusa'),
                /* translators: 1: path, 2: count */
                'what'     => sprintf(__('%1$s changed again after Ragusa restored it %2$d times in 24 hours.', 'dcc-ragusa'), $rel, $recent),
                'did'      => __('Ragusa stopped restoring it, so it is not fighting whoever is changing it.', 'dcc-ragusa'),
                /* translators: %s: path */
                'todo'     => sprintf(__('Look at the file. If the change is yours, run wp ragusa seal %s. If not, change the administrator passwords and ask the site director to inspect the server.', 'dcc-ragusa'), $rel),
            ]);
            return ['ok' => false, 'id' => 0, 'message' => sprintf('%s keeps changing; alerted instead of restoring', $rel)];
        }

        $id = Journal::create(self::ACTION, $rel, ['label' => $label, 'entry' => $entry['id'] ?? ''], 'sealed copy differs');

        if (!Vault::verify_manifest() || !Vault::entry_intact($entry)) {
            return self::fail($id, 'the sealed copy or its manifest does not verify; not restoring', Fortress::REVELIN, 'vault-unverified', $rel);
        }

        // Before: keep whatever is there now.
        $before = self::stat($path);
        if ($before['exists']) {
            $keep = Vault::quarantine_dir($id) . '/' . $rel;
            Vault::make_room(0);
            if (!is_dir(dirname($keep))) {
                @mkdir(dirname($keep), 0700, true);
            }
            @copy($path, $keep);
            $before['kept'] = $keep;
        }
        Journal::set_state($id, Journal::BEFORE, ['before' => $before]);

        // Acting: extract beside the target, lint, then rename over it.
        $tmp = $path . '.ragusa-tmp';
        Journal::set_state($id, Journal::ACTING, ['after' => ['tmp' => $tmp, 'sha256' => $entry['sha256'] ?? '']]);
        if (!@copy(Vault::path($entry), $tmp)) {
            return self::fail($id, 'could not stage the sealed copy', Fortress::REVELIN, 'restore-failed', $rel);
        }
        if (str_ends_with($rel, '.php')) {
            $lint = Php_Check::lint($tmp);
            if (!$lint['ok']) {
                @unlink($tmp);
                return self::fail($id, 'the sealed copy failed the syntax check (' . $lint['method'] . '): ' . $lint['message'], Fortress::REVELIN, 'restore-failed', $rel);
            }
        }
        if (!empty($before['mode'])) {
            @chmod($tmp, (int) $before['mode']);
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return self::fail($id, 'could not put the sealed copy in place', Fortress::REVELIN, 'restore-failed', $rel);
        }
        return self::verify($id, $rel, $path, $entry, $before);
    }

    private static function verify(int $id, string $rel, string $path, array $entry, array $before): array
    {
        Journal::set_state($id, Journal::VERIFYING);
        $hash_ok = self::sha($path) === ($entry['sha256'] ?? '');
        $home    = null;
        if ($hash_ok && Loopback::available()) {
            $r    = Loopback::get('/');
            $home = $r['ok'];
        }
        if ($hash_ok && $home !== false) {
            Journal::set_state($id, Journal::COMMITTED, ['verify' => ['hash' => true, 'home' => $home]]);
            Events::record(Fortress::REVELIN, Events::BREACHED, 'guard-restored', $rel, sprintf(
                /* translators: %s: path */
                __('%s no longer matched its sealed copy and was put back.', 'dcc-ragusa'),
                $rel
            ), [], $id);
            Alerts::raise([
                'fortress' => Fortress::REVELIN,
                'severity' => Events::BREACHED,
                'kind'     => 'guard-restored',
                'journal_id' => $id,
                'acted'    => true,
                'target'   => $rel,
                'title'    => __('Guarded File Restored', 'dcc-ragusa'),
                'what'     => !empty($before['exists'])
                    /* translators: %s: path */
                    ? sprintf(__('The file %s no longer matched its sealed copy.', 'dcc-ragusa'), $rel)
                    /* translators: %s: path */
                    : sprintf(__('The file %s was missing.', 'dcc-ragusa'), $rel),
                'did'      => !empty($before['exists'])
                    /* translators: %d: journal id */
                    ? sprintf(__('Ragusa put the sealed copy back, checked that the site still loads, and kept the changed file in quarantine as journal entry %d.', 'dcc-ragusa'), $id)
                    : __('Ragusa put the sealed copy back and checked that the site still loads.', 'dcc-ragusa'),
                /* translators: %s: path */
                'todo'     => sprintf(__('If you or the site director changed this file on purpose, run wp ragusa seal %s, or open Ragusa and tap Seal. Otherwise, nothing to do.', 'dcc-ragusa'), $rel),
            ]);
            return ['ok' => true, 'id' => $id, 'message' => sprintf('Restored %s', $rel)];
        }
        // Reverse: put the kept copy back.
        $kept = (string) ($before['kept'] ?? '');
        if ($kept !== '' && is_file($kept)) {
            @copy($kept, $path);
        }
        Journal::set_state($id, Journal::REVERSED, ['verify' => ['hash' => $hash_ok, 'home' => $home], 'note' => $hash_ok ? 'home page failed after restore' : 'hash did not match after restore']);
        Alerts::raise([
            'fortress' => Fortress::REVELIN,
            'severity' => Events::BREACHED,
            'kind'     => 'restore-reversed',
            'journal_id' => $id,
            'acted'    => true,
            'target'   => $rel,
            'title'    => __('Restore Reversed', 'dcc-ragusa'),
            /* translators: %s: path */
            'what'     => sprintf(__('Ragusa restored %s from its sealed copy, but the site did not load afterwards.', 'dcc-ragusa'), $rel),
            'did'      => __('It put the previous file back and left things as they were.', 'dcc-ragusa'),
            'todo'     => __('Ask the site director to look at this file and the sealed copy.', 'dcc-ragusa'),
        ]);
        return ['ok' => false, 'id' => $id, 'message' => sprintf('Restore of %s reversed', $rel)];
    }

    public static function recover(array $row): string
    {
        $id   = (int) $row['id'];
        $rel  = (string) $row['target'];
        $path = Site::abspath() . '/' . $rel;
        $tmp  = (string) ($row['after']['tmp'] ?? '');
        switch ($row['state']) {
            case Journal::PLANNED:
            case Journal::BEFORE:
                return self::abandon($id, 'run died before acting; nothing was changed');
            case Journal::ACTING:
                if ($tmp !== '' && file_exists($tmp)) {
                    @unlink($tmp);
                }
                if (self::sha($path) === (string) ($row['after']['sha256'] ?? '-')) {
                    $entry = Vault::entry((string) ($row['before']['entry'] ?? '')) ?? ['sha256' => $row['after']['sha256'] ?? ''];
                    return 'Journal ' . $id . ' recovered: ' . self::verify($id, $rel, $path, $entry, $row['before'])['message'];
                }
                return self::abandon($id, 'rename had not happened; staged file removed');
            case Journal::VERIFYING:
                $entry = Vault::entry((string) ($row['before']['entry'] ?? '')) ?? ['sha256' => $row['after']['sha256'] ?? ''];
                return 'Journal ' . $id . ' recovered: ' . self::verify($id, $rel, $path, $entry, $row['before'])['message'];
        }
        return 'Journal ' . $id . ' needed nothing';
    }

    public static function reverse(array $row): array
    {
        $id   = (int) $row['id'];
        $rel  = (string) $row['target'];
        $path = Site::abspath() . '/' . $rel;
        $kept = (string) ($row['before']['kept'] ?? '');
        if ($kept === '' || !is_file($kept)) {
            Journal::set_state($id, $row['state'], ['reversible' => false]);
            return [false, __('The previous copy is no longer in quarantine.', 'dcc-ragusa')];
        }
        if (!@copy($kept, $path)) {
            return [false, __('Could not write the previous copy back.', 'dcc-ragusa')];
        }
        Journal::set_state($id, Journal::REVERSED, ['note' => 'previous copy put back on request; seal it to stop further restores']);
        Events::record(Fortress::REVELIN, Events::INFO, 'restore-undone', $rel, __('The previous copy of a guarded file was put back on request.', 'dcc-ragusa'), [], $id);
        /* translators: %s: path */
        return [true, sprintf(__('Put the previous %s back. Seal it now, or Ragusa will restore the sealed copy again.', 'dcc-ragusa'), $rel)];
    }
}
