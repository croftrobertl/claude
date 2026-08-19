<?php
namespace DCC_Contact;

use Elementor\Controls_Manager;
use Elementor\Repeater;
use Elementor\Widget_Base;
use Elementor\Group_Control_Typography;
use Elementor\Group_Control_Border;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Native Elementor (free) contact-form widget. Self-contained: renders the
 * form, persists its trusted config server-side (Form_Config) for the AJAX
 * endpoint, and conditionally enqueues its own tiny CSS/JS (+ reCAPTCHA api.js
 * only when the captcha is enabled and keys are set).
 */
final class Widget extends Widget_Base
{
    public function get_name(): string
    {
        return 'dcc_contact_form';
    }

    public function get_title(): string
    {
        return __('DCC Contact Form', 'dcc-contact-form');
    }

    public function get_icon(): string
    {
        return 'eicon-form-horizontal';
    }

    public function get_categories(): array
    {
        return ['dcc-widgets'];
    }

    public function get_keywords(): array
    {
        return ['contact', 'form', 'email', 'message', 'dcc'];
    }

    public function get_style_depends(): array
    {
        return ['dcc-contact-form'];
    }

    public function get_script_depends(): array
    {
        // IMPORTANT: this runs generically in the Elementor editor preview
        // (enqueue_widgets_scripts) with NO placed-instance data, so
        // get_settings_for_display() would receive null settings and fatal.
        // Gate the reCAPTCHA dependency on the site-wide config only — it is
        // harmless to register api.js whenever keys are present (the badge is
        // hidden either way, and only forms with the toggle on actually call
        // grecaptcha). The per-instance toggle still governs whether a token is
        // required at submit time (enforced server-side in Form_Handler).
        $deps = ['dcc-contact-form'];
        if (Settings::recaptcha_configured()) {
            $deps[] = 'dcc-recaptcha-api';
        }
        return $deps;
    }

    /* ------------------------------------------------------------------ */
    /* Assets                                                              */
    /* ------------------------------------------------------------------ */

    public static function register_assets(): void
    {
        wp_register_style(
            'dcc-contact-form',
            DCC_CONTACT_URL . 'assets/css/widget.css',
            [],
            DCC_CONTACT_VERSION
        );

        wp_register_script(
            'dcc-contact-form',
            DCC_CONTACT_URL . 'assets/js/widget.js',
            [],
            DCC_CONTACT_VERSION,
            true
        );

        // Client-side validation messages, translatable like the server-side
        // ones (widget.js falls back to English if this object is absent).
        wp_localize_script('dcc-contact-form', 'dccContactI18n', [
            'required' => __('This field is required.', 'dcc-contact-form'),
            'email'    => __('Please enter a valid email address.', 'dcc-contact-form'),
            'phone'    => __('Please enter a valid phone number.', 'dcc-contact-form'),
            'number'   => __('Please enter a valid number.', 'dcc-contact-form'),
            'generic'  => __('Something went wrong. Please try again.', 'dcc-contact-form'),
        ]);

        if (Settings::recaptcha_configured()) {
            wp_register_script(
                'dcc-recaptcha-api',
                'https://www.google.com/recaptcha/api.js?render=' . rawurlencode(Settings::recaptcha_site_key()),
                [],
                null,
                true
            );
        }
    }

    /** Force assets into the Elementor editor preview iframe. */
    public static function enqueue_for_preview(): void
    {
        self::register_assets();
        wp_enqueue_style('dcc-contact-form');
        wp_enqueue_script('dcc-contact-form');
    }

    public static function keep_script_unoptimized(string $tag, string $handle): string
    {
        if ($handle !== 'dcc-contact-form') {
            return $tag;
        }
        return str_replace(
            '<script ',
            '<script data-no-optimize="1" data-no-minify="1" data-no-defer="1" data-no-combine="1" data-cfasync="false" ',
            $tag
        );
    }

    public static function keep_style_unoptimized(string $tag, string $handle): string
    {
        if ($handle !== 'dcc-contact-form') {
            return $tag;
        }
        return str_replace('<link ', '<link data-no-optimize="1" data-no-minify="1" ', $tag);
    }

