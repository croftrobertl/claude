<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * This plugin's page under the shared "DCC" admin menu.
 *
 * THE PARENT IS NOT OURS. As of 2026-09-25 a site-side mu-plugin, dcc-menu.php,
 * OWNS the `dcc` parent: it registers it and removes WordPress's mirrored first
 * submenu item. 0.44.0 registered the parent itself (guarded) and cleaned up at
 * 999, which was right when four plugins each had to be able to create it and is
 * wrong now — two owners is the duplicate-parent problem, not the fix for it.
 * Both were removed in 0.45.0. Do not add them back.
 *
 * SUBMENU ORDER IS admin_menu HOOK PRIORITY. Live register, 2026-09-25:
 *
 *     20  Contact Form
 *     30  Guest Guide
 *     35  Features & Amenities
 *     40  Seasons
 *     45  COTTAGE SELECTOR  <- this plugin
 *     50  Custom Checkout
 *     55  Availability Calendar
 *     63  Wildlife
 *
 * Never renumber or remove another plugin's entry.
 */

namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

final class Menu
{
    /** Canonical parent menu slug — owned by the dcc-menu.php mu-plugin. */
    public const PARENT = 'dcc';

    /** This plugin's settings page slug. */
    public const SLUG = 'dcc-cottage-selector';

    /** admin_menu priority this plugin's submenu registers at. */
    public const PRIORITY = 45;

    /** Capability for both rendering AND saving. */
    public const CAP = 'manage_options';

    public static function init(): void
    {
        add_action('admin_menu', [self::class, 'register_page'], self::PRIORITY);
    }

    public static function register_page(): void
    {
        // If the mu-plugin is ever absent the parent will not exist, and
        // add_submenu_page() on a missing parent returns false — the settings page
        // would simply be unreachable, with nothing on screen to say why. The
        // fallback costs one branch and keeps the page findable under Settings.
        // It is NOT a second parent registration: it only fires when there is no
        // parent to attach to.
        $parent_exists = isset($GLOBALS['admin_page_hooks'][self::PARENT]);

        $hook = $parent_exists
            ? add_submenu_page(
                self::PARENT,
                __('Cottage Selector', 'dcc-cottage-selector'),
                __('Cottage Selector', 'dcc-cottage-selector'),
                self::CAP,
                self::SLUG,
                ['\\DCCS\\Settings_Page', 'render']
            )
            : add_options_page(
                __('DCC Cottage Selector', 'dcc-cottage-selector'),
                __('DCC Cottage Selector', 'dcc-cottage-selector'),
                self::CAP,
                self::SLUG,
                ['\\DCCS\\Settings_Page', 'render']
            );

        Settings_Page::$hook = is_string($hook) ? $hook : '';
    }
}
