<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Central registry: registers the Elementor category + two widgets, enqueues the
 * (tiny, static) front-end assets, wires the shortcode, and loads translations.
 * No AJAX endpoint and no cache integration are needed — the whole experience is
 * client-side over a small inlined dataset, so it caches cleanly everywhere.
 */
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
        add_shortcode('dcc_selector_entry', ['\\DCCS\\Mini_Entry_Widget', 'shortcode']);

        if (!$this->elementor_present()) {
            add_action('admin_notices', [$this, 'render_missing_deps_notice']);
            // The shortcode still works without Elementor, so don't bail entirely;
            // just register the public assets so the shortcode can enqueue them.
            add_action('wp_enqueue_scripts', [$this, 'register_assets']);
            return;
        }

        add_action('elementor/elements/categories_registered', [$this, 'register_category']);
        add_action('elementor/widgets/register', [$this, 'register_widgets']);
        add_action('wp_enqueue_scripts', [$this, 'register_assets']);
        // The UI is client-rendered, so the script must also run inside the
        // Elementor editor preview iframe.
        add_action('elementor/preview/enqueue_scripts', [$this, 'enqueue_for_preview']);
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'dcc-cottage-selector',
            false,
            dirname(plugin_basename(DCCS_FILE)) . '/languages'
        );
    }

    public function elementor_present(): bool
    {
        return did_action('elementor/loaded') > 0;
    }

    public function render_missing_deps_notice(): void
    {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        printf(
            '<div class="notice notice-warning"><p>%s</p></div>',
            esc_html__('Dora Canal Cottage Selector works best with Elementor active; the [dcc_selector_entry] shortcode still works without it.', 'dcc-cottage-selector')
        );
    }

    public function register_category(\Elementor\Elements_Manager $elements_manager): void
    {
        $elements_manager->add_category(
            'claude-code',
            [
                'title' => __('Claude Code', 'dcc-cottage-selector'),
                'icon'  => 'fa fa-plug',
            ]
        );
    }

    public function register_widgets(\Elementor\Widgets_Manager $widgets_manager): void
    {
        $widgets_manager->register(new Selector_Widget());
        $widgets_manager->register(new Mini_Entry_Widget());
    }

    /**
     * Register (not enqueue) the three JS modules + stylesheet. Widgets declare
     * them via get_script_depends()/get_style_depends(); the shortcode enqueues
     * them on demand.
     */
    public function register_assets(): void
    {
        wp_register_style('dccs-selector', DCCS_URL . 'assets/css/selector.css', [], DCCS_VERSION);

        wp_register_script('dccs-score', DCCS_URL . 'assets/js/score.js', [], DCCS_VERSION, true);
        wp_register_script('dccs-labels', DCCS_URL . 'assets/js/labels.js', [], DCCS_VERSION, true);
        wp_register_script('dccs-selector', DCCS_URL . 'assets/js/selector.js', ['dccs-score', 'dccs-labels'], DCCS_VERSION, true);
    }

    public function enqueue_for_preview(): void
    {
        $this->register_assets();
        wp_enqueue_style('dccs-selector');
        // Enqueue the dependency chain explicitly and in order. In the editor
        // preview the widget markup is injected dynamically, and relying on
        // implicit dependency resolution alone can leave the data layer
        // (dccs-score / dccs-labels) unavailable when the widget boots.
        wp_enqueue_script('dccs-score');
        wp_enqueue_script('dccs-labels');
        wp_enqueue_script('dccs-selector');
    }
}
