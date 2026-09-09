<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Enqueues the checkout CSS + JS — on the MotoPress checkout page only — and
 * passes the (filterable) config plus i18n strings down to the browser.
 */
final class Assets
{
    public function register(): void
    {
        add_action('wp_enqueue_scripts', [$this, 'enqueue']);

        // 2026-08-30 polish, item 1: MotoPress's "Accommodation Type:" label
        // (rendered on the checkout as the accommodation row heading) becomes
        // "Accommodation:". Filtered on the msgid, so the site's Loco Translate
        // override for the same msgid is bypassed — that override should be
        // deleted so the string has a single owner (this plugin).
        add_filter('gettext_motopress-hotel-booking', [$this, 'filter_accommodation_label'], 20, 3);
    }

    /**
     * Rewrite MotoPress's own wording on the checkout page only.
     *
     * @param mixed  $translation Translated string (post-MO, post-Loco).
     * @param mixed  $text        Original msgid.
     * @param mixed  $domain      Text domain (already motopress-hotel-booking
     *                            via the domain-specific hook).
     * @return mixed
     */
    public function filter_accommodation_label($translation, $text, $domain = '')
    {
        $map = apply_filters('dcc_checkout_string_overrides', [
            'Accommodation Type:' => __('Accommodation:', 'dcc-checkout'),
            // "Service" is MotoPress's word, not the owner's: the pet fee and
            // the extra-guest fee are not services a guest chose from a menu —
            // they follow from answers already given. Relabelled in the price
            // breakdown. A msgid MotoPress doesn't actually use simply never
            // matches, so a wrong guess here is a no-op, not a bug.
            'Services'       => __('Extras', 'dcc-checkout'),
            'Services:'      => __('Extras:', 'dcc-checkout'),
            'Service'        => __('Item', 'dcc-checkout'),
            'Services Total' => __('Extras Total', 'dcc-checkout'),
        ]);
        if (!isset($map[$text])) {
            return $translation;
        }
        // is_page() is only reliable once the main query exists; the checkout
        // template renders long after 'wp', so earlier fires pass through
        // untouched (also keeps search results / admin / emails unaffected).
        if (!did_action('wp') || !self::is_checkout_page()) {
            return $translation;
        }
        return $map[$text];
    }

    /**
     * Detect the MotoPress checkout page.
     *
     * MotoPress stores the checkout page ID in its settings; the checkout
     * Elementor widget lives on that page (/submit-booking/, ID 1399 on this
     * site). We trust the configured ID rather than sniffing markup so we never
     * load on the wrong page.
     */
    public static function is_checkout_page(): bool
    {
        // Never in admin / feeds / REST.
        if (is_admin() || wp_doing_ajax()) {
            return false;
        }

        $checkout_id = 0;
        if (function_exists('MPHB')) {
            try {
                $checkout_id = (int) MPHB()->settings()->pages()->getCheckoutPageId();
            } catch (\Throwable $e) {
                $checkout_id = 0;
            }
        }
        $checkout_id = (int) apply_filters('dcc_checkout_page_id', $checkout_id);

        $is_checkout = $checkout_id > 0 && is_page($checkout_id);

        return (bool) apply_filters('dcc_checkout_is_checkout_page', $is_checkout);
    }

    public function enqueue(): void
    {
        if (!self::is_checkout_page()) {
            return;
        }

        wp_enqueue_style(
            'dcc-checkout',
            DCC_CHECKOUT_URL . 'assets/checkout.css',
            [],
            DCC_CHECKOUT_VERSION
        );

        wp_enqueue_script(
            'dcc-checkout',
            DCC_CHECKOUT_URL . 'assets/checkout.js',
            [],
            DCC_CHECKOUT_VERSION,
            true
        );

        wp_localize_script('dcc-checkout', 'DCC_CHECKOUT', $this->script_config());
    }

