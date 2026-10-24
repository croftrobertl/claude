<?php
namespace DCCR\Fortress;

use DCCR\Action\Htaccess_Block;
use DCCR\Action\Restore_Guard;
use DCCR\Alerts;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Htaccess;
use DCCR\Site;
use DCCR\State;
use DCCR\Text;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Revelin · Keeps The Sealed Copies. The guard add-ons, the .htaccess
 * block, Ragusa itself, and the previous version of each plugin taken
 * just before an update.
 */
final class Revelin
{
    public const MU_GUARDS = [
        'dcc-user-enum-guard.php',
        'dcc-postpass-guard.php',
        'dcc-ical-export-guard.php',
        'dcc-ical-privacy.php',
        'dcc-ragusa-zelenci.php',
    ];

    /** @return array<string,string> label => absolute path */
    public static function guards(): array
    {
        $out = [];
        foreach (self::MU_GUARDS as $file) {
            $out['mu-plugins/' . $file] = Site::mu_dir() . '/' . $file;
        }
        $up                                           = Site::uploads_dir();
        $out['uploads/.htaccess']                     = $up . '/.htaccess';
        $out['uploads/mphb_protected_uploads/.htaccess'] = $up . '/mphb_protected_uploads/.htaccess';
        return $out;
    }

    public static function guard_label(string $abs): ?string
    {
        foreach (self::guards() as $label => $path) {
            if ($path === $abs) {
                return $label;
            }
        }
        return null;
    }

    // --------------------------------------------------------------- seals

    /** First run: accept what is there as the good copy. */
    public static function first_run(): array
    {
        $lines = [];
        foreach (self::guards() as $label => $path) {
            if (is_file($path) && Vault::latest('guard', $label) === null) {
                if (Vault::seal_file('guard', $label, $path) !== null) {
                    $lines[] = 'Sealed ' . $label;
                    Events::record(Fortress::REVELIN, Events::INFO, 'sealed', $label, __('Sealed on first sight as the good copy.', 'dcc-ragusa'));
                }
            }
        }
        if (Vault::latest('htaccess-block', '.htaccess') === null) {
            $content = is_file(Htaccess::path()) ? (string) file_get_contents(Htaccess::path()) : '';
            $block   = Htaccess::extract_block($content);
            if ($block !== null && Vault::seal_text('htaccess-block', '.htaccess', $block, ['source' => '.htaccess']) !== null) {
                $lines[] = 'Sealed the .htaccess DCC Security block';
                Events::record(Fortress::REVELIN, Events::INFO, 'sealed', '.htaccess', __('The DCC Security block was sealed on first sight.', 'dcc-ragusa'));
            }
        }
        if (Vault::entries('self') === []) {
            self::seal_self();
            $lines[] = 'Sealed Ragusa\'s own files';
        }
        return $lines;
    }

    /** Seal every file of Ragusa itself, one entry per file, plus a zip of the whole. */
    public static function seal_self(): int
    {
        $n = 0;
        foreach (Vault::list_files(rtrim(DCCR_DIR, '/')) as $abs => $rel) {
            if (str_starts_with($rel, 'tests/') || str_starts_with($rel, 'docs/')) {
                continue;
            }
            if (Vault::seal_file('self', 'dcc-ragusa/' . $rel, $abs, ['version' => DCCR_VERSION]) !== null) {
                $n++;
            }
        }
        // Stale entries for files this version no longer ships.
        $present = array_values(Vault::list_files(rtrim(DCCR_DIR, '/')));
        foreach (Vault::entries('self') as $id => $e) {
            $rel = substr((string) $e['label'], strlen('dcc-ragusa/'));
            if (!in_array($rel, $present, true)) {
                Vault::remove($id);
            }
        }
        $why = null;
        $zip = Vault::seal_dir('plugin', 'dcc-ragusa', rtrim(DCCR_DIR, '/'), DCCR_VERSION, $why);
        if ($zip !== null) {
            $m                                   = Vault::manifest();
            $m['entries'][$zip['id']]['protected'] = true;
            Vault::save_manifest($m);
        }
        return $n;
    }

