<?php
/**
 * Admin settings: the two non-document layers of the schema system.
 *
 *  - Site defaults  (option Schema::OPT_SITE)    : Organization/Lodging, WebSite.
 *  - Cottage defaults (option Schema::OPT_COTTAGE): the accommodation-type
 *    template default that every cottage inherits and can override in Elementor.
 *
 * Also owns the top-level "MPHB Schema" admin menu that the importer and health
 * screens hang off of, and a Health screen that detects what each page emits.
 */

namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema_Settings
{
    public const GROUP_SITE    = 'mphbac_schema_site';
    public const GROUP_COTTAGE = 'mphbac_schema_cottage';
    public const HEALTH_SLUG   = 'mphbac-schema-health';

    public static function register_menu(): void
    {
        add_menu_page(
            __('MPHB Schema', 'mphb-availability-calendar'),
            __('MPHB Schema', 'mphb-availability-calendar'),
            'manage_options',
            Schema_Importer::PARENT_SLUG,
            [self::class, 'render_settings'],
            'dashicons-editor-code',
            81
        );
        add_submenu_page(
            Schema_Importer::PARENT_SLUG,
            __('Defaults', 'mphb-availability-calendar'),
            __('Defaults', 'mphb-availability-calendar'),
            'manage_options',
            Schema_Importer::PARENT_SLUG,
            [self::class, 'render_settings']
        );
        add_submenu_page(
            Schema_Importer::PARENT_SLUG,
            __('Health', 'mphb-availability-calendar'),
            __('Health', 'mphb-availability-calendar'),
            'manage_options',
            self::HEALTH_SLUG,
            [self::class, 'render_health']
        );
    }

    public static function register_settings(): void
    {
        register_setting(self::GROUP_SITE, Schema::OPT_SITE, [
            'type'              => 'array',
            'sanitize_callback' => [self::class, 'sanitize_site'],
            'default'           => [],
        ]);
        register_setting(self::GROUP_COTTAGE, Schema::OPT_COTTAGE, [
            'type'              => 'array',
            'sanitize_callback' => [self::class, 'sanitize_cottage'],
            'default'           => [],
        ]);
    }

    /* ------------------------------------------------------------------ */
    /* Settings page                                                       */
    /* ------------------------------------------------------------------ */

    public static function render_settings(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $tab = isset($_GET['tab']) && $_GET['tab'] === 'cottage' ? 'cottage' : 'site';
        $base = menu_page_url(Schema_Importer::PARENT_SLUG, false);

        echo '<div class="wrap"><h1>' . esc_html__('MPHB Schema — Defaults', 'mphb-availability-calendar') . '</h1>';
        echo '<h2 class="nav-tab-wrapper">';
        printf('<a href="%s" class="nav-tab %s">%s</a>', esc_url(add_query_arg('tab', 'site', $base)), $tab === 'site' ? 'nav-tab-active' : '', esc_html__('Site-wide', 'mphb-availability-calendar'));
        printf('<a href="%s" class="nav-tab %s">%s</a>', esc_url(add_query_arg('tab', 'cottage', $base)), $tab === 'cottage' ? 'nav-tab-active' : '', esc_html__('Cottage defaults', 'mphb-availability-calendar'));
        echo '</h2>';

        if ($tab === 'cottage') {
            echo '<p>' . esc_html__('Configure the schema every accommodation type inherits. Use tokens like {{cottage_name}}, {{mphb_price}}, {{mphb_availability}} — they fill in per cottage. Override individual cottages in their Elementor Settings tab.', 'mphb-availability-calendar') . '</p>';
            $group  = self::GROUP_COTTAGE;
            $option = Schema::OPT_COTTAGE;
            $scope  = Schema_Types::SCOPE_COTTAGE;
        } else {
            echo '<p>' . esc_html__('Site-wide identity emitted on every page and used as the parent entity the page graph links to.', 'mphb-availability-calendar') . '</p>';
            $group  = self::GROUP_SITE;
            $option = Schema::OPT_SITE;
            $scope  = Schema_Types::SCOPE_SITE;
        }

        $values = (array) get_option($option, []);
        echo '<form method="post" action="options.php">';
        settings_fields($group);
        foreach (Schema_Types::by_scope($scope) as $key => $def) {
            self::render_type_table($option, $key, $def, (array) ($values[$key] ?? []));
        }
        submit_button();
        echo '</form></div>';
    }

    private static function render_type_table(string $option, string $key, array $def, array $values): void
    {
        echo '<h2>' . esc_html((string) $def['label']) . '</h2>';
        echo '<table class="form-table" role="presentation"><tbody>';

        // Enable toggle.
        $enable = ($values['enable'] ?? '') === 'yes';
        echo '<tr><th scope="row">' . esc_html__('Enable', 'mphb-availability-calendar') . '</th><td>';
        printf(
            '<label><input type="checkbox" name="%s[%s][enable]" value="yes" %s> %s</label>',
            esc_attr($option),
            esc_attr($key),
            checked($enable, true, false),
            esc_html__('Emit this type', 'mphb-availability-calendar')
        );
        echo '</td></tr>';

        foreach ((array) ($def['fields'] ?? []) as $field) {
            $name  = $field['name'];
            $label = $field['label'] ?? $name;
            $val   = (string) ($values[$name] ?? ($field['default'] ?? ''));
            $attr  = sprintf('%s[%s][%s]', esc_attr($option), esc_attr($key), esc_attr($name));
            echo '<tr><th scope="row">' . esc_html((string) $label) . '</th><td>';
            switch ($field['type'] ?? 'text') {
                case 'textarea':
                    printf('<textarea name="%s" rows="3" class="large-text">%s</textarea>', $attr, esc_textarea($val));
                    break;
                case 'switcher':
                    printf(
                        '<label><input type="checkbox" name="%s" value="yes" %s></label>',
                        $attr,
                        checked($val === 'yes', true, false)
                    );
                    break;
                case 'number':
                    printf('<input type="number" name="%s" value="%s" class="small-text">', $attr, esc_attr($val));
                    break;
                default:
                    printf('<input type="text" name="%s" value="%s" class="regular-text">', $attr, esc_attr($val));
                    break;
            }
            if (!empty($field['description'])) {
                echo '<p class="description">' . esc_html((string) $field['description']) . '</p>';
            }
            echo '</td></tr>';
        }
        echo '</tbody></table>';
    }

    /* ------------------------------------------------------------------ */
    /* Sanitizers                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * @param mixed $input
     * @return array<string,mixed>
     */
    public static function sanitize_site($input): array
    {
        return self::sanitize_scope($input, Schema_Types::SCOPE_SITE);
    }

    /**
     * @param mixed $input
     * @return array<string,mixed>
     */
    public static function sanitize_cottage($input): array
    {
        return self::sanitize_scope($input, Schema_Types::SCOPE_COTTAGE);
    }

    /**
     * @param mixed $input
     * @return array<string,mixed>
     */
    private static function sanitize_scope($input, string $scope): array
    {
        $input = is_array($input) ? $input : [];
        $clean = [];
        foreach (Schema_Types::by_scope($scope) as $key => $def) {
            $raw   = (array) ($input[$key] ?? []);
            $entry = ['enable' => (($raw['enable'] ?? '') === 'yes') ? 'yes' : ''];
            foreach ((array) ($def['fields'] ?? []) as $field) {
                $name = $field['name'];
                $val  = $raw[$name] ?? '';
                switch ($field['type'] ?? 'text') {
                    case 'textarea':
                        $entry[$name] = sanitize_textarea_field((string) $val);
                        break;
                    case 'switcher':
                        $entry[$name] = ($val === 'yes') ? 'yes' : '';
                        break;
                    case 'number':
                        $entry[$name] = ($val === '' ? '' : (string) floatval($val));
                        break;
                    case 'url':
                        $entry[$name] = esc_url_raw((string) $val);
                        break;
                    default:
                        $entry[$name] = sanitize_text_field((string) $val);
                        break;
                }
            }
            $clean[$key] = $entry;
        }
        return $clean;
    }

    /* ------------------------------------------------------------------ */
    /* Health screen                                                       */
    /* ------------------------------------------------------------------ */

    public static function render_health(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        echo '<div class="wrap"><h1>' . esc_html__('Schema Health', 'mphb-availability-calendar') . '</h1>';
        echo '<p>' . esc_html__('Detected JSON-LD on key pages (parsed from the live HTML — the same markup the external validators see). Duplicate types across blocks can cause validation errors.', 'mphb-availability-calendar') . '</p>';

        $urls = ['home' => home_url('/')];
        foreach (array_slice(Data_Provider::list_room_types(), 0, 8) as $rt) {
            $link = get_permalink((int) $rt['id']);
            if ($link) {
                $urls[(string) $rt['title']] = $link;
            }
        }

        echo '<table class="widefat striped"><thead><tr>'
            . '<th>' . esc_html__('Page', 'mphb-availability-calendar') . '</th>'
            . '<th>' . esc_html__('Blocks', 'mphb-availability-calendar') . '</th>'
            . '<th>' . esc_html__('Invalid', 'mphb-availability-calendar') . '</th>'
            . '<th>' . esc_html__('Types detected', 'mphb-availability-calendar') . '</th>'
            . '<th>' . esc_html__('Test', 'mphb-availability-calendar') . '</th>'
            . '</tr></thead><tbody>';
        foreach ($urls as $label => $url) {
            $d = Schema_Validator::detect((string) $url);
            $types = $d['error'] !== '' ? $d['error'] : implode(', ', $d['types']);
            $dupes = (bool) $d['duplicates'];
            echo '<tr>';
            echo '<td><a href="' . esc_url((string) $url) . '" target="_blank" rel="noopener">' . esc_html((string) $label) . '</a></td>';
            echo '<td>' . esc_html((string) $d['count']) . '</td>';
            echo '<td>' . esc_html((string) $d['invalid']) . '</td>';
            echo '<td>' . esc_html($types) . ($dupes ? ' <strong style="color:#b32d2e">(' . esc_html__('duplicate types', 'mphb-availability-calendar') . ')</strong>' : '') . '</td>';
            echo '<td><a href="' . esc_url(Schema_Validator::validator_url((string) $url)) . '" target="_blank" rel="noopener">' . esc_html__('Validate', 'mphb-availability-calendar') . '</a></td>';
            echo '</tr>';
        }
        echo '</tbody></table></div>';
    }
}
