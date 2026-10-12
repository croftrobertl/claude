<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.34.0 — the Dog Size field's options come from this plugin's settings
 * (Rob's new pet policy: one dog up to 20 lbs; the old sizes kept, switched
 * off, so any can be turned back on).
 *
 * WHY THE OPTIONS ARE SERVED, NOT WRITTEN. MotoPress builds the field from its
 * stored `mphb_cf_options` everywhere (Director, live 6.3.0 + Checkout Fields):
 *  - the booking edit screen makes a core SelectField from the CURRENT
 *    options; its renderInput() selects only a matching key and its
 *    sanitize() keeps only keys in the list. So writing an active-only list
 *    into the field would show a stored "30-40 lbs" as "— Select —" and
 *    ERASE it on the next Update;
 *  - the guest checkout does not check a posted select against its options
 *    (parse-utils.php parseCustomer runs sanitize_text_field only), so the
 *    options alone keep nothing out.
 * So the options are served per request through `get_post_metadata` (the
 * Checkout Fields add-on reads them with get_post_meta(…, true), CLAUDE.md
 * 0.31.0): the GUEST sees the active sizes; WP-Admin sees every size, so a
 * stored one shows and survives Update. Nothing in MotoPress's data is
 * written. The server-side check in Pet_Service is what keeps an inactive
 * or missing size off a dog booking.
 *
 * Every row's value IS its label, as Dog Size stores its own on live — so an
 * email (which prints the label of a value in the list, else the raw value)
 * reads the same either way.
 */
final class Dog_Sizes
{
    public const OPTIONS_META = 'mphb_cf_options';
    public const FIELD_TYPE   = 'mphb_checkout_field';

    public function register(): void
    {
        add_filter('get_post_metadata', [self::class, 'filter_options'], 10, 4);
    }

    /**
     * get_post_metadata: the Dog Size field's options, from the settings.
     * Every other read passes through untouched.
     *
     * @param mixed $value
     * @param mixed $object_id
     * @param mixed $meta_key
     * @param mixed $single
     * @return mixed
     */
    public static function filter_options($value, $object_id = 0, $meta_key = '', $single = false)
    {
        if ($meta_key !== self::OPTIONS_META || $value !== null) {
            return $value;
        }
        if (!self::is_size_field((int) $object_id)) {
            return $value;
        }
        $labels = self::guest_facing() ? Config::active_dog_sizes() : Config::all_dog_sizes();
        // get_metadata() returns $check[0] for a single read and the list
        // itself otherwise: one value either way.
        return [self::options($labels)];
    }

    /**
     * The options rows, in the shape the field stores them: a blank first
     * row so nothing is ever pre-answered, then one row per size.
     *
     * @param string[] $labels
     * @return array<int, array{value:string,label:string}>
     */
    public static function options(array $labels): array
    {
        $rows = [['value' => '', 'label' => __('— Select —', 'dcc-checkout')]];
        foreach ($labels as $label) {
            $rows[] = ['value' => (string) $label, 'label' => (string) $label];
        }
        return $rows;
    }

    /** Is this post the Dog Size Checkout Field? */
    public static function is_size_field(int $id): bool
    {
        $slug = Config::dog_size_field_slug();
        return $id > 0 && $slug !== ''
            && get_post_type($id) === self::FIELD_TYPE
            && (string) get_post_meta($id, 'mphb_cf_name', true) === $slug;
    }

    /**
     * Whose view is being drawn? The guest's — the checkout page, MotoPress's
     * front-end requests, and Add New Booking, where staff take a new stay
     * under the current policy — gets the offered sizes only. Every other
     * WP-Admin screen (the booking edit screen above all) gets every size,
     * so a size stored before it was switched off still shows and is kept.
     */
    public static function guest_facing(): bool
    {
        if (!is_admin()) {
            return true;
        }
        if (wp_doing_ajax()) {
            $referer = (string) wp_get_referer();
            return !($referer !== '' && strpos($referer, admin_url()) === 0);
        }
        $page = isset($_GET['page']) && is_scalar($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';
        return $page === 'mphb_add_new_booking';
    }

    /**
     * Is the Dog Size field in use on the checkout — published and enabled?
     * Only then can a dog booking be required to carry a size: MotoPress
     * sends nothing for an empty select, so "empty" arrives as "absent".
     */
    public static function field_in_use(): bool
    {
        $slug = Config::dog_size_field_slug();
        if ($slug === '') {
            return false;
        }
        $ids = get_posts([
            'post_type'        => self::FIELD_TYPE,
            'post_status'      => 'publish',
            'meta_key'         => 'mphb_cf_name',
            'meta_value'       => $slug,
            'numberposts'      => 1,
            'fields'           => 'ids',
            'suppress_filters' => false,
        ]);
        if (!is_array($ids) || $ids === []) {
            return false;
        }
        return (string) get_post_meta((int) $ids[0], 'mphb_cf_enabled', true) === '1';
    }

    /**
     * The submitted size's problem on a DOG booking, or null when it is fine:
     * a size that is not offered, or none at all while the field is in use.
     *
     * @param string|null $size the posted value (null = not posted)
     */
    public static function violation(?string $size): ?string
    {
        $size = $size === null ? '' : trim($size);
        if ($size === '') {
            return self::field_in_use() ? 'dogsize' : null;
        }
        return in_array($size, Config::active_dog_sizes(), true) ? null : 'dogsize';
    }
}
