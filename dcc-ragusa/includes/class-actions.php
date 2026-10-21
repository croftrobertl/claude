<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/** The registry of autonomous actions, and the recovery pass each tick starts with. */
final class Actions
{
    public const MAP = [
        'quarantine'     => Action\Quarantine::class,
        'restore-guard'  => Action\Restore_Guard::class,
        'htaccess-block' => Action\Htaccess_Block::class,
        'rollback'       => Action\Rollback::class,
    ];

    /** @return string[] what was finished or reversed */
    public static function recover(): array
    {
        $lines = [];
        foreach (Journal::unfinished(120) as $row) {
            $action = (string) $row['action'];
            try {
                if (isset(self::MAP[$action])) {
                    $lines[] = (self::MAP[$action])::recover($row);
                } elseif ($action === 'update-check' || $action === 'core-check') {
                    $lines[] = Fortress\Sveti_Ivan::recover($row);
                } else {
                    Journal::set_state((int) $row['id'], Journal::ABANDONED, ['note' => 'unknown action']);
                    $lines[] = 'Abandoned unknown journal row ' . $row['id'];
                }
            } catch (\Throwable $e) {
                Journal::set_state((int) $row['id'], Journal::FAILED, ['note' => Text::scrub($e->getMessage())]);
                $lines[] = 'Recovery of journal row ' . $row['id'] . ' failed: ' . Text::scrub($e->getMessage());
            }
        }
        return $lines;
    }

    /** @return array{0:bool,1:string} */
    public static function reverse(int $id): array
    {
        $row = Journal::get($id);
        if ($row === null) {
            return [false, __('No such journal entry.', 'dcc-ragusa')];
        }
        if (!isset(self::MAP[$row['action']])) {
            return [false, __('This entry is a record, not an action; there is nothing to undo.', 'dcc-ragusa')];
        }
        if ($row['state'] === Journal::REVERSED) {
            return [false, __('Already undone.', 'dcc-ragusa')];
        }
        if (!$row['reversible']) {
            return [false, __('This entry can no longer be undone (its copy expired).', 'dcc-ragusa')];
        }
        return (self::MAP[$row['action']])::reverse($row);
    }

    public static function label(string $action): string
    {
        return match ($action) {
            'quarantine'     => __('Quarantined A File', 'dcc-ragusa'),
            'restore-guard'  => __('Restored A Guarded File', 'dcc-ragusa'),
            'htaccess-block' => __('Rewrote The .htaccess Block', 'dcc-ragusa'),
            'rollback'       => __('Rolled Back A Plugin Update', 'dcc-ragusa'),
            'update-check'   => __('Checked An Update', 'dcc-ragusa'),
            'core-check'     => __('Checked A Core Update', 'dcc-ragusa'),
            'self-update'    => __('Checked A Ragusa Update', 'dcc-ragusa'),
            default          => Text::title_case(str_replace('-', ' ', $action)),
        };
    }
}
