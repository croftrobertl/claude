<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.35.1 — THE STAY THIS PAGE IS RENDERING, WHICH IS NOT THE SAME QUESTION
 * AS "WHAT WAS POSTED" (item 1, the Director's live finding 2026-10-23).
 *
 * THE DEFECT. A plain GET of /submit-booking/ after a POST still shows a
 * working checkout: MotoPress re-renders the form from its own cookies
 * (`mphb_check_in_date` / `mphb_check_out_date`, step.php's cookie fallback —
 * the Director read it on the server). Nothing was posted, so
 * `Checkout_Request::posted_room_type_id()` and `::stay_dates()` both came
 * back empty, the hero stood down, and the header fell back to the canal
 * banner with the theme's "Submit Booking" title over it — on a page that is
 * otherwise the new layout, bar and all.
 *
 * WHY THIS IS A SEPARATE CLASS AND NOT A FALLBACK INSIDE `Checkout_Request`.
 * Those accessors are what the SERVER-SIDE BACKSTOPS read — Pet_Service,
 * Guest_Fields, Extra_Guest_Service, Dog_Sizes, Rest_Guard — to decide whether
 * to refuse a booking. They must keep answering "what did this request
 * SUBMIT", because a cookie is not a submission: letting a cookie supply the
 * dates for a submission that posted none would widen what those guards
 * evaluate, on the one path where getting it wrong charges or refuses a real
 * guest. So the cookie fallback lives here, it is read ONLY by display code
 * (the hero), and the boundary is structural rather than a comment.
 *
 * WHAT IT IS ALLOWED TO BE WRONG ABOUT. Nothing. A wrong cottage photo over
 * the checkout is worse than the canal banner, because it looks deliberate.
 * Every path that cannot answer returns nothing, and the hero then does what
 * it does today.
 */
final class Rendered_Stay
{
    /**
     * MotoPress's own date cookies — the two names the Director read off the
     * live server (2026-10-23). Not guessed, and not extended with
     * name-shaped variations: a cookie name that does not exist is not a
     * fallback, it is a line that looks like one.
     */
    public const DATE_COOKIES = [
        'in'  => 'mphb_check_in_date',
        'out' => 'mphb_check_out_date',
    ];

    /**
     * The cookie that carries the room type — PINNED BY NAME in v0.35.2.
     *
     * 0.35.1 scanned any `mphb…room…` cookie, because the name had not been
     * read and inventing one would have been a guess. The Director then read
     * live (2026-10-23): the cookies are `mphb_check_in_date`,
     * `mphb_check_out_date` and `mphb_rooms_details`, and his instruction is
     * to pin the third by name and keep the published-room-type check.
     *
     * PINNING IS NARROWER, WHICH IS THE POINT. A scan could read a room type
     * id out of a cookie that is about something else — a four-digit year in
     * a date ("2027-01-11" → 2027) could collide with a post id — and the
     * only protection against that was excluding the date cookies by name.
     * One named cookie needs no exclusions. A renamed cookie means no hero,
     * which is 0.35.0's behaviour and harms nothing.
     */
    public const ROOM_COOKIE = 'mphb_rooms_details';

    /** MotoPress's room-type post type — the validation every candidate passes. */
    public const ROOM_TYPE_POST_TYPE = 'mphb_room_type';

    /** Decided once per request; null until asked. */
    private static ?array $resolved = null;

    /**
     * The room type this page is rendering, or 0.
     *
     * The submission first — that is the proven path and the common one — then
     * the cookies MotoPress itself fell back to.
     */
    public static function room_type_id(): int
    {
        $posted = Checkout_Request::posted_room_type_id();
        if ($posted > 0) {
            return $posted;
        }
        return self::from_cookies()['type'];
    }

    /**
     * [check-in, check-out] as UTC timestamps, either may be null.
     *
     * @return array{0:?int,1:?int}
     */
    public static function dates(): array
    {
        [$in, $out] = Checkout_Request::stay_dates();
        if ($in !== null && $out !== null) {
            return [$in, $out];
        }
        $cookies = self::from_cookies();
        return [$in ?? $cookies['in'], $out ?? $cookies['out']];
    }

    /** Nights, or 0 when either end is unreadable. */
    public static function nights(): int
    {
        [$in, $out] = self::dates();
        if ($in === null || $out === null) {
            return 0;
        }
        return max(0, (int) round(($out - $in) / DAY_IN_SECONDS));
    }

    /** Tests only: forget the per-request answer. */
    public static function flush(): void
    {
        self::$resolved = null;
    }

    /**
     * What MotoPress's cookies say, resolved once.
     *
     * @return array{type:int,in:?int,out:?int}
     */
    private static function from_cookies(): array
    {
        if (self::$resolved !== null) {
            return self::$resolved;
        }
        self::$resolved = [
            'type' => self::room_type_from_cookies(),
            'in'   => self::date_cookie(self::DATE_COOKIES['in']),
            'out'  => self::date_cookie(self::DATE_COOKIES['out']),
        ];
        return self::$resolved;
    }

    /** One `Y-m-d` cookie → a UTC timestamp, or null. */
    private static function date_cookie(string $name): ?int
    {
        $raw = $_COOKIE[$name] ?? null; // phpcs:ignore WordPress.Security.NonceVerification
        if (!is_scalar($raw)) {
            return null;
        }
        $value = sanitize_text_field((string) $raw);
        if ($value === '') {
            return null;
        }
        $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, new \DateTimeZone('UTC'));
        return $dt === false ? null : $dt->getTimestamp();
    }

    /**
     * The one room type the cookies agree on, or 0.
     *
     * NEVER `unserialize()`. A cookie is attacker-controlled and MotoPress
     * may store this as a serialised array; unserialising one is object
     * injection. So the value is treated as TEXT: every digit run in it is
     * pulled out and offered to the validator, and only a real room type
     * survives. Extracting digits cannot execute anything.
     *
     * AMBIGUITY IS AN ANSWER OF ITS OWN. If the cookie names more than one
     * distinct room type, this returns 0 — a hero for the wrong cottage is
     * worse than no hero, and "pick the first" would be exactly how that
     * happens. A genuine multi-cottage stay lands there too, and correctly:
     * there is one photo at the top of the page and no honest way to choose
     * which cottage it is of.
     */
    private static function room_type_from_cookies(): int
    {
        // phpcs:ignore WordPress.Security.NonceVerification
        $raw = $_COOKIE[self::ROOM_COOKIE] ?? null;
        $found = [];

        foreach (self::candidate_ids($raw) as $id) {
            if (self::is_room_type($id)) {
                $found[$id] = true;
            }
        }

        return count($found) === 1 ? (int) array_key_first($found) : 0;
    }

    /**
     * Every digit run in a cookie value that could be a post id.
     *
     * Three or more digits: WordPress ids on this site are four, and a floor
     * keeps a quantity ("1") or an array index out of the candidate list.
     * Arrays are walked, scalars read; anything else is skipped.
     *
     * @param mixed $value
     * @return int[]
     */
    private static function candidate_ids($value): array
    {
        if (is_array($value)) {
            $out = [];
            foreach ($value as $item) {
                foreach (self::candidate_ids($item) as $id) {
                    $out[] = $id;
                }
            }
            return $out;
        }
        if (!is_scalar($value)) {
            return [];
        }
        $text = (string) $value;
        if (!preg_match_all('/\d{3,}/', $text, $m)) {
            return [];
        }
        $out = [];
        foreach ($m[0] as $digits) {
            $id = (int) $digits;
            if ($id > 0) {
                $out[] = $id;
            }
        }
        return $out;
    }

    /**
     * Is this id really one of MotoPress's room types?
     *
     * This is the whole guard. A number out of a cookie is only ever used
     * after WordPress itself says it is a published room type, so the worst a
     * tampered cookie can do is name a DIFFERENT cottage of this site's own —
     * and the ambiguity rule above already refuses that when the real one is
     * named too.
     */
    private static function is_room_type(int $id): bool
    {
        if ($id <= 0 || !function_exists('get_post_type')) {
            return false;
        }
        if (get_post_type($id) !== self::ROOM_TYPE_POST_TYPE) {
            return false;
        }
        return !function_exists('get_post_status') || get_post_status($id) === 'publish';
    }
}
