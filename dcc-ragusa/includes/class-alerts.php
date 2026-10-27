<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The messenger, and the life of a finding.
 *
 * A finding is open until it is resolved (its condition went away: one
 * "All Clear" if it was emailed), seen (an administrator pressed Mark As
 * Seen on the page) or practice (raised by a drill: grey, never emailed,
 * never counted). Only open, real findings colour a card or the headline.
 * Resolved and seen findings stay on the card in a calm colour for seven
 * days; practice findings for one day; then only the history keeps them.
 *
 * One email per distinct finding per 24 hours, a daily digest for info,
 * nothing from staging unless a command asks explicitly.
 */
final class Alerts
{
    public const OPTION = 'dcc_ragusa_alerts';
    public const MAX    = 200;
    public const REPEAT = 86400;

    public const KEEP_RESOLVED = 7 * 86400;   // on the card, in a calm colour
    public const KEEP_SEEN     = 7 * 86400;
    public const KEEP_DRILL    = 86400;
    public const KEEP_HISTORY  = 30 * 86400;  // in the resolved history, for the findings command and the report

    private static ?array $data  = null;
    private static bool   $force = false;

    /** Allow an email from staging for this request (wp ragusa mail test). */
    public static function force(bool $on): void
    {
        self::$force = $on;
    }

    private static function load(): array
    {
        if (self::$data === null) {
            $raw        = get_option(self::OPTION, []);
            self::$data = is_array($raw) ? $raw : ['active' => [], 'resolved' => [], 'digest' => []];
            self::$data += ['active' => [], 'resolved' => [], 'digest' => []];
        }
        return self::$data;
    }

    private static function save(): void
    {
        if (self::$data === null) {
            return;
        }
        self::purge();
        foreach (['active', 'resolved'] as $bucket) {
            if (count(self::$data[$bucket]) > self::MAX) {
                uasort(self::$data[$bucket], static fn($a, $b) => ($b['last_seen'] ?? 0) <=> ($a['last_seen'] ?? 0));
                self::$data[$bucket] = array_slice(self::$data[$bucket], 0, self::MAX, true);
            }
        }
        if (count(self::$data['digest']) > 100) {
            self::$data['digest'] = array_slice(self::$data['digest'], -100);
        }
        if (get_option(self::OPTION, null) === null) {
            add_option(self::OPTION, self::$data, '', 'no');
        } else {
            update_option(self::OPTION, self::$data, 'no');
        }
    }

    /**
     * `active` holds only unresolved findings (open, seen, practice); a
     * resolved finding moves to the `resolved` history, kept 30 days. Seen
     * and practice findings leave after their time; the events table keeps
     * everything.
     */
    private static function purge(): void
    {
        $now = time();
        foreach (self::$data['active'] as $fp => $a) {
            $tag = (string) ($a['tag'] ?? '');
            if ((int) ($a['resolved_at'] ?? 0) > 0) {
                self::$data['resolved'][$fp] = $a; // a row from before 0.2.0
                unset(self::$data['active'][$fp]);
            } elseif ($tag === Events::TAG_DRILL && $now - (int) ($a['last_seen'] ?? 0) > self::KEEP_DRILL) {
                unset(self::$data['active'][$fp]);
            } elseif ((int) ($a['seen_at'] ?? 0) > 0 && $now - (int) $a['seen_at'] > self::KEEP_SEEN) {
                unset(self::$data['active'][$fp]);
            }
        }
        foreach (self::$data['resolved'] as $fp => $a) {
            if ($now - (int) ($a['resolved_at'] ?? 0) > self::KEEP_HISTORY) {
                unset(self::$data['resolved'][$fp]);
            }
        }
    }

    /** 0.2.0: resolved rows leave `active` for the history. */
    public static function migrate(): int
    {
        self::load();
        $before = count(self::$data['active']);
        self::save();
        return $before - count(self::$data['active']);
    }

