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
     * NEVER call $document->get_elements_data() from here. Elementor's
     * Document::get_elements_data() does this in the editor:
     *
     *     if ( Plugin::$instance->editor->is_edit_mode() ) {
     *         if ( empty( $elements ) && empty( $autosave_elements ) ) {
     *             $elements = $this->convert_to_elementor();   // starts with $this->save( [] )
     *
     * and Document::save() ends by firing 'elementor/document/after_save'. On a page
     * with NO Elementor content, opening the editor therefore ran:
     *
     *     get_elements_data() -> convert_to_elementor() -> save([]) -> after_save
     *       -> this handler -> get_elements_data() -> ...
     *
     * save([]) carries no 'elements' key, so save_elements() never runs and
     * _elementor_data stays empty — the `empty( $elements )` guard never flips and the
     * recursion never terminates. PHP died of stack/memory exhaustion and Elementor
     * showed "There has been a critical error on this website". Pages that already had
     * containers/widgets were fine because non-empty data skips convert_to_elementor()
     * entirely, and the front end was fine because none of this runs outside edit mode.
     *
     * The elements are already in $data — that IS the payload being saved — so read
     * them from there and touch the document only for its id.
     *
     * @param \Elementor\Core\Base\Document $document
     * @param mixed                         $data Elementor passes the saved payload.
     */
    public function republish_designs($document, $data = []): void
    {
        // Belt and braces: even with the recursive call gone, publish_design() writes an
        // option, and an option write can wake other plugins that save documents.
        static $busy = false;
        if ($busy) {
            return;
        }

        if (!is_object($document) || !is_array($data)) {
            return;
        }

        // convert_to_elementor()'s save([]) — and any settings-only save — has no
        // elements. Nothing to publish, and this is the re-entrant call we must not
        // answer by asking the document for its elements.
        if (!isset($data['elements']) || !is_array($data['elements'])) {
            return;
        }

        // Autosaves are drafts. Mirroring Mini Entries should follow the design that was
        // actually saved, not one the editor is still typing.
        $status = $data['settings']['post_status'] ?? '';
        if ($status === 'autosave') {
            return;
        }

        $post_id = method_exists($document, 'get_main_id') ? (int) $document->get_main_id() : 0;
        if ($post_id <= 0) {
            return;
        }

        $busy = true;
        try {
            $published = [];
            $this->walk_elements($data['elements'], $post_id, $published);
            $this->prune_registry($post_id, $published);
        } finally {
            $busy = false;
        }
    }

    /**
     * Recurse an Elementor element tree, publishing each share-enabled Cottage
     * Selector and recording the names published into $published.
     *
     * @param array<int,array<string,mixed>> $elements
     * @param array<int,string>              $published
     */
    private function walk_elements(array $elements, int $post_id, array &$published): void
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
                    $name = trim((string) ($settings['design_name'] ?? ''));
                    Selector_Widget::publish_design(
                        $name,
                        $post_id,
                        (string) ($el['id'] ?? ''),
                        $settings
                    );
                    if ($name !== '') {
                        $published[] = $name;
                    }
                }
            }
            if (!empty($el['elements']) && is_array($el['elements'])) {
                $this->walk_elements($el['elements'], $post_id, $published);
            }
        }
    }

    /**
     * Drop registry entries this document used to own but no longer publishes: the
     * widget was deleted, "Share this design" was turned off, or the design was
     * renamed. Without this the stale name lives in every Mini Entry's "Mirror
     * design from" dropdown forever, mirroring a design whose source is gone.
     * Scoped strictly to entries whose post_id is the SAVED document — designs
     * published from other pages are never touched.
     *
     * @param array<int,string> $published Names this save (re)published.
     */
    private function prune_registry(int $post_id, array $published): void
    {
        $sources = get_option(Selector_Widget::DESIGN_OPTION, []);
        if (!is_array($sources)) {
            return;
        }
        $changed = false;
        foreach ($sources as $name => $entry) {
            if (!is_array($entry) || (int) ($entry['post_id'] ?? 0) !== $post_id) {
                continue;
            }
            if (!in_array((string) $name, $published, true)) {
                unset($sources[$name]);
                $changed = true;
            }
        }
        if ($changed) {
            update_option(Selector_Widget::DESIGN_OPTION, $sources, false);
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
