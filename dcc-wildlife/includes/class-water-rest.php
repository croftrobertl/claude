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

		$response = new \WP_REST_Response(
			[
				'enabled' => Water_Data::live_enabled(),
				'facts'   => $payload['facts'],
			]
		);

		// This endpoint is itself cacheable for a short window, but never
		// longer than the underlying transient.
		$response->header( 'Cache-Control', 'public, max-age=120' );
		return $response;
	}

	public static function test_atlas(): \WP_REST_Response {
		return new \WP_REST_Response( Water_Live::probe_atlas() );
	}

	public static function discover(): \WP_REST_Response {
		return new \WP_REST_Response(
			[
				'sites' => Water_Live::discover_gauges(),
			]
		);
	}
}
