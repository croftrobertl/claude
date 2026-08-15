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
        add_action('elementor/controls/register', [$this, 'register_control_types']);
        add_action('elementor/widgets/register', [$this, 'register_widgets']);
        add_action('wp_enqueue_scripts', [$this, 'register_assets']);
        // The UI is client-rendered, so the script must also run inside the
        // Elementor editor preview iframe.
        add_action('elementor/preview/enqueue_scripts', [$this, 'enqueue_for_preview']);
        // Editor-only helper that powers the text-code export/import control.
        add_action('elementor/editor/after_enqueue_scripts', [$this, 'enqueue_editor_scripts']);
        // Keep the design registry fresh the moment a Selector is saved in Elementor,
        // so mirroring Mini Entries update without the selector page being visited.
        add_action('elementor/document/after_save', [$this, 'republish_designs'], 10, 2);
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
            // Slug MUST stay 'claude-code' — it is the shared category the other
            // DCC-built plugins (Availability Calendar, Guest Guide, Features &
            // Amenities) register too. Elementor groups the widget panel by SLUG,
            // so a different slug creates a SECOND panel section even when the
            // title matches character for character. 0.17.1 renamed the slug and
            // caused exactly that duplicate; only the displayed title should differ
            // from the working name.
            'claude-code',
            [
                'title' => __('Dora Canal Court', 'dcc-cottage-selector'),
                'icon'  => 'fa fa-plug',
            ]
        );
    }

    public function register_widgets(\Elementor\Widgets_Manager $widgets_manager): void
    {
        $widgets_manager->register(new Selector_Widget());
        $widgets_manager->register(new Mini_Entry_Widget());
    }

    /** Register the custom control type behind the text-code export/import UI. */
    public function register_control_types($controls_manager): void
    {
        if (is_object($controls_manager) && method_exists($controls_manager, 'register')) {
            $controls_manager->register(new Control_Design_IO());
        }
    }

    /** Editor-only JS: registers the dccs_design_io control view (export/import). */
    public function enqueue_editor_scripts(): void
    {
        wp_enqueue_script(
            'dccs-editor-io',
            DCCS_URL . 'assets/js/editor-io.js',
            ['elementor-editor'],
            DCCS_VERSION,
            true
        );
    }

    /**
     * On every Elementor save, (re)publish the design of any Cottage Selector on the
     * saved document that has "Share this design" on, so mirroring Mini Entries pick
     * up the change automatically. Writes are deduped by hash in publish_design().
     *
     * @param \Elementor\Core\Base\Document $document
     */
    public function republish_designs($document, array $data): void
    {
        if (!is_object($document) || !method_exists($document, 'get_elements_data')) {
            return;
        }
        $post_id = method_exists($document, 'get_main_id') ? (int) $document->get_main_id() : 0;
        if ($post_id <= 0) {
            return;
        }
        $this->walk_elements($document->get_elements_data(), $post_id);
    }

    /**
     * Recurse an Elementor element tree, publishing each share-enabled Cottage Selector.
     *
     * @param array<int,array<string,mixed>> $elements
     */
    private function walk_elements(array $elements, int $post_id): void
    {
        foreach ($elements as $el) {
            if (!is_array($el)) {
                continue;
            }
            $type = (string) ($el['widgetType'] ?? '');
            // dccs_mini_entry subclasses the Selector, but Mini Entries don't publish.
            if ($type === 'dccs_selector') {
                $settings = is_array($el['settings'] ?? null) ? $el['settings'] : [];
                if (($settings['share_design'] ?? '') === 'yes') {
                    Selector_Widget::publish_design(
                        (string) ($settings['design_name'] ?? ''),
                        $post_id,
                        (string) ($el['id'] ?? ''),
                        $settings
                    );
                }
            }
            if (!empty($el['elements']) && is_array($el['elements'])) {
                $this->walk_elements($el['elements'], $post_id);
            }
        }
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
