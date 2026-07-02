<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Controls_Manager;

/**
 * Compact cross-sell entry point for individual cottage pages.
 *
 * Subclasses {@see Selector_Widget} so it inherits the FULL set of text + style
 * controls (and the build_config() helper). That means the Mini-Entry popup
 * carries the exact same customizable look and copy as the main Selector — you
 * configure this widget's own controls and they flow into the modal.
 *
 * Behavior:
 *   - If a selector-page URL is set, the entry links to that page with the
 *     current cottage highlighted (?highlight=<id>).
 *   - If no URL is set, clicking opens the full selector in a same-page modal.
 *     The modal opens on the landing screen (mirroring the Selector's first
 *     section) and highlights this cottage once the guest reaches results.
 *
 * Exposed both as an Elementor widget and the [dcc_selector_entry] shortcode.
 */
class Mini_Entry_Widget extends Selector_Widget
{
    public function get_name(): string
    {
        return 'dccs_mini_entry';
    }

    public function get_title(): string
    {
        return __('DCC Cottage Selector — Mini Entry', 'dcc-cottage-selector');
    }

    public function get_icon(): string
    {
        return 'eicon-help-o';
    }

    public function get_keywords(): array
    {
        return ['cottage', 'selector', 'mini', 'cross-sell', 'dora canal'];
    }

