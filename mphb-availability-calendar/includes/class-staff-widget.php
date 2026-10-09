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

        // Same zero-cost rule as the public widget: nothing is emitted unless
        // a colour has actually been changed. The staff board is behind a
        // password and is never page-cached, but the rule is the same one so
        // the two cannot drift.
        $tokens = Settings::tokens_css();
        if ($tokens !== '') {
            wp_add_inline_style('mphbac-staff', $tokens);
        }
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
                'weekdaysFull'=> self::weekday_labels(false),
                'months'      => self::month_labels(),
                'startOfWeek' => max(0, min(6, (int) get_option('start_of_week', 0))),
            ],
            'strings' => [
                'loading'      => __('Loading bookings…', 'mphb-availability-calendar'),
                'error'        => __('Could not load bookings. Please try again.', 'mphb-availability-calendar'),
                'expired'      => __('Your session expired. Please reload this page and re-enter the password.', 'mphb-availability-calendar'),
                'denied'       => __('Not authorized.', 'mphb-availability-calendar'),
                'empty'        => __('No bookings in this period.', 'mphb-availability-calendar'),
                'partial'      => __('Part of this period is outside the board\'s ±3-year range.', 'mphb-availability-calendar'),
                'outOfRange'   => __('That date is outside the board\'s ±3-year range.', 'mphb-availability-calendar'),
                'today'        => __('Today', 'mphb-availability-calendar'),
                'cottage'      => __('Cottages', 'mphb-availability-calendar'),
                'checkIn'      => __('Check-in', 'mphb-availability-calendar'),
                'checkOut'     => __('Check-out', 'mphb-availability-calendar'),
                'staying'      => __('Staying', 'mphb-availability-calendar'),
                'arrivals'     => __('Arriving', 'mphb-availability-calendar'),
                'departures'   => __('Departing', 'mphb-availability-calendar'),
                'inHouse'      => __('In house', 'mphb-availability-calendar'),
                'noArrivals'   => __('No arrivals.', 'mphb-availability-calendar'),
                'noDepartures' => __('No departures.', 'mphb-availability-calendar'),
                'noInHouse'    => __('No one in house.', 'mphb-availability-calendar'),
                'night'        => __('night', 'mphb-availability-calendar'),
                'nights'       => __('nights', 'mphb-availability-calendar'),
                'until'        => __('until', 'mphb-availability-calendar'),
                'since'        => __('since', 'mphb-availability-calendar'),
                'arrivedEarlier' => __('arrived before this month', 'mphb-availability-calendar'),
                'leavesLater'  => __('leaves after this month', 'mphb-availability-calendar'),
                'via'          => __('via', 'mphb-availability-calendar'),
                'prevMonth'    => __('Previous month', 'mphb-availability-calendar'),
                'nextMonth'    => __('Next month', 'mphb-availability-calendar'),
                'prevDay'      => __('Previous day', 'mphb-availability-calendar'),
                'nextDay'      => __('Next day', 'mphb-availability-calendar'),
                'prevWeek'     => __('Previous week', 'mphb-availability-calendar'),
                'nextWeek'     => __('Next week', 'mphb-availability-calendar'),
                'prevYear'     => __('Previous year', 'mphb-availability-calendar'),
                'nextYear'     => __('Next year', 'mphb-availability-calendar'),
                'detailTitle'  => __('Booking', 'mphb-availability-calendar'),
                // Section headings. Every FIELD label is built server-side in
                // Staff_Data, so this list is titles only — a label that is
                // not in the operator's spec has nowhere to come from.
                'secBooking'   => __('Booking Information', 'mphb-availability-calendar'),
                'secCustomer'  => __('Customer Information', 'mphb-availability-calendar'),
                'secNotes'     => __('Notes', 'mphb-availability-calendar'),
                'viewPhoto'    => __('View photo ID', 'mphb-availability-calendar'),
                'photoNote'    => __('Opens the guest\'s uploaded ID. Do not share or download.', 'mphb-availability-calendar'),
                'importedTip'  => __('This booking came from an external channel, which does not send the real guest count.', 'mphb-availability-calendar'),
                // ---- 0.44.0 ----
                'srcDirect'    => __('Direct', 'mphb-availability-calendar'),
                'srcAirbnb'    => __('Airbnb', 'mphb-availability-calendar'),
                'srcBooking'   => __('Booking.com', 'mphb-availability-calendar'),
                'srcVrbo'      => __('Vrbo', 'mphb-availability-calendar'),
                'srcOther'     => __('Other', 'mphb-availability-calendar'),
                'tagIn'        => __('IN', 'mphb-availability-calendar'),
                'tagOut'       => __('OUT', 'mphb-availability-calendar'),
                'nightsShort'  => __('{n}n', 'mphb-availability-calendar'),
                'pets'         => __('Pets', 'mphb-availability-calendar'),
                'turnovers'    => __('Turnovers', 'mphb-availability-calendar'),
                'noTurnovers'  => __('No turnovers.', 'mphb-availability-calendar'),
                'turnoverLine' => __('{cottage}: {out} out → {in} in', 'mphb-availability-calendar'),
                'cottageWord'  => __('Cottage', 'mphb-availability-calendar'),
                'turnoverTip'  => __('Turnover: one guest leaves and another arrives', 'mphb-availability-calendar'),
                'tileArriving' => __('Arriving today', 'mphb-availability-calendar'),
                'tileLeaving'  => __('Leaving today', 'mphb-availability-calendar'),
                'tileInHouse'  => __('In house now', 'mphb-availability-calendar'),
                'tileTurnovers'=> __('Turnovers today', 'mphb-availability-calendar'),
                'tileBooked'   => __('Booked', 'mphb-availability-calendar'),
                'tileBookedTip'=> __('Booked nights ÷ (cottages × nights in the period shown), counting confirmed and pending bookings. A cottage-night counts once, however many bookings or channel blocks cover it.', 'mphb-availability-calendar'),
                'filters'      => __('Filters', 'mphb-availability-calendar'),
                'fCottage'     => __('Cottage', 'mphb-availability-calendar'),
                'fSource'      => __('Source', 'mphb-availability-calendar'),
                'fPets'        => __('Pets only', 'mphb-availability-calendar'),
                'fMoves'       => __('Arrivals or departures only', 'mphb-availability-calendar'),
                'fClear'       => __('Clear filters', 'mphb-availability-calendar'),
                'guests'       => __('Guests', 'mphb-availability-calendar'),
                'source'       => __('Source', 'mphb-availability-calendar'),
                'call'         => __('Call', 'mphb-availability-calendar'),
                'text'         => __('Text', 'mphb-availability-calendar'),
                'openAdmin'    => __('Open in WP-Admin', 'mphb-availability-calendar'),
                'updated'      => __('Updated {time}', 'mphb-availability-calendar'),
            ],
        ];

        // One dialog per shell; the id only has to be unique per page.
        static $instance = 0;
        $instance++;
        $title_id = 'mphbac-staff-sheet-title-' . $instance;

        ob_start();
        ?>
        <div class="mphbac-staff" data-staff-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">
            <?php // TODAY TILES (0.44.0). Filled by staff.js from the gated month
            // data, with textContent; empty in the page. Arriving / leaving /
            // in house / turnovers mean the REAL today; "Booked" follows the
            // period shown; all five respect the filters. ?>
            <div class="mphbac-staff-tiles" role="group" aria-label="<?php echo esc_attr__('Today at a glance', 'mphb-availability-calendar'); ?>"></div>
            <div class="mphbac-staff-topbar">
                <?php // Same stroked SVG chevrons as the public widget's nav (0.23.2):
                // the &#8249;/&#8250; glyphs rendered in whatever face the theme
                // gave the button, so their weight was not ours to control.
                // stroke="currentColor" keeps them on --staff-nav-text through
                // hover; the accessible name stays on the BUTTON. ?>
                <button type="button" class="mphbac-staff-nav mphbac-staff-prev" aria-label="<?php echo esc_attr__('Previous month', 'mphb-availability-calendar'); ?>"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                <?php // Not a heading element: it ships empty (JS fills it), which is
                // precisely what tripped the empty-heading check fixed in 0.20.1.
                // aria-live announces the period when it changes. Styled as the
                // public .mphbac-nav-range (0.43.1): a plain 15px / 600 label in
                // a centred cluster, not a large blue title. In the chart periods
                // it names the month filling most of the visible chart and
                // follows the scroll; Daily names its day. ?>
                <div class="mphbac-staff-title" aria-live="polite"></div>
                <?php // Always shown (0.43.1). When today is already in the period,
                // it scrolls the chart back to today instead of hiding. ?>
                <button type="button" class="mphbac-staff-nav mphbac-staff-today"><?php echo esc_html__('Today', 'mphb-availability-calendar'); ?></button>
                <button type="button" class="mphbac-staff-nav mphbac-staff-next" aria-label="<?php echo esc_attr__('Next month', 'mphb-availability-calendar'); ?>"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
            <div class="mphbac-staff-tools">
                <?php // THE PERIOD MENU (0.43.0) replaces the List / Chart buttons:
                // Daily is the old List, the other three are the chart at three
                // widths. A native <select> rather than a custom dropdown — it is
                // keyboard- and screen-reader-complete for free, and on a phone it
                // opens the OS picker. The visible label is the accessible name.
                // "selected" is only the no-JS default; staff.js applies the
                // device's remembered period on load.
                // 0.43.1: laid out as the public filter row — label ABOVE field —
                // and both fields carry .mphbac-staff-input, the staff copy of the
                // public .mphbac-input pill (see staff.css). ?>
                <div class="mphbac-staff-fields">
                    <label class="mphbac-staff-field">
                        <span class="mphbac-staff-field-label"><?php echo esc_html__('Show', 'mphb-availability-calendar'); ?></span>
                        <select class="mphbac-staff-input mphbac-staff-period">
                            <option value="day"><?php echo esc_html__('Daily', 'mphb-availability-calendar'); ?></option>
                            <option value="week"><?php echo esc_html__('Weekly', 'mphb-availability-calendar'); ?></option>
                            <option value="month" selected><?php echo esc_html__('Monthly', 'mphb-availability-calendar'); ?></option>
                            <option value="year"><?php echo esc_html__('Yearly', 'mphb-availability-calendar'); ?></option>
                        </select>
                    </label>
                    <label class="mphbac-staff-field">
                        <span class="mphbac-staff-field-label"><?php echo esc_html__('Go to date', 'mphb-availability-calendar'); ?></span>
                        <input type="date" class="mphbac-staff-input mphbac-staff-goto">
                    </label>
                </div>
                <?php // FILTERS (0.44.0): Cottage, Source, Pets, Arrivals or departures
                // only. A native <details> — keyboard- and screen-reader-complete
                // with no script of its own. staff.js fills the cottage list from
                // the gated data; nothing is remembered between loads. ?>
                <details class="mphbac-staff-filters">
                    <summary class="mphbac-staff-filters-toggle"><?php echo esc_html__('Filters', 'mphb-availability-calendar'); ?><span class="mphbac-staff-filters-count" hidden></span></summary>
                    <div class="mphbac-staff-filters-body">
                        <fieldset class="mphbac-staff-fgroup mphbac-staff-fgroup--cottage">
                            <legend><?php echo esc_html__('Cottage', 'mphb-availability-calendar'); ?></legend>
                        </fieldset>
                        <fieldset class="mphbac-staff-fgroup mphbac-staff-fgroup--source">
                            <legend><?php echo esc_html__('Source', 'mphb-availability-calendar'); ?></legend>
                            <?php // Written out, not looped: the shell is also extracted
                            // from this file by the test harness, which strips PHP. ?>
                            <label class="mphbac-staff-check"><input type="checkbox" name="source" value="direct"><span class="mphbac-staff-swatch is-src-direct" aria-hidden="true"></span><?php echo esc_html__('Direct', 'mphb-availability-calendar'); ?></label>
                            <label class="mphbac-staff-check"><input type="checkbox" name="source" value="airbnb"><span class="mphbac-staff-swatch is-src-airbnb" aria-hidden="true"></span><?php echo esc_html__('Airbnb', 'mphb-availability-calendar'); ?></label>
                            <label class="mphbac-staff-check"><input type="checkbox" name="source" value="booking"><span class="mphbac-staff-swatch is-src-booking" aria-hidden="true"></span><?php echo esc_html__('Booking.com', 'mphb-availability-calendar'); ?></label>
                            <label class="mphbac-staff-check"><input type="checkbox" name="source" value="vrbo"><span class="mphbac-staff-swatch is-src-vrbo" aria-hidden="true"></span><?php echo esc_html__('Vrbo', 'mphb-availability-calendar'); ?></label>
                            <label class="mphbac-staff-check"><input type="checkbox" name="source" value="other"><span class="mphbac-staff-swatch is-src-other" aria-hidden="true"></span><?php echo esc_html__('Other', 'mphb-availability-calendar'); ?></label>
                        </fieldset>
                        <fieldset class="mphbac-staff-fgroup mphbac-staff-fgroup--more">
                            <legend class="mphbac-sr-only"><?php echo esc_html__('More', 'mphb-availability-calendar'); ?></legend>
                            <label class="mphbac-staff-check"><input type="checkbox" name="pets" value="1"><?php echo esc_html__('Pets only', 'mphb-availability-calendar'); ?></label>
                            <label class="mphbac-staff-check"><input type="checkbox" name="moves" value="1"><?php echo esc_html__('Arrivals or departures only', 'mphb-availability-calendar'); ?></label>
                        </fieldset>
                        <button type="button" class="mphbac-staff-filters-clear"><?php echo esc_html__('Clear filters', 'mphb-availability-calendar'); ?></button>
                    </div>
                </details>
                <?php // THE LEGEND (0.44.0, Rob's option C): the five source colours,
                // the IN / OUT tags, pending stripes, the turnover mark and the
                // paw. Every bar also carries its source as a letter badge (on
                // imports) and in its description, so colour is never the only
                // carrier. ?>
                <div class="mphbac-staff-legend" aria-hidden="true">
                    <span class="mphbac-staff-key is-src-direct"><?php echo esc_html__('Direct', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key is-src-airbnb"><?php echo esc_html__('Airbnb', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key is-src-booking"><?php echo esc_html__('Booking.com', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key is-src-vrbo"><?php echo esc_html__('Vrbo', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key is-src-other"><?php echo esc_html__('Other', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key mphbac-staff-key--tags"><span class="mphbac-staff-tag"><?php echo esc_html__('IN', 'mphb-availability-calendar'); ?></span><span class="mphbac-staff-tag"><?php echo esc_html__('OUT', 'mphb-availability-calendar'); ?></span><?php echo esc_html__('Check-in / check-out', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key mphbac-staff-key--pending"><?php echo esc_html__('Pending', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key mphbac-staff-key--turn"><span class="mphbac-staff-turnmark"></span><?php echo esc_html__('Turnover', 'mphb-availability-calendar'); ?></span>
                    <span class="mphbac-staff-key mphbac-staff-key--paw"><span class="mphbac-staff-paw"></span><?php echo esc_html__('Pets', 'mphb-availability-calendar'); ?></span>
                </div>
            </div>
            <?php // Two presentations of the same gated payload: the list is the
            // Daily period, the chart is Weekly / Monthly / Yearly. Since 0.43.0
            // every device opens on Monthly until it chooses otherwise. No aria-live on either: the status line
            // below carries announcements so a month change is not read cell
            // by cell. tabindex=0 makes the scrolling chart keyboard-reachable. ?>
            <div class="mphbac-staff-agenda" role="region"
                 aria-label="<?php echo esc_attr__('Arrivals, departures and guests in house', 'mphb-availability-calendar'); ?>" hidden></div>
            <div class="mphbac-staff-grid" role="region" tabindex="0"
                 aria-label="<?php echo esc_attr__('Booking chart', 'mphb-availability-calendar'); ?>" hidden></div>
            <div class="mphbac-staff-status" role="status" aria-live="polite"></div>
            <?php // "Updated hh:mm" (0.44.0): the auto-refresh's last success. Not
            // live: a line that changes every three minutes must not be read out. ?>
            <div class="mphbac-staff-updated"></div>
            <?php // The quick preview (0.44.0): hover on a computer, long-press on a
            // phone. One per board, filled with textContent from data the board
            // already holds — it fetches nothing. ?>
            <div class="mphbac-staff-preview" role="tooltip" hidden></div>

            <?php // Overlay + dialog are moved to <body> while open (staff.js), so
            // position:fixed measures the real viewport instead of whichever
            // Elementor ancestor happens to carry a transform. ?>
            <div class="mphbac-staff-overlay" hidden></div>
            <div class="mphbac-staff-sheet" role="dialog" aria-modal="true"
                 aria-labelledby="<?php echo esc_attr($title_id); ?>" hidden>
                <div class="mphbac-staff-sheet-head">
                    <div class="mphbac-staff-sheet-title" id="<?php echo esc_attr($title_id); ?>"></div>
                    <?php // The same mark the public booking popup uses, character for
                    // character: a shared snippet is the only version of "these two
                    // cannot drift" that a stylesheet cannot undo. stroke-width is
                    // restated in CSS, which outranks this presentation attribute. ?>
                    <button type="button" class="mphbac-staff-close"
                            aria-label="<?php echo esc_attr__('Close', 'mphb-availability-calendar'); ?>"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                </div>
                <div class="mphbac-staff-sheet-body"></div>
            </div>
        </div>
        <?php
        return (string) ob_get_clean();
    }

    /** @return string[] indexed 0..6 by JS getDay(); localized. */
    private static function weekday_labels(bool $short = true): array
    {
        global $wp_locale;
        $out = [];
        if ($wp_locale instanceof \WP_Locale) {
            for ($i = 0; $i < 7; $i++) {
                $full = (string) $wp_locale->get_weekday($i);
                $out[] = !$short ? $full : (function_exists('mb_substr') ? mb_substr($full, 0, 3) : substr($full, 0, 3));
            }
        }
        if (count($out) === 7) {
            return $out;
        }
        return $short
            ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
