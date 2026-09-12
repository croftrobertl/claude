<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Guest ID images: one-click deletion, and keeping the store unreadable.
 *
 * Guests upload a photo ID at checkout. MotoPress stores the file under
 * wp-content/uploads/mphb_protected_uploads/ and records it in the booking's
 * mphb_upload_id meta. Retention is ON REQUEST ONLY (owner decision, 2026-09):
 * there is no schedule, so the manual path IS the practice, and until now that
 * path was SSH and rm.
 *
 * Three jobs:
 *   1. A delete button on the booking screen — nonce'd, capability-gated,
 *      confirmed, logged.
 *   2. The file follows the booking into permanent deletion (not the trash).
 *   3. index.php and .htaccess are re-created whenever we get the chance, so a
 *      host migration that drops dotfiles cannot silently expose sixteen
 *      driving licences.
 *
 * THE SAFETY PROPERTY THAT MATTERS: this code deletes files from a path partly
 * derived from post meta. contain() is the only thing standing between that and
 * deleting something else, so it is a pure static function with no WordPress
 * dependencies and it is unit-tested directly (tests/id-files/). Nothing here
 * unlinks a path that has not been through it.
 */
final class Id_Files
{
    /** Booking meta key holding the uploaded ID (verified on live). */
    public const META_KEY = 'mphb_upload_id';

    /** Append-only deletion log, rendered on the booking screen. */
    public const LOG_META = '_dcc_id_deletions';

    private const BOOKING_POST_TYPE = 'mphb_booking';
    private const ACTION            = 'dcc_delete_id_image';

    /** Throttle for the guard-file check on admin requests. */
    private const GUARD_TRANSIENT = 'dcc_checkout_id_guards';

    public function register(): void
    {
        add_action('add_meta_boxes', [$this, 'add_meta_box']);
        add_action('admin_post_' . self::ACTION, [$this, 'handle_delete']);

        // Permanent deletion only. before_delete_post does NOT fire on trash,
        // so a trashed-then-restored booking keeps its ID, as intended.
        add_action('before_delete_post', [$this, 'on_permanent_delete'], 10, 2);

        // Self-healing guards: on activation (see the bootstrap), on checkout
        // submissions — which is exactly when a file is uploaded — and at most
        // once an hour on an admin request.
        add_action('wp_loaded', [$this, 'ensure_guards_on_upload'], 2);
        add_action('admin_init', [$this, 'ensure_guards_throttled']);
    }

    /* --------------------------------------------------------------------- *
     * Paths — the security core
     * --------------------------------------------------------------------- */

