<?php
/**
 * Test bootstrap: enough WordPress to run the plugin's real code.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('WP_DEBUG', false);
define('ARRAY_A', 'ARRAY_A');
define('ARRAY_N', 'ARRAY_N');
define('OBJECT', 'OBJECT');
define('UPLOAD_ERR_OK_TEST', 0);

require_once __DIR__ . '/lib/wpdb.php';

$GLOBALS['wpdb']            = new Test_WPDB();
$GLOBALS['dccl_options']    = [];
$GLOBALS['admin_page_hooks'] = [];

// ----------------------------------------------------------------- options

function get_option(string $name, $default = false)
{
    return $GLOBALS['dccl_options'][$name] ?? $default;
}

function update_option(string $name, $value, $autoload = null): bool
{
    // Nothing this plugin stores may autoload.
    if ($autoload === true || $autoload === 'yes') {
        throw new RuntimeException('DCC Ledger must never autoload an option: ' . $name);
    }
    $GLOBALS['dccl_options'][$name] = $value;
    return true;
}

function delete_option(string $name): bool
{
    unset($GLOBALS['dccl_options'][$name]);
    return true;
}

function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $wpdb;
    $value = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s LIMIT 1",
            $post_id,
            $key
        )
    );
    return $single ? (string) $value : [$value];
}

// -------------------------------------------------------------- i18n & esc

function __(string $text, string $domain = ''): string
{
    return $text;
}
function _x(string $text, string $context, string $domain = ''): string
{
    return $text;
}
function _n(string $single, string $plural, int $number, string $domain = ''): string
{
    return $number === 1 ? $single : $plural;
}
function esc_html__(string $text, string $domain = ''): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}
function esc_attr__(string $text, string $domain = ''): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}
function esc_html(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}
function esc_attr(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}
function esc_url(string $url): string
{
    return htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
}
function esc_html_e(string $text, string $domain = ''): void
{
    echo esc_html($text);
}
function esc_attr_e(string $text, string $domain = ''): void
{
    echo esc_attr($text);
}
function _e(string $text, string $domain = ''): void
{
    echo $text;
}
function esc_textarea(string $text): string
{
    return esc_html($text);
}

// ------------------------------------------------------------- misc core

function wp_json_encode($value, int $flags = 0)
{
    return json_encode($value, $flags);
}

function current_time(string $type = 'mysql')
{
    return $type === 'timestamp' ? time() : gmdate('Y-m-d H:i:s');
}

function date_i18n(string $format, int $timestamp = 0): string
{
    return gmdate($format, $timestamp ?: time());
}

function get_current_user_id(): int
{
    return $GLOBALS['dccl_current_user'] ?? 1;
}

function current_user_can(string $cap): bool
{
    return (bool) ($GLOBALS['dccl_caps'][$cap] ?? true);
}

function sanitize_key(string $key): string
{
    return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', $key) ?? '');
}

function sanitize_text_field(string $text): string
{
    return trim(strip_tags($text));
}

function sanitize_file_name(string $name): string
{
    return preg_replace('/[^A-Za-z0-9._-]/', '-', $name) ?? $name;
}

function sanitize_html_class(string $class): string
{
    return preg_replace('/[^A-Za-z0-9_\-]/', '', $class) ?? '';
}

function wp_unslash($value)
{
    return is_string($value) ? stripslashes($value) : $value;
}

function admin_url(string $path = ''): string
{
    return 'https://example.test/wp-admin/' . ltrim($path, '/');
}

function add_query_arg(array $args, string $url = ''): string
{
    $separator = str_contains($url, '?') ? '&' : '?';
    return $url . $separator . http_build_query($args);
}

function wp_nonce_url(string $url, string $action): string
{
    return add_query_arg(['_wpnonce' => 'test'], $url);
}

function wp_nonce_field(string $action, string $name = '_wpnonce', bool $referer = true, bool $echo = true): string
{
    $html = '<input type="hidden" name="' . esc_attr($name) . '" value="test">';
    if ($echo) {
        echo $html;
    }
    return $html;
}

function check_admin_referer(string $action, string $name = '_wpnonce'): bool
{
    if (($_REQUEST[$name] ?? '') !== 'test') {
        throw new RuntimeException('nonce check failed');
    }
    return true;
}

function wp_die(string $message = '', string $title = '', array $args = []): void
{
    throw new RuntimeException('wp_die: ' . $message);
}

function wp_safe_redirect(string $url, int $status = 302): bool
{
    $GLOBALS['dccl_redirect'] = $url;
    throw new RuntimeException('redirect: ' . $url);
}

function wp_tempnam(string $prefix = ''): string
{
    $file = tempnam(sys_get_temp_dir(), $prefix !== '' ? $prefix : 'dccl');
    return $file === false ? '' : $file;
}

function selected($a, $b, bool $echo = true): string
{
    $html = (string) $a === (string) $b ? ' selected="selected"' : '';
    if ($echo) {
        echo $html;
    }
    return $html;
}

function checked($a, $b = true, bool $echo = true): string
{
    $html = (string) $a === (string) $b ? ' checked="checked"' : '';
    if ($echo) {
        echo $html;
    }
    return $html;
}

function nocache_headers(): void
{
}

function plugin_dir_path(string $file): string
{
    return rtrim(dirname($file), '/') . '/';
}

function plugin_dir_url(string $file): string
{
    return 'https://example.test/wp-content/plugins/dcc-ledger/';
}

function plugin_basename(string $file): string
{
    return 'dcc-ledger/dcc-ledger.php';
}

function load_plugin_textdomain(string $domain, $deprecated = false, string $path = ''): bool
{
    return true;
}

function add_action(...$args): bool
{
    return true;
}
function add_filter(...$args): bool
{
    return true;
}
function add_menu_page(...$args): string
{
    return 'toplevel_page_dcc';
}
function add_submenu_page(...$args): string
{
    return 'dcc_page_dcc-ledger';
}
function register_activation_hook(...$args): void
{
}
function wp_enqueue_style(...$args): void
{
}
function wp_enqueue_script(...$args): void
{
}
function is_admin(): bool
{
    return true;
}

// -------------------------------------------------------------- the plugin

define('DCCL_VERSION', '0.1.0');
define('DCCL_FILE', rtrim(getenv('DCCL_TEST_DIR') ?: dirname(__DIR__), '/') . '/dcc-ledger.php');
// The mutation run points this at a deliberately broken copy of the plugin.
define('DCCL_DIR', rtrim(getenv('DCCL_TEST_DIR') ?: dirname(__DIR__), '/') . '/');
define('DCCL_URL', 'https://example.test/wp-content/plugins/dcc-ledger/');

require_once DCCL_DIR . 'includes/autoload.php';

// ------------------------------------------------------------- test runner

final class T
{
    public static int $passed = 0;
    public static int $failed = 0;
    /** @var array<int,string> */
    public static array $failures = [];
    public static string $group = '';

    public static function group(string $name): void
    {
        self::$group = $name;
        echo "\n" . $name . "\n";
    }

    public static function ok(bool $condition, string $what): void
    {
        if ($condition) {
            self::$passed++;
            echo "  PASS  " . $what . "\n";
            return;
        }
        self::$failed++;
        self::$failures[] = self::$group . ' / ' . $what;
        echo "  FAIL  " . $what . "\n";
    }

    public static function same($expected, $actual, string $what): void
    {
        $equal = is_float($expected) || is_float($actual)
            ? abs((float) $expected - (float) $actual) < 0.005
            : $expected === $actual;
        if ($equal) {
            self::$passed++;
            echo "  PASS  " . $what . "\n";
            return;
        }
        self::$failed++;
        $detail = sprintf('%s (expected %s, got %s)', $what, var_export($expected, true), var_export($actual, true));
        self::$failures[] = self::$group . ' / ' . $detail;
        echo "  FAIL  " . $detail . "\n";
    }

    public static function summary(): int
    {
        echo "\n----------------------------------------\n";
        echo sprintf("%d passed, %d failed\n", self::$passed, self::$failed);
        foreach (self::$failures as $failure) {
            echo '  - ' . $failure . "\n";
        }
        return self::$failed === 0 ? 0 : 1;
    }
}

