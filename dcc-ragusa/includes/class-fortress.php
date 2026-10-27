<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The five fortresses by name, and each one's status card state.
 * Display names carry their diacritics; slugs are ASCII.
 */
final class Fortress
{
    public const MINCETA    = 'minceta';
    public const BOKAR      = 'bokar';
    public const REVELIN    = 'revelin';
    public const LOVRIJENAC = 'lovrijenac';
    public const SVETI_IVAN = 'sveti-ivan';
    public const ZELENCI    = 'zelenci';

    public const HOLDING    = 'holding';
    public const NEEDS_LOOK = 'needs-look';
    public const BREACHED   = 'breached';
    public const UNKNOWN    = 'unknown';

    public static function all(): array
    {
        return [self::MINCETA, self::BOKAR, self::REVELIN, self::LOVRIJENAC, self::SVETI_IVAN];
    }

    public static function name(string $slug): string
    {
        return match ($slug) {
            self::MINCETA    => 'Minčeta',
            self::BOKAR      => 'Bokar',
            self::REVELIN    => 'Revelin',
            self::LOVRIJENAC => 'Lovrijenac',
            self::SVETI_IVAN => 'Sveti Ivan',
            self::ZELENCI    => 'Zelenci',
            default          => 'Ragusa',
        };
    }

    public static function subtitle(string $slug): string
    {
        return match ($slug) {
            self::MINCETA    => __('Watches The Files', 'dcc-ragusa'),
            self::BOKAR      => __('Guards The Login', 'dcc-ragusa'),
            self::REVELIN    => __('Keeps The Sealed Copies', 'dcc-ragusa'),
            self::LOVRIJENAC => __('Reads The Warnings', 'dcc-ragusa'),
            self::SVETI_IVAN => __('Checks Every Update', 'dcc-ragusa'),
            self::ZELENCI    => __('Rings If Ragusa Falls', 'dcc-ragusa'),
            default          => '',
        };
    }

    public static function state_label(string $state): string
    {
        return match ($state) {
            self::HOLDING    => __('Holding', 'dcc-ragusa'),
            self::NEEDS_LOOK => __('Needs A Look', 'dcc-ragusa'),
            self::BREACHED   => __('Breached', 'dcc-ragusa'),
            default          => __('Not Checked Yet', 'dcc-ragusa'),
        };
    }

    /** @return array{state:string,line:string,checked_at:int} */
    public static function status(string $slug): array
    {
        $s = State::get('status.' . $slug, []);
        return [
            'state'      => (string) ($s['state'] ?? self::UNKNOWN),
            'line'       => (string) ($s['line'] ?? __('No check has run yet.', 'dcc-ragusa')),
            'checked_at' => (int) ($s['checked_at'] ?? 0),
            'fp'         => (string) ($s['fp'] ?? ''),
        ];
    }

    public static function set_status(string $slug, string $state, string $line, ?int $checked_at = null, ?string $fp = null): void
    {
        State::set('status.' . $slug, [
            'state'      => $state,
            'line'       => Text::scrub($line),
            'checked_at' => $checked_at ?? time(),
            'fp'         => (string) ($fp ?? ''),
        ]);
    }

    /**
     * The row as it should read NOW: a line that speaks for a finding says
     * when that finding was settled. "all-in-one-seo-pack Failed Its Checks ·
     * Resolved Oct 26, 9:10 PM EDT".
     */
    public static function row_line(string $slug): string
    {
        $s    = self::status($slug);
        $line = (string) $s['line'];
        $fp   = (string) ($s['fp'] ?? '');
        if ($fp === '') {
            return $line;
        }
        $a = Alerts::get($fp);
        if ($a === null) {
            return $line;
        }
        return match (Alerts::state($a)) {
            /* translators: %s: when */
            'resolved' => $line . ' · ' . sprintf(__('Resolved %s', 'dcc-ragusa'), Site::stamp((int) $a['resolved_at'])),
            /* translators: 1: name, 2: when */
            'seen'     => $line . ' · ' . sprintf(__('Seen By %1$s, %2$s', 'dcc-ragusa'), (string) $a['seen_by'], Site::stamp((int) $a['seen_at'])),
            default    => $line,
        };
    }

    /**
     * Before anything prints the headline or the rows: every state from the
     * live findings, and the lines that count findings rebuilt. Nothing is
     * checked again; this is reading, not watching.
     */
    public static function refresh(): void
    {
        self::settle();
        if (self::status(self::MINCETA)['state'] !== self::UNKNOWN) {
            Fortress\Minceta::update_status();
        }
        Fortress\Lovrijenac::refresh_php();
    }

    /**
     * A fortress reports what it did: the line is kept, the state comes from
     * its open findings. A drill's report never reaches the card.
     */
    public static function note(string $slug, string $line, ?string $fp = null): void
    {
        if (Drill::tag() === Events::TAG_DRILL) {
            return;
        }
        self::set_status($slug, Alerts::worst($slug), $line, null, $fp);
    }

    /** Keep the line and time, change only the state (e.g. when an alert resolves). */
    public static function set_state(string $slug, string $state): void
    {
        $s = self::status($slug);
        self::set_status($slug, $state, $s['line'], $s['checked_at'] ?: time(), (string) ($s['fp'] ?? '') ?: null);
    }

    /**
     * Every card's state from its open, real findings. Practice, resolved
     * and seen findings do not colour a card. Run at the end of a tick and
     * when the page renders, so Mark As Seen calms the headline at once.
     */
    public static function settle(): void
    {
        foreach (self::all() as $slug) {
            if (self::status($slug)['state'] === self::UNKNOWN) {
                continue;
            }
            self::set_state($slug, Alerts::worst($slug));
        }
    }

    /** The one sentence at the top of the page. */
    public static function overall(): string
    {
        $worst   = self::HOLDING;
        $unknown = 0;
        foreach (self::all() as $slug) {
            $state = self::status($slug)['state'];
            if ($state === self::BREACHED) {
                $worst = self::BREACHED;
            } elseif ($state === self::NEEDS_LOOK && $worst !== self::BREACHED) {
                $worst = self::NEEDS_LOOK;
            } elseif ($state === self::UNKNOWN) {
                $unknown++;
            }
        }
        $last = (int) State::get('last_full_pass', 0);
        $tick = (int) State::get('last_tick', 0);
        if ($unknown === count(self::all())) {
            return __('The Walls Are Not Yet Checked · Waiting For The First Cron Tick', 'dcc-ragusa');
        }
        $when = $last > 0
            /* translators: %s: relative time */
            ? sprintf(__('Last Full Check %s', 'dcc-ragusa'), Site::both($last))
            /* translators: %s: relative time */
            : sprintf(__('Last Tick %s', 'dcc-ragusa'), Site::both($tick));
        return match ($worst) {
            self::BREACHED   => (Alerts::acted() !== []
                ? __('A Wall Was Breached · Ragusa Acted And Needs You', 'dcc-ragusa')
                : __('A Wall Was Breached · Ragusa Needs You', 'dcc-ragusa')) . ' · ' . $when,
            self::NEEDS_LOOK => __('Something Needs A Look', 'dcc-ragusa') . ' · ' . $when,
            default          => __('The Walls Are Holding', 'dcc-ragusa') . ' · ' . $when,
        };
    }
}
