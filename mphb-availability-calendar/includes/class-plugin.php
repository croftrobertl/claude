<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Plugin
{
    private static ?Plugin $instance = null;

    private bool $booted = false;

    public static function instance(): self
    {
        return self::$instance ??= new self();
    }

    public function boot(): void
    {
        if ($this->booted) {
            return;
        }
        $this->booted = true;

        add_action('init', [$this, 'load_textdomain']);

        // THE SETTINGS SCREEN IS REGISTERED BEFORE THE DEPENDENCY GATE.
        // Everything else here needs Elementor and MotoPress; the settings do
        // not, and an admin whose Elementor licence lapsed should still be
        // able to see — and keep — their stored values rather than find the
        // page gone and assume the settings went with it.
        if (is_admin()) {
            Admin::register();
        }

        if (!$this->dependencies_present()) {
            add_action('admin_notices', [$this, 'render_missing_deps_notice']);
            return;
        }

        add_action('elementor/elements/categories_registered', [$this, 'register_category']);
        add_action('elementor/widgets/register', [$this, 'register_widget']);
        add_action('wp_enqueue_scripts', ['\\MPHBAC\\Widget', 'register_assets']);
        // The grid is client-rendered, so the script MUST run inside the
        // Elementor editor preview iframe — get_script_depends() alone isn't
        // reliable there, so force-enqueue it on the preview hook.
        add_action('elementor/preview/enqueue_scripts', ['\\MPHBAC\\Widget', 'enqueue_for_preview']);

        // Keep our client-render script + stylesheet out of aggressive
        // JS/CSS combine+defer optimizers (SpeedyCache Pro, etc.). widget.js
        // draws the grid on load; if it's folded into a combined bundle that a
        // sibling script breaks — or a stale/deferred bundle that never runs in
        // the Elementor editor preview — the gray loading skeleton is never
        // replaced. Tagging our assets with the opt-out attributes optimizers
        // honor keeps them as their own reliably-executed files.
        // Settable since 0.40.0, still ON by default. Turning it off is only
        // correct on a site with no combine/defer optimiser left to opt out
        // of; the settings screen says so next to the switch.
        if (Settings::get('keep_assets_unoptimized')) {
            add_filter('script_loader_tag', ['\\MPHBAC\\Widget', 'keep_script_unoptimized'], 10, 2);
            add_filter('style_loader_tag', ['\\MPHBAC\\Widget', 'keep_style_unoptimized'], 10, 2);
        }

        add_action('wp_ajax_' . MPHBAC_AJAX_ACTION, ['\\MPHBAC\\Ajax', 'handle']);
        add_action('wp_ajax_nopriv_' . MPHBAC_AJAX_ACTION, ['\\MPHBAC\\Ajax', 'handle']);
        // Booking-sheet price estimate. Same public/nonce-free trust model as
        // the availability endpoint (documented invariant) — read-only data,
        // hardened input validation inside the handler.
        add_action('wp_ajax_' . MPHBAC_PRICE_ACTION, ['\\MPHBAC\\Ajax', 'handle_price']);
        add_action('wp_ajax_nopriv_' . MPHBAC_PRICE_ACTION, ['\\MPHBAC\\Ajax', 'handle_price']);
        // Cottage info panel, fetched on first open when the lazy setting is
        // on. Registered unconditionally: a page cached while the setting was
        // on must still be able to fetch its panels after it is switched off.
        add_action('wp_ajax_' . MPHBAC_INFO_ACTION, ['\\MPHBAC\\Ajax', 'handle_info']);
        add_action('wp_ajax_nopriv_' . MPHBAC_INFO_ACTION, ['\\MPHBAC\\Ajax', 'handle_info']);

        // Staff booking calendar (/staff/). Every endpoint below re-verifies
        // authorization server-side on each request — see Staff::is_authorized().
        Staff::register();
        Staff_Widget::register();

        // Request-time SpeedyCache exclusion — belt-and-braces alongside the
        // option-write done at activation, and self-heals if SpeedyCache's
        // settings are ever reset without a plugin reactivation.
        Cache_Integration::register_runtime_filter();

        // BOOKING CHANGES THAT MUST FLUSH THE AVAILABILITY CACHE (0.43.0).
        // Until 0.43.0 this block hooked mphb_after_sync_ical,
        // mphb_ical_sync_finished and mphb_after_create_booking — "a best
        // guess", the comment said. Verified on live against MotoPress 6.3.0
        // by the Website Director: NONE of the three exists, so an imported
        // booking never flushed the public calendar, which could show
        // availability up to one cache TTL (15 min) old. Checkout re-checks,
        // so it could not double-book, but it was wrong. 6.3.0's iCal code
        // fires exactly these, and the sync rewrites dates with
        // update_post_meta and deletes with wp_delete_post — neither of which
        // fires save_post — so each needs its own hook:
        add_action('mphb_create_booking_via_ical', ['\\MPHBAC\\Cache', 'flush_all']);
        add_action('mphb_update_booking_via_ical', ['\\MPHBAC\\Cache', 'flush_all']);
        add_action('deleted_post', ['\\MPHBAC\\Cache', 'flush_if_booking'], 10, 2);
        // A booking created at checkout or edited in WP-Admin — including
        // trashed and restored, which go through wp_update_post — is a save.
        add_action('save_post_mphb_booking', ['\\MPHBAC\\Cache', 'flush_all']);
        // The cottage info FRAGMENTS are cached too (0.42.1), and they change
        // when their template or accommodation is edited, not when a booking
        // lands. flush_all() is O(1) — it bumps a generation counter — so
        // reusing it here costs nothing and cannot leave a stale fragment
        // behind. Saving a template is rare; a stale panel would not be.
        add_action('save_post_elementor_library', ['\\MPHBAC\\Cache', 'flush_all']);
        add_action('save_post_mphb_room_type', ['\\MPHBAC\\Cache', 'flush_all']);
        // Elementor's editor saves through its own AJAX, and whether that
        // fires save_post could not be confirmed from source (0.42.3, A4).
        // after_save fires on every editor save, of any document — so any
        // Elementor save now flushes this plugin's caches. That is a
        // generation bump plus one DELETE, the same cost as an iCal sync;
        // precision is not worth a post-type check that could be wrong.
        add_action('elementor/document/after_save', ['\\MPHBAC\\Cache', 'flush_all']);
        add_action('mphb_booking_status_changed', ['\\MPHBAC\\Cache', 'flush_all']);

        add_action('admin_notices', ['\\MPHBAC\\Cache_Integration', 'admin_notice']);
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'mphb-availability-calendar',
            false,
            dirname(plugin_basename(MPHBAC_FILE)) . '/languages'
        );
    }

    public function dependencies_present(): bool
    {
        return did_action('elementor/loaded') && function_exists('MPHB');
    }

    public function render_missing_deps_notice(): void
    {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        $missing = [];
        if (!did_action('elementor/loaded')) {
            $missing[] = 'Elementor';
        }
        if (!function_exists('MPHB')) {
            $missing[] = 'MotoPress Hotel Booking';
        }
        if (empty($missing)) {
            return;
        }
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html(sprintf(
                /* translators: %s: comma-separated list of missing plugin names */
                __('MPHB Availability Calendar requires the following plugins to be active: %s.', 'mphb-availability-calendar'),
                implode(', ', $missing)
            ))
        );
    }

    public function register_category(\Elementor\Elements_Manager $elements_manager): void
    {
        $elements_manager->add_category(
            'dcc-widgets',
            [
                'title' => __('Dora Canal Court', 'mphb-availability-calendar'),
                'icon'  => 'fa fa-plug',
            ]
        );
    }

    public function register_widget(\Elementor\Widgets_Manager $widgets_manager): void
    {
        $widgets_manager->register(new Widget());
        // Single-cottage variant for the individual accommodation templates.
        $widgets_manager->register(new Widget_Single());
        // Staff booking calendar (/staff/). A thin wrapper over the same
        // gated render path the [mphb_staff_calendar] shortcode uses.
        $widgets_manager->register(new Staff_Elementor());
    }
}
