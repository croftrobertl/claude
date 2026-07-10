<?php
namespace GuestGuide;

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
        add_action('wp_enqueue_scripts', ['\\GuestGuide\\Widget', 'register_assets']);
        // The UI is JS-driven (menu↔detail navigation, search, copy), so the
        // script MUST run inside the Elementor editor preview iframe —
        // get_script_depends() alone isn't reliable there, so force-enqueue it
        // on the preview hook (same approach as the availability calendar).
        add_action('elementor/preview/enqueue_scripts', ['\\GuestGuide\\Widget', 'enqueue_for_preview']);
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'guest-guide',
            false,
            dirname(plugin_basename(GGUIDE_FILE)) . '/languages'
        );
    }

    public function dependencies_present(): bool
    {
        return did_action('elementor/loaded') > 0;
    }

    public function render_missing_deps_notice(): void
    {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        if (did_action('elementor/loaded') > 0) {
            return;
        }
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html__('Guest Guide requires the Elementor plugin to be active.', 'guest-guide')
        );
    }

    public function register_category(\Elementor\Elements_Manager $elements_manager): void
    {
        // Shared with the MPHB Availability Calendar plugin. Registering the
        // same slug twice is idempotent in Elementor.
        $elements_manager->add_category(
            'claude-code',
            [
                'title' => __('Claude Code', 'guest-guide'),
                'icon'  => 'fa fa-plug',
            ]
        );
    }

    public function register_widget(\Elementor\Widgets_Manager $widgets_manager): void
    {
        $widgets_manager->register(new Widget());
    }
}
