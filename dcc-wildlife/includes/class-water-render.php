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
		$fishing   = Water_Data::fishing();
		$live      = Water_Data::live_possible() || Water_Data::map_possible();
		$has_static = Water_Data::has_static_content() || null !== $fishing;

		// Nothing sourced, no fishing almanac and no live layer: render nothing
		// at all. An empty section is worse than no section.
		if ( ! $has_static && ! $live ) {
			return '';
		}

		self::enqueue_assets();

		ob_start();
		?>
		<section class="dccwl-water <?php echo esc_attr( Render::app_classes() ); ?>" aria-labelledby="dccwl-water-title" data-dccwl-water-root<?php echo $has_static ? '' : ' hidden'; ?>>
			<h2 class="dccwl-water-title" id="dccwl-water-title"><?php echo esc_html( $title ); ?></h2>
			<div class="dccwl-moon" data-dccwl-moon hidden></div>

			<?php if ( $live ) : ?>
				<?php /* Shell only — filled client-side so page caching cannot serve a stale reading. */ ?>
				<div class="dccwl-water-live" data-dccwl-water-live hidden>
					<h3 class="dccwl-water-sub"><?php esc_html_e( 'Right now', 'dcc-wildlife' ); ?></h3>
					<ul class="dccwl-cards dccwl-water-facts" data-dccwl-water-facts></ul>

					<?php /* Each water against its OWN long-run median — the
					         comparison a visiting angler can act on without any
					         local knowledge. Filled client-side with the rest. */ ?>
					<div class="dccwl-chain" data-dccwl-chain hidden>
						<h3 class="dccwl-water-sub"><?php esc_html_e( 'Across the Harris Chain', 'dcc-wildlife' ); ?></h3>
						<p class="dccwl-chain-note"><?php esc_html_e( 'Clarity now against each water’s own long-run median — clearest relative to its own normal first.', 'dcc-wildlife' ); ?></p>
						<ul class="dccwl-cards dccwl-water-facts" data-dccwl-water-chain></ul>
					</div>
				</div>
			<?php endif; ?>

			<?php if ( null !== $fishing ) : ?>
				<?php self::render_fishing( $fishing ); ?>
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
						<?php /* 1.9.0: opens the shared sliding sheet rather than
						         expanding inline, so the map gets the room it
						         needs and dismisses like every other detail. */ ?>
						<button type="button" class="dccwl-btn dccwl-map-open" data-dccwl-map-open>
							<?php esc_html_e( 'Open the chain map', 'dcc-wildlife' ); ?>
						</button>
					</p>
				</div>
			<?php endif; ?>

			<?php if ( $about ) : ?>
				<?php /* Reference facts about the waterbody rather than today's
				         conditions. Rendered below everything else, and never
				         enough on their own to make this section appear. */ ?>
				<div class="dccwl-water-about">
					<h3 class="dccwl-water-sub"><?php esc_html_e( 'About the water', 'dcc-wildlife' ); ?></h3>
					<?php foreach ( $about as $waterbody => $facts ) : ?>
						<ul class="dccwl-cards dccwl-water-facts">
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
					<ul class="dccwl-cards dccwl-water-facts">
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
						<ul class="dccwl-cards dccwl-water-facts">
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
	 * The fishing almanac (v1.11.0). Static, FWC-sourced angling guidance,
	 * rendered under its own honestly-labelled heading — never as a measured
	 * reading, and never through the Water_Fact gate (it is guidance, not a
	 * gauge value). Season-shaped, so nothing month-specific enters cached HTML.
	 *
	 * @param array<string,mixed> $f
	 */
	private static function render_fishing( array $f ): void {
		$seasons = is_array( $f['seasons'] ?? null ) ? $f['seasons'] : [];
		$regs    = is_array( $f['regs'] ?? null ) ? $f['regs'] : [];
		$fish    = [
			'bass'    => __( 'Bass', 'dcc-wildlife' ),
			'crappie' => __( 'Crappie', 'dcc-wildlife' ),
			'bream'   => __( 'Bream', 'dcc-wildlife' ),
		];
		?>
		<div class="dccwl-fishing" data-dccwl-fishing>
			<h3 class="dccwl-water-sub"><?php esc_html_e( 'Fishing the Harris Chain', 'dcc-wildlife' ); ?></h3>
			<?php if ( ! empty( $f['intro'] ) ) : ?>
				<p class="dccwl-fishing-intro"><?php echo esc_html( (string) $f['intro'] ); ?></p>
			<?php endif; ?>

			<?php if ( $seasons ) : ?>
				<ul class="dccwl-fishing-seasons">
					<?php foreach ( $seasons as $s ) : ?>
						<?php if ( ! is_array( $s ) ) { continue; } ?>
						<li class="dccwl-fishing-season">
							<p class="dccwl-fishing-season-name"><?php echo esc_html( (string) ( $s['name'] ?? '' ) ); ?></p>
							<?php foreach ( $fish as $k => $label ) : ?>
								<?php if ( ! empty( $s[ $k ] ) ) : ?>
									<p class="dccwl-fishing-line"><span class="dccwl-fishing-fish"><?php echo esc_html( $label ); ?></span> <?php echo esc_html( (string) $s[ $k ] ); ?></p>
								<?php endif; ?>
							<?php endforeach; ?>
						</li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>

			<?php if ( ! empty( $f['sportfish'] ) ) : ?>
				<p class="dccwl-fishing-note"><?php echo esc_html( (string) $f['sportfish'] ); ?></p>
			<?php endif; ?>

			<?php if ( ! empty( $f['attractors'] ) ) : ?>
				<p class="dccwl-fishing-note">
					<?php echo esc_html( (string) $f['attractors'] ); ?>
					<?php if ( ! empty( $f['attractors_url'] ) ) : ?>
						<a href="<?php echo esc_url( (string) $f['attractors_url'] ); ?>" rel="noopener nofollow" target="_blank"><?php echo esc_html( (string) ( $f['attractors_label'] ?? $f['attractors_url'] ) ); ?></a>
					<?php endif; ?>
				</p>
			<?php endif; ?>

			<?php if ( $regs ) : ?>
				<div class="dccwl-fishing-regs">
					<h4 class="dccwl-fishing-h"><?php esc_html_e( 'Keep-limits — Florida FWC', 'dcc-wildlife' ); ?></h4>
					<ul class="dccwl-fishing-reglist">
						<?php foreach ( $regs as $r ) : ?>
							<?php if ( is_array( $r ) && isset( $r[0], $r[1] ) ) : ?>
								<li><span class="dccwl-fishing-reg-k"><?php echo esc_html( (string) $r[0] ); ?></span><span class="dccwl-fishing-reg-v"><?php echo esc_html( (string) $r[1] ); ?></span></li>
							<?php endif; ?>
						<?php endforeach; ?>
					</ul>
					<?php if ( ! empty( $f['regs_verified'] ) && false !== strtotime( (string) $f['regs_verified'] ) ) : ?>
						<?php /* Bag and length limits change with the regulation year. The date
						   is a fixed setting, not "now", so it is cache-safe (1.17.0). */ ?>
						<p class="dccwl-fishing-note dccwl-fishing-verified">
							<?php
							printf(
								/* translators: %s: month and year, e.g. "August 2026". */
								esc_html__( 'Limits as verified with FWC in %s — seasons change, so check FWC before you keep a fish.', 'dcc-wildlife' ),
								esc_html( date_i18n( 'F Y', strtotime( (string) $f['regs_verified'] ) ) )
							);
							?>
						</p>
					<?php endif; ?>
					<?php if ( ! empty( $f['license'] ) ) : ?>
						<p class="dccwl-fishing-note dccwl-fishing-license">
							<?php echo esc_html( (string) $f['license'] ); ?>
							<?php if ( ! empty( $f['license_url'] ) ) : ?>
								<a href="<?php echo esc_url( (string) $f['license_url'] ); ?>" rel="noopener nofollow" target="_blank"><?php esc_html_e( 'FWC licences', 'dcc-wildlife' ); ?></a>
							<?php endif; ?>
						</p>
					<?php endif; ?>
				</div>
			<?php endif; ?>

			<?php if ( ! empty( $f['moon'] ) ) : ?>
				<p class="dccwl-fishing-note dccwl-fishing-moon"><?php echo esc_html( (string) $f['moon'] ); ?></p>
			<?php endif; ?>

			<?php
			$fish_links = [];
			foreach ( [ 'forecast', 'regs' ] as $key ) {
				if ( ! empty( $f[ $key . '_url' ] ) ) {
					$fish_links[] = [
						'url'   => (string) $f[ $key . '_url' ],
						'label' => (string) ( $f[ $key . '_label' ] ?? $f[ $key . '_url' ] ),
					];
				}
			}
			?>
			<p class="dccwl-fishing-src">
				<?php if ( ! empty( $f['source'] ) ) : ?>
					<span class="dccwl-fishing-src-note"><?php echo esc_html( (string) $f['source'] ); ?></span>
				<?php endif; ?>
				<?php if ( $fish_links ) : ?>
					<span class="dccwl-fishing-src-links">
						<?php foreach ( $fish_links as $i => $l ) : ?>
							<?php echo $i ? esc_html( ' · ' ) : ''; ?><a href="<?php echo esc_url( $l['url'] ); ?>" rel="noopener nofollow" target="_blank"><?php echo esc_html( $l['label'] ); ?></a>
						<?php endforeach; ?>
					</span>
				<?php endif; ?>
			</p>
		</div>
		<?php
	}

	/**
	 * One fact row. Attribution is not optional decoration — it is rendered
	 * from the same object that guarantees the value was attributable.
	 */
	private static function render_fact( Water_Fact $fact ): void {
		$f   = $fact->to_array();
		$age = self::age_words( $f['date'] );
		?>
		<li class="dccwl-card dccwl-water-fact dccwl-water-tier-<?php echo esc_attr( $f['tier'] ); ?>">
			<div class="dccwl-card-head">
				<span class="dccwl-card-label"><?php echo esc_html( $f['label'] ); ?></span>
				<?php /* Source + age chip (1.9.0): provenance at a glance. It
				         summarises the attribution line below, never replaces
				         it — the full source and measurement date still print. */ ?>
				<span class="dccwl-metachip dccwl-card-src">
					<span class="dccwl-card-srcname"><?php echo esc_html( $f['sourceName'] ); ?></span>
					<?php if ( '' !== $age ) : ?>
						<span class="dccwl-card-dot">·</span>
						<span class="dccwl-card-age"><?php echo esc_html( $age ); ?></span>
					<?php endif; ?>
				</span>
			</div>
			<p class="dccwl-card-value"><?php echo esc_html( $f['value'] ); ?></p>
			<p class="dccwl-water-attr">
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
			</p>
		</li>
		<?php
	}

	/**
	 * A reading's age in chip-sized words. Mirrors the thresholds in
	 * water.js so a server-rendered card and a client-rendered one never
	 * describe the same age differently.
	 *
	 * Returns '' when the date will not parse or lies in the future: the card
	 * then shows its attribution without an age claim rather than guessing.
	 */
	private static function age_words( string $date ): string {
		$date = trim( $date );
		if ( '' === $date ) {
			return '';
		}
		// A year or year-month alone is not a day, so it gets no day-precision
		// age; the printed date already says what is known.
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}/', $date ) ) {
			return '';
		}
		$ts = strtotime( substr( $date, 0, 10 ) . ' 12:00:00' );
		if ( false === $ts ) {
			return '';
		}
		$days = (int) floor( ( time() - $ts ) / DAY_IN_SECONDS );
		if ( $days < 0 ) {
			return '';
		}
		if ( 0 === $days ) {
			return __( 'today', 'dcc-wildlife' );
		}
		if ( $days < 45 ) {
			/* translators: %d: whole days. */
			return sprintf( _x( '%dd', 'compact age: days', 'dcc-wildlife' ), $days );
		}
		if ( $days < 730 ) {
			/* translators: %d: whole months. */
			return sprintf( _x( '%dmo', 'compact age: months', 'dcc-wildlife' ), (int) round( $days / 30 ) );
		}
		/* translators: %d: whole years. */
		return sprintf( _x( '%dy', 'compact age: years', 'dcc-wildlife' ), (int) round( $days / 365 ) );
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
							'satUrl'     => Water_Data::map_sat_url(),
							'satAttrib'  => (string) Water_Data::get( 'map_sat_attrib' ),
							'baseLayer'  => Water_Data::map_default_layer(),
						]
						: null,
					// The sheet is a body-level element, so it needs to be
					// told which app/theme classes to wear (1.9.0).
					'appClasses' => Render::app_classes(),
					'coords'     => Water_Data::coords(),
					'i18n'     => [
						'asOf'        => __( 'reading', 'dcc-wildlife' ),
						'moon' => [
							'label' => __( 'Tonight on the canal', 'dcc-wildlife' ),
							/* translators: 1: sunrise time, 2: sunset time. */
							'light' => __( 'First light %1$s · last light %2$s', 'dcc-wildlife' ),
							'new' => __( 'New moon', 'dcc-wildlife' ),
							'waxingCrescent' => __( 'Waxing crescent', 'dcc-wildlife' ),
							'firstQuarter' => __( 'First quarter', 'dcc-wildlife' ),
							'waxingGibbous' => __( 'Waxing gibbous', 'dcc-wildlife' ),
							'full' => __( 'Full moon', 'dcc-wildlife' ),
							'waningGibbous' => __( 'Waning gibbous', 'dcc-wildlife' ),
							'lastQuarter' => __( 'Last quarter', 'dcc-wildlife' ),
							'waningCrescent' => __( 'Waning crescent', 'dcc-wildlife' ),
							'night' => __( 'night', 'dcc-wildlife' ),
							'nights' => __( 'nights', 'dcc-wildlife' ),
							'lineFull' => __( 'The full moon is up — prime for bedding bream and staging specks, and the gators bellow into the bright night.', 'dcc-wildlife' ),
							/* translators: %s: a duration such as "4 nights". */
							'lineToFull' => __( 'Full moon in %s — the bream will bed and the crappie stage.', 'dcc-wildlife' ),
							/* translators: %s: a duration such as "3 nights". */
							'lineSinceFull' => __( 'The full moon was %s ago — bream bedded on it, and the bite lingers.', 'dcc-wildlife' ),
							'lineDark' => __( 'Dark skies tonight — best for the stars over the cypress, and the gators are boldest after moonset.', 'dcc-wildlife' ),
							/* translators: 1: phase name (lowercase), 2: illumination percent. */
							'lineGeneric' => __( 'A %1$s tonight, %2$d% lit.', 'dcc-wildlife' ),
						],
						'mapTitle'    => __( 'Chain map', 'dcc-wildlife' ),
						'mapClose'    => __( 'Close the map', 'dcc-wildlife' ),
						'ageToday'    => __( 'today', 'dcc-wildlife' ),
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
						'baseMap'     => __( 'Base map', 'dcc-wildlife' ),
						'satellite'   => __( 'Satellite', 'dcc-wildlife' ),
						'streets'     => __( 'Streets', 'dcc-wildlife' ),
						'noImagery'   => __( 'Map imagery is unavailable right now — the markers below are still accurate.', 'dcc-wildlife' ),
						'closed'      => __( 'CLOSED', 'dcc-wildlife' ),
						'milesAway'   => __( 'mi from the cottages, straight line', 'dcc-wildlife' ),
						'depthMap'    => __( 'Depth map (PDF)', 'dcc-wildlife' ),
						'noReading'   => __( 'no recent reading', 'dcc-wildlife' ),
						'staleLevel'  => __( 'level reading is old', 'dcc-wildlife' ),
						'median'      => __( 'median', 'dcc-wildlife' ),
						'sampled'     => __( 'sampled', 'dcc-wildlife' ),

						// Popup field labels (1.8.0, finding 2 — previously
						// hardcoded English inside water-map.js).
						'lblClarity'  => __( 'Clarity:', 'dcc-wildlife' ),
						'lblLevel'    => __( 'Level:', 'dcc-wildlife' ),
						'lblWater'    => __( 'Water:', 'dcc-wildlife' ),
						'lblCity'     => __( 'City:', 'dcc-wildlife' ),
						'lblLanes'    => __( 'Lanes:', 'dcc-wildlife' ),
						'lblFee'      => __( 'Fee:', 'dcc-wildlife' ),
						'lblRestrooms'=> __( 'Restrooms:', 'dcc-wildlife' ),
						'lblStatus'   => __( 'Status:', 'dcc-wildlife' ),
						'lblDistance' => __( 'Distance:', 'dcc-wildlife' ),
						'station'     => __( 'Station', 'dcc-wildlife' ),
						'rampName'    => __( 'Boat ramp', 'dcc-wildlife' ),
						'fwcSource'   => __( 'Source: FWC boat ramp inventory', 'dcc-wildlife' ),
						/* translators: %s: whole inches. */
						'levelAbove'  => __( '%s in above its monthly norm', 'dcc-wildlife' ),
						/* translators: %s: whole inches. */
						'levelBelow'  => __( '%s in below its monthly norm', 'dcc-wildlife' ),
						/* translators: compact age units shown on the map, e.g. "12d", "3mo", "2y". */
						'ageDays'     => _x( 'd', 'compact age unit: days', 'dcc-wildlife' ),
						'ageMonths'   => _x( 'mo', 'compact age unit: months', 'dcc-wildlife' ),
						'ageYears'    => _x( 'y', 'compact age unit: years', 'dcc-wildlife' ),

						// Colour-by legend (1.8.0, finding 3).
						'legClearer'  => __( 'Clearer than its own median', 'dcc-wildlife' ),
						'legUsual'    => __( 'Near its median', 'dcc-wildlife' ),
						'legMurkier'  => __( 'Murkier than its median', 'dcc-wildlife' ),
						'legAbove'    => __( 'Above its monthly norm', 'dcc-wildlife' ),
						'legNear'     => __( 'Near its norm', 'dcc-wildlife' ),
						'legBelow'    => __( 'Below its norm', 'dcc-wildlife' ),
						'legFresh'    => __( 'Reading under 45 days old', 'dcc-wildlife' ),
						'legMonths'   => __( 'Months old', 'dcc-wildlife' ),
						'legYears'    => __( 'Years old', 'dcc-wildlife' ),
						'legStale'    => __( 'No current reading', 'dcc-wildlife' ),
					],
				]
			) . ';',
			'before'
		);
	}
}
