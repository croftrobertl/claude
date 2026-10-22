<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.35.0 — KEEPING A GUEST'S ANSWERS, AND THE WAY BACK IN (item 10,
 * pictures 5 and 9).
 *
 * THIS ONE IS NOT BEHIND THE PREVIEW GATE, AND THAT IS DELIBERATE (Rob's
 * instruction: "This card shows for everyone, even before the layout is
 * switched on, because the error page is a dead end today"). Everything else
 * in 0.35.0 waits for his switch; this does not, because today a guest whose
 * phone reloads /submit-booking/ — a backgrounded tab, a lost signal, a tap on
 * Back — is shown nothing but
 *
 *     Check-in date is not valid. Check-out date is not valid.
 *
 * with no form, no dates and no way forward (the Director confirmed MotoPress's
 * own cookies do not rebuild it). Their booking is simply gone. So this half
 * ships to every guest at once.
 *
 * TWO HALVES, ONE STORE:
 *
 *   1. WHILE THE FORM IS THERE, the guest's typed answers are kept in
 *      sessionStorage as they type, with the stay they belong to. On a reload
 *      that still has a form, the answers go back in and the page says so.
 *
 *   2. WHEN THE FORM IS GONE, the stored stay is used to offer "Continue Your
 *      Booking" — a real POST of the same five fields the cottage page sends,
 *      so MotoPress re-checks availability and prices it itself. Nothing is
 *      asserted about the booking still being available; MotoPress answers
 *      that, as it does for the cottage page.
 *
 * SESSION STORAGE ONLY — NEVER localStorage, NEVER A COOKIE (Rob). It dies
 * with the tab, it is never sent to the server by the browser, and it is per
 * origin and per tab. A guest's name, phone and address are in it, so nothing
 * about it may outlive the visit.
 *
 * NEVER STORED: the photo ID, the coupon code, the acceptance tick. The ID
 * because it is identity documents and must never be written anywhere but the
 * protected store on submit; the coupon and the tick because they are
 * decisions, and a decision restored without the guest making it again is a
 * decision nobody made. The guest is told the ID has to be added again.
 *
 * WHAT PHP CONTRIBUTES: the stay this request is for, read with the same
 * accessors the backstops use, plus the cottage's name and a small photo for
 * the card and the strings. The browser cannot be trusted to know which
 * cottage is being booked, and it is PHP that is holding the submission.
 */
final class Restore
{
    public const HANDLE = 'dcc-checkout-restore';

    /** The thumbnail on the Continue card: small, and never the original. */
    private const CARD_SIZE = 'medium';

    public function register(): void
    {
        // After Assets, whose checkout.js this depends on, so the restore
        // happens once the sections and the fee logic are listening.
        add_action('wp_enqueue_scripts', [$this, 'enqueue'], 20);
    }

    public function enqueue(): void
    {
        if (!Assets::is_checkout_page()) {
            return;
        }

        wp_enqueue_script(
            self::HANDLE,
            Assets::asset_url('assets/restore.js'),
            ['dcc-checkout'],
            DCC_CHECKOUT_VERSION,
            true
        );
        wp_localize_script(self::HANDLE, 'DCC_RESTORE', self::config());
    }

    /**
     * What the browser is told.
     *
     * Every top-level scalar here is a STRING or an array on purpose: 0.29.0 —
     * `wp_localize_script` casts top-level scalars with `(string)`, so a
     * boolean arrives as "1" or "". Nothing here is a three-state.
     *
     * @return array<string,mixed>
     */
    public static function config(): array
    {
        return [
            'stay'     => self::stay(),
            'checkout' => self::checkout_url(),
            'cottages' => self::cottages_url(),
            'i18n'     => self::strings(),
        ];
    }

    /**
     * The stay this request is for, or an empty array when there is none.
     *
     * The five fields are EXACTLY the ones the cottage page posts, which is
     * what makes "Continue Your Booking" MotoPress's own path rather than a
     * reconstruction of it: `mphb_room_type_id`, `mphb_check_in_date`,
     * `mphb_check_out_date`, `mphb_rooms_details[<room type>] = 1`,
     * `mphb_is_direct_booking = 1`.
     *
     * `rooms_details` is passed through AS POSTED when the request carries it,
     * rather than rebuilt, because that array is MotoPress's and a guess at
     * its shape would be a guess about availability.
     *
     * @return array<string,mixed>
     */
    public static function stay(): array
    {
        $type = Checkout_Request::posted_room_type_id();
        [$in, $out] = Checkout_Request::stay_dates();
        if ($type <= 0 || $in === null || $out === null) {
            return [];
        }

        $photo = Hero::photo($type);
        $card  = self::card_photo($type);

        return [
            // The five fields, as strings, ready to be posted back.
            'roomTypeId'   => (string) $type,
            'checkIn'      => gmdate('Y-m-d', $in),
            'checkOut'     => gmdate('Y-m-d', $out),
            'roomsDetails' => self::rooms_details($type),
            // For the card.
            'name'         => self::cottage_name($type),
            'photo'        => $card !== '' ? $card : $photo['url'],
            'dates'        => self::dates_text($in, $out),
            // The key the store is scoped by: answers belong to ONE stay, so
            // a guest who goes back and picks different dates is never handed
            // the previous stay's answers.
            'key'          => $type . '|' . gmdate('Y-m-d', $in) . '|' . gmdate('Y-m-d', $out),
        ];
    }

    /**
     * `mphb_rooms_details` as posted, or the one pair the cottage page sends.
     *
     * @return array<string,string>
     */
    private static function rooms_details(int $type): array
    {
        $posted = Checkout_Request::posted_rooms_details();
        if ($posted !== []) {
            return $posted;
        }
        return [(string) $type => '1'];
    }

    /** "Cottage 34: Coconut Cottage" → "Coconut Cottage"; otherwise as titled. */
    private static function cottage_name(int $type): string
    {
        $title = trim(wp_strip_all_tags((string) get_the_title($type)));
        if ($title === '') {
            return '';
        }
        $parts = explode(':', $title, 2);
        return count($parts) === 2 && trim($parts[1]) !== '' ? trim($parts[1]) : $title;
    }

    /** A small thumbnail for the card — never the full original. */
    private static function card_photo(int $type): string
    {
        if ($type <= 0 || !function_exists('get_post_thumbnail_id')) {
            return '';
        }
        $attachment = (int) get_post_thumbnail_id($type);
        if ($attachment <= 0) {
            return '';
        }
        $src = wp_get_attachment_image_src($attachment, self::CARD_SIZE);
        return is_array($src) && !empty($src[0]) ? (string) $src[0] : '';
    }

    /** "Mon, Nov 16 → Thu, Nov 19 · 3 Nights". */
    private static function dates_text(int $in, int $out): string
    {
        /* translators: the date format on the Continue Your Booking card, e.g. "Mon, Nov 16". */
        $format = _x('D, M j', 'checkout continue card date', 'dcc-checkout');
        $text = sprintf(
            /* translators: 1: check-in date, 2: check-out date. */
            _x('%1$s → %2$s', 'checkout continue card dates', 'dcc-checkout'),
            date_i18n($format, $in),
            date_i18n($format, $out)
        );
        $nights = (int) round(($out - $in) / DAY_IN_SECONDS);
        if ($nights > 0) {
            $text .= ' · ' . sprintf(
                /* translators: %s: number of nights. */
                _n('%s Night', '%s Nights', $nights, 'dcc-checkout'),
                number_format_i18n($nights)
            );
        }
        return $text;
    }

    private static function checkout_url(): string
    {
        if (function_exists('MPHB')) {
            try {
                $url = (string) MPHB()->settings()->pages()->getCheckoutPageUrl();
                if ($url !== '') {
                    return $url;
                }
            } catch (\Throwable $e) {
                // Fall through to the site's own path.
            }
        }
        return home_url('/submit-booking/');
    }

    /**
     * Where "Pick Your Dates Again" goes when nothing was stored.
     *
     * /cottages/ is the page Rob named. Filterable rather than hard-wired, so
     * a renamed page does not strand the one link a guest with no stored stay
     * has.
     */
    private static function cottages_url(): string
    {
        return (string) apply_filters('dcc_checkout_cottages_url', home_url('/cottages/'));
    }

    /** @return array<string,string> */
    private static function strings(): array
    {
        return [
            'continueTitle'  => __('Continue Your Booking', 'dcc-checkout'),
            'continueLead'   => __('Your dates are still here. Pick up where you left off.', 'dcc-checkout'),
            'continueButton' => __('Continue Your Booking', 'dcc-checkout'),
            'restartTitle'   => __('Pick Your Dates Again', 'dcc-checkout'),
            'restartLead'    => __('We do not have your dates any more. Choose them again and we will take you straight to checkout.', 'dcc-checkout'),
            'restartButton'  => __('Pick Your Dates Again', 'dcc-checkout'),
            'welcome'        => __('Welcome Back. We Kept Your Answers. Please add your photo ID again.', 'dcc-checkout'),
            'startOver'      => __('Start Over', 'dcc-checkout'),
        ];
    }
}
