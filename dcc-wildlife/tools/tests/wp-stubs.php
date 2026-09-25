<?php
/**
 * Minimal WordPress API for running this plugin's classes outside WordPress.
 *
 * These stubs are deliberately dumb. They exist so a test can call real
 * plugin code and assert on its real output. Anything clever here would be
 * a second implementation to get wrong — when a test needs richer behaviour
 * (a stored option, a seeded transient, an attachment), it seeds the arrays
 * below directly rather than teaching the stub a new trick.
 *
 * NOT shipped: tools/ is excluded from the release zip.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

if ( ! defined( 'ABSPATH' ) ) { define( 'ABSPATH', '/tmp/wp/' ); }
if ( ! defined( 'MINUTE_IN_SECONDS' ) ) { define( 'MINUTE_IN_SECONDS', 60 ); }
if ( ! defined( 'HOUR_IN_SECONDS' ) ) { define( 'HOUR_IN_SECONDS', 3600 ); }
if ( ! defined( 'DAY_IN_SECONDS' ) ) { define( 'DAY_IN_SECONDS', 86400 ); }
if ( ! defined( 'WEEK_IN_SECONDS' ) ) { define( 'WEEK_IN_SECONDS', 604800 ); }

/** Mutable state every stub reads. Tests seed and inspect these. */
$GLOBALS['dccwl_test'] = [
	'options'    => [],
	'transients' => [],
	'actions'    => [],   // [ [hook, cb, priority], ... ]
	'filters'    => [],
	'shortcodes' => [],
	'settings'   => [],   // register_setting calls
	'routes'     => [],   // register_rest_route calls
	'enqueued'   => [],
	'registered' => [],
	'inline'     => [],
	'posts'      => [],   // get_posts() result, seeded per test
	'attach_url' => [],   // id => url
	'http'       => [],   // url-substring => [ 'code' => int, 'body' => string ]
	'menu'       => [],   // add_submenu_page / add_options_page calls
	'ttl'        => [],   // transient key => ttl seconds
	'cron'       => [],
	'die'        => null,
	'caps'       => true, // current_user_can return
	'nonce_ok'   => true,
];

function dccwl_test_reset(): void {
	foreach ( [ 'options', 'transients', 'actions', 'filters', 'shortcodes', 'settings', 'routes', 'enqueued', 'registered', 'inline', 'posts', 'attach_url', 'http', 'menu' ] as $k ) {
		$GLOBALS['dccwl_test'][ $k ] = [];
	}
	$GLOBALS['dccwl_test']['ttl']      = [];
	$GLOBALS['dccwl_test']['cron']     = [];
	$GLOBALS['dccwl_test']['die']      = null;
	$GLOBALS['dccwl_test']['caps']     = true;
	$GLOBALS['dccwl_test']['nonce_ok'] = true;
}

