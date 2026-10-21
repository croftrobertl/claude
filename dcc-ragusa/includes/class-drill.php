<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * `wp ragusa drill <action>`: on staging only, stage a harmless case, run
 * the real action and its reverse, and report every state transition.
 */
final class Drill
{
    public const TEST_PLUGIN = 'ragusa-drill-plugin';

    /** @return string[] */
    public static function run(string $what): array
    {
        if (Site::is_live()) {
            return ['Refused: this is the live site.'];
        }
        return match ($what) {
            'quarantine'    => self::quarantine(),
            'restore-guard' => self::restore_guard(),
            'htaccess'      => self::htaccess(),
            'rollback'      => self::rollback(),
            default         => ['Unknown drill: ' . $what . ' (quarantine | restore-guard | htaccess | rollback)'],
        };
    }

    private static function states(int $id): string
    {
        $row = Journal::get($id);
        return $row === null ? 'no row' : sprintf('journal %d → %s%s', $id, $row['state'], $row['note'] !== '' ? ' (' . $row['note'] . ')' : '');
    }

    private static function quarantine(): array
    {
        $lines = [];
        $dir   = Site::uploads_dir() . '/ragusa-drill';
        @mkdir($dir, 0755, true);
        $file  = $dir . '/evil.php';
        file_put_contents($file, "<?php echo 1;\n");
        $lines[] = 'Staged ' . Site::rel($file);
        $r = Action\Quarantine::run(['path' => $file, 'reason' => 'drill: an executable file inside the uploads folder']);
        $lines[] = 'Action: ' . $r['message'] . ' · ' . self::states($r['id']);
        $lines[] = 'File gone from uploads: ' . (file_exists($file) ? 'NO' : 'yes');
        [$ok, $msg] = Actions::reverse($r['id']);
        $lines[] = 'Reverse: ' . $msg . ' · ' . self::states($r['id']);
        $lines[] = 'File back in uploads: ' . (file_exists($file) ? 'yes' : 'NO');
        @unlink($file);
        @rmdir($dir);
        $lines[] = 'Cleaned up.';
        return $lines;
    }

    private static function restore_guard(): array
    {
        $lines = [];
        $label = null;
        $path  = '';
        foreach (Fortress\Revelin::guards() as $l => $p) {
            if (is_file($p) && Vault::latest('guard', $l) !== null) {
                $label = $l;
                $path  = $p;
                break;
            }
        }
        if ($label === null) {
            return ['No sealed guard exists on this site yet; run a tick first (wp ragusa tick), then drill again.'];
        }
        $original = (string) file_get_contents($path);
        file_put_contents($path, $original . "\n# ragusa drill " . time() . "\n");
        $lines[] = 'Altered ' . $label;
        $report = Fortress\Revelin::check_guards();
        $lines  = array_merge($lines, array_map(static fn($l) => 'Check: ' . $l, $report));
        $row    = Journal::latest('restore-guard', Site::rel($path));
        if ($row === null) {
            file_put_contents($path, $original);
            return array_merge($lines, ['No restore happened; the alteration was undone by the drill.']);
        }
        $lines[] = self::states((int) $row['id']);
        $lines[] = 'File equals the sealed copy: ' . (file_get_contents($path) === $original ? 'yes' : 'NO');
        [$ok, $msg] = Actions::reverse((int) $row['id']);
        $lines[] = 'Reverse: ' . $msg . ' · ' . self::states((int) $row['id']);
        $lines[] = 'File is the altered one again: ' . (str_contains((string) file_get_contents($path), 'ragusa drill') ? 'yes' : 'NO');
        file_put_contents($path, $original);
        $lines[] = 'Original content written back; nothing left to seal.';
        return $lines;
    }

    private static function htaccess(): array
    {
        $lines = [];
        $entry = Vault::latest('htaccess-block', '.htaccess');
        if ($entry === null) {
            return ['No sealed .htaccess block on this site; nothing to drill.'];
        }
        if (!Loopback::available(true)) {
            return ['Loopbacks do not work on this host, so A3 is alert-only here; nothing to drill.'];
        }
        $path     = Htaccess::path();
        $original = (string) file_get_contents($path);
        $block    = Htaccess::extract_block($original);
        if ($block === null) {
            return ['The DCC Security block is not in .htaccess right now.'];
        }
        $altered = str_replace(Htaccess::END, "# drill\n" . Htaccess::END, $block);
        Vault::write_atomic($path, Htaccess::replace_block($original, $altered));
        $lines[] = 'Altered one line inside the DCC block';
        $report = Fortress\Revelin::check_htaccess_block();
        $lines  = array_merge($lines, array_map(static fn($l) => 'Check: ' . $l, $report));
        $row    = Journal::latest('htaccess-block', '.htaccess');
        if ($row === null) {
            Vault::write_atomic($path, $original);
            return array_merge($lines, ['No rewrite happened; the alteration was undone by the drill.']);
        }
        $lines[] = self::states((int) $row['id']);
        $lines[] = 'Block equals the sealed copy: ' . (rtrim((string) Htaccess::extract_block((string) file_get_contents($path))) === rtrim($block) ? 'yes' : 'NO');
        [$ok, $msg] = Actions::reverse((int) $row['id']);
        $lines[] = 'Reverse: ' . $msg . ' · ' . self::states((int) $row['id']);
        Vault::write_atomic($path, $original);
        $lines[] = 'Original .htaccess written back.';
        return $lines;
    }

