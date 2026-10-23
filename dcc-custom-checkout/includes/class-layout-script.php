<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.35.0 — THE NEW LAYOUT'S OWN SCRIPT. Behind the preview gate, so today's
 * checkout is unchanged for every guest until Rob's switch is on.
 *
 * It starts with items 3a and 3b, which are small, independent and touch no
 * markup:
 *
 *   3a — ONE-TAP AUTOFILL (picture 8). The contact fields carry no
 *        `autocomplete` token at all today (the Director checked every one),
 *        so a phone offers nothing and the guest types their name, phone,
 *        email and address by hand on a 390px screen. The tokens are added.
 *
 *   3b — NEXT, THEN DONE (picture 11). `enterkeyhint` on every typed field,
 *        `done` on the last, Next moving to the following VISIBLE field so a
 *        folded Guest 3 panel is never jumped into, and Done closing the
 *        keyboard without submitting.
 *
 * THE FIELD NAMES COME FROM PHP, FROM THE SAME PLACE THE ADMIN LAYOUT READS
 * THEM. `Admin_Fields::customer_layout()` already names MotoPress's customer
 * fields and `Config` names the per-guest ones; a second list written in
 * JavaScript would be a fourth copy of something this repo has already been
 * bitten by keeping in step (the bucket logic, four copies, two languages).
 * So the map is built here and handed over.
 *
 * `mphb_address1` IS DELIBERATELY ABSENT FROM THE MAP. It carries
 * `autocomplete="off"` on live because Google Places is bound to it, and an
 * `address-line1` token would put the browser's own address sheet over the
 * Places dropdown — two pickers fighting over one field. One of the brief's
 * required mutations adds a token there and must go red.
 */
final class Layout_Script
{
    public const HANDLE = 'dcc-checkout-layout';

    /**
     * The field MotoPress binds Google Places to. Never given a token.
     *
     * Named as a constant because it is referenced twice — the map builder
     * skips it, and the suite asserts it was skipped — and a typo in either
     * would make the claim and the code disagree silently.
     */
    public const PLACES_FIELD = 'mphb_address1';

    public function register(): void
    {
        // After Assets (10) and Restore (20), so this script is last and can
        // depend on both.
        add_action('wp_enqueue_scripts', [$this, 'enqueue'], 30);
    }

    public function enqueue(): void
    {
        if (!Assets::is_checkout_page() || !Layout::active()) {
            return;
        }

        wp_enqueue_script(
            self::HANDLE,
            Assets::asset_url('assets/layout.js'),
            ['dcc-checkout'],
            DCC_CHECKOUT_VERSION,
            true
        );
        wp_localize_script(self::HANDLE, 'DCC_LAYOUT', self::config());
    }

    /** @return array<string,mixed> */
    public static function config(): array
    {
        return [
            'autocomplete' => self::autocomplete_map(),
            'placesField'  => self::PLACES_FIELD,
            'segmented'    => self::segmented(),
            'coupon'       => self::coupon(),
            'upload'       => self::upload(),
            'bar'          => self::bar(),
            'summary'      => self::summary(),
        ];
    }

    /**
     * ITEM 8 — the desktop summary card (the G desktop mockup).
     *
     * The dates come from Hero's own shared reader, so the card and the pill
     * over the photo cannot word the same stay differently — on a desktop the
     * guest reads both at once.
     *
     * @return array<string,string>
     */
    public static function summary(): array
    {
        return [
            'title' => __('Your Stay', 'dcc-checkout'),
            'dates' => Hero::stay_dates_text(),
        ];
    }

    /**
     * ITEMS 6 and 7 — the pinned bar's words (pictures 3 and 4).
     *
     * @return array<string,mixed>
     */
    public static function bar(): array
    {
        return [
            /* translators: %s: the name of the next empty required field, e.g. "Phone". */
            'next'      => __('Next: %s', 'dcc-checkout'),
            'submit'    => __('Submit Booking', 'dcc-checkout'),
            'allSet'    => __('All Set', 'dcc-checkout'),
            'updating'  => __('Updating…', 'dcc-checkout'),
            /* translators: %s: how many fields need attention. */
            'attention' => __('%s Need Attention', 'dcc-checkout'),
            /* translators: 1: which flagged field the guest is on, 2: how many there are. */
            /* v0.35.1, item 6 — "of" is lower case even in Title Case.
               Rob's rule: Title Case is for titles and labels, and a
               preposition inside one still stays down. */
            'showMe'    => __('Show Me ↑ %1$s of %2$s', 'dcc-checkout'),
            'total'     => __('Total', 'dcc-checkout'),
        ];
    }

    /**
     * ITEM 4 — "Have A Coupon Code?" (Rob: a link revealing the field).
     *
     * EVERYTHING ELSE IN ITEM 4 IS ALREADY MOTOPRESS'S OWN. checkout.js
     * reshapes the price breakdown without doing any arithmetic — every figure
     * it shows is one MotoPress rendered, moved or copied verbatim, and a row
     * is only ever removed when its amount string is identical to the row that
     * supersedes it. The per-night expander is MotoPress's own control (a real
     * <button> since 0.17.0) and the "Taxes ✱" footnote is v0.14.0's. So the
     * only new thing item 4 needs is the coupon disclosure.
     *
     * @return array<string,string>
     */
    public static function coupon(): array
    {
        return [
            // MotoPress's own field name on the checkout.
            'field'  => 'mphb_coupon_code',
            'reveal' => __('Have A Coupon Code?', 'dcc-checkout'),
        ];
    }