/* ---- escaping + i18n ------------------------------------------------ */
function esc_html( $t ) { return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $t ) { return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' ); }
function esc_textarea( $t ) { return esc_html( $t ); }
function esc_url( $u ) { return str_replace( [ '"', '<', '>' ], '', (string) $u ); }
function esc_url_raw( $u ) { return (string) $u; }
function esc_js( $t ) { return addslashes( (string) $t ); }
/**
 * Not real kses — just enough of it that a test asserting "script tags do not
 * survive an attribution field" is asserting something. Real kses is stricter;
 * anything that passes here would also pass there.
 */
function wp_kses_post( $t ) {
	$t = (string) $t;
	$t = preg_replace( '#<\s*(script|style|iframe|object|embed)\b[^>]*>.*?<\s*/\s*\1\s*>#is', '', $t );
	$t = preg_replace( '#<\s*/?\s*(script|style|iframe|object|embed)\b[^>]*>#i', '', $t );
	$t = preg_replace( '#\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $t );
	return $t;
}
function __( $t, $d = null ) { return $t; }
function _x( $t, $c = '', $d = null ) { return $t; }
function _n( $s, $p, $n, $d = null ) { return 1 === (int) $n ? $s : $p; }
function esc_html__( $t, $d = null ) { return esc_html( $t ); }
function esc_attr__( $t, $d = null ) { return esc_attr( $t ); }
function _e( $t, $d = null ) { echo $t; }
function esc_html_e( $t, $d = null ) { echo esc_html( $t ); }
function esc_attr_e( $t, $d = null ) { echo esc_attr( $t ); }
function load_plugin_textdomain( ...$a ) { return true; }
function number_format_i18n( $n, $dec = 0 ) { return number_format( (float) $n, (int) $dec ); }
function date_i18n( $f, $ts = null ) { return gmdate( $f, null === $ts ? time() : (int) $ts ); }
function get_locale() { return 'en_US'; }

/* ---- options + transients ------------------------------------------- */
function get_option( $k, $default = false ) { return $GLOBALS['dccwl_test']['options'][ $k ] ?? $default; }
function update_option( $k, $v, $autoload = null ) { $GLOBALS['dccwl_test']['options'][ $k ] = $v; return true; }
function add_option( $k, $v = '', $dep = '', $autoload = 'yes' ) {
	if ( array_key_exists( $k, $GLOBALS['dccwl_test']['options'] ) ) { return false; }
	$GLOBALS['dccwl_test']['options'][ $k ] = $v; return true;
}
function delete_option( $k ) { unset( $GLOBALS['dccwl_test']['options'][ $k ] ); return true; }
function get_transient( $k ) { return $GLOBALS['dccwl_test']['transients'][ $k ] ?? false; }
function set_transient( $k, $v, $ttl = 0 ) {
	$GLOBALS['dccwl_test']['transients'][ $k ] = $v;
	// Recorded so a test can assert HOW LONG something was cached for, which
	// is the difference between caching an outage for 5 minutes and for 3 hours.
	$GLOBALS['dccwl_test']['ttl'][ $k ] = (int) $ttl;
	return true;
}
function delete_transient( $k ) { unset( $GLOBALS['dccwl_test']['transients'][ $k ] ); return true; }

/* ---- hooks ---------------------------------------------------------- */
function add_action( $h, $cb, $p = 10, $args = 1 ) { $GLOBALS['dccwl_test']['actions'][] = [ $h, $cb, $p ]; return true; }
function add_filter( $h, $cb, $p = 10, $args = 1 ) { $GLOBALS['dccwl_test']['filters'][] = [ $h, $cb, $p ]; return true; }
function remove_filter( $h, $cb, $p = 10 ) { return true; }
function remove_action( $h, $cb, $p = 10 ) { return true; }
function apply_filters( $h, $v, ...$rest ) { return $v; }
function do_action( $h, ...$a ) {}
function has_action( $h, $cb = false ) { foreach ( $GLOBALS['dccwl_test']['actions'] as $a ) { if ( $a[0] === $h ) { return $a[2]; } } return false; }
function add_shortcode( $t, $cb ) { $GLOBALS['dccwl_test']['shortcodes'][ $t ] = $cb; }
function shortcode_atts( $pairs, $atts, $shortcode = '' ) {
	$atts = (array) $atts;
	$out  = [];
	foreach ( $pairs as $name => $default ) {
		$out[ $name ] = array_key_exists( $name, $atts ) ? $atts[ $name ] : $default;
	}
	return $out;
}
function did_action( $h ) { return 0; }

function register_activation_hook( $file, $cb ) { $GLOBALS['dccwl_test']['activation'][] = $cb; return true; }
function register_deactivation_hook( $file, $cb ) { $GLOBALS['dccwl_test']['deactivation'][] = $cb; return true; }

/* ---- cron ----------------------------------------------------------- */
function wp_next_scheduled( $h, $args = [] ) { return $GLOBALS['dccwl_test']['cron'][ $h ] ?? false; }
function wp_schedule_event( $ts, $rec, $h, $args = [] ) { $GLOBALS['dccwl_test']['cron'][ $h ] = $ts; return true; }
function wp_clear_scheduled_hook( $h, $args = [] ) { unset( $GLOBALS['dccwl_test']['cron'][ $h ] ); return 1; }

/* ---- settings API + admin ------------------------------------------- */
function register_setting( $g, $n, $a = [] ) { $GLOBALS['dccwl_test']['settings'][] = [ $g, $n, $a ]; }
function settings_fields( $g ) { echo '<input type="hidden" name="option_page" value="' . esc_attr( $g ) . '" />'; }
function do_settings_sections( $p ) {}
function submit_button( $t = null, ...$rest ) { echo '<button type="submit">' . esc_html( $t ?? 'Save Changes' ) . '</button>'; }
function selected( $a, $b = true, $echo = true ) { $r = (string) $a === (string) $b ? " selected='selected'" : ''; if ( $echo ) { echo $r; } return $r; }
function checked( $a, $b = true, $echo = true ) { $r = (string) $a === (string) $b ? " checked='checked'" : ''; if ( $echo ) { echo $r; } return $r; }
function current_user_can( $c ) { return (bool) $GLOBALS['dccwl_test']['caps']; }
function wp_die( $m = '', ...$rest ) { $GLOBALS['dccwl_test']['die'] = (string) $m; throw new \RuntimeException( 'wp_die: ' . (string) $m ); }
function wp_create_nonce( $a = -1 ) { return 'nonce-' . md5( (string) $a ); }
function wp_nonce_field( $a = -1, $n = '_wpnonce', $ref = true, $echo = true ) {
	$f = '<input type="hidden" name="' . esc_attr( $n ) . '" value="' . wp_create_nonce( $a ) . '" />';
	if ( $echo ) { echo $f; }
	return $f;
}
function check_admin_referer( $a = -1, $n = '_wpnonce' ) {
	if ( ! $GLOBALS['dccwl_test']['nonce_ok'] ) { throw new \RuntimeException( 'nonce failed' ); }
	return 1;
}
function add_submenu_page( $parent, $pt, $mt, $cap, $slug, $cb = null, $pos = null ) {
	$GLOBALS['dccwl_test']['menu'][] = [ 'type' => 'submenu', 'parent' => $parent, 'cap' => $cap, 'slug' => $slug ];
	return 'toplevel_page_' . $slug;
}
function add_options_page( $pt, $mt, $cap, $slug, $cb = null, $pos = null ) {
	$GLOBALS['dccwl_test']['menu'][] = [ 'type' => 'options', 'parent' => 'options-general.php', 'cap' => $cap, 'slug' => $slug ];
	return 'settings_page_' . $slug;
}
function add_menu_page( $pt, $mt, $cap, $slug, $cb = null, ...$rest ) {
	$GLOBALS['dccwl_test']['menu'][] = [ 'type' => 'top', 'parent' => '', 'cap' => $cap, 'slug' => $slug ];
	return 'toplevel_page_' . $slug;
}
function is_admin() { return (bool) ( $GLOBALS['dccwl_test']['is_admin'] ?? false ); }
function admin_url( $p = '' ) { return 'https://example.test/wp-admin/' . ltrim( (string) $p, '/' ); }
function wp_safe_redirect( $u, $s = 302 ) { $GLOBALS['dccwl_test']['redirect'] = $u; return true; }
function add_query_arg( $args, $url = '' ) {
	$q = is_array( $args ) ? http_build_query( $args ) : (string) $args;
	return $url . ( false === strpos( (string) $url, '?' ) ? '?' : '&' ) . $q;
}
function get_current_screen() { return null; }

/* ---- sanitising ----------------------------------------------------- */
function sanitize_text_field( $s ) { return trim( preg_replace( '/[\r\n\t]+/', ' ', strip_tags( (string) $s ) ) ); }
function sanitize_html_class( $c, $fallback = '' ) {
	$c = preg_replace( '/[^A-Za-z0-9_\-]/', '', (string) $c );
	return '' === $c ? (string) $fallback : $c;
}
function sanitize_title( $s ) { return strtolower( preg_replace( '/[^A-Za-z0-9\-]+/', '-', (string) $s ) ); }
function sanitize_key( $s ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $s ) ); }
function sanitize_file_name( $s ) { return preg_replace( '/[^A-Za-z0-9._\-]/', '', (string) $s ); }
function absint( $n ) { return abs( (int) $n ); }
function wp_parse_args( $args, $defaults = [] ) {
	$args = is_array( $args ) ? $args : [];
	return array_merge( $defaults, $args );
}
function wp_json_encode( $d, $f = 0, $depth = 512 ) { return json_encode( $d, (int) $f, (int) $depth ); }

