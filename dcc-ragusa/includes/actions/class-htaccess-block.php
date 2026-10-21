<?php
namespace DCCR\Action;

use DCCR\Alerts;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Htaccess;
use DCCR\Journal;
use DCCR\Loopback;
use DCCR\Site;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A3: rewrite only the DCC Security block of .htaccess, atomically, and
 * reverse it if the home page stops answering. Without loopbacks it is not
 * autonomous: a bad .htaccess takes the site down and Ragusa could not see.
 */
final class Htaccess_Block extends Base
{
    public const ACTION = 'htaccess-block';

    /** @param array{block:string} $plan */
    public static function run(array $plan): array
    {
        $path  = Htaccess::path();
        $rel   = Site::rel($path);
        $block = (string) $plan['block'];

        if (!Loopback::available()) {
            Alerts::raise([
                'fortress' => Fortress::REVELIN,
                'severity' => Events::BREACHED,
                'kind'     => 'htaccess-block-changed',
                'target'   => $rel,
                'title'    => __('Security Block Changed In .htaccess', 'dcc-ragusa'),
                'what'     => __('The DCC Security block in .htaccess no longer matches its sealed copy.', 'dcc-ragusa'),
                'did'      => __('Ragusa did not rewrite it, because loopback requests do not work on this host and it could not check the site afterwards.', 'dcc-ragusa'),
                'todo'     => __('Ask the site director to run wp ragusa restore on the sealed .htaccess block.', 'dcc-ragusa'),
            ]);
            return ['ok' => false, 'id' => 0, 'message' => 'no loopbacks; alerted instead of rewriting .htaccess'];
        }

        $id      = Journal::create(self::ACTION, $rel, [], 'DCC block differs');
        $current = is_file($path) ? (string) file_get_contents($path) : '';
        $before  = self::stat($path);
        if ($before['exists']) {
            $keep = Vault::quarantine_dir($id) . '/.htaccess';
            @copy($path, $keep);
            $before['kept'] = $keep;
        }
        Journal::set_state($id, Journal::BEFORE, ['before' => $before]);

        $new = Htaccess::replace_block($current, $block);
        Journal::set_state($id, Journal::ACTING, ['after' => ['sha256' => hash('sha256', $new)]]);
        if (!Vault::write_atomic($path, $new)) {
            return self::fail($id, 'could not write .htaccess', Fortress::REVELIN, 'restore-failed', $rel);
        }
        if (!empty($before['mode'])) {
            @chmod($path, (int) $before['mode']);
        }
        return self::verify($id, $rel, $path, $before);
    }

    private static function verify(int $id, string $rel, string $path, array $before): array
    {
        Journal::set_state($id, Journal::VERIFYING);
        $home    = Loopback::get('/');
        $cottage = $home['ok'] ? Loopback::get('/accommodation/cottage-34/') : ['ok' => false, 'code' => 0];
        if ($home['ok'] && ($cottage['ok'] || $cottage['code'] === 404)) {
            Journal::set_state($id, Journal::COMMITTED, ['verify' => ['home' => $home['code'], 'cottage' => $cottage['code']]]);
            Events::record(Fortress::REVELIN, Events::BREACHED, 'htaccess-block-restored', $rel, __('The DCC Security block in .htaccess was put back from its sealed copy.', 'dcc-ragusa'), [], $id);
            Alerts::raise([
                'fortress' => Fortress::REVELIN,
                'severity' => Events::BREACHED,
                'kind'     => 'htaccess-block-restored',
                'target'   => $rel,
                'title'    => __('Security Block Restored In .htaccess', 'dcc-ragusa'),
                'what'     => __('The DCC Security block in .htaccess no longer matched its sealed copy.', 'dcc-ragusa'),
                /* translators: %d: journal id */
                'did'      => sprintf(__('Ragusa rewrote only that block, left the rest of the file as it was, checked that the home page and a cottage page still load, and kept the previous file as journal entry %d.', 'dcc-ragusa'), $id),
                'todo'     => __('If the site director changed the block on purpose, run wp ragusa seal .htaccess. Otherwise, nothing to do.', 'dcc-ragusa'),
            ]);
            return ['ok' => true, 'id' => $id, 'message' => 'rewrote the .htaccess block'];
        }
        $kept = (string) ($before['kept'] ?? '');
        if ($kept !== '' && is_file($kept)) {
            Vault::write_atomic($path, (string) file_get_contents($kept));
        }
        Journal::set_state($id, Journal::REVERSED, ['verify' => ['home' => $home['code'], 'cottage' => $cottage['code']], 'note' => 'site did not answer after the rewrite; previous file put back']);
        Alerts::raise([
            'fortress' => Fortress::REVELIN,
            'severity' => Events::BREACHED,
            'kind'     => 'htaccess-reversed',
            'target'   => $rel,
            'title'    => __('.htaccess Rewrite Reversed', 'dcc-ragusa'),
            'what'     => __('Ragusa rewrote the DCC Security block in .htaccess, but the site did not answer afterwards.', 'dcc-ragusa'),
            'did'      => __('It put the previous .htaccess back.', 'dcc-ragusa'),
            'todo'     => __('Ask the site director to look at .htaccess and the sealed block.', 'dcc-ragusa'),
        ]);
        return ['ok' => false, 'id' => $id, 'message' => '.htaccess rewrite reversed'];
    }

    public static function recover(array $row): string
    {
        $id   = (int) $row['id'];
        $path = Htaccess::path();
        switch ($row['state']) {
            case Journal::PLANNED:
            case Journal::BEFORE:
                return self::abandon($id, 'run died before acting; nothing was changed');
            case Journal::ACTING:
                foreach ((array) glob($path . '.tmp-*') as $tmp) {
                    @unlink($tmp);
                }
                if (self::sha($path) !== (string) ($row['after']['sha256'] ?? '-')) {
                    return self::abandon($id, 'the rewrite had not happened');
                }
                // fall through
            case Journal::VERIFYING:
                return 'Journal ' . $id . ' recovered: ' . self::verify($id, (string) $row['target'], $path, $row['before'])['message'];
        }
        return 'Journal ' . $id . ' needed nothing';
    }

    public static function reverse(array $row): array
    {
        $id   = (int) $row['id'];
        $kept = (string) ($row['before']['kept'] ?? '');
        if ($kept === '' || !is_file($kept)) {
            Journal::set_state($id, $row['state'], ['reversible' => false]);
            return [false, __('The previous .htaccess is no longer in quarantine.', 'dcc-ragusa')];
        }
        if (!Vault::write_atomic(Htaccess::path(), (string) file_get_contents($kept))) {
            return [false, __('Could not write .htaccess.', 'dcc-ragusa')];
        }
        Journal::set_state($id, Journal::REVERSED, ['note' => 'previous .htaccess put back on request']);
        Events::record(Fortress::REVELIN, Events::INFO, 'htaccess-undone', '.htaccess', __('The previous .htaccess was put back on request.', 'dcc-ragusa'), [], $id);
        return [true, __('Put the previous .htaccess back. Seal its block now, or Ragusa will rewrite it again.', 'dcc-ragusa')];
    }
}
