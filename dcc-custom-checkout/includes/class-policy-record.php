<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The checkout's acceptance box and the acceptance record (v0.30.0, owner's
 * picks 2026-10-07: "One box, both links" / "Yes, record it").
 *
 * LABEL. MotoPress renders the box in CheckoutView::renderTermsAndConditions,
 * hooked at mphb_sc_checkout_form priority 60, printing
 * printf(_x("I've read and accept the %s", …), $link) (Director, MotoPress
 * 6.1.0 on live). This swaps that one string for the two-link sentence ONLY
 * between priorities 59 and 61 of that one action — every other use of the
 * same msgid anywhere keeps MotoPress's wording — and only when both policy
 * pages are published; otherwise MotoPress's label stands exactly.
 *
 * RECORD. On a public-checkout booking (mphb_create_booking_by_user), one meta
 * row: when, whether the tick reached the server, the label shown, and each
 * policy page's ID + SHA-256 fingerprint + post_modified_gmt, with one stored
 * copy per distinct version (Policies::capture()). It is written ONCE, at
 * creation, never over an existing row, and never to an existing booking.
 * No guest personal data: nothing here is about the guest but the time.
 *
 * WHAT THIS DOES NOT DO: enforce the tick server-side. MotoPress does not, and
 * if the tick does not reach the server, enforcing it would refuse real
 * bookings (owner's instruction). "not_received" is recorded as such and the
 * screen never calls it "accepted".
 */
final class Policy_Record
{
    public const META       = '_dcc_policy_acceptance';
    public const STAFF_META = '_dcc_policy_staff';

    private const BOOKING_TYPE = 'mphb_booking';

    /** The submission's tick, as seen on MotoPress's REST checkout route. */
    private static bool $rest_seen = false;
    private static bool $rest_tick = false;

    public function register(): void
    {
        add_action('init', [self::class, 'register_type']);

        add_action('mphb_sc_checkout_form', [$this, 'label_on'], 59, 0);
        add_action('mphb_sc_checkout_form', [$this, 'label_off'], 61, 0);

        add_filter('rest_request_before_callbacks', [$this, 'capture_rest'], 5, 3);
        add_action('mphb_create_booking_by_user', [$this, 'on_booking_created'], 10, 1);
        add_action('wp_insert_post', [$this, 'mark_staff'], 10, 3);

        add_action('add_meta_boxes', [$this, 'add_box']);
        add_action('admin_post_dcc_policy_version', [$this, 'render_version']);
    }

    public static function register_type(): void
    {
        register_post_type(Policies::VERSION_TYPE, [
            'label'               => __('Policy versions', 'dcc-checkout'),
            'public'              => false,
            'show_ui'             => false,
            'show_in_rest'        => false,
            'exclude_from_search' => true,
            'publicly_queryable'  => false,
            'query_var'           => false,
            'rewrite'             => false,
            'supports'            => ['title'],
        ]);
    }

    /* --------------------------------------------------------------- label */

    public function label_on(): void
    {
        if (Policies::label_links() !== null) {
            add_filter('gettext_with_context', [$this, 'swap_label'], 10, 4);
        }
    }

    public function label_off(): void
    {
        remove_filter('gettext_with_context', [$this, 'swap_label'], 10);
    }

    /**
     * @param string $translation
     * @param string $text
     * @param string $context
     * @param string $domain
     */
    public function swap_label($translation, $text, $context, $domain = '')
    {
        if ($text !== Policies::MP_LABEL_TEXT || $context !== Policies::MP_LABEL_CONTEXT) {
            return $translation;
        }
        $links = Policies::label_links();
        if ($links === null) {
            return $translation;
        }
        // MotoPress passes this through printf() with its own link as the one
        // argument: ours has no placeholder (the extra argument is ignored),
        // and any '%' in a URL is doubled so printf prints it literally.
        return str_replace('%', '%%', Policies::label_html($links));
    }

    /* -------------------------------------------------------------- record */

    /** Is this an admin screen's request? (The same test the Extras rename uses.) */
    private static function from_admin(): bool
    {
        $referer = (string) wp_get_referer();
        return $referer !== '' && strpos($referer, admin_url()) === 0;
    }

    /** Did the submission carry a ticked box? Only MotoPress's own field names. */
    public static function tick_in(array $params): bool
    {
        foreach (['mphb_accept_terms', 'accept_terms'] as $k) {
            if (isset($params[$k]) && !is_array($params[$k])) {
                $v = strtolower(trim((string) $params[$k]));
                if ($v !== '' && $v !== '0' && $v !== 'false' && $v !== 'off') {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Note what the REST checkout submission carried, before MotoPress's
     * controller runs and fires mphb_create_booking_by_user in the same
     * request. Observes only: always returns $response unchanged.
     */
    public function capture_rest($response, $handler, $request)
    {
        if ($request instanceof \WP_REST_Request
            && $request->get_method() === 'POST'
            && Rest_Guard::route_matches((string) $request->get_route())) {
            self::$rest_seen = true;
            $params = $request->get_params();
            self::$rest_tick = is_array($params) && self::tick_in($params);
        }
        return $response;
    }

    /** @param mixed $booking MotoPress booking entity (or an ID). */
    private static function booking_id($booking): int
    {
        if (is_object($booking) && method_exists($booking, 'getId')) {
            return (int) $booking->getId();
        }
        return is_numeric($booking) ? (int) $booking : 0;
    }

    /**
     * mphb_create_booking_by_user. Online only: MotoPress's REST checkout route
     * (or a plain front-end form post), NOT referred from wp-admin. A booking
     * an admin screen created is marked as staff-entered instead.
     *
     * @param mixed $booking
     */
    public function on_booking_created($booking): void
    {
        $id = self::booking_id($booking);
        if ($id <= 0) {
            return;
        }
        if (self::from_admin()) {
            self::write_staff($id);
            return;
        }
        $rest = defined('REST_REQUEST') && REST_REQUEST;
        if (self::$rest_seen) {
            $tick = self::$rest_tick;
        } elseif (!$rest && !is_admin()) {
            $tick = self::tick_in(wp_unslash($_POST)); // phpcs:ignore WordPress.Security.NonceVerification -- read-only; MotoPress's own submission
        } else {
            return; // not a channel this can vouch for — write nothing
        }
        self::write_record($id, $tick);
    }

    /** Build and store the record. Never over an existing one. */
    public static function write_record(int $booking_id, bool $tick): bool
    {
        if (get_post_meta($booking_id, self::META, true) !== '') {
            return false;
        }
        $links    = Policies::label_links();
        $policies = [];
        $terms    = Policies::capture(Policies::terms_page_id());
        if ($terms !== null) {
            $policies[] = ['role' => 'terms'] + $terms;
        }
        if ($links !== null) {
            $refund = Policies::capture($links['refund_id']);
            if ($refund !== null) {
                $policies[] = ['role' => 'refund'] + $refund;
            }
        }
        $record = [
            'v'        => 1,
            'channel'  => 'online',
            'at_gmt'   => gmdate('Y-m-d H:i:s'),
            'tick'     => $tick ? 'received' : 'not_received',
            'label'    => Policies::label_text($links),
            'policies' => $policies,
        ];
        return (bool) add_post_meta($booking_id, self::META, wp_slash($record), true);
    }

    private static function write_staff(int $booking_id): void
    {
        if (get_post_meta($booking_id, self::META, true) === '') {
            add_post_meta($booking_id, self::STAFF_META, '1', true);
        }
    }

    /**
     * A booking CREATED (never updated) by an ordinary wp-admin screen request
     * — the Add New wizard — is staff-entered. AJAX, cron and REST are not
     * screens; an iCal import running in one is never marked.
     *
     * @param int $post_id
     * @param mixed $post
     * @param bool $update
     */
    public function mark_staff($post_id, $post, $update): void
    {
        if ($update || !$post instanceof \WP_Post || $post->post_type !== self::BOOKING_TYPE) {
            return;
        }
        if (!is_admin() || wp_doing_ajax() || wp_doing_cron() || (defined('REST_REQUEST') && REST_REQUEST)) {
            return;
        }
        if (!current_user_can('edit_posts')) {
            return;
        }
        self::write_staff((int) $post_id);
    }

    /* ------------------------------------------------------------- display */

    public function add_box(): void
    {
        add_meta_box(
            'dcc-checkout-policies',
            __('Policies', 'dcc-checkout'),
            [$this, 'render_box'],
            self::BOOKING_TYPE,
            'side',
            'default'
        );
    }

    /** @param mixed $post */
    public function render_box($post): void
    {
        if (!$post instanceof \WP_Post || !current_user_can('edit_post', $post->ID)) {
            return;
        }
        echo self::box_html((int) $post->ID); // phpcs:ignore WordPress.Security.EscapeOutput -- built escaped in box_html()
    }

    /** The box's content, escaped. Read only: nothing here writes. */
    public static function box_html(int $booking_id): string
    {
        $r = get_post_meta($booking_id, self::META, true);
        if (is_array($r) && isset($r['at_gmt'])) {
            return self::record_html($r);
        }
        if (Policies::is_imported($booking_id)) {
            $line = __('Imported booking — not accepted on this site', 'dcc-checkout');
        } elseif ((string) get_post_meta($booking_id, self::STAFF_META, true) === '1') {
            $line = __('Entered by staff — not accepted online', 'dcc-checkout');
        } else {
            $line = __('No online acceptance on record', 'dcc-checkout');
        }
        return '<p class="dcc_policy-line">' . esc_html($line) . '</p>';
    }

    private static function record_html(array $r): string
    {
        $ts   = strtotime((string) $r['at_gmt'] . ' UTC');
        $when = $ts ? wp_date('M j, Y, g:i a T', $ts) : (string) $r['at_gmt'];
        $received = ($r['tick'] ?? '') === 'received';

        $names = [
            'terms'  => __('Terms & Conditions', 'dcc-checkout'),
            'refund' => __('Cancellation & Refund Policy', 'dcc-checkout'),
        ];
        $items = [];
        foreach ((array) ($r['policies'] ?? []) as $p) {
            if (!is_array($p) || !isset($p['sha256'], $p['role'])) {
                continue;
            }
            $sha   = (string) $p['sha256'];
            $copy  = Policies::find_version($sha);
            $state = $copy === null
                ? esc_html__('copy missing', 'dcc-checkout')
                : ($copy['intact']
                    ? sprintf('<a href="%s" target="_blank" rel="noopener">%s</a>',
                        esc_url(admin_url('admin-post.php?action=dcc_policy_version&sha=' . $sha)),
                        esc_html__('saved — view', 'dcc-checkout'))
                    : esc_html__('saved copy does not match its fingerprint', 'dcc-checkout'));
            $items[] = sprintf(
                /* translators: 1: policy name, 2: short version fingerprint, 3: "saved — view" link or a status. */
                esc_html__('%1$s (version %2$s…, %3$s)', 'dcc-checkout'),
                esc_html($names[$p['role']] ?? (string) $p['role']),
                esc_html(substr($sha, 0, 8)),
                $state
            );
        }
        $policies = $items ? implode('; ', $items) : esc_html__('no policy page could be read', 'dcc-checkout');

        $head = $received
            /* translators: %s: date and time. */
            ? sprintf(esc_html__('Policies accepted online: %s', 'dcc-checkout'), esc_html($when))
            /* translators: %s: date and time. */
            : sprintf(esc_html__('Booked online: %s. The acceptance tick did not reach the server, so this is not recorded as accepted. The box is required on the checkout page.', 'dcc-checkout'), esc_html($when));

        return '<p class="dcc_policy-line"><strong>' . $head . '</strong></p>'
            . '<p class="dcc_policy-policies">' . $policies . '</p>'
            . '<p class="description">' . esc_html__('Label shown:', 'dcc-checkout') . ' “' . esc_html((string) ($r['label'] ?? '')) . '”</p>';
    }

    /** admin-post.php?action=dcc_policy_version&sha=… — the saved text, read only. */
    public function render_version(): void
    {
        if (!current_user_can('edit_posts')) {
            wp_die(esc_html__('You are not allowed to view this.', 'dcc-checkout'), '', ['response' => 403]);
        }
        $sha  = isset($_GET['sha']) ? strtolower(sanitize_text_field(wp_unslash($_GET['sha']))) : ''; // phpcs:ignore WordPress.Security.NonceVerification -- read only
        $copy = Policies::find_version($sha);
        if ($copy === null) {
            wp_die(esc_html__('No saved copy with that fingerprint.', 'dcc-checkout'), '', ['response' => 404]);
        }
        $b = json_decode($copy['bundle'], true);
        $title = is_array($b) ? (string) ($b['title'] ?? '') : '';
        nocache_headers();
        if (!headers_sent()) {
            header('Content-Type: text/html; charset=utf-8');
        }
        echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            . '<title>' . esc_html($title) . '</title>'
            . '<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1d2327}'
            . '.meta{background:#f6f7f7;border:1px solid #dcdcde;padding:8px 12px;font-size:13px}pre{white-space:pre-wrap;word-break:break-all;font-size:12px}</style>'
            . '</head><body>';
        echo '<div class="meta"><strong>' . esc_html__('Saved policy text', 'dcc-checkout') . '</strong><br>'
            . esc_html__('Fingerprint (SHA-256):', 'dcc-checkout') . ' <code>' . esc_html($sha) . '</code><br>'
            . esc_html__('Saved:', 'dcc-checkout') . ' ' . esc_html($copy['captured_gmt']) . ' UTC<br>'
            . ($copy['intact']
                ? esc_html__('This copy matches its fingerprint.', 'dcc-checkout')
                : '<strong>' . esc_html__('This copy does NOT match its fingerprint.', 'dcc-checkout') . '</strong>')
            . '</div>';
        echo '<h1>' . esc_html($title) . '</h1>';
        echo Policies::readable_html($copy['bundle']); // phpcs:ignore WordPress.Security.EscapeOutput -- wp_kses_post / esc_html inside
        echo '<details><summary>' . esc_html__('Exact stored data', 'dcc-checkout') . '</summary><pre>'
            . esc_html($copy['bundle']) . '</pre></details>';
        echo '</body></html>';
        // No exit: admin-post.php prints nothing after its handler returns.
    }
}
