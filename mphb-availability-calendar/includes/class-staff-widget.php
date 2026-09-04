<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * `[mphb_staff_calendar]` — the staff booking calendar shell.
 *
 * Deliberately renders NO booking data and NO guest PII: just an empty
 * container, a nonce, and the endpoint URLs. Everything visible is fetched at
 * interaction time through Staff's gated endpoints, which re-verify
 * authorization server-side on every request. That gives one enforcement
 * point, and means the page HTML itself is worthless to anyone who obtains it
 * — including any cache layer that ignores the page password.
 *
 * TWO entry points share this one method: the [mphb_staff_calendar] shortcode
 * and the "DCC Staff Calendar" Elementor widget (Staff_Elementor), which is a
 * thin wrapper that calls render() directly. Neither duplicates the markup or
 * the gate, so there is still exactly one code path to audit.
 */
final class Staff_Widget
{
    public static function register(): void
    {
        add_shortcode('mphb_staff_calendar', ['\\MPHBAC\\Staff_Widget', 'render']);
        add_action('wp_enqueue_scripts', ['\\MPHBAC\\Staff_Widget', 'register_assets']);
    }

    public static function register_assets(): void
    {
        wp_register_style('mphbac-staff', MPHBAC_URL . 'assets/css/staff.css', [], MPHBAC_VERSION);
        wp_register_script('mphbac-staff', MPHBAC_URL . 'assets/js/staff.js', [], MPHBAC_VERSION, true);
    }