    /**
     * `wp ragusa seal <path>` and the Seal button: accept the current file.
     *
     * @return array{0:bool,1:string}
     */
    public static function seal(string $path): array
    {
        $abs = str_starts_with($path, '/') ? $path : Site::abspath() . '/' . ltrim($path, '/');
        $abs = (string) preg_replace('#/+#', '/', $abs);
        if (basename($abs) === '.htaccess' && dirname($abs) === Site::abspath()) {
            $content = is_file($abs) ? (string) file_get_contents($abs) : '';
            $block   = Htaccess::extract_block($content);
            if ($block === null) {
                return [false, __('No DCC Security block found between its markers in .htaccess.', 'dcc-ragusa')];
            }
            Vault::seal_text('htaccess-block', '.htaccess', $block, ['source' => '.htaccess']);
            Events::record(Fortress::REVELIN, Events::INFO, 'sealed', '.htaccess', __('The DCC Security block was sealed by request.', 'dcc-ragusa'));
            Alerts::resolve(Events::fingerprint(Fortress::REVELIN, 'htaccess-block-changed', '.htaccess'));
            return [true, __('Sealed the DCC Security block of .htaccess.', 'dcc-ragusa')];
        }
        if (!is_file($abs)) {
            return self::seal_missing($abs);
        }
        $label = self::guard_label($abs);
        if ($label !== null) {
            $entry = Vault::seal_file('guard', $label, $abs);
            if ($entry === null) {
                return [false, __('Could not copy the file into the vault.', 'dcc-ragusa')];
            }
            Events::record(Fortress::REVELIN, Events::INFO, 'sealed', $label, __('Sealed by request as the good copy.', 'dcc-ragusa'));
            foreach (['guard-restored', 'guard-keeps-changing', 'restore-reversed'] as $kind) {
                Alerts::resolve(Events::fingerprint(Fortress::REVELIN, $kind, Site::rel($abs)));
            }
            State::delete('restore-count.' . $label);
            /* translators: %s: label */
            return [true, sprintf(__('Sealed %s as the good copy.', 'dcc-ragusa'), $label)];
        }
        if (str_starts_with($abs, DCCR_DIR)) {
            $rel = substr($abs, strlen(DCCR_DIR));
            Vault::seal_file('self', 'dcc-ragusa/' . $rel, $abs, ['version' => DCCR_VERSION]);
            return [true, sprintf(__('Sealed Ragusa\'s own file %s.', 'dcc-ragusa'), $rel)];
        }
        // Anything else watched by Minčeta: accept it into the baseline.
        $rel = Site::rel($abs);
        Minceta::rebaseline($abs);
        /* translators: %s: path */
        return [true, sprintf(__('Accepted %s into the baseline.', 'dcc-ragusa'), $rel)];
    }

    /**
     * A file removed on purpose: drop it from Minčeta's baseline and settle
     * what its absence raised, so the next pass reports nothing. A guard is
     * never dropped this way: Ragusa would only put it back.
     *
     * @return array{0:bool,1:string}
     */
    private static function seal_missing(string $abs): array
    {
        $rel = Site::rel($abs);
        if (self::guard_label($abs) !== null) {
            /* translators: %s: path */
            return [false, sprintf(__('No file at %s, and it is a guard: Ragusa restores it from the sealed copy.', 'dcc-ragusa'), $rel)];
        }
        if (is_dir($abs) || str_starts_with($abs, DCCR_DIR)) {
            /* translators: %s: path */
            return [false, sprintf(__('No file at %s.', 'dcc-ragusa'), $rel)];
        }
        $n = Minceta::forget($abs);
        if ($n === 0) {
            /* translators: %s: path */
            return [false, sprintf(__('No file at %s, and nothing about it in the baseline.', 'dcc-ragusa'), $rel)];
        }
        Events::record(Fortress::MINCETA, Events::INFO, 'sealed', $rel, __('Removed from the baseline by request: it was deleted on purpose.', 'dcc-ragusa'));
        /* translators: %s: path */
        return [true, sprintf(__('Removed %s from the baseline.', 'dcc-ragusa'), $rel)];
    }

