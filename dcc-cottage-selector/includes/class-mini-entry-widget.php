<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Widget_Base;
use Elementor\Controls_Manager;

/**
 * Compact cross-sell entry point for individual cottage pages.
 *
 * "Both (configurable)" behavior:
 *   - If a selector-page URL is set, the entry is a link to that page with the
 *     current cottage pre-filled via the query string (?highlight=<id>).
 *   - If no URL is set, clicking opens the full selector in a same-page modal,
 *     pre-filled and highlighting the current cottage vs the other seven.
 *
 * Exposed both as an Elementor widget and the [dcc_selector_entry] shortcode.
 */
class Mini_Entry_Widget extends Widget_Base
{
    public function get_name(): string
    {
        return 'dccs_mini_entry';
    }

    public function get_title(): string
    {
        return __('Cottage Selector — Mini Entry', 'dcc-cottage-selector');
    }

    public function get_icon(): string
    {
        return 'eicon-help-o';
    }

    public function get_categories(): array
    {
        return ['claude-code'];
    }

    public function get_script_depends(): array
    {
        return ['dccs-selector'];
    }

    public function get_style_depends(): array
    {
        return ['dccs-selector'];
    }

    protected function register_controls(): void
    {
        $this->start_controls_section('content', [
            'label' => __('Content', 'dcc-cottage-selector'),
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

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $s = $this->get_settings_for_display();
        $url = '';
        if (!empty($s['selector_url']) && is_array($s['selector_url'])) {
            $url = (string) ($s['selector_url']['url'] ?? '');
        }
        echo self::markup((string) ($s['current'] ?? ''), $url, (string) ($s['copy'] ?? self::default_copy())); // phpcs:ignore WordPress.Security.EscapeOutput
    }

    /**
     * Shortcode: [dcc_selector_entry current="22" url="/cottage-selector/" text="…"]
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
     * Build the deep-link query string that pre-fills the selector for a cottage
     * (soft Quick-Pick preferences derived from its attributes, plus highlight).
     * Mirrors derivePresetQuick() in selector.js.
     */
    private static function deeplink_for(string $id): string
    {
        $c = Data::find($id);
        $args = ['mode' => 'quick', 'highlight' => $id];
        if ($c) {
            if (!empty($c['desk'])) { $args['desk'] = 'yes'; }
            if (!empty($c['pulloutCouch'])) { $args['pullout'] = 'yes'; }
            $args['layout'] = (($c['layoutType'] ?? '') === 'Studio') ? 'studio' : 'onebed';
            if ((int) ($c['squareFeet'] ?? 0) >= 400) { $args['largest'] = 'true'; }
        }
        return http_build_query($args);
    }

    /**
     * Shared markup for both the widget and shortcode.
     */
    private static function markup(string $current, string $selector_url, string $copy): string
    {
        // Normalize/validate the link server-side (the JS safeUrl() guards at runtime too).
        $selector_url = $selector_url !== '' ? esc_url_raw($selector_url) : '';

        $entry = [
            'current'     => $current,
            'selectorUrl' => $selector_url,
        ];

        if ($selector_url === '') {
            // Same-page modal: embed the full selector config (opened in Quick Pick,
            // highlighting this cottage — preferences are derived client-side).
            $entry['modalConfig'] = Config::build([], [
                'highlight' => $current,
                'startMode' => 'quick',
            ]);
        } else {
            // Linked selector page: pre-build the deep-link query from this cottage
            // so the destination opens pre-filled and highlighting it.
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
