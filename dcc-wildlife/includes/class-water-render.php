<?php
/**
 * Water module — renderer for the Elementor widget and [dcc_water].
 *
 * Cache-safety split:
 *   - The almanac, dock notes and links are static owner data, so they are
 *     server-rendered into the cached HTML. Safe: nothing about them
 *     changes with the clock.
 *   - Live conditions are time-sensitive, so PHP renders only an empty
 *     shell and assets/js/water.js fills it from the REST route after the
 *     cached page has painted. Each row shows the MEASUREMENT time from
 *     the upstream payload, never the fetch time.
 *
 * Every value on the page comes from a Water_Fact, so every value on the
 * page carries a source and a date. There is no other way in.
 *
 * AUTO-HIDE (v1.5.0, tightened in 1.6.0): a heading over five links reads
 * as unfinished on a guest page, so the module emits NOTHING unless it has
 * either static content (a CONDITION-tier sourced fact) or a real chance of
 * a live reading. "About the water" rows such as
 * surface area deliberately do not count: acreage is not a condition, and a
 * section promising fishing conditions must not appear on its strength. When only live content is possible, the section
 * is emitted hidden and assets/js/water.js reveals it only once genuine
 * readings arrive — so a failed fetch leaves the page clean rather than
 * showing an empty shell.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Water_Render {

	private static bool $config_added = false;

	/**
	 * [dcc_water title=""]
	 *
	 * @param array|string $atts
	 */
	public static function shortcode( $atts ): string {
		$atts = shortcode_atts(
			[ 'title' => '' ],
			array_change_key_case( (array) $atts, CASE_LOWER ),
			'dcc_water'
		);
		return self::render( [ 'title' => $atts['title'] ] );
	}

	/**
	 * @param array<string,mixed> $opts
	 */
	public static function render( array $opts ): string {
		$opts  = wp_parse_args( $opts, [ 'title' => '' ] );
		$title = sanitize_text_field( (string) $opts['title'] );
		if ( '' === $title ) {
			$title = __( 'Fishing & water conditions', 'dcc-wildlife' );
		}

		$almanac   = Water_Data::almanac( 'conditions' );
		$about     = Water_Data::almanac( 'about' );
		$links     = Water_Data::link_list( 'links' );
		$reports   = Water_Data::link_list( 'reports' );
		$live      = Water_Data::live_possible() || Water_Data::map_possible();
		$has_static = Water_Data::has_static_content();

		// Nothing sourced and no live layer: render nothing at all. An empty
		// section is worse than no section.
		if ( ! $has_static && ! $live ) {
			return '';
		}

		self::enqueue_assets();

		ob_start();
		?>
		<section class="dccwl-water" aria-labelledby="dccwl-water-title" data-dccwl-water-root<?php echo $has_static ? '' : ' hidden'; ?>>
			<h2 class="dccwl-water-title" id="dccwl-water-title"><?php echo esc_html( $title ); ?></h2>

			<?php if ( $live ) : ?>
				<?php /* Shell only — filled client-side so page caching cannot serve a stale reading. */ ?>
				<div class="dccwl-water-live" data-dccwl-water-live hidden>
					<h3 class="dccwl-water-sub"><?php esc_html_e( 'Right now', 'dcc-wildlife' ); ?></h3>
					<ul class="dccwl-water-facts" data-dccwl-water-facts></ul>

					<?php /* Each water against its OWN long-run median — the
					         comparison a visiting angler can act on without any
					         local knowledge. Filled client-side with the rest. */ ?>
					<div class="dccwl-chain" data-dccwl-chain hidden>
						<h3 class="dccwl-water-sub"><?php esc_html_e( 'Across the Harris Chain', 'dcc-wildlife' ); ?></h3>
						<p class="dccwl-chain-note"><?php esc_html_e( 'Clarity now against each water’s own long-run median — clearest relative to its own normal first.', 'dcc-wildlife' ); ?></p>
						<ul class="dccwl-water-facts" data-dccwl-water-chain></ul>
					</div>
				</div>
			<?php endif; ?>

			<?php self::render_almanac( $almanac ); ?>

			<?php if ( Water_Data::map_possible() ) : ?>
				<?php /* Nothing external — no Leaflet, no tiles, no map data —
				         loads until a guest presses this button. A guest who
				         never opens the map pays nothing for it. */ ?>
				<div class="dccwl-map-wrap" data-dccwl-map-wrap>
					<h3 class="dccwl-water-sub"><?php esc_html_e( 'Chain map', 'dcc-wildlife' ); ?></h3>
					<p class="dccwl-map-intro"><?php esc_html_e( 'Boat ramps, the waters of the chain and the stations these readings come from. The map loads only when you open it.', 'dcc-wildlife' ); ?></p>
					<p>
						<button type="button" class="dccwl-btn dccwl-map-open" data-dccwl-map-open>
							<?php esc_html_e( 'Open the chain map', 'dcc-wildlife' ); ?>
						</button>
					</p>
					<div class="dccwl-map-shell" data-dccwl-map-shell hidden></div>
				</div>
			<?php endif; ?>

			<?php if ( $about ) : ?>
				<?php /* Reference facts about the waterbody rather than today's
				         conditions. Rendered below everything else, and never
				         enough on their own to make this section appear. */ ?>
				<div class="dccwl-water-about">
					<h3 class="dccwl-water-sub"><?php esc_html_e( 'About the water', 'dcc-wildlife' ); ?></h3>
					<?php foreach ( $about as $waterbody => $facts ) : ?>
						<ul class="dccwl-water-facts">
							<?php foreach ( $facts as $fact ) : ?>
								<?php self::render_fact( $fact ); ?>
							<?php endforeach; ?>
						</ul>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>

			<?php self::render_links( __( 'Official information', 'dcc-wildlife' ), $links, 'dccwl-water-links' ); ?>
			<?php self::render_links( __( 'Local reports & charters', 'dcc-wildlife' ), $reports, 'dccwl-water-reports' ); ?>

			<?php if ( $links || $reports ) : ?>
				<p class="dccwl-water-disclaimer">
					<?php esc_html_e( 'Licences, seasons and limits change — check the FWC before you fish.', 'dcc-wildlife' ); ?>
				</p>
			<?php endif; ?>
		</section>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * @param array<string,Water_Fact[]> $almanac
	 */
	private static function render_almanac( array $almanac ): void {
		if ( ! $almanac ) {
			return; // Nothing sourced yet: the section does not exist.
		}

		foreach ( $almanac as $waterbody => $facts ) {
			// Split so general angling guidance is never mistaken for a
			// measurement taken on this water.
			$specific = array_filter( $facts, static fn( Water_Fact $f ): bool => Water_Fact::TIER_GENERAL !== $f->tier() );
			$general  = array_filter( $facts, static fn( Water_Fact $f ): bool => Water_Fact::TIER_GENERAL === $f->tier() );
			?>
			<div class="dccwl-water-body">
				<h3 class="dccwl-water-sub"><?php echo esc_html( $waterbody ); ?></h3>
				<?php if ( $specific ) : ?>
					<ul class="dccwl-water-facts">
						<?php foreach ( $specific as $fact ) : ?>
							<?php self::render_fact( $fact ); ?>
						<?php endforeach; ?>
					</ul>
				<?php endif; ?>
				<?php if ( $general ) : ?>
					<div class="dccwl-water-general">
						<p class="dccwl-water-general-head">
							<?php esc_html_e( 'General guidance — not measured on this water', 'dcc-wildlife' ); ?>
						</p>
						<ul class="dccwl-water-facts">
							<?php foreach ( $general as $fact ) : ?>
								<?php self::render_fact( $fact ); ?>
							<?php endforeach; ?>
						</ul>
					</div>
				<?php endif; ?>
			</div>
			<?php
		}
	}

	/**
	 * One fact row. Attribution is not optional decoration — it is rendered
	 * from the same object that guarantees the value was attributable.
	 */
	private static function render_fact( Water_Fact $fact ): void {
		$f = $fact->to_array();
		?>
		<li class="dccwl-water-fact dccwl-water-tier-<?php echo esc_attr( $f['tier'] ); ?>">
			<span class="dccwl-water-label"><?php echo esc_html( $f['label'] ); ?></span>
			<span class="dccwl-water-value"><?php echo esc_html( $f['value'] ); ?></span>
			<span class="dccwl-water-attr">
				<?php if ( '' !== $f['sourceUrl'] ) : ?>
					<a href="<?php echo esc_url( $f['sourceUrl'] ); ?>" rel="noopener nofollow" target="_blank">
						<?php echo esc_html( $f['sourceName'] ); ?>
					</a>
				<?php else : ?>
					<?php echo esc_html( $f['sourceName'] ); ?>
				<?php endif; ?>
				<span class="dccwl-water-date">
					<?php
					echo esc_html(
						'' !== ( $f['dateLabel'] ?? '' )
							? $f['dateLabel'] . ' ' . $f['date']
							: $f['date']
					);
					?>
				</span>
				<?php if ( '' !== $f['note'] ) : ?>
					<span class="dccwl-water-note"><?php echo esc_html( $f['note'] ); ?></span>
				<?php endif; ?>
			</span>
		</li>
		<?php
	}

	/**
	 * @param array<int,array<string,string>> $rows
	 */
	private static function render_links( string $heading, array $rows, string $class ): void {
		if ( ! $rows ) {
			return;
		}
		?>
		<div class="<?php echo esc_attr( $class ); ?>">
			<h3 class="dccwl-water-sub"><?php echo esc_html( $heading ); ?></h3>
			<ul class="dccwl-water-linklist">
				<?php foreach ( $rows as $row ) : ?>
					<li>
						<a href="<?php echo esc_url( $row['url'] ); ?>" rel="noopener nofollow" target="_blank">
							<?php echo esc_html( $row['label'] ); ?>
						</a>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
		<?php
	}

	private static function enqueue_assets(): void {
		wp_enqueue_style( 'dcc-wildlife-water' );

		if ( ! Water_Data::live_possible() ) {
			return; // No live layer: no script, no network call, nothing to fill.
		}

		wp_enqueue_script( 'dcc-wildlife-water' );

		if ( self::$config_added ) {
			return;
		}
		self::$config_added = true;

		wp_add_inline_script(
			'dcc-wildlife-water',
			'window.DCC_WL_WATER = ' . wp_json_encode(
				[
					'endpoint' => esc_url_raw( rest_url( Water_Rest::NS . '/conditions' ) ),
					'map'      => Water_Data::map_possible()
						? [
							'endpoint'   => esc_url_raw( rest_url( Water_Rest::NS . '/map' ) ),
							'leafletJs'  => Water_Data::map_asset( 'map_leaflet_js' ),
							'leafletCss' => Water_Data::map_asset( 'map_leaflet_css' ),
							'script'     => esc_url_raw( DCC_WL_URL . 'assets/js/water-map.js?ver=' . DCC_WL_VERSION ),
							'tileUrl'    => Water_Data::map_tile_url(),
							'tileAttrib' => (string) Water_Data::get( 'map_tile_attrib' ),
						]
						: null,
					'i18n'     => [
						'asOf'        => __( 'reading', 'dcc-wildlife' ),
						'mapLoading'  => __( 'Loading the map…', 'dcc-wildlife' ),
						'mapFailed'   => __( 'The map could not be loaded.', 'dcc-wildlife' ),
						'colorBy'     => __( 'Colour by:', 'dcc-wildlife' ),
						'byClarity'   => __( 'Clarity', 'dcc-wildlife' ),
						'byLevel'     => __( 'Level', 'dcc-wildlife' ),
						'byFresh'     => __( 'Data age', 'dcc-wildlife' ),
						'layers'      => __( 'Layers', 'dcc-wildlife' ),
						'lyrRamps'    => __( 'Boat ramps', 'dcc-wildlife' ),
						'lyrWaters'   => __( 'Chain waters', 'dcc-wildlife' ),
						'lyrStations' => __( 'Monitoring stations', 'dcc-wildlife' ),
						'lyrProperty' => __( 'The cottages', 'dcc-wildlife' ),
						'fullscreen'  => __( 'Fullscreen', 'dcc-wildlife' ),
						'closed'      => __( 'CLOSED', 'dcc-wildlife' ),
						'lanes'       => __( 'lanes', 'dcc-wildlife' ),
						'milesAway'   => __( 'mi from the cottages, straight line', 'dcc-wildlife' ),
						'depthMap'    => __( 'Depth map (PDF)', 'dcc-wildlife' ),
						'noReading'   => __( 'no recent reading', 'dcc-wildlife' ),
						'staleLevel'  => __( 'level reading is old', 'dcc-wildlife' ),
						'median'      => __( 'median', 'dcc-wildlife' ),
						'sampled'     => __( 'sampled', 'dcc-wildlife' ),
					],
				]
			) . ';',
			'before'
		);
	}
}
