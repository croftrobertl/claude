<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin settings page: "DCC Custom Checkout".
 *
 * Controls the pet-fee feature — master on/off, which accommodations it applies
 * to, the three service IDs, and the night-bucket thresholds. Uses the WordPress
 * Settings API; stores everything in the single option Config::OPTION.
 */
final class Settings
{
    private const MENU_SLUG   = 'dcc-custom-checkout';
    private const GROUP       = 'dcc_checkout_settings_group';

    /**
     * Hook suffix returned by add_submenu_page(). Compare against this rather
     * than a hard-coded screen ID — the ID is derived from the parent menu, so
     * hard-coded strings silently stop matching if the parent ever changes.
     */
    private string $hook_suffix = '';

    public function register(): void
    {
        // Shared "DCC" parent menu — registered by every DCC plugin, first one
        // in wins (priority 5, before any submenu registers at 50+).
        add_action('admin_menu', [$this, 'add_parent_menu'], 5);
        // Our submenu sits at the priority assigned in the shared DCC contract.
        add_action('admin_menu', [$this, 'add_menu'], 50);
        // Drop WordPress's auto-generated duplicate of the parent item.
        add_action('admin_menu', [$this, 'remove_duplicate_parent_item'], 999);
        add_action('admin_init', [$this, 'register_settings']);
    }

    /**
     * Register the shared top-level "DCC" menu if no other DCC plugin has.
     *
     * Canonical values are fixed by the shared DCC menu contract — do not vary
     * the slug/title/capability/icon/position, or a second "DCC" menu appears.
     */
    public function add_parent_menu(): void
    {
        global $admin_page_hooks;
        if (!isset($admin_page_hooks['dcc'])) {
            add_menu_page(
                __('Dora Canal Court', 'dcc-checkout'),
                __('DCC', 'dcc-checkout'),
                'manage_options',
                'dcc',
                '',                    // no page of its own; first submenu is the landing page
                'dashicons-palmtree',
                58
            );
        }
    }

    /**
     * WordPress mirrors the parent as its own first submenu item; remove it.
     * Guarded/idempotent — harmless if another DCC plugin already did it.
     */
    public function remove_duplicate_parent_item(): void
    {
        remove_submenu_page('dcc', 'dcc');
    }

    public function add_menu(): void
    {
        // Menu label drops the "DCC" prefix — inside a menu already called DCC,
        // "DCC → DCC Custom Checkout" stutters. The page slug is unchanged, so
        // the existing admin.php?page=<slug> URL keeps resolving.
        $hook = add_submenu_page(
            'dcc',
            __('DCC Custom Checkout', 'dcc-checkout'),
            __('Custom Checkout', 'dcc-checkout'),
            'manage_options',
            self::MENU_SLUG,
            [$this, 'render_page']
        );
        $this->hook_suffix = is_string($hook) ? $hook : '';
    }

    /**
     * The screen ID for this settings page (e.g. "dcc_page_dcc-custom-checkout").
     * Empty until add_menu() has run.
     */
    public function hook_suffix(): string
    {
        return $this->hook_suffix;
    }

    public function register_settings(): void
    {
        register_setting(self::GROUP, Config::OPTION, [
            'type'              => 'array',
            'sanitize_callback' => [$this, 'sanitize'],
            'default'           => Config::defaults(),
        ]);
    }