/* ---- assets --------------------------------------------------------- */
function wp_register_style( $h, $src = '', $deps = [], $v = false, $m = 'all' ) { $GLOBALS['dccwl_test']['registered'][ $h ] = [ 'src' => $src, 'deps' => $deps ]; return true; }
function wp_register_script( $h, $src = '', $deps = [], $v = false, $footer = false ) { $GLOBALS['dccwl_test']['registered'][ $h ] = [ 'src' => $src, 'deps' => $deps ]; return true; }
function wp_enqueue_style( $h, ...$rest ) { $GLOBALS['dccwl_test']['enqueued'][] = $h; }
function wp_enqueue_script( $h, ...$rest ) { $GLOBALS['dccwl_test']['enqueued'][] = $h; }
function wp_add_inline_script( $h, $data, $pos = 'after' ) { $GLOBALS['dccwl_test']['inline'][] = [ $h, $data ]; return true; }
function wp_style_is( $h, $list = 'enqueued' ) { return in_array( $h, $GLOBALS['dccwl_test']['enqueued'], true ); }
function wp_script_is( $h, $list = 'enqueued' ) { return in_array( $h, $GLOBALS['dccwl_test']['enqueued'], true ); }

/* ---- paths + REST --------------------------------------------------- */
function plugin_dir_path( $f ) { return rtrim( dirname( (string) $f ), '/' ) . '/'; }
function plugin_dir_url( $f ) { return 'https://example.test/wp-content/plugins/dcc-wildlife/'; }
function trailingslashit( $s ) { return rtrim( (string) $s, '/\\' ) . '/'; }
function untrailingslashit( $s ) { return rtrim( (string) $s, '/\\' ); }
function home_url( $path = '', $scheme = null ) { return 'https://example.test/' . ltrim( (string) $path, '/' ); }
function site_url( $path = '', $scheme = null ) { return home_url( $path ); }
function get_bloginfo( $show = '' ) { return 'admin@example.test'; }
function rest_url( $p = '' ) { return 'https://example.test/wp-json/' . ltrim( (string) $p, '/' ); }
function register_rest_route( $ns, $route, $args = [], $override = false ) {
	$GLOBALS['dccwl_test']['routes'][] = [ 'ns' => $ns, 'route' => $route, 'args' => $args ];
	return true;
}
function __return_true() { return true; }
function __return_false() { return false; }
function wp_upload_dir() { return [ 'basedir' => sys_get_temp_dir() . '/dccwl-uploads', 'baseurl' => 'https://example.test/wp-content/uploads' ]; }
function wp_get_upload_dir() { return wp_upload_dir(); }
function wp_mkdir_p( $d ) { return is_dir( $d ) || mkdir( $d, 0777, true ); }

