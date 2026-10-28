<?php
/**
 * The synthetic site: a WordPress-shaped tree with a few "core" files and
 * their checksums, a wordpress.org plugin with published checksums, a DCC
 * plugin, the guard mu-plugins, and an uploads folder with the eight stubs
 * and nineteen .htaccess files, two of which are guards. No real data.
 */
final class Test_Site
{
    /** The two .htaccess blocks whose order matters: pre-gzipped above SpeedyCache, whose rule ends in [L]. */
    public const PREGZ_BLOCK  = "# BEGIN DCC Pre-gzipped Cache\nRewriteEngine On\nRewriteCond %{HTTP:Accept-Encoding} gzip\nRewriteCond %{REQUEST_FILENAME}.gz -f\nRewriteRule ^(.*)$ $1.gz [L]\n# END DCC Pre-gzipped Cache\n";
    /**
     * Live's .htaccess as the Director read it on Oct 28: SpeedyCache's headers
     * block (line 46) well above the DCC Pre-gzipped Cache block (143), which
     * sits above the speedycache rewrite block (178). Where the Gzip, LBC and
     * WEBP blocks stand was not given; they are placed above the DCC block,
     * the case a prefix match would get wrong.
     */
    public const LIVE_SPEEDY_SEQUENCE = "# BEGIN SpeedyCacheheaders\n<IfModule mod_headers.c>\nHeader set X-SpeedyCache-Source \"Server\"\n</IfModule>\n# END SpeedyCacheheaders\n\n"
        . "# BEGIN Gzipspeedycache\n<IfModule mod_deflate.c>\nAddOutputFilterByType DEFLATE text/html\n</IfModule>\n# END Gzipspeedycache\n\n"
        . "# BEGIN LBCspeedycache\n<IfModule mod_expires.c>\nExpiresActive on\n</IfModule>\n# END LBCspeedycache\n\n"
        . "# BEGIN WEBPspeedycache\n<IfModule mod_rewrite.c>\nRewriteEngine On\n</IfModule>\n# END WEBPspeedycache\n\n";

    public const SPEEDY_BLOCK = "# BEGIN speedycache\nRewriteEngine On\nRewriteRule ^(.*)$ wp-content/cache/speedycache/$1 [L]\n# END speedycache\n";

    public static function reset(): void
    {
        if (is_dir(DCCR_TEST_ROOT)) {
            DCCR\Vault::rm_rf(DCCR_TEST_ROOT);
        }
        @mkdir(DCCR_TEST_ROOT . '/home', 0700, true);
        @mkdir(ABSPATH, 0755, true);
        self::build();
        $GLOBALS['table_prefix']    = 'wpstg0_';
        $GLOBALS['dccr_home_url']   = 'https://doracanalcourt.com/staging/';
        $GLOBALS['dccr_site_handler'] = null;
        $GLOBALS['dccr_is_admin']   = false;
        $GLOBALS['dccr_caps']       = true;
        $GLOBALS['dccr_nonce_ok']   = true;
        $GLOBALS['dccr_display_name'] = 'Rob';
        DCCR\Drill::$active        = false;
        DCCR\Fortress\Sveti_Ivan::$followup_runner = null;
        $GLOBALS['wpdb']            = new Test_WPDB($GLOBALS['table_prefix']);
        $GLOBALS['dccr_options']    = [];
        $GLOBALS['dccr_autoload']   = [];
        $GLOBALS['dccr_mail']       = [];
        $GLOBALS['dccr_http']       = [];
        $GLOBALS['dccr_cron']       = [];
        $GLOBALS['dccr_mail_fails'] = false;
        $GLOBALS['dccr_users']      = [
            ['ID' => 1, 'login' => 'admin', 'roles' => ['administrator']],
            ['ID' => 2, 'login' => 'erica', 'roles' => ['administrator']],
            ['ID' => 88, 'login' => 'claude', 'roles' => ['subscriber']],
            ['ID' => 90, 'login' => 'guest-x', 'roles' => ['mphb_customer']],
        ];
        $GLOBALS['dccr_app_passwords']   = [];
        self::usermeta($GLOBALS['table_prefix']);
        $GLOBALS['dccr_jetpack_modules'] = ['waf' => true, 'protect' => true, 'monitor' => true];
        $GLOBALS['dccr_core_updates']    = [];
        $GLOBALS['dccr_http_handler']    = [self::class, 'http'];
        $GLOBALS['dccr_cache_flushed']   = 0;
        update_option('active_plugins', ['wporg-plugin/wporg-plugin.php', 'dcc-demo/dcc-demo.php', 'dcc-ragusa/dcc-ragusa.php'], 'yes');
        update_option('siteurl', rtrim($GLOBALS['dccr_home_url'], '/'), 'yes');
        update_option('home', rtrim($GLOBALS['dccr_home_url'], '/'), 'yes');
        update_option('admin_email', 'rob@example.test', 'yes');
        update_option('users_can_register', '0', 'yes');
        update_option('default_role', 'subscriber', 'yes');
        update_option('jetpack_waf_mode', 'normal', 'yes');
        update_option('auto_update_plugins', ['wporg-plugin/wporg-plugin.php'], 'no');
        DCCR\State::reset();
        DCCR\Settings::reset_cache();
        DCCR\Vault::reset_cache();
        DCCR\Alerts::reset_cache();
        DCCR\Fortress\Minceta::reset_cache();
        DCCR\Schema::ensure();
    }