    /**
     * Validate + normalize the posted settings into the stored shape.
     *
     * @param mixed $input
     */
    public function sanitize($input): array
    {
        $defaults = Config::defaults();
        $input    = is_array($input) ? $input : [];
        $out      = [];

        $out['pet_fee_enabled'] = empty($input['pet_fee_enabled']) ? 0 : 1;

        $acc = $input['pet_accommodations'] ?? [];
        if (!is_array($acc)) {
            $acc = [];
        }
        $out['pet_accommodations'] = array_values(array_unique(array_filter(array_map('intval', $acc))));
        if (empty($out['pet_accommodations'])) {
            $out['pet_accommodations'] = $defaults['pet_accommodations'];
        }

        foreach (['service_daily', 'service_weekly', 'service_monthly', 'min_daily', 'min_weekly', 'min_monthly'] as $key) {
            $val       = isset($input[$key]) ? (int) $input[$key] : (int) $defaults[$key];
            $out[$key] = $val > 0 ? $val : (int) $defaults[$key];
        }

        foreach (['dog_field_type', 'dog_field_size', 'dog_field_hair'] as $key) {
            $name      = isset($input[$key]) ? sanitize_key($input[$key]) : '';
            $out[$key] = $name !== '' ? $name : (string) $defaults[$key];
        }

        foreach (['guest2_section_title', 'guest3_section_title', 'guest4_section_title', 'pet_section_title'] as $key) {
            $title     = isset($input[$key]) ? sanitize_text_field($input[$key]) : '';
            $out[$key] = $title !== '' ? $title : (string) $defaults[$key];
        }

        $out['guest_fee_enabled'] = empty($input['guest_fee_enabled']) ? 0 : 1;

        $gacc = $input['guest_accommodations'] ?? [];
        if (!is_array($gacc)) {
            $gacc = [];
        }
        $out['guest_accommodations'] = array_values(array_unique(array_filter(array_map('intval', $gacc))));
        if (empty($out['guest_accommodations'])) {
            $out['guest_accommodations'] = $defaults['guest_accommodations'];
        }

        // 0 is VALID here — it keeps the feature dormant until the real service
        // post exists — so unlike the pet service IDs we don't fall back to a
        // non-zero default.
        foreach (['guest_service_daily', 'guest_service_weekly', 'guest_service_monthly'] as $key) {
            $out[$key] = isset($input[$key]) ? max(0, (int) $input[$key]) : (int) $defaults[$key];
        }

        // Fresh reads should reflect the new values immediately.
        Config::flush_cache();

        return $out;
    }

    public function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $s = Config::settings();
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('DCC Custom Checkout', 'dcc-checkout'); ?></h1>

            <form method="post" action="options.php">
                <?php settings_fields(self::GROUP); ?>