    private static function rollback(): array
    {
        $lines = [];
        if (!Loopback::available(true)) {
            return ['Loopbacks do not work on this host; the rollback drill needs them to see the broken version.'];
        }
        $slug = self::TEST_PLUGIN;
        $dir  = Site::plugins_dir() . '/' . $slug;
        $file = $dir . '/' . $slug . '.php';
        @mkdir($dir, 0755, true);
        file_put_contents($file, "<?php\n/**\n * Plugin Name: Ragusa Drill Plugin\n * Version: 1.0.0\n */\n");
        if (!function_exists('activate_plugin')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        wp_clean_plugins_cache(false);
        activate_plugin($slug . '/' . $slug . '.php');
        $lines[] = 'Installed and activated ' . $slug . ' 1.0.0';

        $entry = Fortress\Revelin::seal_plugin($slug);
        $lines[] = $entry === null ? 'Seal FAILED' : 'Sealed 1.0.0 as ' . $entry['id'];

        // The "update": 1.0.1 answers 500 to Ragusa's check requests.
        file_put_contents($file, "<?php\n/**\n * Plugin Name: Ragusa Drill Plugin\n * Version: 1.0.1\n */\nadd_action('template_redirect', function () { if (isset(\$_GET['ragusa_check'])) { status_header(500); echo 'drill'; exit; } });\n");
        wp_clean_plugins_cache(false);
        $lines[] = 'Updated to 1.0.1, which breaks every page check';

        Fortress\Sveti_Ivan::on_pre_install(true, ['type' => 'plugin', 'action' => 'update', 'plugin' => $slug . '/' . $slug . '.php']);
        Fortress\Sveti_Ivan::on_process_complete(null, ['type' => 'plugin', 'action' => 'update', 'plugin' => $slug . '/' . $slug . '.php']);
        $row = Journal::latest('update-check', $slug);
        if ($row === null) {
            self::remove_plugin($slug);
            return array_merge($lines, ['No update-check row was created; aborted and cleaned up.']);
        }
        $lines[] = self::states((int) $row['id']);
        // The first scheduled check, then the repeat, without waiting.
        Fortress\Sveti_Ivan::scheduled_check((int) $row['id']);
        $lines[] = 'First check: ' . self::states((int) $row['id']);
        Fortress\Sveti_Ivan::scheduled_check((int) $row['id']);
        $lines[] = 'Repeat check: ' . self::states((int) $row['id']);
        $rb = Journal::latest('rollback', $slug);
        if ($rb === null) {
            self::remove_plugin($slug);
            return array_merge($lines, ['No rollback happened; aborted and cleaned up.']);
        }
        $lines[] = 'Rollback: ' . self::states((int) $rb['id']);
        $verify = Journal::latest('update-check', $slug);
        if ($verify !== null && (int) $verify['id'] !== (int) $row['id']) {
            Fortress\Sveti_Ivan::scheduled_check((int) $verify['id']);
            $lines[] = 'Verification after rollback: ' . self::states((int) $verify['id']);
        }
        $lines[] = 'Rollback now: ' . self::states((int) $rb['id']);
        $lines[] = 'Version in place: ' . Fortress\Revelin::plugin_version($slug) . ' (expected 1.0.0)';
        [$ok, $msg] = Actions::reverse((int) $rb['id']);
        $lines[] = 'Reverse: ' . $msg . ' · ' . self::states((int) $rb['id']);
        wp_clean_plugins_cache(false);
        $lines[] = 'Version in place after reverse: ' . Fortress\Revelin::plugin_version($slug) . ' (expected 1.0.1)';
        self::remove_plugin($slug);
        if ($entry !== null) {
            Vault::remove($entry['id']);
        }
        $lines[] = 'Test plugin removed and its sealed copy dropped.';
        return $lines;
    }

    private static function remove_plugin(string $slug): void
    {
        if (!function_exists('deactivate_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        deactivate_plugins($slug . '/' . $slug . '.php');
        Vault::rm_rf(Site::plugins_dir() . '/' . $slug);
        $auto = (array) get_option('auto_update_plugins', []);
        update_option('auto_update_plugins', array_values(array_diff($auto, [$slug . '/' . $slug . '.php'])));
        wp_clean_plugins_cache(false);
    }
}