    /**
     * Is $candidate a real FILE inside $base? Returns its canonical path, or
     * null. Pure: no WordPress, no globals, no side effects.
     *
     * Both sides are resolved with realpath() before comparison, so symlinks,
     * "..", "./", duplicate slashes and trailing-separator tricks are all
     * normalized away rather than pattern-matched. The base gets a trailing
     * separator appended before the prefix test, so "/uploads/protected-evil"
     * cannot pass as being inside "/uploads/protected".
     */
    public static function contain(string $base, string $candidate): ?string
    {
        if ($base === '' || $candidate === '') {
            return null;
        }
        $real_base = realpath($base);
        $real_file = realpath($candidate);
        if ($real_base === false || $real_file === false) {
            return null;                       // Nothing to delete.
        }
        if (!is_file($real_file)) {
            return null;                       // Never a directory.
        }
        $prefix = rtrim($real_base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        if (strncmp($real_file, $prefix, strlen($prefix)) !== 0) {
            return null;                       // Outside the store.
        }
        return $real_file;
    }

    /**
     * Turn a stored meta value into a canonical path inside the store, or null.
     *
     * The value's shape is not guaranteed, so several are accepted: a bare
     * filename, a path relative to the store, an absolute path, a URL, or an
     * attachment ID. Every branch ends at contain(), which is what actually
     * decides — so an unexpected shape fails closed rather than reaching
     * unlink() with something unvetted.
     */
    public static function resolve(string $stored, string $base, ?string $attached = null): ?string
    {
        $stored = trim($stored);
        if ($stored === '') {
            return null;
        }

        // Attachment ID — the caller resolves it via get_attached_file().
        if (ctype_digit($stored)) {
            return $attached === null ? null : self::contain($base, $attached);
        }

        // URL: keep only what follows the store's own directory name.
        if (preg_match('#^https?://#i', $stored)) {
            $path = (string) parse_url($stored, PHP_URL_PATH);
            $dir  = basename(rtrim($base, DIRECTORY_SEPARATOR));
            $pos  = strpos($path, '/' . $dir . '/');
            if ($pos === false) {
                return null;
            }
            $stored = substr($path, $pos + strlen($dir) + 2);
        }

        $stored = str_replace('\\', '/', rawurldecode($stored));

        // An absolute path is taken as-is; contain() still has the final say.
        if (strpos($stored, '/') === 0) {
            return self::contain($base, $stored);
        }
        return self::contain($base, rtrim($base, DIRECTORY_SEPARATOR) . '/' . $stored);
    }

    /** Absolute path of the protected upload store. */
    public static function store_dir(): string
    {
        $uploads = wp_get_upload_dir();
        $base    = isset($uploads['basedir']) ? (string) $uploads['basedir'] : '';
        $dir     = (string) apply_filters('dcc_checkout_id_store_dir', 'mphb_protected_uploads');
        return $base === '' ? '' : rtrim($base, '/\\') . '/' . $dir;
    }

    /* --------------------------------------------------------------------- *
     * Guard files
     * --------------------------------------------------------------------- */

    /**
     * The two files that keep the store unreadable, as name => contents.
     *
     * .htaccess covers Apache (the live host). index.php covers the case
     * Apache cannot: a server that ignores .htaccess entirely, or a migration
     * that drops dotfiles — directory listing then falls back to index.php,
     * which does nothing. Neither is sufficient alone.
     *
     * Pure, so the contents can be asserted in a test.
     *
     * @return array<string,string>
     */
    public static function guard_files(): array
    {
        return [
            'index.php' => "<?php\n// Silence is golden.\n",
            '.htaccess' => implode("\n", [
                '# Guest photo IDs. Not public, ever.',
                '# Written by DCC Custom Checkout; re-created if it goes missing.',
                '<IfModule mod_authz_core.c>',
                '    Require all denied',
                '</IfModule>',
                '<IfModule !mod_authz_core.c>',
                '    Order allow,deny',
                '    Deny from all',
                '</IfModule>',
                '',
            ]),
        ];
    }

    /**
     * Write any missing guard file. Never overwrites one that already exists —
     * a host or admin may have hardened it further.
     *
     * @return string[] Names of the files it had to create.
     */
    public static function ensure_guards(): array
    {
        $dir = self::store_dir();
        if ($dir === '') {
            return [];
        }
        if (!is_dir($dir) && !wp_mkdir_p($dir)) {
            return [];
        }
        $written = [];
        foreach (self::guard_files() as $name => $contents) {
            $path = $dir . '/' . $name;
            if (file_exists($path)) {
                continue;
            }
            if (file_put_contents($path, $contents) !== false) {
                $written[] = $name;
            }
        }
        return $written;
    }

    /** Runs on plugin activation. */
    public static function on_activate(): void
    {
        self::ensure_guards();
        delete_transient(self::GUARD_TRANSIENT);
    }

    /** A checkout submission means a file may have just been written. */
    public function ensure_guards_on_upload(): void
    {
        if (is_admin() || wp_doing_ajax()) {
            return;
        }
        if (!Checkout_Request::is_checkout_submission()) {
            return;
        }
        self::ensure_guards();
    }

    /** Cheap periodic check so a migration is caught without a checkout. */
    public function ensure_guards_throttled(): void
    {
        if (get_transient(self::GUARD_TRANSIENT)) {
            return;
        }
        set_transient(self::GUARD_TRANSIENT, 1, HOUR_IN_SECONDS);
        self::ensure_guards();
    }

    /**
     * Ask the web server whether the store is reachable from outside.
     *
     * Writes a throwaway probe file, requests it over HTTP, deletes it. This is
     * the only way to verify the /privacy/ promise — a stat() cannot tell you
     * what Apache will serve. Returns ['ok' => bool, 'code' => int, 'note' => string].
     *
     * @return array{ok:bool,code:int,note:string}
     */
    public static function probe_public_access(): array
    {
        $dir = self::store_dir();
        if ($dir === '' || !is_dir($dir)) {
            return ['ok' => false, 'code' => 0, 'note' => __('Store directory not found.', 'dcc-checkout')];
        }
        $name = 'dcc-access-probe-' . wp_generate_password(12, false) . '.txt';
        $path = $dir . '/' . $name;
        if (file_put_contents($path, 'dcc-probe') === false) {
            return ['ok' => false, 'code' => 0, 'note' => __('Could not write a probe file.', 'dcc-checkout')];
        }

        $uploads = wp_get_upload_dir();
        $url = rtrim((string) ($uploads['baseurl'] ?? ''), '/') . '/'
            . basename(rtrim($dir, '/')) . '/' . $name;

        $res  = wp_remote_get($url, ['timeout' => 10, 'sslverify' => false, 'redirection' => 0]);
        $code = is_wp_error($res) ? 0 : (int) wp_remote_retrieve_response_code($res);
        $body = is_wp_error($res) ? '' : (string) wp_remote_retrieve_body($res);

        @unlink($path);

        if (is_wp_error($res)) {
            return ['ok' => false, 'code' => 0, 'note' => $res->get_error_message()];
        }
        // Anything that is not a refusal, or that returns the file's contents,
        // is a failure — a 200 serving the probe means the store is public.
        $denied = in_array($code, [401, 403, 404], true) && strpos($body, 'dcc-probe') === false;
        return [
            'ok'   => $denied,
            'code' => $code,
            'note' => $denied
                ? __('The web server refuses to serve files from this directory.', 'dcc-checkout')
                : __('The web server SERVED the probe file. Guest IDs are publicly readable.', 'dcc-checkout'),
        ];
    }

    /* --------------------------------------------------------------------- *
     * Booking screen
     * --------------------------------------------------------------------- */

    public function add_meta_box(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        add_meta_box(
            'dcc-checkout-id',
            __('Guest ID image', 'dcc-checkout'),
            [$this, 'render_meta_box'],
            self::BOOKING_POST_TYPE,
            'side',
            'default'
        );
    }

    public function render_meta_box(\WP_Post $post): void
    {
        $dir    = self::store_dir();
        $stored = (string) get_post_meta($post->ID, self::META_KEY, true);
        $file   = $stored === '' ? null : self::resolve(
            $stored,
            $dir,
            ctype_digit(trim($stored)) ? (string) get_attached_file((int) $stored) : null
        );

        echo '<div class="dcc-id-box">';

        if ($stored !== '' && $file !== null) {
            // The FILENAME only. The image is never rendered — not here, and
            // not in any list view.
            printf(
                '<p><strong>%1$s</strong><br><code style="word-break:break-all">%2$s</code></p>'
                . '<p class="description">%3$s</p>',
                esc_html__('On file:', 'dcc-checkout'),
                esc_html(basename($file)),
                esc_html(sprintf(
                    /* translators: %s: human-readable file size. */
                    __('%s. Stored outside public reach; the image is deliberately not shown here.', 'dcc-checkout'),
                    size_format((int) filesize($file))
                ))
            );

            $url = wp_nonce_url(
                admin_url('admin-post.php?action=' . self::ACTION . '&booking=' . $post->ID),
                self::ACTION . '_' . $post->ID
            );
            printf(
                '<p><a href="%1$s" class="button button-link-delete"'
                . ' onclick="return confirm(%2$s);">%3$s</a></p>',
                esc_url($url),
                // esc_attr, not esc_js: this lands inside a double-quoted
                // HTML attribute, so the JSON string's quotes must become
                // &quot; entities. esc_js would emit backslashed quotes and
                // the onclick would be broken JavaScript.
                esc_attr(wp_json_encode(__("Permanently delete this guest's ID image? This cannot be undone.", 'dcc-checkout'))),
                esc_html__('Delete ID image', 'dcc-checkout')
            );
        } elseif ($stored !== '') {
            printf(
                '<p>%s</p><p class="description"><code style="word-break:break-all">%s</code></p>',
                esc_html__('This booking records an ID, but the file is not in the protected store — it may already have been deleted.', 'dcc-checkout'),
                esc_html($stored)
            );
        } else {
            printf('<p>%s</p>', esc_html__('No ID image on this booking.', 'dcc-checkout'));
        }

        $this->render_log($post->ID);
        echo '</div>';
    }

    /**
     * The fallback history — shown ONLY for deletions that did not reach
     * MotoPress's own log.
     *
     * When addLog() works, the note is already in the Logs box on this screen;
     * a second copy under the button would read as two separate deletions.
     * When it does not work, this is the only audit trail there is, so it
     * appears. Exactly one visible record per deletion, either way.
     *
     * Entries that DID land are still stored in post meta as an independent
     * record — MotoPress's logs are wp_comments rows, and anything that prunes
     * comments would take them.
     */
    private function render_log(int $booking_id): void
    {
        $log = get_post_meta($booking_id, self::LOG_META, true);
        if (!is_array($log)) {
            return;
        }
        $log = array_filter($log, static function ($entry) {
            return is_array($entry) && empty($entry['logged']);
        });
        if (empty($log)) {
            return;
        }
        echo '<hr><p><strong>' . esc_html__('Deletion history', 'dcc-checkout') . '</strong></p>';
        echo '<p class="description">'
            . esc_html__('Recorded here because MotoPress\'s booking log could not be written.', 'dcc-checkout')
            . '</p><ul>';
        foreach (array_reverse($log) as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            printf(
                '<li>%s</li>',
                esc_html(sprintf(
                    /* translators: 1: file name, 2: date and time, 3: user name. */
                    __('%1$s deleted %2$s by %3$s', 'dcc-checkout'),
                    (string) ($entry['file'] ?? '?'),
                    (string) ($entry['when'] ?? '?'),
                    (string) ($entry['who'] ?? '?')
                ))
            );
        }
        echo '</ul>';
    }

    /* --------------------------------------------------------------------- *
     * Deletion
     * --------------------------------------------------------------------- */

    public function handle_delete(): void
    {
        $booking_id = isset($_GET['booking']) ? (int) $_GET['booking'] : 0;

        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You are not allowed to delete guest ID images.', 'dcc-checkout'), '', ['response' => 403]);
        }
        check_admin_referer(self::ACTION . '_' . $booking_id);

        $post = get_post($booking_id);
        if (!$post instanceof \WP_Post || $post->post_type !== self::BOOKING_POST_TYPE) {
            wp_die(esc_html__('That is not a booking.', 'dcc-checkout'), '', ['response' => 400]);
        }

        $result = self::delete_for_booking($booking_id, 'manual');

        wp_safe_redirect(add_query_arg(
            'dcc_id_deleted',
            $result ? '1' : '0',
            get_edit_post_link($booking_id, 'raw') ?: admin_url()
        ));
        exit;
    }