    /**
     * @param array<string,mixed>|string $atts
     */
    public static function render($atts = []): string
    {
        if (!Plugin::instance()->dependencies_present()) {
            return '';
        }
        // Render the shell only for someone who is already through the gate.
        // This is a UX nicety, NOT the security boundary — the endpoints are.
        if (!Staff::is_authorized()) {
            return '';
        }

        self::register_assets();
        wp_enqueue_style('mphbac-staff');
        wp_enqueue_script('mphbac-staff');

        $today = Data_Provider::today();
        $config = [
            'ajaxUrl'  => admin_url('admin-ajax.php'),
            'nonce'    => wp_create_nonce(Staff::NONCE_ACTION),
            'month'    => $today->format('Y-m'),
            'today'    => $today->format('Y-m-d'),
            'calendar' => [
                'weekdays'    => self::weekday_labels(),
                'months'      => self::month_labels(),
                'startOfWeek' => max(0, min(6, (int) get_option('start_of_week', 0))),
            ],
            'strings' => [
                'loading'     => __('Loading bookings…', 'mphb-availability-calendar'),
                'error'       => __('Could not load bookings. Please try again.', 'mphb-availability-calendar'),
                'expired'     => __('Your session expired. Please reload this page and re-enter the password.', 'mphb-availability-calendar'),
                'denied'      => __('Not authorized.', 'mphb-availability-calendar'),
                'empty'       => __('No bookings this month.', 'mphb-availability-calendar'),
                'checkIn'     => __('Check-in', 'mphb-availability-calendar'),
                'checkOut'    => __('Check-out', 'mphb-availability-calendar'),
                'staying'     => __('Staying', 'mphb-availability-calendar'),
                'detailTitle' => __('Booking details', 'mphb-availability-calendar'),
                'secBooking'  => __('Booking information', 'mphb-availability-calendar'),
                'secRooms'    => __('Reserved accommodations', 'mphb-availability-calendar'),
                'secCustomer' => __('Customer information', 'mphb-availability-calendar'),
                'secNotes'    => __('Notes', 'mphb-availability-calendar'),
                'guests'      => __('Guests', 'mphb-availability-calendar'),
                'adults'      => __('Adults', 'mphb-availability-calendar'),
                'children'    => __('Children', 'mphb-availability-calendar'),
                'guestName'   => __('Guest name', 'mphb-availability-calendar'),
                'rate'        => __('Rate', 'mphb-availability-calendar'),
                'total'       => __('Total', 'mphb-availability-calendar'),
                'services'    => __('Services', 'mphb-availability-calendar'),
                'fees'        => __('Fees', 'mphb-availability-calendar'),
                'viewPhoto'   => __('View photo ID', 'mphb-availability-calendar'),
                'photoNote'   => __('Opens the guest\'s uploaded ID. Do not share or download.', 'mphb-availability-calendar'),
                'importedTip' => __('This booking came from an external channel, which does not send the real guest count.', 'mphb-availability-calendar'),
            ],
        ];

        ob_start();
        ?>
        <div class="mphbac-staff" data-staff-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">
            <div class="mphbac-staff-bar">
                <button type="button" class="mphbac-staff-nav mphbac-staff-prev" aria-label="<?php echo esc_attr__('Previous month', 'mphb-availability-calendar'); ?>">&larr;</button>
                <?php // Not a heading element: it ships empty (JS fills it), which is
                // precisely what tripped the empty-heading check fixed in 0.20.1.
                // aria-live announces the month when it changes. ?>
                <div class="mphbac-staff-month" aria-live="polite"></div>
                <button type="button" class="mphbac-staff-nav mphbac-staff-today"><?php echo esc_html__('Today', 'mphb-availability-calendar'); ?></button>
                <button type="button" class="mphbac-staff-nav mphbac-staff-next" aria-label="<?php echo esc_attr__('Next month', 'mphb-availability-calendar'); ?>">&rarr;</button>
            </div>
            <div class="mphbac-staff-legend" aria-hidden="true">
                <span class="mphbac-staff-key mphbac-staff-key--in"><?php echo esc_html__('Check-in', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key mphbac-staff-key--out"><?php echo esc_html__('Check-out', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key mphbac-staff-key--stay"><?php echo esc_html__('Staying', 'mphb-availability-calendar'); ?></span>
            </div>
            <?php // No aria-live here on purpose: the grid is a whole table, and a
            // live region would re-read every cell on each month change. The
            // status line below carries the announcements instead. ?>
            <div class="mphbac-staff-grid" role="region"
                 aria-label="<?php echo esc_attr__('Staff booking calendar', 'mphb-availability-calendar'); ?>"></div>
            <div class="mphbac-staff-status" role="status" aria-live="polite"></div>

            <div class="mphbac-staff-overlay" hidden></div>
            <div class="mphbac-staff-sheet" role="dialog" aria-modal="true"
                 aria-labelledby="mphbac-staff-sheet-title" hidden>
                <div class="mphbac-staff-sheet-head">
                    <div class="mphbac-staff-sheet-title" id="mphbac-staff-sheet-title"></div>
                    <button type="button" class="mphbac-staff-close"
                            aria-label="<?php echo esc_attr__('Close', 'mphb-availability-calendar'); ?>">&times;</button>
                </div>
                <div class="mphbac-staff-sheet-body"></div>
            </div>
        </div>
        <?php
        return (string) ob_get_clean();
    }

    /** @return string[] indexed 0..6 by JS getDay(); localized. */
    private static function weekday_labels(): array
    {
        global $wp_locale;
        $out = [];
        if ($wp_locale instanceof \WP_Locale) {
            for ($i = 0; $i < 7; $i++) {
                $full = (string) $wp_locale->get_weekday($i);
                $out[] = function_exists('mb_substr') ? mb_substr($full, 0, 3) : substr($full, 0, 3);
            }
        }
        return count($out) === 7 ? $out : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    }

    /** @return string[] */
    private static function month_labels(): array
    {
        global $wp_locale;
        $out = [];
        if ($wp_locale instanceof \WP_Locale) {
            for ($m = 1; $m <= 12; $m++) {
                $out[] = (string) $wp_locale->get_month($m);
            }
        }
        return count($out) === 12 ? $out : [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
        ];
    }
}
