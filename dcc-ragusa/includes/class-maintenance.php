<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The maintenance window: "the Website Director is at work".
 *
 * While a window runs, Minčeta records every file change as always but
 * holds the Needs A Look emails for file changes in the places the
 * Director edits (must-use plugins, plugins, themes, the root .htaccess).
 * When the window ends (stopped, or at its deadline) one summary email
 * lists every file that changed: sealed ones as approved, the rest as
 * needing a look. Nothing else is ever held: Bokar, a guard restored, a
 * quarantine, a vulnerability, the heartbeat, a breach, and any change
 * anywhere else all send at once. One window at a time; starting one while
 * one runs extends it. Every window is a journal row.
 */
final class Maintenance
{
    public const MAX_MINUTES = 120;
    public const HOOK        = 'dccr_maintenance_end';
    public const STATE       = 'maintenance';

    /** Minčeta's file-change findings: the only kinds a window holds. */
    public const KINDS = ['file-new', 'file-changed', 'file-missing', 'plugin-modified'];

    /** Where the Director works. Anything else is never held. */
    public const SCOPE = ['wp-content/mu-plugins/', 'wp-content/plugins/', 'wp-content/themes/'];

    /** The window on record, running or past its deadline and not yet closed. */
    public static function window(): ?array
    {
        $w = State::get(self::STATE);
        return is_array($w) && (int) ($w['started'] ?? 0) > 0 ? $w : null;
    }

    /** The running window. One past its deadline is closed first (its summary sent), so it holds nothing. */
    public static function current(): ?array
    {
        $w = self::window();
        if ($w === null) {
            return null;
        }
        if (time() >= (int) $w['ends']) {
            self::close('expired');
            return null;
        }
        return $w;
    }