    /** open | resolved | seen | practice */
    public static function state(array $a): string
    {
        if (($a['tag'] ?? '') === Events::TAG_DRILL) {
            return 'practice';
        }
        if ((int) ($a['resolved_at'] ?? 0) > 0) {
            return 'resolved';
        }
        if ((int) ($a['seen_at'] ?? 0) > 0) {
            return 'seen';
        }
        return 'open';
    }

    /**
     * A finding: fortress, severity, kind, target, title, what, did, todo,
     * optional data (kept for the resolution rules). Returns true when an
     * email was sent now. A practice finding is stored grey and never sent.
     */
    public static function raise(array $f): bool
    {
        $fortress = (string) $f['fortress'];
        $severity = (string) ($f['severity'] ?? Events::NEEDS_LOOK);
        $kind     = (string) $f['kind'];
        $target   = (string) ($f['target'] ?? '');
        $fp       = Events::fingerprint($fortress, $kind, $target);
        $title    = Text::title_case((string) $f['title']);
        $tag      = Drill::tag();
        $data     = self::load();
        $now      = time();
        $entry    = $data['active'][$fp] ?? $data['resolved'][$fp] ?? null;
        unset(self::$data['resolved'][$fp]);

        // A finding raised again after it was resolved or seen is open again.
        $was_settled = $entry !== null && self::state($entry) !== 'open';

        $sent = false;
        if ($tag === Events::TAG_DRILL) {
            $sent = false;
        } elseif ($severity === Events::INFO) {
            if ($entry === null) {
                self::$data['digest'][] = ['fortress' => $fortress, 'title' => $title, 'what' => (string) ($f['what'] ?? ''), 'ts' => $now];
            }
        } elseif ($entry === null || $was_settled || ($now - (int) ($entry['last_sent'] ?? 0)) >= self::REPEAT) {
            $sent = self::send($fortress, $title, self::body($f));
        }

        self::$data['active'][$fp] = [
            'fortress'    => $fortress,
            'severity'    => $severity,
            'kind'        => $kind,
            'target'      => $target,
            'title'       => $title,
            'first_seen'  => $was_settled ? $now : (int) ($entry['first_seen'] ?? $now),
            'last_seen'   => $now,
            'last_sent'   => $sent ? $now : (int) ($entry['last_sent'] ?? 0),
            'tag'         => $tag,
            'resolved_at' => 0,
            'seen_at'     => 0,
            'seen_by'     => '',
            'data'        => array_merge(
                (array) ($entry['data'] ?? []),
                is_array($f['data'] ?? null) ? $f['data'] : [],
                array_filter(['journal_id' => (int) ($f['journal_id'] ?? 0), 'acted' => !empty($f['acted'])])
            ),
        ];
        self::save();
        return $sent;
    }

    /** Keep a value on a finding between ticks (the resolution rules). */
    public static function set_data(string $fp, string $key, mixed $value): void
    {
        $data = self::load();
        if (isset($data['resolved'][$fp])) {
            self::$data['resolved'][$fp]['data'][$key] = $value;
            self::save();
            return;
        }
        if (!isset($data['active'][$fp])) {
            return;
        }
        self::$data['active'][$fp]['data'][$key] = $value;
        self::save();
    }

    public static function get(string $fp): ?array
    {
        $data = self::load();
        return $data['active'][$fp] ?? $data['resolved'][$fp] ?? null;
    }

    /** The three sentences plus the plain link. */
    public static function body(array $f): string
    {
        $lines = [];
        foreach (['what', 'did', 'todo'] as $k) {
            $s = trim((string) ($f[$k] ?? ''));
            if ($s !== '') {
                $lines[] = $s;
            }
        }
        if (empty($f['todo'])) {
            $lines[] = __('Nothing to do.', 'dcc-ragusa');
        }
        if (!empty($f['notice'])) {
            $lines[] = (string) $f['notice'];
        }
        $lines[] = self::footer();
        return Text::scrub(implode("\n\n", $lines));
    }

    /** "Ragusa, Oct 24, 8:16 PM EDT: <page>". Every email ends with the property's clock. */
    public static function footer(): string
    {
        return 'Ragusa, ' . Site::stamp(time()) . ': ' . Site::admin_page_url();
    }

