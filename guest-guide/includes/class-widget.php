<?php
namespace GuestGuide;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;
use Elementor\Icons_Manager;
use Elementor\Repeater;
use Elementor\Widget_Base;

if (!defined('ABSPATH')) {
    exit;
}

final class Widget extends Widget_Base
{
    /**
     * Style-control selector prefix. The doubled class reaches (0,4,0)
     * specificity so it outranks theme/Elementor-kit input/button resets,
     * mirroring the availability calendar's strategy. Style controls carry no
     * defaults; the baked-in look lives in widget.css (controls override-only).
     */
    private const SEL = '{{WRAPPER}} .gguide-root.gguide-root ';

    public function get_name(): string
    {
        return 'guest_guide';
    }

    public function get_title(): string
    {
        return __('Guest Guide', 'guest-guide');
    }

    public function get_icon(): string
    {
        return 'eicon-info-circle-o';
    }

    public function get_categories(): array
    {
        return ['claude-code'];
    }

    public function get_keywords(): array
    {
        return ['guest', 'guide', 'wifi', 'rules', 'checkout', 'info', 'faq', 'accordion'];
    }

    public function get_script_depends(): array
    {
        return ['gguide-widget'];
    }

    public function get_style_depends(): array
    {
        return ['gguide-widget'];
    }

    public static function register_assets(): void
    {
        wp_register_style(
            'gguide-widget',
            GGUIDE_URL . 'assets/css/widget.css',
            [],
            GGUIDE_VERSION
        );
        wp_register_script(
            'gguide-widget',
            GGUIDE_URL . 'assets/js/widget.js',
            [],
            GGUIDE_VERSION,
            true
        );
    }

    /**
     * Force the widget's CSS/JS into the Elementor editor preview iframe so the
     * interactive UI works while editing.
     */
    public static function enqueue_for_preview(): void
    {
        self::register_assets();
        wp_enqueue_style('gguide-widget');
        wp_enqueue_script('gguide-widget');
    }

    protected function register_controls(): void
    {
        $this->register_content_controls();
        $this->register_sections_controls();
        $this->register_items_controls();
        $this->register_strings_controls();
        $this->register_general_style_controls();
        $this->register_tile_style_controls();
        $this->register_detail_style_controls();
        $this->register_search_style_controls();
        $this->register_button_style_controls();
    }

    /* ---------------------------------------------------------------------
     * CONTENT TAB
     * ------------------------------------------------------------------- */

