<?php
namespace MPHBSchema;

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

        // Front-end JSON-LD.
        add_action('wp_head', ['\\MPHBSchema\\Schema', 'render'], 20);

        // Per-document controls in the Elementor Settings tab.
        add_action('elementor/documents/register_controls', ['\\MPHBSchema\\Schema_Controls', 'register']);

        // Admin: defaults + import + health.
        add_action('admin_menu', ['\\MPHBSchema\\Schema_Settings', 'register_menu']);
        add_action('admin_menu', ['\\MPHBSchema\\Schema_Importer', 'register_menu'], 11);
        add_action('admin_init', ['\\MPHBSchema\\Schema_Settings', 'register_settings']);

        // Best-effort cache invalidation when MotoPress availability changes.
        add_action('mphb_after_sync_ical', ['\\MPHBSchema\\Cache', 'flush_all']);
        add_action('mphb_ical_sync_finished', ['\\MPHBSchema\\Cache', 'flush_all']);
        add_action('mphb_after_create_booking', ['\\MPHBSchema\\Cache', 'flush_all']);
        add_action('mphb_booking_status_changed', ['\\MPHBSchema\\Cache', 'flush_all']);
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'mphb-schema-manager',
            false,
            dirname(plugin_basename(MPHBSCHEMA_FILE)) . '/languages'
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
                __('MPHB Schema Manager requires the following plugins to be active: %s.', 'mphb-schema-manager'),
                implode(', ', $missing)
            ))
        );
    }
}
