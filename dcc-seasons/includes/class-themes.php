<?php
/**
 * Theme definitions and the pre-seeded schedule.
 *
 * A theme has two halves:
 *  - 'ambient': the site-wide subtle particle layer.
 *      mode 'drift'  — sparse slow drifting glyphs (the default look)
 *      mode 'burst'  — firework burst emitters + confetti (New Year's)
 *      mode 'accent' — NO animation; a small static corner accent
 *      Particle defs: ['g' => glyph, 'f' => text fallback if the emoji can't
 *      render, 'c' => true to tint plain-text glyphs from 'colors',
 *      'w' => spawn weight].
 *  - 'egg': the Matrix-rain recolor/re-glyph config, or false to disable the
 *      easter egg entirely on those dates (Patriot Day, MLK Day).
 *
 * Everything here ships to the client as JSON; JS picks the active row from
 * the visitor's local date so cached HTML stays date-agnostic.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

if (!defined('ABSPATH')) {
    exit;
}

class Themes {

    /**
     * Half-width katakana + digits — the classic Matrix glyph set.
     *
     * @return string[]
     */
    private static function katakana(): array {
        return preg_split('//u', 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789', -1, PREG_SPLIT_NO_EMPTY);
    }

    /**
     * All theme definitions, filterable via 'dcc_seasons_themes'.
     *
     * @return array<string, array>
     */
    public static function themes(): array {
        $katakana = self::katakana();

        $themes = [
            'labor_day' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🇺🇸', 'f' => '★', 'w' => 2],
                        ['g' => '★', 'c' => true, 'w' => 3],
                    ],
                    'colors'    => ['#B22234', '#E9ECEF', '#3C3B6E'],
                    'vy'        => [6, 16],
                    'vx'        => [-8, 8],
                ],
                'egg' => [
                    'colors' => ['#FF5252', '#F1F3F5', '#5C7CFA'],
                    'glyphs' => ['★', '▮', '✦', '1', '0'],
                ],
            ],

            // Patriot Day — subtle only: static corner flag-ribbon accent,
            // no particles, easter egg disabled.
            'patriot_day' => [
                'ambient' => [
                    'mode'   => 'accent',
                    'accent' => '🇺🇸',
                    'bar'    => ['#B22234', '#F8F9FA', '#3C3B6E'],
                ],
                'egg' => false,
            ],

            'fall_fishing' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🎣', 'w' => 2],
                        ['g' => '🐟', 'w' => 2],
                        ['g' => '🐠', 'w' => 1],
                        ['g' => '🪝', 'f' => 'J', 'w' => 1],
                    ],
                    'vy'        => [3, 9],
                    'vx'        => [-10, 10],
                    'sway'      => 14,
                    'swayY'     => true, // bobbers dip vertically
                ],
                'egg' => [
                    'colors' => ['#1864AB', '#0B7285', '#12B886'],
                    'glyphs' => ['🐟', '⚓', 'J', '~', 'ﾂ', 'ｼ'],
                ],
            ],

            'halloween' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🎃', 'w' => 3],
                        ['g' => '🦇', 'w' => 2],
                        ['g' => '🍬', 'w' => 1],
                        ['g' => '🍂', 'w' => 2],
                    ],
                    'vy'        => [8, 20],
                    'vx'        => [-12, 12],
                ],
                'egg' => [
                    'colors' => ['#FF7A00', '#9C36B5'],
                    'glyphs' => ['🎃', '🦇', '☠', 'ﾊ', 'ｷ', '0'],
                ],
            ],

            'thanksgiving' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🍂', 'w' => 4],
                        ['g' => '🍁', 'w' => 3],
                        ['g' => '🌰', 'f' => 'o', 'w' => 2],
                        ['g' => '🦃', 'w' => 1], // the occasional turkey
                    ],
                    'vy'        => [8, 18],
                    'vx'        => [-14, 14],
                    'sway'      => 16,
                ],
                'egg' => [
                    'colors' => ['#E8890C', '#A05A2C'],
                    'glyphs' => ['🍂', '🦃', 'ﾅ', 'ｵ', '1'],
                ],
            ],

            'christmas' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '❄️', 'f' => '❄', 'w' => 4],
                        ['g' => '❄', 'c' => true, 'w' => 2],
                        ['g' => '🌿', 'w' => 1],
                        ['g' => '🔴', 'f' => '●', 'w' => 1], // ornament
                    ],
                    'colors'    => ['#8FC1E8', '#B7D9F2'],
                    'vy'        => [7, 16],
                    'vx'        => [-10, 10],
                    'sway'      => 14,
                ],
                'egg' => [
                    'colors' => ['#2F9E44', '#E03131'],
                    'glyphs' => ['❄', '✦', '*', 'ｼ', 'ﾒ', '0'],
                ],
            ],

            // New Year's — burst physics (fireworks) instead of rain.
            'new_years' => [
                'ambient' => [
                    'mode'      => 'burst',
                    'particles' => [
                        ['g' => '✨', 'f' => '*', 'w' => 2],
                        ['g' => '▪', 'c' => true, 'w' => 3], // confetti
                        ['g' => '🎉', 'w' => 1],
                    ],
                    'colors'    => ['#FFD43B', '#CED4DA', '#FAB005', '#E9ECEF'],
                    'vy'        => [8, 18],
                    'vx'        => [-10, 10],
                ],
                'egg' => [
                    'colors' => ['#FFD43B', '#CED4DA'],
                    'glyphs' => ['2', '0', '2', '7', '✨', '🥂'],
                ],
            ],

            'snowbird' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🕊️', 'f' => 'v', 'w' => 2],
                        ['g' => '🦭', 'f' => '~', 'w' => 1],
                        ['g' => '🍊', 'w' => 2],
                    ],
                    'vy'        => [2, 8],
                    'vx'        => [8, 26], // birds glide sideways
                    'sway'      => 12,
                    'swayY'     => true,
                ],
                'egg' => [
                    'colors' => ['#4DABF7', '#A5D8FF'],
                    'glyphs' => ['🕊', '🍊', '~', 'ﾂ', '0'],
                ],
            ],

            // MLK Day — subtle only: soft gold/purple accent + dove, egg off.
            'mlk' => [
                'ambient' => [
                    'mode'   => 'accent',
                    'accent' => '🕊️',
                    'bar'    => ['#B8860B', '#6A0DAD'],
                ],
                'egg' => false,
            ],

            'mardi_gras' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🎭', 'f' => '⚜', 'w' => 2],
                        ['g' => '🪙', 'f' => '¢', 'w' => 2],
                        ['g' => '📿', 'f' => 'o', 'w' => 2], // beads
                        ['g' => '⚜', 'c' => true, 'w' => 2],
                    ],
                    'colors'    => ['#7C3AED', '#2F9E44', '#F1C40F'],
                    'vy'        => [8, 18],
                    'vx'        => [-12, 12],
                ],
                'egg' => [
                    'colors' => ['#7C3AED', '#2F9E44', '#F1C40F'],
                    'glyphs' => ['⚜', '🎭', '*', 'ｻ', '0'],
                ],
            ],

            'valentines' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'dir'       => 'up', // hearts float upward
                    'particles' => [
                        ['g' => '💕', 'f' => '♥', 'w' => 2],
                        ['g' => '💗', 'f' => '♥', 'w' => 1],
                        ['g' => '♥', 'c' => true, 'w' => 2],
                    ],
                    'colors'    => ['#F783AC', '#FA5252'],
                    'vy'        => [6, 14],
                    'vx'        => [-6, 6],
                    'sway'      => 12,
                ],
                'egg' => [
                    'colors' => ['#F06595', '#FA5252'],
                    'glyphs' => ['♥', '♡', 'ﾒ', '1'],
                ],
            ],

            'presidents' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '★', 'c' => true, 'w' => 4],
                        ['g' => '🇺🇸', 'f' => '★', 'w' => 1],
                    ],
                    'colors'    => ['#B22234', '#E9ECEF', '#3C3B6E'],
                    'vy'        => [6, 16],
                    'vx'        => [-8, 8],
                ],
                'egg' => [
                    'colors' => ['#FF5252', '#F1F3F5', '#5C7CFA'],
                    'glyphs' => ['★', '✦', '0', '1'],
                ],
            ],

            'strawberry' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🍓', 'w' => 3],
                        ['g' => '🌸', 'w' => 1],
                    ],
                    'vy'        => [7, 15],
                    'vx'        => [-8, 8],
                ],
                'egg' => [
                    'colors' => ['#E03131', '#2F9E44'],
                    'glyphs' => ['🍓', 'ｽ', 'ﾍ', '0'],
                ],
            ],

            // St. Patrick's — the one theme whose egg is the authentic
            // classic green Matrix rain (plus shamrocks).
            'st_patricks' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '☘️', 'f' => '♣', 'w' => 3],
                        ['g' => '🪙', 'f' => '$', 'w' => 1],
                    ],
                    'vy'        => [7, 16],
                    'vx'        => [-10, 10],
                    'sway'      => 14,
                ],
                'egg' => [
                    'colors' => ['#00FF41'],
                    'glyphs' => array_merge($katakana, ['☘', '☘', '☘']),
                ],
            ],

            'easter' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🥚', 'f' => 'O', 'w' => 2],
                        ['g' => '🐣', 'w' => 1],
                        ['g' => '🐰', 'w' => 1],
                        ['g' => '🌷', 'w' => 2],
                    ],
                    'vy'        => [6, 14],
                    'vx'        => [-8, 8],
                ],
                'egg' => [
                    'colors' => ['#F9A8D4', '#A7F3D0', '#BFDBFE', '#FDE68A'],
                    'glyphs' => ['🥚', '🐣', 'ｵ', '0'],
                ],
            ],

            // April Fool's — everything runs upside-down, egg glitches.
            'april_fools' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'dir'       => 'up',
                    'particles' => [
                        ['g' => '👀', 'f' => 'oO', 'w' => 2],
                        ['g' => '🙃', 'f' => '¿', 'w' => 1],
                        ['g' => '❓', 'f' => '?', 'w' => 1],
                    ],
                    'vy'        => [8, 20],
                    'vx'        => [-14, 14],
                ],
                'egg' => [
                    'colors' => ['#00FF41'],
                    'glyphs' => $katakana,
                    'dir'    => 'up',
                    'glitch' => true,
                ],
            ],

            'spring_canal' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🌸', 'w' => 3],
                        ['g' => '🐟', 'w' => 2],
                        ['g' => '🦋', 'f' => 'x', 'w' => 1], // dragonfly stand-in
                    ],
                    'vy'        => [5, 12],
                    'vx'        => [-12, 12],
                    'sway'      => 14,
                ],
                'egg' => [
                    'colors' => ['#37B24D', '#339AF0'],
                    'glyphs' => ['🌸', '🐟', '~', 'ﾊ', '1'],
                ],
            ],

            'four_twenty' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🍃', 'w' => 1],
                    ],
                    'vy'        => [5, 12],
                    'vx'        => [-14, 14],
                    'sway'      => 18,
                ],
                'egg' => [
                    'colors' => ['#2F9E44'],
                    'glyphs' => ['🍃', 'ﾊ', 'ﾒ', '0', '1'],
                ],
            ],

            'earth_day' => [
                'ambient' => [
                    'mode'      => 'drift',
                    'particles' => [
                        ['g' => '🍃', 'w' => 2],
                        ['g' => '🌎', 'w' => 1],
                        ['g' => '💧', 'f' => '°', 'w' => 2],
                    ],
                    'vy'        => [6, 14],
                    'vx'        => [-10, 10],
                ],
                'egg' => [
                    'colors' => ['#2F9E44', '#339AF0'],
                    'glyphs' => ['🌎', '💧', '🍃', 'ﾂ', '0'],
                ],
            ],

            // Fallback for dates outside every range: no ambient, and the
            // easter egg is the classic green Matrix rain.
            'classic' => [
                'ambient' => ['mode' => 'none'],
                'egg'     => [
                    'colors' => ['#00FF41'],
                    'glyphs' => $katakana,
                ],
            ],
        ];

        /**
         * Filter every theme definition (ambient particles, egg palettes…).
         *
         * @param array $themes Theme key => definition.
         */
        return apply_filters('dcc_seasons_themes', $themes);
    }

    /**
     * Human-readable theme labels for the admin schedule dropdown.
     *
     * @return array<string, string>
     */
    public static function labels(): array {
        return [
            'labor_day'    => __('Labor Day', 'dcc-seasons'),
            'patriot_day'  => __('Patriot Day (subtle only)', 'dcc-seasons'),
            'fall_fishing' => __('Fall Fishing', 'dcc-seasons'),
            'halloween'    => __('Halloween', 'dcc-seasons'),
            'thanksgiving' => __('Thanksgiving', 'dcc-seasons'),
            'christmas'    => __('Christmas', 'dcc-seasons'),
            'new_years'    => __('New Year\'s (fireworks)', 'dcc-seasons'),
            'snowbird'     => __('Snowbird Season', 'dcc-seasons'),
            'mlk'          => __('MLK Day (subtle only)', 'dcc-seasons'),
            'mardi_gras'   => __('Mardi Gras', 'dcc-seasons'),
            'valentines'   => __('Valentine\'s', 'dcc-seasons'),
            'presidents'   => __('Presidents Day', 'dcc-seasons'),
            'strawberry'   => __('Strawberry Season', 'dcc-seasons'),
            'st_patricks'  => __('St. Patrick\'s', 'dcc-seasons'),
            'easter'       => __('Easter', 'dcc-seasons'),
            'april_fools'  => __('April Fool\'s', 'dcc-seasons'),
            'spring_canal' => __('Spring on the Canal', 'dcc-seasons'),
            'four_twenty'  => __('4/20', 'dcc-seasons'),
            'earth_day'    => __('Earth Day', 'dcc-seasons'),
            'classic'      => __('None (classic green egg only)', 'dcc-seasons'),
        ];
    }

    /**
     * The pre-seeded 2026–27 schedule. Dates are Y-m-d and compared as
     * strings against the visitor's LOCAL date in JS.
     *
     * @return array<int, array{start:string,end:string,theme:string,label:string}>
     */
    public static function default_schedule(): array {
        return [
            ['start' => '2026-09-01', 'end' => '2026-09-07', 'theme' => 'labor_day',    'label' => __('Labor Day', 'dcc-seasons')],
            ['start' => '2026-09-08', 'end' => '2026-09-11', 'theme' => 'patriot_day',  'label' => __('Patriot Day', 'dcc-seasons')],
            ['start' => '2026-09-12', 'end' => '2026-09-30', 'theme' => 'fall_fishing', 'label' => __('Fall Fishing', 'dcc-seasons')],
            ['start' => '2026-10-01', 'end' => '2026-10-31', 'theme' => 'halloween',    'label' => __('Halloween', 'dcc-seasons')],
            ['start' => '2026-11-01', 'end' => '2026-11-26', 'theme' => 'thanksgiving', 'label' => __('Thanksgiving', 'dcc-seasons')],
            ['start' => '2026-11-27', 'end' => '2026-12-25', 'theme' => 'christmas',    'label' => __('Christmas', 'dcc-seasons')],
            ['start' => '2026-12-26', 'end' => '2027-01-03', 'theme' => 'new_years',    'label' => __('New Year\'s', 'dcc-seasons')],
            ['start' => '2027-01-04', 'end' => '2027-01-17', 'theme' => 'snowbird',     'label' => __('Snowbird Season', 'dcc-seasons')],
            ['start' => '2027-01-18', 'end' => '2027-01-18', 'theme' => 'mlk',          'label' => __('MLK Day', 'dcc-seasons')],
            ['start' => '2027-01-19', 'end' => '2027-01-31', 'theme' => 'snowbird',     'label' => __('Snowbird Season', 'dcc-seasons')],
            ['start' => '2027-02-01', 'end' => '2027-02-09', 'theme' => 'mardi_gras',   'label' => __('Mardi Gras', 'dcc-seasons')],
            ['start' => '2027-02-10', 'end' => '2027-02-14', 'theme' => 'valentines',   'label' => __('Valentine\'s', 'dcc-seasons')],
            ['start' => '2027-02-15', 'end' => '2027-02-15', 'theme' => 'presidents',   'label' => __('Presidents Day', 'dcc-seasons')],
            ['start' => '2027-02-16', 'end' => '2027-03-01', 'theme' => 'strawberry',   'label' => __('Strawberry Season', 'dcc-seasons')],
            ['start' => '2027-03-02', 'end' => '2027-03-17', 'theme' => 'st_patricks',  'label' => __('St. Patrick\'s', 'dcc-seasons')],
            ['start' => '2027-03-18', 'end' => '2027-03-31', 'theme' => 'easter',       'label' => __('Easter', 'dcc-seasons')],
            ['start' => '2027-04-01', 'end' => '2027-04-01', 'theme' => 'april_fools',  'label' => __('April Fool\'s', 'dcc-seasons')],
            ['start' => '2027-04-02', 'end' => '2027-04-19', 'theme' => 'spring_canal', 'label' => __('Spring on the Canal', 'dcc-seasons')],
            ['start' => '2027-04-20', 'end' => '2027-04-20', 'theme' => 'four_twenty',  'label' => __('4/20', 'dcc-seasons')],
            ['start' => '2027-04-21', 'end' => '2027-04-22', 'theme' => 'earth_day',    'label' => __('Earth Day', 'dcc-seasons')],
        ];
    }

    /**
     * The effective schedule (saved option rows), filterable.
     *
     * @param array $rows Saved schedule rows.
     * @return array
     */
    public static function schedule(array $rows): array {
        /**
         * Filter the schedule sent to the client.
         *
         * @param array $rows Each row: start, end (Y-m-d), theme key, label.
         */
        return apply_filters('dcc_seasons_schedule', $rows);
    }
}
