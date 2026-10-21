<?php
namespace DCCR\Action;

use DCCR\Alerts;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Journal;
use DCCR\Site;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A1: move a clearly malicious file into the vault's quarantine. Never
 * delete. Reversible for 90 days.
 */
final class Quarantine extends Base
{
    public const ACTION = 'quarantine';

    /** @param array{path:string,reason:string} $plan */
    public static function run(array $plan): array
    {
        $path = (string) $plan['path'];
        $rel  = Site::rel($path);
        $id   = Journal::create(self::ACTION, $rel, [], (string) ($plan['reason'] ?? ''));

        // Before-state.
        $before = self::stat($path);
        if (!$before['exists'] || !is_file($path)) {
            return ['ok' => false, 'id' => $id, 'message' => self::abandon($id, 'file vanished before quarantine')];
        }
        $before['path'] = $rel;
        Journal::set_state($id, Journal::BEFORE, ['before' => $before]);

        // Acting: the destination is written down before the move.
        $dest = Vault::quarantine_dir($id) . '/' . $rel;
        Journal::set_state($id, Journal::ACTING, ['after' => ['dest' => $dest]]);
        $method = Vault::move_in($path, $dest);

        return self::verify($id, $rel, $path, $dest, $before, (string) ($plan['reason'] ?? ''), $method);
    }

    private static function verify(int $id, string $rel, string $path, string $dest, array $before, string $reason, ?string $method): array
    {
        Journal::set_state($id, Journal::VERIFYING, ['after' => ['method' => $method]]);
        clearstatcache();
        $gone    = !file_exists($path);
        $arrived = is_file($dest) && self::sha($dest) === ($before['sha256'] ?? '');
        if ($gone && $arrived) {
            Journal::set_state($id, Journal::COMMITTED, ['verify' => ['gone' => true, 'arrived' => true]]);
            Events::record(Fortress::MINCETA, Events::BREACHED, 'quarantined', $rel, sprintf(
                /* translators: 1: path, 2: reason */
                __('Quarantined %1$s (%2$s).', 'dcc-ragusa'),
                $rel,
                $reason
            ), ['size' => $before['size'] ?? 0], $id);
            Alerts::raise([
                'fortress' => Fortress::MINCETA,
                'severity' => Events::BREACHED,
                'kind'     => 'quarantined',
                'target'   => $rel,
                'title'    => __('File Quarantined', 'dcc-ragusa'),
                /* translators: 1: path, 2: reason, 3: size */
                'what'     => sprintf(__('Ragusa found %1$s where no such file belongs (%2$s, %3$d bytes).', 'dcc-ragusa'), $rel, $reason, (int) ($before['size'] ?? 0)),
                /* translators: %d: journal id */
                'did'      => sprintf(__('It moved the file into quarantine outside the web root as journal entry %d. Nothing was deleted.', 'dcc-ragusa'), $id),
                /* translators: %d: journal id */
                'todo'     => sprintf(__('If you put this file there on purpose, open Ragusa and tap Restore on entry %d, or run wp ragusa restore %d. Otherwise, nothing to do: consider changing the administrator passwords.', 'dcc-ragusa'), $id, $id),
            ]);
            return ['ok' => true, 'id' => $id, 'message' => sprintf('Quarantined %s', $rel)];
        }
        if (!$gone && !is_file($dest)) {
            return ['ok' => false, 'id' => $id, 'message' => self::abandon($id, 'the move did not happen; the file is still in place')];
        }
        // Partial: both exist, or the copy is wrong. Put things back as they were.
        if (is_file($dest) && !$gone) {
            @unlink($dest);
            return ['ok' => false, 'id' => $id, 'message' => self::abandon($id, 'partial copy removed; the file is still in place')];
        }
        if ($gone && is_file($dest)) {
            // Arrived but the hash differs: restore it rather than keep a doubtful copy.
            Vault::move_in($dest, $path);
            Journal::set_state($id, Journal::REVERSED, ['note' => 'copy did not verify; file put back']);
            return ['ok' => false, 'id' => $id, 'message' => 'quarantine reversed: copy did not verify'];
        }
        return self::fail($id, 'file lost during move', Fortress::MINCETA, 'quarantine-failed', $rel);
    }

    public static function recover(array $row): string
    {
        $id     = (int) $row['id'];
        $rel    = (string) $row['target'];
        $path   = Site::abspath() . '/' . $rel;
        $before = $row['before'];
        $dest   = (string) ($row['after']['dest'] ?? '');
        switch ($row['state']) {
            case Journal::PLANNED:
            case Journal::BEFORE:
                return self::abandon($id, 'run died before acting; nothing was changed');
            case Journal::ACTING:
            case Journal::VERIFYING:
                if ($dest === '') {
                    return self::abandon($id, 'no destination recorded');
                }
                $r = self::verify($id, $rel, $path, $dest, $before, (string) ($row['note'] ?? ''), (string) ($row['after']['method'] ?? 'unknown'));
                return 'Journal ' . $id . ' recovered: ' . $r['message'];
        }
        return 'Journal ' . $id . ' needed nothing';
    }

    public static function reverse(array $row): array
    {
        $id   = (int) $row['id'];
        $rel  = (string) $row['target'];
        $path = Site::abspath() . '/' . $rel;
        $dest = (string) ($row['after']['dest'] ?? '');
        if (!is_file($dest)) {
            Journal::set_state($id, $row['state'], ['reversible' => false]);
            return [false, __('The quarantined copy is no longer there.', 'dcc-ragusa')];
        }
        if (file_exists($path)) {
            return [false, __('A file already exists at the original path; not overwriting it.', 'dcc-ragusa')];
        }
        $method = Vault::move_in($dest, $path);
        if ($method === null || !is_file($path)) {
            return [false, __('Could not move the file back.', 'dcc-ragusa')];
        }
        if (!empty($row['before']['mode'])) {
            @chmod($path, (int) $row['before']['mode']);
        }
        Journal::set_state($id, Journal::REVERSED, ['note' => 'restored from quarantine on request']);
        Events::record(Fortress::MINCETA, Events::INFO, 'quarantine-reversed', $rel, __('A quarantined file was put back on request.', 'dcc-ragusa'), [], $id);
        Alerts::resolve(Events::fingerprint(Fortress::MINCETA, 'quarantined', $rel));
        return [true, sprintf(__('Put %s back.', 'dcc-ragusa'), $rel)];
    }
}
