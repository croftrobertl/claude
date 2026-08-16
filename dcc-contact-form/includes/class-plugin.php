<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Boot / wiring. Registers the Elementor category + widget, the conditional
 * front-end assets, the AJAX + non-JS submission endpoints, and the admin UI.
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

        // Admin UI (submissions + settings) does not need Elementor present.
        if (is_admin()) {
            Admin::init();
        }

        // Submission endpoints must exist whether or not Elementor is active so
        // an already-rendered (cached) form keeps working even if Elementor is
        // toggled off. They read config from our own server-side store.
        add_action('wp_ajax_' . DCC_CONTACT_AJAX_ACTION, ['\\DCC_Contact\\Form_Handler', 'handle_ajax']);
        add_action('wp_ajax_nopriv_' . DCC_CONTACT_AJAX_ACTION, ['\\DCC_Contact\\Form_Handler', 'handle_ajax']);
        add_action('admin_post_' . DCC_CONTACT_AJAX_ACTION, ['\\DCC_Contact\\Form_Handler', 'handle_post']);
        add_action('admin_post_nopriv_' . DCC_CONTACT_AJAX_ACTION, ['\\DCC_Contact\\Form_Handler', 'handle_post']);

        if (!did_action('elementor/loaded')) {
            add_action('admin_notices', [$this, 'render_missing_elementor_notice']);
            return;
        }

        add_action('elementor/elements/categories_registered', [$this, 'register_category']);
        add_action('elementor/widgets/register', [$this, 'register_widget']);

        add_action('wp_enqueue_scripts', ['\\DCC_Contact\\Widget', 'register_assets']);
        add_action('elementor/preview/enqueue_scripts', ['\\DCC_Contact\\Widget', 'enqueue_for_preview']);

        // Keep our tiny form script/stylesheet out of aggressive combine/defer
        // optimizers (SpeedyCache Pro, etc.). The form must be interactive on
        // first paint; a broken combined bundle would leave submit inert.
        add_filter('script_loader_tag', ['\\DCC_Contact\\Widget', 'keep_script_unoptimized'], 10, 2);
        add_filter('style_loader_tag', ['\\DCC_Contact\\Widget', 'keep_style_unoptimized'], 10, 2);
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'dcc-contact-form',
            false,
            dirname(plugin_basename(DCC_CONTACT_FILE)) . '/languages'
        );
    }

    public function render_missing_elementor_notice(): void
    {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        printf(
            '<div class="notice notice-warning"><p>%s</p></div>',
            esc_html__('DCC Contact Form requires the Elementor plugin to be active to add the form widget. The admin submissions and settings screens are still available.', 'dcc-contact-form')
        );
    }

    public function register_category(\Elementor\Elements_Manager $elements_manager): void
    {
        $elements_manager->add_category(
            'dcc-widgets',
            [
                'title' => __('Dora Canal Court', 'dcc-contact-form'),
                'icon'  => 'fa fa-plug',
            ]
        );
    }

    public function register_widget(\Elementor\Widgets_Manager $widgets_manager): void
    {
        $widgets_manager->register(new Widget());
    }
}
