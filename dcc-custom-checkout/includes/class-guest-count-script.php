<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.34.1 — assets/guest-count.js, the guest count while it is still
 * "— Select —": the price questions asked for the included guests, and the
 * site's words in the browser's own "required" message on the chooser.
 *
 * Loaded on exactly two screens, both of which draw MotoPress's own checkout
 * form: the guest checkout (Assets, before checkout.js) and WP-Admin's Add New
 * Booking (Admin_Fields). Nowhere else — Edit Accommodations is left as
 * MotoPress draws it (0.32.1).
 */
final class Guest_Count_Script
{
    public const HANDLE = 'dcc-checkout-guest-count';

    /**
     * @param bool $in_footer the guest checkout keeps the footer, where
     *                        checkout.js armed the same wrapper in 0.34.0 and
     *                        the Director's live capture proved it in time;
     *                        WP-Admin prints it in the head, the earliest
     *                        moment, because MotoPress's admin script order
     *                        there has not been read.
     */
    public static function enqueue(bool $in_footer): void
    {
        if (wp_script_is(self::HANDLE, 'enqueued')) {
            return;
        }
        wp_enqueue_script(
            self::HANDLE,
            DCC_CHECKOUT_URL . 'assets/guest-count.js',
            [],
            DCC_CHECKOUT_VERSION,
            $in_footer
        );
        wp_localize_script(self::HANDLE, 'DCC_GUEST_COUNT', self::config());
    }

    /**
     * Every top-level value is read by Number() or by truthiness, never with
     * === against true/false: wp_localize_script casts them to strings.
     */
    public static function config(): array
    {
        return [
            'includedGuests' => Config::included_guests(),
            'guestsSelector' => Config::guests_selector(),
            'isAdmin'        => current_user_can('manage_options') ? '1' : '',
            'i18n'           => [
                'guestsRequired' => __('Please select the number of guests.', 'dcc-checkout'),
            ],
        ];
    }
}
