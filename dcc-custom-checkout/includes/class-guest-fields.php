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

        // Guest-2 fields are posted by NAME (verified live). Enforce required
        // only for fields actually present in the POST — if the owner hasn't
        // enabled them in Checkout Fields, they won't render or submit, and we
        // must not reject on their absence.
        $missing_any = false;
        $found_any   = false;

        foreach (Config::guest2_field_names() as $name) {
            if (!isset($_POST[$name])) {
                continue; // Field not rendered / not submitted.
            }
            $found_any = true;
            $value     = sanitize_text_field(wp_unslash($_POST[$name])); // phpcs:ignore WordPress.Security.NonceVerification.Missing
            if (trim($value) === '') {
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
}
