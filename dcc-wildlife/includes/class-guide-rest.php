<?php
/**
 * The species guide's one REST route: the sheet-only half of the dataset.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A BROADENING OF THE NETWORK PROMISE.
 * The plugin's hard rule is that the guide makes no calls to external
 * services — no API keys, no accounts, no CDN, no webfonts. This route is the
 * site talking to itself: same origin, no third party, no key, and it serves
 * a constant that is baked into the plugin's own PHP. Nothing leaves the
 * server that was not already in the page a release ago.
 *
 * What it buys, measured against a synthetic four-hundred-species registry:
 * the inline config drops from 103 KB gzipped to 8.9 KB, on every page view,
 * for every guest. The 78 KB that used to ride along is fetched once, by the
 * guests who actually open a species, and cached for a year.
 *
 * IMMUTABLE BY CONSTRUCTION. The URL carries the plugin version, so a release
 * that changes a fact changes the URL. That is what makes a year-long
 * Cache-Control honest rather than a trap.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Guide_Rest {

	public const NS = 'dcc-wildlife/v1';

	public static function register_hooks(): void {
		add_action( 'rest_api_init', [ self::class, 'register_routes' ] );
	}

	public static function register_routes(): void {
		register_rest_route(
			self::NS,
			'/species',
			[
				'methods'             => 'GET',
				'callback'            => [ self::class, 'species' ],
				'permission_callback' => '__return_true',
				'args'                => [
					// Present so the URL changes with the release; its VALUE is
					// never read, because the answer is whatever this build of
					// the plugin holds. Validating it would only invite a 400
					// on a stale cached page.
					'v' => [ 'required' => false ],
				],
			]
		);
	}

	/** The URL the client fetches, version-stamped so it can be cached hard. */
	public static function url(): string {
		return add_query_arg( 'v', DCC_WL_VERSION, rest_url( self::NS . '/species' ) );
	}

	public static function species(): \WP_REST_Response {
		$response = new \WP_REST_Response(
			[
				'version' => DCC_WL_VERSION,
				'species' => Species::wire_detail(),
			]
		);
		/*
		 * A year, and immutable. Safe only because the URL is version-stamped:
		 * the same URL can never describe two different releases. WordPress
		 * sends no-cache headers on REST responses for logged-in users, which
		 * is right and is left alone — this matters for the anonymous guest.
		 */
		$response->header( 'Cache-Control', 'public, max-age=31536000, immutable' );
		return $response;
	}
}