    /**
     * Findings of these kinds that are no longer present are resolved.
     *
     * @param string[] $kinds
     * @param string[] $present_fingerprints
     */
    public static function resolve_missing(string $fortress, array $kinds, array $present_fingerprints): void
    {
        $data = self::load();
        foreach ($data['active'] as $fp => $a) {
            if (($a['fortress'] ?? '') !== $fortress || !in_array($a['kind'] ?? '', $kinds, true)) {
                continue;
            }
            if (self::state($a) !== 'open' || in_array($fp, $present_fingerprints, true)) {
                continue;
            }
            self::resolve($fp);
        }
    }

    /**
     * The condition went away: the finding stays on the card as resolved
     * for seven days, and one All Clear goes out if it was ever emailed.
     * Quiet resolves (an upgrade correcting itself) send nothing.
     */
    public static function resolve(string $fp, bool $quiet = false): void
    {
        $data = self::load();
        $a    = $data['active'][$fp] ?? null;
        if ($a === null || self::state($a) !== 'open') {
            return;
        }
        $a['resolved_at']           = time();
        self::$data['resolved'][$fp] = $a;
        unset(self::$data['active'][$fp]);
        self::save();
        if (!$quiet && ($a['severity'] ?? '') !== Events::INFO && (int) ($a['last_sent'] ?? 0) > 0) {
            self::send(
                (string) $a['fortress'],
                /* translators: %s: the finding's title */
                sprintf(__('All Clear: %s', 'dcc-ragusa'), (string) $a['title']),
                /* translators: %s: the finding's title */
                sprintf(__('The finding "%s" is no longer present.', 'dcc-ragusa'), (string) $a['title']) . "\n\n"
                . __('Ragusa did nothing new: the check that raised it now passes.', 'dcc-ragusa') . "\n\n"
                . __('Nothing to do.', 'dcc-ragusa') . "\n\n"
                . self::footer()
            );
        }
        Events::record((string) $a['fortress'], Events::INFO, 'all-clear', (string) ($a['target'] ?? ''), (string) $a['title'], [], null, (string) ($a['tag'] ?? ''));
    }

    /** An administrator read it on the page. Records who and when. */
    public static function mark_seen(string $fp, string $by): bool
    {
        $data = self::load();
        $a    = $data['active'][$fp] ?? null;
        if ($a === null || self::state($a) !== 'open') {
            return false;
        }
        self::$data['active'][$fp]['seen_at'] = time();
        self::$data['active'][$fp]['seen_by'] = mb_substr(Text::scrub($by), 0, 60);
        self::save();
        Events::record((string) $a['fortress'], Events::INFO, 'seen', (string) ($a['target'] ?? ''), sprintf(
            /* translators: 1: title, 2: name */
            __('"%1$s" was marked as seen by %2$s.', 'dcc-ragusa'),
            (string) $a['title'],
            $by
        ));
        return true;
    }

    /** Drop findings of these kinds without a trace on the card; their events are tagged withdrawn. */
    public static function withdraw(string $fortress, array $kinds): int
    {
        $data = self::load();
        $fps  = [];
        foreach (['active', 'resolved'] as $bucket) {
            foreach ($data[$bucket] as $fp => $a) {
                if (($a['fortress'] ?? '') === $fortress && in_array($a['kind'] ?? '', $kinds, true)) {
                    unset(self::$data[$bucket][$fp]);
                    $fps[] = $fp;
                }
            }
        }
        if ($fps !== []) {
            self::save();
            Events::tag_fingerprints($fps, Events::TAG_WITHDRAWN);
        }
        return count($fps);
    }

    /** Re-tag findings as practice (an upgrade correcting earlier drills). */
    public static function tag(string $fp, string $tag): void
    {
        $data = self::load();
        foreach (['active', 'resolved'] as $bucket) {
            if (isset($data[$bucket][$fp])) {
                self::$data[$bucket][$fp]['tag'] = $tag;
                self::save();
            }
        }
    }

