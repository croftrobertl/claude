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
        add_filter('script_loader_tag', ['\\MPHBAC\\Widget', 'keep_script_unoptimized'], 10, 2);
        add_filter('style_loader_tag', ['\\MPHBAC\\Widget', 'keep_style_unoptimized'], 10, 2);

        add_action('wp_ajax_' . MPHBAC_AJAX_ACTION, ['\\MPHBAC\\Ajax', 'handle']);
        add_action('wp_ajax_nopriv_' . MPHBAC_AJAX_ACTION, ['\\MPHBAC\\Ajax', 'handle']);
        // Booking-sheet price estimate. Same public/nonce-free trust model as
        // the availability endpoint (documented invariant) — read-only data,
        // hardened input validation inside the handler.
        add_action('wp_ajax_' . MPHBAC_PRICE_ACTION, ['\\MPHBAC\\Ajax', 'handle_price']);
        add_action('wp_ajax_nopriv_' . MPHBAC_PRICE_ACTION, ['\\MPHBAC\\Ajax', 'handle_price']);

        // Staff booking calendar (/staff/). Every endpoint below re-verifies
        // authorization server-side on each request — see Staff::is_authorized().
        Staff::register();
        Staff_Widget::register();

        // Request-time SpeedyCache exclusion — belt-and-braces alongside the
        // option-write done at activation, and self-heals if SpeedyCache's
        // settings are ever reset without a plugin reactivation.
        Cache_Integration::register_runtime_filter();

        // Best-effort cache invalidation when MotoPress finishes syncing iCal feeds.
        // Hook name is a best guess; transients also expire on TTL as a safety net.
        add_action('mphb_after_sync_ical', ['\\MPHBAC\\Cache', 'flush_all']);
        add_action('mphb_ical_sync_finished', ['\\MPHBAC\\Cache', 'flush_all']);
        add_action('mphb_after_create_booking', ['\\MPHBAC\\Cache', 'flush_all']);
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
    }
}
