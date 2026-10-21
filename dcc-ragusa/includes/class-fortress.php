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
        ];
    }

    public static function set_status(string $slug, string $state, string $line, ?int $checked_at = null): void
    {
        State::set('status.' . $slug, [
            'state'      => $state,
            'line'       => Text::scrub($line),
            'checked_at' => $checked_at ?? time(),
        ]);
    }

    /** Keep the line and time, change only the state (e.g. when an alert resolves). */
    public static function set_state(string $slug, string $state): void
    {
        $s = self::status($slug);
        self::set_status($slug, $state, $s['line'], $s['checked_at'] ?: time());
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
            ? sprintf(__('Last Full Check %s', 'dcc-ragusa'), Site::ago($last))
            /* translators: %s: relative time */
            : sprintf(__('Last Tick %s', 'dcc-ragusa'), Site::ago($tick));
        return match ($worst) {
            self::BREACHED   => __('A Wall Was Breached · Ragusa Acted And Needs You', 'dcc-ragusa') . ' · ' . $when,
            self::NEEDS_LOOK => __('Something Needs A Look', 'dcc-ragusa') . ' · ' . $when,
            default          => __('The Walls Are Holding', 'dcc-ragusa') . ' · ' . $when,
        };
    }
}
