<?php
/**
 * Imports hand-placed JSON-LD out of Elementor "Custom HTML" widgets into the
 * structured per-document schema settings (the Custom JSON-LD field).
 * Admin screen: MPHB Schema -> Import & Detect.
 */

namespace MPHBSchema;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema_Importer
{
    public const PARENT_SLUG = 'mphbsch-schema';
    public const PAGE_SLUG   = 'mphbsch-schema-import';

    public static function register_menu(): void
    {
        add_submenu_page(
            self::PARENT_SLUG,
            __('Import & Detect', 'mphb-schema-manager'),
            __('Import & Detect', 'mphb-schema-manager'),
            'manage_options',
            self::PAGE_SLUG,
            [self::class, 'render_page']
        );
    }

    public static function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        $notice = '';
        if (isset($_POST['mphbsch_import_post'])) {
            check_admin_referer('mphbsch_schema_import');
            $pid    = absint($_POST['mphbsch_import_post']);
            $count  = self::import_post($pid);
            $notice = $count > 0
                ? sprintf(/* translators: 1: count 2: post title */ __('Imported %1$d JSON-LD block(s) into "%2$s". Open it in Elementor to review under Schema: Custom JSON-LD, then delete the old Custom HTML widget.', 'mphb-schema-manager'), $count, get_the_title($pid))
                : __('Nothing imported (no valid JSON-LD found).', 'mphb-schema-manager');
        }

        echo '<div class="wrap"><h1>' . esc_html__('Schema: Import & Detect', 'mphb-schema-manager') . '</h1>';
        if ($notice !== '') {
            echo '<div class="notice notice-success"><p>' . esc_html($notice) . '</p></div>';
        }
        echo '<p>' . esc_html__('Pages built with Elementor that contain JSON-LD inside a Custom HTML widget are listed below. Import moves that markup into the structured editor so it is managed, validated, and linked into the page graph.', 'mphb-schema-manager') . '</p>';

        $candidates = self::candidates();
        if (empty($candidates)) {
            echo '<p><em>' . esc_html__('No Custom HTML JSON-LD found on any Elementor page.', 'mphb-schema-manager') . '</em></p></div>';
            return;
        }

        echo '<table class="widefat striped"><thead><tr>'
            . '<th>' . esc_html__('Page', 'mphb-schema-manager') . '</th>'
            . '<th>' . esc_html__('Blocks in Custom HTML', 'mphb-schema-manager') . '</th>'
            . '<th>' . esc_html__('Action', 'mphb-schema-manager') . '</th>'
            . '</tr></thead><tbody>';

        foreach ($candidates as $pid => $blocks) {
            $title = get_the_title($pid) ?: ('#' . $pid);
            echo '<tr>';
            echo '<td><strong>' . esc_html($title) . '</strong><br><a href="' . esc_url((string) get_permalink($pid)) . '" target="_blank" rel="noopener">' . esc_html__('View', 'mphb-schema-manager') . '</a></td>';
            echo '<td>' . esc_html((string) count($blocks)) . '</td>';
            echo '<td><form method="post">';
            wp_nonce_field('mphbsch_schema_import');
            echo '<input type="hidden" name="mphbsch_import_post" value="' . esc_attr((string) $pid) . '">';
            submit_button(__('Import', 'mphb-schema-manager'), 'secondary', 'submit', false);
            echo '</form></td>';
            echo '</tr>';
        }
        echo '</tbody></table></div>';
    }

    /**
     * @return array<int,string[]>
     */
    public static function candidates(): array
    {
        global $wpdb;
        $out = [];
        try {
            $ids = $wpdb->get_col($wpdb->prepare(
                "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_elementor_data' AND meta_value LIKE %s LIMIT 200",
                '%' . $wpdb->esc_like('ld+json') . '%'
            ));
            foreach ((array) $ids as $id) {
                $blocks = self::scan_post((int) $id);
                if (!empty($blocks)) {
                    $out[(int) $id] = $blocks;
                }
            }
        } catch (\Throwable $e) {
            error_log('MPHBSchema: importer candidates failed: ' . $e->getMessage());
        }
        return $out;
    }

    /**
     * @return string[]
     */
    public static function scan_post(int $post_id): array
    {
        $data = get_post_meta($post_id, '_elementor_data', true);
        if (is_string($data)) {
            $data = json_decode($data, true);
        }
        if (!is_array($data)) {
            return [];
        }
        $html = [];
        self::collect_html_widgets($data, $html);

        $blocks = [];
        foreach ($html as $markup) {
            if (preg_match_all('#<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is', $markup, $m)) {
                foreach ($m[1] as $raw) {
                    $raw = trim($raw);
                    if ($raw !== '' && is_array(json_decode($raw, true))) {
                        $blocks[] = $raw;
                    }
                }
            }
        }
        return $blocks;
    }

    /**
     * @param mixed    $node
     * @param string[] $html
     */
    private static function collect_html_widgets($node, array &$html): void
    {
        if (!is_array($node)) {
            return;
        }
        if (($node['widgetType'] ?? '') === 'html' && isset($node['settings']['html']) && is_string($node['settings']['html'])) {
            $html[] = $node['settings']['html'];
        }
        if (isset($node['elements']) && is_array($node['elements'])) {
            foreach ($node['elements'] as $child) {
                self::collect_html_widgets($child, $html);
            }
        }
        if ($node !== [] && array_keys($node) === range(0, count($node) - 1)) {
            foreach ($node as $child) {
                self::collect_html_widgets($child, $html);
            }
        }
    }

    public static function import_post(int $post_id): int
    {
        $blocks = self::scan_post($post_id);
        if (empty($blocks)) {
            return 0;
        }

        $nodes = [];
        foreach ($blocks as $raw) {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                continue;
            }
            if (isset($decoded['@graph']) && is_array($decoded['@graph'])) {
                foreach ($decoded['@graph'] as $n) {
                    $nodes[] = $n;
                }
            } else {
                $nodes[] = $decoded;
            }
        }
        if (empty($nodes)) {
            return 0;
        }

        $combined = count($nodes) === 1
            ? wp_json_encode($nodes[0], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)
            : wp_json_encode(['@graph' => $nodes], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

        $settings = get_post_meta($post_id, '_elementor_page_settings', true);
        if (!is_array($settings)) {
            $settings = [];
        }
        $settings['mphbsch_s_custom_jsonld_enable'] = 'yes';
        $settings['mphbsch_s_custom_jsonld_raw']    = (string) $combined;
        update_post_meta($post_id, '_elementor_page_settings', $settings);

        return count($nodes);
    }
}