    /** The capabilities meta for every test user, under $key_prefix (the WP prefix, or a clone's old one). */
    public static function usermeta(string $key_prefix, bool $also_in_meta_api = true): void
    {
        global $wpdb;
        $wpdb->query("DROP TABLE IF EXISTS {$wpdb->usermeta}");
        $wpdb->query("CREATE TABLE {$wpdb->usermeta} (umeta_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, meta_key TEXT, meta_value TEXT)");
        $GLOBALS['dccr_usermeta'] = [];
        foreach ($GLOBALS['dccr_users'] as $u) {
            $caps = serialize(array_fill_keys($u['roles'], true));
            $wpdb->insert($wpdb->usermeta, ['user_id' => $u['ID'], 'meta_key' => $key_prefix . 'capabilities', 'meta_value' => $caps]);
            if ($also_in_meta_api) {
                $GLOBALS['dccr_usermeta'][$u['ID']][$key_prefix . 'capabilities'] = array_fill_keys($u['roles'], true);
            }
        }
    }

    public static function write(string $rel, string $content): string
    {
        $abs = ABSPATH . ltrim($rel, '/');
        @mkdir(dirname($abs), 0755, true);
        file_put_contents($abs, $content);
        return $abs;
    }

    private static function build(): void
    {
        // Core.
        $core = [
            'index.php'                     => "<?php\nrequire __DIR__ . '/wp-blog-header.php';\n",
            'wp-blog-header.php'            => "<?php\n// blog header\n",
            'wp-load.php'                   => "<?php\n// load\n",
            'wp-admin/index.php'            => "<?php\n// admin\n",
            'wp-admin/includes/plugin.php'  => "<?php\n// plugin api\n",
            'wp-includes/version.php'       => "<?php\n\$wp_version = '7.1.3';\n",
            'wp-includes/functions.php'     => "<?php\n// functions\n",
        ];
        $map = [];
        foreach ($core as $rel => $content) {
            self::write($rel, $content);
            $map[$rel] = md5($content);
        }
        $GLOBALS['dccr_core_checksums'] = $map;
        self::write('wp-config.php', "<?php\ndefine('DB_NAME', 'test');\n");
        self::write('.htaccess', "# BEGIN DCC Security\n<Files xmlrpc.php>\n# kept for Jetpack\n</Files>\n# END DCC Security\n\n" . self::PREGZ_BLOCK . "\n" . self::SPEEDY_BLOCK);

        // A wordpress.org plugin with published checksums.
        $wporg = [
            'wporg-plugin.php' => "<?php\n/**\n * Plugin Name: WPORG Plugin\n * Version: 1.4.0\n */\n",
            'includes/a.php'   => "<?php\n// a\n",
            'readme.txt'       => "=== WPORG Plugin ===\nStable tag: 1.4.0\n",
        ];
        $files = [];
        foreach ($wporg as $rel => $content) {
            self::write('wp-content/plugins/wporg-plugin/' . $rel, $content);
            $files[$rel] = ['md5' => md5($content), 'sha256' => hash('sha256', $content)];
        }
        self::$plugin_checksums['wporg-plugin/1.4.0'] = $files;

        // A DCC plugin, baseline only.
        self::write('wp-content/plugins/dcc-demo/dcc-demo.php', "<?php\n/**\n * Plugin Name: DCC Demo\n * Version: 0.3.0\n */\n");
        self::write('wp-content/plugins/dcc-demo/includes/class-demo.php', "<?php\nclass Demo {}\n");

        // Theme.
        self::write('wp-content/themes/bravada/style.css', "/* Theme Name: Bravada */\n");
        self::write('wp-content/themes/bravada/functions.php', "<?php\n// theme\n");

        // mu-plugins: vendor and guards.
        self::write('wp-content/mu-plugins/endurance-page-cache.php', "<?php\n// hostgator\n");
        self::write('wp-content/mu-plugins/sso.php', "<?php\n// hostgator sso\n");
        self::write('wp-content/mu-plugins/wp-staging-optimizer.php', "<?php\n// wp staging\n");
        foreach (['dcc-user-enum-guard', 'dcc-postpass-guard', 'dcc-ical-export-guard', 'dcc-ical-privacy'] as $g) {
            self::write('wp-content/mu-plugins/' . $g . '.php', "<?php\n// guard " . $g . "\nadd_action('init', function () {});\n");
        }
        self::write('wp-content/mu-plugins/dcc-other-helper.php', "<?php\n// dcc helper\n");

        // Drop-ins and expected churn.
        self::write('wp-content/advanced-cache.php', "<?php\n// speedycache 1\n");
        self::write('wp-content/jetpack-waf/rules/rules.php', "<?php\nrequire 'automatic-rules.php';\n");
        self::write('wp-content/jetpack-waf/rules/automatic-rules.php', "<?php\n// rules v1\n");
        self::write('wp-content/jetpack-waf/bootstrap.php', "<?php\n// bootstrap\n");

        // Uploads: the eight stubs, nineteen .htaccess files, two guards.
        $stubs = [
            'wp-staging/index.php' => str_pad("<?php\n// Silence is golden.\n", 679, '/'),
            'wp-staging/cache/index.php' => str_pad("<?php\n// Silence is golden.\n", 679, '/'),
            'wp-staging/logs/index.php' => str_pad("<?php\n// Silence is golden.\n", 679, '/'),
            'wp-staging/backups/index.php' => str_pad("<?php\n// Silence is golden.\n", 679, '/'),
            'wpforms/cache/index.php' => str_pad("<?php\n// Silence is golden.\n", 99, '/'),
            'motopress-calendar/index.php' => "<?php\n",
            'mphb/index.php' => str_pad("<?php\n// Silence.\n", 28, '/'),
            'mphb_protected_uploads/index.php' => str_pad("<?php\n// Silence.\n", 28, '/'),
        ];
        foreach ($stubs as $rel => $content) {
            self::write('wp-content/uploads/' . $rel, $content);
        }
        $ht = [
            '.htaccess' => "<FilesMatch \"\\.(php|phtml|phar|pht)$\">\nRequire all denied\n</FilesMatch>\n",
            'mphb_protected_uploads/.htaccess' => "Deny from all\n",
            'wp-staging/.htaccess' => "Options -Indexes\n", 'wp-staging/cache/.htaccess' => "Options -Indexes\n",
            'wp-staging/logs/.htaccess' => "Options -Indexes\n", 'wp-staging/backups/.htaccess' => "Options -Indexes\n",
            'wpforms/.htaccess' => "# Disable PHP\nphp_flag engine off\n<FilesMatch \"\\.php$\">\nDeny from all\n</FilesMatch>\n",
            'wpforms/cache/.htaccess' => "Options -Indexes\n", 'motopress-calendar/.htaccess' => "Options -Indexes\n",
            'mphb/.htaccess' => "Options -Indexes\n", 'wpcf7_uploads/.htaccess' => "Deny from all\n", 'wc-logs/.htaccess' => "deny from all\n",
            'woocommerce_transient_files/.htaccess' => "deny from all\n", 'woocommerce_uploads/.htaccess' => "Options -Indexes\ndeny from all\n",
            'wpcode-logs/.htaccess' => "Deny from all\n", 'wpsc/downloadables/.htaccess' => "Deny from all\n", 'astra-sites/.htaccess' => "Options -Indexes\n",
            'evf-logs/.htaccess' => "deny from all\n", 'wp-file-manager-pro/fm_backup/.htaccess' => "<FilesMatch \"\\.(php)$\">\nDeny from all\n</Files>\n",
        ];
        foreach ($ht as $rel => $content) {
            self::write('wp-content/uploads/' . $rel, $content);
        }
        self::write('wp-content/uploads/2026/10/photo.jpg', str_repeat('x', 100));
        self::write('wp-content/uploads/2026/10/doc.pdf', str_repeat('y', 100));
    }

