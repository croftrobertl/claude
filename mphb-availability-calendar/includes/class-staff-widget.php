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
                // ---- 0.44.0 / 0.44.1 ----
                'srcDirect'    => __('Direct', 'mphb-availability-calendar'),
                'srcAirbnb'    => __('Airbnb', 'mphb-availability-calendar'),
                'srcBooking'   => __('Booking.com', 'mphb-availability-calendar'),
                'srcVrbo'      => __('Vrbo', 'mphb-availability-calendar'),
                'nightsShort'  => __('{n}n', 'mphb-availability-calendar'),
                'pets'         => __('Pets', 'mphb-availability-calendar'),
                'couch'        => __('Couch', 'mphb-availability-calendar'),
                'boat'         => __('Boat', 'mphb-availability-calendar'),
                'turnovers'    => __('Turnovers', 'mphb-availability-calendar'),
                'noTurnovers'  => __('No turnovers.', 'mphb-availability-calendar'),
                'turnoverLine' => __('{cottage}: {out} out → {in} in', 'mphb-availability-calendar'),
                'cottageWord'  => __('Cottage', 'mphb-availability-calendar'),
                'turnoverTip'  => __('Turnover: one guest leaves and another arrives', 'mphb-availability-calendar'),
                'guests'       => __('Guests', 'mphb-availability-calendar'),
                'source'       => __('Source', 'mphb-availability-calendar'),
                'text'         => __('Text', 'mphb-availability-calendar'),
                'openAdmin'    => __('Open in WP-Admin', 'mphb-availability-calendar'),
                'updated'      => __('Updated {time}', 'mphb-availability-calendar'),
                // Stats (0.44.1)
                'stBooked'     => __('Booked', 'mphb-availability-calendar'),
                'stBookedTip'  => __('Booked nights ÷ (cottages × nights in the timeframe), counting confirmed and pending bookings. A cottage-night counts once, however many bookings or channel blocks cover it.', 'mphb-availability-calendar'),
                'stArrivals'   => __('Arrivals', 'mphb-availability-calendar'),
                'stDepartures' => __('Departures', 'mphb-availability-calendar'),
                'stTurnovers'  => __('Turnovers', 'mphb-availability-calendar'),
                'stInHouse'    => __('In house', 'mphb-availability-calendar'),
                'stWithPets'   => __('With pets', 'mphb-availability-calendar'),
                'stWithCouch'  => __('With couch', 'mphb-availability-calendar'),
                'stWithBoat'   => __('With boat', 'mphb-availability-calendar'),
                'stPerCottage' => __('Nights booked per cottage', 'mphb-availability-calendar'),
                'stBySource'   => __('Share of nights booked, by source', 'mphb-availability-calendar'),
                'stNights'     => __('{n} nights', 'mphb-availability-calendar'),
                'stNight'      => __('{n} night', 'mphb-availability-calendar'),
                'stNoNights'   => __('No nights booked in this timeframe.', 'mphb-availability-calendar'),
                'stCapped'     => __('Custom ranges are limited to 400 days: showing {from} – {to}.', 'mphb-availability-calendar'),
                'stClamped'    => __('Part of this timeframe is outside the board\'s ±3-year range: showing {from} – {to}.', 'mphb-availability-calendar'),
                'stBadRange'   => __('Please check the dates.', 'mphb-availability-calendar'),
                // Search (0.45.0)
                'srchCount'    => __('{n} bookings', 'mphb-availability-calendar'),
                'srchOne'      => __('1 booking', 'mphb-availability-calendar'),
                'srchNone'     => __('No bookings match.', 'mphb-availability-calendar'),
                'srchOutside'  => __('Outside the board\'s ±3-year range.', 'mphb-availability-calendar'),
            ],
        ];

        // One dialog per shell; the id only has to be unique per page.
        static $instance = 0;
        $instance++;
        $title_id = 'mphbac-staff-sheet-title-' . $instance;

        ob_start();
        ?>
        <div class="mphbac-staff" data-staff-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">
            <?php // ORDER, top to bottom (0.44.1, Rob): the Show / Go to date row;
            // the navigation row; the legend; the calendar; Stats, collapsed.
            // Nothing stats-related sits above the calendar, and there are no
            // filters (Rob: cottages, sources, pets and arrivals / departures
            // are all easy to see on the calendar). ?>
            <div class="mphbac-staff-tools">
                <?php // THE PERIOD MENU (0.43.0) replaces the List / Chart buttons:
                // Daily is the old List, the other three are the chart at three
                // widths. A native <select> rather than a custom dropdown — it is
                // keyboard- and screen-reader-complete for free, and on a phone it
                // opens the OS picker. The visible label is the accessible name.
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
                <?php // SEARCH (0.45.0). Live as you type from 2 characters, one list,
                // best match first (Rob). Answered by the gated search endpoint;
                // the results are written with textContent. Nothing typed here is
                // kept — not in the browser, not on the server (WD). ?>
                <div class="mphbac-staff-search">
                    <?php // THE CLEAR BUTTON (0.45.2, Rob on his iPhone): iOS draws no
                    // native cancel button on a search field, so closing the
                    // results meant deleting every letter. This one is ours, on
                    // every device; the native one is hidden in staff.css so a
                    // desktop never shows two. It sits inside the label, so the
                    // input carries its own aria-label — otherwise its name
                    // would read "Search Clear search". CSS shows it only while
                    // the field has text (:placeholder-shown), so no state of
                    // ours can disagree with the field. ?>
                    <label class="mphbac-staff-field mphbac-staff-search-field">
                        <span class="mphbac-staff-field-label"><?php echo esc_html__('Search', 'mphb-availability-calendar'); ?></span>
                        <span class="mphbac-staff-qbox">
                            <input type="search" class="mphbac-staff-input mphbac-staff-q" autocomplete="off" spellcheck="false" enterkeyhint="search"
                                   aria-label="<?php echo esc_attr__('Search', 'mphb-availability-calendar'); ?>"
                                   placeholder="<?php echo esc_attr__('Name, phone, date, booking #', 'mphb-availability-calendar'); ?>">
                            <button type="button" class="mphbac-staff-qclear"
                                    aria-label="<?php echo esc_attr__('Clear search', 'mphb-availability-calendar'); ?>"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                        </span>
                    </label>
                    <div class="mphbac-staff-results" hidden>
                        <p class="mphbac-staff-results-count" role="status" aria-live="polite"></p>
                        <ul class="mphbac-staff-results-list"></ul>
                    </div>
                </div>
            </div>
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
            <?php // THE LEGEND (0.44.1, Rob): the four sources, pending, the turnover
            // mark, and the three facts a bar can carry — Pets, Couch, Boat —
            // each a white outline icon on a NEUTRAL slate swatch, never a
            // source colour. The icons are CSS masks of the same Tabler paths
            // staff.js draws on the bars. ?>
            <div class="mphbac-staff-legend" aria-hidden="true">
                <span class="mphbac-staff-key is-src-direct"><?php echo esc_html__('Direct', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key is-src-airbnb"><?php echo esc_html__('Airbnb', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key is-src-booking"><?php echo esc_html__('Booking.com', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key is-src-vrbo"><?php echo esc_html__('Vrbo', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key mphbac-staff-key--pending"><?php echo esc_html__('Pending', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key mphbac-staff-key--turn"><span class="mphbac-staff-turnmark"></span><?php echo esc_html__('Turnover', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key mphbac-staff-key--pets"><span class="mphbac-staff-ico is-pets"></span><?php echo esc_html__('Pets', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key mphbac-staff-key--couch"><span class="mphbac-staff-ico is-couch"></span><?php echo esc_html__('Couch', 'mphb-availability-calendar'); ?></span>
                <span class="mphbac-staff-key mphbac-staff-key--boat"><span class="mphbac-staff-ico is-boat"></span><?php echo esc_html__('Boat', 'mphb-availability-calendar'); ?></span>
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
            <?php // STATS (0.44.1, Rob): everything statistical in ONE section below
            // the calendar, closed on every load, with its own timeframe —
            // independent of the calendar. Filled by staff.js from the gated
            // range endpoint, with textContent; empty in the page. ?>
            <details class="mphbac-staff-stats">
                <summary class="mphbac-staff-stats-toggle"><?php echo esc_html__('Stats', 'mphb-availability-calendar'); ?></summary>
                <div class="mphbac-staff-stats-body">
                    <div class="mphbac-staff-stats-pick">
                        <label class="mphbac-staff-sfield">
                            <span class="mphbac-staff-field-label"><?php echo esc_html__('Timeframe', 'mphb-availability-calendar'); ?></span>
                            <select class="mphbac-staff-input mphbac-staff-stats-span">
                                <option value="day"><?php echo esc_html__('Day', 'mphb-availability-calendar'); ?></option>
                                <option value="week"><?php echo esc_html__('Week', 'mphb-availability-calendar'); ?></option>
                                <option value="month" selected><?php echo esc_html__('Month', 'mphb-availability-calendar'); ?></option>
                                <option value="year"><?php echo esc_html__('Year', 'mphb-availability-calendar'); ?></option>
                                <option value="custom"><?php echo esc_html__('Custom', 'mphb-availability-calendar'); ?></option>
                            </select>
                        </label>
                        <label class="mphbac-staff-sfield mphbac-staff-stats-on">
                            <span class="mphbac-staff-field-label"><?php echo esc_html__('Date', 'mphb-availability-calendar'); ?></span>
                            <input type="date" class="mphbac-staff-input mphbac-staff-stats-date">
                        </label>
                        <label class="mphbac-staff-sfield mphbac-staff-stats-custom" hidden>
                            <span class="mphbac-staff-field-label"><?php echo esc_html__('From', 'mphb-availability-calendar'); ?></span>
                            <input type="date" class="mphbac-staff-input mphbac-staff-stats-from">
                        </label>
                        <label class="mphbac-staff-sfield mphbac-staff-stats-custom" hidden>
                            <span class="mphbac-staff-field-label"><?php echo esc_html__('To', 'mphb-availability-calendar'); ?></span>
                            <input type="date" class="mphbac-staff-input mphbac-staff-stats-to">
                        </label>
                    </div>
                    <p class="mphbac-staff-stats-note" hidden></p>
                    <div class="mphbac-staff-stats-out" aria-live="polite"></div>
                </div>
            </details>
            <?php // The quick preview (0.44.0): hover on a computer, long-press on a
            // phone. One per board, filled with textContent from data the board
            // already holds — it fetches nothing. Moved to <body> while shown
            // (0.44.1), so position: fixed measures the real viewport. ?>
            <div class="mphbac-staff-preview" role="tooltip" hidden></div>

            <?php // Overlay + dialog are moved to <body> while open (staff.js), so
            // position:fixed measures the real viewport instead of whichever
            // Elementor ancestor happens to carry a transform. ?>
            <div class="mphbac-staff-overlay" hidden></div>
            <div class="mphbac-staff-sheet" role="dialog" aria-modal="true"
                 aria-labelledby="<?php echo esc_attr($title_id); ?>" hidden>
                <div class="mphbac-staff-sheet-head">
                    <div class="mphbac-staff-sheet-title" id="<?php echo esc_attr($title_id); ?>" tabindex="-1"></div>
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
