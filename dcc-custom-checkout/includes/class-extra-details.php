<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The "Extra Details/Options" box on the booking edit screen (v0.32.0, Rob's
 * picks A–C, 2026-10-10): directly under "Guest count", holding the pet part
 * (pet-fee cottages only — today Cottage 34) and the dog questions. The boat
 * question moved into "Guest count" in v0.32.1 (Rob's change).
 *
 * THE BOX IS ONLY DRAWN WHEN IT HAS SOMETHING TO HOLD (v0.32.1, Rob: "hide the
 * box rather than show an empty one"): a pet-fee cottage (the pet part), a
 * cottage that cannot be read (the dog questions show — fail open), or a
 * booking that already carries a dog answer (a filled field always stays
 * visible). On a cottage known to have no pet fee and no dog answer saved,
 * there is no box.
 *
 * What is server-rendered here is only what this plugin owns: the pet part
 * and an empty table. The Dog questions are MotoPress's own Checkout Fields;
 * admin-booking.js MOVES their rows into that table (never re-creates them),
 * so they stay inside the booking form and MotoPress goes on saving them.
 * Without the script they simply stay in Customer Information.
 *
 * THE PET PART:
 *  - IMPORTED booking (Airbnb / Booking.com / Vrbo): "Bringing a dog?" —
 *    RECORD ONLY, never a fee (Rob: "all extra fees have to be added in the
 *    OTA"). Stored as booking meta `_dcc_dog` = 'yes' | 'no', absent = not
 *    asked — the contract with the Availability Calendar, written ONLY here.
 *  - DIRECT booking: the pet fee as the booking carries it, read-only, and
 *    MotoPress's own Edit Accommodations button to change it (the brief's
 *    fallback for B: a one-tap change could not be proven equal to
 *    MotoPress's own repricing from here — see CLAUDE.md, 0.32.0).
 */
final class Extra_Details
{
    public const DOG_META = '_dcc_dog';
    private const NONCE   = 'dcc_extra_details';
    private const BOOKING_POST_TYPE = 'mphb_booking';

    public function register(): void
    {
        // Registered straight after Admin_Guests (Plugin::boot order), in the
        // same column and priority, so WordPress draws it directly under
        // "Guest count".
        add_action('add_meta_boxes', [$this, 'add_box'], 10, 2);  // ($post_type, $post)
        add_action('save_post_' . self::BOOKING_POST_TYPE, [$this, 'save'], 10, 2);
    }

    /** @param mixed $post_type @param mixed $post */
    public function add_box($post_type = '', $post = null): void
    {
        if (!$post instanceof \WP_Post || !self::wanted((int) $post->ID)) {
            return;
        }
        add_meta_box(
            'dcc-checkout-extras',
            __('Extra Details/Options', 'dcc-checkout'),
            [$this, 'render'],
            self::BOOKING_POST_TYPE,
            'side',
            'default'
        );
    }

    /**
     * Does the box have anything to hold? Pure apart from reads: tested
     * directly. Not a pet-fee cottage (read, not guessed) and no dog answer
     * saved on the booking → no box.
     */
    public static function wanted(int $booking_id): bool
    {
        if (Admin_Fields::booking_pet_cottage($booking_id) !== false) {
            return true;   // a pet-fee cottage, or one that cannot be read
        }
        foreach (Config::dog_meta_keys() as $key) {
            if (trim((string) get_post_meta($booking_id, (string) $key, true)) !== '') {
                return true;
            }
        }
        return false;
    }

    /** @param mixed $post */
    public function render($post): void
    {
        if (!$post instanceof \WP_Post || !current_user_can('edit_post', $post->ID)) {
            return;
        }
        echo self::box_html((int) $post->ID); // phpcs:ignore WordPress.Security.EscapeOutput -- built escaped in box_html()
    }

    /** The box's content, escaped. Pure apart from reads: tested directly. */
    public static function box_html(int $booking_id): string
    {
        $out = '<div class="dcc_extras">';
        if (Admin_Fields::booking_pet_cottage($booking_id) === true) {
            if (Policies::is_imported($booking_id)) {
                $dog = (string) get_post_meta($booking_id, self::DOG_META, true);
                $out .= wp_nonce_field(self::NONCE, self::NONCE . '_nonce', true, false);
                $out .= '<p class="dcc_extras-dog"><label for="dcc_dog"><strong>'
                    . esc_html__('Bringing a dog?', 'dcc-checkout') . '</strong></label><br>'
                    . '<select id="dcc_dog" name="dcc_dog" style="width:100%">'
                    . '<option value=""' . ($dog === '' ? ' selected' : '') . '>' . esc_html__('— Select —', 'dcc-checkout') . '</option>'
                    . '<option value="no"' . ($dog === 'no' ? ' selected' : '') . '>' . esc_html__('No', 'dcc-checkout') . '</option>'
                    . '<option value="yes"' . ($dog === 'yes' ? ' selected' : '') . '>' . esc_html__('Yes', 'dcc-checkout') . '</option>'
                    . '</select><span class="description">'
                    . esc_html__('Imported booking: this records the dog only. Any pet fee is charged through the booking site.', 'dcc-checkout')
                    . '</span></p>';
            } else {
                $pet = Admin_Fields::booking_pet_state($booking_id);
                $control = Fee_Sync::pet_control($booking_id);
                if ($control === 'select' && ($pet === 'yes' || $pet === 'no')) {
                    // v0.33.0 — Update adds or removes the pet fee (Fee_Sync).
                    $out .= '<p class="dcc_admin-petfee-line"><label for="dcc_pet_fee"><strong>'
                        . esc_html__('Pet fee:', 'dcc-checkout') . '</strong></label><br>'
                        . '<select id="dcc_pet_fee" name="' . esc_attr(Fee_Sync::PET_FIELD) . '" style="width:100%">'
                        . '<option value="no"' . ($pet === 'no' ? ' selected' : '') . '>' . esc_html__('No', 'dcc-checkout') . '</option>'
                        . '<option value="yes"' . ($pet === 'yes' ? ' selected' : '') . '>' . esc_html__('Yes', 'dcc-checkout') . '</option>'
                        . '</select><span class="description">'
                        . esc_html__('Change it and press Update: the pet fee for this stay\'s length is added or removed. The room price is not changed.', 'dcc-checkout')
                        . '</span></p>';
                    $prompt = __('Or change it by hand in Edit Accommodations.', 'dcc-checkout');
                } else {
                    $out .= '<p class="dcc_admin-petfee-line"><strong>' . esc_html__('Pet fee:', 'dcc-checkout') . '</strong> ';
                    $out .= ($pet === 'yes' || $pet === 'no')
                        ? esc_html($pet === 'yes' ? __('Yes', 'dcc-checkout') : __('No', 'dcc-checkout'))
                        : esc_html__('could not be read, so the dog details are shown.', 'dcc-checkout');
                    $out .= '</p>';
                    $prompt = Fee_Sync::eligible($booking_id)
                        ? __('To add or remove the pet fee, use Edit Accommodations.', 'dcc-checkout')
                        : __('Fees aren\'t changed on a cancelled or abandoned booking.', 'dcc-checkout');
                }
                // admin-booking.js turns this into a copy of MotoPress's own
                // "Edit Accommodations" link when that link is on the screen.
                $out .= '<p class="dcc_extras-edit description"'
                    . (Fee_Sync::eligible($booking_id) ? ' data-dcc-edit-accommodations="1"' : '') . '>'
                    . esc_html($prompt) . '</p>';
                // v0.33.1 — Update adds or removes only the fee; MotoPress's
                // own flow reprices the stay (Director, staging: #10212).
                if (Fee_Sync::eligible($booking_id)) {
                    $out .= '<p class="dcc_extras-edit-note description">'
                        . esc_html__('Edit Accommodations recalculates the whole stay at today\'s rates.', 'dcc-checkout')
                        . '</p>';
                }
            }
        }
        // The Dog rows are moved in here by admin-booking.js.
        $out .= '<table class="form-table dcc_extras-table"><tbody id="dcc_extras_rows"></tbody></table>';
        $out .= '</div>';
        return $out;
    }

    /**
     * Saves `_dcc_dog` — imported bookings on a pet-fee cottage only, the only
     * place the control is drawn. Never anything about money.
     *
     * @param mixed $post_id
     * @param mixed $post
     */
    public function save($post_id, $post = null): void
    {
        $post_id = (int) $post_id;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        if (empty($_POST[self::NONCE . '_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[self::NONCE . '_nonce'])), self::NONCE)) {
            return;
        }
        if (!current_user_can('edit_post', $post_id) || !isset($_POST['dcc_dog'])) {
            return;
        }
        if (!Policies::is_imported($post_id) || Admin_Fields::booking_pet_cottage($post_id) !== true) {
            return;
        }
        $v = sanitize_key(wp_unslash($_POST['dcc_dog']));
        $had = (string) get_post_meta($post_id, self::DOG_META, true);
        if ($v === '') {
            if ($had !== '') {
                delete_post_meta($post_id, self::DOG_META);
            }
            return;
        }
        if (($v === 'yes' || $v === 'no') && $v !== $had) {
            update_post_meta($post_id, self::DOG_META, $v);
        }
    }
}