    /**
     * The config object the front-end script reads. Keep this in sync with the
     * keys consumed in assets/checkout.js.
     */
    private function script_config(): array
    {
        $service_ids = Config::pet_service_ids();

        return [
            'serviceIds'      => [
                'daily'   => $service_ids['daily'],
                'weekly'  => $service_ids['weekly'],
                'monthly' => $service_ids['monthly'],
            ],
            'serviceIdList'    => Config::pet_service_id_list(),
            'thresholds'       => Config::bucket_thresholds(),
            'petFeeEnabled'    => Config::pet_fee_enabled(),
            'petAccommodations' => Config::pet_accommodations(),
            'guest2FieldNames' => Config::guest2_field_name_list(),
            // Every conditional per-guest detail group (2: name+phone; 3/4:
            // name only), from the single Config definition.
            'guestGroups'      => array_values(array_map(static function (array $g): array {
                return [
                    'min'          => $g['min'],
                    'names'        => $g['names'],
                    'prefix'       => $g['prefix'],
                    'title'        => $g['title'],
                    'sectionClass' => $g['section_class'],
                ];
            }, Config::guest_field_groups())),
            // Native dog Checkout Field names the toggle shows/hides + requires.
            'dogFieldNames'    => Config::dog_field_name_list(),
            'sectionTitles'    => [
                'guest2' => Config::guest2_section_title(),
                'pet'    => Config::pet_section_title(),
            ],
            // Extra-guest fee (guests beyond the second). guestFeeEnabled is the
            // LIVE flag: enabled AND all three service IDs configured (non-zero).
            'guestFeeEnabled'     => Config::guest_fee_active(),
            'guestServiceIds'     => Config::guest_service_ids(),
            'guestServiceIdList'  => Config::guest_service_id_list(),
            'guestAccommodations' => Config::guest_accommodations(),
            'includedGuests'      => Config::included_guests(),
            // Cumulative extra-guest fee per extra-guest count, pre-formatted
            // server-side: {1:"$50", 2:"$100", …}. Read off the same Service
            // MotoPress bills from, so a label can never contradict the total.
            // Empty when the amount can't be read — the JS then adds no suffix
            // rather than a wrong one, and no note.
            'guestFeeSteps'       => Config::guest_fee_steps(),
            'couchBedsText'       => Config::couch_beds_text(),
            'guestsSelector'   => Config::guests_selector(),
            // Which price-breakdown rows count as tax detail. Matched against
            // the rendered label, so it is language-specific; filterable.
            'taxRowPattern'    => (string) apply_filters('dcc_checkout_tax_row_pattern', 'tax'),
            // Surfaces misconfiguration notices (e.g. a double-prefixed
            // Checkout Field slug) on the page for administrators only.
            'isAdmin'          => current_user_can('manage_options'),
            'i18n'            => [
                'petQuestion'   => __('Traveling with a dog?', 'dcc-checkout'),
                'petNo'         => __('No', 'dcc-checkout'),
                'petYes'        => __('Yes', 'dcc-checkout'),
                'petFeeNote'    => __('A per-night pet fee will be added to your total.', 'dcc-checkout'),
                'requiredMsg'   => __('Please complete the highlighted required fields.', 'dcc-checkout'),
                'errGuest2'     => __('Please complete the details for every additional guest.', 'dcc-checkout'),
                /*
                 * The canonical, owner-approved explanation of the pull-out
                 * couch. Wording is Rob's and is used verbatim wherever this
                 * needs explaining; only the numbers are substituted, so a
                 * cottage that sleeps a different number or charges a different
                 * fee still reads correctly.
                 *
                 * translators: 1: maximum guests for this cottage, 2: sleeping
                 * arrangement (e.g. "1 queen-sized bed and a pull-out couch"),
                 * 3: formatted per-night fee (e.g. $50).
                 */
                'couchNote'     => __('NOTE: Up to %1$s guests can stay since this cottage has %2$s. A per-night fee of %3$s/night applies for each additional guest.', 'dcc-checkout'),
                /* translators: %s: formatted cumulative fee (e.g. $100). Appended to a guest-count option, e.g. "4 (+$100/night)". */
                'optionFeeSuffix' => __(' (+%s/night)', 'dcc-checkout'),
                /* translators: %s: maximum guest count. */
                'capNote'       => __('This cottage sleeps up to %s guests.', 'dcc-checkout'),
                'errPet'        => __('There was a problem applying the pet fee. Please review the "Traveling with a dog?" section and try again.', 'dcc-checkout'),
                'errGuests'     => __('There was a problem applying the extra-guest fee. Please review the number of guests and try again.', 'dcc-checkout'),
                'adminNoticePrefix' => __('Visible to administrators only:', 'dcc-checkout'),
                'subtotal'      => __('Subtotal', 'dcc-checkout'),
                'taxDetailShow' => __('Show detail', 'dcc-checkout'),
                'taxDetailHide' => __('Hide detail', 'dcc-checkout'),
            ],
        ];
    }
}
