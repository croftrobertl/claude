<?php
/**
 * The Theme guide tab on the Seasons settings page (4.4.0).
 *
 * One card per theme, catalogue style, generated at RUNTIME from the same
 * theme config the front end receives (Themes::themes()), the saved
 * settings and the engine itself: the admin page loads engine.js and reads
 * DCCSeasonsEngine.guide — its sprites, accents, scene lists, timing and
 * phone-scaling rules — so the guide cannot drift from what plays. Nothing
 * here lists themes or effects by hand; the only hand-written table is
 * names(), the plain-English (translatable) name of each drawing, and
 * tools/test-guide.js fails if anything shown lacks one.
 *
 * Assets load only on this tab (Settings::assets()), never on the front end.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

defined('ABSPATH') || exit;

final class Theme_Guide {

    public const TAB = 'guide';

    /** Is the Theme guide the tab being viewed? */
    public static function is_tab(): bool {
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        return isset($_GET['tab']) && sanitize_key(wp_unslash($_GET['tab'])) === self::TAB;
    }

    /** Settings | Theme guide tabs. */
    public static function tabs(): void {
        $base  = admin_url('admin.php?page=' . Settings::SLUG);
        $guide = self::is_tab();
        echo '<nav class="nav-tab-wrapper dcc-seasons-tabs" aria-label="' . esc_attr__('Seasons sections', 'dcc-seasons') . '">';
        echo '<a href="' . esc_url($base) . '" class="nav-tab' . ($guide ? '' : ' nav-tab-active') . '"' . ($guide ? '' : ' aria-current="page"') . '>' . esc_html__('Settings', 'dcc-seasons') . '</a>';
        echo '<a href="' . esc_url(add_query_arg('tab', self::TAB, $base)) . '" class="nav-tab' . ($guide ? ' nav-tab-active' : '') . '"' . ($guide ? ' aria-current="page"' : '') . '>' . esc_html__('Theme guide', 'dcc-seasons') . '</a>';
        echo '</nav>';
    }

    /** The guide's scripts and styles; called by Settings::assets() on this tab only. */
    public static function enqueue(): void {
        wp_enqueue_style('dcc-seasons-guide', DCC_SEASONS_URL . 'assets/css/theme-guide.css', [], DCC_SEASONS_VERSION);
        wp_enqueue_script('dcc-seasons-engine', DCC_SEASONS_URL . 'assets/js/engine' . Plugin::suffix() . '.js', [], DCC_SEASONS_VERSION, true);
        wp_enqueue_script('dcc-seasons-guide', DCC_SEASONS_URL . 'assets/js/theme-guide.js', ['dcc-seasons-engine'], DCC_SEASONS_VERSION, true);
        wp_add_inline_script('dcc-seasons-guide', 'window.DCCSeasonsGuideData = ' . wp_json_encode(self::payload()) . ';', 'before');
    }

    /** The tab's markup: a container the script fills. */
    public static function render(): void {
        echo '<div id="dcc-seasons-guide" class="dcc-guide" aria-live="polite"><p class="description">' .
            esc_html__('Loading the theme guide…', 'dcc-seasons') . '</p></div>';
        echo '<noscript><p>' . esc_html__('The theme guide draws each theme with the effects engine, which needs JavaScript.', 'dcc-seasons') . '</p></noscript>';
    }

    /** A theme's preview URL (works for logged-in administrators only). */
    public static function preview_url(string $key): string {
        return home_url('/?dcc_season=' . rawurlencode($key));
    }

    /**
     * Everything the cards are built from, read at request time.
     */
    public static function payload(): array {
        $opt    = Settings::options();
        $labels = Themes::labels();
        $year   = (int) current_time('Y');
        $rows   = Themes::schedule((array) $opt['schedule']);

        /* Walk the year through the REAL resolver (Rob's four calendar
         * rules), so each card's dates are the days that theme actually
         * plays — not its row's raw range. */
        $runs = [];
        $prev = null;
        for ($ts = gmmktime(12, 0, 0, 1, 1, $year); (int) gmdate('Y', $ts) === $year; $ts += 86400) {
            $d   = gmdate('Y-m-d', $ts);
            $row = Schedule::active($rows, $d);
            $t   = $row ? (string) $row['theme'] : '';
            if ($t !== '' && $t === $prev) {
                $runs[$t][count($runs[$t]) - 1][1] = $d;
            } elseif ($t !== '') {
                $runs[$t][] = [$d, $d];
            }
            $prev = $t;
        }

        $map     = array_merge(Themes::subtle_defaults(), Settings::subtle_map($opt));
        $effects = Settings::subtle_effects();

        return [
            'year'     => $year,
            'themes'   => Themes::themes(),
            'labels'   => $labels,
            'runs'     => $runs,
            'preview'  => array_combine(array_keys($labels), array_map([self::class, 'preview_url'], array_keys($labels))),
            'subtle'   => array_map(static function ($k) use ($effects) {
                return ['key' => (string) $k, 'name' => ($k !== '' && isset($effects[$k])) ? (string) $effects[$k] : ''];
            }, $map),
            'heroEvery' => Plugin::HERO_EVERY,
            'settings' => [
                'enabled'   => !empty($opt['enabled']),
                'ambient'   => !empty($opt['ambient']),
                'egg'       => !empty($opt['egg']),
                'subtle'    => !empty($opt['subtle']),
                'subtleIntensity' => (float) ($opt['subtle_intensity'] ?? 0.6),
                'richness'  => (string) $opt['richness'],
                'vignettes' => !empty($opt['fx_vignettes']),
                'evening'   => !empty($opt['fx_evening']),
                'density'   => (int) $opt['density'],
            ],
            'names'    => self::names(),
            'i18n'     => self::strings($opt),
        ];
    }

    /** UI strings the script needs, translatable. */
    private static function strings(array $opt): array {
        return [
            'notScheduled' => __('Not scheduled', 'dcc-seasons'),
            'preview'      => __('Preview this theme', 'dcc-seasons'),
            'newTab'       => __('(opens in a new tab)', 'dcc-seasons'),
            'off'          => __('Switched off in Settings', 'dcc-seasons'),
            'sprites'      => __('Falling and drifting', 'dcc-seasons'),
            'boatsBirds'   => __('Boats and birds', 'dcc-seasons'),
            'desktop'      => __('desktop', 'dcc-seasons'),
            'phone'        => __('phone', 'dcc-seasons'),
            /* translators: 1: number on a 1280px screen, 2: number on a 390px phone */
            'onScreen'     => __('%1$s on screen at 1280px · %2$s on a 390px phone', 'dcc-seasons'),
            'lessThanOne'  => __('under 1', 'dcc-seasons'),
            'subtle'       => __('Background layer', 'dcc-seasons'),
            'accent'       => __('Corner accent', 'dcc-seasons'),
            'accentNote'   => __('Fixed in a corner of the screen.', 'dcc-seasons'),
            'scenes'       => __('Scenes', 'dcc-seasons'),
            /* translators: 1: first delay range in seconds, 2: repeat range in seconds */
            'sceneTiming'  => __('First scene %1$s s after the page opens, then one every %2$s s, one at a time, never while a hero crosses.', 'dcc-seasons'),
            'oneOf'        => __('One of these plays each time, picked at random.', 'dcc-seasons'),
            'evenings'     => __('Evenings only', 'dcc-seasons'),
            'hero'         => __('Hero', 'dcc-seasons'),
            /* translators: 1: first-hero delay range in seconds, 2: repeat range in seconds */
            'heroTiming'   => __('Crosses the screen about %1$s s into the first page of a visit, then every %2$s s (on later pages the first one waits %2$s s). Each crossing picks one of these at random.', 'dcc-seasons'),
            'egg'          => __('Matrix egg', 'dcc-seasons'),
            /* From the SETTINGS (Settings::egg_howto), never hard-coded: the
             * target and the count are Rob's and can change. */
            /* translators: %s: how to open the egg, e.g. "Tap the title in the homepage banner 4 times" */
            'eggNote'      => sprintf(__('%s: the Matrix rain falls in these colours and characters, then this finale. Pages without that target have no egg.', 'dcc-seasons'), Settings::egg_howto($opt)),
            'special'      => __('Special', 'dcc-seasons'),
            /* translators: 1: sprite name, 2: accent name, 3: seconds */
            'turns'        => __('%1$s and the %2$s take turns: %3$s s each, the accent first, cross-fading. Never both on screen.', 'dcc-seasons'),
            /* translators: %d: minimum number of sprites */
            'phoneMin'     => __('On a phone it never shows fewer than %d sprites.', 'dcc-seasons'),
            'countdown'    => __('At 11:59:50 pm on 31 December, a 10-second countdown to midnight takes over the screen.', 'dcc-seasons'),
            'spritesOff'   => __('“Falling and drifting sprites” is off in Settings, so those lines (and the boats and birds, and anything that needs a sprite) are tagged below. The background layer, corner accents, scenes, heroes and the Matrix egg still play.', 'dcc-seasons'),
            'masterOff'    => __('DCC Seasons is switched off in Settings (Master enable), so guests see none of this.', 'dcc-seasons'),
            /* translators: %d: year */
            'datesIn'      => __('Dates in %d', 'dcc-seasons'),
            'intro'        => __('Every theme, in the order the year plays them, with everything a guest can see in it. Built from the plugin itself each time this page loads, so it always matches what plays.', 'dcc-seasons'),
            'loadError'    => __('The effects engine did not load, so the guide cannot be drawn. Reload the page; if it persists, check that engine.min.js is present in the plugin folder.', 'dcc-seasons'),
        ];
    }

    /**
     * Plain-English names for every drawing the guide shows, keyed the way
     * the engine keys them: sprites by SVGS key, heroes by kind, scenes by
     * scene name. Translatable. tools/test-guide.js fails on a missing one.
     */
    public static function names(): array {
        return [
            'sprites' => [
                'acorn' => __('Acorn', 'dcc-seasons'), 'balloon' => __('Balloon', 'dcc-seasons'),
                'banana' => __('Banana', 'dcc-seasons'), 'bass' => __('Largemouth bass', 'dcc-seasons'),
                'bat' => __('Bat', 'dcc-seasons'), 'beads' => __('Mardi Gras beads', 'dcc-seasons'),
                'berry' => __('Strawberry', 'dcc-seasons'), 'blossom' => __('Strawberry blossom', 'dcc-seasons'),
                'bobber' => __('Fishing bobber', 'dcc-seasons'), 'bunny' => __('Bunny', 'dcc-seasons'),
                'burger' => __('Burger', 'dcc-seasons'), 'candycorn' => __('Candy corn', 'dcc-seasons'),
                'cannabis' => __('Cannabis leaf', 'dcc-seasons'), 'cherry' => __('Cherry blossom', 'dcc-seasons'),
                'chick' => __('Chick', 'dcc-seasons'), 'clover' => __('Four-leaf clover', 'dcc-seasons'),
                'cooler' => __('Cooler', 'dcc-seasons'), 'disguise' => __('Groucho glasses', 'dcc-seasons'),
                'doubloon' => __('Doubloon', 'dcc-seasons'), 'dove' => __('Dove', 'dcc-seasons'),
                'dragonfly' => __('Dragonfly', 'dcc-seasons'), 'flagcloth' => __('American flag', 'dcc-seasons'),
                'flamingo' => __('Flamingo', 'dcc-seasons'), 'fleur' => __('Fleur-de-lis', 'dcc-seasons'),
                'flipflop' => __('Flip-flop', 'dcc-seasons'), 'flutes' => __('Champagne flutes', 'dcc-seasons'),
                'ghost' => __('Ghost', 'dcc-seasons'), 'gift' => __('Gift', 'dcc-seasons'),
                'globe' => __('Globe', 'dcc-seasons'), 'grill' => __('Grill', 'dcc-seasons'),
                'hibiscus' => __('Hibiscus', 'dcc-seasons'), 'holly' => __('Holly', 'dcc-seasons'),
                'hook' => __('Fish hook', 'dcc-seasons'), 'horseshoe' => __('Horseshoe', 'dcc-seasons'),
                'ibis' => __('White ibis', 'dcc-seasons'), 'icecream' => __('Ice cream cone', 'dcc-seasons'),
                'jack1' => __('Jack-o’-lantern', 'dcc-seasons'), 'jack2' => __('Jack-o’-lantern', 'dcc-seasons'),
                'jack3' => __('Jack-o’-lantern', 'dcc-seasons'), 'jester' => __('Jester hat', 'dcc-seasons'),
                'joint' => __('Joint', 'dcc-seasons'), 'jonboat' => __('Jon boat', 'dcc-seasons'),
                'kayak' => __('Kayak', 'dcc-seasons'), 'ladybug' => __('Ladybug', 'dcc-seasons'),
                'letter0' => __('Love letter', 'dcc-seasons'), 'lilypad' => __('Lily pad', 'dcc-seasons'),
                'mask' => __('Carnival mask', 'dcc-seasons'), 'medal' => __('Medal', 'dcc-seasons'),
                'necktie' => __('Necktie', 'dcc-seasons'), 'olive' => __('Olive branch', 'dcc-seasons'),
                'orange' => __('Orange', 'dcc-seasons'), 'ornament' => __('Ornament', 'dcc-seasons'),
                'peace' => __('Peace sign', 'dcc-seasons'), 'peacehand' => __('Peace hand', 'dcc-seasons'),
                'petal' => __('Petal', 'dcc-seasons'), 'pie' => __('Pie', 'dcc-seasons'),
                'pine' => __('Pine tree', 'dcc-seasons'), 'platemi' => __('Michigan licence plate', 'dcc-seasons'),
                'plateny' => __('New York licence plate', 'dcc-seasons'), 'plateoh' => __('Ohio licence plate', 'dcc-seasons'),
                'pontoon' => __('Pontoon boat', 'dcc-seasons'), 'poppy' => __('Poppy', 'dcc-seasons'),
                'quill' => __('Quill', 'dcc-seasons'), 'recycle' => __('Recycling symbol', 'dcc-seasons'),
                'ribbon' => __('Ribbon', 'dcc-seasons'), 'sabalpalm' => __('Sabal palm', 'dcc-seasons'),
                'sparkle' => __('Sparkle', 'dcc-seasons'), 'sparkler' => __('Sparkler', 'dcc-seasons'),
                'spider' => __('Spider', 'dcc-seasons'), 'sprout' => __('Sprout', 'dcc-seasons'),
                'suitcase' => __('Suitcase', 'dcc-seasons'), 'tacklebox' => __('Tackle box', 'dcc-seasons'),
                'tophat' => __('Top hat', 'dcc-seasons'), 'tree' => __('Tree', 'dcc-seasons'),
                'tulip' => __('Tulip', 'dcc-seasons'), 'turkey' => __('Turkey', 'dcc-seasons'),
                'umbrella' => __('Beach umbrella', 'dcc-seasons'), 'van' => __('Hippie van', 'dcc-seasons'),
                'watermelon' => __('Watermelon', 'dcc-seasons'), 'witchhat' => __('Witch’s hat', 'dcc-seasons'),
                // corner accents
                'web' => __('Spider web', 'dcc-seasons'), 'cornucopia' => __('Cornucopia', 'dcc-seasons'),
                'sunshades' => __('Sun in sunglasses', 'dcc-seasons'), 'hands' => __('Hands holding the Earth', 'dcc-seasons'),
                'sun' => __('Sun', 'dcc-seasons'),
            ],
            'prims' => [
                'star' => __('Star', 'dcc-seasons'), 'confetti' => __('Confetti', 'dcc-seasons'),
                'bubble' => __('Champagne bubble', 'dcc-seasons'), 'egg' => __('Easter egg', 'dcc-seasons'),
                'heart' => __('Heart', 'dcc-seasons'), 'tulip' => __('Tulip', 'dcc-seasons'),
            ],
            'heroes' => [
                'heron' => __('Great blue heron', 'dcc-seasons'), 'eagle' => __('Bald eagle', 'dcc-seasons'),
                'osprey' => __('Osprey carrying a fish', 'dcc-seasons'), 'witch' => __('Witch and her cat', 'dcc-seasons'),
                'bass' => __('Jumping largemouth bass', 'dcc-seasons'), 'sleigh' => __('Santa’s sleigh', 'dcc-seasons'),
                'manatee' => __('Manatee', 'dcc-seasons'), 'rainbow' => __('Rainbow and pot of gold', 'dcc-seasons'),
            ],
            'scenes' => [
                'flotilla' => __('A pontoon flotilla cruises by', 'dcc-seasons'),
                'fullcast' => __('A full cast: lure, bobber, and a bass on the line', 'dcc-seasons'),
                'dragonlands' => __('A dragonfly lands', 'dcc-seasons'),
                'dragonlotus' => __('A dragonfly lands on a lily pad', 'dcc-seasons'),
                'witchmoon' => __('The witch crosses the moon', 'dcc-seasons'),
                'gatorglide' => __('A gator glides by and sinks', 'dcc-seasons'),
                'floatdrift' => __('A flamingo pool float drifts by with a lost flip-flop', 'dcc-seasons'),
                'mulletskip' => __('A mullet skips three times, another answers', 'dcc-seasons'),
                'hibfloat' => __('A hibiscus bloom drops, floats, and a fish nibbles it', 'dcc-seasons'),
                'anhinga' => __('An anhinga dries its wings on a snag', 'dcc-seasons'),
                'ospreycatch' => __('An osprey dives and catches a fish', 'dcc-seasons'),
                'cranes' => __('A sandhill crane pair dances', 'dcc-seasons'),
                'limpkinsnail' => __('A limpkin pulls up an apple snail', 'dcc-seasons'),
                'giftdrop' => __('The sleigh drops a gift onto the water', 'dcc-seasons'),
                'sleighmoon' => __('The sleigh crosses the moon', 'dcc-seasons'),
                'corkpop' => __('A champagne cork pops', 'dcc-seasons'),
                'arrival' => __('Three flamingos fly in and land', 'dcc-seasons'),
                'flagfly' => __('Flags fly across', 'dcc-seasons'),
                'doveflight' => __('Doves fly across', 'dcc-seasons'),
                'stilts' => __('A stilt walker crosses', 'dcc-seasons'),
                'kayaker' => __('A kayaker paddles by', 'dcc-seasons'),
                'doubloons' => __('Doubloons are tossed', 'dcc-seasons'),
                'swans' => __('Two swans meet', 'dcc-seasons'),
                'catch1' => __('Strawberries fall into a basket', 'dcc-seasons'),
                'egghunt' => __('A bunny hunts for eggs', 'dcc-seasons'),
                'hatch' => __('An egg hatches a chick', 'dcc-seasons'),
                'bananaslip' => __('A jester slips on a banana peel', 'dcc-seasons'),
                'duckparade' => __('A mother duck leads her ducklings', 'dcc-seasons'),
            ],
        ];
    }
}
