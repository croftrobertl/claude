<?php
/**
 * Theme definitions and the pre-seeded schedule.
 *
 * A theme has two halves:
 *  - 'ambient': the site-wide subtle particle layer, run by the lazy-loaded
 *      engine (assets/js/engine.js). Keys:
 *        mode      'drift' (default) or 'burst' (firework emitters)
 *        water     true → the invisible waterline along the bottom ~8% of
 *                  the viewport is active (settle/float/jump/submerged)
 *        up        true → fall-family behaviors run upward (April Fool's)
 *        hero      extra rare crosser besides the year-round heron
 *                  (engine registry: eagle, witch, sleigh, manatee, bass,
 *                  ducks, rainbow)
 *        accent    static corner accent rendered by the engine
 *        particles particle specs (see below)
 *      Particle spec keys (short — they ship as JSON):
 *        e  emoji glyph            f  fallback glyph if e can't render
 *        fc fallback tint          s  SVG sprite key (engine registry)
 *        c  canvas primitive key   b  behavior/personality name
 *        w  spawn weight           st 1 → settles on the waterline
 *        sz [min,max] px           cl color list for tinted primitives
 *        glow 1 → soft halo behind the glyph (pumpkins)
 *        face 'L' → the glyph's native art faces LEFT; the engine mirrors
 *        it when travelling rightward so it faces its direction of travel
 *        (never set on flags, symmetric glyphs, or canvas primitives)
 *      Behaviors: fall sway flutter wobble float rise grow fly vee pulse
 *      orbit tumble dangle hang toss hop waddle dart twinkle chatter jump
 *      spin cruise — cruise rides AT the waterline while crossing, with a
 *      wake ripple every 2–4 s (mode 'burst' adds the firework emitter +
 *      auto-year text).
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
                    'water'     => true,
                    'particles' => [
                        ['e' => '🇺🇸', 'f' => '★', 'fc' => '#B22234', 'b' => 'fall', 'w' => 2],
                        ['c' => 'star', 'cl' => ['#B22234', '#F1F3F5', '#3C3B6E'], 'b' => 'fall', 'w' => 3],
                        ['e' => '🍔', 'b' => 'fall'],
                        ['e' => '🌭', 'b' => 'fall'],
                        // Planted at the bottom like a beach umbrella —
                        // umbrellas don't rain.
                        ['e' => '⛱️', 'f' => '☂', 'fc' => '#E03131', 'b' => 'grow'],
                        // Last boating weekend of summer: pontoons cruise ON
                        // the waterline, mirrored to face their travel.
                        ['s' => 'pontoon', 'b' => 'cruise', 'face' => 'L', 'w' => 2, 'sz' => [30, 38]],
                    ],
                ],
                'egg' => [
                    'colors' => ['#FF5252', '#F1F3F5', '#5C7CFA'],
                    'glyphs' => ['★', '▮', '✦', '1', '0'],
                ],
            ],

            // Patriot Day — gentle: NOTHING falls (the wrong image for 9/11).
            // Twinkling stars, slow gliding flags, static ribbon, eagle hero.
            'patriot_day' => [
                'ambient' => [
                    'hero'      => 'eagle',
                    'accent'    => ['svg' => 'ribbon'],
                    'particles' => [
                        ['c' => 'star', 'cl' => ['#B22234', '#F1F3F5', '#3C3B6E'], 'b' => 'twinkle', 'w' => 3],
                        ['e' => '🇺🇸', 'f' => '★', 'fc' => '#3C3B6E', 'b' => 'fly', 'w' => 1, 'slow' => 1],
                    ],
                ],
                'egg' => false,
            ],

            'fall_fishing' => [
                'ambient' => [
                    'water'     => true,
                    'hero'      => 'bass',
                    'particles' => [
                        ['e' => '🍁', 'b' => 'sway', 'st' => 1, 'w' => 2],
                        ['e' => '🍂', 'b' => 'sway', 'st' => 1, 'w' => 2],
                        ['s' => 'bobber', 'b' => 'float', 'w' => 2],
                        // Fishing line lowers, pauses, reels back up.
                        ['e' => '🪝', 'f' => '🎣', 'b' => 'dangle', 'worm' => 1],
                        ['e' => '🐟', 'b' => 'jump', 'face' => 'L', 'w' => 2],
                    ],
                ],
                'egg' => [
                    'colors' => ['#1864AB', '#0B7285', '#12B886'],
                    'glyphs' => ['🐟', '⚓', 'J', '~', 'ﾂ', 'ｼ'],
                ],
            ],

            'halloween' => [
                'ambient' => [
                    'hero'      => 'witch',
                    'particles' => [
                        ['e' => '🎃', 'b' => 'fall', 'glow' => 1, 'w' => 3],
                        ['e' => '👻', 'f' => '☠', 'fc' => '#E9ECEF', 'b' => 'wobble', 'w' => 2],
                        ['e' => '🦇', 'b' => 'flutter', 'w' => 2],
                        ['e' => '🕷️', 'f' => '🕸', 'b' => 'dangle'],
                        ['s' => 'candycorn', 'b' => 'fall'],
                        ['s' => 'witchhat', 'b' => 'fall'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#FF7A00', '#9C36B5'],
                    'glyphs' => ['🎃', '🦇', '☠', 'ﾊ', 'ｷ', '0'],
                ],
            ],

            'thanksgiving' => [
                'ambient' => [
                    'water'     => true,
                    'particles' => [
                        ['e' => '🍁', 'b' => 'sway', 'st' => 1, 'w' => 3],
                        ['e' => '🍂', 'b' => 'sway', 'st' => 1, 'w' => 3],
                        ['s' => 'acorn', 'b' => 'fall', 'w' => 2],
                        ['e' => '🥧', 'b' => 'fall'],
                        // Raining turkeys = no. One walks the bottom instead.
                        ['e' => '🦃', 'b' => 'waddle', 'face' => 'L'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#E8890C', '#A05A2C'],
                    'glyphs' => ['🍂', '🦃', 'ﾅ', 'ｵ', '1'],
                ],
            ],

            'christmas' => [
                'ambient' => [
                    'water'     => true,
                    'hero'      => 'sleigh',
                    'particles' => [
                        ['e' => '❄️', 'f' => '❄', 'fc' => '#8FC1E8', 'b' => 'fall', 'st' => 1, 'w' => 4, 'sz' => [10, 26]],
                        ['s' => 'ornament', 'b' => 'hang', 'w' => 2],
                        ['s' => 'holly', 'b' => 'hang'],
                        ['e' => '🎁', 'b' => 'fall'],
                        // Trees stand up from the bottom edge — they don't
                        // rain from the sky.
                        ['e' => '🎄', 'b' => 'grow'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#2F9E44', '#E03131'],
                    'glyphs' => ['❄', '✦', '*', 'ｼ', 'ﾒ', '0'],
                ],
            ],

            // New Year's — fireworks explode, the auto-computed year appears
            // at the burst point and fades; confetti tumbles; bubbles rise.
            'new_years' => [
                'ambient' => [
                    'mode'      => 'burst',
                    'particles' => [
                        ['c' => 'confetti', 'cl' => ['#FFD43B', '#E03131', '#339AF0', '#2F9E44', '#CED4DA'], 'b' => 'tumble', 'w' => 3],
                        ['e' => '🥂', 'f' => '🍾', 'b' => 'rise'],
                        ['c' => 'bubble', 'cl' => ['#FFD43B', '#F8F0C8'], 'b' => 'rise', 'w' => 2],
                        ['e' => '✨', 'f' => '*', 'fc' => '#FFD43B', 'b' => 'twinkle', 'w' => 2],
                    ],
                    'sparkCl'   => ['#FFD43B', '#CED4DA', '#FAB005', '#F1F3F5'],
                ],
                'egg' => [
                    'colors' => ['#FFD43B', '#CED4DA'],
                    'glyphs' => ['2', '0', '2', '7', '✨', '🥂'],
                ],
            ],

            'snowbird' => [
                'ambient' => [
                    'water'     => true,
                    'hero'      => 'manatee',
                    'particles' => [
                        // Migration! Small V formations of flamingos.
                        ['e' => '🦩', 'f' => 'v', 'fc' => '#F783AC', 'b' => 'vee', 'face' => 'L', 'w' => 2],
                        ['e' => '🧳', 'f' => '🧺', 'b' => 'fall'],
                        ['e' => '😎', 'b' => 'fall'],
                        ['e' => '🍊', 'b' => 'fall', 'w' => 2],
                        ['c' => 'plate', 'states' => ['NY', 'OH', 'MI'], 'b' => 'fall'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#4DABF7', '#A5D8FF'],
                    'glyphs' => ['🕊', '🍊', '~', 'ﾂ', '0'],
                ],
            ],

            // MLK Day — gentle, minimal, dignified. Egg disabled.
            'mlk' => [
                'ambient' => [
                    'particles' => [
                        ['e' => '🕊️', 'f' => '♡', 'fc' => '#B8860B', 'b' => 'fly', 'face' => 'L', 'slow' => 1, 'w' => 2],
                        ['e' => '🌿', 'b' => 'fall', 'slow' => 1],
                        ['e' => '🤍', 'f' => '♥', 'fc' => '#B8860B', 'b' => 'pulse'],
                    ],
                ],
                'egg' => false,
            ],

            'mardi_gras' => [
                'ambient' => [
                    'particles' => [
                        // Bead strings arc in from the top corners like
                        // parade throws.
                        ['s' => 'beads', 'b' => 'toss', 'w' => 3],
                        ['s' => 'doubloon', 'b' => 'tumble', 'glint' => 1, 'w' => 2],
                        ['e' => '⚜️', 'f' => '⚜', 'fc' => '#F1C40F', 'b' => 'fall'],
                        ['e' => '🎭', 'f' => '⚜', 'fc' => '#7C3AED', 'b' => 'fall'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#7C3AED', '#2F9E44', '#F1C40F'],
                    'glyphs' => ['⚜', '🎭', '*', 'ｻ', '0'],
                ],
            ],

            'valentines' => [
                'ambient' => [
                    'particles' => [
                        ['e' => '❤️', 'f' => '♥', 'fc' => '#FA5252', 'b' => 'pulse', 'w' => 2],
                        ['e' => '💗', 'f' => '♥', 'fc' => '#F783AC', 'b' => 'pulse', 'w' => 2],
                        ['e' => '💘', 'f' => '♥', 'fc' => '#E64980', 'b' => 'pulse'],
                        ['e' => '💌', 'f' => '♡', 'fc' => '#FA5252', 'b' => 'fall'],
                        ['e' => '🌹', 'b' => 'fall'],
                        // Couples' getaway: two hearts circling each other.
                        ['e' => '💕', 'f' => '♥', 'fc' => '#F06595', 'b' => 'orbit'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#F06595', '#FA5252'],
                    'glyphs' => ['♥', '♡', 'ﾒ', '1'],
                ],
            ],

            'presidents' => [
                'ambient' => [
                    'particles' => [
                        ['e' => '🎩', 'f' => '♦', 'fc' => '#343A40', 'b' => 'tumble', 'w' => 2],
                        ['e' => '🪶', 'f' => '~', 'fc' => '#868E96', 'b' => 'sway'],
                        ['c' => 'star', 'cl' => ['#B22234', '#F1F3F5', '#3C3B6E'], 'b' => 'fall', 'w' => 3],
                    ],
                ],
                'egg' => [
                    'colors' => ['#FF5252', '#F1F3F5', '#5C7CFA'],
                    'glyphs' => ['★', '✦', '0', '1'],
                ],
            ],

            'strawberry' => [
                'ambient' => [
                    'water'     => true,
                    'particles' => [
                        ['e' => '🍓', 'b' => 'tumble', 'w' => 3],
                        ['e' => '🌸', 'b' => 'sway', 'st' => 1, 'w' => 2],
                        ['e' => '🍃', 'b' => 'sway'],
                        ['e' => '🧺', 'b' => 'fall', 'w' => 1],
                    ],
                ],
                'egg' => [
                    'colors' => ['#E03131', '#2F9E44'],
                    'glyphs' => ['🍓', 'ｽ', 'ﾍ', '0'],
                ],
            ],

            // St. Patrick's — rare corner moment: a rainbow arc fades in
            // with a pot of gold at its end (rainbows don't fall).
            'st_patricks' => [
                'ambient' => [
                    'hero'      => 'rainbow',
                    'particles' => [
                        ['e' => '🍀', 'f' => '♣', 'fc' => '#2F9E44', 'b' => 'tumble', 'w' => 4],
                        ['s' => 'horseshoe', 'b' => 'fall'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#00FF41'],
                    'glyphs' => array_merge($katakana, ['☘', '☘', '☘']),
                ],
            ],

            'easter' => [
                'ambient' => [
                    'particles' => [
                        ['c' => 'egg', 'cl' => ['#F9A8D4', '#A7F3D0', '#BFDBFE', '#FDE68A', '#D8B4FE'], 'b' => 'tumble', 'w' => 4, 'sz' => [20, 30]],
                        ['e' => '🐰', 'b' => 'hop', 'face' => 'L'],
                        ['e' => '🐣', 'b' => 'waddle', 'face' => 'L'],
                        ['e' => '🌷', 'b' => 'grow', 'w' => 2],
                    ],
                ],
                // No '🥚' in the rain — it renders as a plain chicken egg.
                'egg' => [
                    'colors' => ['#F9A8D4', '#A7F3D0', '#BFDBFE', '#FDE68A'],
                    'glyphs' => ['🐣', '🐰', '✿', 'ｵ', '0'],
                ],
            ],

            // April Fool's — everything falls UPWARD, egg glitches.
            'april_fools' => [
                'ambient' => [
                    'up'        => true,
                    'particles' => [
                        ['e' => '🙃', 'f' => '¿', 'b' => 'fall', 'w' => 2],
                        ['e' => '😂', 'f' => '!', 'b' => 'fall'],
                        ['e' => '🍌', 'b' => 'tumble', 'w' => 2],
                        ['s' => 'jester', 'b' => 'fall'],
                        ['s' => 'teeth', 'b' => 'chatter'],
                    ],
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
                    'water'     => true,
                    'hero'      => 'ducks',
                    'particles' => [
                        ['e' => '🪷', 'f' => '🌸', 'b' => 'float', 'w' => 2],
                        ['s' => 'dragonfly', 'b' => 'dart'],
                        ['e' => '🌸', 'b' => 'sway', 'st' => 1, 'w' => 2],
                        // Canoes belong ON the water, facing their travel.
                        ['e' => '🛶', 'f' => '⛵', 'b' => 'cruise', 'face' => 'L'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#37B24D', '#339AF0'],
                    'glyphs' => ['🌸', '🐟', '~', 'ﾊ', '1'],
                ],
            ],

            'four_twenty' => [
                'ambient' => [
                    'particles' => [
                        ['s' => 'cannabis', 'b' => 'sway', 'w' => 3],
                        ['e' => '💨', 'f' => '~', 'fc' => '#ADB5BD', 'b' => 'rise', 'w' => 2],
                        ['e' => '✌️', 'f' => 'V', 'fc' => '#2F9E44', 'b' => 'fall'],
                        ['e' => '🧁', 'b' => 'fall'],
                        ['e' => '🌮', 'b' => 'fall'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#2F9E44'],
                    'glyphs' => ['🍃', 'ﾊ', 'ﾒ', '0', '1'],
                ],
            ],

            'earth_day' => [
                'ambient' => [
                    'particles' => [
                        ['e' => '🌱', 'b' => 'grow', 'w' => 2],
                        ['e' => '🌎', 'b' => 'pulse'],
                        ['e' => '♻️', 'f' => '♺', 'fc' => '#2F9E44', 'b' => 'spin'],
                        ['e' => '🌳', 'b' => 'grow'],
                    ],
                ],
                'egg' => [
                    'colors' => ['#2F9E44', '#339AF0'],
                    'glyphs' => ['🌎', '💧', '🍃', 'ﾂ', '0'],
                ],
            ],

            // Fallback for dates outside every range: no themed particles —
            // but the great blue heron (the DCC logo bird) still glides by
            // every couple of minutes, year-round. Egg = classic green rain.
            'classic' => [
                'ambient' => ['particles' => []],
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
            'patriot_day'  => __('Patriot Day (gentle)', 'dcc-seasons'),
            'fall_fishing' => __('Fall Fishing', 'dcc-seasons'),
            'halloween'    => __('Halloween', 'dcc-seasons'),
            'thanksgiving' => __('Thanksgiving', 'dcc-seasons'),
            'christmas'    => __('Christmas', 'dcc-seasons'),
            'new_years'    => __('New Year\'s (fireworks)', 'dcc-seasons'),
            'snowbird'     => __('Snowbird Season', 'dcc-seasons'),
            'mlk'          => __('MLK Day (gentle)', 'dcc-seasons'),
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
            'classic'      => __('None (heron + classic green egg only)', 'dcc-seasons'),
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