    /**
     * For the page: every unresolved finding plus those resolved in the
     * last week (shown in a calm colour), fingerprint => finding.
     *
     * @return array<string,array>
     */
    public static function active(?string $fortress = null): array
    {
        $data = self::load();
        $out  = $data['active'];
        foreach ($data['resolved'] as $fp => $a) {
            if (time() - (int) ($a['resolved_at'] ?? 0) <= self::KEEP_RESOLVED) {
                $out[$fp] = $a;
            }
        }
        if ($fortress === null) {
            return $out;
        }
        return array_filter($out, static fn($a) => ($a['fortress'] ?? '') === $fortress);
    }

    /** What counts: open and seen findings, never practice, never resolved, never an info line (the digest's). */
    public static function unresolved(?string $fortress = null): array
    {
        $data = self::load();
        return array_filter($data['active'], static fn($a) => ($fortress === null || ($a['fortress'] ?? '') === $fortress)
            && ($a['severity'] ?? '') !== Events::INFO
            && in_array(self::state($a), ['open', 'seen'], true));
    }

    /** Open breaches in which Ragusa took an action (a journal row it wrote and can undo). */
    public static function acted(): array
    {
        return array_filter(self::open(), static fn($a) => ($a['severity'] ?? '') === Events::BREACHED && !empty($a['data']['acted']));
    }

    /**
     * A finding by the short id `wp ragusa findings` prints (the start of its
     * fingerprint), across the active list and the history.
     *
     * @return array{0:string,1:array}|null
     */
    public static function by_short_id(string $id): ?array
    {
        $id = strtolower(trim($id));
        if (strlen($id) < 6 || !ctype_xdigit($id)) {
            return null;
        }
        $data  = self::load();
        $match = [];
        foreach ($data['active'] + $data['resolved'] as $fp => $a) {
            if (str_starts_with((string) $fp, $id)) {
                $match[(string) $fp] = $a;
            }
        }
        return count($match) === 1 ? [(string) array_key_first($match), reset($match)] : null;
    }

    /** The resolved history, 30 days. */
    public static function history(?string $fortress = null): array
    {
        $data = self::load();
        return array_filter($data['resolved'], static fn($a) => $fortress === null || ($a['fortress'] ?? '') === $fortress);
    }

    /**
     * Resolved or seen by hand (`wp ragusa resolve`), recorded with who.
     * Returns false when the finding is not open.
     */
    public static function resolve_by_hand(string $fp, string $by, bool $as_seen = false, string $why = ''): bool
    {
        $a = self::get($fp);
        if ($a === null || self::state($a) !== 'open') {
            return false;
        }
        $journal = (int) ($a['data']['journal_id'] ?? 0);
        if ($journal > 0) {
            Journal::annotate($journal, sprintf(
                /* translators: 1: seen or resolved, 2: name, 3: when, 4: why */
                __('finding %1$s by hand by %2$s, %3$s%4$s', 'dcc-ragusa'),
                $as_seen ? __('marked seen', 'dcc-ragusa') : __('resolved', 'dcc-ragusa'),
                mb_substr(Text::scrub($by), 0, 60),
                Site::stamp(time()),
                $why !== '' ? ': ' . $why : ''
            ));
        }
        if ($as_seen) {
            return self::mark_seen($fp, $by);
        }
        self::resolve($fp, true);
        Events::record((string) $a['fortress'], Events::INFO, 'resolved-by-hand', (string) ($a['target'] ?? ''), sprintf(
            /* translators: 1: title, 2: name */
            __('"%1$s" was resolved by hand by %2$s.', 'dcc-ragusa'),
            (string) $a['title'],
            mb_substr(Text::scrub($by), 0, 60)
        ) . ($why !== '' ? ' ' . Text::scrub($why) : ''), [], $journal > 0 ? $journal : null);
        return true;
    }

    /** @return array<string,array> only open, real findings: what colours a card */
    public static function open(?string $fortress = null): array
    {
        return array_filter(self::active($fortress), static fn($a) => self::state($a) === 'open');
    }

