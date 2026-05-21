<?php
namespace MPHBAC;

use DateTimeImmutable;

if (!defined('ABSPATH')) {
    exit;
}

final class Ajax
{
    public const MAX_RANGE_DAYS = 95;
    public const NONCE_ACTION   = 'mphbac_nonce';

    public static function handle(): void
    {
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

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
