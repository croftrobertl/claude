<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Staff booking calendar — authorization gate and gated endpoints.
 *
 * THIS IS THE ONLY PLACE GUEST PII LEAVES THE SERVER. Everything the staff
 * calendar shows that is not already public (guest names, emails, phones,
 * addresses, notes, photo ID) is served exclusively by the endpoints below,
 * and every one of them calls require_authorization() first. The page shell
 * rendered by Staff_Widget contains NO PII at all, so even if the /staff/
 * page HTML were cached or leaked, it would disclose nothing.
 *
 * AUTHORIZATION MODEL
 * -------------------
 * Two independent ways in, checked server-side on EVERY request:
 *
 *   1. A valid `wp-postpass_*` cookie for the staff page — i.e. the visitor
 *      typed the shared page password. post_password_required() re-hashes
 *      that cookie against the post's stored password on every call, so this
 *      is a real server-side check, not a client assertion.
 *   2. A logged-in user who can edit bookings (managers/admins) — they can
 *      already see all of this in wp-admin.
 *
 * FAIL-CLOSED HARDENING (not in the original spec, deliberately added):
 * post_password_required() returns FALSE for a post that has NO password.
 * A naive `! post_password_required($id)` gate would therefore swing WIDE
 * OPEN the moment someone removes the page password in the editor — the
 * single worst failure mode available here. is_authorized() explicitly
 * verifies the page still HAS a password before trusting the cookie path,
 * and falls back to the capability check alone if it does not.
 *
 * Both the page ID and the capability are filterable so this survives a page
 * rebuild without a code change.
 */
final class Staff
{
    /** /staff/ — published, password-protected, noindex. */
    public const DEFAULT_PAGE_ID = 18102;

    public const NONCE_ACTION = 'mphbac_staff';

    /** Booking statuses staff should see. Cancelled/abandoned are excluded. */
    public const VISIBLE_STATUSES = ['confirmed', 'pending', 'pending-payment', 'pending-user'];

    public static function page_id(): int
    {
        return (int) apply_filters('mphbac_staff_page_id', self::DEFAULT_PAGE_ID);
    }

    public static function capability(): string
    {
        return (string) apply_filters('mphbac_staff_capability', 'edit_mphb_bookings');
    }

    /**
     * The gate. Returns true only for a manager, or for a visitor holding a
     * valid password cookie for a staff page that actually has a password.
     */
    public static function is_authorized(): bool
    {
        // Path 2 first: it is cheap and needs no post lookup.
        if (is_user_logged_in() && current_user_can(self::capability())) {
            return true;
        }

        $page_id = self::page_id();
        if ($page_id <= 0) {
            return false;
        }
        $post = get_post($page_id);
        if (!$post || $post->post_status !== 'publish') {
            return false;
        }
        // The crux: an unprotected page makes post_password_required() return
        // false for EVERYONE. Never treat that as authorization.
        if (!is_string($post->post_password) || $post->post_password === '') {
            error_log('MPHBAC staff: page ' . $page_id . ' has no password set — cookie authorization disabled (fail-closed).');
            return false;
        }
        return !post_password_required($post);
    }

    /**
     * Verify nonce + authorization, or terminate with 403 and an empty body.
     * Never echoes anything that hints at what exists behind the gate.
     */
    private static function require_authorization(): void
    {
        self::send_private_headers();

        $nonce = isset($_REQUEST['nonce']) ? sanitize_text_field((string) wp_unslash($_REQUEST['nonce'])) : '';
        if (!wp_verify_nonce($nonce, self::NONCE_ACTION)) {
            status_header(403);
            // Distinguishable ONLY for an already-authorized-looking caller;
            // the body stays empty either way. The client turns this into
            // "reload the page" rather than a silent break.
            header('X-MPHBAC-Staff: nonce');
            exit;
        }
        if (!self::is_authorized()) {
            status_header(403);
            exit;
        }
    }

    /** No caching, ever, at any layer, and never indexed. */
    private static function send_private_headers(): void
    {
        if (headers_sent()) {
            return;
        }
        nocache_headers();
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private', true);
        header('Pragma: no-cache', true);
        header('X-Robots-Tag: noindex, nofollow', true);
    }