                <h2><?php echo esc_html__('Pet fee', 'dcc-checkout'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><?php echo esc_html__('Enable pet fee', 'dcc-checkout'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr(Config::OPTION); ?>[pet_fee_enabled]" value="1" <?php checked(1, (int) $s['pet_fee_enabled']); ?> />
                                <?php echo esc_html__('Show the "Traveling with a dog?" flow and apply the per-night pet fee.', 'dcc-checkout'); ?>
                            </label>
                            <p class="description"><?php echo esc_html__('When off, the dog toggle/fields never render and no pet service is applied on any cottage.', 'dcc-checkout'); ?></p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row"><?php echo esc_html__('Applies to accommodations', 'dcc-checkout'); ?></th>
                        <td>
                            <?php $this->render_accommodations_field($s['pet_accommodations'], 'pet_accommodations', Config::pet_service_id_list()); ?>
                            <p class="description">
                                <?php echo esc_html__('The dog flow shows only when the booking\'s accommodation is selected here AND the pet fee is enabled. Default: Cottage 34.', 'dcc-checkout'); ?>
                            </p>
                        </td>
                    </tr>
                </table>

                <h2><?php echo esc_html__('Services &amp; night buckets', 'dcc-checkout'); ?></h2>
                <p class="description" style="max-width:640px">
                    <?php echo esc_html__('These native MotoPress Service IDs are applied by length of stay; the fee itself (amount, taxed/untaxed) is configured on the Service in MotoPress — this plugin only ticks the right one. The weekly and monthly night thresholds are SHARED by the pet fee and the pull-out couch fee. Both fees apply from the first night (there is no minimum-nights threshold for the daily bucket).', 'dcc-checkout'); ?>
                </p>
                <table class="form-table" role="presentation">
                    <?php
                    $this->service_id_row(__('Daily service ID', 'dcc-checkout'), 'service_daily', (int) $s['service_daily'], __('Applied for stays in the "daily" bucket.', 'dcc-checkout'));
                    $this->service_id_row(__('Weekly service ID', 'dcc-checkout'), 'service_weekly', (int) $s['service_weekly'], '');
                    $this->service_id_row(__('Monthly service ID', 'dcc-checkout'), 'service_monthly', (int) $s['service_monthly'], '');
                    $this->number_row(__('Weekly bucket: minimum nights', 'dcc-checkout'), 'min_weekly', (int) $s['min_weekly'], '');
                    $this->number_row(__('Monthly bucket: minimum nights', 'dcc-checkout'), 'min_monthly', (int) $s['min_monthly'], '');
                    ?>
                </table>

                <h2><?php echo esc_html__('Pull-out Couch Guests', 'dcc-checkout'); ?></h2>
                <p class="description" style="max-width:640px">
                    <?php echo esc_html__('Offers the pull-out couch as extra sleeping space: each guest beyond the included count is charged per night via a native MotoPress Service (per night · per adult; the fee amount lives on the Service). For a flat fee across all stay lengths, enter the SAME service ID in all three fields. The weekly/monthly night thresholds are the shared bucket fields above; this fee applies from the first night. The offering stays dormant while any service ID is 0.', 'dcc-checkout'); ?>
                </p>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><?php echo esc_html__('Pull-out Couch Guests', 'dcc-checkout'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr(Config::OPTION); ?>[guest_fee_enabled]" value="1" <?php checked(1, (int) $s['guest_fee_enabled']); ?> />
                                <?php echo esc_html__('Offer the pull-out couch, and charge the per-night fee for each guest beyond the included count.', 'dcc-checkout'); ?>
                            </label>
                            <p class="description"><?php echo esc_html__('When ON, guests beyond the included count are offered and billed automatically. When OFF (or while any service ID below is 0) the offering stands down completely: no fee UI, no service attached, and bookings are capped at the included guest count on the accommodations below.', 'dcc-checkout'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('Applies to accommodations', 'dcc-checkout'); ?></th>
                        <td>
                            <?php $this->render_accommodations_field($s['guest_accommodations'], 'guest_accommodations', Config::guest_service_id_list()); ?>
                            <p class="description">
                                <?php echo esc_html__('Default: the six 4-sleeper cottages (22/23/31/32/35/36). Cottages 33 and 34 stay capped at 2 guests and must not be listed here.', 'dcc-checkout'); ?>
                            </p>
                        </td>
                    </tr>
                    <?php
                    $this->service_id_row(__('Daily service ID (pull-out couch)', 'dcc-checkout'), 'guest_service_daily', (int) $s['guest_service_daily'], __('0 = dormant. Flat pricing: same ID in all three fields.', 'dcc-checkout'));
                    $this->service_id_row(__('Weekly service ID (pull-out couch)', 'dcc-checkout'), 'guest_service_weekly', (int) $s['guest_service_weekly'], '');
                    $this->service_id_row(__('Monthly service ID (pull-out couch)', 'dcc-checkout'), 'guest_service_monthly', (int) $s['guest_service_monthly'], '');
                    ?>
                </table>

                <h2><?php echo esc_html__('Dog info fields (native Checkout Fields)', 'dcc-checkout'); ?></h2>
                <p class="description" style="max-width:640px">
                    <?php echo esc_html__('The three dog info fields are native MotoPress Checkout Fields you create under Bookings → Settings → Checkout Fields (set them NOT required). MotoPress saves them to the booking and can show them in emails.', 'dcc-checkout'); ?>
                </p>
                <p class="description" style="max-width:640px">
                    <strong><?php echo esc_html__('Field name vs. slug:', 'dcc-checkout'); ?></strong>
                    <?php echo esc_html__('MotoPress renders a Checkout Field as an input named "mphb_" + the field\'s own name. So create the field with the name dog_type, and enter its rendered input name mphb_dog_type below. Creating the field as "mphb_dog_type" makes MotoPress render mphb_mphb_dog_type, nothing matches, and the fields silently never appear.', 'dcc-checkout'); ?>
                </p>
                <table class="form-table" role="presentation">
                    <?php
                    $this->field_name_row(__('Dog type — rendered input name', 'dcc-checkout'), 'dog_field_type', (string) $s['dog_field_type'], __('Text field. Create it in MotoPress as dog_type.', 'dcc-checkout'));
                    $this->field_name_row(__('Dog size — rendered input name', 'dcc-checkout'), 'dog_field_size', (string) $s['dog_field_size'], __('Select: 10–20 / 20–30 / 30–40 lbs. Create it as dog_size.', 'dcc-checkout'));
                    $this->field_name_row(__('Dog hair — rendered input name', 'dcc-checkout'), 'dog_field_hair', (string) $s['dog_field_hair'], __('Select: Short / Medium / Long. Create it as dog_hair.', 'dcc-checkout'));
                    ?>
                </table>

                <h2><?php echo esc_html__('Section titles', 'dcc-checkout'); ?></h2>
                <p class="description" style="max-width:640px">
                    <?php echo esc_html__('Headings for the conditional sections shown after "Your Information" (per-guest details and pet information).', 'dcc-checkout'); ?>
                </p>
                <table class="form-table" role="presentation">
                    <?php
                    $this->text_row(__('Guest #2 section title', 'dcc-checkout'), 'guest2_section_title', (string) $s['guest2_section_title'], __('Shown at 2+ guests: first name, last name, phone.', 'dcc-checkout'));
                    $this->text_row(__('Guest #3 section title', 'dcc-checkout'), 'guest3_section_title', (string) $s['guest3_section_title'], __('Shown at 3+ guests: first and last name. Needs the Checkout Fields listed below.', 'dcc-checkout'));
                    $this->text_row(__('Guest #4 section title', 'dcc-checkout'), 'guest4_section_title', (string) $s['guest4_section_title'], __('Shown at 4 guests: first and last name. Needs the Checkout Fields listed below.', 'dcc-checkout'));
                    $this->text_row(__('Pet section title', 'dcc-checkout'), 'pet_section_title', (string) $s['pet_section_title'], '');
                    ?>
                </table>

                <?php $this->render_guest_field_reference(); ?>

                <?php submit_button(); ?>
            </form>

            <hr>
            <h2><?php echo esc_html__('Reminder', 'dcc-checkout'); ?></h2>
            <p style="max-width:640px">
                <?php echo esc_html__('For every cottage you add above, the three pet-fee Services must also be enabled for that accommodation type in MotoPress: Bookings → Accommodation Types → (cottage) → Services. Without that, ticking the service has no effect for that cottage.', 'dcc-checkout'); ?>
            </p>
            <p style="max-width:640px">
                <?php
                echo esc_html__('To show the captured dog info in confirmation emails, add the tag %dcc_dog_details% to your MotoPress email template (Bookings → Settings → Emails). It is always visible on the booking edit screen regardless.', 'dcc-checkout');
                ?>
            </p>
        </div>
        <?php
    }

    /**
     * Multi-select of published mphb_room_type posts. Shared by the pet-fee and
     * extra-guest-fee sections; $warn_service_ids drives the best-effort
     * "services not enabled on this cottage" flag per option.
     *
     * @param int[]  $selected
     * @param string $field_key        Settings array key to submit under.
     * @param int[]  $warn_service_ids Service IDs that should be enabled on a
     *                                 selected accommodation (empty/zero = skip
     *                                 the warning entirely).
     */
    private function render_accommodations_field(array $selected, string $field_key, array $warn_service_ids): void
    {
        $selected = array_map('intval', $selected);
        $warn_service_ids = array_values(array_filter(array_map('intval', $warn_service_ids)));
        $rooms    = get_posts([
            'post_type'      => 'mphb_room_type',
            'post_status'    => 'publish',
            'numberposts'    => -1,
            'orderby'        => 'title',
            'order'          => 'ASC',
            'suppress_filters' => false,
        ]);

        if (empty($rooms)) {
            echo '<p>' . esc_html__('No accommodation types found.', 'dcc-checkout') . '</p>';
            return;
        }

        echo '<select name="' . esc_attr(Config::OPTION) . '[' . esc_attr($field_key) . '][]" multiple size="8" style="min-width:320px">';
        foreach ($rooms as $room) {
            $id      = (int) $room->ID;
            $missing = $this->accommodation_missing_services($id, $warn_service_ids);
            $label   = $room->post_title . ' (#' . $id . ')';
            if ($missing === true) {
                /* translators: appended to a cottage name when the required services aren't enabled on it. */
                $label .= ' — ' . __('⚠ services not enabled', 'dcc-checkout');
            }
            printf(
                '<option value="%d"%s>%s</option>',
                $id,
                selected(in_array($id, $selected, true), true, false),
                esc_html($label)
            );
        }
        echo '</select>';
        echo '<p class="description">' . esc_html__('Hold Ctrl/Cmd to select multiple.', 'dcc-checkout') . '</p>';
    }

    /**
     * A number_row for a MotoPress Service ID, with a live status line so a
     * typo can't silently leave a feature dormant: looks the ID up and shows
     * the service title, or a warning if no published service has that ID.
     */
    private function service_id_row(string $label, string $key, int $value, string $desc): void
    {
        $this->number_row($label, $key, $value, $desc, $this->service_status_html($value));
    }

    /** Escaped status markup for a Service ID (empty string for 0). */
    private function service_status_html(int $id): string
    {
        if ($id <= 0) {
            return '';
        }
        $post = get_post($id);
        if ($post instanceof \WP_Post && $post->post_type === 'mphb_room_service' && $post->post_status === 'publish') {
            return '<p class="description" style="color:#1a7f37">' . esc_html('✓ ' . $post->post_title) . '</p>';
        }
        return '<p class="description" style="color:#b32d2e">'
            . esc_html__('⚠ No published MotoPress Service has this ID — the feature will stay dormant.', 'dcc-checkout')
            . '</p>';
    }

    private function number_row(string $label, string $key, int $value, string $desc, string $extra_html = ''): void
    {
        printf(
            '<tr><th scope="row"><label for="dcc_%1$s">%2$s</label></th><td>'
            . '<input type="number" min="0" step="1" id="dcc_%1$s" name="%3$s[%1$s]" value="%4$d" class="small-text" />',
            esc_attr($key),
            esc_html($label),
            esc_attr(Config::OPTION),
            (int) $value
        );
        if ($desc !== '') {
            echo '<p class="description">' . esc_html($desc) . '</p>';
        }
        echo $extra_html; // phpcs:ignore WordPress.Security.EscapeOutput -- built escaped in service_status_html()
        echo '</td></tr>';
    }

    private function text_row(string $label, string $key, string $value, string $desc, string $extra_html = ''): void
    {
        printf(
            '<tr><th scope="row"><label for="dcc_%1$s">%2$s</label></th><td>'
            . '<input type="text" id="dcc_%1$s" name="%3$s[%1$s]" value="%4$s" class="regular-text" />',
            esc_attr($key),
            esc_html($label),
            esc_attr(Config::OPTION),
            esc_attr($value)
        );
        if ($desc !== '') {
            echo '<p class="description">' . esc_html($desc) . '</p>';
        }
        echo $extra_html; // phpcs:ignore WordPress.Security.EscapeOutput -- built escaped in field_name_status_html()
        echo '</td></tr>';
    }

    /**
     * Reference table of the Checkout Fields each conditional guest section
     * needs, showing the MotoPress field SLUG next to the input name the field
     * renders as. Built from Config::guest_field_groups() so it can't drift
     * from what the JS and the server backstop actually look for.
     */
    private function render_guest_field_reference(): void
    {
        $groups = Config::guest_field_groups();
        if (empty($groups)) {
            return;
        }
        echo '<h3>' . esc_html__('Checkout Fields these sections need', 'dcc-checkout') . '</h3>';
        echo '<p class="description" style="max-width:640px">'
            . esc_html__('Create these under Bookings → Settings → Checkout Fields and leave them NOT required — the plugin makes them required only while their section is visible. Create each one using the NAME column: MotoPress renders the input as "mphb_" + that name, which is the value in the Renders as column. A field created as "mphb_guest3_first_name" would render as mphb_mphb_guest3_first_name and the section would silently never appear. Field order does not matter — the rows are moved into their section on load.', 'dcc-checkout')
            . '</p>';
        echo '<table class="widefat striped" style="max-width:640px"><thead><tr>'
            . '<th>' . esc_html__('Section', 'dcc-checkout') . '</th>'
            . '<th>' . esc_html__('Create field with name', 'dcc-checkout') . '</th>'
            . '<th>' . esc_html__('Renders as', 'dcc-checkout') . '</th>'
            . '</tr></thead><tbody>';
        foreach ($groups as $group) {
            foreach ((array) $group['names'] as $name) {
                $name = (string) $name;
                $slug = strncmp($name, 'mphb_', 5) === 0 ? substr($name, 5) : $name;
                printf(
                    '<tr><td>%1$s</td><td><code>%2$s</code></td><td><code>%3$s</code></td></tr>',
                    esc_html((string) $group['title']),
                    esc_html($slug),
                    esc_html($name)
                );
            }
        }
        echo '</tbody></table>';
    }

    /**
     * A Checkout Field name row: the value stored here is the RENDERED INPUT
     * NAME, which MotoPress builds as 'mphb_' . $field->name — so the field's
     * own slug in MotoPress is this value WITHOUT the mphb_ prefix.
     */
    private function field_name_row(string $label, string $key, string $value, string $desc): void
    {
        $this->text_row($label, $key, $value, $desc, $this->field_name_status_html($value));
    }

    /**
     * Escaped status markup for a Checkout Field input name. Catches the two
     * ways this gets typed wrong, in the same spirit as service_status_html():
     *
     *  - 'mphb_mphb_dog_type'  the slug was created WITH the prefix, so
     *                          MotoPress prefixed it again. Nothing ever matches.
     *  - 'dog_type'            the slug was entered here instead of the
     *                          rendered input name.
     *
     * Both are pure string shape — no MotoPress internals are assumed.
     */
    private function field_name_status_html(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        if (strncmp($value, 'mphb_mphb_', 10) === 0) {
            return '<p class="description" style="color:#b32d2e">' . esc_html(sprintf(
                /* translators: 1: the double-prefixed value, 2: the corrected MotoPress field slug. */
                __('⚠ Double-prefixed: %1$s. Rename the MotoPress Checkout Field slug to %2$s — MotoPress adds the mphb_ prefix itself when it renders the input.', 'dcc-checkout'),
                $value,
                substr($value, 5)
            )) . '</p>';
        }
        if (strncmp($value, 'mphb_', 5) !== 0) {
            return '<p class="description" style="color:#b32d2e">' . esc_html(sprintf(
                /* translators: 1: the value entered, 2: the rendered input name it should be. */
                __('⚠ This looks like the field slug, not the rendered input name. If the MotoPress Checkout Field slug is %1$s, enter %2$s here.', 'dcc-checkout'),
                $value,
                'mphb_' . $value
            )) . '</p>';
        }
        return '<p class="description" style="color:#1a7f37">' . esc_html(sprintf(
            /* translators: %s: the MotoPress Checkout Field slug. */
            __('✓ MotoPress Checkout Field slug: %s', 'dcc-checkout'),
            substr($value, 5)
        )) . '</p>';
    }

    /**
     * Best-effort check: are all the given Services enabled on this accommodation
     * type? Returns true (missing), false (present), or null (couldn't determine).
     *
     * DCC-VERIFY: provisional — confirm against live MotoPress.
     * MotoPress stores per-accommodation service enablement in a way that varies
     * by version; we read the room type's own service list via the public API
     * when available and never warn unless we can positively determine absence
     * (so we can't produce a false alarm). Confirm the accessor on staging.
     *
     * @param int[] $service_ids
     */
    private function accommodation_missing_services(int $room_type_id, array $service_ids): ?bool
    {
        if (empty($service_ids) || !function_exists('MPHB')) {
            return null;
        }

        try {
            $repo = MPHB()->getRoomTypeRepository();
            if (!$repo || !method_exists($repo, 'findById')) {
                return null;
            }
            $room_type = $repo->findById($room_type_id);
            if (!$room_type || !method_exists($room_type, 'getServices')) {
                return null; // Can't read services → don't guess.
            }
            $enabled = [];
            foreach ((array) $room_type->getServices() as $service) {
                if (is_object($service) && method_exists($service, 'getId')) {
                    $enabled[] = (int) $service->getId();
                } elseif (is_numeric($service)) {
                    $enabled[] = (int) $service;
                }
            }
            if (empty($enabled)) {
                return null; // Empty could mean "unreadable"; stay silent.
            }
            foreach ($service_ids as $sid) {
                if (!in_array($sid, $enabled, true)) {
                    return true; // At least one pet service is missing.
                }
            }
            return false;
        } catch (\Throwable $e) {
            return null;
        }
    }
}
