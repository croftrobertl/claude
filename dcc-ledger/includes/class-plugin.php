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

        // Once a night, the ledger writes down what is on the books. It
        // reads MotoPress and writes only its own table; nothing is
        // recomputed or backfilled afterwards.
        add_action(Pace::HOOK, ['\\DCCL\\Pace', 'record']);

        if (defined('WP_CLI') && WP_CLI) {
            $this->register_cli();
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
     * Register the WP-CLI commands.
     *
     * Separate from boot() so the test suite can register them and then run
     * each one by the name a person actually types.
     */
    public function register_cli(): void
    {
        \WP_CLI::add_command('dcc-ledger', Cli::class);
        // Both spellings, registered rather than inferred. WP-CLI names a
        // subcommand after its method, so money_check answered to the
        // underscore only while every document said money-check — and
        // the one Rob would be typing is the rollback, at the worst
        // possible moment. The docblocks carry @subcommand and @alias as
        // well; these two lines mean the spelling does not depend on a
        // docblock being parsed.
        foreach (Cli::HYPHENATED as $name => $method) {
            \WP_CLI::add_command('dcc-ledger ' . $name, [Cli::class, $method]);
        }
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
        // 0.2.0: the stored decimals become whole cents. It backs the old
        // values up first, proves every total ties before and after, and
        // puts them back untouched if one does not.
        Money_Migration::run();
        Repair::on_upgrade(get_current_user_id());
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain('dcc-ledger', false, dirname(plugin_basename(DCCL_FILE)) . '/languages');
    }
}
