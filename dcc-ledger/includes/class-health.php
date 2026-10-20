<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Does MotoPress still look the way this plugin expects?
 *
 * Every figure about direct bookings rests on a handful of meta keys and one
 * status spelling. Those spellings are easy to get wrong — `mphb_amount` and
 * `_mphb_amount` differ by one character, and `completed` and
 * `mphb-p-completed` differ by a prefix — and a wrong one returns no rows at
 * all. That reports $0, which looks like an answer.
 *
 * So the keys are checked: on activation, before every snapshot, and on every
 * report load. If one is missing, the screens show what is missing instead of
 * figures.
 */
final class Health
{
    /**
     * Each required key, and what breaks without it.
     *
     * @return array<int,array{what:string,kind:string,value:string,why:string}>
     */
    public static function requirements(): array
    {
        return [
            [
                'what'  => Mphb_Reader::META_CHECK_IN,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_CHECK_IN,
                'why'   => __('Every booking\'s check-in date.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_CHECK_OUT,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_CHECK_OUT,
                'why'   => __('Every booking\'s check-out date.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_ROOM_ID,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_ROOM_ID,
                'why'   => __('Which cottage a booking is for.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_TOTAL,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_TOTAL,
                'why'   => __('What a direct booking was due to pay.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_PAYMENT_AMOUNT,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_PAYMENT_AMOUNT,
                'why'   => __('How much each payment was for.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_PAYMENT_BOOKING,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_PAYMENT_BOOKING,
                'why'   => __('Which booking each payment belongs to.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::PAYMENT_COMPLETED,
                'kind'  => 'payment_status',
                'value' => Mphb_Reader::PAYMENT_COMPLETED,
                'why'   => __('Which payments count as money received.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::POST_TYPE_PAYMENT,
                'kind'  => 'post_type',
                'value' => Mphb_Reader::POST_TYPE_PAYMENT,
                'why'   => __('Where payments are stored.', 'dcc-ledger'),
            ],
        ];
    }

    /**
     * Is there anywhere to read a guest's surname from?
     *
     * This is a soft check. Without it the figures are still right; only the
     * move signal cannot run, and every probable move is reported as "no name
     * to compare" instead of being guessed at.
     */
    public static function name_source_present(): bool
    {
        global $wpdb;

        $keys = [
            Mphb_Reader::META_LAST_NAME,
            Mphb_Reader::META_FIRST_NAME,
            Mphb_Reader::META_GUEST_NAME,
        ];
        $placeholders = implode(',', array_fill(0, count($keys), '%s'));

        try {
            return (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key IN ({$placeholders}) LIMIT 1",
                ...$keys
            )) > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array{ok:bool,missing:array<int,array{what:string,why:string}>}
     */
    public static function check(): array
    {
        global $wpdb;

        $missing = [];

        foreach (self::requirements() as $requirement) {
            $found = false;

            try {
                if ($requirement['kind'] === 'meta') {
                    $found = (int) $wpdb->get_var($wpdb->prepare(
                        "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = %s LIMIT 1",
                        $requirement['value']
                    )) > 0;
                } elseif ($requirement['kind'] === 'payment_status') {
                    $found = (int) $wpdb->get_var($wpdb->prepare(
                        "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s AND post_status = %s LIMIT 1",
                        Mphb_Reader::POST_TYPE_PAYMENT,
                        $requirement['value']
                    )) > 0;
                } else {
                    $found = (int) $wpdb->get_var($wpdb->prepare(
                        "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s LIMIT 1",
                        $requirement['value']
                    )) > 0;
                }
            } catch (\Throwable $e) {
                $found = false;
            }

            if (!$found) {
                $missing[] = ['what' => $requirement['what'], 'why' => $requirement['why']];
            }
        }

        return ['ok' => $missing === [], 'missing' => $missing];
    }

    /**
     * The banner shown in place of figures. Returns '' when everything is there.
     */
    public static function banner(): string
    {
        $check = self::check();
        if ($check['ok']) {
            return '';
        }

        $html  = '<div class="dccl-notice dccl-notice--error dccl-health">';
        $html .= '<p><strong>' . esc_html__('MotoPress does not look the way this plugin expects, so no figures are shown.', 'dcc-ledger') . '</strong></p>';
        $html .= '<p>' . esc_html__('Each of these is missing from this site. Until they are right, any figure here would read as zero rather than as an error:', 'dcc-ledger') . '</p>';
        $html .= '<ul>';
        foreach ($check['missing'] as $item) {
            $html .= '<li><code>' . esc_html($item['what']) . '</code> — ' . esc_html($item['why']) . '</li>';
        }
        $html .= '</ul>';
        $html .= '<p>' . esc_html__('MotoPress may have been updated, or this site may spell them differently. Send the list above to whoever maintains this plugin; the spellings are constants at the top of class-mphb-reader.php.', 'dcc-ledger') . '</p>';
        $html .= '</div>';

        return $html;
    }

    /** Checked on activation too, so a mismatch surfaces before any import. */
    public static function on_activate(): void
    {
        $check = self::check();
        if (!$check['ok']) {
            update_option('dccl_health_warning', $check['missing'], false);
            return;
        }
        delete_option('dccl_health_warning');
    }
}