/** Fresh tables and a clean option store. */
function dccl_reset_db(): void
{
    global $wpdb;
    $wpdb = new Test_WPDB();
    $GLOBALS['dccl_options'] = [];
    \DCCL\Schema::install();
    dccl_install_mphb_tables();
}

function dccl_install_mphb_tables(): void
{
    global $wpdb;
    $wpdb->exec_raw("CREATE TABLE IF NOT EXISTS {$wpdb->posts} (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        post_parent INTEGER DEFAULT 0,
        post_type TEXT,
        post_status TEXT,
        post_title TEXT,
        post_date TEXT
    )");
    $wpdb->exec_raw("CREATE TABLE IF NOT EXISTS {$wpdb->postmeta} (
        meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        meta_key TEXT,
        meta_value TEXT
    )");
}

/**
 * Does $haystack contain this piece of guest detail?
 *
 * Whole words only, so a name like "Sam" is not matched inside "Same dates".
 * Needles that are not plain words (an email domain, a dialling prefix) are
 * matched as they stand.
 */
function dccl_has_pii(string $haystack, string $needle): bool
{
    if (preg_match('/^[A-Za-z]+$/', $needle) === 1) {
        return preg_match('/\b' . preg_quote($needle, '/') . '\b/i', $haystack) === 1;
    }
    return stripos($haystack, $needle) !== false;
}

/** Every line of the plugin's own PHP, with the test suite left out. */
function dccl_plugin_source(): string
{
    $source = '';
    $iterator = new RecursiveIteratorIterator(
        new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator(DCCL_DIR, FilesystemIterator::SKIP_DOTS),
            static fn ($file) => $file->getFilename() !== 'tests'
        )
    );
    foreach ($iterator as $file) {
        if ($file->isFile() && $file->getExtension() === 'php') {
            $source .= (string) file_get_contents($file->getPathname());
        }
    }
    return $source;
}

function dccl_fixture(string $name): string
{
    return __DIR__ . '/fixtures/' . $name;
}