    // -------------------------------------------------------------- checks

    /**
     * Every tick: each sealed guard still matches, or A2 runs.
     *
     * @return string[]
     */
    public static function check_guards(): array
    {
        $lines = [];
        if (!Vault::verify_manifest()) {
            Alerts::raise([
                'fortress' => Fortress::REVELIN,
                'severity' => Events::BREACHED,
                'kind'     => 'manifest-unverified',
                'target'   => 'manifest',
                'title'    => __('Vault Manifest Does Not Verify', 'dcc-ragusa'),
                'what'     => __('The signature on the vault manifest does not match its contents.', 'dcc-ragusa'),
                'did'      => __('Ragusa stopped restoring anything from the vault until this is looked at.', 'dcc-ragusa'),
                'todo'     => __('Ask the site director to inspect ~/ragusa-vault and reseal the guards with wp ragusa seal.', 'dcc-ragusa'),
            ]);
            Fortress::note(Fortress::REVELIN, __('Manifest Does Not Verify', 'dcc-ragusa'));
            return [__('Vault manifest does not verify; guard checks skipped.', 'dcc-ragusa')];
        }
        $lines   = array_merge($lines, self::first_run());
        $pending = State::get('self_update_pending');

        foreach (self::guards() as $label => $path) {
            $entry = Vault::latest('guard', $label);
            if ($entry === null) {
                continue;
            }
            clearstatcache(true, $path);
            if (is_file($path) && hash_file('sha256', $path) === $entry['sha256']) {
                self::matched(Site::rel($path));
                continue;
            }
            self::mismatched(Site::rel($path));
            $r       = Restore_Guard::run(['label' => $label, 'path' => $path, 'entry' => $entry]);
            $lines[] = $r['message'];
        }

        if (!is_array($pending)) {
            foreach (Vault::entries('self') as $entry) {
                $rel = substr((string) $entry['label'], strlen('dcc-ragusa/'));
                $abs = DCCR_DIR . $rel;
                clearstatcache(true, $abs);
                if (is_file($abs) && hash_file('sha256', $abs) === $entry['sha256']) {
                    self::matched(Site::rel($abs));
                    continue;
                }
                self::mismatched(Site::rel($abs));
                $r       = Restore_Guard::run(['label' => (string) $entry['label'], 'path' => $abs, 'entry' => $entry]);
                $lines[] = $r['message'];
            }
        }

        $lines = array_merge($lines, self::check_htaccess_block());
        self::check_htaccess_order();
        self::check_booking_cache();
        self::update_status();
        return $lines;
    }

