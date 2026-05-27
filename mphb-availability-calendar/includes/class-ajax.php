<?php
namespace MPHBAC;

use DateTimeImmutable;

if (!defined('ABSPATH')) {
    exit;
}

final class Ajax
{
    public const MAX_RANGE_DAYS = 95;

    public static function handle(): void
    {
        // No nonce check: this endpoint returns public, read-only availability
        // data and performs no state-changing actions, so there is no CSRF
        // surface to protect. Requiring a nonce here breaks page caching —
        // SpeedyCache (and any other full-page cache) stores the embedded
        // nonce in the cached HTML, and the nonce expires after ~24h, after
        // which every cached pageload returns 403/-1 and the calendar sits
        // on "Loading availability…" until the cache is purged.

        $type = isset($_POST['type']) ? sanitize_key((string) wp_unslash($_POST['type'])) : 'availability';
        if ($type === 'info') {
            self::handle_info();
            return;
        }

        $raw_ids = isset($_POST['room_type_ids']) ? (array) wp_unslash($_POST['room_type_ids']) : [];
        $room_type_ids = array_values(array_filter(array_map('absint', $raw_ids)));

        $from_str = isset($_POST['from']) ? sanitize_text_field((string) wp_unslash($_POST['from'])) : '';
        $to_str   = isset($_POST['to'])   ? sanitize_text_field((string) wp_unslash($_POST['to']))   : '';

        $from = self::parse_date($from_str);
        $to   = self::parse_date($to_str);
        if (!$from || !$to) {
            wp_send_json_error(['message' => __('Invalid date range.', 'mphb-availability-calendar')], 400);
        }

        if ($to < $from) {
            wp_send_json_error(['message' => __('Check-out must be on or after check-in.', 'mphb-availability-calendar')], 400);
        }

        $diff_days = (int) $from->diff($to)->format('%a');
        if ($diff_days > self::MAX_RANGE_DAYS) {
            $to = $from->modify('+' . self::MAX_RANGE_DAYS . ' days');
        }

        if (empty($room_type_ids)) {
            $all = Data_Provider::list_room_types();
            $room_type_ids = array_map(static fn($t) => (int) $t['id'], $all);
        }

        $availability = Data_Provider::get_availability($room_type_ids, $from, $to);
        $rooms        = Data_Provider::list_room_types();

        wp_send_json_success([
            'rooms'        => array_values($rooms),
            'availability' => $availability,
            'from'         => $from->format('Y-m-d'),
            'to'           => $to->format('Y-m-d'),
        ]);
    }

    /**
     * Lazy-render a saved Elementor template for a cottage-info popup. Keeps
     * the calendar page light by deferring image-heavy templates until the
     * user actually opens a popup, then caches via the same transient layer
     * used for availability so re-opens are instant.
     */
    private static function handle_info(): void
    {
        $template_id = isset($_POST['template_id']) ? absint(wp_unslash($_POST['template_id'])) : 0;
        if ($template_id <= 0) {
            wp_send_json_error(['message' => __('Missing template id.', 'mphb-availability-calendar')], 400);
        }

        // Validate: the post must exist, be published, and be of a renderable
        // type. Elementor templates are post_type elementor_library; we also
        // allow generic public post types so any user-built page works.
        $post = get_post($template_id);
        if (!$post || $post->post_status !== 'publish') {
            wp_send_json_error(['message' => __('Template not available.', 'mphb-availability-calendar')], 404);
        }

        $cache_key = Cache::key(['info', $template_id, get_locale()]);
        $html = get_transient($cache_key);
        if (!is_string($html) || $html === '') {
            $html = '';
            if (class_exists('\\Elementor\\Plugin')) {
                try {
                    $elementor = \Elementor\Plugin::instance();
                    if (isset($elementor->frontend) && method_exists($elementor->frontend, 'get_builder_content_for_display')) {
                        $html = (string) $elementor->frontend->get_builder_content_for_display($template_id, true);
                    }
                } catch (\Throwable $e) {
                    error_log('MPHBAC: handle_info render failed for ' . $template_id . ': ' . $e->getMessage());
                }
            }
            if ($html !== '') {
                set_transient($cache_key, $html, Cache::DEFAULT_TTL);
            }
        }

        if ($html === '') {
            wp_send_json_error(['message' => __('Template empty.', 'mphb-availability-calendar')], 500);
        }

        wp_send_json_success(['html' => $html]);
    }

    private static function parse_date(string $value): ?DateTimeImmutable
    {
        if ($value === '') {
            return null;
        }
        $d = DateTimeImmutable::createFromFormat('Y-m-d', $value, Data_Provider::timezone());
        if (!$d) {
            return null;
        }
        $errors = DateTimeImmutable::getLastErrors();
        if (is_array($errors) && (!empty($errors['warning_count']) || !empty($errors['error_count']))) {
            return null;
        }
        return $d->setTime(0, 0, 0);
    }
}
