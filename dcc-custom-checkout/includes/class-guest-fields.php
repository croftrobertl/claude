<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Part C — additional-guest details, server side.
 *
 * The visible show/hide + "required" behaviour is done in the browser
 * (assets/checkout.js). This class is the backstop that can't be bypassed by
 * editing the DOM: once the guest count reaches a group's threshold, that
 * group's fields must all be filled — guest 2: first/last name + phone;
 * guests 3 and 4: first/last name only (see Config::guest_field_groups()).
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
        // Never redirect during an AJAX submission — it would break the JSON
        // response MotoPress expects. Client-side validation is the guard there.
        // Never interfere with wp-admin either: MotoPress's admin booking
        // screens may POST a room_details shape, and admins are allowed to
        // override rules ("skip booking rules for admin" is on for this site).
        if (wp_doing_ajax() || is_admin()) {
            return;
        }
        // On the checkout REST route, Rest_Guard enforces the same rule with a
        // proper JSON error instead of a 302; stand down here.
        if (Checkout_Request::defer_to_rest()) {
            return;
        }

        if ($this->find_violation() !== null) {
            Checkout_Request::redirect_back_with_error('guest2');
        }
    }

    /**
     * Shared validator — transport-agnostic (reads via Checkout_Request, which
     * serves $_POST or the parsed REST payload alike). Returns the error code
     * ('guest2') or null when the submission is fine.
     */
    public function find_violation(): ?string
    {
        $adults = $this->posted_adults();

        // Each per-guest detail group (guest 2: name + phone; guests 3/4: name
        // only) is required once the guest count reaches its threshold. Fields
        // are NATIVE Checkout Fields inside `customer_fields`; we enforce only
        // fields actually present — if the owner hasn't enabled them, they
        // won't submit and we must not reject on their absence.
        foreach (Config::guest_field_groups() as $group) {
            if ($adults < $group['min']) {
                continue;
            }
            $missing_any = false;
            $found_any   = false;
            foreach ($group['names'] as $name) {
                $value = Checkout_Request::customer_field_value($name);
                if ($value === null) {
                    continue; // Field not rendered / not submitted.
                }
                $found_any = true;
                if (trim($value) === '') {
                    $missing_any = true;
                }
            }
            if ($found_any && $missing_any) {
                return 'guest2';
            }
        }

        return null;
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