    /**
     * The ID file follows the booking into PERMANENT deletion. Trash does not
     * fire this hook, so a trashed booking that is restored keeps its ID.
     *
     * @param int          $post_id
     * @param \WP_Post|null $post
     */
    public function on_permanent_delete($post_id, $post = null): void
    {
        $post = $post instanceof \WP_Post ? $post : get_post((int) $post_id);
        if (!$post instanceof \WP_Post || $post->post_type !== self::BOOKING_POST_TYPE) {
            return;
        }
        self::delete_for_booking((int) $post_id, 'booking-deleted');
    }

    /**
     * Delete the stored file and clear the meta. Returns true only if a file
     * was actually unlinked.
     *
     * Nothing reaches unlink() without passing contain() first.
     */
    public static function delete_for_booking(int $booking_id, string $reason): bool
    {
        $stored = (string) get_post_meta($booking_id, self::META_KEY, true);
        if ($stored === '') {
            return false;
        }
        $file = self::resolve(
            $stored,
            self::store_dir(),
            ctype_digit(trim($stored)) ? (string) get_attached_file((int) $stored) : null
        );

        $deleted = false;
        $name    = $file !== null ? basename($file) : $stored;
        if ($file !== null) {
            $deleted = @unlink($file);
        }

        if ($deleted) {
            delete_post_meta($booking_id, self::META_KEY);
            $logged = self::add_native_log($booking_id, $name, $reason);
            self::log($booking_id, $name, $reason, $logged);
            /**
             * Fires after a guest ID image is deleted.
             *
             * @param int    $booking_id
             * @param string $name    File that was deleted.
             * @param string $reason  'manual' or 'booking-deleted'.
             * @param bool   $logged  Whether it reached MotoPress's own log.
             */
            do_action('dcc_checkout_id_deleted', $booking_id, $name, $reason, $logged);
        }
        return $deleted;
    }

