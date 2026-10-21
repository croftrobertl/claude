<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Hook registration. Nothing here writes anything: the tables are created on
 * activation, and on admin_init only when the stored DB version is behind.
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

        if (defined('WP_CLI') && WP_CLI) {
            \WP_CLI::add_command('dcc-ledger', Cli::class);
        }

        if (!is_admin()) {
            return; // Admins only. Nothing on the front end, ever.
        }

        add_action('admin_init', [$this, 'maybe_upgrade']);
        add_action('admin_menu', ['\\DCCL\\Admin', 'register_menu'], 11);
        add_action('admin_enqueue_scripts', ['\\DCCL\\Admin', 'enqueue']);
        Admin::register_actions();
    }

    /**
     * Bring the tables up to date, then tidy anything an older version left
     * behind. The tidying is a recorded batch, so it is visible and undoable.
     */
    public function maybe_upgrade(): void
    {
        if (get_option(Schema::VERSION_OPTION) === Schema::DB_VERSION) {
            return;
        }

        Schema::install();
        Repair::on_upgrade(get_current_user_id());
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain('dcc-ledger', false, dirname(plugin_basename(DCCL_FILE)) . '/languages');
    }
}
