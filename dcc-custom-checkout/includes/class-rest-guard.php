<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * REST-pipeline enforcement for all three backstops (2026-08-30 audit fix).
 *
 * MotoPress's public route POST /mphb/v1/checkout accepts application/json as
 * well as multipart form data. JSON leaves $_POST empty, so the wp_loaded
 * backstops (which read $_POST) were silently skipped — a crafted JSON request
 * could create a 3–4 guest booking with no extra-guest fee (and likewise dodge
 * the pet and guest-2 rules). This class closes that hole properly, replacing
 * the mu-plugin stopgap (dcc-checkout-rest-guard.php) that blanket-400s JSON:
 * a LEGITIMATE JSON checkout that carries the correct services now succeeds.
 *
 * Hook choice: rest_request_before_callbacks — core WP, fires after the request
 * body is parsed into the WP_REST_Request (so get_params() serves the parsed
 * body for BOTH content types, already unslashed) and before the route callback
 * runs, i.e. before the booking exists. Independent of MotoPress internals, so
 * it holds across MotoPress versions. Returning a WP_Error short-circuits the
 * callback and core emits a proper JSON error the checkout fetch() can display
 * — not the 302 the redirect path produced (audit finding 2).
 *
 * The wp_loaded backstops stay fully active for any non-REST form post; they
 * stand down (Checkout_Request::defer_to_rest()) only on this route, and only
 * because this guard is registered to enforce here.
 */
final class Rest_Guard
{
    /** MotoPress checkout REST route (filterable for version drift). */
    private const ROUTE = '/mphb/v1/checkout';

    private static bool $registered = false;

    /**
     * The route fragment both this guard and Checkout_Request::defer_to_rest()
     * test against. CRITICAL: the two MUST use identical matching semantics —
     * if the wp_loaded backstops stand down for a request this guard does not
     * then enforce, the submission is unguarded entirely. Both use a substring
     * test on this fragment for that reason.
     */
    public static function route_fragment(): string
    {
        return (string) apply_filters('dcc_checkout_rest_route', self::ROUTE);
    }

    /** Does this route string identify the checkout submission endpoint? */
    public static function route_matches(string $route): bool
    {
        $fragment = self::route_fragment();
        return $fragment !== '' && strpos($route, $fragment) !== false;
    }

    public function register(): void
    {
        add_filter('rest_request_before_callbacks', [$this, 'intercept'], 10, 3);
        self::$registered = true;
    }

    /** Whether the guard is armed (defer_to_rest() keys off this). */
    public static function is_registered(): bool
    {
        return self::$registered;
    }

    /**
     * Validate a checkout REST submission before MotoPress creates the booking.
     *
     * @param mixed $response Result to short-circuit with (null = proceed).
     * @param mixed $handler  Route handler (unused).
     * @param mixed $request  The WP_REST_Request.
     * @return mixed WP_Error to reject, otherwise $response unchanged.
     */
    public function intercept($response, $handler, $request)
    {
        if (!($request instanceof \WP_REST_Request) || $response !== null) {
            return $response;
        }
        if ($request->get_method() !== 'POST') {
            return $response;
        }
        // Substring match, mirroring defer_to_rest() exactly (see route_matches).
        // Over-matching is harmless: a request without room_details makes every
        // validator a no-op. Under-matching would be a bypass.
        if (!self::route_matches((string) $request->get_route())) {
            return $response;
        }
        // NOTE: no capability exemption here — this is the public booking
        // pipeline (the wp-admin exemption elsewhere covers admin screens, and
        // exempting logged-in users would unguard the owner's own test bookings).

        $params = $request->get_params();
        if (!is_array($params)) {
            return $response;
        }

        Checkout_Request::set_payload($params);
        try {
            $code = (new Guest_Fields())->find_violation()
                ?? (new Pet_Service())->find_violation()
                ?? (new Extra_Guest_Service())->find_violation();
        } finally {
            Checkout_Request::clear_payload();
        }

        if ($code === null) {
            return $response;
        }

        return new \WP_Error(
            'dcc_checkout_' . $code,
            self::message_for($code),
            [
                'status'             => 422,
                'dcc_checkout_error' => $code,
            ]
        );
    }

    /**
     * User-facing message per violation code — same strings the front-end
     * banner uses, so both transports speak with one voice.
     */
    private static function message_for(string $code): string
    {
        switch ($code) {
            case 'guest2':
                return __('Please complete the details for every additional guest.', 'dcc-checkout');
            case 'pet':
                return __('There was a problem applying the pet fee. Please review the "Traveling with a dog?" section and try again.', 'dcc-checkout');
            case 'guests':
                return __('There was a problem applying the extra-guest fee. Please review the number of guests and try again.', 'dcc-checkout');
        }
        return __('Please review your entries and try again.', 'dcc-checkout');
    }
}
