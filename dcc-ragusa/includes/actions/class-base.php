<?php
namespace DCCR\Action;

use DCCR\Events;
use DCCR\Journal;
use DCCR\Text;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * An autonomous action: plan, record the before-state, act, verify, commit
 * or reverse. Every state is written before the step it names.
 */
abstract class Base
{
    public const ACTION = '';

    /** @return array{ok:bool,id:int,message:string} */
    abstract public static function run(array $plan): array;

    /** Finish or reverse a row a dead run left behind. Returns a report line. */
    abstract public static function recover(array $row): string;

    /** @return array{0:bool,1:string} */
    abstract public static function reverse(array $row): array;

    protected static function fail(int $id, string $note, string $fortress, string $kind, string $target): array
    {
        Journal::set_state($id, Journal::FAILED, ['note' => $note]);
        Events::record($fortress, Events::NEEDS_LOOK, $kind, $target, Text::scrub($note), [], $id);
        return ['ok' => false, 'id' => $id, 'message' => Text::scrub($note)];
    }

    protected static function abandon(int $id, string $note): string
    {
        Journal::set_state($id, Journal::ABANDONED, ['note' => $note]);
        return sprintf('Journal %d abandoned: %s', $id, $note);
    }

    protected static function sha(string $file): string
    {
        return is_file($file) ? (string) hash_file('sha256', $file) : '';
    }

    protected static function stat(string $file): array
    {
        clearstatcache(true, $file);
        if (!file_exists($file)) {
            return ['exists' => false];
        }
        return [
            'exists' => true,
            'size'   => (int) filesize($file),
            'mtime'  => (int) filemtime($file),
            'mode'   => (int) (fileperms($file) & 0777),
            'sha256' => is_file($file) ? self::sha($file) : '',
        ];
    }
}
