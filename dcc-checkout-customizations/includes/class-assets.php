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
            'cottageTypeId'   => Config::cottage_type_id(),
            'serviceIds'      => [
                'daily'   => $service_ids['daily'],
                'weekly'  => $service_ids['weekly'],
                'monthly' => $service_ids['monthly'],
            ],
            'serviceIdList'   => Config::pet_service_id_list(),
            'thresholds'      => Config::bucket_thresholds(),
            'guest2FieldIds'  => array_values(Config::guest2_field_ids()),
            'guestsSelector'  => Config::guests_selector(),
            'requiredColor'   => '#c62828',
            'i18n'            => [
                'petQuestion'   => __('Traveling with a dog?', 'dcc-checkout'),
                'petNo'         => __('No', 'dcc-checkout'),
                'petYes'        => __('Yes', 'dcc-checkout'),
                'dogType'       => __('Dog type', 'dcc-checkout'),
                'dogSize'       => __('Size', 'dcc-checkout'),
                'dogHair'       => __('Hair length', 'dcc-checkout'),
                'sizeSmall'     => __('10–20 lbs', 'dcc-checkout'),
                'sizeMedium'    => __('20–30 lbs', 'dcc-checkout'),
                'sizeLarge'     => __('30–40 lbs', 'dcc-checkout'),
                'hairShort'     => __('Short', 'dcc-checkout'),
                'hairMedium'    => __('Medium', 'dcc-checkout'),
                'hairLong'      => __('Long', 'dcc-checkout'),
                'choose'        => __('Choose…', 'dcc-checkout'),
                'petFeeNote'    => __('A per-night pet fee will be added to your total.', 'dcc-checkout'),
                'requiredMsg'   => __('Please complete the highlighted required fields.', 'dcc-checkout'),
                /* translators: shown when the second guest fields are left blank at 2 guests. */
                'guest2Msg'     => __('Please enter the second guest\'s details, or change the number of guests to 1.', 'dcc-checkout'),
                'errGuest2'     => __('Please complete the second guest\'s First name, Last name, and Phone.', 'dcc-checkout'),
                'errPet'        => __('There was a problem applying the pet fee. Please review the "Traveling with a dog?" section and try again.', 'dcc-checkout'),
            ],
        ];
    }
}