    public static function in_scope(string $rel): bool
    {
        if ($rel === '.htaccess') {
            return true;
        }
        foreach (self::SCOPE as $prefix) {
            if (str_starts_with($rel, $prefix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether a finding's email is held. Only a Minčeta file change, only
     * Needs A Look, only in scope, and only a change made during the
     * window: a finding already open from before it keeps its own rules.
     */
    public static function holds(array $f, ?array $entry, bool $was_settled, ?array $w): bool
    {
        if ($w === null
            || (string) ($f['fortress'] ?? '') !== Fortress::MINCETA
            || (string) ($f['severity'] ?? Events::NEEDS_LOOK) !== Events::NEEDS_LOOK
            || !in_array((string) ($f['kind'] ?? ''), self::KINDS, true)
            || !self::in_scope((string) ($f['target'] ?? ''))) {
            return false;
        }
        return $entry === null || $was_settled || (int) ($entry['first_seen'] ?? 0) >= (int) $w['started'];
    }

    /** A held change: the file, what Minčeta saw, and when (the latest change wins). */
    public static function note_held(array $f, string $fp): void
    {
        $w = self::window();
        if ($w === null) {
            return;
        }
        $rel = (string) $f['target'];
        $w['files'][$rel] = [
            'kind'    => (string) $f['kind'],
            'title'   => (string) $f['title'],
            'fp'      => $fp,
            'first'   => (int) ($w['files'][$rel]['first'] ?? time()),
            'changed' => time(),
        ];
        State::set(self::STATE, $w);
    }

    /** An alert sent at once while a window ran, for the summary. */
    public static function note_sent(string $fortress, string $title): void
    {
        $w = self::window();
        if ($w === null) {
            return;
        }
        $w['sent']   = array_slice(array_merge((array) ($w['sent'] ?? []), [['fortress' => $fortress, 'title' => $title, 'ts' => time()]]), -50);
        State::set(self::STATE, $w);
    }

    /** A path sealed during the window: the Director's approval of what is there now. */
    public static function note_sealed(string $rel, string $by): void
    {
        $w = self::current();
        if ($w === null || $rel === '') {
            return;
        }
        $w['sealed'][rtrim($rel, '/')] = ['ts' => time(), 'by' => $by];
        State::set(self::STATE, $w);
    }

    /** Who acts: the shell account or WordPress user in WP-CLI, the logged-in user on the page. */
    public static function actor(): string
    {
        if (defined('WP_CLI') && WP_CLI) {
            return Cli::operator();
        }
        $u = function_exists('wp_get_current_user') ? wp_get_current_user() : null;
        if (is_object($u) && (int) ($u->ID ?? 0) > 0) {
            return (string) (($u->display_name ?? '') !== '' ? $u->display_name : ($u->user_login ?? ''));
        }
        return __('unknown', 'dcc-ragusa');
    }

    private static function clean_note(string $note): string
    {
        $note = trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $note));
        return Text::scrub(mb_substr($note, 0, 200));
    }

    /**
     * Start a window, or extend the running one: it then ends at whichever
     * is later, its deadline or now plus the minutes.
     *
     * @return array{0:bool,1:string}
     */
    public static function start(int $minutes, string $note, string $by): array
    {
        if ($minutes < 1 || $minutes > self::MAX_MINUTES) {
            /* translators: %d: maximum minutes */
            return [false, sprintf(__('A maintenance window lasts from 1 to %d minutes.', 'dcc-ragusa'), self::MAX_MINUTES)];
        }
        $note = self::clean_note($note);
        $now  = time();
        $w    = self::current();
        if ($w !== null) {
            $w['ends']    = max((int) $w['ends'], $now + $minutes * 60);
            $w['notes'][] = ['ts' => $now, 'by' => $by, 'note' => $note, 'minutes' => $minutes];
            State::set(self::STATE, $w);
            Journal::annotate((int) $w['id'], sprintf('extended by %s to %s%s', $by, Site::stamp((int) $w['ends']), $note !== '' ? ': ' . $note : ''));
            self::schedule((int) $w['ends']);
            State::flush();
            /* translators: %s: time */
            return [true, sprintf(__('A maintenance window was already running; it now ends at %s.', 'dcc-ragusa'), Site::stamp((int) $w['ends']))];
        }
        $ends = $now + $minutes * 60;
        $id   = Journal::create('maintenance', 'window', [
            'started' => $now,
            'ends'    => $ends,
            'minutes' => $minutes,
            'by'      => $by,
            'note'    => $note,
        ], sprintf('maintenance window by %s%s', $by, $note !== '' ? ': ' . $note : ''), false);
        if ($id > 0) {
            Journal::set_state($id, Journal::VERIFYING); // open until it ends; Actions::recover() leaves it alone
        }
        State::set(self::STATE, [
            'id'      => $id,
            'started' => $now,
            'ends'    => $ends,
            'by'      => $by,
            'notes'   => [['ts' => $now, 'by' => $by, 'note' => $note, 'minutes' => $minutes]],
            'files'   => [],
            'sealed'  => [],
            'sent'    => [],
        ]);
        self::schedule($ends);
        Events::record(Fortress::MINCETA, Events::INFO, 'maintenance-start', 'window', sprintf(
            /* translators: 1: who, 2: time, 3: note */
            __('Maintenance window started by %1$s until %2$s%3$s. File-change emails are held; one summary comes at the end.', 'dcc-ragusa'),
            $by,
            Site::stamp($ends),
            $note !== '' ? ' (' . $note . ')' : ''
        ), [], $id);
        State::flush();
        /* translators: %s: time */
        return [true, sprintf(__('Maintenance window on until %s. File-change emails are held; one summary comes at the end.', 'dcc-ragusa'), Site::stamp($ends))];
    }

    /** @return array{0:bool,1:string,2:array} */
    public static function stop(string $by): array
    {
        if (self::current() === null) {
            return [false, __('No maintenance window is running.', 'dcc-ragusa'), []];
        }
        $s = self::close('stopped', $by);
        return [true, $s['line'], $s];
    }

    /** Where WP-Cron runs, an event at the deadline sends the summary on time; the tick is the belt. */
    private static function schedule(int $at): void
    {
        wp_clear_scheduled_hook(self::HOOK);
        if (!Site::cron_off()) {
            wp_schedule_single_event($at, self::HOOK);
        }
    }

    public static function on_deadline(): void
    {
        self::tick();
        State::flush();
    }

    /** Every tick: a window past its deadline ends now. @return string[] */
    public static function tick(): array
    {
        $w = self::window();
        if ($w === null || time() < (int) $w['ends']) {
            return [];
        }
        return [self::close('expired')['line']];
    }

    /**
     * End the window: the summary (emailed when any file changed), the
     * journal row finished, the held findings counted as emailed by it.
     *
     * @return array{subject:string,body:string,line:string,approved:array,unsealed:array,sent:array,emailed:bool}
     */
    public static function close(string $how, string $by = ''): array
    {
        $w = self::window();
        if ($w === null) {
            return ['subject' => '', 'body' => '', 'line' => '', 'approved' => [], 'unsealed' => [], 'sent' => [], 'emailed' => false];
        }
        State::delete(self::STATE); // first: nothing below can re-enter a window that is ending
        wp_clear_scheduled_hook(self::HOOK);
        $ended = $how === 'expired' ? min(time(), (int) $w['ends']) : time();
        $s     = self::summary($w, $ended, $how, $by);
        $s['emailed'] = false;
        if ($s['approved'] !== [] || $s['unsealed'] !== []) { // the summary is the held findings' email
            $s['emailed'] = Alerts::send_as(Alerts::subject(Fortress::MINCETA, $s['subject']), $s['body']);
        }
        $files = [];
        foreach ($s['approved'] as $rel => $a) {
            $files[$rel] = 'approved';
        }
        foreach ($s['unsealed'] as $rel => $u) {
            $files[$rel] = 'needs a look';
        }
        if ((int) $w['id'] > 0) {
            Journal::set_state((int) $w['id'], Journal::COMMITTED, [
                'after' => [
                    'ended'   => $ended,
                    'how'     => $how,
                    'by'      => $by,
                    'files'   => $files,
                    'sent'    => array_map(static fn($x) => Fortress::name((string) $x['fortress']) . ' · ' . $x['title'], (array) ($w['sent'] ?? [])),
                    'emailed' => $s['emailed'],
                    'summary' => $s['body'],
                ],
            ]);
            Journal::annotate((int) $w['id'], $s['line']);
        }
        Events::record(Fortress::MINCETA, $s['unsealed'] === [] ? Events::INFO : Events::NEEDS_LOOK, 'maintenance-end', 'window', $s['line'], [], (int) $w['id']);
        State::flush();
        return $s;
    }

    /**
     * The summary, from the window's record. A file is approved when a seal
     * of it (or of a folder above it) came after its last change.
     *
     * @return array{subject:string,body:string,line:string,approved:array,unsealed:array,sent:array}
     */
    public static function summary(array $w, int $ended, string $how, string $by = ''): array
    {
        $sealed   = (array) ($w['sealed'] ?? []);
        $approved = [];
        $unsealed = [];
        $changed  = array_keys((array) ($w['files'] ?? []));
        // A sealed folder stands for the files beneath it; listed alone only when none of them changed.
        $alone    = array_filter(array_keys($sealed), static fn($p) => count(array_filter($changed, static fn($c) => str_starts_with($c, $p . '/'))) === 0);
        $paths    = array_unique(array_merge($changed, $alone));
        sort($paths);
        foreach ($paths as $rel) {
            $change = (array) ($w['files'][$rel] ?? []);
            $seal   = null;
            foreach ($sealed as $path => $sv) {
                if (($rel === $path || str_starts_with($rel, $path . '/')) && ($seal === null || (int) $sv['ts'] > (int) $seal['ts'])) {
                    $seal = $sv;
                }
            }
            if ($change === [] && !isset($sealed[$rel])) {
                continue;
            }
            if ($seal !== null && (int) $seal['ts'] >= (int) ($change['changed'] ?? 0)) {
                $approved[$rel] = ['by' => (string) $seal['by'], 'ts' => (int) $seal['ts'], 'seen' => $change !== []];
            } else {
                $unsealed[$rel] = ['ts' => (int) ($change['changed'] ?? 0), 'title' => (string) ($change['title'] ?? '')];
            }
        }
        $sent  = (array) ($w['sent'] ?? []);
        $total = count($approved) + count($unsealed);
        $notes = array_values(array_filter(array_map(static fn($n) => (string) ($n['note'] ?? ''), (array) ($w['notes'] ?? []))));

        $subject = $unsealed === []
            /* translators: %d: files */
            ? sprintf(_n('Maintenance Window Ended: %d File Changed, Sealed', 'Maintenance Window Ended: %d Files Changed, All Sealed', $total, 'dcc-ragusa'), $total)
            /* translators: 1: files, 2: files not sealed */
            : sprintf(__('Maintenance Window Ended: %1$d Changed, %2$d Need A Look', 'dcc-ragusa'), $total, count($unsealed));

        $lines   = [];
        $lines[] = ($how === 'running'
            ? sprintf(
                /* translators: 1: who, 2: start, 3: deadline */
                __('The site director\'s maintenance window, started by %1$s at %2$s, is still running, until %3$s. This is the summary as it stands now.', 'dcc-ragusa'),
                (string) ($w['by'] ?? '?'),
                Site::stamp((int) $w['started']),
                Site::stamp((int) $w['ends'])
            )
            : sprintf(
                /* translators: 1: who, 2: start, 3: end, 4: how it ended */
                __('The site director\'s maintenance window, started by %1$s, ran from %2$s to %3$s and %4$s.', 'dcc-ragusa'),
                (string) ($w['by'] ?? '?'),
                Site::stamp((int) $w['started']),
                Site::stamp($ended),
                $how === 'expired' ? __('ended at its deadline', 'dcc-ragusa') : sprintf(/* translators: %s: who */ __('was stopped by %s', 'dcc-ragusa'), $by !== '' ? $by : '?')
            )) . ($notes !== [] ? ' ' . sprintf(/* translators: %s: notes */ __('Their note: "%s".', 'dcc-ragusa'), implode('"; "', $notes)) : '');
        $lines[] = __('While it ran, Ragusa recorded every file change and held its emails. This is all of them, in one place.', 'dcc-ragusa');
        if ($unsealed !== []) {
            $block = [__('Needs a look: changed during the window and NOT sealed by the site director:', 'dcc-ragusa')];
            foreach (array_slice($unsealed, 0, 50, true) as $rel => $u) {
                /* translators: 1: path, 2: time */
                $block[] = '• ' . sprintf(__('%1$s (changed %2$s)', 'dcc-ragusa'), $rel, $u['ts'] > 0 ? Site::stamp($u['ts']) : '?');
            }
            if (count($unsealed) > 50) {
                /* translators: %d: more files */
                $block[] = '• ' . sprintf(__('and %d more', 'dcc-ragusa'), count($unsealed) - 50);
            }
            $lines[] = implode("\n", $block);
        }
        if ($approved !== []) {
            $block = [__('Approved: sealed by the site director after the change:', 'dcc-ragusa')];
            foreach (array_slice($approved, 0, 50, true) as $rel => $a) {
                /* translators: 1: path, 2: who, 3: time */
                $block[] = '• ' . sprintf(__('%1$s (sealed by %2$s, %3$s)', 'dcc-ragusa'), $rel, $a['by'], Site::stamp($a['ts']));
            }
            if (count($approved) > 50) {
                /* translators: %d: more files */
                $block[] = '• ' . sprintf(__('and %d more', 'dcc-ragusa'), count($approved) - 50);
            }
            $lines[] = implode("\n", $block);
        }
        if ($total === 0) {
            $lines[] = __('No file changed in the places a window covers.', 'dcc-ragusa');
        }
        if ($sent !== []) {
            $block = [__('Sent at once during the window, because these are never held:', 'dcc-ragusa')];
            foreach (array_slice($sent, 0, 20) as $x) {
                $block[] = '• ' . Fortress::name((string) $x['fortress']) . ' · ' . (string) $x['title'] . ' (' . Site::stamp((int) $x['ts']) . ')';
            }
            $lines[] = implode("\n", $block);
        }
        $lines[] = $unsealed !== []
            ? __('Forward this to the site director: each file under "Needs a look" is either theirs, and they seal it (wp ragusa seal <path>), or it is not, and they find out what changed it.', 'dcc-ragusa')
            : __('Nothing to do.', 'dcc-ragusa');
        $lines[] = Alerts::footer();

        $line = sprintf(
            /* translators: 1: changed, 2: sealed, 3: not sealed, 4: sent at once */
            __('Maintenance window ended. Files changed: %1$d; sealed: %2$d; not sealed: %3$d. Alerts sent at once during it: %4$d.', 'dcc-ragusa'),
            $total,
            count($approved),
            count($unsealed),
            count($sent)
        );
        return ['subject' => $subject, 'body' => Text::scrub(implode("\n\n", $lines)), 'line' => $line, 'approved' => $approved, 'unsealed' => $unsealed, 'sent' => $sent];
    }

    /** For the status command and the page. */
    public static function status_line(): string
    {
        $w = self::current();
        if ($w === null) {
            return __('Maintenance window: off', 'dcc-ragusa');
        }
        $notes = array_values(array_filter(array_map(static fn($n) => (string) ($n['note'] ?? ''), (array) ($w['notes'] ?? []))));
        return sprintf(
            /* translators: 1: time, 2: who, 3: files, 4: note */
            __('Maintenance window: on until %1$s, started by %2$s; %3$d file changes held so far%4$s', 'dcc-ragusa'),
            Site::stamp((int) $w['ends']),
            (string) $w['by'],
            count((array) $w['files']),
            $notes !== [] ? ' (' . implode('; ', $notes) . ')' : ''
        );
    }

    /** A window row left open by a lost state: finished, never abandoned silently. */
    public static function recover(array $row): string
    {
        $w = self::window();
        if ($w !== null && (int) $w['id'] === (int) $row['id']) {
            return ''; // still running
        }
        Journal::set_state((int) $row['id'], Journal::COMMITTED, ['after' => ['how' => 'lost', 'ended' => time()]]);
        Journal::annotate((int) $row['id'], 'the window\'s record was lost before it ended; no summary was sent');
        return sprintf('Journal %d: a maintenance window whose record was lost is closed', $row['id']);
    }
}