    /**
     * A booking page that SpeedyCache can cache: a dead "contain" rule (a
     * slash in a page rule's text) or a cached folder already there. Read-only,
     * no journal row; the two fixes are named and left to the Director.
     */
    public static function check_booking_cache(): void
    {
        $rules   = \DCCR\Speedycache::dead_booking_rules(get_option(\DCCR\Speedycache::OPTION, []));
        $folders = \DCCR\Speedycache::cached_booking_folders();
        $fp      = Events::fingerprint(Fortress::REVELIN, 'booking-cacheable', 'speedycache');
        if ($rules === [] && $folders === []) {
            Alerts::resolve($fp);
            return;
        }
        $what = [];
        $todo = [];
        if ($rules !== []) {
            $what[] = sprintf(
                /* translators: %s: the rule texts, quoted */
                _n('The SpeedyCache page rule %s carries a slash, and SpeedyCache compares its rules against the address with the slashes trimmed, so the rule never matches and the page is cached.', 'The SpeedyCache page rules %s carry slashes, and SpeedyCache compares its rules against the address with the slashes trimmed, so they never match and the pages are cached.', count($rules), 'dcc-ragusa'),
                '"' . implode('", "', $rules) . '"'
            );
            $todo[] = __('Remove the slashes from the rule text.', 'dcc-ragusa');
        }
        if ($folders !== []) {
            $what[] = sprintf(
                /* translators: %s: folders */
                _n('A cached copy of a booking page exists at %s; a guest carrying their dates can be served a stale page.', 'Cached copies of booking pages exist at %s; a guest carrying their dates can be served a stale page.', count($folders), 'dcc-ragusa'),
                implode(', ', $folders)
            );
            $todo[] = __('Delete the folder, then purge SpeedyCache and the server cache.', 'dcc-ragusa');
        }
        $items = sha1(wp_json_encode([$rules, $folders]));
        $open  = Alerts::get($fp);
        if ($open === null || Alerts::state($open) !== 'open' || ($open['data']['items'] ?? '') !== $items) {
            Events::record(Fortress::REVELIN, Events::NEEDS_LOOK, 'booking-cacheable', 'speedycache', __('A Booking Page Can Be Cached', 'dcc-ragusa') . ': ' . implode(' ', array_merge($rules, $folders)));
        }
        Alerts::raise([
            'fortress' => Fortress::REVELIN,
            'severity' => Events::NEEDS_LOOK,
            'kind'     => 'booking-cacheable',
            'target'   => 'speedycache',
            'title'    => __('A Booking Page Can Be Cached', 'dcc-ragusa'),
            'what'     => implode(' ', $what),
            'did'      => __('Ragusa changed nothing: it never rewrites SpeedyCache\'s rules or touches its cache.', 'dcc-ragusa'),
            'todo'     => implode(' ', $todo),
            'data'     => ['items' => $items],
        ]);
    }

    /**
     * The DCC Pre-gzipped Cache block must sit above SpeedyCache's. An
     * alert only, never a rewrite: the fix is named and left to the Director.
     * Without a SpeedyCache block (staging) there is nothing to order: one
     * info line when that is first seen, and no finding, ever.
     */
    public static function check_htaccess_order(): void
    {
        $content = is_file(Htaccess::path()) ? (string) file_get_contents(Htaccess::path()) : '';
        $problem = Htaccess::order_problem($content);
        $fp      = Events::fingerprint(Fortress::REVELIN, 'htaccess-order', '.htaccess');
        if ($problem === Htaccess::ORDER_NO_SPEEDY) {
            Alerts::resolve($fp);
            if (!(bool) State::get('htaccess.no_speedycache', false)) {
                State::set('htaccess.no_speedycache', true);
                Events::record(Fortress::REVELIN, Events::INFO, 'htaccess-order', '.htaccess', __('SpeedyCache has no rewrite block here; there is no block order to keep.', 'dcc-ragusa'));
            }
            return;
        }
        if ((bool) State::get('htaccess.no_speedycache', false)) {
            State::delete('htaccess.no_speedycache');
        }
        if ($problem === Htaccess::ORDER_OK) {
            Alerts::resolve($fp);
            return;
        }
        [$title, $what, $todo] = match ($problem) {
            Htaccess::ORDER_PREGZ_MISSING => [
                __('The Pre-gzipped Cache Block Is Missing', 'dcc-ragusa'),
                __('SpeedyCache has its "# BEGIN speedycache" block in .htaccess, but there is no "# BEGIN DCC Pre-gzipped Cache" block above it, so every page goes out uncompressed.', 'dcc-ragusa'),
                __('Put the DCC Pre-gzipped Cache block back, above # BEGIN speedycache.', 'dcc-ragusa'),
            ],
            default => [
                __('The Pre-gzipped Cache Block Is Below SpeedyCache', 'dcc-ragusa'),
                __('SpeedyCache wrote its block above the DCC Pre-gzipped Cache block. Its rule ends in [L], so the pre-gzipped files are never served and every page goes out uncompressed (the Wildlife guide at 520 KB instead of 224 KB).', 'dcc-ragusa'),
                __('Move the DCC Pre-gzipped Cache block above # BEGIN speedycache.', 'dcc-ragusa'),
            ],
        };
        $open = Alerts::get($fp);
        if ($open === null || Alerts::state($open) !== 'open' || ($open['data']['problem'] ?? '') !== $problem) {
            Events::record(Fortress::REVELIN, Events::NEEDS_LOOK, 'htaccess-order', '.htaccess', $title);
        }
        Alerts::raise([
            'fortress' => Fortress::REVELIN,
            'severity' => Events::NEEDS_LOOK,
            'kind'     => 'htaccess-order',
            'target'   => '.htaccess',
            'title'    => $title,
            'what'     => $what,
            'did'      => __('Ragusa changed nothing: it rewrites only the DCC Security block, never this one.', 'dcc-ragusa'),
            'todo'     => $todo,
            'data'     => ['problem' => $problem],
        ]);
    }

