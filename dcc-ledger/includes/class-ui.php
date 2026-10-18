<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Small presentation helpers. Everything these return is already escaped.
 */
final class Ui
{
    public static function money(float|int|string $amount): string
    {
        $amount = (float) $amount;
        $text   = ($amount < 0 ? '-$' : '$') . number_format(abs($amount), 2);
        return esc_html($text);
    }

    /**
     * Money that does not apply to this row at all — a direct booking has no
     * platform payout or fee, which is not the same as one of zero.
     */
    public static function not_applicable(): string
    {
        return '<span class="dccl-muted" title="'
            . esc_attr__('Direct bookings carry no platform payout or fee. Their money is in the Direct Bookings figures.', 'dcc-ledger')
            . '">&mdash;</span>';
    }

    public static function number(float|int|string $value, int $decimals = 0): string
    {
        return esc_html(number_format((float) $value, $decimals));
    }

    /**
     * A stat tile: a figure, what it is, and where it came from.
     */
    public static function tile(string $label, string $value, string $source = '', string $tone = ''): string
    {
        $class = 'dccl-tile' . ($tone !== '' ? ' dccl-tile--' . sanitize_html_class($tone) : '');
        $html  = '<div class="' . esc_attr($class) . '">';
        $html .= '<div class="dccl-tile__label">' . esc_html($label) . '</div>';
        $html .= '<div class="dccl-tile__value">' . $value . '</div>';
        if ($source !== '') {
            $html .= '<div class="dccl-tile__source">' . esc_html($source) . '</div>';
        }
        $html .= '</div>';
        return $html;
    }

    public static function chip(string $text, string $tone = ''): string
    {
        $class = 'dccl-chip' . ($tone !== '' ? ' dccl-chip--' . sanitize_html_class($tone) : '');
        return '<span class="' . esc_attr($class) . '">' . esc_html($text) . '</span>';
    }

    public static function booking_link(int $booking_id): string
    {
        return '<a href="' . esc_url(Mphb_Reader::admin_link($booking_id)) . '">#' . (int) $booking_id . '</a>';
    }

    public static function status_chip(string $status): string
    {
        $tones = ['ok' => 'good', 'cancelled' => 'bad', 'expired' => 'muted'];
        $texts = [
            'ok'        => __('Confirmed', 'dcc-ledger'),
            'cancelled' => __('Cancelled', 'dcc-ledger'),
            'expired'   => __('Expired', 'dcc-ledger'),
        ];
        return self::chip($texts[$status] ?? $status, $tones[$status] ?? '');
    }

    public static function export_url(string $what, array $period): string
    {
        return wp_nonce_url(
            add_query_arg([
                'action' => 'dccl_export',
                'what'   => $what,
                'period' => 'custom',
                'from'   => $period['from'],
                'to'     => $period['to'],
                'basis'  => $period['basis'],
            ], admin_url('admin-post.php')),
            Admin::NONCE
        );
    }

    /** The months with data, newest first, for the period control. */
    public static function month_options(): array
    {
        global $wpdb;
        $table  = Schema::stays();
        $months = $wpdb->get_col(
            "SELECT DISTINCT SUBSTR(check_in, 1, 7) FROM {$table} WHERE check_in IS NOT NULL ORDER BY 1 DESC"
        ) ?: [];

        $current = substr(Dates::today(), 0, 7);
        if (!in_array($current, $months, true)) {
            array_unshift($months, $current);
        }
        return $months;
    }

    public static function year_options(): array
    {
        global $wpdb;
        $table = Schema::stays();
        $years = $wpdb->get_col(
            "SELECT DISTINCT SUBSTR(check_in, 1, 4) FROM {$table} WHERE check_in IS NOT NULL ORDER BY 1 DESC"
        ) ?: [];

        $current = substr(Dates::today(), 0, 4);
        if (!in_array($current, $years, true)) {
            array_unshift($years, $current);
        }
        return array_map('strval', $years);
    }
}