    public static function register(): void
    {
        // Logged-out staff (password cookie only) hit the _nopriv variants,
        // so both must be registered — the gate, not the hook, is the check.
        foreach (['month', 'booking', 'photo'] as $ep) {
            $action = 'mphbac_staff_' . $ep;
            add_action('wp_ajax_' . $action, ['\\MPHBAC\\Staff', 'handle_' . $ep]);
            add_action('wp_ajax_nopriv_' . $action, ['\\MPHBAC\\Staff', 'handle_' . $ep]);
        }
    }

    /** Calendar data for one month: bookings overlapping the range. */
    public static function handle_month(): void
    {
        self::require_authorization();

        $month = isset($_POST['month']) ? sanitize_text_field((string) wp_unslash($_POST['month'])) : '';
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            wp_send_json_error(['message' => __('Invalid month.', 'mphb-availability-calendar')], 400);
        }
        try {
            $tz    = Data_Provider::timezone();
            $first = new \DateTimeImmutable($month . '-01', $tz);
        } catch (\Throwable $e) {
            wp_send_json_error(['message' => __('Invalid month.', 'mphb-availability-calendar')], 400);
        }
        // Clamp to a sane window so this can't be used to sweep the whole
        // booking table one month at a time.
        $today = Data_Provider::today();
        if ($first < $today->modify('-3 years') || $first > $today->modify('+3 years')) {
            wp_send_json_error(['message' => __('Invalid month.', 'mphb-availability-calendar')], 400);
        }
        $last = $first->modify('last day of this month');

        wp_send_json_success(Staff_Data::month_view($first, $last));
    }

    /** Full detail for ONE booking, loaded lazily when staff tap it. */
    public static function handle_booking(): void
    {
        self::require_authorization();

        $booking_id = absint($_POST['booking_id'] ?? 0);
        if ($booking_id <= 0) {
            wp_send_json_error(['message' => __('Invalid booking.', 'mphb-availability-calendar')], 400);
        }
        $detail = Staff_Data::booking_detail($booking_id);
        if ($detail === null) {
            // Not a booking, or not a status staff may see. Same shape as any
            // other miss — no probing difference.
            wp_send_json_error(['message' => __('Booking not found.', 'mphb-availability-calendar')], 404);
        }
        wp_send_json_success($detail);
    }

    /**
     * Stream an uploaded photo ID through the gate.
     *
     * The attachment must NEVER be linked by its /uploads/ URL: those are
     * world-readable and would leak exactly the way the /guest/ Wi-Fi
     * passwords did. The client only ever receives an opaque booking-scoped
     * reference, and this proxy re-checks authorization, re-derives the file
     * path from the booking itself, and refuses anything outside the uploads
     * directory.
     */
    public static function handle_photo(): void
    {
        self::require_authorization();

        $booking_id = absint($_REQUEST['booking_id'] ?? 0);
        $field      = isset($_REQUEST['field']) ? sanitize_key((string) wp_unslash($_REQUEST['field'])) : '';
        if ($booking_id <= 0 || $field === '') {
            status_header(400);
            exit;
        }

        // Re-derive from the booking rather than trusting any client-supplied
        // path/ID: the only reachable files are ones this booking references.
        $path = Staff_Data::attachment_path_for($booking_id, $field);
        if ($path === null) {
            status_header(404);
            exit;
        }

        $uploads = wp_get_upload_dir();
        $base    = trailingslashit((string) ($uploads['basedir'] ?? ''));
        $real    = realpath($path);
        $realbase = $base !== '/' ? realpath($base) : false;
        if ($real === false || $realbase === false || strpos($real, $realbase . DIRECTORY_SEPARATOR) !== 0) {
            // Path traversal / symlink escape / file outside uploads.
            error_log('MPHBAC staff: refused out-of-uploads photo path for booking ' . $booking_id);
            status_header(404);
            exit;
        }
        if (!is_readable($real)) {
            status_header(404);
            exit;
        }

        $type = wp_check_filetype(basename($real));
        $mime = is_string($type['type'] ?? null) && $type['type'] !== '' ? $type['type'] : 'application/octet-stream';
        // Only ever hand back image/PDF; anything else downloads rather than
        // rendering, so a mislabelled upload can't execute in the browser.
        $inline = in_array($mime, ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'], true);

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($real));
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="id-' . $booking_id . '.' . pathinfo($real, PATHINFO_EXTENSION) . '"');
        header('X-Content-Type-Options: nosniff');
        header('Content-Security-Policy: default-src \'none\'; img-src \'self\'; object-src \'none\'; sandbox');
        readfile($real);
        exit;
    }
}
