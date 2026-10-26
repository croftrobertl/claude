<?php
/**
 * Plugin Name:       DCC Wildlife
 * Plugin URI:        https://doracanalcourt.com/
 * Description:       "On the Canal This Month" wildlife guide, plus a fishing & water-conditions module for Dora Canal Court. The wildlife guide and the water almanac are 100% WordPress-native — no external services. An optional, off-by-default live layer fetches public USGS and NWS data server-side; no API keys, no accounts, no CDN scripts.
 * Version:           1.47.2
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Dora Canal Court
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dcc-wildlife
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DCC_WL_VERSION', '1.47.2' );
define( 'DCC_WL_FILE', __FILE__ );
define( 'DCC_WL_DIR', plugin_dir_path( __FILE__ ) );
define( 'DCC_WL_URL', plugin_dir_url( __FILE__ ) );

/*
 * THE REGISTRY IS AUTOLOADED, NOT REQUIRED (1.45.0).
 *
 * class-species.php is 572 KB — the 402-entry registry, the calendar, the
 * photo map and the credits — and it was parsed on EVERY WordPress request,
 * including admin screens, cron, REST calls to other plugins and wp-login.
 * Nothing on those paths reads a species. The Director measured it; this is
 * the one file in the plugin big enough for the parse to be worth avoiding.
 *
 * ONE class, ONE file, mapped explicitly rather than by a name-to-path rule:
 * a convention that guesses a filename is how a typo becomes a fatal, and
 * the rest of this plugin loads eagerly on purpose — the classes below are
 * small and every request that renders anything needs them.
 *
 * `test-bootstrap.php` knows about this map and still proves the class is
 * reachable: an autoloaded file is on the require graph, and a class the
 * autoloader cannot resolve to a real file fails the suite exactly as a
 * missing `require_once` does. That suite exists because 1.33.0 fataled on
 * activation with every other suite green; it is not routed around here.
 */
spl_autoload_register(
	static function ( string $class ): void {
		$map = [
			'DCC_WL\\Species' => 'includes/class-species.php',
			/*
			 * 1.46.0: the local-first table — 402 rows of iNaturalist record
			 * counts, dates and observation URLs, 62 KB. Autoloaded for the
			 * same reason the registry is: a page that never asks where a
			 * species has been recorded should not pay to read the answer.
			 */
			'DCC_WL\\Local'   => 'includes/class-local.php',
		];
		if ( isset( $map[ $class ] ) ) {
			require_once DCC_WL_DIR . $map[ $class ];
		}
	}
);

require_once DCC_WL_DIR . 'includes/class-sprites.php';
require_once DCC_WL_DIR . 'includes/class-photo-library.php';
require_once DCC_WL_DIR . 'includes/class-guide-data.php';
require_once DCC_WL_DIR . 'includes/class-guide-rest.php';
require_once DCC_WL_DIR . 'includes/class-render.php';
require_once DCC_WL_DIR . 'includes/class-water-fact.php';
require_once DCC_WL_DIR . 'includes/class-water-data.php';
require_once DCC_WL_DIR . 'includes/class-water-live.php';
require_once DCC_WL_DIR . 'includes/class-water-rest.php';
require_once DCC_WL_DIR . 'includes/class-water-render.php';
require_once DCC_WL_DIR . 'includes/class-water-admin.php';
require_once DCC_WL_DIR . 'includes/class-canal-render.php';
require_once DCC_WL_DIR . 'includes/class-guide-page.php';
require_once DCC_WL_DIR . 'includes/class-plugin.php';

/*
 * WP-CLI: `wp dcc-wildlife import-photos [--dry-run]`.
 *
 * One import function, two callers — this and the button on the Wildlife
 * admin screen. The owner works from a phone and must never need a shell to
 * reinstall; whoever has server access would rather run it and watch it.
 */
if ( defined( 'WP_CLI' ) && WP_CLI ) {
	\WP_CLI::add_command(
		'dcc-wildlife import-photos',
		static function ( array $args, array $assoc ): void {
			$report = \DCC_WL\Photo_Library::import( [ 'dry_run' => ! empty( $assoc['dry-run'] ) ] );
			foreach ( [ 'created', 'skipped', 'failed', 'missing' ] as $bucket ) {
				foreach ( $report[ $bucket ] as $key ) {
					\WP_CLI::log( sprintf( '%-9s %s', $bucket, $key ) );
				}
			}
			$line = \DCC_WL\Photo_Library::summarise( $report );
			if ( $report['failed'] ) {
				\WP_CLI::error( $line );
			}
			\WP_CLI::success( $line );
		}
	);
}

register_deactivation_hook( __FILE__, [ Plugin::class, 'on_deactivate' ] );

Plugin::instance();
