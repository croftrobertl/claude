<?php
/**
 * Guest sightings: CPT registration, admin columns, and the two AJAX
 * endpoints (submit + recent list).
 *
 * The endpoints are deliberately NONCE-FREE: this site is aggressively
 * page-cached, and nonces baked into cached HTML expire and 403 — a proven
 * failure mode here. Abuse is handled instead by layered validation:
 * honeypot, time-trap, per-IP rate limit, strict allowlists and hard
 * length caps. Submissions are never published directly (always pending).
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Sightings {

	public const CPT = 'dcc_wl_sighting';

	public const MAX_NOTE = 200;
	public const MAX_NAME = 50;

	private const MIN_ELAPSED_MS = 3000;
	private const RATE_MAX       = 3;
	private const RATE_WINDOW    = 3600; // 1 hour.
	private const RECENT_COUNT   = 8;

	public static function register_hooks(): void {
		add_action( 'init', [ self::class, 'register_cpt' ] );

		add_action( 'wp_ajax_dcc_wl_submit', [ self::class, 'handle_submit' ] );
		add_action( 'wp_ajax_nopriv_dcc_wl_submit', [ self::class, 'handle_submit' ] );
		add_action( 'wp_ajax_dcc_wl_recent', [ self::class, 'handle_recent' ] );
		add_action( 'wp_ajax_nopriv_dcc_wl_recent', [ self::class, 'handle_recent' ] );

		add_filter( 'manage_' . self::CPT . '_posts_columns', [ self::class, 'admin_columns' ] );
		add_action( 'manage_' . self::CPT . '_posts_custom_column', [ self::class, 'admin_column_content' ], 10, 2 );
	}

	public static function is_enabled(): bool {
		return (bool) Settings::get( 'sightings_enabled' );
	}

	public static function register_cpt(): void {
		register_post_type(
			self::CPT,
			[
				'labels'          => [
					'name'          => __( 'Sightings', 'dcc-wildlife' ),
					'singular_name' => __( 'Sighting', 'dcc-wildlife' ),
					'menu_name'     => __( 'Sightings', 'dcc-wildlife' ),
					'edit_item'     => __( 'Review Sighting', 'dcc-wildlife' ),
					'search_items'  => __( 'Search Sightings', 'dcc-wildlife' ),
					'not_found'     => __( 'No sightings found.', 'dcc-wildlife' ),
				],
				'description'     => __( 'Guest wildlife sightings, moderated before display.', 'dcc-wildlife' ),
				'public'          => false,
				'show_ui'         => true,
				'show_in_menu'    => true,
				'menu_position'   => 26,
				'menu_icon'       => 'dashicons-palmtree',
				'supports'        => [ 'title' ],
				'capability_type' => 'post',
				'map_meta_cap'    => true,
				'show_in_rest'    => false,
				'rewrite'         => false,
				'query_var'       => false,
			]
		);
	}

	/* ---------------------------------------------------------------------
	 * AJAX: submit
	 * ------------------------------------------------------------------- */

	public static function handle_submit(): void {
		if ( ! self::is_enabled() ) {
			wp_send_json_error(
				[ 'message' => __( 'The sightings log is currently closed.', 'dcc-wildlife' ) ],
				403
			);
		}

		// Honeypot: real guests never see (or fill) this field.
		if ( ! empty( $_POST['dccwl_website'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
			wp_send_json_error(
				[ 'message' => __( 'Your sighting could not be saved.', 'dcc-wildlife' ) ],
				400
			);
		}

		// Time-trap: the JS reports ms since the form was opened.
		$elapsed = isset( $_POST['dcc_wl_t'] ) ? absint( wp_unslash( $_POST['dcc_wl_t'] ) ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing
		if ( $elapsed < self::MIN_ELAPSED_MS ) {
			wp_send_json_error(
				[ 'message' => __( 'That was quick! Please take a moment and try again.', 'dcc-wildlife' ) ],
				400
			);
		}

		// Per-IP rate limit (sliding, max 3/hour).
		$ip       = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		$rate_key = 'dcc_wl_rl_' . md5( $ip );
		$count    = (int) get_transient( $rate_key );
		if ( $count >= self::RATE_MAX ) {
			wp_send_json_error(
				[ 'message' => __( 'Thanks for all the sightings! Please try again in an hour.', 'dcc-wildlife' ) ],
				429
			);
		}

		// Species must exist in the registry.
		$species  = isset( $_POST['dcc_wl_species'] ) ? sanitize_key( wp_unslash( $_POST['dcc_wl_species'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
		$registry = Species::registry();
		if ( '' === $species || ! isset( $registry[ $species ] ) ) {
			wp_send_json_error(
				[ 'message' => __( 'Please pick a species from the list.', 'dcc-wildlife' ) ],
				400
			);
		}

		// Date: strict Y-m-d, a real calendar date, not in the future
		// (measured on the property clock — the site timezone).
		$date = isset( $_POST['dcc_wl_date'] ) ? sanitize_text_field( wp_unslash( $_POST['dcc_wl_date'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
		if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m )
			|| ! checkdate( (int) $m[2], (int) $m[3], (int) $m[1] )
			|| $date > wp_date( 'Y-m-d' )
			|| $date < '2000-01-01'
		) {
			wp_send_json_error(
				[ 'message' => __( 'Please pick a valid date (no future dates).', 'dcc-wildlife' ) ],
				400
			);
		}

		$note = isset( $_POST['dcc_wl_note'] ) ? sanitize_text_field( wp_unslash( $_POST['dcc_wl_note'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
		$note = mb_substr( $note, 0, self::MAX_NOTE );
		$name = isset( $_POST['dcc_wl_name'] ) ? sanitize_text_field( wp_unslash( $_POST['dcc_wl_name'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
		$name = mb_substr( $name, 0, self::MAX_NAME );

		$post_id = wp_insert_post(
			[
				'post_type'   => self::CPT,
				'post_status' => 'pending',
				'post_title'  => sprintf( '%s — %s', $registry[ $species ]['name'], $date ),
				'meta_input'  => [
					'_dcc_wl_species' => $species,
					'_dcc_wl_date'    => $date,
					'_dcc_wl_note'    => $note,
					'_dcc_wl_name'    => $name,
				],
			],
			true
		);

		if ( is_wp_error( $post_id ) ) {
			wp_send_json_error(
				[ 'message' => __( 'Sorry — your sighting could not be saved right now.', 'dcc-wildlife' ) ],
				500
			);
		}

		set_transient( $rate_key, $count + 1, self::RATE_WINDOW );

		wp_send_json_success(
			[ 'message' => __( 'Thank you! Your sighting will appear once it has been approved.', 'dcc-wildlife' ) ]
		);
	}

	/* ---------------------------------------------------------------------
	 * AJAX: recent approved sightings
	 * ------------------------------------------------------------------- */

	public static function handle_recent(): void {
		if ( ! self::is_enabled() ) {
			wp_send_json_success( [ 'items' => [] ] );
		}

		$registry = Species::registry();
		$query    = new \WP_Query(
			[
				'post_type'              => self::CPT,
				'post_status'            => 'publish',
				'posts_per_page'         => self::RECENT_COUNT,
				'meta_key'               => '_dcc_wl_date',
				'orderby'                => [
					'meta_value' => 'DESC',
					'date'       => 'DESC',
				],
				'no_found_rows'          => true,
				'update_post_term_cache' => false,
			]
		);

		$items = [];
		foreach ( $query->posts as $post ) {
			$species = sanitize_key( (string) get_post_meta( $post->ID, '_dcc_wl_species', true ) );
			if ( ! isset( $registry[ $species ] ) ) {
				continue;
			}
			$date  = sanitize_text_field( (string) get_post_meta( $post->ID, '_dcc_wl_date', true ) );
			$stamp = strtotime( $date . ' 12:00:00' );

			// Defense in depth: values were sanitized on the way in, and are
			// sanitized again here; the JS additionally renders via textContent.
			$items[] = [
				'species' => $species,
				'date'    => $stamp ? date_i18n( get_option( 'date_format' ), $stamp ) : $date,
				'note'    => mb_substr( sanitize_text_field( (string) get_post_meta( $post->ID, '_dcc_wl_note', true ) ), 0, self::MAX_NOTE ),
				'name'    => mb_substr( sanitize_text_field( (string) get_post_meta( $post->ID, '_dcc_wl_name', true ) ), 0, self::MAX_NAME ),
			];
		}

		wp_send_json_success( [ 'items' => $items ] );
	}

	/* ---------------------------------------------------------------------
	 * Admin list columns
	 * ------------------------------------------------------------------- */

	/**
	 * @param array<string,string> $columns Default columns.
	 * @return array<string,string>
	 */
	public static function admin_columns( array $columns ): array {
		return [
			'cb'                => $columns['cb'] ?? '<input type="checkbox" />',
			'title'             => __( 'Sighting', 'dcc-wildlife' ),
			'dcc_wl_species'    => __( 'Species', 'dcc-wildlife' ),
			'dcc_wl_date'       => __( 'Sighted on', 'dcc-wildlife' ),
			'dcc_wl_note'       => __( 'Note', 'dcc-wildlife' ),
			'dcc_wl_guest_name' => __( 'First name', 'dcc-wildlife' ),
			'date'              => __( 'Submitted', 'dcc-wildlife' ),
		];
	}

	public static function admin_column_content( string $column, int $post_id ): void {
		switch ( $column ) {
			case 'dcc_wl_species':
				$registry = Species::registry();
				$species  = sanitize_key( (string) get_post_meta( $post_id, '_dcc_wl_species', true ) );
				if ( isset( $registry[ $species ] ) ) {
					echo esc_html( $registry[ $species ]['emoji'] . ' ' . $registry[ $species ]['name'] );
				} else {
					echo '&#8212;';
				}
				break;
			case 'dcc_wl_date':
				echo esc_html( (string) get_post_meta( $post_id, '_dcc_wl_date', true ) );
				break;
			case 'dcc_wl_note':
				echo esc_html( (string) get_post_meta( $post_id, '_dcc_wl_note', true ) );
				break;
			case 'dcc_wl_guest_name':
				echo esc_html( (string) get_post_meta( $post_id, '_dcc_wl_name', true ) );
				break;
		}
	}
}