    private function register_content_controls(): void
    {
        $this->start_controls_section('section_content', [
            'label' => __('Layout', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('heading_show', [
            'label'        => __('Show heading', 'guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->add_control('heading_text', [
            'label'     => __('Heading', 'guest-guide'),
            'type'      => Controls_Manager::TEXT,
            'default'   => __('Guest Guide', 'guest-guide'),
            'condition' => ['heading_show' => 'yes'],
        ]);

        $this->add_responsive_control('columns', [
            'label'              => __('Tile columns', 'guest-guide'),
            'type'               => Controls_Manager::NUMBER,
            'min'                => 1,
            'max'                => 4,
            'default'            => 3,
            'tablet_default'     => 2,
            'mobile_default'     => 1,
            'selectors'          => [self::SEL => '--gguide-cols: {{VALUE}};'],
        ]);

        $this->add_control('transition', [
            'label'   => __('Transition', 'guest-guide'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'slide',
            'options' => [
                'slide' => __('Slide', 'guest-guide'),
                'flip'  => __('Flip', 'guest-guide'),
                'fade'  => __('Fade', 'guest-guide'),
            ],
            'description' => __('Animation used when opening a section and returning to the menu.', 'guest-guide'),
        ]);

        $this->add_control('enable_search', [
            'label'        => __('Show search box', 'guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->end_controls_section();
    }

    private function register_sections_controls(): void
    {
        $this->start_controls_section('section_sections', [
            'label' => __('Sections (menu)', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('sections_intro', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Each section becomes a tile on the menu. Give it a short Key (e.g. "wifi"), then add items below and set each item\'s Section field to the same key. Sections render in the order listed here — drag to reorder.', 'guest-guide'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $repeater = new Repeater();
        $repeater->add_control('section_key', [
            'label'       => __('Key', 'guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'placeholder' => 'wifi',
            'description' => __('Short identifier used to attach items to this section.', 'guest-guide'),
        ]);
        $repeater->add_control('section_title', [
            'label'       => __('Title', 'guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => __('New section', 'guest-guide'),
            'label_block' => true,
        ]);
        $repeater->add_control('section_icon', [
            'label' => __('Icon', 'guest-guide'),
            'type'  => Controls_Manager::ICONS,
        ]);
        $repeater->add_control('section_desc', [
            'label'   => __('Subtitle', 'guest-guide'),
            'type'    => Controls_Manager::TEXTAREA,
            'rows'    => 2,
            'default' => '',
        ]);

        $this->add_control('guide_sections', [
            'label'       => __('Sections', 'guest-guide'),
            'type'        => Controls_Manager::REPEATER,
            'fields'      => $repeater->get_controls(),
            'title_field' => '{{{ section_title }}}',
            'default'     => [
                [
                    'section_key'   => 'wifi',
                    'section_title' => __('WiFi & Internet', 'guest-guide'),
                ],
                [
                    'section_key'   => 'rules',
                    'section_title' => __('House Rules', 'guest-guide'),
                ],
                [
                    'section_key'   => 'checkout',
                    'section_title' => __('Checkout', 'guest-guide'),
                ],
            ],
        ]);

        $this->end_controls_section();
    }

    private function register_items_controls(): void
    {
        $this->start_controls_section('section_items', [
            'label' => __('Items (content)', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('items_intro', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Add a row per piece of information. Set "Section" to the Key of the section it belongs under. Enable "Copy button" for things guests tap to copy (e.g. the WiFi password).', 'guest-guide'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $repeater = new Repeater();
        $repeater->add_control('item_section', [
            'label'       => __('Section', 'guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'placeholder' => 'wifi',
            'description' => __('Must match a section Key above.', 'guest-guide'),
        ]);
        $repeater->add_control('item_icon', [
            'label' => __('Icon', 'guest-guide'),
            'type'  => Controls_Manager::ICONS,
        ]);
        $repeater->add_control('item_title', [
            'label'       => __('Title', 'guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'default'     => __('New item', 'guest-guide'),
            'label_block' => true,
        ]);
        $repeater->add_control('item_content', [
            'label'   => __('Content', 'guest-guide'),
            'type'    => Controls_Manager::WYSIWYG,
            'default' => '',
        ]);
        $repeater->add_control('item_copy', [
            'label'        => __('Copy button', 'guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => '',
            'return_value' => 'yes',
        ]);
        $repeater->add_control('item_copy_value', [
            'label'       => __('Value to copy', 'guest-guide'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'condition'   => ['item_copy' => 'yes'],
            'description' => __('Exact text copied to the clipboard, e.g. the WiFi password.', 'guest-guide'),
        ]);

        $this->add_control('guide_items', [
            'label'       => __('Items', 'guest-guide'),
            'type'        => Controls_Manager::REPEATER,
            'fields'      => $repeater->get_controls(),
            'title_field' => '{{{ item_title }}}',
            'default'     => [
                [
                    'item_section'    => 'wifi',
                    'item_title'      => __('Network name', 'guest-guide'),
                    'item_content'    => __('DoraCanalCourt-Guest', 'guest-guide'),
                ],
                [
                    'item_section'    => 'wifi',
                    'item_title'      => __('Password', 'guest-guide'),
                    'item_content'    => __('Tap copy and paste it into your device.', 'guest-guide'),
                    'item_copy'       => 'yes',
                    'item_copy_value' => 'welcome2florida',
                ],
                [
                    'item_section' => 'checkout',
                    'item_title'   => __('Checkout time', 'guest-guide'),
                    'item_content' => __('Please check out by 11:00 AM.', 'guest-guide'),
                ],
            ],
        ]);

        $this->end_controls_section();
    }

    private function register_strings_controls(): void
    {
        $this->start_controls_section('section_strings', [
            'label' => __('Labels & strings', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('str_back', [
            'label'   => __('Back button', 'guest-guide'),
            'type'    => Controls_Manager::TEXT,
            'default' => __('Back', 'guest-guide'),
        ]);
        $this->add_control('str_search', [
            'label'   => __('Search placeholder', 'guest-guide'),
            'type'    => Controls_Manager::TEXT,
            'default' => __('Search the guide…', 'guest-guide'),
        ]);
        $this->add_control('str_copy', [
            'label'   => __('Copy button', 'guest-guide'),
            'type'    => Controls_Manager::TEXT,
            'default' => __('Copy', 'guest-guide'),
        ]);
        $this->add_control('str_copied', [
            'label'   => __('Copied confirmation', 'guest-guide'),
            'type'    => Controls_Manager::TEXT,
            'default' => __('Copied!', 'guest-guide'),
        ]);
        $this->add_control('str_empty', [
            'label'   => __('No results message', 'guest-guide'),
            'type'    => Controls_Manager::TEXT,
            'default' => __('No matches found.', 'guest-guide'),
        ]);

        $this->end_controls_section();
    }

    /* ---------------------------------------------------------------------
     * STYLE TAB
     * ------------------------------------------------------------------- */

    private function register_general_style_controls(): void
    {
        $this->start_controls_section('section_style_general', [
            'label' => __('General', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('inherit_theme', [
            'label'        => __('Inherit theme fonts', 'guest-guide'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => '',
            'return_value' => 'yes',
            'description'  => __('Let the active theme control typography instead of the baked-in look.', 'guest-guide'),
        ]);

        $this->add_responsive_control('root_gap', [
            'label'      => __('Tile gap', 'guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', 'em', 'rem'],
            'range'      => ['px' => ['min' => 0, 'max' => 60]],
            'selectors'  => [self::SEL => '--gguide-gap: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_responsive_control('root_radius', [
            'label'      => __('Corner radius', 'guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', 'em', 'rem'],
            'range'      => ['px' => ['min' => 0, 'max' => 40]],
            'selectors'  => [self::SEL => '--gguide-radius: {{SIZE}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_tile_style_controls(): void
    {
        $this->start_controls_section('section_style_tile', [
            'label' => __('Tiles', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            [
                'name'     => 'tile_title_typography',
                'selector' => self::SEL . '.gguide-tile-title',
            ]
        );

        $this->add_responsive_control('tile_icon_size', [
            'label'      => __('Icon size', 'guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', 'em', 'rem'],
            'range'      => ['px' => ['min' => 12, 'max' => 96]],
            'selectors'  => [self::SEL => '--gguide-tile-icon-size: {{SIZE}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('tile_color_tabs');

        $this->start_controls_tab('tile_tab_normal', [
            'label' => __('Normal', 'guest-guide'),
        ]);
        $this->add_control('tile_bg', [
            'label'     => __('Background', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-tile-bg: {{VALUE}};'],
        ]);
        $this->add_control('tile_text', [
            'label'     => __('Title color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-tile-text: {{VALUE}};'],
        ]);
        $this->add_control('tile_icon_color', [
            'label'     => __('Icon color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-tile-icon: {{VALUE}};'],
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('tile_tab_hover', [
            'label' => __('Hover', 'guest-guide'),
        ]);
        $this->add_control('tile_bg_hover', [
            'label'     => __('Background', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-tile-bg-hover: {{VALUE}};'],
        ]);
        $this->add_control('tile_text_hover', [
            'label'     => __('Title color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-tile-text-hover: {{VALUE}};'],
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    private function register_detail_style_controls(): void
    {
        $this->start_controls_section('section_style_detail', [
            'label' => __('Detail panel', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('detail_bg', [
            'label'     => __('Background', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-detail-bg: {{VALUE}};'],
        ]);
        $this->add_control('detail_header_color', [
            'label'     => __('Section header color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-detail-header: {{VALUE}};'],
        ]);
        $this->add_control('detail_divider', [
            'label'     => __('Divider color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-detail-divider: {{VALUE}};'],
        ]);

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            [
                'name'     => 'item_title_typography',
                'label'    => __('Item title', 'guest-guide'),
                'selector' => self::SEL . '.gguide-item-title',
            ]
        );
        $this->add_control('item_title_color', [
            'label'     => __('Item title color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-item-title: {{VALUE}};'],
        ]);

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            [
                'name'     => 'item_body_typography',
                'label'    => __('Item text', 'guest-guide'),
                'selector' => self::SEL . '.gguide-item-body',
            ]
        );
        $this->add_control('item_body_color', [
            'label'     => __('Item text color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-item-body: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_search_style_controls(): void
    {
        $this->start_controls_section('section_style_search', [
            'label'     => __('Search', 'guest-guide'),
            'tab'       => Controls_Manager::TAB_STYLE,
            'condition' => ['enable_search' => 'yes'],
        ]);

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            [
                'name'     => 'search_typography',
                'selector' => self::SEL . '.gguide-search-input',
            ]
        );
        $this->add_control('search_text_color', [
            'label'     => __('Text color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-search-text: {{VALUE}};'],
        ]);
        $this->add_control('search_bg_color', [
            'label'     => __('Background', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-search-bg: {{VALUE}};'],
        ]);
        $this->add_control('search_border_color', [
            'label'     => __('Border color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-search-border: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_button_style_controls(): void
    {
        $this->start_controls_section('section_style_button', [
            'label' => __('Buttons', 'guest-guide'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            [
                'name'     => 'button_typography',
                'selector' => self::SEL . '.gguide-btn',
            ]
        );

        $this->add_responsive_control('button_radius', [
            'label'      => __('Radius', 'guest-guide'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', 'em', 'rem'],
            'range'      => ['px' => ['min' => 0, 'max' => 40]],
            'selectors'  => [self::SEL => '--gguide-btn-radius: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_control('button_text_color', [
            'label'     => __('Text color', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-btn-text: {{VALUE}};'],
        ]);
        $this->add_control('button_bg_color', [
            'label'     => __('Background', 'guest-guide'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--gguide-btn-bg: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    /* ---------------------------------------------------------------------
     * RENDER
     * ------------------------------------------------------------------- */

    protected function render(): void
    {
        if (!Plugin::instance()->dependencies_present()) {
            return;
        }

        $settings = $this->get_settings_for_display();

        // Build ordered sections and group items beneath them by key.
        $sections = [];
        foreach ((array) ($settings['guide_sections'] ?? []) as $row) {
            $key   = trim((string) ($row['section_key'] ?? ''));
            $title = trim((string) ($row['section_title'] ?? ''));
            if ($key === '' && $title === '') {
                continue;
            }
            // Fall back to a derived key when none was typed so the tile still
            // works (and so items can reference it if the author matches it).
            if ($key === '') {
                $key = sanitize_title($title);
            }
            // Keep the first section for a given key; skip duplicates so one
            // mistyped key can't silently erase another section.
            if (isset($sections[$key])) {
                continue;
            }
            $desc = trim((string) ($row['section_desc'] ?? ''));
            $sections[$key] = [
                'key'    => $key,
                'title'  => $title !== '' ? $title : $key,
                'icon'   => $row['section_icon'] ?? [],
                'desc'   => $desc,
                'items'  => [],
                'search' => trim($title . ' ' . $desc),
            ];
        }

        foreach ((array) ($settings['guide_items'] ?? []) as $row) {
            $skey = trim((string) ($row['item_section'] ?? ''));
            if ($skey === '' || !isset($sections[$skey])) {
                continue; // orphan item — no matching section
            }
            // Precompute the item's searchable plain text (title + body text +
            // copy value) and attach it so both the item and its parent tile
            // can carry a data-search attribute the JS filters on.
            $item_search = trim(
                (string) ($row['item_title'] ?? '') . ' ' .
                wp_strip_all_tags((string) ($row['item_content'] ?? '')) . ' ' .
                (string) ($row['item_copy_value'] ?? '')
            );
            $row['_search'] = $item_search;
            $sections[$skey]['items'][] = $row;
            $sections[$skey]['search']  = trim($sections[$skey]['search'] . ' ' . $item_search);
        }

        if (empty($sections)) {
            return;
        }

        // Make sure Elementor's icon fonts are present on the page — rendering
        // an icon via Icons_Manager doesn't always trigger their enqueue.
        self::enqueue_icon_assets();

        $enable_search = ($settings['enable_search'] ?? 'yes') === 'yes';
        $transition    = (string) ($settings['transition'] ?? 'slide');
        if (!in_array($transition, ['slide', 'flip', 'fade'], true)) {
            $transition = 'slide';
        }

        $config = [
            'transition'   => $transition,
            'enableSearch' => $enable_search,
            'strings'      => [
                'copy'   => (string) ($settings['str_copy'] ?? ''),
                'copied' => (string) ($settings['str_copied'] ?? ''),
            ],
        ];

        $root_classes = ['gguide-root', 'gguide-transition-' . $transition];
        if (($settings['inherit_theme'] ?? '') === 'yes') {
            $root_classes[] = 'gguide-inherit-theme';
        }

        ?>
        <div class="<?php echo esc_attr(implode(' ', $root_classes)); ?>"
             data-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">

            <?php // Graceful fallback when JavaScript is unavailable: reveal every
                  // section's content stacked, and hide the JS-only chrome. ?>
            <noscript><style>.gguide-stage{position:static!important;opacity:1!important;transform:none!important;pointer-events:auto!important}.gguide-detail{display:block!important}.gguide-menu,.gguide-search,.gguide-empty,.gguide-back,.gguide-copy{display:none!important}</style></noscript>

            <?php if (($settings['heading_show'] ?? 'yes') === 'yes' && ($settings['heading_text'] ?? '') !== '') : ?>
                <h2 class="gguide-heading"><?php echo esc_html((string) $settings['heading_text']); ?></h2>
            <?php endif; ?>

            <?php if ($enable_search) : ?>
                <div class="gguide-search" role="search">
                    <input type="search" class="gguide-search-input"
                           placeholder="<?php echo esc_attr((string) ($settings['str_search'] ?? '')); ?>"
                           aria-label="<?php echo esc_attr((string) ($settings['str_search'] ?? '')); ?>"
                           autocomplete="off">
                </div>
            <?php endif; ?>

            <div class="gguide-stagewrap">
                <div class="gguide-menu" aria-label="<?php echo esc_attr(($settings['heading_text'] ?? '') !== '' ? (string) $settings['heading_text'] : __('Guest guide sections', 'guest-guide')); ?>">
                    <?php foreach ($sections as $section) : ?>
                        <button type="button" class="gguide-tile"
                                data-key="<?php echo esc_attr($section['key']); ?>"
                                data-search="<?php echo esc_attr($section['search']); ?>">
                            <span class="gguide-tile-icon" aria-hidden="true"><?php
                                self::render_icon_safe($section['icon']);
                            ?></span>
                            <span class="gguide-tile-title"><?php echo esc_html($section['title']); ?></span>
                            <?php if ($section['desc'] !== '') : ?>
                                <span class="gguide-tile-desc"><?php echo esc_html($section['desc']); ?></span>
                            <?php endif; ?>
                        </button>
                    <?php endforeach; ?>
                </div>

                <div class="gguide-empty" hidden>
                    <p><?php echo esc_html((string) ($settings['str_empty'] ?? '')); ?></p>
                </div>

                <div class="gguide-stage">
                    <?php foreach ($sections as $section) : ?>
                        <section class="gguide-detail" data-key="<?php echo esc_attr($section['key']); ?>"
                                 aria-label="<?php echo esc_attr($section['title']); ?>" hidden>
                            <div class="gguide-detail-head">
                                <button type="button" class="gguide-btn gguide-back">
                                    <span class="gguide-back-arrow" aria-hidden="true">&larr;</span>
                                    <?php echo esc_html((string) ($settings['str_back'] ?? '')); ?>
                                </button>
                                <h3 class="gguide-detail-title">
                                    <span class="gguide-detail-icon" aria-hidden="true"><?php
                                        self::render_icon_safe($section['icon']);
                                    ?></span>
                                    <?php echo esc_html($section['title']); ?>
                                </h3>
                            </div>

                            <div class="gguide-items">
                                <?php foreach ($section['items'] as $item) : ?>
                                    <?php
                                    $title   = trim((string) ($item['item_title'] ?? ''));
                                    $content = (string) ($item['item_content'] ?? '');
                                    $do_copy = ($item['item_copy'] ?? '') === 'yes';
                                    $copy_v  = trim((string) ($item['item_copy_value'] ?? ''));
                                    ?>
                                    <article class="gguide-item" data-search="<?php echo esc_attr((string) ($item['_search'] ?? '')); ?>">
                                        <div class="gguide-item-head">
                                            <span class="gguide-item-icon" aria-hidden="true"><?php
                                                self::render_icon_safe($item['item_icon'] ?? []);
                                            ?></span>
                                            <?php if ($title !== '') : ?>
                                                <h4 class="gguide-item-title"><?php echo esc_html($title); ?></h4>
                                            <?php endif; ?>
                                        </div>
                                        <?php if (trim(wp_strip_all_tags($content)) !== '') : ?>
                                            <div class="gguide-item-body"><?php
                                                echo wpautop(wp_kses_post($content)); // phpcs:ignore WordPress.Security.EscapeOutput
                                            ?></div>
                                        <?php endif; ?>
                                        <?php if ($do_copy && $copy_v !== '') : ?>
                                            <div class="gguide-copy-row">
                                                <code class="gguide-copy-value"><?php echo esc_html($copy_v); ?></code>
                                                <button type="button" class="gguide-btn gguide-copy"
                                                        data-copy="<?php echo esc_attr($copy_v); ?>"
                                                        aria-label="<?php echo esc_attr(sprintf(/* translators: %s: the value that will be copied */ __('Copy %s', 'guest-guide'), $copy_v)); ?>">
                                                    <?php echo esc_html((string) ($settings['str_copy'] ?? '')); ?>
                                                </button>
                                            </div>
                                        <?php endif; ?>
                                    </article>
                                <?php endforeach; ?>
                            </div>
                        </section>
                    <?php endforeach; ?>
                </div>
            </div>

            <span class="gguide-sr-only" role="status" aria-live="polite"></span>
        </div>
        <?php
    }

    /**
     * Render an Elementor ICONS control value, tolerating empty/legacy values.
     */
    private static function render_icon_safe($icon): void
    {
        if (empty($icon) || empty($icon['value'])) {
            return;
        }
        Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']);
    }

    /**
     * Enqueue Elementor's registered icon-font stylesheets so Font Awesome /
     * eicons glyphs render on the front end. Guarded by wp_style_is() so an
     * unknown handle (e.g. a future Elementor rename) is simply skipped.
     */
    private static function enqueue_icon_assets(): void
    {
        $handles = [
            'elementor-icons',
            'elementor-icons-fa-solid',
            'elementor-icons-fa-regular',
            'elementor-icons-fa-brands',
        ];
        foreach ($handles as $handle) {
            if (wp_style_is($handle, 'registered')) {
                wp_enqueue_style($handle);
            }
        }
    }
}