    public const RESTORE_KINDS = ['guard-restored', 'guard-keeps-changing', 'restore-reversed'];
    public const SETTLE_AFTER  = 86400;

    /** The file has matched its sealed copy: after a full day of that, its restore finding resolves. */
    private static function matched(string $rel): void
    {
        foreach (self::RESTORE_KINDS as $kind) {
            $fp = Events::fingerprint(Fortress::REVELIN, $kind, $rel);
            $a  = Alerts::get($fp);
            if ($a === null || Alerts::state($a) !== 'open') {
                continue;
            }
            $since = (int) ($a['data']['matched_since'] ?? 0);
            if ($since === 0) {
                Alerts::set_data($fp, 'matched_since', time());
            } elseif (time() - $since >= self::SETTLE_AFTER) {
                Alerts::resolve($fp);
            }
        }
    }

    private static function mismatched(string $rel): void
    {
        foreach (self::RESTORE_KINDS as $kind) {
            $fp = Events::fingerprint(Fortress::REVELIN, $kind, $rel);
            if (Alerts::get($fp) !== null) {
                Alerts::set_data($fp, 'matched_since', 0);
            }
        }
    }

    /** @return string[] */
    public static function check_htaccess_block(): array
    {
        $entry = Vault::latest('htaccess-block', '.htaccess');
        if ($entry === null || !Vault::entry_intact($entry)) {
            return [];
        }
        $sealed  = (string) file_get_contents(Vault::path($entry));
        $content = is_file(Htaccess::path()) ? (string) file_get_contents(Htaccess::path()) : '';
        $block   = Htaccess::extract_block($content);
        if ($block !== null && rtrim($block) === rtrim($sealed)) {
            return [];
        }
        $r = Htaccess_Block::run(['block' => $sealed]);
        return [$r['message']];
    }

    public static function update_status(): void
    {
        $copies = count(Vault::entries('plugin')) + count(Vault::entries('guard')) + (Vault::latest('htaccess-block', '.htaccess') ? 1 : 0);
        $usage  = Vault::usage();
        $line   = sprintf(
            /* translators: 1: number of copies, 2: used, 3: cap */
            __('%1$d Copies, %2$s Of %3$s', 'dcc-ragusa'),
            $copies,
            Text::bytes($usage),
            Text::bytes(Vault::CAP)
        );
        if (Vault::in_web_root()) {
            $line .= ' · ' . __('Vault Is Inside The Web Root', 'dcc-ragusa');
        }
        Fortress::set_status(Fortress::REVELIN, Alerts::worst(Fortress::REVELIN), $line);
    }

    // --------------------------------------------------------- the upgrader

    /**
     * Fires after a package is unpacked and before the old folder is
     * cleared, for updates and forced installs alike. Never breaks the
     * upgrader: everything is wrapped.
     */
    public static function on_source_selection($source, $remote_source, $upgrader, $hook_extra = [])
    {
        try {
            if (!is_string($source) || $source === '') {
                return $source;
            }
            $type = is_array($hook_extra) ? ($hook_extra['type'] ?? null) : null;
            if ($type !== null && $type !== 'plugin') {
                return $source;
            }
            $slug = basename(rtrim($source, '/\\'));
            if (is_array($hook_extra) && !empty($hook_extra['plugin']) && dirname((string) $hook_extra['plugin']) !== '.') {
                $slug = dirname((string) $hook_extra['plugin']);
            }
            if ($slug === '' || !is_dir(Site::plugins_dir() . '/' . $slug)) {
                return $source; // a brand-new install
            }
            self::seal_plugin($slug);
        } catch (\Throwable $e) {
            Events::record(Fortress::REVELIN, Events::NEEDS_LOOK, 'seal-error', 'upgrader', Text::scrub($e->getMessage()));
        }
        return $source;
    }

