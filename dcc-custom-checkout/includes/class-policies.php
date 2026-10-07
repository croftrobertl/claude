<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The two policy pages the checkout's acceptance box links to, the label it
 * shows, and the stored copies of each version a guest was shown (v0.30.0).
 *
 * OWNER'S STANDING RULE: the cancellation/refund terms are written ONLY on the
 * policy page. Nothing here — label, settings default, record, admin screen —
 * may restate them: no time limits, no amounts, no conditions of any kind. Every
 * other surface LINKS to the page.
 *
 * Pure helpers on purpose: the label, the fingerprint and the version store
 * are tested directly in tests/policy/ without loading the hooks.
 */
final class Policies
{
    /** Private post type holding one copy of each distinct policy version. */
    public const VERSION_TYPE = 'dcc_policy_version';

    /** On a version post: the exact bundle the fingerprint was taken of (JSON). */
    public const META_BUNDLE = '_dcc_pv_bundle';
    public const META_SHA    = '_dcc_pv_sha256';

    /** MotoPress's own label, as the Director read it in 6.1.0 (checkout-view.php). */
    public const MP_LABEL_TEXT    = "I've read and accept the %s";
    public const MP_LABEL_CONTEXT = "I've read and accept the <tag>terms & conditions</tag>";
    public const MP_LINK_TEXT     = 'terms & conditions';
    public const MP_LINK_CONTEXT  = "I've read and accept the terms & conditions";

    /** MotoPress's Terms & Conditions page setting (live: page 2515). */
    public static function terms_page_id(): int
    {
        return (int) get_option('mphb_terms_and_conditions_page', 0);
    }

    /** Is this a published page? (The only state a guest can open.) */
    public static function published(int $page_id): bool
    {
        if ($page_id <= 0) {
            return false;
        }
        $post = get_post($page_id);
        return $post instanceof \WP_Post && $post->post_status === 'publish';
    }

    /**
     * The two links, or null when the label must stay MotoPress's own: either
     * page missing or not published ([Director] default), or a URL that cannot
     * be built. Never a hard-coded URL — both come from page IDs.
     *
     * @return array{terms_id:int,terms_url:string,refund_id:int,refund_url:string}|null
     */
    public static function label_links(): ?array
    {
        $terms  = self::terms_page_id();
        $refund = Config::refund_page_id();
        if (!self::published($terms) || !self::published($refund)) {
            return null;
        }
        $tu = (string) get_permalink($terms);
        $ru = (string) get_permalink($refund);
        if ($tu === '' || $ru === '') {
            return null;
        }
        return ['terms_id' => $terms, 'terms_url' => $tu, 'refund_id' => $refund, 'refund_url' => $ru];
    }

    /** The checkbox label, as HTML: one sentence, two links, each in a new tab. */
    public static function label_html(array $links): string
    {
        $a = static function (string $url, string $text): string {
            return sprintf('<a href="%s" target="_blank" rel="noopener">%s</a>', esc_url($url), esc_html($text));
        };
        return sprintf(
            /* translators: 1: "Terms & Conditions" link, 2: "Cancellation & Refund Policy" link. */
            esc_html__("I've read and accept the %1\$s and the %2\$s.", 'dcc-checkout'),
            $a($links['terms_url'], __('Terms & Conditions', 'dcc-checkout')),
            $a($links['refund_url'], __('Cancellation & Refund Policy', 'dcc-checkout'))
        );
    }

    /**
     * The label a guest was shown, as plain text — what the acceptance record
     * keeps. With no links (fallback), MotoPress's own wording, translated by
     * MotoPress's own text domain exactly as it renders it.
     */
    public static function label_text(?array $links): string
    {
        if ($links !== null) {
            return sprintf(
                /* translators: 1: "Terms & Conditions", 2: "Cancellation & Refund Policy". */
                __("I've read and accept the %1\$s and the %2\$s.", 'dcc-checkout'),
                __('Terms & Conditions', 'dcc-checkout'),
                __('Cancellation & Refund Policy', 'dcc-checkout')
            );
        }
        return sprintf(
            _x(self::MP_LABEL_TEXT, self::MP_LABEL_CONTEXT, 'motopress-hotel-booking'), // phpcs:ignore WordPress.WP.I18n
            _x(self::MP_LINK_TEXT, self::MP_LINK_CONTEXT, 'motopress-hotel-booking')   // phpcs:ignore WordPress.WP.I18n
        );
    }

    /**
     * What a policy version IS: the page's title, its post_content and its
     * Elementor data. post_modified cannot be trusted as a version — the
     * Director found CLI edits to _elementor_data that do not bump it — so the
     * fingerprint is taken of the content itself. The page ID is part of it,
     * so two pages can never share a stored copy.
     */
    public static function bundle_json(\WP_Post $page): string
    {
        return (string) wp_json_encode([
            'page_id'        => (int) $page->ID,
            'title'          => (string) $page->post_title,
            'content'        => (string) $page->post_content,
            'elementor_data' => (string) get_post_meta((int) $page->ID, '_elementor_data', true),
        ]);
    }

    public static function fingerprint(string $bundle_json): string
    {
        return hash('sha256', $bundle_json);
    }

