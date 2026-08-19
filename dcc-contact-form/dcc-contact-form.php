<?php
/**
 * Plugin Name:       DCC Contact Form
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       Self-contained native Elementor (free) contact form widget for Dora Canal Court. Reproduces the site's single WPForms form — look, email, spam protection (honeypot, time-trap, keyword filter, reCAPTCHA v3), entry storage — with no dependency on WPForms. Vanilla JS, no external libraries, assets load only where the widget is present.
 * Version:           1.1.1
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-contact-form
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DCC_CONTACT_VERSION', '1.1.1');
define('DCC_CONTACT_FILE', __FILE__);
define('DCC_CONTACT_DIR', plugin_dir_path(__FILE__));
define('DCC_CONTACT_URL', plugin_dir_url(__FILE__));
define('DCC_CONTACT_AJAX_ACTION', 'dcc_contact_submit');

/**
 * Lazy autoloader for DCC_Contact\ classes. class-widget.php cannot be required
 * eagerly — its `extends \Elementor\Widget_Base` parent reference is resolved at
 * parse time and Elementor's class only becomes autoloadable after Elementor's
 * own boot finishes. Deferring the parse to first use avoids that ordering trap.
 */
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCC_Contact\\', 12) !== 0) {
        return;
    }
    $short = substr($class, 12);
    $file  = DCC_CONTACT_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

register_activation_hook(__FILE__, ['\\DCC_Contact\\Entries', 'on_activate']);

add_action('plugins_loaded', static function (): void {
    \DCC_Contact\Plugin::instance()->boot();
}, 20);