    /** Seal the installed version of a plugin just before it is replaced. */
    public static function seal_plugin(string $slug): ?array
    {
        $dir     = Site::plugins_dir() . '/' . $slug;
        $file    = self::plugin_file($slug);
        $version = self::plugin_version($slug);
        $why     = null;
        $entry   = null;

        if (Minceta::disk_pct() !== null && Minceta::disk_pct() >= 95) {
            $why = 'disk';
        } else {
            $entry = Vault::seal_dir('plugin', $slug, $dir, $version, $why);
        }
        $pending        = (array) State::get('pending_update', []);
        $pending[$slug] = ['old_version' => $version, 'entry' => $entry['id'] ?? null, 'why' => $why, 'ts' => time(), 'plugin_file' => $file];
        State::set('pending_update', array_slice($pending, -20, null, true));
        State::flush();

        if ($entry !== null) {
            Events::record(Fortress::REVELIN, Events::INFO, 'sealed-plugin', $slug, sprintf(
                /* translators: 1: slug, 2: version, 3: size */
                __('Sealed %1$s %2$s (%3$s) before its update.', 'dcc-ragusa'),
                $slug,
                $version,
                Text::bytes((int) $entry['size'])
            ));
        } else {
            $reason = match ($why) {
                'too-big'     => __('it does not fit inside the 300 MB vault cap even after evicting older copies', 'dcc-ragusa'),
                'disk'        => __('the account is above 95% of its disk quota', 'dcc-ragusa'),
                'no-archiver' => __('neither ZipArchive nor PharData is available', 'dcc-ragusa'),
                default       => __('the folder could not be read', 'dcc-ragusa'),
            };
            Events::record(Fortress::REVELIN, Events::NEEDS_LOOK, 'no-rollback-copy', $slug, sprintf(
                /* translators: 1: slug, 2: reason */
                __('No rollback copy of %1$s: %2$s.', 'dcc-ragusa'),
                $slug,
                $reason
            ));
            Alerts::raise([
                'fortress' => Fortress::REVELIN,
                'severity' => Events::NEEDS_LOOK,
                'kind'     => 'no-rollback-copy',
                'target'   => $slug,
                'title'    => __('Update Has No Rollback Copy', 'dcc-ragusa'),
                /* translators: 1: slug, 2: version, 3: reason */
                'what'     => sprintf(__('%1$s %2$s is being updated and Ragusa could not keep a copy of it: %3$s.', 'dcc-ragusa'), $slug, $version, $reason),
                'did'      => __('The update went ahead; Sveti Ivan still checks it, but if it breaks the site Ragusa cannot roll it back on its own.', 'dcc-ragusa'),
                'todo'     => __('Nothing now. If the site stops booking after this update, ask the site director to reinstall the previous version.', 'dcc-ragusa'),
            ]);
        }
        return $entry;
    }

    public static function plugin_file(string $slug): string
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        foreach (get_plugins() as $file => $data) {
            if (dirname($file) === $slug) {
                return (string) $file;
            }
        }
        return '';
    }

    public static function plugin_version(string $slug): string
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $file = self::plugin_file($slug);
        if ($file === '') {
            return '';
        }
        $data = get_plugin_data(Site::plugins_dir() . '/' . $file, false, false);
        return (string) ($data['Version'] ?? '');
    }

    /** @return array<string,array> id => entry, for the page and `wp ragusa vault list` */
    public static function listing(): array
    {
        $all = [];
        foreach (['guard', 'htaccess-block', 'self', 'plugin'] as $kind) {
            foreach (Vault::entries($kind) as $id => $e) {
                $all[$id] = $e;
            }
        }
        return $all;
    }
}