    public static function worst(string $fortress): string
    {
        $worst = Fortress::HOLDING;
        foreach (self::open($fortress) as $a) {
            if (($a['severity'] ?? '') === Events::BREACHED) {
                return Fortress::BREACHED;
            }
            if (($a['severity'] ?? '') === Events::NEEDS_LOOK) {
                $worst = Fortress::NEEDS_LOOK;
            }
        }
        return $worst;
    }

    // --------------------------------------------------------------- email

    public static function subject(string $fortress, string $title): string
    {
        return 'Ragusa · ' . Fortress::name($fortress) . ' · ' . Text::title_case($title);
    }

    /** Plain text, UTF-8 subject, no nonce links. Never during a drill. */
    public static function send(string $fortress, string $title, string $body): bool
    {
        if (Drill::tag() === Events::TAG_DRILL && !self::$force) {
            return false;
        }
        if (!Site::is_live() && !self::$force) {
            // The page's amber notice already says staging sends nothing; one event a day is enough.
            if ((int) State::get('mail_suppressed_noted', 0) < time() - 86400) {
                State::set('mail_suppressed_noted', time());
                Events::record($fortress, Events::INFO, 'mail-suppressed', $title, __('Emails are not sent from this site; only the live site sends them.', 'dcc-ragusa'));
            }
            return false;
        }
        $to = Settings::alert_email();
        if ($to === '') {
            return false;
        }
        $headers = ['Content-Type: text/plain; charset=UTF-8'];
        $ok      = (bool) wp_mail($to, self::subject($fortress, $title), Text::scrub($body), $headers);
        State::set('last_mail', ['ts' => time(), 'ok' => $ok, 'subject' => self::subject($fortress, $title)]);
        if (!$ok) {
            Events::record($fortress, Events::NEEDS_LOOK, 'mail-failed', $title, __('wp_mail reported a failure; the heartbeat will carry the reason instead.', 'dcc-ragusa'));
        }
        return $ok;
    }

    // -------------------------------------------------------------- digest

    public static function digest_due(): bool
    {
        $data = self::load();
        if ($data['digest'] === []) {
            return false;
        }
        $now  = Site::now();
        $last = (int) State::get('last_digest', 0);
        $sent_today = $last > 0 && (new \DateTimeImmutable('@' . $last))->setTimezone(Site::tz())->format('Y-m-d') === $now->format('Y-m-d');
        return !$sent_today && (int) $now->format('G') >= 7 && ((int) $now->format('G') > 7 || (int) $now->format('i') >= 40);
    }

    public static function send_digest(): void
    {
        $data = self::load();
        if ($data['digest'] === []) {
            return;
        }
        $lines = [];
        foreach ($data['digest'] as $d) {
            $lines[] = '• ' . Fortress::name((string) $d['fortress']) . ' · ' . $d['title'] . ($d['what'] !== '' ? ': ' . $d['what'] : '');
        }
        $n    = count($lines);
        $body = implode("\n", $lines) . "\n\n" . __('Nothing to do: these are small things Ragusa noted and did not act on.', 'dcc-ragusa') . "\n\n" . self::footer();
        /* translators: %d: number of items */
        $sent = self::send_as('Ragusa · ' . sprintf(_n('Daily · %d Small Thing', 'Daily · %d Small Things', $n, 'dcc-ragusa'), $n), $body);
        if ($sent || !Site::is_live()) {
            self::$data['digest'] = [];
            self::save();
            State::set('last_digest', time());
        }
    }

    public static function send_as(string $subject, string $body, bool $force = false): bool
    {
        if (!Site::is_live() && !self::$force && !$force) {
            return false;
        }
        $to = Settings::alert_email();
        if ($to === '') {
            return false;
        }
        return (bool) wp_mail($to, $subject, Text::scrub($body), ['Content-Type: text/plain; charset=UTF-8']);
    }

    public static function reset_cache(): void
    {
        self::$data = null;
    }
}