/* ---- posts / attachments -------------------------------------------- */
function get_posts( $args = [] ) { return $GLOBALS['dccwl_test']['posts']; }
function wp_get_attachment_url( $id ) { return $GLOBALS['dccwl_test']['attach_url'][ (int) $id ] ?? false; }
function get_post_meta( $id, $key = '', $single = false ) { return $single ? '' : []; }
function update_post_meta( ...$a ) { return true; }
function wp_insert_attachment( $data, $file = false, $parent = 0, $wp_error = false ) { return 1; }
function wp_delete_post( $id, $force = false ) { return true; }
function wp_generate_attachment_metadata( $id, $file ) { return []; }
function wp_update_attachment_metadata( $id, $data ) { return true; }
function wp_get_attachment_metadata( $id, $unfiltered = false ) { return []; }
function wp_unique_filename( $dir, $name, $cb = null ) { return $name; }
function wp_check_filetype( $name, $mimes = null ) { return [ 'ext' => 'jpg', 'type' => 'image/jpeg' ]; }

/* ---- HTTP ----------------------------------------------------------- */
function wp_remote_get( $url, $args = [] ) {
	foreach ( $GLOBALS['dccwl_test']['http'] as $needle => $resp ) {
		if ( false !== strpos( (string) $url, (string) $needle ) ) { return $resp; }
	}
	return new WP_Error( 'no_stub', 'No HTTP stub for ' . $url );
}
function wp_remote_retrieve_body( $r ) { return is_array( $r ) ? ( $r['body'] ?? '' ) : ''; }
function wp_remote_retrieve_response_code( $r ) { return is_array( $r ) ? ( $r['code'] ?? 0 ) : 0; }
function is_wp_error( $t ) { return $t instanceof WP_Error; }

class WP_Error {
	public string $code;
	public string $message;
	public function __construct( $code = '', $message = '' ) { $this->code = (string) $code; $this->message = (string) $message; }
	public function get_error_message() { return $this->message; }
	public function get_error_code() { return $this->code; }
}

class WP_REST_Response {
	public $data;
	public array $headers = [];
	public int $status    = 200;
	public function __construct( $data = null, $status = 200 ) { $this->data = $data; $this->status = (int) $status; }
	public function header( $k, $v ) { $this->headers[ $k ] = $v; }
	public function get_data() { return $this->data; }
}
