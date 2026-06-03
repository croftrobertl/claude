<?php
namespace DCCGG;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Background;
use Elementor\Group_Control_Border;
use Elementor\Group_Control_Box_Shadow;
use Elementor\Group_Control_Typography;
use Elementor\Repeater;
use Elementor\Widget_Base;

if (!defined('ABSPATH')) {
    exit;
}

final class Widget extends Widget_Base
{
    /**
     * Doubled-class specificity prefix that outranks aggressive theme resets
     * (Bravada's Elementor kit reaches (0,3,1)). Doubled .dccgg-root brings
     * the selector to (0,4,0) without changing what it matches.
     */
    private const SEL = '{{WRAPPER}} .dccgg-root.dccgg-root ';

    public function get_name(): string { return 'dccgg_guide'; }
    public function get_title(): string { return __('DCC Guest Guide', 'dcc-guest-guide'); }
    public function get_icon(): string { return 'eicon-info-circle-o'; }
    public function get_categories(): array { return ['claude-code']; }
    public function get_keywords(): array { return ['guide', 'guest', 'info', 'wifi', 'help', 'faq']; }
    public function get_script_depends(): array { return ['dccgg-widget']; }
    public function get_style_depends(): array { return ['dccgg-widget']; }

    public static function register_assets(): void
    {
        // Depend on Elementor's Font Awesome bundles so the hardcoded
        // <i class="fas …"> icons (search, print, theme toggle, FAB close,
        // copy-confirmation glyph) always have FA loaded, even on pages
        // that don't otherwise trigger an Elementor icon-control enqueue.
        $style_deps = [];
        foreach (['elementor-icons-fa-solid', 'elementor-icons-fa-regular'] as $h) {
            if (wp_style_is($h, 'registered') || wp_style_is($h, 'enqueued')) {
                $style_deps[] = $h;
            }
        }
        wp_register_style('dccgg-widget', DCCGG_URL . 'assets/css/widget.css', $style_deps, DCCGG_VERSION);
        wp_register_script('dccgg-widget', DCCGG_URL . 'assets/js/widget.js', [], DCCGG_VERSION, true);
    }

    /**
     * Force-enqueue assets into the Elementor editor preview iframe so the
     * JS-driven layouts, flip cards, and stage transitions actually render
     * while editing.
     */
    public static function enqueue_for_preview(): void
    {
        self::register_assets();
        wp_enqueue_style('dccgg-widget');
        wp_enqueue_script('dccgg-widget');
    }

    protected function register_controls(): void
    {
        // Content tab
        $this->register_general_controls();
        $this->register_sections_controls();
        $this->register_items_controls();
        $this->register_search_controls();
        $this->register_strings_controls();

        // Style tab
        $this->register_theme_controls();
        $this->register_layout_controls();
        $this->register_color_controls();
        $this->register_tile_style_controls();
        $this->register_quick_action_style_controls();
        $this->register_button_style_controls();
        $this->register_detail_style_controls();
        $this->register_flip_card_controls();
        $this->register_fab_style_controls();
        $this->register_transitions_controls();
    }

    // ----------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------

    /**
     * Build SELECT options for the Sections repeater so items can pick their
     * parent section without typo bugs. Reads currently-saved sections; new
     * sections appear in the dropdown after the editor saves and reopens
     * the panel.
     *
     * @return array<string,string>
     */
    private function sections_options(): array
    {
        $options  = ['' => __('— Pick a section —', 'dcc-guest-guide')];
        $sections = (array) $this->get_settings('guide_sections');
        foreach ($sections as $row) {
            $key   = trim((string) ($row['section_key'] ?? ''));
            $title = trim((string) ($row['section_title'] ?? ''));
            if ($key === '') {
                continue;
            }
            $options[$key] = $title !== '' ? $title : $key;
        }
        if (count($options) === 1) {
            $options[''] = __('— Add sections first, save, then reopen —', 'dcc-guest-guide');
        }
        return $options;
    }

    /**
     * Memoized list of Elementor templates for the item Content Source dropdown.
     */
    private function template_options(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $cache = ['' => __('— Select a template —', 'dcc-guest-guide')];
        $posts = get_posts([
            'post_type'      => 'elementor_library',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'orderby'        => 'title',
            'order'          => 'ASC',
            'no_found_rows'  => true,
        ]);
        foreach ($posts as $post) {
            $cache[(int) $post->ID] = $post->post_title !== ''
                ? $post->post_title
                : sprintf(__('Template #%d', 'dcc-guest-guide'), $post->ID);
        }
        return $cache;
    }

    /**
     * Normalize a YouTube/Vimeo/self-hosted URL into an embeddable form.
     * Returns ['embed' => '...', 'self_hosted' => bool] or null when unparseable.
     *
     * @return array{embed:string,self_hosted:bool}|null
     */
    public static function normalize_video_url(string $url): ?array
    {
        $url = trim($url);
        if ($url === '') {
            return null;
        }
        // youtu.be short links: https://youtu.be/VIDEO_ID
        if (preg_match('~^https?://(?:www\.)?youtu\.be/([A-Za-z0-9_\-]{6,})~', $url, $m)) {
            return ['embed' => 'https://www.youtube.com/embed/' . $m[1], 'self_hosted' => false];
        }
        // youtube.com/watch?v=ID and youtube.com/embed/ID and shorts
        if (preg_match('~^https?://(?:www\.)?youtube\.com/(?:watch\?v=|embed/|shorts/)([A-Za-z0-9_\-]{6,})~', $url, $m)) {
            return ['embed' => 'https://www.youtube.com/embed/' . $m[1], 'self_hosted' => false];
        }
        // vimeo.com/12345 and player.vimeo.com/video/12345
        if (preg_match('~^https?://(?:www\.)?(?:player\.)?vimeo\.com/(?:video/)?(\d{6,})~', $url, $m)) {
            return ['embed' => 'https://player.vimeo.com/video/' . $m[1], 'self_hosted' => false];
        }
        // self-hosted MP4/WebM/Ogg/MOV — render as <video>
        if (preg_match('~\.(mp4|webm|ogg|mov|m4v)(?:\?|$)~i', $url)) {
            return ['embed' => $url, 'self_hosted' => true];
        }
        return null;
    }

    /**
     * Theme presets: each is a JSON-able map of CSS-var overrides for .dccgg-root.
     * "custom" yields no overrides (user's color controls take effect).
     *
     * @return array<string, array<string,string>>
     */
    public static function theme_presets(): array
    {
        return [
            'custom' => [],
            'coastal' => [
                '--dccgg-primary'      => '#0f6dbf',
                '--dccgg-btn-bg'       => '#0f6dbf',
                '--dccgg-btn-txt'      => '#ffffff',
                '--dccgg-tile-bg'      => 'rgba(255,255,255,0.85)',
                '--dccgg-tile-border'  => 'rgba(15,109,191,0.15)',
                '--dccgg-detail-bg'    => '#ffffff',
                '--dccgg-text'         => '#0a3a5c',
                '--dccgg-muted'        => '#5d7891',
                '--dccgg-accent'       => '#f08080',
            ],
            'hotel' => [
                '--dccgg-primary'      => '#8a6d3b',
                '--dccgg-btn-bg'       => '#8a6d3b',
                '--dccgg-btn-txt'      => '#fdfaf3',
                '--dccgg-tile-bg'      => '#fdfaf3',
                '--dccgg-tile-border'  => 'rgba(138,109,59,0.2)',
                '--dccgg-detail-bg'    => '#fffdf7',
                '--dccgg-text'         => '#2c2418',
                '--dccgg-muted'        => '#7a6c52',
                '--dccgg-accent'       => '#c19a4b',
            ],
            'bohemian' => [
                '--dccgg-primary'      => '#a94c66',
                '--dccgg-btn-bg'       => '#a94c66',
                '--dccgg-btn-txt'      => '#fef6f0',
                '--dccgg-tile-bg'      => 'rgba(254,246,240,0.85)',
                '--dccgg-tile-border'  => 'rgba(169,76,102,0.25)',
                '--dccgg-detail-bg'    => '#fef6f0',
                '--dccgg-text'         => '#3d2330',
                '--dccgg-muted'        => '#8a6470',
                '--dccgg-accent'       => '#d4a373',
            ],
            'minimal' => [
                '--dccgg-primary'      => '#111111',
                '--dccgg-btn-bg'       => '#111111',
                '--dccgg-btn-txt'      => '#ffffff',
                '--dccgg-tile-bg'      => '#ffffff',
                '--dccgg-tile-border'  => '#e5e5e5',
                '--dccgg-detail-bg'    => '#ffffff',
                '--dccgg-text'         => '#111111',
                '--dccgg-muted'        => '#666666',
                '--dccgg-accent'       => '#0066ff',
            ],
            'dark' => [
                '--dccgg-primary'      => '#5fa8e8',
                '--dccgg-btn-bg'       => '#5fa8e8',
                '--dccgg-btn-txt'      => '#0a1420',
                '--dccgg-tile-bg'      => 'rgba(28,38,52,0.85)',
                '--dccgg-tile-border'  => 'rgba(95,168,232,0.2)',
                '--dccgg-detail-bg'    => '#15202b',
                '--dccgg-text'         => '#e8eef5',
                '--dccgg-muted'        => '#8da3b8',
                '--dccgg-accent'       => '#f08080',
            ],
        ];
    }

