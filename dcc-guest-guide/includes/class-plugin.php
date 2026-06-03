<?php
namespace DCCGG;

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
        add_action('wp_enqueue_scripts', ['\\DCCGG\\Widget', 'register_assets']);
        add_action('elementor/preview/enqueue_scripts', ['\\DCCGG\\Widget', 'enqueue_for_preview']);
        // Welcome Pack button lives in the editor panel, not the preview
        // iframe — the script must also load on the editor side so the
        // delegated click handler actually fires.
        add_action('elementor/editor/after_enqueue_scripts', ['\\DCCGG\\Widget', 'enqueue_for_editor']);
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'dcc-guest-guide',
            false,
            dirname(plugin_basename(DCCGG_FILE)) . '/languages'
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
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html__('DCC Guest Guide requires the Elementor plugin to be active.', 'dcc-guest-guide')
        );
    }

    public function register_category(\Elementor\Elements_Manager $elements_manager): void
    {
        // Shared with MPHB Availability Calendar; add_category is idempotent so
        // it's safe to register from both plugins regardless of activation order.
        $elements_manager->add_category(
            'claude-code',
            [
                'title' => __('Claude Code', 'dcc-guest-guide'),
                'icon'  => 'fa fa-plug',
            ]
        );
    }

    public function register_widget(\Elementor\Widgets_Manager $widgets_manager): void
    {
        $widgets_manager->register(new Widget());
    }
}