    protected function register_controls(): void
    {
        // Mini-Entry–specific content first, then the full inherited Selector
        // control set (text + styles) so the popup is fully configurable here.
        $this->start_controls_section('mini_content', [
            'label' => __('Mini Entry', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $options = ['' => __('— None —', 'dcc-cottage-selector')];
        foreach (Data::all() as $c) {
            $options[(string) $c['id']] = sprintf('%s (#%s)', (string) ($c['name'] ?? ''), (string) $c['id']);
        }

        $this->add_control('current', [
            'label'   => __('This cottage', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::SELECT,
            'default' => '',
            'options' => $options,
        ]);

        $this->add_control('selector_url', [
            'label'       => __('Selector page URL', 'dcc-cottage-selector'),
            'description' => __('Leave blank to open the selector in a pop-up on this page.', 'dcc-cottage-selector'),
            'type'        => Controls_Manager::URL,
            'options'     => ['url'],
        ]);

        $this->add_control('copy', [
            'label'       => __('Prompt text', 'dcc-cottage-selector'),
            'type'        => Controls_Manager::TEXTAREA,
            'default'     => self::default_copy(),
            'label_block' => true,
        ]);

        // Mirror a Cottage Selector's published design (see Selector_Widget::publish_design).
        // Choosing one hides this widget's own design/text controls and makes the pop-up
        // reuse the source's styling + copy, updating automatically when the source changes.
        $sources = get_option(Selector_Widget::DESIGN_OPTION, []);
        $source_options = ['' => __('— None (use my own settings) —', 'dcc-cottage-selector')];
        if (is_array($sources)) {
            foreach (array_keys($sources) as $name) {
                $source_options[(string) $name] = (string) $name;
            }
        }

        $this->add_control('mirror_source', [
            'label'       => __('Mirror design from', 'dcc-cottage-selector'),
            'description' => __('Match a Cottage Selector that has "Share this design" turned on. Save that Selector first to populate this list. (Live + locked: this widget\'s own controls hide while mirroring.)', 'dcc-cottage-selector'),
            'type'        => Controls_Manager::SELECT,
            'default'     => '',
            'options'     => $source_options,
        ]);

        // One-time copy (independent afterward), used when NOT mirroring: paste a text
        // code exported from a Cottage Selector to fill this widget's own text fields.
        // For the LOOK, use Elementor's right-click Paste Style onto this widget.
        $this->add_control('import_text', [
            'label'       => __('Import text', 'dcc-cottage-selector'),
            'type'        => Control_Design_IO::TYPE,
            'mode'        => 'import',
            'button_text' => __('Apply text', 'dcc-cottage-selector'),
            'placeholder' => __('Paste a text code from a Cottage Selector, then click Apply…', 'dcc-cottage-selector'),
            'description' => __('Writes the pasted Selector wording into this widget’s own text fields, then edit freely. For the visual design, right-click the Selector → Copy, then right-click this widget → Paste Style.', 'dcc-cottage-selector'),
            'condition'   => ['mirror_source' => ''],
        ]);

        $this->end_controls_section();

        parent::register_controls();
    }

    /** Mini Entries don't publish designs — only the Cottage Selector does. */
    protected function register_design_source_controls(): void
    {
    }

    /** Hide the inherited design + text sections whenever a source is being mirrored. */
    protected function inherited_section_condition(): array
    {
        return ['mirror_source' => ''];
    }

    protected function render(): void
    {
        $s = $this->get_settings_for_display();
        $url = '';
        if (!empty($s['selector_url']) && is_array($s['selector_url'])) {
            $url = (string) ($s['selector_url']['url'] ?? '');
        }
        $current = (string) ($s['current'] ?? '');
        $copy    = (string) ($s['copy'] ?? self::default_copy());
        $mirror  = (string) ($s['mirror_source'] ?? '');

        $modal_config = null;
        $scope        = null;
        if ($url === '') {
            $src = $this->mirror_source($mirror);
            if ($src !== null) {
                // Mirror: build the pop-up config from the source's published snapshot and
                // point the pop-up at the source's Elementor scope so its own generated CSS
                // styles it. Enqueue that page's Elementor CSS so the rules are present here.
                $modal_config = Selector_Widget::config_from_snapshot(
                    (array) $src['overrides'],
                    ['highlight' => $current, 'startMode' => 'quick']
                );
                $scope = ['page' => (string) $src['page_class'], 'el' => (string) $src['el_class']];
                if (class_exists('\Elementor\Core\Files\CSS\Post')) {
                    \Elementor\Core\Files\CSS\Post::create((int) $src['post_id'])->enqueue();
                }
            } else {
                // Same-page modal with this widget's own full config (styling/copy).
                $modal_config = $this->build_config(['highlight' => $current, 'startMode' => 'quick']);
            }
        }

        echo self::markup($current, $url, $copy, $modal_config, $scope); // phpcs:ignore WordPress.Security.EscapeOutput
    }

    /**
     * Look up a published design source by name. Returns null when the name is empty
     * or no longer in the registry (the Mini Entry then falls back to its own settings).
     *
     * @return array<string,mixed>|null
     */
    private function mirror_source(string $name): ?array
    {
        if ($name === '') {
            return null;
        }
        $sources = get_option(Selector_Widget::DESIGN_OPTION, []);
        if (is_array($sources) && isset($sources[$name]) && is_array($sources[$name]) && !empty($sources[$name]['overrides'])) {
            return $sources[$name];
        }
        return null;
    }

    /**
     * Shortcode: [dcc_selector_entry current="22" url="/cottage-selector/" text="…"]
     * (Shortcode has no widget instance, so it uses the default config — for
     * per-instance styling, use the Elementor widget.)
     *
     * @param array<string,string>|string $atts
     */
    public static function shortcode($atts): string
    {
        if (!wp_style_is('dccs-selector', 'registered')) {
            Plugin::instance()->register_assets();
        }
        wp_enqueue_style('dccs-selector');
        wp_enqueue_script('dccs-selector');

        $a = shortcode_atts([
            'current' => '',
            'url'     => '',
            'text'    => self::default_copy(),
        ], is_array($atts) ? $atts : [], 'dcc_selector_entry');

        return self::markup((string) $a['current'], (string) $a['url'], (string) $a['text']);
    }

    private static function default_copy(): string
    {
        return __('Not sure this layout fits you best? Open our 30-Second Selector.', 'dcc-cottage-selector');
    }

    /**
     * Deep-link query string for the linked-page variant: just highlight the
     * cottage in the destination selector's results (no attribute pre-fill, which
     * would now hard-filter under the "every specific want" count logic).
     */
    private static function deeplink_for(string $id): string
    {
        return http_build_query(['mode' => 'quick', 'highlight' => $id]);
    }

    /**
     * Shared markup for the widget and shortcode. $modal_config, when provided,
     * is this widget instance's full config (styled + copy-overridden). $scope, when
     * given, carries the mirrored source's Elementor scope classes so the pop-up can
     * adopt the source's generated CSS (see selector.js openModal).
     *
     * @param array<string,mixed>|null $modal_config
     * @param array<string,string>|null $scope
     */
    private static function markup(string $current, string $selector_url, string $copy, ?array $modal_config = null, ?array $scope = null): string
    {
        // Normalize/validate the link server-side (the JS safeUrl() guards at runtime too).
        $selector_url = $selector_url !== '' ? esc_url_raw($selector_url) : '';

        $entry = [
            'current'     => $current,
            'selectorUrl' => $selector_url,
        ];

        if ($selector_url === '') {
            // Same-page modal: embed the full selector config (opened on the landing
            // screen, highlighting this cottage once results are reached).
            $entry['modalConfig'] = $modal_config ?? Config::build([], [
                'highlight' => $current,
                'startMode' => 'quick',
            ]);
            if ($scope !== null) {
                $entry['scope'] = $scope;
            }
        } else {
            $entry['deeplink'] = self::deeplink_for($current);
        }

        $label = $copy !== '' ? $copy : self::default_copy();

        return sprintf(
            '<div class="dccs-entry dccs-entry" data-entry="%1$s">'
            . '<button type="button" class="dccs-entry-btn">%2$s</button>'
            . '</div>',
            esc_attr((string) (wp_json_encode($entry) ?: '{}')),
            esc_html($label)
        );
    }
}