    /**
     * Identify items that target a section_key no longer present in the
     * sections repeater (e.g. the section was renamed or deleted). Used to
     * surface an editor-only warning so authors can fix orphans.
     *
     * @return string[] item titles
     */
    private function find_orphan_items(): array
    {
        $sections = (array) $this->get_settings('guide_sections');
        $items    = (array) $this->get_settings('guide_items');
        if (empty($items)) {
            return [];
        }
        $valid = [];
        foreach ($sections as $sec) {
            $k = trim((string) ($sec['section_key'] ?? ''));
            if ($k !== '') {
                $valid[$k] = true;
            }
        }
        $orphans = [];
        foreach ($items as $it) {
            $k = trim((string) ($it['item_section'] ?? ''));
            if ($k === '' || !isset($valid[$k])) {
                $title = trim((string) ($it['item_title'] ?? ''));
                $orphans[] = $title !== '' ? $title : __('(untitled item)', 'dcc-guest-guide');
            }
        }
        return $orphans;
    }

    /**
     * Compute a human read-time label from a chunk of HTML content. Uses the
     * common 200 wpm estimate. Returns an empty string for very short content
     * so we don't clutter every tile with a "less than 1 min" badge.
     */
    public static function read_time_text(string $html): string
    {
        $text = trim(wp_strip_all_tags($html));
        if ($text === '') {
            return '';
        }
        $words   = preg_split('/\s+/u', $text) ?: [];
        $count   = count($words);
        if ($count < 50) {
            return '';
        }
        $minutes = max(1, (int) ceil($count / 200));
        return sprintf(
            /* translators: %d: estimated minutes */
            _n('%d min read', '%d min read', $minutes, 'dcc-guest-guide'),
            $minutes
        );
    }

    /**
     * Server-side auto-linker. Wraps unlinked phone numbers (US-style and
     * E.164-ish), email addresses, and decimal lat/lng coordinate pairs in
     * `tel:`, `mailto:`, and Google Maps links respectively. Skips text inside
     * existing `<a>`, `<code>`, `<pre>`, and `<kbd>` to avoid mangling
     * pre-formatted content or breaking nested anchors. Returns the modified
     * HTML; the input is assumed to have already passed through `wp_kses_post`.
     */
    public static function auto_link_html(string $html): string
    {
        if ($html === '' || stripos($html, '<') === false && stripos($html, '@') === false && !preg_match('/\d/', $html)) {
            return $html;
        }

        // Split on protected blocks so we don't recurse into them.
        $parts = preg_split(
            '#(<a\b[^>]*>.*?</a>|<code\b[^>]*>.*?</code>|<pre\b[^>]*>.*?</pre>|<kbd\b[^>]*>.*?</kbd>)#is',
            $html,
            -1,
            PREG_SPLIT_DELIM_CAPTURE
        );
        if (!is_array($parts)) {
            return $html;
        }

        $patterns = [
            // emails
            '~([\w.+\-]{1,64}@[\w\-]{1,255}(?:\.[\w\-]{2,})+)~i' =>
                static fn(array $m): string => '<a href="mailto:' . esc_attr($m[1]) . '">' . esc_html($m[1]) . '</a>',
            // US-style phone numbers (with optional + country code, parens, dashes, dots, spaces)
            '~(?<![\w/])(\+?\d{1,3}[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}(?![\w/])~' =>
                static function (array $m): string {
                    $tel = preg_replace('/[^\d+]/', '', $m[0]);
                    return '<a href="tel:' . esc_attr($tel) . '">' . esc_html($m[0]) . '</a>';
                },
            // decimal lat,lng coordinate pairs
            '~(?<![\w/])(-?\d{1,3}\.\d{3,8})\s*,\s*(-?\d{1,3}\.\d{3,8})(?![\w/])~' =>
                static function (array $m): string {
                    $url = 'https://www.google.com/maps?q=' . urlencode($m[1] . ',' . $m[2]);
                    return '<a href="' . esc_attr($url) . '" target="_blank" rel="noopener">' . esc_html($m[1] . ', ' . $m[2]) . '</a>';
                },
        ];

        foreach ($parts as $i => $chunk) {
            // Skip protected blocks captured by the split.
            if ($i % 2 === 1) {
                continue;
            }
            // Tokenize HTML tags so we only touch text nodes.
            $tokens = preg_split('/(<[^>]+>)/', $chunk, -1, PREG_SPLIT_DELIM_CAPTURE);
            if (!is_array($tokens)) {
                continue;
            }
            foreach ($tokens as $t => $tok) {
                if ($t % 2 === 1) {
                    continue; // tag
                }
                if ($tok === '') {
                    continue;
                }
                foreach ($patterns as $pat => $cb) {
                    $tok = preg_replace_callback($pat, $cb, $tok);
                }
                $tokens[$t] = $tok;
            }
            $parts[$i] = implode('', $tokens);
        }

        return implode('', $parts);
    }

    // ----------------------------------------------------------------------
    // Content tab
    // ----------------------------------------------------------------------