    /* ------------------------------------------------------------------ */
    /* Controls                                                            */
    /* ------------------------------------------------------------------ */

    protected function register_controls(): void
    {
        $this->register_fields_controls();
        $this->register_form_controls();
        $this->register_email_controls();
        $this->register_spam_controls();
        $this->register_style_controls();
    }

    private function register_fields_controls(): void
    {
        $this->start_controls_section('section_fields', [
            'label' => __('Form Fields', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $repeater = new Repeater();

        $repeater->add_control('field_label', [
            'label'       => __('Label', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => __('Field', 'dcc-contact-form'),
            'label_block' => true,
        ]);

        $repeater->add_control('field_type', [
            'label'   => __('Type', 'dcc-contact-form'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'text',
            'options' => [
                'text'     => __('Text', 'dcc-contact-form'),
                'name'     => __('Name (First + Last)', 'dcc-contact-form'),
                'email'    => __('Email', 'dcc-contact-form'),
                'tel'      => __('Phone', 'dcc-contact-form'),
                'textarea' => __('Textarea', 'dcc-contact-form'),
                'select'   => __('Select', 'dcc-contact-form'),
                'checkbox' => __('Checkbox', 'dcc-contact-form'),
                'number'   => __('Number', 'dcc-contact-form'),
            ],
        ]);

        $repeater->add_control('field_required', [
            'label'        => __('Required', 'dcc-contact-form'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'label_on'     => __('Yes', 'dcc-contact-form'),
            'label_off'    => __('No', 'dcc-contact-form'),
            'return_value' => 'yes',
        ]);

        $repeater->add_control('field_placeholder', [
            'label'       => __('Placeholder', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '',
            'label_block' => true,
            'condition'   => ['field_type!' => ['checkbox', 'name']],
        ]);

        $repeater->add_control('field_options', [
            'label'       => __('Options (one per line)', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXTAREA,
            'default'     => '',
            'description' => __('For Select fields only.', 'dcc-contact-form'),
            'condition'   => ['field_type' => 'select'],
        ]);

        $repeater->add_control('field_width', [
            'label'   => __('Column Width', 'dcc-contact-form'),
            'type'    => Controls_Manager::SELECT,
            'default' => '100',
            'options' => [
                '100' => __('100%', 'dcc-contact-form'),
                '50'  => __('50%', 'dcc-contact-form'),
            ],
        ]);

        $repeater->add_control('field_css', [
            'label'       => __('CSS Classes', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '',
            'label_block' => true,
        ]);

        $this->add_control('fields', [
            'type'        => Controls_Manager::REPEATER,
            'fields'      => $repeater->get_controls(),
            'title_field' => '{{{ field_label }}}',
            'default'     => [
                [
                    'field_label'    => __('Name', 'dcc-contact-form'),
                    'field_type'     => 'name',
                    'field_required' => 'yes',
                    'field_width'    => '100',
                ],
                [
                    'field_label'    => __('Email Address', 'dcc-contact-form'),
                    'field_type'     => 'email',
                    'field_required' => 'yes',
                    'field_width'    => '50',
                ],
                [
                    'field_label'    => __('Phone Number', 'dcc-contact-form'),
                    'field_type'     => 'tel',
                    'field_required' => 'yes',
                    'field_width'    => '50',
                ],
                [
                    'field_label'    => __('Enter your message below', 'dcc-contact-form'),
                    'field_type'     => 'textarea',
                    'field_required' => 'yes',
                    'field_width'    => '100',
                ],
            ],
        ]);

        $this->end_controls_section();
    }

    private function register_form_controls(): void
    {
        $this->start_controls_section('section_form', [
            'label' => __('Submit & Confirmation', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('submit_text', [
            'label'   => __('Button Text', 'dcc-contact-form'),
            'type'    => Controls_Manager::TEXT,
            'default' => __('Send Message', 'dcc-contact-form'),
        ]);

        $this->add_control('submit_processing', [
            'label'   => __('Processing Text', 'dcc-contact-form'),
            'type'    => Controls_Manager::TEXT,
            'default' => __('Sending...', 'dcc-contact-form'),
        ]);

        $this->add_control('confirmation', [
            'label'   => __('Confirmation Message', 'dcc-contact-form'),
            'type'    => Controls_Manager::TEXTAREA,
            'default' => __('Thank you. We will contact you shortly.', 'dcc-contact-form'),
        ]);

        $this->end_controls_section();
    }

    private function register_email_controls(): void
    {
        $this->start_controls_section('section_email', [
            'label' => __('Email Notification', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('email_to', [
            'label'       => __('Send To', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => 'contact@doracanalcourt.com',
            'label_block' => true,
        ]);

        $this->add_control('email_subject', [
            'label'       => __('Subject', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => __('Contact Request: {Name}', 'dcc-contact-form'),
            'description' => __('Use {Field Label} to insert a value, e.g. {Name}.', 'dcc-contact-form'),
            'label_block' => true,
        ]);

        $this->add_control('email_from', [
            'label'       => __('From Address', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => 'contact@doracanalcourt.com',
            'description' => __('Use a site-domain address for best deliverability (SPF/DMARC).', 'dcc-contact-form'),
            'label_block' => true,
        ]);

        $this->add_control('email_from_name', [
            'label'       => __('From Name', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => get_bloginfo('name'),
            'label_block' => true,
        ]);

        $this->add_control('email_reply_to', [
            'label'       => __('Reply-To', 'dcc-contact-form'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '{email}',
            'description' => __('Defaults to the submitter\'s email so replies reach them. {email} = the Email field value.', 'dcc-contact-form'),
            'label_block' => true,
        ]);

        $this->end_controls_section();
    }

    private function register_spam_controls(): void
    {
        $this->start_controls_section('section_spam', [
            'label' => __('Spam Protection', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('spam_notice', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => __('reCAPTCHA keys, threshold, minimum submit time and the prohibited-words list are configured site-wide under <strong>DCC Contact Form &rarr; Settings</strong>.', 'dcc-contact-form'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->add_control('spam_honeypot', [
            'label'        => __('Honeypot', 'dcc-contact-form'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->add_control('spam_time_trap', [
            'label'        => __('Time Trap', 'dcc-contact-form'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->add_control('spam_keyword_filter', [
            'label'        => __('Keyword Filter', 'dcc-contact-form'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->add_control('spam_recaptcha', [
            'label'        => __('reCAPTCHA v3', 'dcc-contact-form'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->end_controls_section();
    }

    /* ------------------------------------------------------------------ */
    /* Style controls                                                      */
    /* ------------------------------------------------------------------ */

    private function register_style_controls(): void
    {
        // ---- Labels ----
        $this->start_controls_section('style_labels', [
            'label' => __('Labels', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);
        $this->add_control('label_color', [
            'label'     => __('Color', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#000000',
            'selectors' => ['{{WRAPPER}} .dcc-label' => 'color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'label_typography',
            'selector' => '{{WRAPPER}} .dcc-label',
        ]);
        $this->add_responsive_control('label_spacing', [
            'label'      => __('Spacing Below', 'dcc-contact-form'),
            'type'       => Controls_Manager::SLIDER,
            'range'      => ['px' => ['min' => 0, 'max' => 60]],
            'selectors'  => ['{{WRAPPER}} .dcc-label' => 'margin-bottom: {{SIZE}}{{UNIT}};'],
        ]);
        $this->add_control('required_color', [
            'label'     => __('Required Asterisk Color', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-req' => 'color: {{VALUE}};'],
        ]);
        $this->end_controls_section();

        // ---- Inputs ----
        $this->start_controls_section('style_inputs', [
            'label' => __('Inputs', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);
        $this->add_control('input_color', [
            'label'     => __('Text Color', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-input' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('input_bg', [
            'label'     => __('Background', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-input' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'input_typography',
            'selector' => '{{WRAPPER}} .dcc-input',
        ]);
        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'input_border',
            'selector' => '{{WRAPPER}} .dcc-input',
        ]);
        $this->add_control('input_radius', [
            'label'      => __('Border Radius', 'dcc-contact-form'),
            'type'       => Controls_Manager::SLIDER,
            'range'      => ['px' => ['min' => 0, 'max' => 60]],
            'selectors'  => ['{{WRAPPER}} .dcc-input' => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);
        $this->end_controls_section();

        // ---- Textarea ----
        $this->start_controls_section('style_textarea', [
            'label' => __('Textarea', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);
        $this->add_control('textarea_bg', [
            'label'     => __('Background', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-textarea' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'textarea_border',
            'selector' => '{{WRAPPER}} .dcc-textarea',
        ]);
        $this->add_control('textarea_radius', [
            'label'      => __('Border Radius', 'dcc-contact-form'),
            'type'       => Controls_Manager::SLIDER,
            'range'      => ['px' => ['min' => 0, 'max' => 60]],
            'selectors'  => ['{{WRAPPER}} .dcc-textarea' => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);
        $this->add_responsive_control('textarea_height', [
            'label'      => __('Min Height', 'dcc-contact-form'),
            'type'       => Controls_Manager::SLIDER,
            'range'      => ['px' => ['min' => 60, 'max' => 400]],
            'selectors'  => ['{{WRAPPER}} .dcc-textarea' => 'min-height: {{SIZE}}{{UNIT}};'],
        ]);
        $this->end_controls_section();

        // ---- Layout ----
        $this->start_controls_section('style_layout', [
            'label' => __('Layout', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);
        $this->add_responsive_control('row_gap', [
            'label'      => __('Field Gap', 'dcc-contact-form'),
            'type'       => Controls_Manager::SLIDER,
            'range'      => ['px' => ['min' => 0, 'max' => 60]],
            'selectors'  => ['{{WRAPPER}} .dcc-fields' => 'gap: {{SIZE}}{{UNIT}};'],
        ]);
        $this->add_responsive_control('form_max_width', [
            'label'       => __('Form Max Width', 'dcc-contact-form'),
            'type'        => Controls_Manager::SLIDER,
            'size_units'  => ['px', '%'],
            'range'       => [
                'px' => ['min' => 260, 'max' => 1200],
                '%'  => ['min' => 20, 'max' => 100],
            ],
            'default'     => ['size' => 600, 'unit' => 'px'],
            'description' => __('The form shrinks to this width and centres, like the old form. Set to 100% for full width.', 'dcc-contact-form'),
            'selectors'   => [
                '{{WRAPPER}} .dcc-contact-wrap' => 'max-width: {{SIZE}}{{UNIT}}; margin-left: auto; margin-right: auto;',
            ],
        ]);
        $this->end_controls_section();

        // ---- Button ----
        $this->start_controls_section('style_button', [
            'label' => __('Submit Button', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'button_typography',
            'selector' => '{{WRAPPER}} .dcc-submit',
        ]);
        $this->start_controls_tabs('button_tabs');
        $this->start_controls_tab('button_tab_normal', ['label' => __('Normal', 'dcc-contact-form')]);
        $this->add_control('button_text_color', [
            'label'     => __('Text Color', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-submit' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('button_bg', [
            'label'     => __('Background', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#006bcf',
            'selectors' => ['{{WRAPPER}} .dcc-submit' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('button_tab_hover', ['label' => __('Hover', 'dcc-contact-form')]);
        $this->add_control('button_text_color_hover', [
            'label'     => __('Text Color', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-submit:hover, {{WRAPPER}} .dcc-submit:focus' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('button_bg_hover', [
            'label'     => __('Background', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-submit:hover, {{WRAPPER}} .dcc-submit:focus' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();
        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'button_border',
            'selector' => '{{WRAPPER}} .dcc-submit',
        ]);
        $this->add_control('button_radius', [
            'label'      => __('Border Radius', 'dcc-contact-form'),
            'type'       => Controls_Manager::SLIDER,
            'range'      => ['px' => ['min' => 0, 'max' => 60]],
            'selectors'  => ['{{WRAPPER}} .dcc-submit' => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);
        $this->add_responsive_control('button_padding', [
            'label'      => __('Padding', 'dcc-contact-form'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => ['{{WRAPPER}} .dcc-submit' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->end_controls_section();

        // ---- Error text ----
        $this->start_controls_section('style_error', [
            'label' => __('Error Text', 'dcc-contact-form'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);
        $this->add_control('error_color', [
            'label'     => __('Color', 'dcc-contact-form'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => ['{{WRAPPER}} .dcc-error, {{WRAPPER}} .dcc-form-error' => 'color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'error_typography',
            'selector' => '{{WRAPPER}} .dcc-error, {{WRAPPER}} .dcc-form-error',
        ]);
        $this->end_controls_section();
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Normalize the Elementor repeater rows into the field shape the form and
     * the server-side handler both use.
     */
    private function normalize_fields(array $rows): array
    {
        $fields = [];
        foreach ($rows as $index => $row) {
            $id = isset($row['_id']) && $row['_id'] !== '' ? (string) $row['_id'] : 'f' . $index;
            $type = isset($row['field_type']) ? (string) $row['field_type'] : 'text';

            $options = [];
            if ($type === 'select' && !empty($row['field_options'])) {
                $lines = preg_split('/\r\n|\r|\n/', (string) $row['field_options']) ?: [];
                foreach ($lines as $line) {
                    $line = trim($line);
                    if ($line !== '') {
                        $options[] = $line;
                    }
                }
            }

            $fields[] = [
                'id'          => $id,
                'type'        => $type,
                'label'       => isset($row['field_label']) ? (string) $row['field_label'] : '',
                'required'    => (($row['field_required'] ?? '') === 'yes'),
                'placeholder' => isset($row['field_placeholder']) ? (string) $row['field_placeholder'] : '',
                'options'     => $options,
                'width'       => (($row['field_width'] ?? '100') === '50') ? '50' : '100',
                'css'         => isset($row['field_css']) ? (string) $row['field_css'] : '',
            ];
        }
        return $fields;
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();
        $fields   = $this->normalize_fields($settings['fields'] ?? []);

        if (empty($fields)) {
            if (\Elementor\Plugin::$instance->editor->is_edit_mode()) {
                echo '<p>' . esc_html__('Add at least one field to the DCC Contact Form.', 'dcc-contact-form') . '</p>';
            }
            return;
        }

        $recaptcha_on = (($settings['spam_recaptcha'] ?? 'yes') === 'yes') && Settings::recaptcha_configured();

        // Persist the trusted config server-side, keyed by this element id.
        $config = [
            'fields'       => array_map(static function ($f) {
                return [
                    'id'       => $f['id'],
                    'type'     => $f['type'],
                    'label'    => $f['label'],
                    'required' => $f['required'],
                    'options'  => $f['options'],
                ];
            }, $fields),
            'recipient'    => (string) ($settings['email_to'] ?? ''),
            'subject'      => (string) ($settings['email_subject'] ?? ''),
            'from_email'   => (string) ($settings['email_from'] ?? ''),
            'from_name'    => (string) ($settings['email_from_name'] ?? ''),
            'reply_to'     => (string) ($settings['email_reply_to'] ?? ''),
            'confirmation' => (string) ($settings['confirmation'] ?? ''),
            'spam'         => [
                'honeypot'       => (($settings['spam_honeypot'] ?? 'yes') === 'yes'),
                'time_trap'      => (($settings['spam_time_trap'] ?? 'yes') === 'yes'),
                'keyword_filter' => (($settings['spam_keyword_filter'] ?? 'yes') === 'yes'),
                'recaptcha'      => (($settings['spam_recaptcha'] ?? 'yes') === 'yes'),
            ],
        ];

        // Persist only on real front-end renders. render() also runs inside the
        // Elementor editor preview with UNSAVED draft settings — writing those
        // would silently repoint the live, trusted submission config (recipient,
        // fields, toggles) at a draft the owner may abandon. The config instead
        // updates on the first front-end render after the page is published,
        // which necessarily happens before anyone can submit the new markup.
        $elementor  = \Elementor\Plugin::$instance;
        $is_preview = $elementor->editor->is_edit_mode() || $elementor->preview->is_preview_mode();
        $form_id    = $is_preview
            ? Form_Config::normalize_id($this->get_id())
            : Form_Config::save($this->get_id(), $config);

        $uid      = 'dcc-' . $form_id;
        $submit   = $settings['submit_text'] ?? __('Send Message', 'dcc-contact-form');
        $working  = $settings['submit_processing'] ?? __('Sending...', 'dcc-contact-form');
        $min_time = Settings::min_submit_time();
        $nonce    = wp_create_nonce(Form_Handler::NONCE_ACTION);

        ?>
        <div class="dcc-contact-wrap">
            <form class="dcc-contact-form" method="post"
                  action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                  data-ajax-url="<?php echo esc_url(admin_url('admin-ajax.php')); ?>"
                  data-min-time="<?php echo esc_attr((string) $min_time); ?>"
                  <?php if ($recaptcha_on) : ?>data-recaptcha="<?php echo esc_attr(Settings::recaptcha_site_key()); ?>"<?php endif; ?>
                  novalidate>

                <input type="hidden" name="action" value="<?php echo esc_attr(DCC_CONTACT_AJAX_ACTION); ?>">
                <input type="hidden" name="form_id" value="<?php echo esc_attr($form_id); ?>">
                <input type="hidden" name="dcc_nonce" value="<?php echo esc_attr($nonce); ?>">
                <input type="hidden" name="dcc_ts" value="">
                <input type="hidden" name="dcc_recaptcha" value="">

                <?php if (!empty($config['spam']['honeypot'])) : ?>
                    <?php // Honeypot. Deliberately innocuous name/label so bots
                          // can't pattern-match "hp"/"honeypot"/"leave empty";
                          // "code" is not an autofill category, so browsers
                          // won't fill it for real visitors. aria-hidden +
                          // tabindex=-1 + off-screen CSS keep humans out. ?>
                    <div class="dcc-alt" aria-hidden="true">
                        <label for="<?php echo esc_attr($uid); ?>-code"><?php esc_html_e('Code', 'dcc-contact-form'); ?></label>
                        <input type="text" id="<?php echo esc_attr($uid); ?>-code" name="dcc_contact_code" tabindex="-1" autocomplete="off">
                    </div>
                <?php endif; ?>

                <div class="dcc-fields">
                    <?php foreach ($fields as $field) {
                        $this->render_field($field, $uid);
                    } ?>
                </div>

                <div class="dcc-form-error" role="alert" aria-live="assertive"></div>

                <div class="dcc-actions">
                    <button type="submit" class="dcc-submit"
                            data-label="<?php echo esc_attr($submit); ?>"
                            data-processing="<?php echo esc_attr($working); ?>">
                        <?php echo esc_html($submit); ?>
                    </button>
                </div>

                <?php if ($recaptcha_on) : ?>
                    <p class="dcc-recaptcha-note">
                        <?php
                        printf(
                            /* translators: %1$s and %2$s are links to Google's Privacy Policy and Terms of Service. */
                            esc_html__('This site is protected by reCAPTCHA and the Google %1$s and %2$s apply.', 'dcc-contact-form'),
                            '<a href="https://policies.google.com/privacy" target="_blank" rel="noopener nofollow">' . esc_html__('Privacy Policy', 'dcc-contact-form') . '</a>',
                            '<a href="https://policies.google.com/terms" target="_blank" rel="noopener nofollow">' . esc_html__('Terms of Service', 'dcc-contact-form') . '</a>'
                        );
                        ?>
                    </p>
                <?php endif; ?>
            </form>

            <div class="dcc-form-confirmation" role="status" aria-live="polite" hidden></div>
        </div>
        <?php
    }

    private function render_field(array $field, string $uid): void
    {
        $fid      = $field['id'];
        $type     = $field['type'];
        $label    = $field['label'];
        $required = !empty($field['required']);
        $ph       = $field['placeholder'];
        $input_id = $uid . '-' . $fid;
        $err_id   = $uid . '-err-' . $fid;

        $classes = ['dcc-field', 'dcc-field--' . $type, 'dcc-w-' . $field['width']];
        if ($field['css'] !== '') {
            foreach (preg_split('/\s+/', $field['css']) as $c) {
                if ($c !== '') {
                    $classes[] = sanitize_html_class($c);
                }
            }
        }

        $req_attr = $required ? ' aria-required="true"' : '';
        $desc     = ' aria-describedby="' . esc_attr($err_id) . '"';

        echo '<div class="' . esc_attr(implode(' ', $classes)) . '" data-field="' . esc_attr($fid) . '">';

        // Checkboxes carry their label inline after the box; others above.
        if ($type !== 'checkbox') {
            echo '<label class="dcc-label" for="' . esc_attr($type === 'name' ? $input_id . '-first' : $input_id) . '">'
                . esc_html($label);
            if ($required) {
                echo ' <span class="dcc-req" aria-hidden="true">*</span>';
            }
            echo '</label>';
        }

        switch ($type) {
            case 'name':
                echo '<div class="dcc-name">';
                echo '<span class="dcc-subfield">'
                    . '<label class="dcc-sublabel dcc-sr-only" for="' . esc_attr($input_id . '-first') . '">' . esc_html__('First', 'dcc-contact-form') . '</label>'
                    . '<input type="text" class="dcc-input" id="' . esc_attr($input_id . '-first') . '" name="dcc_field[' . esc_attr($fid) . '][first]" autocomplete="given-name" placeholder="' . esc_attr__('First', 'dcc-contact-form') . '"' . $req_attr . $desc . '>'
                    . '</span>';
                echo '<span class="dcc-subfield">'
                    . '<label class="dcc-sublabel dcc-sr-only" for="' . esc_attr($input_id . '-last') . '">' . esc_html__('Last', 'dcc-contact-form') . '</label>'
                    . '<input type="text" class="dcc-input" id="' . esc_attr($input_id . '-last') . '" name="dcc_field[' . esc_attr($fid) . '][last]" autocomplete="family-name" placeholder="' . esc_attr__('Last', 'dcc-contact-form') . '"' . $req_attr . $desc . '>'
                    . '</span>';
                echo '</div>';
                break;

            case 'textarea':
                echo '<textarea class="dcc-textarea" id="' . esc_attr($input_id) . '" name="dcc_field[' . esc_attr($fid) . ']" rows="5"'
                    . ($ph !== '' ? ' placeholder="' . esc_attr($ph) . '"' : '') . $req_attr . $desc . '></textarea>';
                break;

            case 'select':
                echo '<select class="dcc-input dcc-select" id="' . esc_attr($input_id) . '" name="dcc_field[' . esc_attr($fid) . ']"' . $req_attr . $desc . '>';
                echo '<option value="">' . esc_html__('— Select —', 'dcc-contact-form') . '</option>';
                foreach ($field['options'] as $opt) {
                    echo '<option value="' . esc_attr($opt) . '">' . esc_html($opt) . '</option>';
                }
                echo '</select>';
                break;

            case 'checkbox':
                echo '<label class="dcc-checkbox-label">'
                    . '<input type="checkbox" class="dcc-checkbox" id="' . esc_attr($input_id) . '" name="dcc_field[' . esc_attr($fid) . ']" value="1"' . $req_attr . $desc . '> '
                    . '<span>' . esc_html($label);
                if ($required) {
                    echo ' <span class="dcc-req" aria-hidden="true">*</span>';
                }
                echo '</span></label>';
                break;

            case 'email':
            case 'tel':
            case 'number':
            case 'text':
            default:
                $input_type = in_array($type, ['email', 'tel', 'number'], true) ? $type : 'text';
                $autocomplete = $type === 'email' ? ' autocomplete="email"' : ($type === 'tel' ? ' autocomplete="tel"' : '');
                $inputmode = $type === 'tel' ? ' inputmode="tel"' : ($type === 'number' ? ' inputmode="numeric"' : '');
                echo '<input type="' . esc_attr($input_type) . '" class="dcc-input" id="' . esc_attr($input_id) . '" name="dcc_field[' . esc_attr($fid) . ']"'
                    . $autocomplete . $inputmode
                    . ($ph !== '' ? ' placeholder="' . esc_attr($ph) . '"' : '') . $req_attr . $desc . '>';
                break;
        }

        echo '<span class="dcc-error" id="' . esc_attr($err_id) . '"></span>';
        echo '</div>';
    }
}
