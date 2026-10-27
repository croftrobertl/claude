<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The Walls Report: one email every Monday at 7:00 AM Eastern, so that
 * silence means something. A short paragraph, then one line per fortress.
 * Suppressed on staging like every other email; `wp ragusa report --dry-run`
 * prints it anywhere.
 */
final class Report
{
    public const DAY    = 1; // Monday
    public const HOUR   = 7;
    public const WINDOW = 7 * 86400;

    public static function due(): bool
    {
        $now = Site::now();
        if ((int) $now->format('N') !== self::DAY || (int) $now->format('G') < self::HOUR) {
            return false;
        }
        $last = (int) State::get('last_report', 0);
        if ($last === 0) {
            return true;
        }
        $last_week = (new \DateTimeImmutable('@' . $last))->setTimezone(Site::tz())->format('o-W');
        return $last_week !== $now->format('o-W');
    }

    /** Sends when due; the tick calls this. */
    public static function maybe_send(): void
    {
        if (self::due()) {
            self::send();
        }
    }

    public static function send(bool $force = false): bool
    {
        $r    = self::build();
        $sent = Alerts::send_as($r['subject'], $r['body'], $force);
        if ($sent || !Site::is_live()) {
            State::set('last_report', time());
        }
        Events::record(Fortress::LOVRIJENAC, Events::INFO, 'report', 'weekly', $sent ? $r['subject'] : $r['subject'] . ' (' . __('not sent from this site', 'dcc-ragusa') . ')');
        return $sent;
    }

    /** @return array{subject:string,body:string} */
    public static function build(): array
    {
        $since   = time() - self::WINDOW;
        $open    = Alerts::open();
        $n_open  = count($open);
        $breach  = count(array_filter($open, static fn($a) => ($a['severity'] ?? '') === Events::BREACHED));
        $opened  = self::opened_since($since);
        $closed  = self::closed_since($since);
        $o_total = array_sum($opened);
        $c_total = array_sum($closed);

        $subject = $n_open === 0
            ? __('Ragusa: The Walls Held This Week', 'dcc-ragusa')
            /* translators: %d: count */
            : sprintf(_n('Ragusa: %d Thing Needs A Look', 'Ragusa: %d Things Need A Look', $n_open, 'dcc-ragusa'), $n_open);

        $para = [];
        if ($n_open === 0) {
            $para[] = $o_total === 0
                ? __('Nothing needed a look this week, and nothing is open now.', 'dcc-ragusa')
                /* translators: 1: opened, 2: closed */
                : sprintf(_n('%1$d finding opened this week and %2$d closed; nothing is open now.', '%1$d findings opened this week and %2$d closed; nothing is open now.', $o_total, 'dcc-ragusa'), $o_total, $c_total);
        } else {
            /* translators: 1: open now, 2: opened this week, 3: closed this week */
            $para[] = sprintf(__('%1$d open now (%2$d opened this week, %3$d closed).', 'dcc-ragusa'), $n_open, $o_total, $c_total);
            $acted = count(Alerts::acted());
            if ($acted > 0) {
                /* translators: %d: count */
                $para[] = sprintf(_n('%d of them is a breach Ragusa acted on; it needs you.', '%d of them are breaches Ragusa acted on; they need you.', $acted, 'dcc-ragusa'), $acted);
            }
            if ($breach - $acted > 0) {
                /* translators: %d: count */
                $para[] = sprintf(_n('%d of them is a breach Ragusa did not act on; it needs you.', '%d of them are breaches Ragusa did not act on; they need you.', $breach - $acted, 'dcc-ragusa'), $breach - $acted);
            }
            $para[] = __('Open DCC → Ragusa to read them; each names what to do.', 'dcc-ragusa');
        }
        $tick = (int) State::get('last_tick', 0);
        if ($tick > 0 && time() - $tick > 3 * 3600) {
            /* translators: %s: when */
            $para[] = sprintf(__('The last tick was %s, which is too long ago: the cron may have stopped.', 'dcc-ragusa'), Site::both($tick));
        }

        $lines = [];
        foreach (Fortress::all() as $slug) {
            $lines[] = Fortress::name($slug) . ' · ' . self::fortress_line($slug, (int) ($opened[$slug] ?? 0), (int) ($closed[$slug] ?? 0));
        }
        $body = implode(' ', $para) . "\n\n" . implode("\n", $lines) . "\n\n" . Alerts::footer();
        return ['subject' => $subject, 'body' => $body];
    }

