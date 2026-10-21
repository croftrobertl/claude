<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The zero-weight proof: a plain PHP subprocess (not WP-CLI, whose context
 * would pass the gate) loads wp-load.php as a visitor request and reports
 * what it included and asked the database. With `skip`, a pre-initialised
 * `option_active_plugins` filter removes Ragusa before plugins load.
 */
final class Proof
{
    /** @return array<string,int>|null */
    public static function run(bool $skip): ?array
    {
        $php = self::php_binary();
        if ($php === null) {
            return null;
        }
        $script = Vault::dir() . '/proof-' . ($skip ? 'without' : 'with') . '.php';
        file_put_contents($script, self::script($skip));
        @chmod($script, 0600);
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = @proc_open([$php, '-d', 'display_errors=0', $script], $spec, $pipes);
        if (!is_resource($proc)) {
            @unlink($script);
            return null;
        }
        fclose($pipes[0]);
        stream_set_timeout($pipes[1], 60);
        $out = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        @unlink($script);
        $pos  = strrpos($out, '{"files"');
        $json = $pos === false ? null : json_decode(substr($out, $pos), true);
        return is_array($json) ? array_map('intval', $json) : null;
    }

    private static function php_binary(): ?string
    {
        if (!function_exists('proc_open')) {
            return null;
        }
        $bin = defined('PHP_BINARY') && is_string(PHP_BINARY) && PHP_BINARY !== '' ? PHP_BINARY : '';
        if ($bin === '' || str_contains($bin, 'fpm') || str_contains($bin, 'lsphp') || !is_executable($bin)) {
            foreach (['/usr/local/bin/php', '/usr/bin/php', '/opt/cpanel/ea-php83/root/usr/bin/php'] as $cand) {
                if (is_executable($cand)) {
                    return $cand;
                }
            }
            return $bin === '' ? 'php' : $bin;
        }
        return $bin;
    }

    public static function script(bool $skip): string
    {
        [$host, $path] = Site::home_parts();
        $abspath = ABSPATH;
        $uri     = '/' . ($path === '' ? '' : $path . '/') . '?ragusa_proof=' . substr(bin2hex(random_bytes(4)), 0, 8);
        $skip_code = $skip
            ? '$GLOBALS["wp_filter"]["option_active_plugins"][10]["dccr_proof"] = ["function" => static function ($p) { return array_values(array_diff((array) $p, ["dcc-ragusa/dcc-ragusa.php"])); }, "accepted_args" => 1];'
            : '';
        return <<<PHP
<?php
\$_SERVER['HTTP_HOST'] = '{$host}';
\$_SERVER['SERVER_NAME'] = '{$host}';
\$_SERVER['REQUEST_URI'] = '{$uri}';
\$_SERVER['REQUEST_METHOD'] = 'GET';
\$_SERVER['HTTPS'] = 'on';
\$_SERVER['SERVER_PORT'] = '443';
\$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
\$_SERVER['HTTP_USER_AGENT'] = 'DCC-Ragusa-Proof';
define('WP_USE_THEMES', false);
define('DOING_AJAX', false);
{$skip_code}
ob_start();
require '{$abspath}wp-load.php';
do_action('wp_loaded');
ob_end_clean();
\$files = get_included_files();
\$ragusa = 0;
foreach (\$files as \$f) { if (str_contains(\$f, '/plugins/dcc-ragusa/')) { \$ragusa++; } }
\$classes = 0;
foreach (get_declared_classes() as \$c) { if (str_starts_with(\$c, 'DCCR\\\\')) { \$classes++; } }
\$hooks = 0;
foreach (\$GLOBALS['wp_filter'] as \$hook) { foreach (\$hook->callbacks as \$cbs) { foreach (\$cbs as \$cb) { \$fn = \$cb['function']; if (is_array(\$fn) && is_string(\$fn[0]) && str_starts_with(\$fn[0], 'DCCR\\\\')) { \$hooks++; } } } }
\$enq = 0;
if (isset(\$GLOBALS['wp_scripts'])) { foreach ((array) \$GLOBALS['wp_scripts']->queue as \$h) { if (str_starts_with(\$h, 'dccr')) { \$enq++; } } }
if (isset(\$GLOBALS['wp_styles'])) { foreach ((array) \$GLOBALS['wp_styles']->queue as \$h) { if (str_starts_with(\$h, 'dccr')) { \$enq++; } } }
echo json_encode(['files' => count(\$files), 'queries' => (int) \$GLOBALS['wpdb']->num_queries, 'ragusa_files' => \$ragusa, 'ragusa_classes' => \$classes, 'hooks' => \$hooks, 'enqueued' => \$enq]);
PHP;
    }
}
