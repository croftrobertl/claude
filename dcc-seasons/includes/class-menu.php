<?php
/**
 * The shared "DCC" top-level admin menu.
 *
 * Every Dora Canal Court plugin with a settings screen hangs it off ONE
 * top-level menu so the owner isn't hunting through Settings, Tools and two
 * plugin-specific top-level menus. The canonical values below (slug `dcc`,
 * capability, icon, position) are identical in every DCC plugin — a divergent
 * slug silently produces a SECOND "DCC" menu, so don't "improve" them here.
 *
 * Registration is idempotent and order-independent: any of the sibling
 * plugins may be deactivated at any time, so each one creates the parent only
 * if it isn't there yet, and each removes the auto-generated duplicate first
 * item (guarded — harmless if a sibling already did).
 *
 * Submenu order is by admin_menu hook priority, so it's deterministic no
 * matter which plugins are active. DCC Seasons registers at 40.
 * Reserved: 10 and 60 belong to site-side mu-plugins.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

if (!defined('ABSPATH')) {
    exit;
}

class Menu {

    /** Canonical parent menu slug — shared by every DCC plugin. */
    public const PARENT = 'dcc';

    /** admin_menu priority this plugin's submenu registers at. */
    public const PRIORITY = 40;

    public static function init(): void {
        add_action('admin_menu', [self::class, 'register_parent'], 5);
        add_action('admin_menu', [self::class, 'remove_duplicate'], 999);
    }

    /**
     * Create the shared parent only if no sibling plugin already did.
     */
    public static function register_parent(): void {
        global $admin_page_hooks;

        if (!isset($admin_page_hooks[self::PARENT])) {
            add_menu_page(
                __('Dora Canal Court', 'dcc-seasons'),
                __('DCC', 'dcc-seasons'),
                'manage_options',
                self::PARENT,
                '',                    // No page of its own; the first submenu becomes the landing page.
                'dashicons-palmtree',
                58
            );
        }
    }

    /**
     * WordPress mirrors the parent label as a first submenu item; drop it.
     */
    public static function remove_duplicate(): void {
        remove_submenu_page(self::PARENT, self::PARENT);
    }
}
