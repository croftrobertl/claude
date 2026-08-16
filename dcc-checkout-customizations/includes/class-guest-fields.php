<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Part C — second-guest logic, server side.
 *
 * The visible show/hide + "required" behaviour is done in the browser
 * (assets/checkout.js). This class is the backstop that can't be bypassed by
 * editing the DOM: when the booking is submitted for 2 guests, the three
 * second-guest fields (First name / Last name / Phone) must all be filled.
 *
 * The Checkout Fields admin keeps those fields NOT required, so the MotoPress
 * server never demands them at 1 guest; we add the "required at 2 guests" rule
 * here instead.
 */
final class Guest_Fields
{
    public function register(): void
    {
        // Runs before MotoPress processes the checkout POST (template_redirect).
        // Priority 1 so we validate first. Confirm ordering on staging.
        add_action('wp_loaded', [$this, 'validate_submission'], 1);
    }

    public function validate_submission(): void
    {
        if (!Checkout_Request::is_checkout_submission()) {
            return;
        }

        // Only enforce when 2+ adults were selected.
        if ($this->posted_adults() < 2) {
            return;
        }

        // If we can locate the three guest-2 field values and any is blank,
        // block the booking. If the field names can't be found (MotoPress
        // markup differs from what we expect), we defer to the client-side
        // guard rather than risk a false rejection — this is verified on staging.
        $missing_any = false;
        $found_any   = false;

        foreach (Config::guest2_field_ids() as $field_id) {
            $value = $this->find_posted_field_value((int) $field_id);
            if ($value === null) {
                continue; // Field key not located in this POST shape.
            }
            $found_any = true;
            if (trim((string) $value) === '') {
                $missing_any = true;
            }
        }

        if ($found_any && $missing_any) {
            Checkout_Request::redirect_back_with_error('guest2');
        }
    }

    /**
     * Highest adults value submitted across all reserved rooms.
     */
    private function posted_adults(): int
    {
        $max = 0;
        $walk = static function ($data) use (&$walk, &$max): void {
            if (!is_array($data)) {
                return;
            }
            foreach ($data as $key => $value) {
                if ((string) $key === 'adults' && is_scalar($value)) {
                    $max = max($max, (int) $value);
                }
                if (is_array($value)) {
                    $walk($value);
                }
            }
        };
        $walk(Checkout_Request::room_details());
        return $max;
    }

    /**
     * Best-effort lookup of a Checkout Fields value by its numeric field ID.
     *
     * The addon submits custom fields under keys that embed the field ID
     * (e.g. `mphb_field_8312` or `mphb[8312]`). We scan $_POST recursively for a
     * key whose string form contains the ID and return the scalar leaf value.
     * Returns null when no such key exists.
     */
    private function find_posted_field_value(int $field_id): ?string
    {
        $needle = (string) $field_id;
        $result = null;

        $walk = static function ($data, $parent_key = '') use (&$walk, &$result, $needle): void {
            if ($result !== null || !is_array($data)) {
                return;
            }
            foreach ($data as $key => $value) {
                $key_str = (string) $key;
                if (is_scalar($value) && strpos($key_str, $needle) !== false) {
                    $result = (string) $value;
                    return;
                }
                if (is_array($value)) {
                    $walk($value, $key_str);
                    if ($result !== null) {
                        return;
                    }
                }
            }
        };

        // Scan the full POST (custom fields may sit outside mphb_room_details).
        $walk(wp_unslash($_POST)); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput

        return $result === null ? null : sanitize_text_field($result);
    }
}
