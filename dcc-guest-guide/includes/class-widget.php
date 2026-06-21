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
        // v0.9.7.14: prefer the pre-minified bundles when present (built via
        // build-min.sh at release time). Unminified sources stay in the zip
        // so the editor preview / source maps / Loco scan continue to work.
        $css_path = file_exists(DCCGG_DIR . 'assets/css/widget.min.css') ? 'assets/css/widget.min.css' : 'assets/css/widget.css';
        $js_path  = file_exists(DCCGG_DIR . 'assets/js/widget.min.js')   ? 'assets/js/widget.min.js'   : 'assets/js/widget.js';
        wp_register_style('dccgg-widget', DCCGG_URL . $css_path, $style_deps, DCCGG_VERSION);
        wp_register_script('dccgg-widget', DCCGG_URL . $js_path, [], DCCGG_VERSION, true);
    }

    /**
     * Force-enqueue assets into the Elementor editor preview iframe so the
     * JS-driven layouts, flip cards, and stage transitions actually render
     * while editing. Explicitly enqueues Font Awesome too — its registration
     * isn't guaranteed at this point on every Elementor version.
     */
    public static function enqueue_for_preview(): void
    {
        self::register_assets();
        foreach (['elementor-icons-fa-solid', 'elementor-icons-fa-regular'] as $h) {
            if (wp_style_is($h, 'registered')) {
                wp_enqueue_style($h);
            }
        }
        wp_enqueue_style('dccgg-widget');
        wp_enqueue_script('dccgg-widget');
    }

    /**
     * Enqueue into the Elementor editor (NOT the preview iframe). Required
     * so the Welcome Pack button — rendered via RAW_HTML into the panel —
     * has a click handler that actually runs in that context.
     */
    public static function enqueue_for_editor(): void
    {
        self::register_assets();
        wp_enqueue_script('dccgg-widget');

        // v0.9.4: localize editor-side data for the server-backed Export /
        // Import flow. The Elementor editor URL is ?post=ID&action=elementor,
        // so the JS reads $post_id from the query string itself, but we hand
        // it down here too as a defensive fallback. Two separate nonces so
        // Import (mutating) and Export (read-only) can be audited independently.
        $post_id = 0;
        if (isset($_GET['post'])) {
            $post_id = (int) $_GET['post'];
        } elseif (isset($_GET['post_id'])) {
            $post_id = (int) $_GET['post_id'];
        }
        wp_localize_script('dccgg-widget', 'dccggEditor', [
            'ajaxUrl'     => admin_url('admin-ajax.php'),
            'exportNonce' => wp_create_nonce('dccgg_export'),
            'importNonce' => wp_create_nonce('dccgg_import'),
            'postId'      => $post_id,
        ]);
    }

    protected function register_controls(): void
    {
        // Content tab
        $this->register_general_controls();
        $this->register_sections_controls();
        $this->register_items_controls();
        $this->register_search_controls();
        $this->register_emergency_controls();
        $this->register_review_controls();
        $this->register_strings_controls();

        // Style tab
        $this->register_theme_controls();
        $this->register_layout_controls();
        $this->register_color_controls();
        $this->register_tile_style_controls();
        $this->register_quick_action_style_controls();
        $this->register_button_style_controls();
        $this->register_detail_style_controls();
        $this->register_popup_back_style_controls();
        $this->register_popup_nav_style_controls();
        $this->register_popup_title_style_controls();
        $this->register_popup_icon_style_controls();
        $this->register_popup_header_bg_style_controls();
        $this->register_popup_reset_style_controls();
        $this->register_popup_more_style_controls();
        $this->register_flip_card_controls();
        $this->register_fab_style_controls();
        $this->register_transitions_controls();
    }

    // ----------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------

    /**
     * Defensive wrapper around get_settings() for use DURING register_controls().
     *
     * In Elementor 4.x, Controls_Stack::sanitize_settings() gained a strict
     * `array $settings` type hint. During the register_controls() lifecycle
     * phase the widget's settings aren't hydrated yet — Elementor's internal
     * get_data('settings') returns null — and the strict 4.x signature throws
     * a TypeError instead of silently treating null as an empty array (which
     * is what 3.x did).
     *
     * This wrapper catches that TypeError and returns []. find_orphan_items()
     * and sections_options() both need to read saved settings during control
     * registration so the items repeater's section dropdown stays in sync
     * with the sections list — there's no clean way to avoid the read.
     */
    private function safe_get_settings(string $key): array
    {
        try {
            $value = $this->get_settings($key);
            return is_array($value) ? $value : [];
        } catch (\Throwable $e) {
            return [];
        }
    }

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
        $sections = $this->safe_get_settings('guide_sections');
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
        $sections = $this->safe_get_settings('guide_sections');
        $items    = $this->safe_get_settings('guide_items');
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
            // Re-tokenize HTML tags between EACH pattern so we don't run a
            // later pattern (e.g. phone) over text injected by an earlier one
            // (e.g. email → <a href="mailto:…">…</a>). Without this, the
            // phone regex could match digits inside the href of an anchor we
            // just created.
            foreach ($patterns as $pat => $cb) {
                $tokens = preg_split('/(<[^>]+>)/', $chunk, -1, PREG_SPLIT_DELIM_CAPTURE);
                if (!is_array($tokens)) {
                    break;
                }
                foreach ($tokens as $t => $tok) {
                    if ($t % 2 === 1) {
                        continue; // tag
                    }
                    if ($tok === '') {
                        continue;
                    }
                    $tokens[$t] = preg_replace_callback($pat, $cb, $tok);
                }
                $chunk = implode('', $tokens);
            }
            $parts[$i] = $chunk;
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

        $this->add_control('manual_pdf', [
            'label'       => __('Override printable PDF', 'dcc-guest-guide'),
            'type'        => Controls_Manager::MEDIA,
            'media_types' => ['application/pdf'],
            'default'     => ['url' => ''],
            'description' => __('Optional. When you assign a PDF here, the "Print guide" button and the ⋯ menu\'s "Save as PDF" both use this file instead of the auto-generated print stylesheet — Save opens the PDF in a new tab; Print loads it in a hidden frame and auto-launches the browser print dialog. Leave empty to keep the default behavior.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_fab', [
            'label'        => __('Enable floating help button (FAB)', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'prefix_class' => 'dccgg-fab--',
            'description'  => __('When on, the widget collapses into a small floating button. Tapping it opens the guide as a centered modal.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_haptic', [
            'label'        => __('Enable haptic feedback (mobile)', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('On supported devices, vibrates briefly on tile tap and after a successful Copy. Uses navigator.vibrate; silently no-ops where unsupported.', 'dcc-guest-guide'),
        ]);

        $this->add_control('copy_effect', [
            'label'       => __('Copy-button effect', 'dcc-guest-guide'),
            'type'        => Controls_Manager::SELECT,
            'default'     => 'confetti',
            'options'     => [
                'none'     => __('None', 'dcc-guest-guide'),
                'confetti' => __('Confetti (default)', 'dcc-guest-guide'),
                'splash'   => __('Splash droplets', 'dcc-guest-guide'),
                'bubbles'  => __('Rising bubbles', 'dcc-guest-guide'),
                'sunrays'  => __('Sun rays burst', 'dcc-guest-guide'),
                'palm'     => __('Palm fronds', 'dcc-guest-guide'),
                'seaplane' => __('Seaplane flyby', 'dcc-guest-guide'),
                'ripples'  => __('Concentric ripples', 'dcc-guest-guide'),
                'fish'     => __('Fish school', 'dcc-guest-guide'),
            ],
            'description' => __('Plays after a visitor taps a Copy button. Themed to Tavares lakes / Central Florida. Skipped automatically for visitors with the OS Reduce-Motion preference.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_section_nav', [
            'label'        => __('Show prev/next arrows in detail', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('Adds ← / → buttons in the detail header that cycle to the previous / next section. Also bound to keyboard arrow keys and to horizontal swipe on touch.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_detail_more_menu', [
            'label'        => __('Show ⋯ Settings menu on the hub', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('Adds a compact ⋯ menu to the main hub toolbar with Print, Save as PDF, and (when enabled) Report a Problem. Visible before opening any section.', 'dcc-guest-guide'),
        ]);

        $this->add_control('more_button_label', [
            'label'       => __('More button text', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '',
            'placeholder' => __('e.g. Options, More', 'dcc-guest-guide'),
            'description' => __('Replaces the "⋯" icon with this text on the More button. Leave empty to keep the icon-only look.', 'dcc-guest-guide'),
            'condition'   => ['enable_detail_more_menu' => 'yes'],
        ]);

        $this->add_control('enable_popup_more_menu', [
            'label'        => __('Also show ⋯ menu in popup header', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('When on, the same More menu also appears in each section popup header, right-aligned next to the section title. Reports opened from the popup auto-fill the section context.', 'dcc-guest-guide'),
            'condition'    => ['enable_detail_more_menu' => 'yes'],
        ]);

        $this->add_control('more_menu_slot_1', [
            'label'       => __('More menu — slot 1', 'dcc-guest-guide'),
            'type'        => Controls_Manager::SELECT,
            'default'     => 'print',
            'options'     => [
                'print'    => __('Print guide', 'dcc-guest-guide'),
                'save_pdf' => __('Save as PDF', 'dcc-guest-guide'),
                'report'   => __('Report a problem', 'dcc-guest-guide'),
                'none'     => __('— None —', 'dcc-guest-guide'),
            ],
            'description' => __('First (top) item in the More menu. Duplicate picks across slots render only the first occurrence.', 'dcc-guest-guide'),
            'condition'   => ['enable_detail_more_menu' => 'yes'],
        ]);

        $this->add_control('more_menu_slot_2', [
            'label'     => __('More menu — slot 2', 'dcc-guest-guide'),
            'type'      => Controls_Manager::SELECT,
            'default'   => 'save_pdf',
            'options'   => [
                'print'    => __('Print guide', 'dcc-guest-guide'),
                'save_pdf' => __('Save as PDF', 'dcc-guest-guide'),
                'report'   => __('Report a problem', 'dcc-guest-guide'),
                'none'     => __('— None —', 'dcc-guest-guide'),
            ],
            'condition' => ['enable_detail_more_menu' => 'yes'],
        ]);

        $this->add_control('more_menu_slot_3', [
            'label'     => __('More menu — slot 3', 'dcc-guest-guide'),
            'type'      => Controls_Manager::SELECT,
            'default'   => 'report',
            'options'   => [
                'print'    => __('Print guide', 'dcc-guest-guide'),
                'save_pdf' => __('Save as PDF', 'dcc-guest-guide'),
                'report'   => __('Report a problem', 'dcc-guest-guide'),
                'none'     => __('— None —', 'dcc-guest-guide'),
            ],
            'condition' => ['enable_detail_more_menu' => 'yes'],
        ]);

        $this->add_control('auto_fold_words', [
            'label'       => __('Auto-fold items over N words', 'dcc-guest-guide'),
            'type'        => Controls_Manager::NUMBER,
            'min'         => 0,
            'max'         => 5000,
            'step'        => 25,
            'default'     => 0,
            'description' => __('Items whose content exceeds this word count auto-apply Read More / Read Less, even if the per-item toggle is off. Set to 0 to disable.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_video_thumbnails', [
            'label'        => __('Show video poster thumbnails', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('For YouTube / Vimeo items, show the poster image instead of an empty iframe; click the poster to load the player. Saves the network cost of every video iframe on first paint.', 'dcc-guest-guide'),
        ]);

        $this->add_control('cottage_latitude', [
            'label'       => __('Cottage latitude', 'dcc-guest-guide'),
            'type'        => Controls_Manager::NUMBER,
            'step'        => 0.0001,
            'default'     => 28.8028,
            'description' => __('Used for sunrise / sunset / moon phase / weather in the Conditions side-card. Default is Mt Dora, FL.', 'dcc-guest-guide'),
        ]);
        $this->add_control('cottage_longitude', [
            'label'   => __('Cottage longitude', 'dcc-guest-guide'),
            'type'    => Controls_Manager::NUMBER,
            'step'    => 0.0001,
            'default' => -81.6448,
        ]);

        $this->add_control('enable_conditions_extras', [
            'label'        => __('Show extended conditions rows', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'label_on'     => __('Show', 'dcc-guest-guide'),
            'label_off'    => __('Hide', 'dcc-guest-guide'),
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('Adds NWS alert banner, Harris Chain lake water level + surface temp, pressure trend, wind + leeward-shore tip, UV index, heat-index, and solunar feeding windows to the Conditions side-card. Each row hides itself if its data source returns nothing.', 'dcc-guest-guide'),
        ]);

        $this->add_control('conditions_position', [
            'label'       => __('Conditions card position', 'dcc-guest-guide'),
            'type'        => Controls_Manager::SELECT,
            'default'     => 'first',
            'options'     => [
                'first' => __('First — above the items', 'dcc-guest-guide'),
                'last'  => __('Last — after the items', 'dcc-guest-guide'),
            ],
            'description' => __('Where the side-card sits inside each popup that has it enabled.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_ai_search', [
            'label'        => __('Enable AI fallback search', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('When a guest\'s search returns no matches, offer an "Ask anything" button that routes the question to Google Gemini (uses the API key configured in Settings → DCC Guest Guide). Free tier: 1,500 questions / day site-wide.', 'dcc-guest-guide'),
        ]);
        $this->add_control('ai_search_button_label', [
            'label'     => __('AI search button label', 'dcc-guest-guide'),
            'type'      => Controls_Manager::TEXT,
            'default'   => __('Ask anything about the cottage', 'dcc-guest-guide'),
            'condition' => ['enable_ai_search' => 'yes'],
        ]);
        $this->add_control('ai_search_privacy', [
            'label'     => __('AI privacy notice', 'dcc-guest-guide'),
            'type'      => Controls_Manager::TEXTAREA,
            'rows'      => 2,
            'default'   => __('Your question is sent to Google Gemini along with the guide content. Don\'t include personal information.', 'dcc-guest-guide'),
            'condition' => ['enable_ai_search' => 'yes'],
        ]);

        $this->add_control('enable_problem_report', [
            'label'        => __('Enable "Report a problem" button', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('Adds a "Report a problem" item to the section detail\'s More menu. Submissions are emailed to the recipients you list below; no SMS, no third-party service.', 'dcc-guest-guide'),
        ]);
        $this->add_control('enable_per_item_report', [
            'label'        => __('Per-item Report button', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('Also show a small "Report" button on each item card so guests can flag a specific tip ("This Wi-Fi password didn\'t work"). Item title is pre-filled in the report.', 'dcc-guest-guide'),
            'condition'    => ['enable_problem_report' => 'yes'],
        ]);
        $this->add_control('problem_report_recipients', [
            'label'       => __('Report recipients (one email per line)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXTAREA,
            'rows'        => 3,
            'default'     => '',
            'description' => __('Where reports go. Leave blank to use the WordPress admin email. Multiple lines or commas accepted.', 'dcc-guest-guide'),
            'condition'   => ['enable_problem_report' => 'yes'],
        ]);
        $this->add_control('problem_report_categories', [
            'label'       => __('Report categories (one per line)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXTAREA,
            'rows'        => 4,
            'default'     => "Maintenance issue\nSupply missing\nCleanliness concern\nWi-Fi or TV\nSafety\nOther",
            'description' => __('Shown as a dropdown in the report dialog. Leave blank for a single freeform field.', 'dcc-guest-guide'),
            'condition'   => ['enable_problem_report' => 'yes'],
        ]);

        // v0.9.7: full From / Subject / Body customization for the email
        // that wp_mail() sends. Supports smart-tag placeholders so the host
        // can weave guest-submitted context into custom copy without code.
        $this->add_control('problem_report_from_email', [
            'label'       => __('From email (optional)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '',
            'description' => __('Custom "From" address. Leave blank to use the WordPress default — recommended on shared hosting without SPF/DKIM. The visitor\'s typed email is always set as Reply-To regardless.', 'dcc-guest-guide'),
            'condition'   => ['enable_problem_report' => 'yes'],
        ]);
        $this->add_control('problem_report_from_name', [
            'label'       => __('From name (optional)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '',
            'description' => __('Display name attached to the From email address. Defaults to your site name.', 'dcc-guest-guide'),
            'condition'   => ['enable_problem_report' => 'yes'],
        ]);
        $this->add_control('problem_report_subject', [
            'label'       => __('Email subject', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '[DCC Guest Guide] {category} — {section_title}',
            'description' => __('Subject line for the emailed report. Smart tags: {site_name}, {category}, {section_title}, {item_title}, {reporter_name}, {reporter_cottage}, {reporter_phone}, {timestamp}.', 'dcc-guest-guide'),
            'condition'   => ['enable_problem_report' => 'yes'],
        ]);
        $this->add_control('problem_report_body', [
            'label'       => __('Email body', 'dcc-guest-guide'),
            'type'        => Controls_Manager::WYSIWYG,
            'default'     => "<p>A guest submitted a problem report from {site_name}.</p>\n"
                          . "<ul>\n"
                          . "<li><strong>Name:</strong> {reporter_name}</li>\n"
                          . "<li><strong>Cottage:</strong> {reporter_cottage}</li>\n"
                          . "<li><strong>Phone:</strong> {reporter_phone}</li>\n"
                          . "<li><strong>Reply-to:</strong> {reporter_email}</li>\n"
                          . "<li><strong>Category:</strong> {category}</li>\n"
                          . "<li><strong>Section:</strong> {section_title}</li>\n"
                          . "<li><strong>Item:</strong> {item_title}</li>\n"
                          . "<li><strong>Page:</strong> <a href=\"{page_url}\">{page_url}</a></li>\n"
                          . "<li><strong>Submitted:</strong> {timestamp}</li>\n"
                          . "</ul>\n"
                          . "<p><strong>Message:</strong></p>\n"
                          . "<blockquote>{report_text}</blockquote>\n"
                          . "<p style=\"font-size:11px;color:#888\">{user_agent}</p>",
            'description' => __('Email body. Supports HTML. Smart tags: {site_name}, {site_url}, {page_url}, {section_title}, {item_title}, {category}, {report_text}, {reporter_name}, {reporter_cottage}, {reporter_phone}, {reporter_email}, {timestamp}, {user_agent}.', 'dcc-guest-guide'),
            'condition'   => ['enable_problem_report' => 'yes'],
        ]);
        $this->add_control('problem_report_include_ua', [
            'label'        => __('Include user-agent in body', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('When off, the {user_agent} placeholder expands to an empty string.', 'dcc-guest-guide'),
            'condition'    => ['enable_problem_report' => 'yes'],
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

        $this->add_control('export_import_notice', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => '<div class="elementor-panel-alert" style="background:#f6f7f7;border-color:#e0e1e2;color:#2c3338;margin-bottom:8px;">' .
                                  esc_html__('Back up the whole guide or move it to another site. Export downloads a JSON of all sections + items; Import pastes one back in. The page must already be saved with at least one DCC Guest Guide widget.', 'dcc-guest-guide') .
                                  '<br><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' .
                                  '<button type="button" class="elementor-button elementor-button-default" data-dccgg-export>' . esc_html__('Export Guide (JSON)', 'dcc-guest-guide') . '</button>' .
                                  '<button type="button" class="elementor-button elementor-button-default" data-dccgg-import>' . esc_html__('Import Guide (JSON)', 'dcc-guest-guide') . '</button>' .
                                  '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#555;"><input type="checkbox" data-dccgg-import-replace> ' . esc_html__('Replace existing on import', 'dcc-guest-guide') . '</label>' .
                                  '</div></div>',
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

        $repeater->add_control('section_emoji', [
            'label'       => __('Emoji (overrides icon)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'description' => __('Paste an emoji like 🛁 to use it instead of the Font Awesome icon. Leave blank to keep the icon above.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('section_accent', [
            'label'       => __('Tile accent color', 'dcc-guest-guide'),
            'type'        => Controls_Manager::COLOR,
            'description' => __('Per-section color override for this tile\'s icon, quick-action chip, and hover state. Leave blank to use the global primary color.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('section_role', [
            'label'   => __('Section role', 'dcc-guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => '',
            'options' => [
                ''          => __('Normal section', 'dcc-guest-guide'),
                'emergency' => __('Emergency (red accent + pinned + SOS button)', 'dcc-guest-guide'),
                'checkout'  => __('Checkout (shows review prompt at the bottom)', 'dcc-guest-guide'),
            ],
            'description' => __('Mark this section for special treatment. Emergency tiles are pinned, painted red, and can show a floating SOS button. Checkout sections append the review prompt configured in the Checkout Review panel. At most one of each role per widget.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('section_icon_anim', [
            'label'   => __('Icon hover animation override', 'dcc-guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => '',
            'options' => [
                ''        => __('— Use global default —', 'dcc-guest-guide'),
                'none'    => __('None', 'dcc-guest-guide'),
                'pulse'   => __('Pulse', 'dcc-guest-guide'),
                'bounce'  => __('Bounce', 'dcc-guest-guide'),
                'rotate'  => __('Rotate', 'dcc-guest-guide'),
                'wiggle'  => __('Wiggle', 'dcc-guest-guide'),
                'shake'   => __('Shake', 'dcc-guest-guide'),
            ],
            'description' => __('Animate just this section\'s icon on tile hover; leave blank to use the global setting in Layout & Interaction.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('procedure_mode', [
            'label'        => __('Render items as a numbered procedure', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'description'  => __('Items in this section render as Step 1, 2, 3… with a connecting progress line. Use for instruction-style sections like "How to start the hot tub".', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('wizard_mode', [
            'label'        => __('Wizard mode (one step at a time)', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'description'  => __('Items show one at a time with Next / Back buttons and a progress strip. Overrides procedure mode for this section.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('checklist_mode', [
            'label'        => __('Checklist mode', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'description'  => __('Every item in this section gets a checkbox guests can tick off. Progress is saved in their browser (scoped to ?stay=… so different guests get fresh state). Confetti fires when all items are checked.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('show_conditions_card', [
            'label'        => __('Show conditions side-card', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'description'  => __('Shows sunrise / sunset, moon phase, and today\'s weather in a side card on this section. Configure the cottage location in Layout & Interaction.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('section_bg_image', [
            'label'       => __('Section parallax background image', 'dcc-guest-guide'),
            'type'        => Controls_Manager::MEDIA,
            'description' => __('Optional hero image shown behind this section\'s detail header with a gentle scroll-linked parallax effect. Respects reduced-motion preferences.', 'dcc-guest-guide'),
        ]);

        $repeater->add_control('section_bg_overlay', [
            'label'      => __('Parallax overlay opacity (%)', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'range'      => ['px' => ['min' => 0, 'max' => 100, 'step' => 5]],
            'default'    => ['size' => 55, 'unit' => 'px'],
            'condition'  => ['section_bg_image[url]!' => ''],
            'description' => __('Dark overlay opacity over the parallax image — keeps header text legible.', 'dcc-guest-guide'),
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

        $repeater->add_control('item_emoji', [
            'label'       => __('Emoji (overrides icon)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'description' => __('Paste an emoji to replace the Font Awesome icon for just this item. Leave blank to keep the icon above.', 'dcc-guest-guide'),
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

        $repeater->add_control('item_wifi_mode', [
            'label'        => __('WiFi credentials mode', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'description'  => __('Adds a "Show WiFi QR" button on this item. Guests scan it with their phone camera to join the network. Password is taken from the "Value to copy" field above — turn on the Copy button and fill the password there.', 'dcc-guest-guide'),
        ]);
        $repeater->add_control('wifi_ssid', [
            'label'       => __('Network name (SSID)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'condition'   => ['item_wifi_mode' => 'yes'],
        ]);
        $repeater->add_control('wifi_security', [
            'label'     => __('Security', 'dcc-guest-guide'),
            'type'      => Controls_Manager::SELECT,
            'default'   => 'WPA',
            'options'   => [
                'WPA'    => __('WPA / WPA2 / WPA3', 'dcc-guest-guide'),
                'WEP'    => __('WEP', 'dcc-guest-guide'),
                'nopass' => __('Open (no password)', 'dcc-guest-guide'),
            ],
            'condition' => ['item_wifi_mode' => 'yes'],
        ]);
        $repeater->add_control('wifi_hidden', [
            'label'        => __('Hidden network', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'condition'    => ['item_wifi_mode' => 'yes'],
        ]);

        $repeater->add_control('media_type', [
            'label'   => __('Media', 'dcc-guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'none',
            'options' => [
                'none'    => __('None', 'dcc-guest-guide'),
                'image'   => __('Single image', 'dcc-guest-guide'),
                'gallery' => __('Gallery (multiple images, with optional hotspots)', 'dcc-guest-guide'),
                'video'   => __('Video (YouTube / Vimeo / self-hosted)', 'dcc-guest-guide'),
            ],
        ]);
        $repeater->add_control('item_image', [
            'label'     => __('Image', 'dcc-guest-guide'),
            'type'      => Controls_Manager::MEDIA,
            'condition' => ['media_type' => 'image'],
        ]);
        $repeater->add_control('item_gallery', [
            'label'     => __('Gallery images', 'dcc-guest-guide'),
            'type'      => Controls_Manager::GALLERY,
            'default'   => [],
            'condition' => ['media_type' => 'gallery'],
        ]);
        $repeater->add_control('item_hotspots', [
            'label'       => __('Hotspots (one per line)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXTAREA,
            'rows'        => 6,
            'description' => __('Optional pins overlaid on gallery images. Format per line: <code>IMAGE_INDEX X% Y% | Label | Description</code> — e.g. <code>0 32 58 | Power button | Hold for 3 seconds to start the jets</code>. Image index is 0-based.', 'dcc-guest-guide'),
            'condition'   => ['media_type' => 'gallery'],
        ]);
        $repeater->add_control('item_video', [
            'label'       => __('Video URL', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'description' => __('Accepts YouTube (watch / embed / shorts / youtu.be), Vimeo, or self-hosted mp4/webm/mov.', 'dcc-guest-guide'),
            'condition'   => ['media_type' => 'video'],
        ]);
        $repeater->add_control('item_checkable', [
            'label'        => __('Make this item a checkbox', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'description'  => __('Guest can tick the item off. State saved in their browser. Overridden by section-level Checklist mode (which makes every item checkable).', 'dcc-guest-guide'),
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
            'default'   => __('Search the guide…', 'dcc-guest-guide'),
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

    private function register_emergency_controls(): void
    {
        $this->start_controls_section('section_emergency', [
            'label' => __('Emergency mode', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('emergency_intro', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => '<div class="elementor-panel-alert" style="background:#fdecec;border-color:#f0b3b3;color:#7a1414;">' .
                                  esc_html__('Mark one section above with role = Emergency. These controls drive how that section is presented — pinned tile, red accent, contacts strip, optional SOS button, optional NOAA weather-alert banner.', 'dcc-guest-guide') .
                                  '</div>',
            'content_classes' => 'elementor-descriptor',
        ]);

        $contacts = new Repeater();
        $contacts->add_control('contact_label', [
            'label'       => __('Label', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'description' => __('What the chip says (e.g. "Host (Bob)", "Mt Dora Hospital").', 'dcc-guest-guide'),
        ]);
        $contacts->add_control('contact_phone', [
            'label'       => __('Phone number', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'description' => __('Tapping renders as a tel: link. Leave blank if the contact is a map destination instead.', 'dcc-guest-guide'),
        ]);
        $contacts->add_control('contact_map', [
            'label'       => __('Map URL or address', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'description' => __('Optional. If set and phone is blank, the chip opens a maps link instead.', 'dcc-guest-guide'),
        ]);
        $contacts->add_control('contact_icon', [
            'label'   => __('Chip emoji', 'dcc-guest-guide'),
            'type'    => Controls_Manager::TEXT,
            'description' => __('A single emoji shown before the label (e.g. 📞 🏠 🏥 🚒). Defaults to 📞 if blank.', 'dcc-guest-guide'),
        ]);

        $this->add_control('emergency_contacts', [
            'label'        => __('Emergency contacts', 'dcc-guest-guide'),
            'type'         => Controls_Manager::REPEATER,
            'fields'       => $contacts->get_controls(),
            'title_field'  => '{{{ contact_label || contact_phone || "Contact" }}}',
            'prevent_empty' => false,
            'description'  => __('A 911 chip is added automatically at the start. List your own contacts here.', 'dcc-guest-guide'),
        ]);

        $this->add_control('enable_emergency_fab', [
            'label'        => __('Show floating SOS button in detail views', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('A small red triangle in the corner that jumps straight to the emergency section from anywhere in the guide.', 'dcc-guest-guide'),
        ]);

        $this->add_control('emergency_position', [
            'label'   => __('Tile position', 'dcc-guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'top',
            'options' => [
                'top'    => __('Top of menu (default)', 'dcc-guest-guide'),
                'bottom' => __('Bottom of menu', 'dcc-guest-guide'),
            ],
        ]);

        $this->add_control('enable_noaa_banner', [
            'label'        => __('Show NOAA active-alert banner', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('When the National Weather Service has an active alert for the cottage location, render a red banner at the top of the guide. Uses the cottage latitude/longitude from the General panel. Cached server-side for 30 min.', 'dcc-guest-guide'),
        ]);

        $this->end_controls_section();
    }

    private function register_review_controls(): void
    {
        $this->start_controls_section('section_review', [
            'label' => __('Checkout review prompt', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('review_intro', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => '<div class="elementor-panel-alert elementor-panel-alert-info">' .
                                  esc_html__('Mark one section above with role = Checkout. The review prompt below appears at the bottom of that section. 👍 reveals the editable template + per-platform "Copy & open" buttons; 👎 opens the Report-a-Problem dialog (requires that feature enabled in General).', 'dcc-guest-guide') .
                                  '</div>',
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->add_control('enable_checkout_review', [
            'label'        => __('Enable review prompt', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
        ]);

        $this->add_control('review_template_text', [
            'label'       => __('Suggested review (editable by guest)', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXTAREA,
            'rows'        => 6,
            'default'     => __('Doracanal Court was a wonderful stay. The cottage was spotless, the lake views were exactly as advertised, and the host was thoughtful and quick to respond. Highly recommend.', 'dcc-guest-guide'),
            'condition'   => ['enable_checkout_review' => 'yes'],
            'description' => __('Pre-fills the textarea the guest copies. Supports {guest_name} (best-effort parsing of ?stay=) and {stay_key}.', 'dcc-guest-guide'),
        ]);

        $this->add_control('review_airbnb_url', [
            'label'         => __('Airbnb listing URL', 'dcc-guest-guide'),
            'type'          => Controls_Manager::URL,
            'show_external' => false,
            'condition'     => ['enable_checkout_review' => 'yes'],
            'description'   => __('Leave blank to hide the Airbnb button. e.g. https://www.airbnb.com/rooms/1234567', 'dcc-guest-guide'),
        ]);
        $this->add_control('review_vrbo_url', [
            'label'         => __('Vrbo listing URL', 'dcc-guest-guide'),
            'type'          => Controls_Manager::URL,
            'show_external' => false,
            'condition'     => ['enable_checkout_review' => 'yes'],
            'description'   => __('e.g. https://www.vrbo.com/1234567', 'dcc-guest-guide'),
        ]);
        $this->add_control('review_google_url', [
            'label'         => __('Google review URL', 'dcc-guest-guide'),
            'type'          => Controls_Manager::URL,
            'show_external' => false,
            'condition'     => ['enable_checkout_review' => 'yes'],
            'description'   => __('e.g. https://g.page/r/.../review', 'dcc-guest-guide'),
        ]);

        $extras = new Repeater();
        $extras->add_control('extra_label', [
            'label'       => __('Platform label', 'dcc-guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'description' => __('Shown on the button (e.g. "Booking.com", "TripAdvisor").', 'dcc-guest-guide'),
        ]);
        $extras->add_control('extra_url', [
            'label'         => __('Review URL', 'dcc-guest-guide'),
            'type'          => Controls_Manager::URL,
            'show_external' => true,
            'default'       => ['url' => '', 'is_external' => true],
        ]);
        $extras->add_control('extra_icon', [
            'label'   => __('Icon', 'dcc-guest-guide'),
            'type'    => Controls_Manager::ICONS,
            'default' => ['value' => 'fas fa-star', 'library' => 'solid'],
        ]);

        $this->add_control('review_extras', [
            'label'       => __('Additional review platforms', 'dcc-guest-guide'),
            'type'        => Controls_Manager::REPEATER,
            'fields'      => $extras->get_controls(),
            'title_field' => '{{{ extra_label || "Platform" }}}',
            'condition'   => ['enable_checkout_review' => 'yes'],
            'description' => __('Extra review platforms beyond Airbnb / Vrbo / Google. Each row needs a label, URL, and icon.', 'dcc-guest-guide'),
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
            'str_save_pdf'     => [__('Save as PDF button', 'dcc-guest-guide'), __('Save as PDF', 'dcc-guest-guide')],
            'str_save_pdf_tip' => [__('Save-as-PDF tip toast', 'dcc-guest-guide'), __('In the print dialog, choose "Save as PDF" as the destination.', 'dcc-guest-guide')],
            'str_report_problem'  => [__('Report a problem button', 'dcc-guest-guide'),        __('Report a problem', 'dcc-guest-guide')],
            'str_report_title'    => [__('Report dialog title', 'dcc-guest-guide'),            __('Report a problem', 'dcc-guest-guide')],
            'str_report_category' => [__('Report dialog category label', 'dcc-guest-guide'),   __('What\'s the issue?', 'dcc-guest-guide')],
            'str_report_desc'     => [__('Report dialog description label', 'dcc-guest-guide'),__('Describe the problem', 'dcc-guest-guide')],
            'str_report_contact'  => [__('Report dialog contact-back label', 'dcc-guest-guide'),__('Email to reach you back (optional)', 'dcc-guest-guide')],
            'str_report_name'     => [__('Report dialog "Your name" label', 'dcc-guest-guide'),  __('Your name (optional)', 'dcc-guest-guide')],
            'str_report_cottage'  => [__('Report dialog "Cottage" label', 'dcc-guest-guide'),    __('Which cottage are you staying in?', 'dcc-guest-guide')],
            'str_report_phone'    => [__('Report dialog "Phone" label', 'dcc-guest-guide'),      __('Phone (optional)', 'dcc-guest-guide')],
            'str_report_privacy'  => [__('Report dialog privacy note', 'dcc-guest-guide'),     __('Your report is emailed straight to the host. It is not stored on this site.', 'dcc-guest-guide')],
            'str_report_send'     => [__('Report dialog Send button', 'dcc-guest-guide'),      __('Send report', 'dcc-guest-guide')],
            'str_report_cancel'   => [__('Report dialog Cancel button', 'dcc-guest-guide'),    __('Cancel', 'dcc-guest-guide')],
            'str_report_thank_you' => [__('Report sent confirmation', 'dcc-guest-guide'),       __('Thanks! Your host has been notified.', 'dcc-guest-guide')],
            'str_report_error'    => [__('Report failed message', 'dcc-guest-guide'),          __('Could not send. Please contact the host directly.', 'dcc-guest-guide')],
            'str_per_item_report' => [__('Per-item Report label', 'dcc-guest-guide'),          __('Report', 'dcc-guest-guide')],
            'str_ai_voice'        => [__('AI search mic button aria-label', 'dcc-guest-guide'),__('Ask by voice', 'dcc-guest-guide')],
            'str_read_more'    => [__('Read More', 'dcc-guest-guide'),          __('Read more', 'dcc-guest-guide')],
            'str_read_less'    => [__('Read Less', 'dcc-guest-guide'),          __('Read less', 'dcc-guest-guide')],
            'str_copy'         => [__('Copy button', 'dcc-guest-guide'),        __('Copy', 'dcc-guest-guide')],
            'str_copied'       => [__('Copied confirmation', 'dcc-guest-guide'),__('Copied!', 'dcc-guest-guide')],
            'str_directions'   => [__('Directions button', 'dcc-guest-guide'),  __('Directions', 'dcc-guest-guide')],
            'str_fab_open'     => [__('FAB tooltip / aria-label', 'dcc-guest-guide'), __('Open guest guide', 'dcc-guest-guide')],
            'str_fab_close'    => [__('FAB close aria-label', 'dcc-guest-guide'),     __('Close guide', 'dcc-guest-guide')],
            'str_qr_close'     => [__('QR close aria-label', 'dcc-guest-guide'),      __('Close QR code', 'dcc-guest-guide')],
            'str_wifi_qr'      => [__('WiFi QR button label', 'dcc-guest-guide'),    __('Show WiFi QR', 'dcc-guest-guide')],
            'str_prev_section' => [__('Previous-section aria-label', 'dcc-guest-guide'), __('Previous section', 'dcc-guest-guide')],
            'str_next_section' => [__('Next-section aria-label', 'dcc-guest-guide'),     __('Next section', 'dcc-guest-guide')],
            'str_wizard_prev'  => [__('Wizard back button', 'dcc-guest-guide'),  __('Back', 'dcc-guest-guide')],
            'str_wizard_next'  => [__('Wizard next button', 'dcc-guest-guide'),  __('Next', 'dcc-guest-guide')],
            'str_wizard_done'  => [__('Wizard done button', 'dcc-guest-guide'),  __('Done', 'dcc-guest-guide')],
            'str_lightbox_close' => [__('Lightbox close aria-label', 'dcc-guest-guide'), __('Close image', 'dcc-guest-guide')],
            'str_more_menu'      => [__('More-menu button label', 'dcc-guest-guide'), __('More', 'dcc-guest-guide')],
            'str_emergency_sos'      => [__('SOS button label', 'dcc-guest-guide'),                  __('Emergency', 'dcc-guest-guide')],
            'str_emergency_911'      => [__('Auto-added 911 chip label', 'dcc-guest-guide'),         __('Call 911', 'dcc-guest-guide')],
            'str_noaa_banner_prefix' => [__('NOAA banner prefix', 'dcc-guest-guide'),                __('Active weather alert:', 'dcc-guest-guide')],
            'str_noaa_more'          => [__('NOAA "more info" link text', 'dcc-guest-guide'),       __('More info', 'dcc-guest-guide')],
            'str_review_heading'     => [__('Review prompt heading', 'dcc-guest-guide'),             __('How was your stay?', 'dcc-guest-guide')],
            'str_review_yes'         => [__('Review 👍 button label', 'dcc-guest-guide'),            __('Loved it', 'dcc-guest-guide')],
            'str_review_no'          => [__('Review 👎 button label', 'dcc-guest-guide'),            __('Something was off', 'dcc-guest-guide')],
            'str_review_help'        => [__('Review panel helper text', 'dcc-guest-guide'),          __('Edit the suggested review if you\'d like, then pick a platform — we\'ll copy the text and open the site for you.', 'dcc-guest-guide')],
            'str_review_copy_airbnb' => [__('Copy & open Airbnb', 'dcc-guest-guide'),                __('Copy & open Airbnb', 'dcc-guest-guide')],
            'str_review_copy_vrbo'   => [__('Copy & open Vrbo', 'dcc-guest-guide'),                  __('Copy & open Vrbo', 'dcc-guest-guide')],
            'str_review_copy_google' => [__('Copy & open Google', 'dcc-guest-guide'),                __('Copy & open Google', 'dcc-guest-guide')],
            'str_review_copy_extra'  => [__('Extra platforms button prefix', 'dcc-guest-guide'),     __('Copy & open', 'dcc-guest-guide')],
            'str_review_copied'      => [__('Review copied toast', 'dcc-guest-guide'),               __('Review text copied — paste it after the page opens.', 'dcc-guest-guide')],
            'str_review_thanks'      => [__('Review prompt collapsed thanks', 'dcc-guest-guide'),    __('Thanks for the feedback!', 'dcc-guest-guide')],
            'str_conditions_title'   => [__('Conditions card heading', 'dcc-guest-guide'),           __('At the cottage today', 'dcc-guest-guide')],
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

        $this->add_control('theme_preset_swatches', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => self::preset_swatches_html(),
            'content_classes' => 'elementor-descriptor',
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

        // v0.9.7: explicit column count for the menu hub on phones in
        // portrait. Without this, narrow viewports collapse to a single
        // column because the tile-min-width breakpoint wins; the host can
        // now force 2/3/4 columns on the small viewport.
        $this->add_control('grid_columns_mobile', [
            'label'     => __('Grid columns — mobile (portrait)', 'dcc-guest-guide'),
            'type'      => Controls_Manager::SELECT,
            'default'   => '1',
            'options'   => [
                '1' => '1', '2' => '2', '3' => '3', '4' => '4',
            ],
            'condition' => ['menu_layout' => 'grid'],
            'selectors' => [
                self::SEL . '.dccgg-layout-grid .dccgg-menu' =>
                    '--dccgg-grid-cols-mobile: {{VALUE}};',
            ],
            'description' => __('Number of section tiles per row on a phone in portrait orientation. The auto layout from the tile min-width still applies to wider viewports.', 'dcc-guest-guide'),
            'separator' => 'before',
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

        $this->add_control('density', [
            'label'        => __('Density', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'cozy',
            'options'      => [
                'compact' => __('Compact (tighter padding, smaller text)', 'dcc-guest-guide'),
                'cozy'    => __('Cozy (default)', 'dcc-guest-guide'),
                'comfy'   => __('Comfy (extra padding, larger text)', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-density-',
            'description'  => __('Global spacing / typography scale. Other style controls still take precedence when set explicitly.', 'dcc-guest-guide'),
        ]);

        $this->add_control('icon_hover_anim', [
            'label'        => __('Icon hover animation', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'none',
            'options'      => [
                'none'    => __('None', 'dcc-guest-guide'),
                'pulse'   => __('Pulse', 'dcc-guest-guide'),
                'bounce'  => __('Bounce', 'dcc-guest-guide'),
                'rotate'  => __('Rotate', 'dcc-guest-guide'),
                'wiggle'  => __('Wiggle', 'dcc-guest-guide'),
                'shake'   => __('Shake', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-icon-anim-',
            'description'  => __('Animates the framed icon on tile hover. Individual sections can override this in the Sections panel.', 'dcc-guest-guide'),
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

        // v0.9.7: explicit section icon color on the menu hub tiles.
        $this->add_control('section_icon_color', [
            'label'     => __('Section icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-tile .dccgg-tile-icon i' =>
                    'color: {{VALUE}};',
                self::SEL . '.dccgg-tile .dccgg-tile-icon svg' =>
                    'fill: {{VALUE}}; color: {{VALUE}};',
                self::SEL . '.dccgg-tile .dccgg-tile-icon .dccgg-emoji-icon' =>
                    'color: {{VALUE}};',
            ],
            'description' => __('Color of the icon shown inside each section tile on the menu hub. Leave blank to use the per-section accent.', 'dcc-guest-guide'),
            'separator' => 'before',
        ]);
        $this->add_control('section_icon_bg_color', [
            'label'     => __('Section icon background', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-tile .dccgg-tile-icon' =>
                    'background: {{VALUE}};',
            ],
            'description' => __('Background tint behind the section icon. Leave blank for the baked-in 12%-of-primary look.', 'dcc-guest-guide'),
        ]);

        $this->add_responsive_control('tile_gap', [
            'label'      => __('Gap between tiles', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'default'    => ['size' => 20, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 0, 'max' => 60, 'step' => 1]],
            'selectors'  => [self::SEL . '.dccgg-menu' => '--dccgg-gap: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_control('tile_aspect', [
            'label'        => __('Tile aspect ratio', 'dcc-guest-guide'),
            'type'         => Controls_Manager::SELECT,
            'default'      => 'auto',
            'options'      => [
                'auto'  => __('Auto (content-driven)', 'dcc-guest-guide'),
                '1'     => __('Square (1:1)', 'dcc-guest-guide'),
                '4-3'   => __('4 : 3', 'dcc-guest-guide'),
                '16-9'  => __('16 : 9', 'dcc-guest-guide'),
                'golden'=> __('Golden (1.618 : 1)', 'dcc-guest-guide'),
            ],
            'prefix_class' => 'dccgg-aspect-',
            'description'  => __('Forces all menu tiles to the same aspect for a visually consistent grid. Auto preserves the current content-driven height.', 'dcc-guest-guide'),
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

        $this->add_responsive_control('detail_items_cols', [
            'label'          => __('Items per row in section detail', 'dcc-guest-guide'),
            'type'           => Controls_Manager::SELECT,
            'default'        => '1',
            'tablet_default' => '1',
            'mobile_default' => '1',
            'options'        => [
                '1' => __('1 (stacked)', 'dcc-guest-guide'),
                '2' => __('2 columns', 'dcc-guest-guide'),
                '3' => __('3 columns', 'dcc-guest-guide'),
                '4' => __('4 columns', 'dcc-guest-guide'),
            ],
            'selectors'      => [
                self::SEL . ' .dccgg-detail-items:not(.dccgg-procedure)' =>
                    'display: grid; grid-template-columns: repeat({{VALUE}}, minmax(0, 1fr)); gap: 18px; align-items: start;',
            ],
            'description'    => __('Tile-style layout for items inside a section. Stacks back to 1 on mobile regardless of this value.', 'dcc-guest-guide'),
            'separator'      => 'before',
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

        // v0.9.7: explicit Guide Item icon color inside the detail popup.
        $this->add_control('item_icon_color', [
            'label'     => __('Guide Item icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-detail .dccgg-item-title i' =>
                    'color: {{VALUE}};',
                self::SEL . '.dccgg-detail .dccgg-item-title svg' =>
                    'fill: {{VALUE}}; color: {{VALUE}};',
                self::SEL . '.dccgg-detail .dccgg-item-title .dccgg-emoji-icon' =>
                    'color: {{VALUE}};',
            ],
            'description' => __('Color of icons that appear next to each Guide Item title inside the Guide Items popup.', 'dcc-guest-guide'),
            'separator' => 'before',
        ]);

        $this->end_controls_section();
    }

    // v0.9.7.4: dedicated Style controls for the popup header nav bar (Back
    // button, prev/next arrows, section title, section icon). Each one is
    // scoped under .dccgg-detail-header so it only overrides the popup; the
    // generic .dccgg-btn / --dccgg-primary baselines from
    // register_button_style_controls() and register_color_controls() still
    // apply when no override is set. No defaults — baked-in look stays in
    // widget.css; controls are override-only (CLAUDE.md invariant).
    private function register_popup_back_style_controls(): void
    {
        $this->start_controls_section('section_style_popup_back', [
            'label' => __('Popup Header — Back Button', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'popup_back_typography',
            'selector' => self::SEL . '.dccgg-detail-header .dccgg-back',
        ]);

        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'popup_back_border',
            'selector' => self::SEL . '.dccgg-detail-header .dccgg-back',
        ]);

        $this->add_control('popup_back_radius', [
            'label'      => __('Border radius', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccgg-detail-header .dccgg-back' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->add_control('popup_back_padding', [
            'label'      => __('Padding', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccgg-detail-header .dccgg-back' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('popup_back_tabs');

        $this->start_controls_tab('popup_back_tab_normal', ['label' => __('Normal', 'dcc-guest-guide')]);
        $this->add_control('popup_back_text', [
            'label'     => __('Text color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-detail-header .dccgg-back' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('popup_back_bg', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-detail-header .dccgg-back' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('popup_back_tab_hover', ['label' => __('Hover', 'dcc-guest-guide')]);
        $this->add_control('popup_back_text_hover', [
            'label'     => __('Text color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-detail-header .dccgg-back:hover, ' . self::SEL . '.dccgg-detail-header .dccgg-back:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->add_control('popup_back_bg_hover', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-detail-header .dccgg-back:hover, ' . self::SEL . '.dccgg-detail-header .dccgg-back:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    private function register_popup_nav_style_controls(): void
    {
        $this->start_controls_section('section_style_popup_nav', [
            'label' => __('Popup Header — Section Nav', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('popup_nav_size', [
            'label'      => __('Arrow button size', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 20, 'max' => 64, 'step' => 1]],
            'selectors'  => [
                self::SEL . '.dccgg-section-prev, ' . self::SEL . '.dccgg-section-next' => 'width: {{SIZE}}{{UNIT}}; height: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'popup_nav_border',
            'selector' => self::SEL . '.dccgg-section-prev, ' . self::SEL . '.dccgg-section-next',
        ]);

        $this->add_control('popup_nav_radius', [
            'label'      => __('Border radius', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [
                self::SEL . '.dccgg-section-prev, ' . self::SEL . '.dccgg-section-next' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
            ],
        ]);

        $this->add_control('popup_nav_gap', [
            'label'      => __('Gap between arrows', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 0, 'max' => 32, 'step' => 1]],
            'selectors'  => [self::SEL . '.dccgg-section-nav' => 'gap: {{SIZE}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('popup_nav_color_tabs');

        $this->start_controls_tab('popup_nav_tab_normal', ['label' => __('Normal', 'dcc-guest-guide')]);
        $this->add_control('popup_nav_icon', [
            'label'     => __('Icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-section-prev, ' . self::SEL . '.dccgg-section-next' => 'color: {{VALUE}};',
                self::SEL . '.dccgg-section-prev i, ' . self::SEL . '.dccgg-section-next i' => 'color: {{VALUE}};',
                self::SEL . '.dccgg-section-prev svg, ' . self::SEL . '.dccgg-section-next svg' => 'fill: {{VALUE}};',
            ],
        ]);
        $this->add_control('popup_nav_bg', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-section-prev, ' . self::SEL . '.dccgg-section-next' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('popup_nav_tab_hover', ['label' => __('Hover', 'dcc-guest-guide')]);
        $this->add_control('popup_nav_icon_hover', [
            'label'     => __('Icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-section-prev:hover:not([disabled]), ' . self::SEL . '.dccgg-section-next:hover:not([disabled]), ' . self::SEL . '.dccgg-section-prev:focus-visible:not([disabled]), ' . self::SEL . '.dccgg-section-next:focus-visible:not([disabled])' => 'color: {{VALUE}};',
            ],
        ]);
        $this->add_control('popup_nav_bg_hover', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-section-prev:hover:not([disabled]), ' . self::SEL . '.dccgg-section-next:hover:not([disabled]), ' . self::SEL . '.dccgg-section-prev:focus-visible:not([disabled]), ' . self::SEL . '.dccgg-section-next:focus-visible:not([disabled])' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

        $this->add_control('popup_nav_disabled_opacity', [
            'label'     => __('Disabled opacity', 'dcc-guest-guide'),
            'type'      => Controls_Manager::NUMBER,
            'min'       => 0,
            'max'       => 1,
            'step'      => 0.05,
            'selectors' => [
                self::SEL . '.dccgg-section-prev[disabled], ' . self::SEL . '.dccgg-section-next[disabled]' => 'opacity: {{VALUE}};',
            ],
            'separator' => 'before',
        ]);

        $this->end_controls_section();
    }

    private function register_popup_title_style_controls(): void
    {
        $this->start_controls_section('section_style_popup_title', [
            'label' => __('Popup Header — Section Title', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'popup_title_typography',
            'selector' => self::SEL . '.dccgg-detail-title .dccgg-detail-title-text',
        ]);

        $this->add_control('popup_title_color', [
            'label'     => __('Text color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-detail-title .dccgg-detail-title-text' => 'color: {{VALUE}};'],
        ]);

        $this->add_control('popup_title_align', [
            'label'   => __('Alignment', 'dcc-guest-guide'),
            'type'    => Controls_Manager::CHOOSE,
            'options' => [
                'flex-start' => ['title' => __('Left', 'dcc-guest-guide'),   'icon' => 'eicon-text-align-left'],
                'center'     => ['title' => __('Center', 'dcc-guest-guide'), 'icon' => 'eicon-text-align-center'],
                'flex-end'   => ['title' => __('Right', 'dcc-guest-guide'),  'icon' => 'eicon-text-align-right'],
            ],
            'selectors' => [self::SEL . '.dccgg-detail-title' => 'justify-content: {{VALUE}}; text-align: {{VALUE}};'],
        ]);

        $this->add_control('popup_title_gap', [
            'label'      => __('Icon ↔ text gap', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 0, 'max' => 32, 'step' => 1]],
            'selectors'  => [self::SEL . '.dccgg-detail-title' => 'gap: {{SIZE}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_popup_icon_style_controls(): void
    {
        $this->start_controls_section('section_style_popup_icon', [
            'label' => __('Popup Header — Section Icon', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('popup_icon_color', [
            'label'     => __('Icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccgg-detail-title-icon' => 'color: {{VALUE}};',
                self::SEL . '.dccgg-detail-title-icon i' => 'color: {{VALUE}};',
                self::SEL . '.dccgg-detail-title-icon svg' => 'fill: {{VALUE}}; color: {{VALUE}};',
            ],
        ]);

        $this->add_control('popup_icon_size', [
            'label'      => __('Icon size', 'dcc-guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', 'em'],
            'range'      => [
                'px' => ['min' => 8, 'max' => 96, 'step' => 1],
                'em' => ['min' => 0.5, 'max' => 6, 'step' => 0.1],
            ],
            'selectors'  => [
                self::SEL . '.dccgg-detail-title-icon' => 'font-size: {{SIZE}}{{UNIT}};',
                self::SEL . '.dccgg-detail-title-icon svg' => 'width: {{SIZE}}{{UNIT}}; height: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->add_control('popup_icon_bg', [
            'label'     => __('Background color (chip)', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccgg-detail-title-icon' => 'background-color: {{VALUE}};'],
        ]);

        $this->add_control('popup_icon_padding', [
            'label'      => __('Chip padding', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccgg-detail-title-icon' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->add_control('popup_icon_radius', [
            'label'      => __('Chip border radius', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccgg-detail-title-icon' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_popup_header_bg_style_controls(): void
    {
        $this->start_controls_section('section_style_popup_header_bg', [
            'label' => __('Popup Header — Background', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('popup_header_bg', [
            'label'       => __('Sticky header background', 'dcc-guest-guide'),
            'type'        => Controls_Manager::COLOR,
            'description' => __('Solid color shown behind the sticky popup header so guide-item content can\'t bleed through when the visitor scrolls. Leave empty to fall back to the popup body color (or solid white when none is set).', 'dcc-guest-guide'),
            'selectors'   => [
                self::SEL => '--dccgg-popup-header-bg: {{VALUE}};',
            ],
        ]);

        $this->end_controls_section();
    }

    // v0.9.7.11: dedicated Style section for the Reset checklist button
    // that lives inside the sticky popup header. Mirrors the Popup Header
    // — Back Button section's layout (typography + border + radius +
    // padding + Normal/Hover color tabs). No defaults — baked-in look
    // (matched to the Back button via --dccgg-btn-bg / txt) lives in
    // widget.css; controls are override-only.
    private function register_popup_reset_style_controls(): void
    {
        $reset_sel = self::SEL . '.dccgg-detail-header .dccgg-checklist-reset';

        $this->start_controls_section('section_style_popup_reset', [
            'label' => __('Popup Header — Reset Checklist Button', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'popup_reset_typography',
            'selector' => $reset_sel,
        ]);

        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'popup_reset_border',
            'selector' => $reset_sel,
        ]);

        $this->add_control('popup_reset_radius', [
            'label'      => __('Border radius', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [$reset_sel => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->add_control('popup_reset_padding', [
            'label'      => __('Padding', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [$reset_sel => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('popup_reset_tabs');

        $this->start_controls_tab('popup_reset_tab_normal', ['label' => __('Normal', 'dcc-guest-guide')]);
        $this->add_control('popup_reset_text', [
            'label'     => __('Text color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [$reset_sel => 'color: {{VALUE}};'],
        ]);
        $this->add_control('popup_reset_bg', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [$reset_sel => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('popup_reset_tab_hover', ['label' => __('Hover', 'dcc-guest-guide')]);
        $this->add_control('popup_reset_text_hover', [
            'label'     => __('Text color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                $reset_sel . ':hover, ' . $reset_sel . ':focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->add_control('popup_reset_bg_hover', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                $reset_sel . ':hover, ' . $reset_sel . ':focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    // v0.9.7.11: dedicated Style section for the More menu (⋯) button
    // when it's docked inside the popup header (enable_popup_more_menu
    // = yes). Scoped to .dccgg-detail-header so it doesn't bleed into
    // the hub-toolbar More menu. Covers both the icon variant
    // (.dccgg-more-summary--icon) and the text-label variant
    // (.dccgg-more-summary--text). Popover items are styled by the
    // existing baseline rules; this section governs the summary trigger.
    private function register_popup_more_style_controls(): void
    {
        $summary_sel = self::SEL . '.dccgg-detail-header .dccgg-more > summary';
        $hover_sel   = $summary_sel . ':hover, ' . $summary_sel . ':focus-visible';
        $open_sel    = self::SEL . '.dccgg-detail-header .dccgg-more[open] > summary';

        $this->start_controls_section('section_style_popup_more', [
            'label' => __('Popup Header — More Button (⋯)', 'dcc-guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'popup_more_typography',
            'selector' => $summary_sel,
        ]);

        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'popup_more_border',
            'selector' => $summary_sel,
        ]);

        $this->add_control('popup_more_radius', [
            'label'      => __('Border radius', 'dcc-guest-guide'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [$summary_sel => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->add_control('popup_more_padding', [
            'label'       => __('Padding', 'dcc-guest-guide'),
            'description' => __('Mostly relevant when "More button label" is set in General; the icon-only variant uses a fixed 36×36 circle.', 'dcc-guest-guide'),
            'type'        => Controls_Manager::DIMENSIONS,
            'size_units'  => ['px', 'em'],
            'selectors'   => [$summary_sel => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('popup_more_tabs');

        $this->start_controls_tab('popup_more_tab_normal', ['label' => __('Normal', 'dcc-guest-guide')]);
        $this->add_control('popup_more_text', [
            'label'     => __('Text / icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                $summary_sel => 'color: {{VALUE}};',
                $summary_sel . ' i'   => 'color: {{VALUE}};',
                $summary_sel . ' svg' => 'fill: {{VALUE}};',
            ],
        ]);
        $this->add_control('popup_more_bg', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [$summary_sel => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('popup_more_tab_hover', ['label' => __('Hover / Open', 'dcc-guest-guide')]);
        $this->add_control('popup_more_text_hover', [
            'label'     => __('Text / icon color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                $hover_sel       => 'color: {{VALUE}};',
                $open_sel        => 'color: {{VALUE}};',
                $hover_sel . ' i'   => 'color: {{VALUE}};',
                $hover_sel . ' svg' => 'fill: {{VALUE}};',
                $open_sel  . ' i'   => 'color: {{VALUE}};',
                $open_sel  . ' svg' => 'fill: {{VALUE}};',
            ],
        ]);
        $this->add_control('popup_more_bg_hover', [
            'label'     => __('Background color', 'dcc-guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                $hover_sel => 'background-color: {{VALUE}};',
                $open_sel  => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

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


        $items_by_section = [];
        foreach ($items_raw as $i => $item) {
            $key = trim((string) ($item['item_section'] ?? ''));
            if ($key === '' || !isset($valid_keys[$key])) {
                continue;
            }
            $items_by_section[$key][] = $item;
        }
        // v0.9.7.16: search index re-inlined into data-config. The v0.9.7.14
        // lazy-AJAX path regressed search in production — when SpeedyCache
        // served HTML missing the new postId/widgetId fields, the AJAX call
        // returned an empty index and the JS "Whoops! No matches" message
        // fired for every query. The 30-50 KB inlined-payload optimization
        // wasn't worth the reliability cost. The dccgg_search_index AJAX
        // endpoint stays registered as a defensive fallback for browsers
        // still running cached v0.9.7.14/15 JS.
        $search_index = $enable_search ? self::build_search_index($s) : [];

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
        $theme_preset   = (string) ($s['theme_preset'] ?? 'custom');

        // v0.9: resolve emergency + checkout section keys. First section with
        // the role wins; duplicates are silently ignored.
        $emergency_key = '';
        $checkout_key  = '';
        foreach ($sections as $sec) {
            $sk   = trim((string) ($sec['section_key'] ?? ''));
            $role = (string) ($sec['section_role'] ?? '');
            if ($sk === '') { continue; }
            if ($emergency_key === '' && $role === 'emergency') { $emergency_key = $sk; }
            if ($checkout_key  === '' && $role === 'checkout')  { $checkout_key  = $sk; }
        }

        // Build the emergency-contacts list for the data-config block; the
        // 911 chip is auto-added on the JS side using str_emergency_911.
        $emergency_contacts_raw = (array) ($s['emergency_contacts'] ?? []);
        $emergency_contacts = [];
        foreach ($emergency_contacts_raw as $row) {
            $label = trim((string) ($row['contact_label'] ?? ''));
            $phone = trim((string) ($row['contact_phone'] ?? ''));
            $map   = trim((string) ($row['contact_map'] ?? ''));
            $icon  = trim((string) ($row['contact_icon'] ?? '📞'));
            if ($label === '' && $phone === '' && $map === '') { continue; }
            $emergency_contacts[] = [
                'label' => $label,
                'phone' => $phone,
                'map'   => $map,
                'icon'  => $icon !== '' ? $icon : '📞',
            ];
        }

        $config = [
            'revealMode'       => $reveal_mode,
            'menuLayout'       => $menu_layout,
            'enableSearch'         => $enable_search,
            'enableFab'            => $enable_fab,
            'enableHaptic'         => ($s['enable_haptic'] ?? '') === 'yes',
            'enableSectionNav'     => ($s['enable_section_nav'] ?? 'yes') === 'yes',
            'enableDetailMoreMenu' => ($s['enable_detail_more_menu'] ?? '') === 'yes',
            'ajaxUrl'              => admin_url('admin-ajax.php'),
            'nonce'                => wp_create_nonce('dccgg_nonce'),
            'cottageLat'           => (float) ($s['cottage_latitude']  ?? 28.8028),
            'cottageLng'           => (float) ($s['cottage_longitude'] ?? -81.6448),
            'conditionsExtras'     => ($s['enable_conditions_extras'] ?? 'yes') === 'yes',
            // v0.9.7.14: every English string baked into widget.js for the
            // conditions card is sent through __() so Loco Translate / WPML
            // can localize them.
            'conditionsStrings'    => [
                'weather' => [
                    'clear'             => __('Clear', 'dcc-guest-guide'),
                    'mostly_clear'      => __('Mostly clear', 'dcc-guest-guide'),
                    'partly_cloudy'     => __('Partly cloudy', 'dcc-guest-guide'),
                    'overcast'          => __('Overcast', 'dcc-guest-guide'),
                    'fog'               => __('Fog', 'dcc-guest-guide'),
                    'light_drizzle'     => __('Light drizzle', 'dcc-guest-guide'),
                    'drizzle'           => __('Drizzle', 'dcc-guest-guide'),
                    'heavy_drizzle'     => __('Heavy drizzle', 'dcc-guest-guide'),
                    'light_rain'        => __('Light rain', 'dcc-guest-guide'),
                    'rain'              => __('Rain', 'dcc-guest-guide'),
                    'heavy_rain'        => __('Heavy rain', 'dcc-guest-guide'),
                    'light_snow'        => __('Light snow', 'dcc-guest-guide'),
                    'snow'              => __('Snow', 'dcc-guest-guide'),
                    'heavy_snow'        => __('Heavy snow', 'dcc-guest-guide'),
                    'showers'           => __('Showers', 'dcc-guest-guide'),
                    'heavy_showers'     => __('Heavy showers', 'dcc-guest-guide'),
                    'violent_showers'   => __('Violent showers', 'dcc-guest-guide'),
                    'thunderstorm'      => __('Thunderstorm', 'dcc-guest-guide'),
                    'thunderstorm_hail' => __('Thunderstorm + hail', 'dcc-guest-guide'),
                    'severe_thunder'    => __('Severe thunderstorm', 'dcc-guest-guide'),
                    'mixed'             => __('Mixed', 'dcc-guest-guide'),
                ],
                'pressure' => [
                    'rising'  => __('bass more active', 'dcc-guest-guide'),
                    'falling' => __('bite often slow, then picks up before storms', 'dcc-guest-guide'),
                    'steady'  => __('steady pressure — bite predictable', 'dcc-guest-guide'),
                ],
                'wind' => [
                    'label'         => __('Wind', 'dcc-guest-guide'),
                    'gusts'         => __('gusts', 'dcc-guest-guide'),
                    'flat'          => __('flat on the Dora Canal — pick any shore', 'dcc-guest-guide'),
                    'south_shore'   => __('south shore of Lake Dora will be the calm side', 'dcc-guest-guide'),
                    'sw_shore'      => __('southwest shore of Lake Dora — try the cove off Lake Dora Pkwy', 'dcc-guest-guide'),
                    'west_shore'    => __('west shore of Lake Dora — try the cove off Lake Dora Pkwy', 'dcc-guest-guide'),
                    'nw_shore'      => __('northwest shore of Lake Dora — sheltered along the Tavares side', 'dcc-guest-guide'),
                    'north_shore'   => __('north shore of Lake Dora — try the lily-pad line off Wooton Park', 'dcc-guest-guide'),
                    'ne_shore'      => __('northeast shore of Lake Dora near the canal mouth', 'dcc-guest-guide'),
                    'east_shore'    => __('east shore of Lake Dora — Dora Canal entrance is sheltered', 'dcc-guest-guide'),
                    'se_shore'      => __('southeast shore of Lake Dora will be the calm side', 'dcc-guest-guide'),
                ],
                'uv' => [
                    'extreme'         => __('extreme', 'dcc-guest-guide'),
                    'very_high'       => __('very high', 'dcc-guest-guide'),
                    'high'            => __('high', 'dcc-guest-guide'),
                    'moderate'        => __('moderate', 'dcc-guest-guide'),
                    'low'             => __('low', 'dcc-guest-guide'),
                    'reapply_by'      => /* translators: %s: clock time */ __('reapply sunscreen by %s', 'dcc-guest-guide'),
                    'sunscreen'       => __('sunscreen recommended', 'dcc-guest-guide'),
                ],
                'heat' => [
                    'danger' => __('dangerous heat — limit time outdoors, drink water every 20 min', 'dcc-guest-guide'),
                    'warn'   => __('drink water every 30 min', 'dcc-guest-guide'),
                ],
                'lake' => [
                    'fallback_name' => __('Lake', 'dcc-guest-guide'),
                    'surface'       => __('surface', 'dcc-guest-guide'),
                    'cold'          => __('cold water — bass deep and slow', 'dcc-guest-guide'),
                    'cool'          => __('cool water — bass moving up to feed', 'dcc-guest-guide'),
                    'prime'         => __('prime water temp — bass active shallow', 'dcc-guest-guide'),
                    'warm'          => __('warm water — bass early and late, shaded mid-day', 'dcc-guest-guide'),
                    'hot'           => __('hot water — bass deep, focus on dawn and dusk', 'dcc-guest-guide'),
                ],
            ],
            'aiSearch'             => [
                'enabled'  => ($s['enable_ai_search'] ?? '') === 'yes' && get_option('dccgg_gemini_key', '') !== '',
                'label'    => (string) ($s['ai_search_button_label'] ?? __('Ask anything about the cottage', 'dcc-guest-guide')),
                'privacy'  => (string) ($s['ai_search_privacy'] ?? ''),
                'thinking' => (string) __('Thinking…', 'dcc-guest-guide'),
                'error'    => (string) __('Sorry — I couldn\'t answer that. Try contacting the host.', 'dcc-guest-guide'),
                'askAgain' => (string) __('Ask another question', 'dcc-guest-guide'),
                'voiceLabel' => (string) ($s['str_ai_voice'] ?? __('Ask by voice', 'dcc-guest-guide')),
            ],
            'savePdf'              => [
                'label' => (string) ($s['str_save_pdf'] ?? __('Save as PDF', 'dcc-guest-guide')),
                'tip'   => (string) ($s['str_save_pdf_tip'] ?? __('In the print dialog, choose "Save as PDF" as the destination.', 'dcc-guest-guide')),
            ],
            'manualPdfUrl'         => (function () use ($s) {
                $m = $s['manual_pdf'] ?? null;
                $u = is_array($m) ? trim((string) ($m['url'] ?? '')) : '';
                return esc_url_raw($u);
            })(),
            'copyEffect'           => (string) ($s['copy_effect'] ?? 'confetti'),
            'report'               => [
                'enabled'    => ($s['enable_problem_report'] ?? '') === 'yes',
                'perItem'    => ($s['enable_per_item_report'] ?? '') === 'yes',
                // v0.9.7.14: recipient list / From identity / templates resolved
                // server-side from widget settings keyed by postId + widgetId,
                // so they never appear in page source.
                'categories' => array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) ($s['problem_report_categories'] ?? '')) ?: []))),
                'strings'    => [
                    'menuLabel'  => (string) ($s['str_report_problem'] ?? __('Report a problem', 'dcc-guest-guide')),
                    'title'      => (string) ($s['str_report_title'] ?? __('Report a problem', 'dcc-guest-guide')),
                    'category'   => (string) ($s['str_report_category'] ?? __('What\'s the issue?', 'dcc-guest-guide')),
                    'desc'       => (string) ($s['str_report_desc'] ?? __('Describe the problem', 'dcc-guest-guide')),
                    'contact'    => (string) ($s['str_report_contact'] ?? __('Email to reach you back (optional)', 'dcc-guest-guide')),
                    'privacy'    => (string) ($s['str_report_privacy'] ?? __('Your report is emailed straight to the host. It is not stored on this site.', 'dcc-guest-guide')),
                    'send'       => (string) ($s['str_report_send'] ?? __('Send report', 'dcc-guest-guide')),
                    'cancel'     => (string) ($s['str_report_cancel'] ?? __('Cancel', 'dcc-guest-guide')),
                    'thankYou'   => (string) ($s['str_report_thank_you'] ?? __('Thanks! Your host has been notified.', 'dcc-guest-guide')),
                    'error'      => (string) ($s['str_report_error'] ?? __('Could not send. Please contact the host directly.', 'dcc-guest-guide')),
                    'perItem'    => (string) ($s['str_per_item_report'] ?? __('Report', 'dcc-guest-guide')),
                    'name'       => (string) ($s['str_report_name']    ?? __('Your name (optional)', 'dcc-guest-guide')),
                    'cottage'    => (string) ($s['str_report_cottage'] ?? __('Which cottage are you staying in?', 'dcc-guest-guide')),
                    'phone'      => (string) ($s['str_report_phone']   ?? __('Phone (optional)', 'dcc-guest-guide')),
                ],
            ],
            'emergency'        => [
                'key'        => $emergency_key,
                'fab'        => $emergency_key !== '' && ($s['enable_emergency_fab'] ?? '') === 'yes',
                'noaaBanner' => $emergency_key !== '' && ($s['enable_noaa_banner'] ?? '') === 'yes',
                'contacts'   => $emergency_contacts,
                'strings'    => [
                    'sos'         => (string) ($s['str_emergency_sos']      ?? __('Emergency', 'dcc-guest-guide')),
                    'call911'     => (string) ($s['str_emergency_911']      ?? __('Call 911', 'dcc-guest-guide')),
                    'bannerPrefix'=> (string) ($s['str_noaa_banner_prefix'] ?? __('Active weather alert:', 'dcc-guest-guide')),
                    'bannerMore'  => (string) ($s['str_noaa_more']          ?? __('More info', 'dcc-guest-guide')),
                ],
            ],
            'review'           => [
                'enabled' => $checkout_key !== '' && ($s['enable_checkout_review'] ?? '') === 'yes',
                'key'     => $checkout_key,
                'template'=> (string) ($s['review_template_text'] ?? ''),
                'urls'    => [
                    'airbnb' => (string) ($s['review_airbnb_url']['url'] ?? ''),
                    'vrbo'   => (string) ($s['review_vrbo_url']['url']   ?? ''),
                    'google' => (string) ($s['review_google_url']['url'] ?? ''),
                ],
                'extras'  => array_values(array_filter(array_map(static function ($row) {
                    if (!is_array($row)) { return null; }
                    $url = trim((string) ($row['extra_url']['url'] ?? ''));
                    if ($url === '') { return null; }
                    $icon = is_array($row['extra_icon'] ?? null) ? $row['extra_icon'] : null;
                    return [
                        'label' => (string) ($row['extra_label'] ?? ''),
                        'url'   => $url,
                        'icon'  => $icon ? [
                            'value'   => (string) ($icon['value']   ?? ''),
                            'library' => (string) ($icon['library'] ?? ''),
                        ] : null,
                    ];
                }, (array) ($s['review_extras'] ?? [])))),
                'strings' => [
                    'heading'    => (string) ($s['str_review_heading']     ?? __('How was your stay?', 'dcc-guest-guide')),
                    'yes'        => (string) ($s['str_review_yes']         ?? __('Loved it', 'dcc-guest-guide')),
                    'no'         => (string) ($s['str_review_no']          ?? __('Something was off', 'dcc-guest-guide')),
                    'help'       => (string) ($s['str_review_help']        ?? ''),
                    'copyAirbnb' => (string) ($s['str_review_copy_airbnb'] ?? __('Copy & open Airbnb', 'dcc-guest-guide')),
                    'copyVrbo'   => (string) ($s['str_review_copy_vrbo']   ?? __('Copy & open Vrbo', 'dcc-guest-guide')),
                    'copyGoogle' => (string) ($s['str_review_copy_google'] ?? __('Copy & open Google', 'dcc-guest-guide')),
                    'copyExtra'  => (string) ($s['str_review_copy_extra']  ?? __('Copy & open', 'dcc-guest-guide')),
                    'copied'     => (string) ($s['str_review_copied']      ?? __('Review text copied.', 'dcc-guest-guide')),
                    'thanks'     => (string) ($s['str_review_thanks']      ?? __('Thanks for the feedback!', 'dcc-guest-guide')),
                ],
            ],
            'darkMode'         => $dark_mode,
            'themePreset'      => $theme_preset,
            // v0.9.7.14: postId + widgetId let the JS round-trip the report and
            // (lazy) search-index lookups without inlining sensitive data.
            'postId'           => (int) get_the_ID(),
            'widgetId'         => (string) $this->get_id(),
            // v0.9.7.16: searchIndex back inline. Lazy AJAX endpoint stays
            // registered as a fallback for stale cached v0.9.7.14/15 JS.
            'searchIndex'      => $search_index,
            'strings'          => [
                'copied'      => (string) ($s['str_copied'] ?? 'Copied!'),
                'noResults'   => (string) ($s['search_no_results'] ?? 'No matches.'),
                'qrClose'       => (string) ($s['str_qr_close'] ?? 'Close'),
                'lightboxClose' => (string) ($s['str_lightbox_close'] ?? 'Close image'),
            ],
        ];
        // v0.9.7.20: only emit searchIndex when search is enabled. wireSearch
        // is gated on enableSearch anyway, so an empty array is pure payload.
        if (!$enable_search) {
            unset($config['searchIndex']);
        }

        $root_class = 'dccgg-root';
        // v0.9: emergency tile position is driven by a root-level class.
        $emergency_pos = (string) ($s['emergency_position'] ?? 'top');
        if ($emergency_key !== '' && in_array($emergency_pos, ['top', 'bottom'], true)) {
            $root_class .= ' dccgg-emergency-pos-' . $emergency_pos;
        }
        // v0.6: emit per-section accent overrides as a tiny inline <style>.
        $accent_css = self::accent_override_styles($this->get_id(), $sections);
        ?>
        <?php if ($accent_css !== '') { echo $accent_css; /* phpcs:ignore */ } ?>
        <div class="<?php echo esc_attr($root_class); ?>"
             data-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">

            <?php if ($enable_fab) : ?>
                <button type="button" class="dccgg-fab" aria-label="<?php echo esc_attr($s['str_fab_open']); ?>">
                    <?php \Elementor\Icons_Manager::render_icon((array) ($s['fab_icon'] ?? []), ['aria-hidden' => 'true']); ?>
                </button>
                <div class="dccgg-overlay" hidden></div>
            <?php endif; ?>

            <?php if ($emergency_key !== '' && ($s['enable_emergency_fab'] ?? '') === 'yes') : ?>
                <button type="button" class="dccgg-sos-fab" data-emergency-key="<?php echo esc_attr($emergency_key); ?>" aria-label="<?php echo esc_attr($s['str_emergency_sos'] ?? __('Emergency', 'dcc-guest-guide')); ?>" hidden>
                    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                </button>
            <?php endif; ?>

            <?php if ($emergency_key !== '' && ($s['enable_noaa_banner'] ?? '') === 'yes') : ?>
                <div class="dccgg-noaa-banner" role="alert" hidden>
                    <span class="dccgg-noaa-ico" aria-hidden="true">⚠️</span>
                    <span class="dccgg-noaa-text"></span>
                    <a class="dccgg-noaa-link" href="#" target="_blank" rel="noopener" hidden></a>
                </div>
            <?php endif; ?>

            <?php $this->render_print_cover($s, $sections); ?>
            <?php $this->render_print_toc($sections); ?>

            <div class="dccgg-wrapper">
                <?php if ($enable_fab) : ?>
                    <button type="button" class="dccgg-fab-close" aria-label="<?php echo esc_attr($s['str_fab_close']); ?>">&times;</button>
                <?php endif; ?>

                <?php if ($s['heading_show'] === 'yes' && (string) $s['heading_text'] !== '') : ?>
                    <h2 class="dccgg-heading"><?php echo esc_html($s['heading_text']); ?></h2>
                <?php endif; ?>

                <div class="dccgg-toolbar">
                    <?php if ($enable_print) : ?>
                        <button type="button" class="dccgg-btn dccgg-print">
                            <i class="fas fa-print" aria-hidden="true"></i>
                            <?php echo esc_html($s['str_print']); ?>
                        </button>
                    <?php endif; ?>

                    <?php // v0.9.7: More menu (Print / Save PDF / Report a Problem) lives in the hub toolbar so guests reach Settings without first opening a section. v0.9.7.8: markup extracted into render_more_menu().
                    if (($s['enable_detail_more_menu'] ?? '') === 'yes') {
                        $this->render_more_menu($s, 'hub');
                    } ?>
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

                <?php if ($reveal_mode === 'stage') : ?>
                    <div class="dccgg-detail-overlay" hidden></div>
                <?php endif; ?>

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
                $anim_override = (string) ($sec['section_icon_anim'] ?? '');
                $role          = (string) ($sec['section_role'] ?? '');

                // Stable IDs for a11y linkage. Hashed key so a quoted/odd
                // section key still produces a valid attribute value.
                $safe_key   = substr(sha1($widget_uid . '|' . $key), 0, 10);
                $tile_id    = 'dccgg-tile-' . $safe_key;
                $panel_id   = 'dccgg-panel-' . $safe_key;
                ?>
                <div class="dccgg-tile-wrap<?php echo $procedure ? ' dccgg-tile-wrap--procedure' : ''; ?>" data-section-key="<?php echo esc_attr($key); ?>" data-procedure="<?php echo $procedure ? '1' : '0'; ?>"<?php echo $anim_override !== '' ? ' data-icon-anim="' . esc_attr($anim_override) . '"' : ''; ?><?php echo $role !== '' ? ' data-section-role="' . esc_attr($role) . '"' : ''; ?>>
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
        $emoji = trim((string) ($sec['section_emoji'] ?? ''));
        ?>
        <span class="dccgg-tile-icon-wrap">
            <span class="dccgg-tile-icon">
                <?php if ($emoji !== '') : ?>
                    <span class="dccgg-emoji-icon" aria-hidden="true"><?php echo esc_html($emoji); ?></span>
                <?php else :
                    \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']);
                endif; ?>
            </span>
        </span>
        <span class="dccgg-tile-content">
            <span class="dccgg-tile-title"><?php echo esc_html($title); ?></span>
            <?php if ($desc !== '') : ?>
                <span class="dccgg-tile-desc"><?php echo esc_html($desc); ?></span>
            <?php endif; ?>
        </span>
        <?php
    }

    /**
     * v0.9.7.8: render the ⋯ More menu. Shared between the hub toolbar
     * (context='hub', $section_key='') and each popup header
     * (context='popup', $section_key=<that section's key>).
     *
     * Honors three host-configurable settings:
     *  - more_button_label:    empty → icon-only summary; filled → text-only summary.
     *  - more_menu_slot_1..3:  controls item ordering. Duplicate picks across
     *                          slots render only the first occurrence so the
     *                          host can't accidentally double up.
     *  - enable_problem_report: gates the Report a Problem slot independently.
     */
    private function render_more_menu(array $s, string $context, string $section_key = ''): void
    {
        $label_more     = (string) ($s['str_more_menu'] ?? __('More', 'dcc-guest-guide'));
        $label_text     = trim((string) ($s['more_button_label'] ?? ''));
        $label_print    = (string) ($s['str_print'] ?? __('Print guide', 'dcc-guest-guide'));
        $label_save_pdf = (string) ($s['str_save_pdf'] ?? __('Save as PDF', 'dcc-guest-guide'));
        $label_report   = (string) ($s['str_report_problem'] ?? __('Report a problem', 'dcc-guest-guide'));
        $report_on      = ($s['enable_problem_report'] ?? '') === 'yes';
        $slots          = [
            (string) ($s['more_menu_slot_1'] ?? 'print'),
            (string) ($s['more_menu_slot_2'] ?? 'save_pdf'),
            (string) ($s['more_menu_slot_3'] ?? 'report'),
        ];
        $modifier       = $context === 'popup' ? 'dccgg-more--popup' : 'dccgg-more--hub';
        $summary_class  = $label_text !== '' ? 'dccgg-more-summary--text' : 'dccgg-more-summary--icon';
        $rendered       = [];
        ?>
        <details class="dccgg-more <?php echo esc_attr($modifier); ?>">
            <summary class="<?php echo esc_attr($summary_class); ?>" aria-label="<?php echo esc_attr($label_more); ?>">
                <?php if ($label_text !== '') : ?>
                    <span class="dccgg-more-summary-text"><?php echo esc_html($label_text); ?></span>
                <?php else : ?>
                    <i class="fas fa-ellipsis-h" aria-hidden="true"></i>
                <?php endif; ?>
            </summary>
            <div class="dccgg-more-popover" role="menu">
                <?php foreach ($slots as $slot) :
                    if ($slot === 'none' || in_array($slot, $rendered, true)) continue;
                    if ($slot === 'print') :
                        $rendered[] = $slot; ?>
                        <button type="button" class="dccgg-more-item dccgg-more-print" role="menuitem">
                            <i class="fas fa-print" aria-hidden="true"></i> <?php echo esc_html($label_print); ?>
                        </button>
                    <?php elseif ($slot === 'save_pdf') :
                        $rendered[] = $slot; ?>
                        <button type="button" class="dccgg-more-item dccgg-more-save-pdf" role="menuitem">
                            <i class="fas fa-file-pdf" aria-hidden="true"></i> <?php echo esc_html($label_save_pdf); ?>
                        </button>
                    <?php elseif ($slot === 'report' && $report_on) :
                        $rendered[] = $slot; ?>
                        <button type="button" class="dccgg-more-item dccgg-more-report" data-report-section="<?php echo esc_attr($section_key); ?>" role="menuitem">
                            <i class="fas fa-exclamation-circle" aria-hidden="true"></i> <?php echo esc_html($label_report); ?>
                        </button>
                    <?php endif;
                endforeach; ?>
            </div>
        </details>
        <?php
    }

    /**
     * Render the detail stage (stage-swap reveal mode only).
     */
    private function render_stage(array $sections, array $items_by_section, array $s): void
    {
        $label_back     = (string) ($s['str_back'] ?? 'Back');
        $label_prev     = (string) ($s['str_prev_section'] ?? __('Previous section', 'dcc-guest-guide'));
        $label_next     = (string) ($s['str_next_section'] ?? __('Next section', 'dcc-guest-guide'));
        $label_more     = (string) ($s['str_more_menu'] ?? __('More', 'dcc-guest-guide'));
        $label_print    = (string) ($s['str_print'] ?? __('Print guide', 'dcc-guest-guide'));
        $show_nav       = ($s['enable_section_nav'] ?? 'yes') === 'yes';
        $show_more      = ($s['enable_detail_more_menu'] ?? '') === 'yes';
        $valid_sections = array_values(array_filter($sections, static fn($x) => trim((string) ($x['section_key'] ?? '')) !== ''));
        $section_count  = count($valid_sections);
        $lat = (float) ($s['cottage_latitude']  ?? 28.8028);
        $lng = (float) ($s['cottage_longitude'] ?? -81.6448);
        $emergency_contacts_render = (array) ($s['emergency_contacts'] ?? []);
        $label_911 = (string) ($s['str_emergency_911'] ?? __('Call 911', 'dcc-guest-guide'));
        ?>
        <div class="dccgg-stage" aria-live="polite">
            <?php foreach ($valid_sections as $idx => $sec) :
                $key = trim((string) ($sec['section_key'] ?? ''));
                $title = (string) ($sec['section_title'] ?? $key);
                $icon  = (array) ($sec['section_icon'] ?? ['value' => 'fas fa-info', 'library' => 'solid']);
                $items = $items_by_section[$key] ?? [];
                $wizard    = ($sec['wizard_mode'] ?? '') === 'yes';
                $procedure = ($sec['procedure_mode'] ?? '') === 'yes' && !$wizard;
                $checklist = ($sec['checklist_mode'] ?? '') === 'yes' && !$wizard;
                $show_toc  = count($items) >= 4 && !$procedure && !$wizard;
                $prev_key  = $idx > 0 ? trim((string) ($valid_sections[$idx - 1]['section_key'] ?? '')) : '';
                $next_key  = $idx < $section_count - 1 ? trim((string) ($valid_sections[$idx + 1]['section_key'] ?? '')) : '';
                $bg_url    = (string) ($sec['section_bg_image']['url'] ?? '');
                $bg_op     = (int) ($sec['section_bg_overlay']['size'] ?? 55);
                $show_cond = ($sec['show_conditions_card'] ?? '') === 'yes';
                $role      = (string) ($sec['section_role'] ?? '');
                $detail_classes = 'dccgg-detail';
                if ($show_toc)  { $detail_classes .= ' dccgg-detail--has-toc'; }
                if ($wizard)    { $detail_classes .= ' dccgg-detail--wizard'; }
                if ($checklist) { $detail_classes .= ' dccgg-detail--checklist'; }
                if ($bg_url !== '') { $detail_classes .= ' dccgg-detail--parallax'; }
                if ($role === 'emergency') { $detail_classes .= ' dccgg-detail--emergency'; }
                if ($role === 'checkout')  { $detail_classes .= ' dccgg-detail--checkout'; }
                ?>
                <div class="<?php echo esc_attr($detail_classes); ?>" data-key="<?php echo esc_attr($key); ?>" data-wizard="<?php echo $wizard ? '1' : '0'; ?>" data-checklist="<?php echo $checklist ? '1' : '0'; ?>"<?php echo $role !== '' ? ' data-section-role="' . esc_attr($role) . '"' : ''; ?> hidden>
                    <?php if ($bg_url !== '') : ?>
                        <div class="dccgg-parallax-bg" aria-hidden="true" style="background-image:url('<?php echo esc_url($bg_url); ?>');">
                            <div class="dccgg-parallax-overlay" style="opacity: <?php echo esc_attr((string) ($bg_op / 100)); ?>;"></div>
                        </div>
                    <?php endif; ?>
                    <span class="dccgg-shrink-sentinel" aria-hidden="true"></span>
                    <div class="dccgg-progress-bar" aria-hidden="true"></div>
                    <div class="dccgg-detail-header">
                        <div class="dccgg-detail-header-actions">
                            <button type="button" class="dccgg-btn dccgg-back">
                                <i class="fas fa-arrow-left" aria-hidden="true"></i> <?php echo esc_html($label_back); ?>
                            </button>
                            <?php if ($show_nav && $section_count > 1) : ?>
                                <div class="dccgg-section-nav">
                                    <button type="button" class="dccgg-section-prev" aria-label="<?php echo esc_attr($label_prev); ?>" <?php echo $prev_key === '' ? 'disabled' : 'data-target-key="' . esc_attr($prev_key) . '"'; ?>>
                                        <i class="fas fa-chevron-left" aria-hidden="true"></i>
                                    </button>
                                    <button type="button" class="dccgg-section-next" aria-label="<?php echo esc_attr($label_next); ?>" <?php echo $next_key === '' ? 'disabled' : 'data-target-key="' . esc_attr($next_key) . '"'; ?>>
                                        <i class="fas fa-chevron-right" aria-hidden="true"></i>
                                    </button>
                                </div>
                            <?php else : ?>
                                <span class="dccgg-section-nav-spacer" aria-hidden="true"></span>
                            <?php endif; ?>
                            <?php // v0.9.7: More menu moved to the hub toolbar (see render() above). v0.9.7.9: optionally also rendered inside row 2 below when enable_popup_more_menu=yes. ?>
                        </div>
                        <?php // v0.9.7.9: row 2 wrapped in a 1fr/auto/1fr grid so the title stays centered whether the right cell holds the ⋯ menu or an invisible spacer.
                        $show_popup_more = ($s['enable_popup_more_menu'] ?? '') === 'yes' && ($s['enable_detail_more_menu'] ?? '') === 'yes'; ?>
                        <div class="dccgg-detail-header-titlebar">
                            <span class="dccgg-detail-titlebar-spacer" aria-hidden="true"></span>
                            <h2 class="dccgg-detail-title">
                                <span class="dccgg-detail-title-icon">
                                    <?php \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']); ?>
                                </span>
                                <span class="dccgg-detail-title-text"><?php echo esc_html($title); ?></span>
                            </h2>
                            <?php if ($show_popup_more) : ?>
                                <?php $this->render_more_menu($s, 'popup', $key); ?>
                            <?php else : ?>
                                <span class="dccgg-detail-titlebar-spacer" aria-hidden="true"></span>
                            <?php endif; ?>
                        </div>
                        <?php // v0.9.7.10: checklist progress moved INSIDE the sticky header (was a sibling below) so it stays visible as the guest scrolls long checklists.
                        if ($checklist) : ?>
                            <div class="dccgg-checklist-progress" data-section-key="<?php echo esc_attr($key); ?>">
                                <div class="dccgg-checklist-progress-fill"></div>
                                <span class="dccgg-checklist-progress-label">0&nbsp;/&nbsp;<?php echo (int) count($items); ?></span>
                                <button type="button" class="dccgg-checklist-reset" data-section-key="<?php echo esc_attr($key); ?>"><?php esc_html_e('Reset', 'dcc-guest-guide'); ?></button>
                            </div>
                        <?php endif; ?>
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
                        <?php
                        // v0.9.7.13: conditions card position — "first" (above items, original behavior) or "last" (after items).
                        $cond_extras   = ($s['enable_conditions_extras'] ?? 'yes') === 'yes';
                        $cond_position = ($s['conditions_position'] ?? 'first') === 'last' ? 'last' : 'first';
                        $cond_title    = (string) ($s['str_conditions_title'] ?? __('At the cottage today', 'dcc-guest-guide'));
                        ?>
                        <?php if ($show_cond && $cond_position === 'first') : self::render_conditions_card($lat, $lng, $cond_extras, $cond_title); endif; ?>
                        <?php if ($role === 'emergency') : self::render_emergency_contacts($emergency_contacts_render, $label_911); endif; ?>
                        <?php if ($wizard) : ?>
                            <?php $this->render_wizard($items, $s); ?>
                        <?php elseif ($procedure) : ?>
                            <ol class="dccgg-detail-items dccgg-procedure">
                                <?php foreach ($items as $it_idx => $it) {
                                    echo '<li>';
                                    $this->render_item($it, $s, false, $checklist, $it_idx, $key);
                                    echo '</li>';
                                } ?>
                            </ol>
                        <?php else : ?>
                            <div class="dccgg-detail-items">
                                <?php foreach ($items as $it_idx => $it) {
                                    echo '<div class="dccgg-detail-item-anchor" data-item-idx="' . (int) $it_idx . '">';
                                    $this->render_item($it, $s, false, $checklist, $it_idx, $key);
                                    echo '</div>';
                                } ?>
                            </div>
                        <?php endif; ?>
                        <?php if ($show_cond && $cond_position === 'last') : self::render_conditions_card($lat, $lng, $cond_extras, $cond_title); endif; ?>
                        <?php if ($role === 'checkout' && ($s['enable_checkout_review'] ?? '') === 'yes') : $this->render_review_prompt($s, $title); endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
        <?php
    }

    /**
     * Emergency contacts quick-call strip. Renders at the top of the
     * emergency section's detail. The 911 chip is auto-prepended so the
     * host doesn't have to remember to add it.
     */
    public static function render_emergency_contacts(array $contacts, string $label_911): void
    {
        ?>
        <div class="dccgg-emergency-strip" aria-label="<?php echo esc_attr__('Emergency contacts', 'dcc-guest-guide'); ?>">
            <a class="dccgg-emergency-chip dccgg-emergency-chip--911" href="tel:911">
                <span class="dccgg-emergency-chip-ico" aria-hidden="true">🚨</span>
                <span class="dccgg-emergency-chip-label"><?php echo esc_html($label_911); ?></span>
            </a>
            <?php foreach ($contacts as $row) :
                $label = trim((string) ($row['contact_label'] ?? ''));
                $phone = trim((string) ($row['contact_phone'] ?? ''));
                $map   = trim((string) ($row['contact_map'] ?? ''));
                $icon  = trim((string) ($row['contact_icon'] ?? '📞'));
                if ($icon === '') { $icon = '📞'; }
                if ($label === '' && $phone === '' && $map === '') { continue; }
                // Prefer phone, fall back to map URL, fall back to text-only chip.
                if ($phone !== '') {
                    $href     = 'tel:' . preg_replace('/[^0-9+]/', '', $phone);
                    $external = false;
                } elseif ($map !== '') {
                    $href     = (preg_match('~^https?://~i', $map) ? $map : 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode($map));
                    $external = true;
                } else {
                    $href     = '';
                    $external = false;
                }
                $text = $label !== '' ? $label : ($phone !== '' ? $phone : $map);
                if ($href !== '') : ?>
                    <a class="dccgg-emergency-chip" href="<?php echo esc_url($href); ?>"<?php echo $external ? ' target="_blank" rel="noopener"' : ''; ?>>
                        <span class="dccgg-emergency-chip-ico" aria-hidden="true"><?php echo esc_html($icon); ?></span>
                        <span class="dccgg-emergency-chip-label"><?php echo esc_html($text); ?></span>
                        <?php if ($label !== '' && $phone !== '') : ?>
                            <span class="dccgg-emergency-chip-sub"><?php echo esc_html($phone); ?></span>
                        <?php endif; ?>
                    </a>
                <?php else : ?>
                    <span class="dccgg-emergency-chip dccgg-emergency-chip--static">
                        <span class="dccgg-emergency-chip-ico" aria-hidden="true"><?php echo esc_html($icon); ?></span>
                        <span class="dccgg-emergency-chip-label"><?php echo esc_html($text); ?></span>
                    </span>
                <?php endif;
            endforeach; ?>
        </div>
        <?php
    }

    /**
     * Checkout review prompt scaffold. JS injects the 👍 / 👎 panel into
     * .dccgg-review-prompt on first open. The prompt is wired via class
     * + data-section so the JS doesn't need to know which key it belongs
     * to in advance.
     */
    private function render_review_prompt(array $s, string $section_title): void
    {
        $heading = (string) ($s['str_review_heading'] ?? __('How was your stay?', 'dcc-guest-guide'));
        $yes     = (string) ($s['str_review_yes']     ?? __('Loved it', 'dcc-guest-guide'));
        $no      = (string) ($s['str_review_no']      ?? __('Something was off', 'dcc-guest-guide'));
        ?>
        <div class="dccgg-review-prompt" data-review-section="<?php echo esc_attr($section_title); ?>">
            <h3 class="dccgg-review-heading"><?php echo esc_html($heading); ?></h3>
            <div class="dccgg-review-choice">
                <button type="button" class="dccgg-review-yes">
                    <span class="dccgg-review-emoji" aria-hidden="true">👍</span>
                    <span><?php echo esc_html($yes); ?></span>
                </button>
                <button type="button" class="dccgg-review-no">
                    <span class="dccgg-review-emoji" aria-hidden="true">👎</span>
                    <span><?php echo esc_html($no); ?></span>
                </button>
            </div>
            <div class="dccgg-review-panel" hidden></div>
            <div class="dccgg-review-thanks" hidden></div>
        </div>
        <?php
    }

    /**
     * Render a section's items in wizard mode: one step visible at a time
     * with Next / Back buttons and a progress-dot strip. JS toggles which
     * step is active; this is purely the rendered scaffold.
     */
    private function render_wizard(array $items, array $s): void
    {
        $count       = count($items);
        $label_prev  = (string) ($s['str_wizard_prev'] ?? __('Back', 'dcc-guest-guide'));
        $label_next  = (string) ($s['str_wizard_next'] ?? __('Next', 'dcc-guest-guide'));
        $label_done  = (string) ($s['str_wizard_done'] ?? __('Done', 'dcc-guest-guide'));
        ?>
        <div class="dccgg-wizard" data-step="0" data-total="<?php echo (int) $count; ?>">
            <div class="dccgg-wizard-dots" role="tablist" aria-label="<?php echo esc_attr__('Wizard progress', 'dcc-guest-guide'); ?>">
                <?php for ($i = 0; $i < $count; $i++) : ?>
                    <button type="button" class="dccgg-wizard-dot<?php echo $i === 0 ? ' is-active' : ''; ?>" role="tab" aria-label="<?php echo esc_attr(sprintf(/* translators: 1: current step, 2: total steps */ __('Step %1$d of %2$d', 'dcc-guest-guide'), $i + 1, $count)); ?>" data-wizard-goto="<?php echo (int) $i; ?>"></button>
                <?php endfor; ?>
            </div>
            <div class="dccgg-wizard-steps">
                <?php foreach ($items as $idx => $it) : ?>
                    <div class="dccgg-wizard-step<?php echo $idx === 0 ? ' is-active' : ''; ?>" data-wizard-step="<?php echo (int) $idx; ?>" <?php echo $idx === 0 ? '' : 'hidden'; ?>>
                        <p class="dccgg-wizard-counter"><?php echo esc_html(sprintf(/* translators: 1: current step, 2: total steps */ __('Step %1$d of %2$d', 'dcc-guest-guide'), $idx + 1, $count)); ?></p>
                        <?php $this->render_item($it, $s, false); ?>
                    </div>
                <?php endforeach; ?>
            </div>
            <div class="dccgg-wizard-actions">
                <button type="button" class="dccgg-btn dccgg-wizard-back" disabled>
                    <i class="fas fa-arrow-left" aria-hidden="true"></i> <?php echo esc_html($label_prev); ?>
                </button>
                <button type="button" class="dccgg-btn dccgg-btn-primary dccgg-wizard-next" data-label-next="<?php echo esc_attr($label_next); ?>" data-label-done="<?php echo esc_attr($label_done); ?>">
                    <?php echo esc_html($label_next); ?> <i class="fas fa-arrow-right" aria-hidden="true"></i>
                </button>
            </div>
        </div>
        <?php
    }

    private function render_item(array $item, array $strings, bool $compact, bool $section_checklist = false, int $item_idx = 0, string $section_key = ''): void
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
        $emoji          = trim((string) ($item['item_emoji'] ?? ''));
        $checkable      = $section_checklist || ($item['item_checkable'] ?? '') === 'yes';
        $wifi_on        = ($item['item_wifi_mode'] ?? '') === 'yes';
        $wifi_ssid      = trim((string) ($item['wifi_ssid'] ?? ''));
        $wifi_security  = (string) ($item['wifi_security'] ?? 'WPA');
        $wifi_hidden    = ($item['wifi_hidden'] ?? '') === 'yes';
        $wifi_payload   = ($wifi_on && $wifi_ssid !== '')
            ? self::wifi_qr_payload($wifi_ssid, $copy_val, $wifi_security, $wifi_hidden)
            : '';

        // Auto-fold (v0.6): when the WYSIWYG word count exceeds the global
        // threshold, force read-more even when the per-item toggle is off.
        $auto_fold_words = max(0, (int) ($strings['auto_fold_words'] ?? 0));
        if (!$read_more && $auto_fold_words > 0 && $source === 'wysiwyg') {
            $plain = trim(wp_strip_all_tags($content));
            if ($plain !== '') {
                $wc = count(preg_split('/\s+/u', $plain) ?: []);
                if ($wc > $auto_fold_words) {
                    $read_more = true;
                }
            }
        }
        $video_thumbs = ($strings['enable_video_thumbnails'] ?? 'yes') === 'yes';

        // Auto-link + read-time apply to WYSIWYG content only.
        $body_html = '';
        if ($source === 'wysiwyg') {
            $body_html = wpautop(self::auto_link_html(wp_kses_post($content)));
        }
        $read_time = $source === 'wysiwyg' ? self::read_time_text($content) : '';
        $tts_supported_text = ($source === 'wysiwyg') ? trim(wp_strip_all_tags($content)) : '';
        ?>
        <article class="dccgg-item<?php echo $compact ? ' dccgg-item--compact' : ''; ?><?php echo $checkable ? ' dccgg-item--checkable' : ''; ?>" data-item-title="<?php echo esc_attr($title); ?>" data-tts-text="<?php echo esc_attr(mb_substr($tts_supported_text, 0, 3000)); ?>"<?php if ($checkable) : ?> data-checkable="1" data-check-key="<?php echo esc_attr($section_key . ':' . $item_idx); ?>"<?php endif; ?>>
            <h3 class="dccgg-item-title">
                <?php if ($checkable) : ?>
                    <button type="button" class="dccgg-item-check" aria-pressed="false" aria-label="<?php echo esc_attr(sprintf(/* translators: %s: item title */ __('Mark "%s" as done', 'dcc-guest-guide'), $title)); ?>">
                        <span class="dccgg-item-check-box" aria-hidden="true">
                            <i class="fas fa-check"></i>
                        </span>
                    </button>
                <?php endif; ?>
                <?php if ($emoji !== '') : ?>
                    <span class="dccgg-emoji-icon" aria-hidden="true"><?php echo esc_html($emoji); ?></span>
                <?php else :
                    \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']);
                endif; ?>
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
                <?php if (($strings['enable_problem_report'] ?? '') === 'yes' && ($strings['enable_per_item_report'] ?? '') === 'yes') : ?>
                    <button type="button" class="dccgg-item-report" data-report-section="<?php echo esc_attr($section_key); ?>" data-report-item="<?php echo esc_attr($title); ?>" aria-label="<?php echo esc_attr($strings['str_per_item_report'] ?? __('Report', 'dcc-guest-guide')); ?>">
                        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
                    </button>
                <?php endif; ?>
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
            <?php elseif ($media_type === 'gallery' && !empty($item['item_gallery']) && is_array($item['item_gallery'])) :
                $hotspots = self::parse_hotspots((string) ($item['item_hotspots'] ?? '')); ?>
                <div class="dccgg-gallery-strip" role="list">
                    <?php foreach ($item['item_gallery'] as $g_idx => $g) :
                        $g_url = (string) ($g['url'] ?? '');
                        if ($g_url === '') { continue; }
                        $pins = $hotspots[$g_idx] ?? [];
                        $alt  = (string) ($g['alt'] ?? $title);
                        ?>
                        <button type="button"
                                class="dccgg-gallery-thumb<?php echo $pins ? ' has-hotspots' : ''; ?>"
                                role="listitem"
                                data-gallery-idx="<?php echo (int) $g_idx; ?>"
                                data-hotspots="<?php echo esc_attr(wp_json_encode($pins)); ?>"
                                style="background-image:url('<?php echo esc_url($g_url); ?>');"
                                aria-label="<?php echo esc_attr($alt); ?>">
                            <?php if ($pins) : ?>
                                <span class="dccgg-gallery-pin-badge" aria-hidden="true"><i class="fas fa-map-pin"></i> <?php echo (int) count($pins); ?></span>
                            <?php endif; ?>
                        </button>
                    <?php endforeach; ?>
                </div>
            <?php elseif ($media_type === 'video' && !empty($item['item_video'])) :
                $v = self::normalize_video_url((string) $item['item_video']);
                if ($v !== null) :
                    if ($v['self_hosted']) : ?>
                        <video class="dccgg-media" controls preload="metadata">
                            <source src="<?php echo esc_url($v['embed']); ?>">
                        </video>
                    <?php else :
                        $poster = $video_thumbs ? self::resolve_video_poster((string) $item['item_video']) : '';
                        if ($poster !== '') : ?>
                            <button type="button" class="dccgg-video-poster" data-embed="<?php echo esc_attr($v['embed']); ?>" aria-label="<?php echo esc_attr(sprintf(/* translators: %s: item title */ __('Play video: %s', 'dcc-guest-guide'), $title)); ?>" style="background-image:url('<?php echo esc_url($poster); ?>');">
                                <span class="dccgg-video-play" aria-hidden="true"><i class="fas fa-play"></i></span>
                            </button>
                        <?php else : ?>
                            <iframe class="dccgg-media" src="<?php echo esc_url($v['embed']); ?>" loading="lazy" allowfullscreen frameborder="0" referrerpolicy="strict-origin-when-cross-origin"></iframe>
                        <?php endif;
                    endif;
                endif;
            endif; ?>

            <?php if ($map_on || $copy_on || $wifi_payload !== '') : ?>
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
                    <?php endif; ?>
                    <?php if ($wifi_payload !== '') : ?>
                        <button type="button" class="dccgg-btn dccgg-qr dccgg-qr--wifi"
                                data-qr="<?php echo esc_attr($wifi_payload); ?>"
                                data-qr-title="<?php echo esc_attr(sprintf(/* translators: %s: WiFi network name */ __('Join WiFi: %s', 'dcc-guest-guide'), $wifi_ssid)); ?>"
                                data-qr-caption="<?php echo esc_attr($wifi_ssid . ($copy_val !== '' && $wifi_security !== 'nopass' ? '  ·  ' . sprintf(/* translators: %s: WiFi password */ __('Password: %s', 'dcc-guest-guide'), $copy_val) : '')); ?>">
                            <i class="fas fa-wifi" aria-hidden="true"></i> <?php echo esc_html($strings['str_wifi_qr'] ?? __('Show WiFi QR', 'dcc-guest-guide')); ?>
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
    public static function extract_search_text(array $item, bool $include_templates = false): string
    {
        // Request-scoped memo so the same template referenced by multiple
        // items only renders once per pageload. Prior to v0.4 this was O(N)
        // template renders when "Include templates in search" was on.
        static $tpl_cache = [];

        $parts = [];
        $parts[] = (string) ($item['item_title'] ?? '');
        $parts[] = (string) ($item['item_badge'] ?? '');
        $parts[] = (string) ($item['item_emoji'] ?? '');
        $source = (string) ($item['content_source'] ?? 'wysiwyg');
        if ($source === 'wysiwyg') {
            $parts[] = wp_strip_all_tags((string) ($item['item_content'] ?? ''));
        } elseif ($source === 'template' && $include_templates) {
            $tpl_id = (int) ($item['item_template'] ?? 0);
            if ($tpl_id > 0) {
                if (!array_key_exists($tpl_id, $tpl_cache)) {
                    $tpl_cache[$tpl_id] = wp_strip_all_tags(self::render_template($tpl_id));
                }
                $parts[] = $tpl_cache[$tpl_id];
            }
        }
        if (($item['item_copy'] ?? '') === 'yes') {
            $parts[] = (string) ($item['item_copy_value'] ?? '');
        }
        return mb_substr(trim(preg_replace('/\s+/u', ' ', implode(' ', $parts)) ?: ''), 0, 1500);
    }

    /**
     * v0.9.7.14: Build the search index for a widget's saved sections + items.
     * Shared by Widget::render() and Plugin::handle_search_index() so the lazy
     * AJAX path returns exactly the same payload the page used to inline.
     */
    public static function build_search_index(array $settings): array
    {
        $sections = (array) ($settings['guide_sections'] ?? []);
        $items    = (array) ($settings['guide_items']    ?? []);
        $include_templates = ($settings['include_templates_in_search'] ?? '') === 'yes';

        $valid_keys = [];
        foreach ($sections as $sec) {
            $key = trim((string) ($sec['section_key'] ?? ''));
            if ($key !== '') { $valid_keys[$key] = true; }
        }
        $section_meta = [];
        foreach ($sections as $sec) {
            $k = trim((string) ($sec['section_key'] ?? ''));
            if ($k === '') { continue; }
            $pieces = array_filter([
                trim((string) ($sec['section_title'] ?? '')),
                trim((string) ($sec['section_emoji'] ?? '')),
                trim((string) ($sec['section_desc'] ?? '')),
            ], static fn($v) => $v !== '');
            $section_meta[$k] = mb_substr(implode(' ', $pieces), 0, 200);
        }
        $items_by_section = [];
        $out = [];
        foreach ($items as $item) {
            $key = trim((string) ($item['item_section'] ?? ''));
            if ($key === '' || !isset($valid_keys[$key])) { continue; }
            $items_by_section[$key][] = $item;
            $text = self::extract_search_text($item, $include_templates);
            $section_haystack = $section_meta[$key] ?? '';
            if ($section_haystack !== '') {
                $text = $section_haystack . ' ' . $text;
            }
            $out[] = [
                'section'  => $key,
                'item_idx' => count($items_by_section[$key]) - 1,
                'title'    => (string) ($item['item_title'] ?? ''),
                'text'     => $text,
            ];
        }
        return $out;
    }

    /**
     * Render a saved Elementor template's HTML for an item's "template" content
     * source. Server-rendering on the page (rather than via AJAX) is required so
     * Elementor enqueues the template's per-widget CSS file via the normal page
     * pass — AJAX-only rendering leaves those stylesheets unloaded.
     */
    /**
     * Build a row of clickable preset preview cards for the editor panel.
     * Each card shows a 5-swatch color strip from theme_presets() so the
     * admin can see what each preset looks like before picking it from the
     * SELECT below. Clicking a card sets the SELECT value.
     */
    public static function preset_swatches_html(): string
    {
        $presets = self::theme_presets();
        $vars    = ['--dccgg-primary', '--dccgg-accent', '--dccgg-tile-bg', '--dccgg-detail-bg', '--dccgg-text'];
        $rows    = [];
        $rows[]  = '<div class="dccgg-preset-cards" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
        foreach ($presets as $name => $palette) {
            $strip = '';
            foreach ($vars as $v) {
                $c = isset($palette[$v]) ? $palette[$v] : '#cccccc';
                $strip .= '<span style="flex:1 1 0;height:14px;background:' . esc_attr($c) . ';"></span>';
            }
            $label = ucfirst($name);
            $rows[] = '<button type="button" data-dccgg-preset="' . esc_attr($name) . '" title="' . esc_attr($label) . '" style="flex:1 1 80px;min-width:80px;padding:4px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;text-align:left;">' .
                '<span style="display:flex;gap:1px;border-radius:3px;overflow:hidden;">' . $strip . '</span>' .
                '<span style="display:block;font-size:11px;margin-top:3px;color:#666;">' . esc_html($label) . '</span>' .
                '</button>';
        }
        $rows[] = '</div>';
        // Tiny inline script: when a card is clicked, set the SELECT below
        // it to that value. Uses Backbone change-events so Elementor's
        // live preview updates immediately.
        // v0.6 fix: guard against the IIFE running on every Elementor panel
        // re-render (which happens on selection / undo / tab change),
        // otherwise we accumulate one delegated click listener per render.
        $rows[] = "<script>(function(){"
            . "if(window.__dccggPresetWired)return; window.__dccggPresetWired=1;"
            . "var doc=document; doc.addEventListener('click',function(e){"
            . "var b=e.target.closest('[data-dccgg-preset]'); if(!b) return;"
            . "var card=b; var section=card.closest('.elementor-control'); if(!section) return;"
            . "var panel=section.closest('.elementor-controls') || section.parentNode;"
            . "var sel=panel ? panel.querySelector('select[data-setting=\"theme_preset\"]') : null;"
            . "if(!sel) return;"
            . "sel.value=b.getAttribute('data-dccgg-preset');"
            . "sel.dispatchEvent(new Event('change',{bubbles:true}));"
            . "}, true);"
            . "})();</script>";
        return implode('', $rows);
    }

    /**
     * Resolve a poster image URL for a video item. YouTube IDs map to the
     * static thumbnail; Vimeo IDs go through the public OG endpoint and
     * are cached for a week in a transient. Returns '' when no poster can
     * be derived (self-hosted MP4 / unknown host).
     */
    public static function resolve_video_poster(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }
        $yt_id = null;
        $vimeo_id = null;
        if (preg_match('~^https?://(?:www\.)?youtu\.be/([A-Za-z0-9_\-]{6,})~', $url, $m)) {
            $yt_id = $m[1];
        } elseif (preg_match('~^https?://(?:www\.)?youtube\.com/(?:watch\?v=|embed/|shorts/)([A-Za-z0-9_\-]{6,})~', $url, $m)) {
            $yt_id = $m[1];
        } elseif (preg_match('~^https?://(?:www\.)?(?:player\.)?vimeo\.com/(?:video/)?(\d{6,})~', $url, $m)) {
            $vimeo_id = $m[1];
        }
        if ($yt_id !== null) {
            return 'https://img.youtube.com/vi/' . $yt_id . '/hqdefault.jpg';
        }
        if ($vimeo_id !== null) {
            $key = 'dccgg_vimeo_' . $vimeo_id;
            $cached = get_transient($key);
            if (is_string($cached) && $cached !== '') {
                return $cached;
            }
            try {
                $res = wp_remote_get('https://vimeo.com/api/v2/video/' . $vimeo_id . '.json', ['timeout' => 5]);
                if (!is_wp_error($res)) {
                    $body = wp_remote_retrieve_body($res);
                    $data = json_decode($body, true);
                    if (is_array($data) && isset($data[0]['thumbnail_large']) && is_string($data[0]['thumbnail_large'])) {
                        $poster = $data[0]['thumbnail_large'];
                        set_transient($key, $poster, 7 * DAY_IN_SECONDS);
                        return $poster;
                    }
                }
            } catch (\Throwable $e) {
                error_log('DCCGG: vimeo poster fetch failed for ' . $vimeo_id . ': ' . $e->getMessage());
            }
            // Cache a sentinel so we don't hammer the API on every render.
            set_transient($key, ' ', HOUR_IN_SECONDS);
            return '';
        }
        return '';
    }

    /**
     * Build a per-widget inline <style> block emitting per-section accent
     * overrides. Only sections with a non-empty section_accent contribute
     * a rule, so the output is short for typical guides.
     */
    public static function accent_override_styles(string $widget_uid, array $sections): string
    {
        $rules = [];
        foreach ($sections as $sec) {
            $key   = trim((string) ($sec['section_key'] ?? ''));
            if ($key === '') { continue; }
            $role  = (string) ($sec['section_role'] ?? '');
            // Emergency role auto-applies the baked-in emergency color,
            // unless the host has manually picked a section_accent.
            $color = trim((string) ($sec['section_accent'] ?? ''));
            if ($color === '' && $role === 'emergency') {
                $color = '#d54040';
            }
            if ($color === '') { continue; }
            $color = sanitize_hex_color($color) ?: $color;
            // Scope by tile-wrap data attribute so the override only paints
            // this tile + chip — not the menu-wide primary.
            $sel = '.dccgg-tile-wrap[data-section-key="' . esc_attr($key) . '"]';
            $rules[] = $sel . ' .dccgg-tile-icon { color: ' . esc_attr($color) . '; background: color-mix(in srgb, ' . esc_attr($color) . ' 12%, transparent); }';
            $rules[] = $sel . ' .dccgg-quick-action { color: ' . esc_attr($color) . '; }';
            $rules[] = $sel . ' .dccgg-quick-action:hover, ' . $sel . ' .dccgg-quick-action:focus-visible { background: ' . esc_attr($color) . '; color: #fff; }';
            $rules[] = $sel . ' .dccgg-tile:hover { border-color: ' . esc_attr($color) . '; }';
        }
        if (!$rules) {
            return '';
        }
        return '<style id="' . esc_attr($widget_uid) . '-accents">' . implode('', $rules) . '</style>';
    }

    /**
     * Print-only cover page. Hidden on screen via .dccgg-print-only,
     * surfaced by the @media print block. Branded heading, optional
     * subtitle, page URL, and "Printed on …" footer.
     */
    private function render_print_cover(array $s, array $sections): void
    {
        $heading  = (string) ($s['guide_heading'] ?? __('Guest Guide', 'dcc-guest-guide'));
        $sub      = (string) ($s['guide_subtitle'] ?? '');
        $url      = isset($_SERVER['HTTP_HOST'], $_SERVER['REQUEST_URI'])
            ? esc_url_raw('https://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'])
            : home_url('/');
        $section_count = count(array_filter($sections, static fn($x) => trim((string) ($x['section_key'] ?? '')) !== ''));
        $printed = wp_date(get_option('date_format', 'F j, Y'));
        ?>
        <div class="dccgg-print-only dccgg-print-cover" aria-hidden="true">
            <div class="dccgg-print-cover-band"></div>
            <h1 class="dccgg-print-cover-title"><?php echo esc_html($heading); ?></h1>
            <?php if ($sub !== '') : ?>
                <p class="dccgg-print-cover-sub"><?php echo esc_html($sub); ?></p>
            <?php endif; ?>
            <div class="dccgg-print-cover-meta">
                <p><?php echo esc_html(sprintf(
                    /* translators: %d: number of sections */
                    _n('%d section', '%d sections', $section_count, 'dcc-guest-guide'),
                    $section_count
                )); ?></p>
                <p class="dccgg-print-cover-url"><?php echo esc_html($url); ?></p>
                <p class="dccgg-print-cover-date"><?php
                    /* translators: %s: print date */
                    echo esc_html(sprintf(__('Printed on %s', 'dcc-guest-guide'), $printed));
                ?></p>
            </div>
        </div>
        <?php
    }

    /**
     * Print-only table of contents. One row per section with leader-dot
     * styling. Section numbers from a CSS counter so they renumber if
     * the host reorders sections without a re-edit.
     */
    private function render_print_toc(array $sections): void
    {
        $valid = array_values(array_filter($sections, static fn($x) => trim((string) ($x['section_key'] ?? '')) !== ''));
        if (empty($valid)) { return; }
        ?>
        <nav class="dccgg-print-only dccgg-print-toc" aria-hidden="true">
            <h2 class="dccgg-print-toc-title"><?php esc_html_e('Contents', 'dcc-guest-guide'); ?></h2>
            <ol class="dccgg-print-toc-list">
                <?php foreach ($valid as $sec) :
                    $title = trim((string) ($sec['section_title'] ?? $sec['section_key'] ?? '')); ?>
                    <li>
                        <span class="dccgg-print-toc-label"><?php echo esc_html($title); ?></span>
                        <span class="dccgg-print-toc-leader" aria-hidden="true"></span>
                    </li>
                <?php endforeach; ?>
            </ol>
        </nav>
        <?php
    }

    /**
     * Render the Conditions side-card: sunrise/sunset/moon phase + (when
     * extras are enabled) solunar windows server-side; everything else is
     * a placeholder that the frontend fills via admin-ajax on load. Rows
     * with no data hide themselves — never show "—" or an error state.
     */
    public static function render_conditions_card(float $lat, float $lng, bool $extras = true, string $title = ''): void
    {
        $c = self::compute_conditions($lat, $lng);
        $title = trim($title) !== '' ? $title : __('At the cottage today', 'dcc-guest-guide');
        ?>
        <aside class="dccgg-conditions" data-lat="<?php echo esc_attr((string) $lat); ?>" data-lng="<?php echo esc_attr((string) $lng); ?>" aria-label="<?php echo esc_attr($title); ?>">
            <h3 class="dccgg-conditions-title"><?php echo esc_html($title); ?></h3>
            <?php if ($extras) : ?>
                <div class="dccgg-cond-alert" role="status" hidden>
                    <span class="dccgg-cond-alert-ico" aria-hidden="true">🚨</span>
                    <span class="dccgg-cond-alert-text"></span>
                    <a class="dccgg-cond-alert-link" href="#" target="_blank" rel="noopener" hidden><?php esc_html_e('More info', 'dcc-guest-guide'); ?></a>
                </div>
            <?php endif; ?>
            <ul class="dccgg-conditions-list">
                <?php if ($c['sunrise'] !== '') : ?>
                    <li><span class="dccgg-cond-ico">🌅</span><span class="dccgg-cond-k"><?php esc_html_e('Sunrise', 'dcc-guest-guide'); ?></span><span class="dccgg-cond-v"><?php echo esc_html($c['sunrise']); ?></span></li>
                <?php endif; ?>
                <?php if ($c['sunset'] !== '') : ?>
                    <li><span class="dccgg-cond-ico">🌇</span><span class="dccgg-cond-k"><?php esc_html_e('Sunset', 'dcc-guest-guide'); ?></span><span class="dccgg-cond-v"><?php echo esc_html($c['sunset']); ?></span></li>
                <?php endif; ?>
                <li><span class="dccgg-cond-ico"><?php echo esc_html($c['moon_emoji']); ?></span><span class="dccgg-cond-k"><?php esc_html_e('Moon', 'dcc-guest-guide'); ?></span><span class="dccgg-cond-v"><?php echo esc_html($c['moon_name']); ?> (<?php echo (int) $c['illumination']; ?>%)</span></li>
                <li class="dccgg-cond-weather" data-empty="<?php echo esc_attr__('Loading weather…', 'dcc-guest-guide'); ?>">
                    <span class="dccgg-cond-ico">☁️</span>
                    <span class="dccgg-cond-k"><?php esc_html_e('Weather', 'dcc-guest-guide'); ?></span>
                    <span class="dccgg-cond-v"><?php esc_html_e('Loading…', 'dcc-guest-guide'); ?></span>
                </li>
                <li class="dccgg-cond-forecast" hidden>
                    <span class="dccgg-cond-ico">📅</span>
                    <span class="dccgg-cond-k"><?php esc_html_e('Tomorrow', 'dcc-guest-guide'); ?></span>
                    <span class="dccgg-cond-v">—</span>
                </li>
                <?php if ($extras) : ?>
                    <li class="dccgg-cond-extra dccgg-cond-lake" hidden>
                        <span class="dccgg-cond-ico">🌊</span>
                        <span class="dccgg-cond-k"><?php esc_html_e('Lake', 'dcc-guest-guide'); ?></span>
                        <span class="dccgg-cond-v">—</span>
                        <span class="dccgg-cond-takeaway"></span>
                    </li>
                    <li class="dccgg-cond-extra dccgg-cond-pressure" hidden>
                        <span class="dccgg-cond-ico">🌡️</span>
                        <span class="dccgg-cond-k"><?php esc_html_e('Pressure', 'dcc-guest-guide'); ?></span>
                        <span class="dccgg-cond-v">—</span>
                        <span class="dccgg-cond-takeaway"></span>
                    </li>
                    <li class="dccgg-cond-extra dccgg-cond-wind" hidden>
                        <span class="dccgg-cond-ico">💨</span>
                        <span class="dccgg-cond-k"><?php esc_html_e('Wind', 'dcc-guest-guide'); ?></span>
                        <span class="dccgg-cond-v">—</span>
                        <span class="dccgg-cond-takeaway"></span>
                    </li>
                    <li class="dccgg-cond-extra dccgg-cond-uv" hidden>
                        <span class="dccgg-cond-ico">☀️</span>
                        <span class="dccgg-cond-k"><?php esc_html_e('UV', 'dcc-guest-guide'); ?></span>
                        <span class="dccgg-cond-v">—</span>
                        <span class="dccgg-cond-takeaway"></span>
                    </li>
                    <li class="dccgg-cond-extra dccgg-cond-heat" hidden>
                        <span class="dccgg-cond-ico">🥵</span>
                        <span class="dccgg-cond-k"><?php esc_html_e('Feels like', 'dcc-guest-guide'); ?></span>
                        <span class="dccgg-cond-v">—</span>
                        <span class="dccgg-cond-takeaway"></span>
                    </li>
                    <?php if (!empty($c['solunar'])) : ?>
                        <li class="dccgg-cond-extra dccgg-cond-solunar">
                            <span class="dccgg-cond-ico">🎣</span>
                            <span class="dccgg-cond-k"><?php esc_html_e('Best fishing', 'dcc-guest-guide'); ?></span>
                            <span class="dccgg-cond-v"><?php echo esc_html($c['solunar']); ?></span>
                            <span class="dccgg-cond-takeaway"><?php esc_html_e('major feeding windows', 'dcc-guest-guide'); ?></span>
                        </li>
                    <?php endif; ?>
                <?php endif; ?>
            </ul>
        </aside>
        <?php
    }

    /**
     * Compute today's sunrise / sunset / moon phase for the cottage. Uses
     * PHP's date_sun_info() (no API). Moon phase is a Conway-style
     * approximation good to ±1 day, which is plenty for "🌒 waxing crescent"
     * display.
     */
    public static function compute_conditions(float $lat, float $lng): array
    {
        $tz   = new \DateTimeZone(wp_timezone_string() ?: 'America/New_York');
        $now  = new \DateTimeImmutable('now', $tz);
        $sun  = date_sun_info($now->getTimestamp(), $lat, $lng);
        $sr   = isset($sun['sunrise']) && is_int($sun['sunrise'])
            ? (new \DateTimeImmutable('@' . $sun['sunrise']))->setTimezone($tz)->format('g:i A') : '';
        $ss   = isset($sun['sunset']) && is_int($sun['sunset'])
            ? (new \DateTimeImmutable('@' . $sun['sunset']))->setTimezone($tz)->format('g:i A') : '';

        // Moon phase: days since known new moon (2000-01-06 18:14 UTC) / 29.5306.
        $synodic = 29.530588853;
        $days    = ($now->getTimestamp() - 947182440) / 86400;
        $phase   = fmod($days, $synodic) / $synodic; // 0..1
        if ($phase < 0) { $phase += 1; }
        $idx = (int) floor($phase * 8 + 0.5) % 8;
        $names = [
            __('New moon', 'dcc-guest-guide'),
            __('Waxing crescent', 'dcc-guest-guide'),
            __('First quarter', 'dcc-guest-guide'),
            __('Waxing gibbous', 'dcc-guest-guide'),
            __('Full moon', 'dcc-guest-guide'),
            __('Waning gibbous', 'dcc-guest-guide'),
            __('Last quarter', 'dcc-guest-guide'),
            __('Waning crescent', 'dcc-guest-guide'),
        ];
        $emojis = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];

        // Solunar major feeding windows. Moon transits the local meridian
        // ~50 min later each solar day; over one synodic period it slips a
        // full 24h relative to the sun. So local upper transit ≈ solar noon
        // shifted by phase × 24.6h. Lower transit (moon underfoot) is half a
        // lunar day later (~12h25m). Each major window is ±45 min centered
        // on the transit. We render the next two majors falling within the
        // upcoming 18 hours so the row stays current through the day.
        $solunar = '';
        if (isset($sun['sunrise'], $sun['sunset']) && is_int($sun['sunrise']) && is_int($sun['sunset'])) {
            $solar_noon_ts = (int) (($sun['sunrise'] + $sun['sunset']) / 2);
            $upper = $solar_noon_ts + (int) round($phase * 29.530588853 * 50 * 60);
            $lunar_day = 24.84 * 3600;
            $candidates = [
                $upper - $lunar_day / 2,
                $upper,
                $upper + $lunar_day / 2,
                $upper + $lunar_day,
            ];
            $now_ts = $now->getTimestamp();
            $horizon = $now_ts + 18 * 3600;
            $picked = [];
            foreach ($candidates as $t) {
                $t = (int) $t;
                if ($t >= $now_ts - 1800 && $t <= $horizon) {
                    $picked[] = $t;
                }
                if (count($picked) >= 2) { break; }
            }
            sort($picked);
            $parts = [];
            foreach ($picked as $t) {
                $start = (new \DateTimeImmutable('@' . ($t - 45 * 60)))->setTimezone($tz)->format('g:i A');
                $end   = (new \DateTimeImmutable('@' . ($t + 45 * 60)))->setTimezone($tz)->format('g:i A');
                $parts[] = $start . '–' . $end;
            }
            if ($parts) {
                $solunar = implode(', ', $parts);
            }
        }

        return [
            'sunrise'      => $sr,
            'sunset'       => $ss,
            'moon_name'    => $names[$idx],
            'moon_emoji'   => $emojis[$idx],
            'illumination' => (int) round((1 - cos($phase * 2 * M_PI)) / 2 * 100),
            'solunar'      => $solunar,
        ];
    }

    /**
     * Parse the hotspot textarea into a per-image lookup table.
     * Input format, one per line:  IMAGE_INDEX X% Y% | Label | Description
     * Lines that don't match are silently skipped.
     */
    public static function parse_hotspots(string $raw): array
    {
        $by_image = [];
        $raw = trim($raw);
        if ($raw === '') { return $by_image; }
        foreach (preg_split('/\r?\n/', $raw) as $line) {
            $line = trim($line);
            if ($line === '') { continue; }
            // IMAGE_IDX X Y | Label | Description
            if (!preg_match('/^(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\|\s*([^|]+?)(?:\s*\|\s*(.+))?$/u', $line, $m)) {
                continue;
            }
            $img = (int) $m[1];
            $by_image[$img] = $by_image[$img] ?? [];
            $by_image[$img][] = [
                'x'     => (float) $m[2],
                'y'     => (float) $m[3],
                'label' => trim($m[4]),
                'desc'  => isset($m[5]) ? trim($m[5]) : '',
            ];
        }
        return $by_image;
    }

    public static function wifi_qr_payload(string $ssid, string $password, string $security, bool $hidden): string
    {
        $escape = static function (string $v): string {
            return preg_replace('/([\\\\;,":])/', '\\\\$1', $v);
        };
        $security = in_array($security, ['WPA', 'WEP', 'nopass'], true) ? $security : 'WPA';
        $parts = ['T:' . $security, 'S:' . $escape($ssid)];
        if ($security !== 'nopass' && $password !== '') {
            $parts[] = 'P:' . $escape($password);
        }
        if ($hidden) {
            $parts[] = 'H:true';
        }
        return 'WIFI:' . implode(';', $parts) . ';;';
    }

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
