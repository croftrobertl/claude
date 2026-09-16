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
        // ITEM 3 (v0.15.0) — two reasons the rename could miss, both cheap to
        // close. A string passed through _x() does NOT fire `gettext_`; it
        // fires `gettext_with_context_`. Same for _n() and `ngettext_`. The
        // originals stay registered, so nothing that worked stops working.
        add_filter('gettext_with_context_motopress-hotel-booking', [$this, 'filter_label_with_context'], 20, 4);
        add_filter('ngettext_motopress-hotel-booking', [$this, 'filter_label_plural'], 20, 5);
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
    /**
     * MotoPress msgid => the word this site uses instead, on the checkout only.
     *
     * Shared by the gettext filter AND by the script config, so the JS knows
     * BOTH spellings of every label it has to find in the price breakdown. That
     * matters: if this filter fires, the breakdown says "Extras"; if it does
     * not — because MotoPress passed a different msgid, or a context-qualified
     * one — it still says "Services". A matcher that knew only one spelling
     * would silently do nothing on the other, which is the exact failure mode
     * that cost three releases on the services section.
     *
     * @return array<string,string>
     */
    public static function string_overrides(): array
    {
        return (array) apply_filters('dcc_checkout_string_overrides', [
            'Accommodation Type:' => __('Accommodation:', 'dcc-checkout'),
            // "Service" is MotoPress's word, not the owner's: the pet fee and
            // the extra-guest fee are not services a guest chose from a menu —
            // they follow from answers already given. Relabelled in the price
            // breakdown. A msgid MotoPress doesn't actually use simply never
            // matches, so a wrong guess here is a no-op, not a bug.
            // MotoPress's literal is 'Services:' WITH a colon
            // (template-functions.php:928) while the owner's screenshot shows
            // no colon, so the row he is looking at may not be that msgid.
            // Both spellings of each are mapped; a msgid MotoPress does not
            // use simply never matches.
            'Services'        => __('Extras', 'dcc-checkout'),
            'Services:'       => __('Extras:', 'dcc-checkout'),
            'Service'         => __('Item', 'dcc-checkout'),
            'Service:'        => __('Item:', 'dcc-checkout'),
            'Services Total'  => __('Extras Total', 'dcc-checkout'),
            'Services Total:' => __('Extras Total:', 'dcc-checkout'),
        ]);
    }

    /**
     * Every spelling a breakdown label can have: MotoPress's own word and this
     * site's override, lowercased for matching.
     *
     * @return array<string,string[]>
     */
    public static function label_aliases(): array
    {
        $map = self::string_overrides();
        $out = [];
        foreach (['Services', 'Service', 'Services Total'] as $msgid) {
            $key = strtolower(rtrim($msgid, ':'));
            $names = [$key];
            if (isset($map[$msgid])) {
                $names[] = strtolower(trim((string) $map[$msgid]));
            }
            $out[$key] = array_values(array_unique(array_filter($names)));
        }
        return $out;
    }

    public function filter_accommodation_label($translation, $text, $domain = '')
    {
        return self::apply_override($translation, $text);
    }

    /**
     * Same map, for strings MotoPress passes through _x() — a context-qualified
     * string never reaches the plain `gettext_` filter.
     *
     * @param mixed $translation
     * @param mixed $text
     * @param mixed $context
     * @param mixed $domain
     * @return mixed
     */
    public function filter_label_with_context($translation, $text, $context = '', $domain = '')
    {
        return self::apply_override($translation, $text);
    }

    /**
     * Same map, for _n(). Only the form actually being returned is rewritten.
     *
     * @param mixed $translation
     * @param mixed $single
     * @param mixed $plural
     * @param mixed $number
     * @param mixed $domain
     * @return mixed
     */
    public function filter_label_plural($translation, $single = '', $plural = '', $number = 0, $domain = '')
    {
        return self::apply_override($translation, (string) $translation);
    }

    /**
     * @param mixed  $translation
     * @param string $text
     * @return mixed
     */
    private static function apply_override($translation, $text)
    {
        $map = self::string_overrides();
        if (!isset($map[$text])) {
            return $translation;
        }
        if (!self::should_rename_strings()) {
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
    /**
     * Whether the Services -> Extras rename applies to THIS request.
     *
     * ITEM 3 (v0.15.0) — the most likely reason the owner still sees
     * "Services". `is_checkout_page()` deliberately returns false for AJAX and
     * REST, because it also gates script enqueueing and nothing should load
     * there. But MotoPress RE-RENDERS THE PRICE BREAKDOWN OVER AJAX/REST every
     * time the guest changes the guest count or the dates — and that re-render
     * is a different request, on which the old gate was false. So the first
     * paint said "Extras" and every re-render after it said "Services", which
     * is exactly the state a screenshot of a configured booking would catch.
     *
     * The rename is a string substitution with no side effects, so widening it
     * to MotoPress's own front-end AJAX/REST requests is safe in a way that
     * widening the enqueue gate would not be. Requests coming from a wp-admin
     * screen are still excluded: the owner manages the Services themselves in
     * there and should see MotoPress's own word.
     *
     * DCC-VERIFY: the AJAX/REST re-render path is REASONED, not observed — it
     * could not be reproduced here without a booking in session. If the owner
     * still sees "Services" after this, that reasoning is wrong and the next
     * thing to check is whether the row is that msgid at all.
     */
    public static function should_rename_strings(): bool
    {
        // is_page() is only reliable once the main query exists; the checkout
        // template renders long after 'wp', so earlier fires pass through
        // untouched (also keeps search results / emails unaffected).
        if (did_action('wp') && self::is_checkout_page()) {
            return true;
        }

        $referer = (string) wp_get_referer();
        if ($referer !== '' && strpos($referer, admin_url()) === 0) {
            return false; // an admin screen asked for this — leave it alone
        }

        if (defined('REST_REQUEST') && REST_REQUEST) {
            $route = '';
            if (isset($GLOBALS['wp']) && isset($GLOBALS['wp']->query_vars['rest_route'])) {
                $route = (string) $GLOBALS['wp']->query_vars['rest_route'];
            }
            if ($route === '' && isset($_SERVER['REQUEST_URI'])) {
                $route = (string) wp_unslash($_SERVER['REQUEST_URI']);
            }
            return strpos($route, 'mphb') !== false;
        }

        if (wp_doing_ajax()) {
            $action = isset($_REQUEST['action'])
                ? sanitize_key(wp_unslash($_REQUEST['action']))
                : '';
            return $action !== '' && strpos($action, 'mphb') === 0;
        }

        return false;
    }

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

        $this->maybe_enqueue_tap_debug();
    }

    /**
     * The tap diagnostic: administrators only, and only on request.
     *
     * Gating is BOTH the capability and an explicit ?dcc_tap_debug=1 — a guest
     * cannot reach it by guessing a URL, and an admin cannot leave it switched
     * on by accident, because it does not persist anywhere. Nothing is stored,
     * so there is no setting with a wrong default to worry about.
     *
     * It only listens. See assets/tap-debug.js for what it records and why.
     */
    private function maybe_enqueue_tap_debug(): void
    {
        if (empty($_GET['dcc_tap_debug']) || !current_user_can('manage_options')) {
            return;
        }
        wp_enqueue_script(
            'dcc-checkout-tap-debug',
            DCC_CHECKOUT_URL . 'assets/tap-debug.js',
            [],
            DCC_CHECKOUT_VERSION,
            true
        );
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
            // label => rate, read from MotoPress's own mphb_accommodation_taxes
            // option so a rate change there reaches the guest-facing note.
            'taxRates'         => Config::accommodation_tax_rates(),
            // Both spellings of every breakdown label the JS has to find.
            'labelAliases'     => self::label_aliases(),
            // The extra-guest service's real post_title(s), read from
            // MotoPress by ID. Item 14 relabels that row FOR DISPLAY ONLY —
            // matching it by the title MotoPress actually renders, rather than
            // by a string typed in here that would rot the moment the service
            // is renamed in the admin.
            'guestServiceTitles' => Config::guest_service_titles(),
            'guestFeeAmountText' => Config::format_price(Config::guest_fee_amount()),
            // Surfaces misconfiguration notices (e.g. a double-prefixed
            // Checkout Field slug) on the page for administrators only.
            'isAdmin'          => current_user_can('manage_options'),
            // Stamped into the tap diagnostic's header. Round 4's log could
            // not be attributed to a build without asking, which cost a round.
            'version'          => DCC_CHECKOUT_VERSION,
            'i18n'            => [
                'petQuestion'   => __('Traveling with a dog?', 'dcc-checkout'),
                'petNo'         => __('No', 'dcc-checkout'),
                'petYes'        => __('Yes', 'dcc-checkout'),
                'petFeeNote'    => __('A per-night pet fee will be added to your total.', 'dcc-checkout'),
                'requiredMsg'   => __('Please complete all of the required fields.', 'dcc-checkout'),
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
                // ITEM 9 (v0.14.0) — the owner's replacement wording. This is a
                // LITERAL, not a template, and deliberately so: the identical
                // sentence ships in the Cottage Selector this same round and the
                // two must match CHARACTER FOR CHARACTER. A template that
                // resolved from per-cottage data could not guarantee that.
                //
                // It therefore assumes the layout it describes: 2 guests
                // included, 4 capacity, queen plus pull-out couch. That holds
                // for all six cottages that can show it — Cottage 33 (1604) and
                // Cottage 34 (1607) have capacity 2 and no extra-guest service,
                // so the note never renders there. Override with the
                // dcc_checkout_couch_note filter if a cottage ever differs.
                'couchNote'     => Config::couch_note_text(),
                // Item 14 — the extra-guest row, relabelled for DISPLAY in the
                // price breakdown. The MotoPress service itself (18063) keeps
                // its own title, which is what admin screens and guest emails
                // show.
                // Item 7 — MotoPress's own label on the duplicate total below the
                // upload field. Localised so a translated site can still match it.
                'totalPriceLabel'   => __('Total Price', 'dcc-checkout'),
                'extraGuestService' => __('Extra Guest(s) Fee', 'dcc-checkout'),
                // Two lines, joined by the JS with a newline (item 3, v0.19.0).
                // Lowercase x by owner decision.
                'extraGuestRate'    => __('%s/night', 'dcc-checkout'),
                'extraGuestGuest'   => __('x %d guest', 'dcc-checkout'),
                'extraGuestGuests'  => __('x %d guests', 'dcc-checkout'),
                /* translators: %s: formatted cumulative fee (e.g. $100). Appended to a guest-count option, e.g. "4 (+$100/night)". */
                'optionFeeSuffix' => __(' (+%s/night)', 'dcc-checkout'),
                /* translators: %s: maximum guest count. */
                'capNote'       => __('This cottage sleeps up to %s guests.', 'dcc-checkout'),
                'errPet'        => __('There was a problem applying the pet fee. Please review the "Traveling with a dog?" section and try again.', 'dcc-checkout'),
                'errGuests'     => __('There was a problem applying the extra-guest fee. Please review the number of guests and try again.', 'dcc-checkout'),
                'adminNoticePrefix' => __('Visible to administrators only:', 'dcc-checkout'),
                'subtotal'      => __('Subtotal', 'dcc-checkout'),
                'taxNoteLead'   => __('Taxes applied:', 'dcc-checkout'),
                'taxNoteLabel'  => __('Show which taxes apply', 'dcc-checkout'),

            ],
        ];
    }
}
