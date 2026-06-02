<?php
/**
 * Registers per-document Schema controls in the Elementor Settings tab.
 *
 * One section per @type, built from the {@see Schema_Types} registry:
 *  - document-scope types get an Enable switcher;
 *  - cottage-scope types (mphb_room_type only) get an inherit/override/disable
 *    selector so the per-cottage layer can override the admin template default.
 *
 * Control IDs follow `mphbac_s_{typeKey}_{field}` so {@see Schema} can read them
 * back at render time.
 */

namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema_Controls
{
    public static function register($document): void
    {
        if (!is_object($document) || !method_exists($document, 'start_controls_section') || !class_exists('\\Elementor\\Controls_Manager')) {
            return;
        }
        $post_id   = method_exists($document, 'get_main_id') ? (int) $document->get_main_id() : 0;
        $post_type = $post_id ? (string) get_post_type($post_id) : '';
        if ($post_type === '' || !self::is_supported_post_type($post_type)) {
            return;
        }

        foreach (Schema_Types::by_scope(Schema_Types::SCOPE_COTTAGE) as $key => $def) {
            if ($post_type === 'mphb_room_type') {
                self::add_cottage_section($document, $key, $def);
            }
        }

        foreach (Schema_Types::by_scope(Schema_Types::SCOPE_DOCUMENT) as $key => $def) {
            if (Schema_Types::applies_to_post_type($def, $post_type)) {
                self::add_document_section($document, $key, $def);
            }
        }

        self::add_tools_section($document, $post_id);
    }

    private static function is_supported_post_type(string $post_type): bool
    {
        $public = get_post_types(['public' => true]);
        return isset($public[$post_type]) || $post_type === 'mphb_room_type';
    }

    private static function add_document_section($document, string $key, array $def): void
    {
        $prefix = 'mphbac_s_' . $key . '_';
        $document->start_controls_section($prefix . 'section', [
            'label' => sprintf(/* translators: %s: schema type label */ __('Schema: %s', 'mphb-availability-calendar'), $def['label']),
            'tab'   => \Elementor\Controls_Manager::TAB_SETTINGS,
        ]);

        $document->add_control($prefix . 'enable', [
            'label'        => __('Enable', 'mphb-availability-calendar'),
            'type'         => \Elementor\Controls_Manager::SWITCHER,
            'label_on'     => __('On', 'mphb-availability-calendar'),
            'label_off'    => __('Off', 'mphb-availability-calendar'),
            'return_value' => 'yes',
            'default'      => '',
        ]);

        self::add_fields($document, $prefix, $def['fields'] ?? [], [$prefix . 'enable' => 'yes']);
        $document->end_controls_section();
    }

    private static function add_cottage_section($document, string $key, array $def): void
    {
        $prefix = 'mphbac_s_' . $key . '_';
        $document->start_controls_section($prefix . 'section', [
            'label' => sprintf(/* translators: %s: schema type label */ __('Schema: %s', 'mphb-availability-calendar'), $def['label']),
            'tab'   => \Elementor\Controls_Manager::TAB_SETTINGS,
        ]);

        $document->add_control($prefix . 'mode', [
            'label'   => __('This cottage', 'mphb-availability-calendar'),
            'type'    => \Elementor\Controls_Manager::SELECT,
            'default' => 'inherit',
            'options' => [
                'inherit'  => __('Inherit template default', 'mphb-availability-calendar'),
                'override' => __('Override here', 'mphb-availability-calendar'),
                'disable'  => __('Disable for this cottage', 'mphb-availability-calendar'),
            ],
        ]);

        $document->add_control($prefix . 'mode_note', [
            'type'            => \Elementor\Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Empty fields fall back to the accommodation-type template default set under MPHB Schema → Cottage defaults.', 'mphb-availability-calendar'),
            'content_classes' => 'elementor-descriptor',
        ]);

        self::add_fields($document, $prefix, $def['fields'] ?? [], [$prefix . 'mode' => 'override']);
        $document->end_controls_section();
    }

    /**
     * @param array<int,array<string,mixed>> $fields
     * @param array<string,mixed>            $condition
     */
    private static function add_fields($document, string $prefix, array $fields, array $condition): void
    {
        foreach ($fields as $field) {
            $id   = $prefix . $field['name'];
            $type = $field['type'] ?? 'text';

            if ($type === 'repeater') {
                if (!class_exists('\\Elementor\\Repeater')) {
                    continue;
                }
                $repeater = new \Elementor\Repeater();
                foreach ((array) ($field['fields'] ?? []) as $sub) {
                    $repeater->add_control($sub['name'], self::control_args($sub));
                }
                $document->add_control($id, [
                    'label'       => $field['label'] ?? $field['name'],
                    'type'        => \Elementor\Controls_Manager::REPEATER,
                    'fields'      => $repeater->get_controls(),
                    'title_field' => '{{{ ' . ((($field['fields'][0]['name']) ?? 'question')) . ' }}}',
                    'condition'   => $condition,
                ]);
                continue;
            }

            $args = self::control_args($field);
            $args['condition'] = $condition;
            $document->add_control($id, $args);
        }
    }

    /**
     * Map a neutral field definition to Elementor control args.
     *
     * @param array<string,mixed> $field
     * @return array<string,mixed>
     */
    private static function control_args(array $field): array
    {
        $cm   = 'Elementor\\Controls_Manager';
        $type = $field['type'] ?? 'text';
        $args = [
            'label'   => $field['label'] ?? $field['name'],
            'default' => $field['default'] ?? '',
        ];
        if (!empty($field['description'])) {
            $args['description'] = $field['description'];
        }

        switch ($type) {
            case 'textarea':
                $args['type'] = constant("$cm::TEXTAREA");
                $args['rows'] = 4;
                break;
            case 'number':
                $args['type'] = constant("$cm::NUMBER");
                break;
            case 'switcher':
                $args['type']         = constant("$cm::SWITCHER");
                $args['return_value'] = 'yes';
                break;
            case 'select':
                $args['type']    = constant("$cm::SELECT");
                $args['options'] = (array) ($field['options'] ?? []);
                break;
            case 'url':
            case 'text':
            default:
                $args['type'] = constant("$cm::TEXT");
                break;
        }
        return $args;
    }

    private static function add_tools_section($document, int $post_id): void
    {
        $permalink = $post_id ? (string) get_permalink($post_id) : '';
        if ($permalink === '') {
            return;
        }
        $document->start_controls_section('mphbac_schema_tools', [
            'label' => __('Schema: Test & Validate', 'mphb-availability-calendar'),
            'tab'   => \Elementor\Controls_Manager::TAB_SETTINGS,
        ]);
        $document->add_control('mphbac_schema_tools_links', [
            'type' => \Elementor\Controls_Manager::RAW_HTML,
            'raw'  => Schema_Validator::tools_html($permalink),
        ]);
        $document->end_controls_section();
    }
}
