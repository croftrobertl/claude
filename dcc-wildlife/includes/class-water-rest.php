<?php
/**
 * Water module — REST routes.
 *
 * The public route serves the server-side transient only. The browser calls
 * it after the SpeedyCache-served shell has painted, which is the only way
 * a time-sensitive value can be correct on this site.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Water_Rest {

	public const NS = 'dcc-wildlife/v1';

	public static function register_hooks(): void {
		add_action( 'rest_api_init', [ self::class, 'register_routes' ] );
	}

	public static function register_routes(): void {
		// Public, read-only, no secrets: the cached conditions payload.
		register_rest_route(
			self::NS,
			'/conditions',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'conditions' ],
				'permission_callback' => '__return_true',
			]
		);

		// Public, read-only: everything the map draws. Served from the same
		// transients as the text, and only ever requested when a guest
		// actually opens the map.
		register_rest_route(
			self::NS,
			'/map',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'map' ],
				'permission_callback' => '__return_true',
			]
		);

		// Admin-only: probe both Water Atlas reports.
		register_rest_route(
			self::NS,
			'/test-atlas',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'test_atlas' ],
				'permission_callback' => static fn(): bool => current_user_can( 'manage_options' ),
			]
		);

		// Admin-only: sweep the Atlas for chain waters not yet configured.
		register_rest_route(
			self::NS,
			'/discover-waters',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'discover_waters' ],
				'permission_callback' => static fn(): bool => current_user_can( 'manage_options' ),
			]
		);

		// Admin-only: live gauge discovery against the USGS site service.
		register_rest_route(
			self::NS,
			'/discover-gauges',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'discover' ],
				'permission_callback' => static fn(): bool => current_user_can( 'manage_options' ),
			]
		);
	}

	public static function conditions(): \WP_REST_Response {
		$payload = Water_Live::conditions();
		$facts   = $payload['facts'];
		$stale   = ! empty( $payload['stale'] );

		$response = new \WP_REST_Response(
			[
				'enabled' => Water_Data::live_enabled(),
				'facts'   => $facts,
				// The parts behind the Wind reading, for the map badge (1.35.0).
				'wind'    => $payload['wind'] ?? null,
				/*
				 * 1.45.0: these two say WHAT KIND of answer this is, so the
				 * client never has to guess from an empty array. `stale` is
				 * the last-good copy being served while a refresh or a
				 * failure window passes; `fetched` is when the readings in it
				 * were collected, which the strip labels itself with.
				 */
				'stale'   => $stale,
				'fetched' => (string) ( $payload['fetched'] ?? '' ),
			]
		);

		/*
		 * THE CACHE HEADER IS A CLAIM ABOUT THE ANSWER, SO IT FOLLOWS THE
		 * ANSWER (1.45.0).
		 *
		 * Through 1.44.6 this was an unconditional `max-age=120`, including
		 * on the empty response the old `conditions()` returned while the
		 * refresh lock was held. A guest who arrived in that window had the
		 * blank panel CACHED for two minutes by their browser and by
		 * whatever sits in front of it, so the one visitor who hit the race
		 * was the one guaranteed to keep seeing nothing. Three cache layers
		 * on this site make that worse, not better.
		 *
		 *   - real readings, freshly fetched: the old two minutes, which is
		 *     well inside the 15-minute transient behind it;
		 *   - the last-good copy: 30 seconds, long enough to spare the
		 *     source a stampede, short enough that the guest's next
		 *     interaction can pick up the fresh set;
		 *   - nothing at all: `no-store`. An absence is never worth
		 *     remembering.
		 */
		if ( ! $facts ) {
			$response->header( 'Cache-Control', 'no-store, max-age=0' );
		} elseif ( $stale ) {
			$response->header( 'Cache-Control', 'public, max-age=30' );
		} else {
			$response->header( 'Cache-Control', 'public, max-age=120' );
		}
		return $response;
	}

	public static function map(): \WP_REST_Response {
		if ( ! Water_Data::map_possible() ) {
			return new \WP_REST_Response( [ 'enabled' => false ] );
		}
		// The CACHED accessor, not the generator: a cold assembly is fourteen
		// sequential Atlas calls and a guest measured 14.6s waiting for it.
		$payload            = Water_Live::map_payload();
		$payload['enabled'] = true;

		$response = new \WP_REST_Response( $payload );
		$response->header( 'Cache-Control', 'public, max-age=600' );
		return $response;
	}

	public static function test_atlas(): \WP_REST_Response {
		return new \WP_REST_Response( Water_Live::probe_atlas() );
	}

	public static function discover_waters(): \WP_REST_Response {
		return new \WP_REST_Response( [ 'waters' => Water_Live::discover_waters() ] );
	}

	public static function discover(): \WP_REST_Response {
		return new \WP_REST_Response(
			[
				'sites' => Water_Live::discover_gauges(),
			]
		);
	}
}
