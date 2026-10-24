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

    /** The cottage strip's pictures: the smallest registered size (0.36.0). */
    private const STRIP_SIZE = 'thumbnail';

    /** The strip is the same for every guest, so it is read once per half-day. */
    private const STRIP_TRANSIENT = 'dcc_checkout_cottage_strip';

    /** How many open stays "Those Dates Aren't Available" offers (Rob: three). */
    private const CHIPS = 3;

    /**
     * THE AVAILABILITY CALENDAR'S PUBLIC READ-ONLY ENDPOINT (0.36.0).
     *
     * `admin-ajax.php?action=mphbac_query`, POST, NO NONCE — and the nonce's
     * absence is that plugin's own documented decision, not an oversight:
     * its handler says a nonce in cached HTML expires and leaves every cached
     * pageload on "Loading availability...". It takes `room_type_ids[]`,
     * `from` and `to`, holds no guest data, and writes nothing. Measured by
     * the Director on live: 0.78s and 2.8 KB for one cottage over 95 days.
     *
     * NOTHING HERE MAY WRITE OR BOOK (Rob's instruction). This is a read, and
     * the chips it produces lead to MotoPress's own checkout form, which the
     * guest submits themselves.
     */
    private const AVAIL_ACTION = 'mphbac_query';

    /** The endpoint caps the range at 95 days; ask for what it will answer. */
    private const AVAIL_WINDOW_DAYS = 94;

    /** Over this and the card simply shows what it showed before (Rob: 3s). */
    private const AVAIL_TIMEOUT_MS = 3000;

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
        // Once: offer() reads the stay, and so does the payload.
        $offer = self::offer();

        return [
            'stay'     => self::stay(),
            // A WORD, never a boolean (0.29.0): `wp_localize_script` casts
            // top-level scalars with `(string)`, and a three-state sent as
            // `true/false/null` arrives as "1"/""/null.
            'offer'    => $offer,
            'checkout' => self::checkout_url(),
            'cottages' => self::cottages_url(),
            /* 0.36.0 — THE WAY FORWARD OUT OF EACH CARD, and each half is
               sent ONLY for the state that can use it, so the normal form
               path carries neither and makes no extra request or query.
                 - 'taken': what the browser needs to ASK for open stays.
                 - 'lost':  the eight cottages, already resolved here. */
            'avail'    => $offer === 'taken' ? self::avail_config() : [],
            'cottageList' => $offer === 'lost' ? self::cottage_list() : [],
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
     * v0.35.1 — WHICH CARD THIS REQUEST HAS EARNED (item 2, the Director's
     * live finding 2026-10-23).
     *
     * THE DEFECT. Cottage 36, Jan 11-14 2027 is booked. A guest who presses
     * Book Now for it is sent to /submit-booking/, MotoPress declines to draw
     * a form and prints "Accommodation is already booked." — and 0.35.0's card
     * said "We do not have your dates any more." We have the dates. They are
     * taken, which is a different thing to say, and a different thing to do
     * about it.
     *
     * HOW THE TWO ARE TOLD APART, WITHOUT READING MOTOPRESS'S WORDS. The
     * states differ in what the REQUEST carried, which is a fact this plugin
     * holds:
     *
     *   - "taken": this request POSTED a complete stay — a room type and both
     *     dates — and (the browser's half) MotoPress drew no form for it. The
     *     dates are known, so they can be named and the guest sent back for
     *     new ones. **The words say "isn't available", not "someone just
     *     booked it"** — see the strings, and the note below on what else
     *     lands here.
     *   - "lost": no stay in this request at all, which is the reloaded-tab
     *     dead end item 10 was built for.
     *
     * Never the error's text. The words are MotoPress's, they are translated
     * on this site, and matching text that can change is how features here
     * have quietly died before.
     *
     * AND THE STAY MUST STILL BE BOOKABLE IN PRINCIPLE, or this says nothing
     * about it. "Someone just booked it" is a claim, and it must not be made
     * about a stay MotoPress may have refused for an entirely different
     * reason: a check-in already in the past, or dates the wrong way round.
     * Those fall through to the honest "pick again" card.
     *
     * ANY OTHER REFUSAL OF A COMPLETE, FUTURE-DATED STAY ALSO LANDS HERE, and
     * since v0.35.2 that is no longer a limit — it is why the words are what
     * they are. The clearest case is real: this site sets a TWO-NIGHT MINIMUM
     * (`mphb_min_stay_length` = 2), so a one-night request is refused with no
     * form and nobody has booked anything. "Isn't available for those nights"
     * is true of that, of a taken cottage, and of a minimum-nights rule
     * nobody has thought of yet; "someone just booked it" was true of only
     * one of them. Narrowing the STATE further would mean reading MotoPress's
     * message, which is the thing this must not do — so the sentence is what
     * was made honest instead.
     *
     * @return string 'taken' | 'lost'
     */
    public static function offer(): string
    {
        $stay = self::stay();
        if ($stay === []) {
            return 'lost';
        }
        return self::bookable_in_principle() ? 'taken' : 'lost';
    }

    /**
     * Could this stay still be booked by anyone? (Not: is it available.)
     *
     * US/EASTERN, like every other "today" in this project. The cottages are
     * in Florida and a cutoff has to match the property clock, not the
     * visitor's: a guest in Sydney must not be told their dates are in the
     * past because it is already tomorrow where they are.
     */
    private static function bookable_in_principle(): bool
    {
        [$in, $out] = Checkout_Request::stay_dates();
        if ($in === null || $out === null || $out <= $in) {
            return false;
        }
        try {
            $today = new \DateTimeImmutable('now', new \DateTimeZone('America/New_York'));
            $floor = new \DateTimeImmutable(
                $today->format('Y-m-d') . ' 00:00:00',
                new \DateTimeZone('UTC')
            );
        } catch (\Throwable $e) {
            // An unreadable clock must not turn a real refusal into a lie, so
            // the claim is simply not made.
            return false;
        }
        return $in >= $floor->getTimestamp();
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
        if (!is_array($src) || empty($src[0])) {
            return '';
        }
        /* The WebP twin here too, through the same helper, so the card and the
           header cannot disagree about which file this site serves. This one
           IS an <img>, so SpeedyCache might have rewritten it anyway — doing
           it here means the answer does not depend on that. */
        return Hero::prefer_webp($attachment, (string) $src[0]);
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

    /* --------------------------------------------------------------------- *
     * 0.36.0 — A WAY FORWARD OUT OF "THOSE DATES AREN'T AVAILABLE"
     * --------------------------------------------------------------------- */

    /**
     * What the browser needs to ask the Availability Calendar for open stays.
     *
     * SENT ONLY IN THE 'taken' STATE, so the normal form path makes no extra
     * request at all (Rob's performance rule). The request itself is made by
     * the browser rather than here, for two reasons: PHP cannot know whether
     * MotoPress drew a form, which is the half that decides the state; and a
     * server-side call would put the Calendar's 0.78s on every checkout
     * render of a posted stay, including the ones that work.
     *
     * THE CHIPS LEAD TO MOTOPRESS'S OWN CHECKOUT FORM, NOT TO A BOOKING.
     * Each is a POST of the same five fields the cottage page's Book Now
     * sends — `mphb_room_type_id`, `mphb_check_in_date`,
     * `mphb_check_out_date`, `mphb_rooms_details[<type>]=1`,
     * `mphb_is_direct_booking=1` — which is the mechanism this plugin's
     * Continue card has used since 0.35.0 and the Availability Calendar's own
     * Book Now uses. It renders the form for those dates and nothing else:
     * MotoPress re-checks availability and prices it, and the GUEST submits.
     * Nothing here, and nothing the browser does with it, writes anything.
     *
     * @return array<string,mixed>
     */
    private static function avail_config(): array
    {
        $stay = self::stay();
        if ($stay === []) {
            return [];
        }
        return [
            // Strings and ints, nested in an array: `wp_localize_script` casts
            // only TOP-LEVEL scalars (0.29.0), so these arrive as written.
            'url'        => admin_url('admin-ajax.php'),
            'action'     => self::AVAIL_ACTION,
            'windowDays' => self::AVAIL_WINDOW_DAYS,
            'timeoutMs'  => self::AVAIL_TIMEOUT_MS,
            'chips'      => self::CHIPS,
            'minNights'  => self::min_nights(),
        ];
    }

    /**
     * The fewest nights any stay here can be.
     *
     * 2 is `mphb_min_stay_length` on this site, as the Director read it. It is
     * a FLOOR, used only when the Calendar's response carries no `rules` —
     * when it does, `rules[<type>].min` is MotoPress's own answer for each
     * day, through its documented availability facade, and the browser
     * prefers it. Deliberately not re-derived here: MotoPress stores
     * minimum-stay as a list of season rules, and reading those correctly
     * would mean copying its season logic into this plugin to answer a
     * question the Calendar already asks MotoPress itself.
     */
    private static function min_nights(): int
    {
        return max(1, (int) apply_filters('dcc_checkout_min_nights', 2));
    }

    /* --------------------------------------------------------------------- *
     * 0.36.0 — AND OUT OF "PICK YOUR DATES AGAIN": the eight cottages
     * --------------------------------------------------------------------- */

    /**
     * Every published cottage, with its page and a small picture.
     *
     * SENT ONLY IN THE 'lost' STATE. A posted stay — which is every normal
     * checkout render — gets an empty array and no query.
     *
     * CACHED FOR HALF A DAY, because a cookie-rebuilt checkout IS the 'lost'
     * state (0.35.1, item 1): that path renders a working form, so without the
     * transient this query would run on a normal checkout render. A stale
     * cottage name or thumbnail for a few hours costs nothing; a query on
     * every such render is the thing to avoid.
     *
     * NO NEW UPLOADS (Rob): the picture is each cottage's own featured image
     * at the smallest registered size, through the same WebP preference the
     * hero uses, so the strip serves what this site already serves.
     *
     * @return array<int,array<string,string|int>>
     */
    public static function cottage_list(): array
    {
        $cached = get_transient(self::STRIP_TRANSIENT);
        if (is_array($cached)) {
            return $cached;
        }

        $list = [];
        $rooms = get_posts([
            'post_type'        => 'mphb_room_type',
            'post_status'      => 'publish',
            'numberposts'      => -1,
            'orderby'          => 'title',
            'order'            => 'ASC',
            'suppress_filters' => false,
        ]);
        foreach ($rooms as $room) {
            $id  = (int) $room->ID;
            $url = (string) get_permalink($id);
            if ($url === '') {
                continue;
            }
            $row = [
                'name' => self::cottage_name($id),
                'url'  => $url,
            ];
            $photo = self::strip_photo($id);
            if ($photo !== []) {
                $row += $photo;
            }
            $list[] = $row;
        }

        set_transient(self::STRIP_TRANSIENT, $list, 12 * HOUR_IN_SECONDS);
        return $list;
    }

    /**
     * One cottage's thumbnail, with its real pixel size.
     *
     * The dimensions are sent so the browser can reserve the box: a lazy image
     * with no width and height is a reflow waiting for the network, and this
     * strip sits under a button a guest is about to press.
     *
     * @return array<string,string|int> empty when there is no featured image
     */
    private static function strip_photo(int $type): array
    {
        if ($type <= 0 || !function_exists('get_post_thumbnail_id')) {
            return [];
        }
        $attachment = (int) get_post_thumbnail_id($type);
        if ($attachment <= 0) {
            return [];
        }
        $src = wp_get_attachment_image_src($attachment, self::STRIP_SIZE);
        if (!is_array($src) || empty($src[0])) {
            return [];
        }
        return [
            'photo' => Hero::prefer_webp($attachment, (string) $src[0]),
            'w'     => (int) ($src[1] ?? 0),
            'h'     => (int) ($src[2] ?? 0),
        ];
    }

    /** @return array<string,string> */
    private static function strings(): array
    {
        return [
            'continueTitle'  => __('Continue Your Booking', 'dcc-checkout'),
            'continueLead'   => __('Your dates are still here. Pick up where you left off.', 'dcc-checkout'),
            'continueButton' => __('Continue Your Booking', 'dcc-checkout'),
            'restartTitle'   => __('Pick Your Dates Again', 'dcc-checkout'),
            /* 0.36.0 — Rob's wording, and American "anymore", in the same
               voice as the taken card. */
            'restartLead'    => __('We don\'t have your dates anymore. Pick them again and we\'ll bring you straight back to checkout.', 'dcc-checkout'),
            'restartButton'  => __('Pick Your Dates Again', 'dcc-checkout'),
            /* v0.35.1, item 2 — the dates are known and taken, which is not
               the same as lost. Two leads: the cottage's name is worth saying
               when it is known, and a title with an empty name in it is worse
               than one without. */
            /* v0.35.2 — WORDS THAT ARE TRUE IN EVERY CASE THAT REACHES HERE
               (Rob's pick, 2026-10-23). 0.35.1 said "Someone just booked %s
               for those nights.", and this state is reached by ANY refusal of
               a complete, future-dated stay — the site has a 2-night minimum
               (`mphb_min_stay_length` = 2), so a one-night request would have
               been told a booking had happened that had not. The recovery
               offered was right; the sentence was not. */
            'takenTitle'     => __('Those Dates Aren\'t Available', 'dcc-checkout'),
            /* translators: %s: the cottage's name, e.g. "Coconut Cottage". */
            'takenLead'      => __('%s isn\'t available for those nights. Choose new dates and we\'ll bring you straight back.', 'dcc-checkout'),
            'takenLeadPlain' => __('Those nights aren\'t available. Choose new dates and we\'ll bring you straight back.', 'dcc-checkout'),
            'takenButton'    => __('Pick New Dates', 'dcc-checkout'),
            /* v0.35.1, item 6 — sentence case. Rob's rule: Title Case is for
               titles and labels, and this is three sentences. */
            'welcome'        => __('Welcome back. We kept your answers. Please add your photo ID again.', 'dcc-checkout'),
            'startOver'      => __('Start Over', 'dcc-checkout'),
            /* 0.36.0 — the open stays offered under "Those Dates Aren't
               Available". The heading only renders when chips were found, so
               it never promises something that is not there. */
            'altTitle'       => __('Open Dates for This Cottage', 'dcc-checkout'),
            /* translators: 1: check-in date, e.g. "Sat, Dec 5". 2: check-out date. 3: the word "Open". */
            'chipLabel'      => _x('%1$s → %2$s · %3$s', 'checkout open-dates chip', 'dcc-checkout'),
            'chipOpen'       => _x('Open', 'checkout open-dates chip', 'dcc-checkout'),
            /* 0.36.0 — the cottages offered under "Pick Your Dates Again". */
            'stripTitle'     => __('Or Browse the Cottages', 'dcc-checkout'),
        ];
    }
}