    public static array $plugin_checksums = [];

    /** The HTTP stub: wordpress.org checksums, loopbacks, pings, the feed. */
    public static function http(string $url, array $args)
    {
        if (preg_match('#downloads\.wordpress\.org/plugin-checksums/([^/]+)/([^/]+)\.json#', $url, $m)) {
            $key = $m[1] . '/' . $m[2];
            if (isset(self::$plugin_checksums[$key])) {
                return dccr_http_ok((string) json_encode(['files' => self::$plugin_checksums[$key]]));
            }
            return dccr_http_ok('not found', 404);
        }
        if (str_contains($url, 'hc-ping.com')) {
            return dccr_http_ok('OK');
        }
        if (str_contains($url, 'api.wordpress.org/plugins/info')) {
            if (str_contains($url, 'closed-plugin')) {
                return dccr_http_ok((string) json_encode(['closed' => true, 'reason_text' => 'Security Issue']));
            }
            if (str_contains($url, 'wporg-plugin')) {
                return dccr_http_ok((string) json_encode(['slug' => 'wporg-plugin', 'last_updated' => '2026-09-01 10:00am GMT', 'tested' => '7.1']));
            }
            return dccr_http_ok((string) json_encode(['error' => 'Plugin not found.']));
        }
        if (str_contains($url, 'wordfence.com')) {
            return $GLOBALS['dccr_feed_response'] ?? dccr_http_ok('{}', 401);
        }
        // Loopbacks to the site itself.
        if (str_starts_with($url, rtrim($GLOBALS['dccr_home_url'], '/'))) {
            $handler = $GLOBALS['dccr_site_handler'] ?? null;
            if (is_callable($handler)) {
                return $handler($url, $args);
            }
            return self::site_page($url);
        }
        return null;
    }

    /** The default site: every marker page answers 200 with its markers. */
    public static function site_page(string $url): array
    {
        $path = (string) (parse_url($url, PHP_URL_PATH) ?? '/');
        $base = rtrim(parse_url($GLOBALS['dccr_home_url'], PHP_URL_PATH) ?? '/', '/');
        $rel  = '/' . ltrim(substr($path, strlen($base)), '/');
        if (str_ends_with($rel, 'wp-cron.php')) {
            return dccr_http_ok('');
        }
        foreach (DCCR\Markers::all() as $page => $markers) {
            if ($rel === $page) {
                return dccr_http_ok('<html><head><title>Dora Canal Court</title></head><body>' . implode(' ', $markers) . '</body></html>');
            }
        }
        return dccr_http_ok('<html><title>Dora Canal Court</title></html>');
    }
}