    /**
     * ITEM 5 — what the photo-ID preview needs (picture 2).
     *
     * The field is MotoPress's own file input, named from Id_Files so the
     * preview and the store can never disagree about which input holds the
     * photo. NOTHING IS UPLOADED HERE: the preview is drawn from the File the
     * browser already has, and the input is left exactly as MotoPress rendered
     * it, so the upload still happens on submit and the protected store is
     * still the only place the image lands.
     *
     * @return array<string,mixed>
     */
    public static function upload(): array
    {
        return [
            'field'  => Id_Files::META_KEY,
            'ready'  => __('Ready', 'dcc-checkout'),
            'change' => __('Change', 'dcc-checkout'),
            /* translators: a file that cannot be drawn as a picture (a PDF, or
               a HEIC outside Safari). Shown beside a document icon. */
            'document' => __('Document', 'dcc-checkout'),
            'units'  => [
                __('bytes', 'dcc-checkout'),
                __('KB', 'dcc-checkout'),
                __('MB', 'dcc-checkout'),
            ],
        ];
    }

    /**
     * WHICH DROPDOWNS BECOME SEGMENTED BUTTONS (item 3).
     *
     * Rob named four: guests, dog, coat, boat. The DOG question is already a
     * real <fieldset> of Yes/No radios (checkout.js's buildPetBlock), so it is
     * styled, never rebuilt — it is not in this list. That leaves the three
     * that are <select> elements today.
     *
     * The guest chooser has no fixed name — MotoPress numbers it per room
     * (`mphb_room_details[0][adults]`) — so it is matched by a SUFFIX, the
     * same `[adults]$` test guest-count.js uses. The other two are named
     * fields, and their names come from Config and from the Boat field's own
     * contract, never retyped here.
     *
     * DOG SIZE IS DELIBERATELY ABSENT. Rob's picture 10 makes it a single
     * promise tick box ("My dog is 20 lbs or less."), not a segmented set, and
     * that is its own item.
     *
     * @return array<int,array<string,string>>
     */
    public static function segmented(): array
    {
        $dog = Config::dog_field_names();

        return [
            [
                'match' => 'suffix',
                'name'  => '[adults]',
                'label' => __('Number of Guests', 'dcc-checkout'),
            ],
            [
                'match' => 'exact',
                'name'  => (string) ($dog['hair'] ?? 'mphb_dog_hair'),
                'label' => __('Coat', 'dcc-checkout'),
            ],
            [
                'match' => 'exact',
                // The Boat field's contract (v0.31.0): mphb_cf_name `boat`,
                // which MotoPress renders and stores as `mphb_boat`.
                'name'  => 'mphb_' . Boat_Field::NAME,
                'label' => __('Boat Or Trailer', 'dcc-checkout'),
            ],
        ];
    }

    /**
     * MotoPress field name => the `autocomplete` token for it.
     *
     * The tokens are the ones Rob listed, which are also the ones browsers
     * actually recognise: a token outside the HTML spec's list is ignored
     * entirely, so an invented one would look wired up and offer nothing.
     *
     * The per-guest fields carry an `autofill section` name — `section-guest2
     * given-name` — which is the spec's own way of saying "a different
     * person's name, not a second guess at the first person's". Without it a
     * browser would offer the account holder's own name for Guest 3.
     *
     * @return array<string,string>
     */
    public static function autocomplete_map(): array
    {
        $map = [
            'mphb_first_name' => 'given-name',
            'mphb_last_name'  => 'family-name',
            'mphb_phone'      => 'tel',
            'mphb_email'      => 'email',
            // Apartment / Unit #. MotoPress spells this field with a hyphen on
            // the checkout and an underscore on the Add New step (the public
            // fixture carries `mphb_apartment_units`), so both are offered —
            // the same pair `Admin_Fields::customer_layout()` tries.
            'mphb_apartment-units' => 'address-line2',
            'mphb_apartment_units' => 'address-line2',
            'mphb_city'       => 'address-level2',
            'mphb_state'      => 'address-level1',
            'mphb_zip'        => 'postal-code',
            'mphb_country'    => 'country',
        ];

        /* Guests 2-4, from the SAME names the gating and the backstops use.
           The OFFERED groups decide WHICH guests are described, so a field the
           Guest 3/4 switch has turned off is not offered to the browser
           either — but the groups' own `names` are a LIST
           (`array_values(...)`), with the roles thrown away, and a token
           depends entirely on the role. So the group says whether, and the
           role-keyed accessor says what. Reading the list positionally would
           work today and silently mislabel a phone as a surname the moment
           anyone reorders it. */
        $by_role = [
            2 => Config::guest2_field_names(),
            3 => Config::guest3_field_names(),
            4 => Config::guest4_field_names(),
        ];
        foreach (Config::collected_guest_field_groups() as $group) {
            $min = (int) ($group['min'] ?? 0);
            if ($min < 2 || !isset($by_role[$min])) {
                continue;
            }
            $section = 'section-guest' . $min . ' ';
            foreach ($by_role[$min] as $role => $name) {
                $token = self::role_token((string) $role);
                if ($token === '' || !is_string($name) || $name === '') {
                    continue;
                }
                $map[$name] = $section . $token;
            }
        }

        /* THE PLACES FIELD IS REMOVED LAST, so no path above can reinstate it
           — including a filter on the guest names that happened to return it. */
        unset($map[self::PLACES_FIELD]);

        return $map;
    }

    /** A per-guest field's role => its autocomplete token. */
    private static function role_token(string $role): string
    {
        switch ($role) {
            case 'first_name':
                return 'given-name';
            case 'last_name':
                return 'family-name';
            case 'phone':
                return 'tel';
            case 'email':
                return 'email';
            default:
                /* A role this does not know gets NO token rather than a
                   guessed one: an unrecognised token is ignored by the
                   browser, but a WRONG one offers the guest somebody
                   else's data. */
                return '';
        }
    }
}
