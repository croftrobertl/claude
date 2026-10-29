<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The "Bringing a boat or trailer?" Checkout Field (v0.31.0, owner's picks
 * 2026-10-10), created ONCE by this plugin as a native MotoPress Checkout
 * Fields field, so the checkout, Add New and the booking edit screen all get it
 * from MotoPress itself.
 *
 * THE CONTRACT the Availability Calendar reads (Director's brief):
 * post title "Bringing a boat or trailer?", mphb_cf_name "boat", type
 * "select", options blank / No / Yes, not required, enabled. MotoPress saves
 * the answer as booking meta `mphb_boat` (the mphb_<cf_name> pattern, proven
 * on 17730's mphb_dog_type) and returns it as getCustomFields()['boat'].
 *
 * EVERY STORED VALUE IS COPIED FROM A REAL FIELD (Director, raw from the live
 * database, 2026-10-10): Dog Size (17727) is a select whose meta is the full
 * set below, and whose mphb_cf_options is a PHP-SERIALISED array of
 * ['value' => …, 'label' => …] rows. The add-on 1.2.3 reads options with
 * get_post_meta(…, true) and uses them only if is_array(): a JSON string would
 * give a dropdown with no options and no error. update_post_meta() with a PHP
 * array stores exactly the serialised form Dog Size has. The label is the
 * post_title (CheckoutFieldRepository::mapPostToEntity()).
 *
 * THE RULES (owner's picks):
 *  - Created once, never recreated (C): the first run records a marker option,
 *    and while it exists nothing here runs again — even if the field is later
 *    deleted or trashed. A field already named "boat" in ANY status, trash
 *    included, is adopted as it stands: never duplicated, never edited.
 *  - Placed directly above the dog questions, after Photo ID (A). Live has
 *    upload_id at 14 and dog_type at 15 with no gap, so the field takes 15 and
 *    every field at 15 or later moves down one — ONLY in the request that
 *    creates it, and only if the order is still the one read on live (Photo ID
 *    directly before Dog Type, nothing between). If Rob has reordered, nothing
 *    is renumbered and the field goes last. Every move is recorded in the
 *    marker (id, name, from, to) so it can be reversed by hand.
 *  - There is no safer way to the same order: menu_order is an integer and
 *    the add-on's order for two fields on the SAME number is not known, so a
 *    tie with upload_id or dog_type would be a guess.
 *
 * Positions are written with $wpdb->update on menu_order alone, not
 * wp_update_post(): that would fire every save_post handler, including the
 * add-on's, in a request that carries none of its form data. Meta is written
 * AFTER wp_insert_post() for the same reason: anything a save_post handler
 * writes during the insert is then overwritten by the values below.
 */
final class Boat_Field
{
    public const POST_TYPE = 'mphb_checkout_field';
    public const NAME      = 'boat';

    /** Stored data, not UI copy: Rob may edit it in WP-Admin, like every other field's title. */
    public const TITLE = 'Bringing a boat or trailer?';

    /** Marker option. Present = this plugin has done its one run; never runs again. */
    public const MARKER = 'dcc_checkout_boat_field';

    /** Where Rob put it: after this field, before that one (live: 14 and 15). */
    private const AFTER  = 'upload_id';
    private const BEFORE = 'dog_type';

    public function register(): void
    {
        add_action('admin_init', [self::class, 'maybe_create']);
    }

    /** admin_init: an administrator's ordinary admin page load, never AJAX. */
    public static function maybe_create(): void
    {
        if (wp_doing_ajax() || !current_user_can('manage_options')) {
            return;
        }
        self::ensure();
    }

    /**
     * The options, exactly as Dog Size stores its own: a blank first row so
     * nothing is ever pre-answered (the dog-size lesson, 2026-09-17).
     *
     * @return array<int, array{value:string,label:string}>
     */
    public static function options(): array
    {
        return [
            ['value' => '', 'label' => '— Select —'],
            ['value' => 'No', 'label' => 'No'],
            ['value' => 'Yes', 'label' => 'Yes'],
        ];
    }

    /**
     * Every meta key Dog Size carries (bar the editor's _edit_* locks), with
     * the boat field's values. Strings, as WordPress stores scalar meta.
     *
     * @return array<string, mixed>
     */
    public static function meta(): array
    {
        return [
            'mphb_cf_name'         => self::NAME,
            'mphb_cf_type'         => 'select',
            'mphb_cf_options'      => self::options(),
            'mphb_cf_required'     => '0',
            'mphb_cf_enabled'      => '1',
            'mphb_cf_checked'      => '0',
            'mphb_cf_css_class'    => '',
            'mphb_cf_description'  => '',
            'mphb_cf_file_types'   => '',
            'mphb_cf_inner_label'  => '',
            'mphb_cf_pattern'      => '',
            'mphb_cf_placeholder'  => '',
            'mphb_cf_text_content' => '',
            'mphb_cf_upload_size'  => '',
        ];
    }

    /**
     * The one run. Returns what it did (also stored as the marker), or null
     * when it did nothing — already run, or the add-on is not active (then it
     * tries again on a later page load).
     *
     * @return array<string, mixed>|null
     */
    public static function ensure(): ?array
    {
        if (get_option(self::MARKER, null) !== null) {
            return null;
        }
        if (!post_type_exists(self::POST_TYPE)) {
            return null;
        }

        $existing = self::find_existing();
        if ($existing > 0) {
            $record = [
                'state'   => 'adopted',
                'id'      => $existing,
                'version' => DCC_CHECKOUT_VERSION,
                'at_gmt'  => gmdate('Y-m-d H:i:s'),
            ];
            add_option(self::MARKER, $record, '', 'no');
            return $record;
        }

        // Claim the run before writing anything, so two admin page loads at
        // the same moment cannot both create the field.
        if (!add_option(self::MARKER, ['state' => 'creating', 'at_gmt' => gmdate('Y-m-d H:i:s')], '', 'no')) {
            return null;
        }

        $plan = self::plan(self::all_fields());

        $id = wp_insert_post([
            'post_type'   => self::POST_TYPE,
            'post_status' => 'publish',
            'post_title'  => self::TITLE,
            'menu_order'  => $plan['position'],
        ], true);
        if (is_wp_error($id) || (int) $id <= 0) {
            delete_option(self::MARKER); // nothing was created: free to try again
            return null;
        }
        $id = (int) $id;

        foreach (self::meta() as $key => $value) {
            update_post_meta($id, $key, $value);
        }
        $meta_ok = (string) get_post_meta($id, 'mphb_cf_name', true) === self::NAME
            && get_post_meta($id, 'mphb_cf_options', true) === self::options();

        $moved  = [];
        $failed = [];
        foreach ($plan['shift'] as $s) {
            if (self::set_order($s['id'], $s['to'])) {
                $moved[] = $s;
            } else {
                $failed[] = $s;
            }
        }

        $record = [
            'state'     => 'created',
            'id'        => $id,
            'version'   => DCC_CHECKOUT_VERSION,
            'at_gmt'    => gmdate('Y-m-d H:i:s'),
            'placement' => $plan['how'],
            'position'  => $plan['position'],
            'reason'    => $plan['reason'],
            'meta_ok'   => $meta_ok,
            // Previous positions, so the renumbering can be reversed by hand.
            'shifted'   => $moved,
            'failed'    => $failed,
        ];
        update_option(self::MARKER, $record, 'no');
        return $record;
    }

    /** A field named "boat" in any status (trash included), or 0. */
    private static function find_existing(): int
    {
        $ids = get_posts([
            'post_type'   => self::POST_TYPE,
            'post_status' => self::statuses(),
            'meta_key'    => 'mphb_cf_name',
            'meta_value'  => self::NAME,
            'numberposts' => 1,
            'orderby'     => 'ID',
            'order'       => 'ASC',
            'fields'      => 'ids',
        ]);
        return is_array($ids) && !empty($ids) ? (int) $ids[0] : 0;
    }

    /** Every status a field can be in, trash included; never auto-draft. */
    private static function statuses(): array
    {
        return array_values(array_diff(array_keys(get_post_stati()), ['auto-draft']));
    }

    /** @return array<int, array{id:int,name:string,order:int}> */
    private static function all_fields(): array
    {
        $posts = get_posts([
            'post_type'   => self::POST_TYPE,
            'post_status' => self::statuses(),
            'numberposts' => -1,
            'orderby'     => 'ID',
            'order'       => 'ASC',
        ]);
        $out = [];
        foreach ((array) $posts as $p) {
            $out[] = [
                'id'    => (int) $p->ID,
                'name'  => (string) get_post_meta((int) $p->ID, 'mphb_cf_name', true),
                'order' => (int) $p->menu_order,
            ];
        }
        return $out;
    }

    /**
     * Where the field goes, and what moves to make room. Pure: tested directly.
     *
     *  - 'shifted': Photo ID at P-1, Dog Type at P, nothing between — the
     *    field takes P and every field at P or later moves down one (live).
     *  - 'gap': a free number between them — the field takes it, nothing moves.
     *  - 'end': either is missing, or the order is not that one any more (Rob
     *    has reordered) — the field goes last and nothing moves.
     *
     * @param array<int, array{id:int,name:string,order:int}> $fields
     * @return array{position:int,how:string,reason:string,shift:array<int,array{id:int,name:string,from:int,to:int}>}
     */
    public static function plan(array $fields): array
    {
        $after = null;
        $before = null;
        $max = 0;
        foreach ($fields as $f) {
            $max = max($max, $f['order']);
            if ($after === null && $f['name'] === self::AFTER) {
                $after = $f['order'];
            }
            if ($before === null && $f['name'] === self::BEFORE) {
                $before = $f['order'];
            }
        }
        $end = static function (string $reason) use ($max): array {
            return ['position' => $max + 1, 'how' => 'end', 'reason' => $reason, 'shift' => []];
        };
        if ($after === null || $before === null) {
            return $end('Photo ID or Dog Type not found');
        }
        if ($before <= $after) {
            return $end('Dog Type is not after Photo ID (reordered)');
        }
        foreach ($fields as $f) {
            if ($f['order'] > $after && $f['order'] < $before) {
                return $end('another field sits between Photo ID and Dog Type (reordered)');
            }
        }
        if ($before - $after >= 2) {
            return ['position' => $after + 1, 'how' => 'gap', 'reason' => 'free number between Photo ID and Dog Type', 'shift' => []];
        }
        $shift = [];
        foreach ($fields as $f) {
            if ($f['order'] >= $before) {
                $shift[] = ['id' => $f['id'], 'name' => $f['name'], 'from' => $f['order'], 'to' => $f['order'] + 1];
            }
        }
        return ['position' => $before, 'how' => 'shifted', 'reason' => 'Photo ID directly before Dog Type, as on live', 'shift' => $shift];
    }

    /** menu_order alone, no save_post handlers. */
    private static function set_order(int $id, int $order): bool
    {
        global $wpdb;
        $ok = $wpdb->update($wpdb->posts, ['menu_order' => $order], ['ID' => $id], ['%d'], ['%d']);
        clean_post_cache($id);
        return $ok !== false;
    }
}
