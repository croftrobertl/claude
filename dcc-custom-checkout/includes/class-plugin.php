<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Singleton orchestrator. Wires up the collaborators and nothing else.
 */
final class Plugin
{
    private static ?Plugin $instance = null;

    private bool $booted = false;

    public static function instance(): self
    {
        return self::$instance ??= new self();
    }

    public function boot(): void
    {
        if ($this->booted) {
            return;
        }
        $this->booted = true;

        add_action('init', [$this, 'load_textdomain']);

        // MotoPress is required. Without it there is no checkout to customize.
        if (!function_exists('MPHB')) {
            add_action('admin_notices', [$this, 'render_missing_deps_notice']);
            return;
        }

        // Front-end: conditional CSS/JS on the checkout page only.
        (new Assets())->register();

        // Server-side backstops (cannot be bypassed by editing the DOM).
        (new Guest_Fields())->register();
        (new Pet_Service())->register();
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'dcc-checkout',
            false,
            dirname(plugin_basename(DCC_CHECKOUT_FILE)) . '/languages'
        );
    }

    public function render_missing_deps_notice(): void
    {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html__(
                'DCC Custom Checkout requires the MotoPress Hotel Booking plugin to be active.',
                'dcc-checkout'
            )
        );
    }
}