    /**
     * The audit line, in MotoPress's own log voice ("Status changed from New
     * to Auto Draft."). Pure, so the wording can be asserted in a test.
     */
    public static function note_text(string $file, string $reason, string $who): string
    {
        $reasons = [
            'manual'          => __('deleted on request', 'dcc-checkout'),
            'booking-deleted' => __('deleted with the booking', 'dcc-checkout'),
        ];
        return sprintf(
            /* translators: 1: file name, 2: what happened, 3: who did it. */
            __('Guest ID image "%1$s" %2$s by %3$s.', 'dcc-checkout'),
            $file,
            $reasons[$reason] ?? $reason,
            $who
        );
    }

    /** Who is doing this, for the audit line. */
    private static function current_actor(): string
    {
        $user = wp_get_current_user();
        return ($user && $user->exists())
            ? $user->display_name . ' (' . $user->user_login . ')'
            : __('system', 'dcc-checkout');
    }

    /**
     * Write the deletion into MotoPress's own booking log.
     *
     * \MPHB\Entities\Booking::addLog() (includes/entities/booking.php:393)
     * stores a wp_comments row with comment_type 'mphb_booking_log', which is
     * what the Logs box on the booking screen reads — so the note lands where
     * the admin is already looking.
     *
     * Called with the message only. addLog's second parameter is an author
     * whose expected type is not documented, and the actor is already named in
     * the message, so there is nothing to gain by guessing it.
     *
     * VERIFIED, not assumed: the log rows are counted before and after against
     * the storage the API actually uses. addLog() returning nothing and
     * silently doing nothing would otherwise look like success, and the admin
     * would get no audit trail at all. If the count does not rise — a
     * MotoPress update, a renamed comment_type, the plugin deactivated — this
     * returns false and the on-screen fallback history renders instead.
     * Every failure mode here is non-fatal by construction.
     */
    private static function add_native_log(int $booking_id, string $file, string $reason): bool
    {
        if (!function_exists('MPHB')) {
            return false;
        }
        $count_args = [
            'post_id' => $booking_id,
            'type'    => 'mphb_booking_log',
            'status'  => 'any',
            'count'   => true,
        ];
        try {
            $repo = MPHB()->getBookingRepository();
            if (!$repo || !method_exists($repo, 'findById')) {
                return false;
            }
            $booking = $repo->findById($booking_id);
            if (!is_object($booking) || !method_exists($booking, 'addLog')) {
                return false;
            }
            $before = (int) get_comments($count_args);
            $booking->addLog(self::note_text($file, $reason, self::current_actor()));
            return (int) get_comments($count_args) > $before;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Append to the booking's deletion history: what, when, and who.
     * Post meta, not a file — an audit trail in a log file on shared hosting
     * is neither readable by the owner nor safe to leave lying about.
     */
    private static function log(int $booking_id, string $file, string $reason, bool $logged): void
    {
        $log = get_post_meta($booking_id, self::LOG_META, true);
        if (!is_array($log)) {
            $log = [];
        }
        $log[] = [
            'file'   => $file,
            'when'   => current_time('Y-m-d H:i:s'),
            'who'    => self::current_actor(),
            'reason' => $reason,
            // Whether MotoPress's own log took it. Entries that DID land are
            // recorded here but not rendered — the note is already on screen
            // in the Logs box, and printing it twice reads like two deletions.
            'logged' => $logged,
        ];
        // Keep the history bounded; it is a note, not a ledger.
        update_post_meta($booking_id, self::LOG_META, array_slice($log, -20));
    }
}
