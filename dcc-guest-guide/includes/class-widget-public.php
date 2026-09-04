<?php
namespace DCCGG;

use Elementor\Controls_Manager;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * "DCC Guest Guide — Public": the prospect-facing variant widget.
 *
 * Deliberately thin. It holds no guide content of its own — only a pointer to
 * the source guide plus the marketing copy specific to this placement. All
 * rendering goes through Plugin::render_source_guide(), the same path the
 * [dcc_guest_guide] shortcode uses, which re-renders the SOURCE widget's own
 * element data with public mode applied to a copy. There is therefore exactly
 * one definition of the sections on the site: edit the guide and both the
 * guest page and this widget change together, with no possibility of drift.
 *
 * Everything that makes the public view safe (dropping guest-only sections and
 * their items, and force-disabling Request Support, the review prompt, AI
 * search and the SOS button) lives in Widget::apply_public_mode(), so this
 * class cannot forget any of it — it never renders the guide itself.
 */
class Widget_Public extends \Elementor\Widget_Base
{
    public function get_name(): string { return 'dccgg_guide_public'; }
    public function get_title(): string { return __('DCC Guest Guide — Public', 'dcc-guest-guide'); }
    public function get_icon(): string { return 'eicon-preview-medium'; }
    public function get_categories(): array { return ['dcc-widgets']; }
    public function get_keywords(): array { return ['guide', 'public', 'prospect', 'preview', 'marketing']; }
    public function get_script_depends(): array { return ['dccgg-widget']; }
    public function get_style_depends(): array { return ['dccgg-widget']; }

    /**
     * Pages holding a guide widget, for the Source dropdown.
     *
     * Built only in the editor. register_controls() also runs on the front end
     * when the controls stack is assembled, and this query touches postmeta —
     * running it on every visitor's page load would be a needless cost. On the
     * front end the list is empty, which does not matter: Elementor returns the
     * saved value regardless of whether it appears in the options array.
     */
    private function source_options(): array
    {
        $options = ['' => __('Auto-detect (first guide found)', 'dcc-guest-guide')];
        if (!is_admin()) {
            return $options;
        }
        $cached = get_transient('dccgg_guide_source_options');
        if (is_array($cached)) {
            return $options + $cached;
        }
        $found = [];
        $q = new \WP_Query([
            'post_type'              => 'any',
            'post_status'            => ['publish', 'draft', 'private'],
            'posts_per_page'         => 50,
            'fields'                 => 'ids',
            'no_found_rows'          => true,
            'update_post_term_cache' => false,
            'meta_query'             => [[
                'key'     => '_elementor_data',
                'value'   => 'dccgg_guide',
                'compare' => 'LIKE',
            ]],
        ]);
        foreach ($q->posts as $pid) {
            if (Plugin::instance()->find_widget_element((int) $pid)) {
                $found[(string) $pid] = sprintf('%s (#%d)', get_the_title((int) $pid) ?: __('(no title)', 'dcc-guest-guide'), $pid);
            }
        }
        set_transient('dccgg_guide_source_options', $found, 5 * MINUTE_IN_SECONDS);
        return $options + $found;
    }

    protected function register_controls(): void
    {
        $this->start_controls_section('section_public_source', [
            'label' => __('Source guide', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('source_notice', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('This widget mirrors an existing guide, filtered to the sections you marked Public or Both. It holds no content of its own — edit the guide itself and this page follows automatically.', 'dcc-guest-guide'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->add_control('source_post', [
            'label'       => __('Source page', 'dcc-guest-guide'),
            'type'        => Controls_Manager::SELECT,
            'default'     => '',
            'options'     => $this->source_options(),
            'description' => __('The page holding the guide to mirror. Auto-detect finds the first one on the site, which is the right answer when there is only one guide.', 'dcc-guest-guide'),
        ]);

        $this->add_control('source_widget_id', [
            'label'       => __('Guide widget ID (optional)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '',
            'description' => __('Only needed if the source page holds more than one guide. Leave empty to use the first.', 'dcc-guest-guide'),
        ]);

        $this->end_controls_section();

        $this->start_controls_section('section_public_copy', [
            'label' => __('Intro & call to action', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('public_intro', [
            'label'       => __('Intro line', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXTAREA,
            'rows'        => 3,
            'default'     => __('A look at life on the Dora Canal — the water, the amenities, and the little things that make a stay here ours.', 'dcc-guest-guide'),
            'description' => __('Shown above the tiles. Clear it to show nothing.', 'dcc-guest-guide'),
        ]);

        $this->add_control('public_cta_text', [
            'label'       => __('Button text', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => __('See the cottages →', 'dcc-guest-guide'),
            'description' => __('Shown after the tiles. Clear it to show no button.', 'dcc-guest-guide'),
        ]);

        $this->add_control('public_cta_url', [
            'label'   => __('Button link', 'dcc-guest-guide'),
            'type'    => Controls_Manager::URL,
            'default' => ['url' => '/cottages/', 'is_external' => false, 'nofollow' => false],
        ]);

        $this->end_controls_section();
    }

    protected function render(): void
    {
        if (!Plugin::instance()->dependencies_present()) {
            return;
        }
        $s = $this->get_settings_for_display();

        // The mode is hard-coded, not derived from a setting: this widget has
        // exactly one job, and there is no input through which a typo could
        // turn it into the full guest guide.
        echo Plugin::instance()->render_source_guide( // phpcs:ignore WordPress.Security.EscapeOutput — the guide renders its own escaped markup
            (int) ($s['source_post'] ?? 0),
            trim((string) ($s['source_widget_id'] ?? '')),
            'public',
            [
                // Passed through unconditionally, empty values included, so
                // clearing a field here clears it on the page rather than
                // falling back to whatever the source guide happens to hold.
                'public_intro'    => (string) ($s['public_intro'] ?? ''),
                'public_cta_text' => (string) ($s['public_cta_text'] ?? ''),
                'public_cta_url'  => is_array($s['public_cta_url'] ?? null) ? $s['public_cta_url'] : ['url' => (string) ($s['public_cta_url'] ?? '')],
            ]
        );
    }
}
