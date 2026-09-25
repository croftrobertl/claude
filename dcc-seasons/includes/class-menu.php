<?php
/**
 * The shared "DCC" top-level admin menu — CONSTANTS ONLY.
 *
 * This plugin does NOT create the parent menu and does NOT clean up after
 * it. Since 2026-09-25 the site-side mu-plugin `dcc-menu.php` owns it
 * outright: it registers the parent at priority 5 and removes WordPress's
 * mirrored duplicate first item at 999.
 *
 * Why a single owner is better than what was here before: every DCC plugin
 * used to create the parent "only if it isn't there yet" and each ran its
 * own `remove_submenu_page()` cleanup. That is idempotent, but it means the
 * parent's label, icon, capability and position come from whichever plugin
 * happened to load first — so changing the icon meant editing every plugin,
 * and a plugin that drifted produced a second "DCC" menu with no obvious
 * culprit. One owner, one definition.
 *
 * What this plugin still does: hangs its own submenu off the shared parent
 * at `Menu::PRIORITY`. Submenu order is by admin_menu hook priority, so it
 * is deterministic regardless of which siblings are active.
 *
 * THE LIVE REGISTER (authoritative copy lives in dcc-menu.php's header;
 * keep the two in step):
 *
 *     20  contact-form
 *     30  guest-guide
 *     35  features-amenities
 *     40  seasons              <- this plugin
 *     45  cottage-selector
 *     50  custom-checkout
 *     55  availability-calendar
 *     63  wildlife
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

    /**
     * Nothing to do at boot any more.
     *
     * Kept as a no-op rather than deleted so a sibling plugin or a snippet
     * that still calls Menu::init() does not fatal on an upgrade. The
     * submenu itself is registered by Settings::init(), which hooks
     * add_submenu_page() at self::PRIORITY.
     */
    public static function init(): void {
        // Intentionally empty: dcc-menu.php owns the parent menu.
    }
}