    private function register_general_controls(): void
    {
        $this->start_controls_section('section_general', [
            'label' => __('General', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('enable_print', [
            'label'        => __('Enable Print button', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('Adds a "Print guide" button above the menu. The print stylesheet shows only the guide content.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_fab', [
            'label'        => __('Enable floating help button (FAB)', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'prefix_class' => 'dccgg-fab--',
            'description'  => __('When on, the widget collapses into a small floating button. Tapping it opens the guide as a centered modal.', 'dcc-guest-guide'),
        ]);

        $this->add_control('fab_icon', [
            'label'     => __('FAB icon', 'dcc-guest-guide'),
            'type'      => Controls_Manager::ICONS,
            'default'   => ['value' => 'fas fa-book-open', 'library' => 'solid'],
            'condition' => ['enable_fab' => 'yes'],
        ]);

        $this->add_control('heading_show', [
            'label'        => __('Show heading', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
        ]);

        $this->add_control('heading_text', [
            'label'     => __('Heading text', 'dcc-guest-guide'),
            'type'      => Controls_Manager::TEXT,
            'default'   => __('Guest Guide', 'dcc-guest-guide'),
            'condition' => ['heading_show' => 'yes'],
        ]);

        $this->end_controls_section();
    }

    private function register_sections_controls(): void
    {
        $this->start_controls_section('section_sections', [
            'label' => __('Sections (Menu Hub)', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        // Welcome Pack: inserts a typical hospitality starter set (Wi-Fi /
        // Hot Tub / Trash / Checkout / Local Eats / Emergency) into the
        // Sections and Items repeaters in one click. Wired through the
        // [data-dccgg-welcome-pack] hook on the frontend script — which is
        // also loaded into the editor preview iframe via the preview enqueue.
        $this->add_control('welcome_pack_notice', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => '<div class="elementor-panel-alert elementor-panel-alert-info" style="margin-bottom:8px;">' .
                                  esc_html__('First time? Insert a hospitality starter pack (6 sections + items) — Wi-Fi, Hot Tub, Trash, Checkout, Local Eats, Emergency.', 'dcc-guest-guide') .
                                  '<br><button type="button" class="elementor-button elementor-button-default" data-dccgg-welcome-pack style="margin-top:6px;">' .
                                  esc_html__('Insert Welcome Pack', 'dcc-guest-guide') .
                                  '</button></div>',
            'content_classes' => 'elementor-descriptor',
        ]);

        $repeater = new Repeater();
        $repeater->add_control('section_key', [
            'label'       => __('Section key', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'description' => __('Short identifier (e.g. "wifi", "hot-tub"). Items reference this to land in this section. Also used for share links: ?guide=KEY.', 'dcc-guest-guide'),
        ]);
        $repeater->add_control('section_title', [
            'label'       => __('Title', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
        ]);
        $repeater->add_control('section_desc', [
            'label' => __('Description', 'dcc-guest-guide'),
            'type'  => Controls_Manager::TEXTAREA,
        ]);
        $repeater->add_control('section_icon', [
            'label'   => __('Icon', 'dcc-guest-guide'),
            'type'    => Controls_Manager::ICONS,
            'default' => ['value' => 'fas fa-info', 'library' => 'solid'],
        ]);

        $repeater->add_control('procedure_mode', [
            'label'        => __('Render items as a numbered procedure', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'description'  => __('Items in this section render as Step 1, 2, 3… with a connecting progress line. Use for instruction-style sections like "How to start the hot tub".', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('enable_quick_action', [
            'label'        => __('Enable Quick Action chip', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
        ]);
        $repeater->add_control('quick_action_type', [
            'label'     => __('Action type', 'dcc-guest-guide'),
            'type'      => Controls_Manager::SELECT,
            'default'   => 'copy',
            'options'   => [
                'copy' => __('Copy text', 'dcc-guest-guide'),
                'link' => __('External link', 'dcc-guest-guide'),
            ],
            'condition' => ['enable_quick_action' => 'yes'],
        ]);
        $repeater->add_control('quick_action_val', [
            'label'     => __('Value / URL', 'dcc-guest-guide'),
            'type'      => Controls_Manager::TEXT,
            'condition' => ['enable_quick_action' => 'yes'],
        ]);
        $repeater->add_control('quick_action_icon', [
            'label'     => __('Chip icon', 'dcc-guest-guide'),
            'type'      => Controls_Manager::ICONS,
            'default'   => ['value' => 'fas fa-bolt', 'library' => 'solid'],
            'condition' => ['enable_quick_action' => 'yes'],
        ]);

        $this->add_control('guide_sections', [
            'label'         => __('Sections', 'dcc-guest-guide'),
            'type'          => Controls_Manager::REPEATER,
            'fields'        => $repeater->get_controls(),
            'title_field'   => '{{{ section_title || section_key || "Section" }}}',
            'prevent_empty' => false,
        ]);

        $this->end_controls_section();
    }

    private function register_items_controls(): void
    {
        $this->start_controls_section('section_items', [
            'label' => __('Guide Items', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('items_reload_notice', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => '<div class="elementor-panel-alert elementor-panel-alert-info" style="margin-bottom:8px;">' .
                                  esc_html__('The Section dropdown below is populated from the Sections panel. If you just added a new section, save the widget and reopen this panel for it to appear in the list.', 'dcc-guest-guide') .
                                  '</div>',
            'content_classes' => 'elementor-descriptor',
        ]);

        $orphans = $this->find_orphan_items();
        if (!empty($orphans)) {
            $this->add_control('items_orphan_warning', [
                'type'            => Controls_Manager::RAW_HTML,
                'raw'             => '<div class="elementor-panel-alert elementor-panel-alert-warning" style="margin-bottom:8px;">' .
                                      esc_html(sprintf(
                                          /* translators: %s: comma-separated item titles */
                                          __('These items point at a section that no longer exists and will not appear on the page: %s. Re-pick a Section for each in the list below.', 'dcc-guest-guide'),
                                          implode(', ', $orphans)
                                      )) .
                                      '</div>',
                'content_classes' => 'elementor-descriptor',
            ]);
        }

        $repeater = new Repeater();
        $repeater->add_control('item_section', [
            'label'       => __('Section', 'dcc-guest-guide'),
            'type'        => Controls_Manager::SELECT,
            'options'     => $this->sections_options(),
            'label_block' => true,
        ]);
        $repeater->add_control('item_title', [
            'label'       => __('Item title', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
        ]);
        $repeater->add_control('item_icon', [
            'label'   => __('Icon', 'dcc-guest-guide'),
            'type'    => Controls_Manager::ICONS,
            'default' => ['value' => 'fas fa-check', 'library' => 'solid'],
        ]);

        $repeater->add_control('content_source', [
            'label'   => __('Content source', 'dcc-guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'wysiwyg',
            'options' => [
                'wysiwyg'  => __('WYSIWYG editor', 'dcc-guest-guide'),
                'template' => __('Elementor template', 'dcc-guest-guide'),
            ],
        ]);
        $repeater->add_control('item_content', [
            'label'     => __('Content', 'dcc-guest-guide'),
            'type'      => Controls_Manager::WYSIWYG,
            'condition' => ['content_source' => 'wysiwyg'],
        ]);
        $repeater->add_control('item_template', [
            'label'       => __('Template', 'dcc-guest-guide'),
            'type'        => Controls_Manager::SELECT,
            'options'     => $this->template_options(),
            'default'     => '',
            'label_block' => true,
            'condition'   => ['content_source' => 'template'],
        ]);

        $repeater->add_control('enable_read_more', [
            'label'        => __('Read More / Less toggle', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'condition'    => ['content_source' => 'wysiwyg'],
            'description'  => __('Collapses long content with a fade gradient and a "Read More" button.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('item_copy', [
            'label'        => __('Copy button', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
        ]);
        $repeater->add_control('item_copy_value', [
            'label'     => __('Value to copy', 'dcc-guest-guide'),
            'type'      => Controls_Manager::TEXT,
            'condition' => ['item_copy' => 'yes'],
        ]);

        $repeater->add_control('media_type', [
            'label'   => __('Media', 'dcc-guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'none',
            'options' => [
                'none'  => __('None', 'dcc-guest-guide'),
                'image' => __('Image', 'dcc-guest-guide'),
                'video' => __('Video (YouTube / Vimeo / self-hosted)', 'dcc-guest-guide'),
            ],
        ]);
        $repeater->add_control('item_image', [
            'label'     => __('Image', 'dcc-guest-guide'),
            'type'      => Controls_Manager::MEDIA,
            'condition' => ['media_type' => 'image'],
        ]);
        $repeater->add_control('item_video', [
            'label'       => __('Video URL', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'description' => __('Accepts YouTube (watch / embed / shorts / youtu.be), Vimeo, or self-hosted mp4/webm/mov.', 'dcc-guest-guide'),
            'condition'   => ['media_type' => 'video'],
        ]);

        $repeater->add_control('enable_map', [
            'label'        => __('Map link button', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
        ]);
        $repeater->add_control('map_url', [
            'label'         => __('Map URL', 'dcc-guest-guide'),
            'type'          => Controls_Manager::URL,
            'show_external' => true,
            'condition'     => ['enable_map' => 'yes'],
        ]);

        $repeater->add_control('item_badge', [
            'label'   => __('Badge text (optional)', 'dcc-guest-guide'),
            'type'    => Controls_Manager::TEXT,
            'description' => __('Tiny corner label e.g. "NEW" or "IMPORTANT".', 'dcc-guest-guide'),
        ]);

        $this->add_control('guide_items', [
            'label'         => __('Items', 'dcc-guest-guide'),
            'type'          => Controls_Manager::REPEATER,
            'fields'        => $repeater->get_controls(),
            'title_field'   => '{{{ item_title || "Item" }}}',
            'prevent_empty' => false,
        ]);

        $this->end_controls_section();
    }

    private function register_search_controls(): void
    {
        $this->start_controls_section('section_search', [
            'label' => __('Search (Cmd-K)', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('enable_search', [
            'label'        => __('Enable search', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('Adds a search box at the top of the menu hub. Also bound to ⌘K / Ctrl+K.', 'dcc-guest-guide'),
        ]);

        $this->add_control('search_placeholder', [
            'label'     => __('Placeholder', 'dcc-guest-guide'),
            'type'      => Controls_Manager::TEXT,
            'default'   => __('Search the guide… (⌘K)', 'dcc-guest-guide'),
            'condition' => ['enable_search' => 'yes'],
        ]);

        $this->add_control('search_no_results', [
            'label'     => __('No-results message', 'dcc-guest-guide'),
            'type'      => Controls_Manager::TEXT,
            'default'   => __('No matches. Try a different keyword.', 'dcc-guest-guide'),
            'condition' => ['enable_search' => 'yes'],
        ]);

        $this->add_control('include_templates_in_search', [
            'label'        => __('Include Elementor-template content in search', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'condition'    => ['enable_search' => 'yes'],
            'description'  => __('Off by default — turning this on renders each referenced template once at page-load to index its text. Adds server cost; only enable if guests search for content that lives inside templates.', 'dcc-guest-guide'),
        ]);

        $this->end_controls_section();
    }

    private function register_strings_controls(): void
    {
        $this->start_controls_section('section_strings', [
            'label' => __('Labels & Strings', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $strings = [
            'str_back'         => [__('Back button', 'dcc-guest-guide'),        __('Back', 'dcc-guest-guide')],
            'str_print'        => [__('Print button', 'dcc-guest-guide'),       __('Print guide', 'dcc-guest-guide')],
            'str_read_more'    => [__('Read More', 'dcc-guest-guide'),          __('Read more', 'dcc-guest-guide')],
            'str_read_less'    => [__('Read Less', 'dcc-guest-guide'),          __('Read less', 'dcc-guest-guide')],
            'str_copy'         => [__('Copy button', 'dcc-guest-guide'),        __('Copy', 'dcc-guest-guide')],
            'str_copied'       => [__('Copied confirmation', 'dcc-guest-guide'),__('Copied!', 'dcc-guest-guide')],
            'str_directions'   => [__('Directions button', 'dcc-guest-guide'),  __('Directions', 'dcc-guest-guide')],
            'str_fab_open'     => [__('FAB tooltip / aria-label', 'dcc-guest-guide'), __('Open guest guide', 'dcc-guest-guide')],
            'str_fab_close'    => [__('FAB close aria-label', 'dcc-guest-guide'),     __('Close guide', 'dcc-guest-guide')],
            'str_theme_toggle' => [__('Theme toggle aria-label', 'dcc-guest-guide'),  __('Toggle dark mode', 'dcc-guest-guide')],
            'str_qr_close'     => [__('QR close aria-label', 'dcc-guest-guide'),      __('Close QR code', 'dcc-guest-guide')],
            'str_share'        => [__('Share button', 'dcc-guest-guide'),       __('Share', 'dcc-guest-guide')],
            'str_share_copied' => [__('Share-link copied', 'dcc-guest-guide'),  __('Link copied!', 'dcc-guest-guide')],
        ];

        foreach ($strings as $key => [$label, $default]) {
            $this->add_control($key, [
                'label'   => $label,
                'type'    => Controls_Manager::TEXT,
                'default' => $default,
            ]);
        }

        $this->end_controls_section();
    }

    // ----------------------------------------------------------------------
    // Style tab
    // ----------------------------------------------------------------------

    private function register_theme_controls(): void
    {
        $this->start_controls_section('section_style_theme', [
            'label' => __('Theme Preset & Dark Mode', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('theme_preset', [
            'label'        => __('Preset', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'custom',
            'options'      => [
                'custom'   => __('Custom (use color controls below)', 'dcc-guest-guide'),
                'coastal'  => __('Coastal', 'dcc-guest-guide'),
                'hotel'    => __('Hotel', 'dcc-guest-guide'),
                'bohemian' => __('Bohemian', 'dcc-guest-guide'),
                'minimal'  => __('Minimal', 'dcc-guest-guide'),
                'dark'     => __('Dark', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-preset-',
            'description'  => __('Presets apply a coordinated palette via CSS variables. Pick "Custom" to use the individual color controls.', 'dcc-guest-guide'),
        ]);

        $this->add_control('dark_mode', [
            'label'        => __('Dark mode', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'off',
            'options'      => [
                'off'    => __('Off', 'dcc-guest-guide'),
                'auto'   => __('Auto (follow system preference)', 'dcc-guest-guide'),
                'always' => __('Always on', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-dark-',
        ]);

        $this->add_control('show_theme_toggle', [
            'label'        => __('Show light/dark toggle button', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'condition'    => ['dark_mode!' => 'off'],
            'description'  => __('Lets visitors override the system preference. Their choice is remembered in localStorage.', 'dcc-guest-guide'),
        ]);

        $this->end_controls_section();
    }

    private function register_layout_controls(): void
    {
        $this->start_controls_section('section_style_layout', [
            'label' => __('Layout & Interaction', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('menu_layout', [
            'label'        => __('Menu layout', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'grid',
            'options'      => [
                'grid'       => __('Grid', 'dcc-guest-guide'),
                'list'       => __('List', 'dcc-guest-guide'),
                'masonry'    => __('Masonry / bento (mixed sizes)', 'dcc-guest-guide'),
                'carousel'   => __('Carousel (snap-scroll on mobile)', 'dcc-guest-guide'),
                'split-pane' => __('Split-pane (menu left, detail right ≥ 1024px)', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-layout-',
        ]);

        $this->add_control('reveal_mode', [
            'label'        => __('Reveal mode', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'stage',
            'options'      => [
                'stage'     => __('Stage swap (default)', 'dcc-guest-guide'),
                'accordion' => __('Accordion (inline expand)', 'dcc-guest-guide'),
                'flip'      => __('Flip card (3D rotate)', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-reveal-',
            'description'  => __('Flip-card falls back to stage-swap automatically when paired with List / Carousel / Split-pane.', 'dcc-guest-guide'),
        ]);

        $this->add_control('icon_position', [
            'label'        => __('Icon placement', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'top',
            'options'      => [
                'top'       => __('Top (centered)', 'dcc-guest-guide'),
                'left'      => __('Left of text', 'dcc-guest-guide'),
                'right'     => __('Right of text', 'dcc-guest-guide'),
                'bottom'    => __('Bottom', 'dcc-guest-guide'),
                'corner'    => __('Corner badge (top-right overlap)', 'dcc-guest-guide'),
                'watermark' => __('Watermark (large, behind title)', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-icon-',
        ]);

        $this->add_control('icon_frame', [
            'label'        => __('Icon frame shape', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'circle',
            'options'      => [
                'circle'  => __('Circle', 'dcc-guest-guide'),
                'square'  => __('Square (rounded)', 'dcc-guest-guide'),
                'hexagon' => __('Hexagon', 'dcc-guest-guide'),
                'none'    => __('None', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-frame-',
        ]);

        $this->add_control('icon_fill', [
            'label'        => __('Frame fill style', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'solid',
            'options'      => [
                'solid'     => __('Solid tint', 'dcc-guest-guide'),
                'gradient'  => __('Gradient', 'dcc-guest-guide'),
                'outlined'  => __('Outlined', 'dcc-guest-guide'),
                'dual-tone' => __('Dual-tone', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-fill-',
            'condition'    => ['icon_frame!' => 'none'],
        ]);

        $this->add_control('hover_state', [
            'label'        => __('Tile hover effect', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'pop',
            'options'      => [
                'none'    => __('None', 'dcc-guest-guide'),
                'pop'     => __('Pop (scale)', 'dcc-guest-guide'),
                'lift'    => __('Lift + shadow', 'dcc-guest-guide'),
                'tilt'    => __('Tilt (3D parallax)', 'dcc-guest-guide'),
                'shimmer' => __('Shimmer sweep', 'dcc-guest-guide'),
                'overlay' => __('Color overlay fade', 'dcc-guest-guide'),
                'reveal'  => __('Text-shift reveal description', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-hover-',
        ]);

        $this->add_control('click_feedback', [
            'label'        => __('Click micro-feedback', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'ripple',
            'options'      => [
                'none'      => __('None', 'dcc-guest-guide'),
                'ripple'    => __('Ripple', 'dcc-guest-guide'),
                'burst'     => __('Particle burst', 'dcc-guest-guide'),
                'check'     => __('Animated checkmark (copy only)', 'dcc-guest-guide'),
                'shake'     => __('Soft shake', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-click-',
        ]);

        $this->add_control('entry_animation', [
            'label'        => __('Tile entry animation', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'fade-up',
            'options'      => [
                'none'    => __('None', 'dcc-guest-guide'),
                'fade-up' => __('Stagger fade-up on scroll-in', 'dcc-guest-guide'),
                'zoom'    => __('Stagger zoom-in', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-entry-',
        ]);

        $this->end_controls_section();
    }

    private function register_color_controls(): void
    {
        $this->start_controls_section('section_style_colors', [
            'label'     => __('Colors', 'dcc-guest-guide'),
            'tab'       => Controls_Manager::TAB_STYLE,
            'condition' => ['theme_preset' => 'custom'],
        ]);

        $this->add_control('primary_color', [
            'label'     => __('Primary / accent', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccgg-primary: {{VALUE}};'],
        ]);
        $this->add_control('text_color', [
            'label'     => __('Text', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccgg-text: {{VALUE}};'],
        ]);
        $this->add_control('muted_color', [
            'label'     => __('Muted text', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccgg-muted: {{VALUE}};'],
        ]);
        $this->add_control('detail_bg_color', [
            'label'     => __('Detail card background', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccgg-detail-bg: {{VALUE}};'],
        ]);

        $this->add_control('glassmorphism', [
            'label'        => __('Enable glassmorphism', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'prefix_class' => 'dccgg-glass-',
            'separator'    => 'before',
        ]);
        $this->add_control('glass_blur', [
            'label'      => __('Backdrop blur (px)', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 0, 'max' => 30, 'step' => 1]],
            'default'    => ['unit' => 'px', 'size' => 10],
            'selectors'  => [self::SEL => '--dccgg-glass-blur: {{SIZE}}{{UNIT}};'],
            'condition'  => ['glassmorphism' => 'yes'],
        ]);

        $this->end_controls_section();
    }

    private function register_tile_style_controls(): void
    {
        $this->start_controls_section('section_style_tile', [
            'label' => __('Tile / Card', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Background::get_type(), [
            'name'     => 'tile_bg',
            'types'    => ['classic', 'gradient'],
            'selector' => self::SEL . '.dccgg-tile',
        ]);

        $this->add_control('tile_overlay_color', [
            'label'     => __('Overlay color (for backdrop images)', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'description' => __('Painted on top of the tile background to keep foreground text readable. Leave blank for no overlay.', 'dcc-guest-guide'),
            'selectors' => [self::SEL . '.dccgg-tile::after' => 'background: {{VALUE}};'],
            'separator' => 'before',
        ]);
        $this->add_control('tile_overlay_opacity', [
            'label'     => __('Overlay opacity', 'dcc-guest-guide'),
            'type'      => Controls_Manager::SLIDER,
            'range'     => ['px' => ['min' => 0, 'max' => 100, 'step' => 1]],
            'default'   => ['size' => 0, 'unit' => 'px'],
            'selectors' => [self::SEL . '.dccgg-tile::after' => 'opacity: calc({{SIZE}} / 100);'],
            'condition' => ['tile_overlay_color!' => ''],
        ]);

        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'tile_border',
            'selector' => self::SEL . '.dccgg-tile',
            'separator' => 'before',
        ]);

        $this->add_responsive_control('tile_radius', [
            'label'      => __('Corner radius', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'default'    => ['top' => 16, 'right' => 16, 'bottom' => 16, 'left' => 16, 'unit' => 'px'],
            'selectors'  => [self::SEL . '.dccgg-tile' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('tile_shadow_tabs');

        $this->start_controls_tab('tile_shadow_normal', ['label' => __('Normal', 'dcc-guest-guide')]);
        $this->add_group_control(Group_Control_Box_Shadow::get_type(), [
            'name'     => 'tile_shadow',
            'selector' => self::SEL . '.dccgg-tile',
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('tile_shadow_hover', ['label' => __('Hover', 'dcc-guest-guide')]);
        $this->add_group_control(Group_Control_Box_Shadow::get_type(), [
            'name'     => 'tile_shadow_hover',
            'selector' => self::SEL . '.dccgg-tile:hover, ' . self::SEL . '.dccgg-tile:focus-visible',
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

        $this->add_responsive_control('tile_padding', [
            'label'      => __('Padding', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'default'    => ['top' => 24, 'right' => 24, 'bottom' => 24, 'left' => 24, 'unit' => 'px'],
            'selectors'  => [self::SEL . '.dccgg-tile' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
            'separator'  => 'before',
        ]);

        $this->add_responsive_control('tile_gap', [
            'label'      => __('Gap between tiles', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'default'    => ['size' => 20, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 0, 'max' => 60, 'step' => 1]],
            'selectors'  => [self::SEL . '.dccgg-menu' => '--dccgg-gap: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_responsive_control('tile_min_width', [
            'label'      => __('Min tile width (grid/masonry)', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'default'    => ['size' => 200, 'unit' => 'px'],
            'tablet_default' => ['size' => 180, 'unit' => 'px'],
            'mobile_default' => ['size' => 140, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 120, 'max' => 400, 'step' => 5]],
            'selectors'  => [self::SEL . '.dccgg-menu' => '--dccgg-tile-min: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_control('css_filters_heading', [
            'type'      => Controls_Manager::HEADING,
            'label'     => __('CSS filters', 'dcc-guest-guide'),
            'separator' => 'before',
        ]);

        $this->add_control('tile_filter_blur', [
            'label' => __('Blur (px)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['px' => ['min' => 0, 'max' => 10, 'step' => 0.1]],
            'selectors' => [self::SEL => '--dccgg-tile-filter-blur: {{SIZE}}px;'],
        ]);
        $this->add_control('tile_filter_brightness', [
            'label' => __('Brightness (%)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['%' => ['min' => 50, 'max' => 150, 'step' => 1]],
            'default' => ['size' => 100, 'unit' => '%'],
            'selectors' => [self::SEL => '--dccgg-tile-filter-brightness: {{SIZE}}%;'],
        ]);
        $this->add_control('tile_filter_saturate', [
            'label' => __('Saturate (%)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['%' => ['min' => 0, 'max' => 200, 'step' => 1]],
            'default' => ['size' => 100, 'unit' => '%'],
            'selectors' => [self::SEL => '--dccgg-tile-filter-saturate: {{SIZE}}%;'],
        ]);
        $this->add_control('tile_filter_grayscale', [
            'label' => __('Grayscale on hover (%)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['%' => ['min' => 0, 'max' => 100, 'step' => 1]],
            'selectors' => [self::SEL => '--dccgg-tile-filter-grayscale-hover: {{SIZE}}%;'],
        ]);

        $this->end_controls_section();
    }

    private function register_quick_action_style_controls(): void
    {
        $this->start_controls_section('section_style_qa', [
            'label' => __('Quick Action Chip', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('qa_bg', [
            'label'     => __('Background', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-quick-action' => 'background: {{VALUE}};'],
        ]);
        $this->add_control('qa_color', [
            'label'     => __('Icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-quick-action' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('qa_bg_hover', [
            'label'     => __('Background (hover)', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-quick-action:hover, ' . self::SEL . '.dccgg-quick-action:focus-visible' => 'background: {{VALUE}};'],
        ]);
        $this->add_control('qa_color_hover', [
            'label'     => __('Icon color (hover)', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-quick-action:hover, ' . self::SEL . '.dccgg-quick-action:focus-visible' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('qa_size', [
            'label' => __('Size (px)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['px' => ['min' => 20, 'max' => 60, 'step' => 1]],
            'default' => ['size' => 32, 'unit' => 'px'],
            'selectors' => [self::SEL . '.dccgg-quick-action' => 'width: {{SIZE}}{{UNIT}}; height: {{SIZE}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_button_style_controls(): void
    {
        $this->start_controls_section('section_style_buttons', [
            'label' => __('Buttons', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'btn_typography',
            'selector' => self::SEL . '.dccgg-btn',
        ]);

        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'btn_border',
            'selector' => self::SEL . '.dccgg-btn',
        ]);

        $this->add_control('btn_radius', [
            'label'      => __('Border radius', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccgg-btn' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->add_control('btn_padding', [
            'label'      => __('Padding', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccgg-btn' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('btn_color_tabs');

        $this->start_controls_tab('btn_tab_normal', ['label' => __('Normal', 'dcc-guest-guide')]);
        $this->add_control('btn_txt', [
            'label'     => __('Text color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-btn' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('btn_bg', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-btn' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('btn_tab_hover', ['label' => __('Hover', 'dcc-guest-guide')]);
        $this->add_control('btn_txt_hover', [
            'label'     => __('Text color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-btn:hover, ' . self::SEL . '.dccgg-btn:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->add_control('btn_bg_hover', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-btn:hover, ' . self::SEL . '.dccgg-btn:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    private function register_detail_style_controls(): void
    {
        $this->start_controls_section('section_style_detail', [
            'label' => __('Detail Card', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'detail_typography',
            'selector' => self::SEL . '.dccgg-detail',
        ]);

        $this->add_responsive_control('detail_padding', [
            'label'      => __('Padding', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'default'    => ['top' => 24, 'right' => 24, 'bottom' => 24, 'left' => 24, 'unit' => 'px'],
            'selectors'  => [self::SEL . '.dccgg-detail' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->add_control('item_separator', [
            'label'        => __('Show separators between items', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'prefix_class' => 'dccgg-sep-',
        ]);

        $this->end_controls_section();
    }

    private function register_flip_card_controls(): void
    {
        $this->start_controls_section('section_style_flip', [
            'label'     => __('Flip Card', 'dcc-guest-guide'),
            'tab'       => Controls_Manager::TAB_STYLE,
            'condition' => ['reveal_mode' => 'flip'],
        ]);

        $this->add_control('flip_axis', [
            'label'        => __('Flip axis', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'y',
            'options'      => [
                'y' => __('Horizontal (rotate around Y)', 'dcc-guest-guide'),
                'x' => __('Vertical (rotate around X)', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-flip-axis-',
        ]);

        $this->add_control('flip_duration', [
            'label' => __('Duration (ms)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['px' => ['min' => 100, 'max' => 2000, 'step' => 50]],
            'default' => ['size' => 600, 'unit' => 'px'],
            'selectors' => [self::SEL => '--dccgg-flip-duration: {{SIZE}}ms;'],
        ]);

        $this->add_control('flip_perspective', [
            'label' => __('3D perspective (px)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['px' => ['min' => 400, 'max' => 2000, 'step' => 50]],
            'default' => ['size' => 1000, 'unit' => 'px'],
            'selectors' => [self::SEL . '.dccgg-menu' => 'perspective: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_control('flip_back_bg', [
            'label'     => __('Back-face background', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-flip-back' => 'background: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_fab_style_controls(): void
    {
        $this->start_controls_section('section_style_fab', [
            'label'     => __('FAB (Floating Button)', 'dcc-guest-guide'),
            'tab'       => Controls_Manager::TAB_STYLE,
            'condition' => ['enable_fab' => 'yes'],
        ]);

        $this->add_control('fab_position', [
            'label'        => __('Position', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'bottom-right',
            'options'      => [
                'bottom-right' => __('Bottom right', 'dcc-guest-guide'),
                'bottom-left'  => __('Bottom left', 'dcc-guest-guide'),
                'top-right'    => __('Top right', 'dcc-guest-guide'),
                'top-left'     => __('Top left', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-fabpos-',
        ]);

        $this->add_control('fab_size', [
            'label' => __('Size (px)', 'dcc-guest-guide'),
            'type'  => Controls_Manager::SLIDER,
            'range' => ['px' => ['min' => 40, 'max' => 100, 'step' => 2]],
            'default' => ['size' => 60, 'unit' => 'px'],
            'selectors' => [self::SEL . '.dccgg-fab' => 'width: {{SIZE}}{{UNIT}}; height: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_control('fab_bg', [
            'label'     => __('Background', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-fab' => 'background: {{VALUE}};'],
        ]);
        $this->add_control('fab_color', [
            'label'     => __('Icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-fab' => 'color: {{VALUE}};'],
        ]);

        $this->add_control('fab_entry', [
            'label'        => __('Entry animation', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'scale',
            'options'      => [
                'none'  => __('None', 'dcc-guest-guide'),
                'scale' => __('Scale in', 'dcc-guest-guide'),
                'slide' => __('Slide up', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-fabentry-',
        ]);

        $this->end_controls_section();
    }

    private function register_transitions_controls(): void
    {
        $this->start_controls_section('section_style_transitions', [
            'label' => __('Transitions', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('transition_duration', [
            'label'     => __('Duration (ms)', 'dcc-guest-guide'),
            'type'      => Controls_Manager::SLIDER,
            'range'     => ['px' => ['min' => 50, 'max' => 1500, 'step' => 25]],
            'default'   => ['size' => 300, 'unit' => 'px'],
            'selectors' => [self::SEL => '--dccgg-transition-duration: {{SIZE}}ms;'],
        ]);

        $this->add_control('transition_easing', [
            'label'   => __('Easing', 'dcc-guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'ease',
            'options' => [
                'linear'                                   => 'linear',
                'ease'                                     => 'ease',
                'ease-in'                                  => 'ease-in',
                'ease-out'                                 => 'ease-out',
                'ease-in-out'                              => 'ease-in-out',
                'cubic-bezier(.34,1.56,.64,1)'             => __('Bouncy', 'dcc-guest-guide'),
                'cubic-bezier(.175,.885,.32,1.275)'        => __('Spring', 'dcc-guest-guide'),
            ],
            'selectors' => [self::SEL => '--dccgg-transition-easing: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    // ----------------------------------------------------------------------
    // Render
    // ----------------------------------------------------------------------

    protected function render(): void
    {
        if (!Plugin::instance()->dependencies_present()) {
            return;
        }

        $s         = $this->get_settings_for_display();
        $sections  = (array) ($s['guide_sections'] ?? []);
        $items_raw = (array) ($s['guide_items'] ?? []);

        // Bucket items by section_key; silently drop items with no/invalid key
        // so a stray item can't crash the layout. The editor preview surfaces
        // the count discrepancy implicitly (item appears in panel, not on page).
        $valid_keys = [];
        foreach ($sections as $sec) {
            $key = trim((string) ($sec['section_key'] ?? ''));
            if ($key !== '') {
                $valid_keys[$key] = true;
            }
        }
        $enable_search       = ($s['enable_search'] ?? 'yes') === 'yes';
        $include_tpl_search  = ($s['include_templates_in_search'] ?? '') === 'yes';

        $items_by_section = [];
        $search_index     = [];
        foreach ($items_raw as $i => $item) {
            $key = trim((string) ($item['item_section'] ?? ''));
            if ($key === '' || !isset($valid_keys[$key])) {
                continue;
            }
            $items_by_section[$key][] = $item;
            if ($enable_search) {
                $search_index[] = [
                    'section'  => $key,
                    'item_idx' => count($items_by_section[$key]) - 1,
                    'title'    => (string) ($item['item_title'] ?? ''),
                    'text'     => self::extract_search_text($item, $include_tpl_search),
                ];
            }
        }

        $reveal_mode  = (string) ($s['reveal_mode'] ?? 'stage');
        $menu_layout  = (string) ($s['menu_layout'] ?? 'grid');
        // Flip-card falls back to stage-swap when paired with incompatible layouts.
        $flip_incompatible = ['list', 'carousel', 'split-pane'];
        if ($reveal_mode === 'flip' && in_array($menu_layout, $flip_incompatible, true)) {
            $reveal_mode = 'stage';
        }

        $enable_fab     = ($s['enable_fab'] ?? '') === 'yes';
        $enable_print   = ($s['enable_print'] ?? '') === 'yes';
        $dark_mode      = (string) ($s['dark_mode'] ?? 'off');
        $show_toggle    = ($s['show_theme_toggle'] ?? 'yes') === 'yes';
        $theme_preset   = (string) ($s['theme_preset'] ?? 'custom');

        $config = [
            'revealMode'   => $reveal_mode,
            'menuLayout'   => $menu_layout,
            'enableSearch' => $enable_search,
            'enableFab'    => $enable_fab,
            'darkMode'     => $dark_mode,
            'themePreset'  => $theme_preset,
            'searchIndex'  => $search_index,
            'themePresets' => self::theme_presets(),
            'strings'      => [
                'copied'      => (string) ($s['str_copied'] ?? 'Copied!'),
                'readMore'    => (string) ($s['str_read_more'] ?? 'Read more'),
                'readLess'    => (string) ($s['str_read_less'] ?? 'Read less'),
                'noResults'   => (string) ($s['search_no_results'] ?? 'No matches.'),
                'shareCopied' => (string) ($s['str_share_copied'] ?? 'Link copied!'),
                'qrClose'     => (string) ($s['str_qr_close'] ?? 'Close'),
            ],
        ];

        $root_class = 'dccgg-root';
        ?>
        <div class="<?php echo esc_attr($root_class); ?>"
             data-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">

            <?php if ($enable_fab) : ?>
                <button type="button" class="dccgg-fab" aria-label="<?php echo esc_attr($s['str_fab_open']); ?>">
                    <?php \Elementor\Icons_Manager::render_icon((array) ($s['fab_icon'] ?? []), ['aria-hidden' => 'true']); ?>
                </button>
                <div class="dccgg-overlay" hidden></div>
            <?php endif; ?>

            <div class="dccgg-wrapper">
                <?php if ($enable_fab) : ?>
                    <button type="button" class="dccgg-fab-close" aria-label="<?php echo esc_attr($s['str_fab_close']); ?>">&times;</button>
                <?php endif; ?>

                <?php if ($s['heading_show'] === 'yes' && (string) $s['heading_text'] !== '') : ?>
                    <h2 class="dccgg-heading"><?php echo esc_html($s['heading_text']); ?></h2>
                <?php endif; ?>

                <div class="dccgg-toolbar">
                    <?php if ($enable_print) : ?>
                        <button type="button" class="dccgg-btn dccgg-print" onclick="window.print()">
                            <i class="fas fa-print" aria-hidden="true"></i>
                            <?php echo esc_html($s['str_print']); ?>
                        </button>
                    <?php endif; ?>

                    <?php if ($dark_mode !== 'off' && $show_toggle) : ?>
                        <button type="button" class="dccgg-theme-toggle" aria-label="<?php echo esc_attr($s['str_theme_toggle']); ?>" aria-pressed="false">
                            <i class="fas fa-moon dccgg-theme-icon-dark" aria-hidden="true"></i>
                            <i class="fas fa-sun dccgg-theme-icon-light" aria-hidden="true"></i>
                        </button>
                    <?php endif; ?>
                </div>

                <?php if ($enable_search) : ?>
                    <div class="dccgg-search">
                        <i class="fas fa-search dccgg-search-icon" aria-hidden="true"></i>
                        <input type="search" class="dccgg-search-input"
                               placeholder="<?php echo esc_attr($s['search_placeholder']); ?>"
                               aria-label="<?php echo esc_attr($s['search_placeholder']); ?>"
                               autocomplete="off">
                        <kbd class="dccgg-search-kbd">⌘K</kbd>
                        <div class="dccgg-search-results" role="listbox" hidden></div>
                        <span class="dccgg-sr-only" aria-live="polite" data-dccgg-results-count></span>
                    </div>
                <?php endif; ?>

                <div class="dccgg-stage-container">
                    <?php $this->render_menu($sections, $items_by_section, $s, $reveal_mode); ?>
                    <?php if ($reveal_mode === 'stage') : ?>
                        <?php $this->render_stage($sections, $items_by_section, $s); ?>
                    <?php endif; ?>
                </div>

                <?php if ($reveal_mode !== 'stage') : ?>
                    <?php // For accordion/flip, item content is inline in the menu — no separate stage needed. ?>
                <?php endif; ?>
            </div>

            <?php // Shared dialogs portaled out of the widget at runtime. ?>
            <div class="dccgg-qr-overlay" hidden></div>
            <div class="dccgg-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="dccgg-qr-title" hidden>
                <button type="button" class="dccgg-qr-close" aria-label="<?php echo esc_attr($s['str_qr_close']); ?>">&times;</button>
                <h3 id="dccgg-qr-title" class="dccgg-qr-title"></h3>
                <div class="dccgg-qr-canvas" aria-hidden="true"></div>
                <p class="dccgg-qr-caption"></p>
            </div>
        </div>
        <?php
    }

    /**
     * Render the menu hub. For accordion/flip reveal modes, item content is
     * rendered inline (inside the tile or as an expanded panel) so no stage
     * swap is needed.
     */
    private function render_menu(array $sections, array $items_by_section, array $s, string $reveal_mode): void
    {
        $label_back   = (string) ($s['str_back'] ?? 'Back');
        $widget_uid   = $this->get_id();
        ?>
        <div class="dccgg-menu">
            <?php foreach ($sections as $sec) :
                $key   = trim((string) ($sec['section_key'] ?? ''));
                if ($key === '') { continue; }
                $title = (string) ($sec['section_title'] ?? $key);
                $items = $items_by_section[$key] ?? [];
                $qa_on = ($sec['enable_quick_action'] ?? '') === 'yes' && trim((string) ($sec['quick_action_val'] ?? '')) !== '';
                $procedure = ($sec['procedure_mode'] ?? '') === 'yes';

                // Stable IDs for a11y linkage. Hashed key so a quoted/odd
                // section key still produces a valid attribute value.
                $safe_key   = substr(sha1($widget_uid . '|' . $key), 0, 10);
                $tile_id    = 'dccgg-tile-' . $safe_key;
                $panel_id   = 'dccgg-panel-' . $safe_key;
                ?>
                <div class="dccgg-tile-wrap<?php echo $procedure ? ' dccgg-tile-wrap--procedure' : ''; ?>" data-section-key="<?php echo esc_attr($key); ?>" data-procedure="<?php echo $procedure ? '1' : '0'; ?>">
                    <?php if ($reveal_mode === 'flip') : ?>
                        <div class="dccgg-flip-card">
                            <div class="dccgg-flip-inner">
                                <button type="button" class="dccgg-tile dccgg-flip-front" data-key="<?php echo esc_attr($key); ?>" aria-expanded="false">
                                    <?php $this->render_tile_inner($sec, count($items)); ?>
                                </button>
                                <div class="dccgg-flip-back" role="region" aria-label="<?php echo esc_attr($title); ?>">
                                    <button type="button" class="dccgg-flip-close" aria-label="<?php echo esc_attr($label_back); ?>">&times;</button>
                                    <h3 class="dccgg-flip-title"><?php echo esc_html($title); ?></h3>
                                    <?php if ($procedure) : ?>
                                        <ol class="dccgg-flip-items dccgg-procedure">
                                            <?php foreach ($items as $it) { echo '<li>'; $this->render_item($it, $s, true); echo '</li>'; } ?>
                                        </ol>
                                    <?php else : ?>
                                        <div class="dccgg-flip-items">
                                            <?php foreach ($items as $it) { $this->render_item($it, $s, true); } ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    <?php elseif ($reveal_mode === 'accordion') : ?>
                        <button type="button" id="<?php echo esc_attr($tile_id); ?>" class="dccgg-tile dccgg-accordion-toggle" data-key="<?php echo esc_attr($key); ?>" aria-expanded="false" aria-controls="<?php echo esc_attr($panel_id); ?>">
                            <?php $this->render_tile_inner($sec, count($items)); ?>
                        </button>
                        <div id="<?php echo esc_attr($panel_id); ?>" class="dccgg-accordion-panel" role="region" aria-labelledby="<?php echo esc_attr($tile_id); ?>" hidden>
                            <?php if ($procedure) : ?>
                                <ol class="dccgg-procedure">
                                    <?php foreach ($items as $it) { echo '<li>'; $this->render_item($it, $s, true); echo '</li>'; } ?>
                                </ol>
                            <?php else : ?>
                                <?php foreach ($items as $it) { $this->render_item($it, $s, true); } ?>
                            <?php endif; ?>
                        </div>
                    <?php else : ?>
                        <button type="button" class="dccgg-tile" data-key="<?php echo esc_attr($key); ?>">
                            <?php $this->render_tile_inner($sec, count($items)); ?>
                        </button>
                    <?php endif; ?>

                    <?php if ($qa_on) :
                        $qa_type = (string) ($sec['quick_action_type'] ?? 'copy');
                        $qa_val  = (string) ($sec['quick_action_val'] ?? '');
                        $qa_icon = (array) ($sec['quick_action_icon'] ?? ['value' => 'fas fa-bolt', 'library' => 'solid']);
                        if ($qa_type === 'link') : ?>
                            <a class="dccgg-quick-action dccgg-qa-link" href="<?php echo esc_url($qa_val); ?>" target="_blank" rel="noopener" aria-label="<?php echo esc_attr($title . ' — quick link'); ?>">
                                <?php \Elementor\Icons_Manager::render_icon($qa_icon, ['aria-hidden' => 'true']); ?>
                            </a>
                        <?php else : ?>
                            <button type="button" class="dccgg-quick-action dccgg-qa-copy" data-copy="<?php echo esc_attr($qa_val); ?>" aria-label="<?php echo esc_attr($title . ' — copy'); ?>">
                                <?php \Elementor\Icons_Manager::render_icon($qa_icon, ['aria-hidden' => 'true']); ?>
                            </button>
                        <?php endif;
                    endif; ?>
                </div>
            <?php endforeach; ?>

            <?php if (empty($sections)) : ?>
                <p class="dccgg-empty-hint"><?php esc_html_e('Add sections in the widget panel to populate the guide.', 'dcc-guest-guide'); ?></p>
            <?php endif; ?>
        </div>
        <?php
    }

    private function render_tile_inner(array $sec, int $item_count): void
    {
        $title = (string) ($sec['section_title'] ?? '');
        $desc  = (string) ($sec['section_desc'] ?? '');
        $icon  = (array) ($sec['section_icon'] ?? ['value' => 'fas fa-info', 'library' => 'solid']);
        ?>
        <span class="dccgg-tile-icon-wrap">
            <span class="dccgg-tile-icon">
                <?php \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']); ?>
            </span>
        </span>
        <span class="dccgg-tile-content">
            <span class="dccgg-tile-title"><?php echo esc_html($title); ?></span>
            <?php if ($desc !== '') : ?>
                <span class="dccgg-tile-desc"><?php echo esc_html($desc); ?></span>
            <?php endif; ?>
            <?php if ($item_count > 0) : ?>
                <span class="dccgg-tile-count"><?php
                    printf(
                        esc_html(_n('%d item', '%d items', $item_count, 'dcc-guest-guide')),
                        (int) $item_count
                    );
                ?></span>
            <?php endif; ?>
        </span>
        <?php
    }

    /**
     * Render the detail stage (stage-swap reveal mode only).
     */
    private function render_stage(array $sections, array $items_by_section, array $s): void
    {
        $label_back = (string) ($s['str_back'] ?? 'Back');
        ?>
        <div class="dccgg-stage" aria-live="polite">
            <?php foreach ($sections as $sec) :
                $key = trim((string) ($sec['section_key'] ?? ''));
                if ($key === '') { continue; }
                $title = (string) ($sec['section_title'] ?? $key);
                $icon  = (array) ($sec['section_icon'] ?? ['value' => 'fas fa-info', 'library' => 'solid']);
                $items = $items_by_section[$key] ?? [];
                $procedure = ($sec['procedure_mode'] ?? '') === 'yes';
                $show_toc  = count($items) >= 4 && !$procedure;
                ?>
                <div class="dccgg-detail<?php echo $show_toc ? ' dccgg-detail--has-toc' : ''; ?>" data-key="<?php echo esc_attr($key); ?>" hidden>
                    <div class="dccgg-progress-bar" aria-hidden="true"></div>
                    <div class="dccgg-detail-header">
                        <button type="button" class="dccgg-btn dccgg-back">
                            <i class="fas fa-arrow-left" aria-hidden="true"></i> <?php echo esc_html($label_back); ?>
                        </button>
                        <h2 class="dccgg-detail-title">
                            <?php \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']); ?>
                            <span><?php echo esc_html($title); ?></span>
                        </h2>
                    </div>
                    <div class="dccgg-detail-layout">
                        <?php if ($show_toc) : ?>
                            <nav class="dccgg-toc" aria-label="<?php echo esc_attr($title); ?>">
                                <ul>
                                    <?php foreach ($items as $it_idx => $it) :
                                        $it_title = (string) ($it['item_title'] ?? '');
                                        if ($it_title === '') { continue; } ?>
                                        <li><a href="#" data-toc-item="<?php echo (int) $it_idx; ?>"><?php echo esc_html($it_title); ?></a></li>
                                    <?php endforeach; ?>
                                </ul>
                            </nav>
                        <?php endif; ?>
                        <?php if ($procedure) : ?>
                            <ol class="dccgg-detail-items dccgg-procedure">
                                <?php foreach ($items as $it) { echo '<li>'; $this->render_item($it, $s, false); echo '</li>'; } ?>
                            </ol>
                        <?php else : ?>
                            <div class="dccgg-detail-items">
                                <?php foreach ($items as $it_idx => $it) {
                                    echo '<div class="dccgg-detail-item-anchor" data-item-idx="' . (int) $it_idx . '">';
                                    $this->render_item($it, $s, false);
                                    echo '</div>';
                                } ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
        <?php
    }

    private function render_item(array $item, array $strings, bool $compact): void
    {
        $title          = (string) ($item['item_title'] ?? '');
        $icon           = (array) ($item['item_icon'] ?? ['value' => 'fas fa-check', 'library' => 'solid']);
        $source         = (string) ($item['content_source'] ?? 'wysiwyg');
        $content        = (string) ($item['item_content'] ?? '');
        $template_id    = (int) ($item['item_template'] ?? 0);
        $read_more      = ($item['enable_read_more'] ?? '') === 'yes' && $source === 'wysiwyg';
        $copy_on        = ($item['item_copy'] ?? '') === 'yes';
        $copy_val       = (string) ($item['item_copy_value'] ?? '');
        $media_type     = (string) ($item['media_type'] ?? 'none');
        $map_on         = ($item['enable_map'] ?? '') === 'yes';
        $map_url        = (string) ($item['map_url']['url'] ?? '');
        $badge          = trim((string) ($item['item_badge'] ?? ''));

        // Auto-link + read-time apply to WYSIWYG content only.
        $body_html = '';
        if ($source === 'wysiwyg') {
            $body_html = wpautop(self::auto_link_html(wp_kses_post($content)));
        }
        $read_time = $source === 'wysiwyg' ? self::read_time_text($content) : '';
        $tts_supported_text = ($source === 'wysiwyg') ? trim(wp_strip_all_tags($content)) : '';
        ?>
        <article class="dccgg-item<?php echo $compact ? ' dccgg-item--compact' : ''; ?>" data-item-title="<?php echo esc_attr($title); ?>" data-tts-text="<?php echo esc_attr(mb_substr($tts_supported_text, 0, 3000)); ?>">
            <h3 class="dccgg-item-title">
                <?php \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']); ?>
                <span><?php echo esc_html($title); ?></span>
                <?php if ($badge !== '') : ?>
                    <span class="dccgg-item-badge"><?php echo esc_html($badge); ?></span>
                <?php endif; ?>
                <?php if ($read_time !== '') : ?>
                    <span class="dccgg-read-time" aria-label="<?php echo esc_attr(sprintf(/* translators: %s: read time string */ __('Estimated read time: %s', 'dcc-guest-guide'), $read_time)); ?>">
                        <i class="fas fa-clock" aria-hidden="true"></i> <?php echo esc_html($read_time); ?>
                    </span>
                <?php endif; ?>
                <?php if ($tts_supported_text !== '') : ?>
                    <button type="button" class="dccgg-item-tts" aria-label="<?php echo esc_attr__('Read this item aloud', 'dcc-guest-guide'); ?>" hidden>
                        <i class="fas fa-volume-up" aria-hidden="true"></i>
                    </button>
                <?php endif; ?>
                <button type="button" class="dccgg-item-share" data-share-title="<?php echo esc_attr($title); ?>" aria-label="<?php echo esc_attr($strings['str_share']); ?>">
                    <i class="fas fa-link" aria-hidden="true"></i>
                </button>
            </h3>

            <div class="dccgg-item-content-wrap<?php echo $read_more ? ' dccgg-collapsible' : ''; ?>">
                <?php if ($source === 'template' && $template_id > 0) :
                    echo self::render_template($template_id); // phpcs:ignore WordPress.Security.EscapeOutput
                else : ?>
                    <div class="dccgg-item-body"><?php echo $body_html; // phpcs:ignore WordPress.Security.EscapeOutput — auto_link_html operates on already-kses'd content ?></div>
                <?php endif; ?>
            </div>

            <?php if ($read_more) : ?>
                <button type="button" class="dccgg-btn-text dccgg-read-more"
                        data-more="<?php echo esc_attr($strings['str_read_more']); ?>"
                        data-less="<?php echo esc_attr($strings['str_read_less']); ?>">
                    <?php echo esc_html($strings['str_read_more']); ?>
                </button>
            <?php endif; ?>

            <?php if ($media_type === 'image' && !empty($item['item_image']['url'])) : ?>
                <img class="dccgg-media" src="<?php echo esc_url($item['item_image']['url']); ?>" alt="<?php echo esc_attr($title); ?>" loading="lazy">
            <?php elseif ($media_type === 'video' && !empty($item['item_video'])) :
                $v = self::normalize_video_url((string) $item['item_video']);
                if ($v !== null) :
                    if ($v['self_hosted']) : ?>
                        <video class="dccgg-media" controls preload="metadata">
                            <source src="<?php echo esc_url($v['embed']); ?>">
                        </video>
                    <?php else : ?>
                        <iframe class="dccgg-media" src="<?php echo esc_url($v['embed']); ?>" loading="lazy" allowfullscreen frameborder="0" referrerpolicy="strict-origin-when-cross-origin"></iframe>
                    <?php endif;
                endif;
            endif; ?>

            <?php if ($map_on || $copy_on) : ?>
                <div class="dccgg-item-utils">
                    <?php if ($map_on && $map_url !== '') : ?>
                        <a class="dccgg-btn dccgg-map" href="<?php echo esc_url($map_url); ?>" target="_blank" rel="noopener">
                            <i class="fas fa-map-marker-alt" aria-hidden="true"></i> <?php echo esc_html($strings['str_directions']); ?>
                        </a>
                    <?php endif; ?>
                    <?php if ($copy_on && $copy_val !== '') : ?>
                        <button type="button" class="dccgg-btn dccgg-copy" data-copy="<?php echo esc_attr($copy_val); ?>">
                            <i class="fas fa-copy" aria-hidden="true"></i> <?php echo esc_html($strings['str_copy']); ?>
                        </button>
                        <button type="button" class="dccgg-btn dccgg-qr" data-qr="<?php echo esc_attr($copy_val); ?>" data-qr-title="<?php echo esc_attr($title); ?>" title="QR">
                            <i class="fas fa-qrcode" aria-hidden="true"></i>
                        </button>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
        </article>
        <?php
    }

    /**
     * Build a plaintext search-haystack for an item. WYSIWYG content is
     * stripped of tags; template content is only included when
     * $include_templates is true (server-renders each template — opt-in
     * because it costs one extra render per template per pageload).
     */
    private static function extract_search_text(array $item, bool $include_templates = false): string
    {
        $parts = [];
        $parts[] = (string) ($item['item_title'] ?? '');
        $parts[] = (string) ($item['item_badge'] ?? '');
        $source = (string) ($item['content_source'] ?? 'wysiwyg');
        if ($source === 'wysiwyg') {
            $parts[] = wp_strip_all_tags((string) ($item['item_content'] ?? ''));
        } elseif ($source === 'template' && $include_templates) {
            $tpl_id = (int) ($item['item_template'] ?? 0);
            if ($tpl_id > 0) {
                $parts[] = wp_strip_all_tags(self::render_template($tpl_id));
            }
        }
        if (($item['item_copy'] ?? '') === 'yes') {
            $parts[] = (string) ($item['item_copy_value'] ?? '');
        }
        return mb_substr(trim(preg_replace('/\s+/u', ' ', implode(' ', $parts)) ?: ''), 0, 1500);
    }

    /**
     * Render a saved Elementor template's HTML for an item's "template" content
     * source. Server-rendering on the page (rather than via AJAX) is required so
     * Elementor enqueues the template's per-widget CSS file via the normal page
     * pass — AJAX-only rendering leaves those stylesheets unloaded.
     */
    private static function render_template(int $template_id): string
    {
        if ($template_id <= 0) {
            return '';
        }
        try {
            if (class_exists('\\Elementor\\Plugin')) {
                $el = \Elementor\Plugin::instance();
                if (isset($el->frontend) && method_exists($el->frontend, 'get_builder_content_for_display')) {
                    return (string) $el->frontend->get_builder_content_for_display($template_id, true);
                }
            }
        } catch (\Throwable $e) {
            error_log('DCCGG: render_template failed for ' . $template_id . ': ' . $e->getMessage());
        }
        return '';
    }
}