    /** Serious findings first seen in the window, by fortress (practice never counts; info is the digest's). */
    private static function opened_since(int $since): array
    {
        $out = [];
        foreach (Alerts::active() + Alerts::history() as $a) {
            if (($a['tag'] ?? '') !== '' || ($a['severity'] ?? '') === Events::INFO || (int) ($a['first_seen'] ?? 0) < $since) {
                continue;
            }
            $f = (string) ($a['fortress'] ?? '');
            $out[$f] = ($out[$f] ?? 0) + 1;
        }
        return $out;
    }

    /** Serious findings resolved or seen in the window, by fortress. */
    private static function closed_since(int $since): array
    {
        $out = [];
        foreach (Alerts::active() + Alerts::history() as $a) {
            if (($a['tag'] ?? '') !== '' || ($a['severity'] ?? '') === Events::INFO) {
                continue;
            }
            if ((int) ($a['resolved_at'] ?? 0) >= $since || (int) ($a['seen_at'] ?? 0) >= $since) {
                $f = (string) ($a['fortress'] ?? '');
                $out[$f] = ($out[$f] ?? 0) + 1;
            }
        }
        return $out;
    }

    private static function fortress_line(string $slug, int $opened, int $closed): string
    {
        /* translators: 1: opened, 2: closed */
        $parts = [sprintf(__('%1$d Opened, %2$d Closed', 'dcc-ragusa'), $opened, $closed)];
        switch ($slug) {
            case Fortress::MINCETA:
                $d = (array) State::get('disk', []);
                if (isset($d['pct']) && $d['pct'] !== null && !empty($d['limit'])) {
                    /* translators: 1: used, 2: limit, 3: percent */
                    $parts[] = sprintf(__('Disk %1$s Of %2$s (%3$d%%)', 'dcc-ragusa'), Text::bytes((int) ($d['used'] ?? 0)), Text::bytes((int) $d['limit']), (int) round((float) $d['pct']));
                } else {
                    $parts[] = __('Disk Not Measured', 'dcc-ragusa');
                }
                $last = (int) State::get('last_full_pass', 0);
                /* translators: %s: when */
                $parts[] = $last > 0 ? sprintf(__('Last Full Scan %s', 'dcc-ragusa'), Site::stamp($last)) : __('No Full Scan Yet', 'dcc-ragusa');
                break;
            case Fortress::BOKAR:
                $snap = Fortress\Bokar::snapshot();
                /* translators: 1: privileged, 2: users */
                $parts[] = sprintf(__('%1$d Privileged Of %2$d Users', 'dcc-ragusa'), count($snap['users'] ?? []), (int) ($snap['total'] ?? 0));
                break;
            case Fortress::REVELIN:
                /* translators: 1: used, 2: cap */
                $parts[] = sprintf(__('Vault %1$s Of %2$s', 'dcc-ragusa'), Text::bytes(Vault::usage()), Text::bytes(Vault::CAP));
                break;
            case Fortress::LOVRIJENAC:
                $parts[] = Php_Patch::line();
                break;
            case Fortress::SVETI_IVAN:
                $n = Events::count_kind_since('update-seen', time() - self::WINDOW) + Events::count_kind_since('core-update-seen', time() - self::WINDOW);
                /* translators: %d: count */
                $parts[] = sprintf(_n('%d Update Checked', '%d Updates Checked', $n, 'dcc-ragusa'), $n);
                break;
        }
        return implode(' · ', $parts);
    }
}
