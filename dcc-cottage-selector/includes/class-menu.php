<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The shared "DCC" top-level admin menu.
 *
 * THIS IS A COPY OF AN EXISTING IDIOM, NOT A NEW ONE. Every Dora Canal Court
 * plugin with a settings screen hangs it off ONE top-level menu, and the
 * canonical values below (slug `dcc`, capability, icon, position 58) are
 * identical in every DCC plugin — a divergent slug silently produces a SECOND
 * "DCC" menu. Do not "improve" them here; if they need to change they change in
 * every plugin at once.
 *
 * Registration is idempotent and order-independent: any sibling may be
 * deactivated at any time, so each plugin creates the parent only if it is not
 * there yet, and removes the auto-generated duplicate first item (guarded —
 * harmless if a sibling already did it).
 *
 * SUBMENU ORDER IS BY admin_menu HOOK PRIORITY. Read from the sibling plugins'
 * source on 2026-09-24, not from notes:
 *
 *     10  reserved, site-side mu-plugin   (per DCC Seasons' note)
 *     20  DCC Contact Form
 *     40  DCC Seasons
 *     45  DCC COTTAGE SELECTOR  <- this plugin
 *     50  DCC Custom Checkout
 *     60  reserved, site-side mu-plugin   (per DCC Seasons' note)
 *     63  DCC Wildlife
 *
 * 45 was free at the time of writing and puts this page between Seasons and
 * Checkout. If a collision ever appears, change PRIORITY here — never renumber
 * or remove another plugin's entry.
 */
final class Menu
{
    /** Canonical parent menu slug — shared by every DCC plugin. */
    public const PARENT = 'dcc';

    /** This plugin's settings page slug. */
    public const SLUG = 'dcc-cottage-selector';

    /** admin_menu priority this plugin's submenu registers at. */
    public const PRIORITY = 45;

    /** Capability for both rendering AND saving. */
    public const CAP = 'manage_options';

    public static function init(): void
    {
        add_action('admin_menu', [self::class, 'register_parent'], 5);
        add_action('admin_menu', [self::class, 'register_page'], self::PRIORITY);
        add_action('admin_menu', [self::class, 'remove_duplicate'], 999);
    }

    /** Create the shared parent only if no sibling plugin already did. */
    public static function register_parent(): void
    {
        global $admin_page_hooks;

        if (!isset($admin_page_hooks[self::PARENT])) {
            add_menu_page(
                __('Dora Canal Court', 'dcc-cottage-selector'),
                __('DCC', 'dcc-cottage-selector'),
                self::CAP,
                self::PARENT,
                '',                    // No page of its own; the first submenu lands.
                'dashicons-palmtree',
                58
            );
        }
    }

    public static function register_page(): void
    {
        // If every parent-registering sibling is deactivated the parent will not
        // exist; fall back to Settings rather than losing the page entirely. This
        // mirrors what DCC Wildlife does.
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

    /** WordPress mirrors the parent label as a first submenu item; drop it. */
    public static function remove_duplicate(): void
    {
        remove_submenu_page(self::PARENT, self::PARENT);
    }
}