    /**
     * Fingerprint a policy page NOW and make sure one copy of that version is
     * stored. Returns what the booking record keeps, or null if the page does
     * not exist.
     *
     * @return array{id:int,sha256:string,modified_gmt:string,saved:bool}|null
     */
    public static function capture(int $page_id): ?array
    {
        $page = $page_id > 0 ? get_post($page_id) : null;
        if (!$page instanceof \WP_Post) {
            return null;
        }
        $json = self::bundle_json($page);
        $sha  = self::fingerprint($json);
        $saved = self::find_version($sha) !== null || self::store_version($sha, $json, $page);
        return [
            'id'           => (int) $page->ID,
            'sha256'       => $sha,
            'modified_gmt' => (string) $page->post_modified_gmt,
            'saved'        => $saved,
        ];
    }

    /**
     * Store one version. The bundle goes into post META, not post_content:
     * content passes through kses on insert for an anonymous guest's request,
     * which would alter the text and break the fingerprint. Meta is slashed
     * first because update_post_meta() unslashes — Elementor's JSON is full of
     * backslashes. The write is then READ BACK and re-hashed; a copy that does
     * not hash to its own fingerprint is not reported as saved.
     */
    private static function store_version(string $sha, string $json, \WP_Post $page): bool
    {
        $id = wp_insert_post([
            'post_type'   => self::VERSION_TYPE,
            'post_status' => 'private',
            'post_title'  => (string) $page->post_title,
            'post_name'   => $sha,
        ], true);
        if (is_wp_error($id) || (int) $id <= 0) {
            return false;
        }
        $id = (int) $id;
        add_post_meta($id, self::META_SHA, $sha, true);
        add_post_meta($id, self::META_BUNDLE, wp_slash($json), true);
        add_post_meta($id, '_dcc_pv_page_id', (int) $page->ID, true);
        add_post_meta($id, '_dcc_pv_modified_gmt', (string) $page->post_modified_gmt, true);
        add_post_meta($id, '_dcc_pv_captured_gmt', gmdate('Y-m-d H:i:s'), true);
        $back = (string) get_post_meta($id, self::META_BUNDLE, true);
        return self::fingerprint($back) === $sha;
    }

    /**
     * The stored copy of a version, or null.
     *
     * @return array{post_id:int,bundle:string,intact:bool,captured_gmt:string}|null
     */
    public static function find_version(string $sha): ?array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $sha)) {
            return null;
        }
        $ids = get_posts([
            'post_type'        => self::VERSION_TYPE,
            'post_status'      => 'any',
            'meta_key'         => self::META_SHA,
            'meta_value'       => $sha,
            'numberposts'      => 1,
            'orderby'          => 'ID',
            'order'            => 'ASC',
            'fields'           => 'ids',
            'suppress_filters' => false,
        ]);
        if (!is_array($ids) || empty($ids)) {
            return null;
        }
        $vid    = (int) $ids[0];
        $bundle = (string) get_post_meta($vid, self::META_BUNDLE, true);
        return [
            'post_id'      => $vid,
            'bundle'       => $bundle,
            'intact'       => $bundle !== '' && self::fingerprint($bundle) === $sha,
            'captured_gmt' => (string) get_post_meta($vid, '_dcc_pv_captured_gmt', true),
        ];
    }

    /**
     * Readable HTML of a stored version, for the admin viewer. Elementor pages:
     * headings and text-editor content in page order; otherwise post_content.
     * Everything through wp_kses_post — this is display, never re-execution.
     */
    public static function readable_html(string $bundle_json): string
    {
        $b = json_decode($bundle_json, true);
        if (!is_array($b)) {
            return '';
        }
        $out  = '';
        $data = json_decode((string) ($b['elementor_data'] ?? ''), true);
        if (is_array($data) && $data !== []) {
            $walk = static function (array $nodes) use (&$walk, &$out): void {
                foreach ($nodes as $n) {
                    if (!is_array($n)) {
                        continue;
                    }
                    $s = isset($n['settings']) && is_array($n['settings']) ? $n['settings'] : [];
                    if (isset($s['title']) && is_string($s['title']) && $s['title'] !== '') {
                        $out .= '<h3>' . esc_html(wp_strip_all_tags($s['title'])) . '</h3>';
                    }
                    foreach (['editor', 'text', 'description_text'] as $k) {
                        if (isset($s[$k]) && is_string($s[$k]) && $s[$k] !== '') {
                            $out .= '<div>' . wp_kses_post($s[$k]) . '</div>';
                        }
                    }
                    if (isset($n['elements']) && is_array($n['elements'])) {
                        $walk($n['elements']);
                    }
                }
            };
            $walk($data);
        }
        if ($out === '') {
            $out = wpautop(wp_kses_post((string) ($b['content'] ?? '')));
        }
        return $out;
    }

    /**
     * Was this booking imported from an OTA calendar? The Availability
     * Calendar's live reader (class-staff-data.php source_for()): MotoPress's
     * `mphb_ical_prodid` on the booking, or on one of its reserved rooms.
     * Read only.
     */
    public static function is_imported(int $booking_id): bool
    {
        if ((string) get_post_meta($booking_id, 'mphb_ical_prodid', true) !== '') {
            return true;
        }
        $rooms = get_posts([
            'post_type'        => 'mphb_reserved_room',
            'post_parent'      => $booking_id,
            'post_status'      => 'any',
            'numberposts'      => 5,
            'fields'           => 'ids',
            'suppress_filters' => false,
        ]);
        foreach ((array) $rooms as $rid) {
            if ((string) get_post_meta((int) $rid, 'mphb_ical_prodid', true) !== '') {
                return true;
            }
        }
        return false;
    }
}
