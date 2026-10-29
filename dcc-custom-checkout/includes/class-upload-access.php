<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.34.2 — WHICH postmeta row the Checkout Fields upload viewer may serve.
 *
 * THE FINDING (Director's read-only audit of live 0.34.1, in the
 * mphb-checkout-fields add-on's FileUploadField.php ~245-271 — MotoPress's own
 * code, which this plugin does NOT patch): the viewer takes `?upload_id=` and
 * accepts ANY postmeta row. The row is not checked against the booking being
 * viewed, nor against the photo-ID meta key, so a guessed or iterated meta_id
 * reaches a row that has nothing to do with guest IDs. Only administrators can
 * reach it today; this closes it before anyone else is given the capability.
 *
 * The add-on offers `mphb_cf_upload_link_has_access` for exactly this, so the
 * fix is a filter from here and MotoPress's file is untouched.
 *
 * THE RULE, and it only ever NARROWS:
 *  1. An access decision that is already "no" is returned untouched. This
 *     filter can never grant access the add-on was refusing — if that is ever
 *     wanted, it is a different hook with a different name.
 *  2. With no `upload_id` in the request there is nothing of this shape to
 *     check, so the decision is left as it was. The hole is specific to that
 *     parameter and so is this.
 *  3. With one: the row is read straight from postmeta by meta_id. It must
 *     exist, its meta_key must be the photo-ID key (Id_Files::META_KEY — built
 *     from the constant, never retyped), and the post that owns it must be a
 *     booking. Anything unreadable is refused.
 *  4. When the request also names a booking, the row must belong to THAT
 *     booking. The viewer is reached from a booking's screen, so the id is
 *     normally there; when it is not, rule 3 still stands and the row can only
 *     be a guest ID on some booking.
 *
 * NOT VERIFIABLE HERE, and stated rather than assumed: the add-on's source is
 * not in this repo and is not on this machine, so the filter's NAME and the
 * arguments it passes come from the Director's read of live, not from anything
 * measured here. The hook is therefore written to work with any number of
 * arguments, and a name that did not match would simply never fire — the
 * viewer would behave exactly as it does in 0.34.1, which is why the staging
 * check list asks for a mismatched row to be refused for real.
 */
final class Upload_Access
{
    /** Request parameters that carry the row id, per the audit. */
    private const ID_PARAMS = ['upload_id'];

    /** Request parameters that name the booking being looked at. */
    private const BOOKING_PARAMS = ['booking_id', 'post', 'post_ID', 'booking'];

    public function register(): void
    {
        // A late priority so this is the last word, and a generous argument
        // count: the callback is variadic, so it is correct whether the add-on
        // passes one argument or several.
        add_filter('mphb_cf_upload_link_has_access', [$this, 'filter_access'], 999, 4);
    }

    /**
     * @param mixed $has_access the add-on's decision so far
     * @param mixed ...$context whatever else the add-on passes
     * @return mixed
     */
    public function filter_access($has_access = false, ...$context)
    {
        // Rule 1: never widen.
        if (!$has_access) {
            return $has_access;
        }

        $meta_id = self::requested_meta_id();
        if ($meta_id <= 0) {
            return $has_access; // Rule 2: not a request of this shape.
        }

        $row = self::meta_row($meta_id);
        if ($row === null) {
            return false;
        }
        if ($row['meta_key'] !== Id_Files::META_KEY) {
            return false;
        }
        if (get_post_type($row['post_id']) !== Id_Files::BOOKING_POST_TYPE) {
            return false;
        }

        $booking_id = self::expected_booking_id($context);
        if ($booking_id > 0 && $booking_id !== $row['post_id']) {
            return false;
        }

        return $has_access;
    }

    /** The `upload_id` in the request, or 0. */
    private static function requested_meta_id(): int
    {
        foreach (self::ID_PARAMS as $key) {
            // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only; this narrows a decision the add-on has already made.
            $raw = $_GET[$key] ?? $_POST[$key] ?? null;
            if (is_scalar($raw) && (string) $raw !== '') {
                return (int) $raw;
            }
        }
        return 0;
    }

    /**
     * One postmeta row by meta_id: its post and its key, or null.
     *
     * Read directly because that is what the viewer is addressing — a row id,
     * not a post's meta. Prepared, and only ever two columns.
     *
     * @return array{post_id:int,meta_key:string}|null
     */
    private static function meta_row(int $meta_id): ?array
    {
        global $wpdb;
        if (!isset($wpdb) || !is_object($wpdb)) {
            return null;
        }
        try {
            $row = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT post_id, meta_key FROM {$wpdb->postmeta} WHERE meta_id = %d",
                    $meta_id
                ),
                ARRAY_A
            );
        } catch (\Throwable $e) {
            return null;
        }
        if (!is_array($row) || !isset($row['post_id'], $row['meta_key'])) {
            return null;
        }
        return [
            'post_id'  => (int) $row['post_id'],
            'meta_key' => (string) $row['meta_key'],
        ];
    }

    /**
     * The booking the request is about: the add-on's own arguments first, then
     * the usual request parameters. 0 when none of them names a booking —
     * never a guess, because a wrong id here refuses a legitimate view.
     *
     * @param array<int, mixed> $context
     */
    private static function expected_booking_id(array $context): int
    {
        foreach ($context as $value) {
            $id = self::booking_id_of($value);
            if ($id > 0) {
                return $id;
            }
        }
        foreach (self::BOOKING_PARAMS as $key) {
            // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only, as above.
            $raw = $_GET[$key] ?? $_POST[$key] ?? null;
            $id  = self::booking_id_of($raw);
            if ($id > 0) {
                return $id;
            }
        }
        return 0;
    }

    /** A value that really is a booking, as an id. 0 otherwise. */
    private static function booking_id_of($value): int
    {
        if (is_object($value) && method_exists($value, 'getId')) {
            $value = $value->getId();
        } elseif (is_object($value) && isset($value->ID)) {
            $value = $value->ID;
        }
        if (!is_scalar($value) || !is_numeric($value)) {
            return 0;
        }
        $id = (int) $value;
        if ($id <= 0) {
            return 0;
        }
        return get_post_type($id) === Id_Files::BOOKING_POST_TYPE ? $id : 0;
    }
}
