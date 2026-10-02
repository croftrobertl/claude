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
		$opts = wp_parse_args(
			$opts,
			[
				'title'      => '',
				/*
				 * Per-placement overrides (1.32.0).
				 *
				 * `moon` is a full three-way: the moon card is client-side
				 * astronomy with no network cost, so a placement may switch it
				 * either way against the site-wide setting.
				 *
				 * `fishing` and `map_button` are HIDE-ONLY. Both are gated by
				 * CAPABILITY — whether the almanac has sourced rows, whether
				 * the map is configured — so a placement that could force them
				 * on would be promising a section the site may have nothing to
				 * fill. 'off' hides; anything else leaves the existing gate to
				 * decide.
				 */
				'moon'       => null,
				'fishing'    => null,
				'map_button' => null,
				/*
				 * 1.34.0 — WHO PRINTS THE "About" FOLD.
				 *
				 * Item 4 moved the almanac, the reference facts and the
				 * official links out of a tab and into the hub's bottom row,
				 * which `Render` owns. A STANDALONE water placement has no
				 * such row, and losing its almanac to a tab that no longer
				 * exists would be a silent deletion — so it prints the fold
				 * itself, at the foot of its own section.
				 *
				 * The hub passes false, because its footnote row prints it.
				 * An explicit flag rather than a first-caller-wins guard: the
				 * two surfaces render in whatever order the page composes
				 * them, and "whoever got there first" would decide where
				 * About appears from one page to the next.
				 */
				'about_fold' => true,
			]
		);
		$title = sanitize_text_field( (string) $opts['title'] );
		if ( '' === $title ) {
			$title = __( 'Fishing & Water Conditions', 'dcc-wildlife' );
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

		/*
		 * THE THREE TABS (1.33.0, owner's decision).
		 *
		 * Now / Fishing / About, as a segmented control at the top. The panel
		 * was one long scroll in which today's readings, next season's bag
		 * limits and the lake's surface area all had equal billing.
		 *
		 * WHICH BLOCK GOES WHERE. Most are plain: the moon and the live
		 * readings are Now; the seasons, the keep-limits and the local
		 * charters are Fishing; the almanac and the reference facts are
		 * About. Two were NOT plain and are flagged to the owner rather than
		 * decided quietly — the chain map (boat ramps say Fishing, the
		 * stations the readings come from say Now) and the official links
		 * (FWC licences say Fishing, the gauges and the Water Atlas say
		 * About). They sit where the note above each one says, and moving
		 * either is a one-line change.
		 *
		 * Each tab is rendered ONLY if it has something in it, and the whole
		 * control is rendered HIDDEN: with no JavaScript every block is
		 * visible in one scroll, exactly as before, rather than two thirds of
		 * the panel being unreachable behind dead buttons.
		 */
		/*
		 * ITEMS 1 AND 3 (1.34.0, his pick B) — THE MAP IS THE FIRST TAB.
		 *
		 * It was a button at the foot of Fishing and Rob called it "an
		 * incredibly cool feature" that was buried. Map now leads the bar, so
		 * it is the panel a guest meets, and the tab order below is what makes
		 * that true: water.js selects the FIRST button it finds.
		 *
		 * The 1.31.0 rule is untouched — no Leaflet, no tiles and no map data
		 * load until a guest opens the map. The tab therefore shows the map's
		 * front door (a summary line, three stat tiles and the open button),
		 * not a canvas. ITEM 4: "About" is no longer a tab at all; its content
		 * opens from the hub's bottom row through about_fold().
		 */
		$tabs = [
			'map'     => Guide_Data::resolve_hide( $opts['map_button'], Water_Data::map_possible() ),
			'now'     => Guide_Data::resolve( $opts['moon'], 'show_moon' ) || $live,
			'fishing' => ( null !== $fishing && Guide_Data::resolve_hide( $opts['fishing'], true ) )
				|| (bool) $reports,
		];
		$tab_labels = [
			'map'     => __( 'Map', 'dcc-wildlife' ),
			'now'     => __( 'Now', 'dcc-wildlife' ),
			'fishing' => __( 'Fishing', 'dcc-wildlife' ),
		];

		ob_start();
		?>
		<section class="dccwl-water <?php echo esc_attr( Render::app_classes() ); ?>" aria-labelledby="dccwl-water-title" data-dccwl-water-root<?php echo $has_static ? '' : ' hidden'; ?>>
			<h2 class="dccwl-water-title" id="dccwl-water-title"><?php echo esc_html( $title ); ?></h2>

			<?php if ( count( array_filter( $tabs ) ) > 1 ) : ?>
				<div class="dccwl-tabs dccwl-water-tabs" role="group" aria-label="<?php esc_attr_e( 'What to show', 'dcc-wildlife' ); ?>" data-dccwl-water-tabs hidden>
					<?php $first_tab = true; ?>
					<?php foreach ( $tabs as $slug => $on ) : ?>
						<?php if ( ! $on ) { continue; } ?>
						<button type="button" class="dccwl-tab" data-dccwl-water-tab-btn="<?php echo esc_attr( $slug ); ?>" aria-pressed="<?php echo $first_tab ? 'true' : 'false'; ?>">
							<?php echo esc_html( $tab_labels[ $slug ] ); ?>
						</button>
						<?php $first_tab = false; ?>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>

			<div class="dccwl-water-tab" data-dccwl-water-tab="now">
			<?php if ( Guide_Data::resolve( $opts['moon'], 'show_moon' ) ) : ?>
			<div class="dccwl-moon" data-dccwl-moon hidden></div>
			<?php endif; ?>

			<?php if ( $live ) : ?>
				<?php /* Shell only — filled client-side so page caching cannot serve a stale reading. */ ?>
				<div class="dccwl-water-live" data-dccwl-water-live hidden>
					<?php
					/*
					 * ITEM 3 (pick B) — the card list folds behind "All
					 * readings". A native <details>, like the field guide and
					 * the credits: it needs no JavaScript, and the tier key
					 * above the cards sits INSIDE the fold, because a key
					 * belongs beside the colour it decodes.
					 */
					?>
					<details class="dccwl-fullguide dccwl-water-allreadings">
					<summary class="dccwl-fullguide-summary">
						<span class="dccwl-fullguide-h"><?php esc_html_e( 'All readings', 'dcc-wildlife' ); ?></span>
					</summary>
					<div class="dccwl-fullguide-body">
					<?php /* ITEM 8 (pick B) — the tier colour is now a full border on
					         all four sides, and this one line is what makes the colour
					         mean anything. Without it the border is decoration. */ ?>
					<p class="dccwl-water-tierkey"><?php esc_html_e( 'Green = measured today · Blue = latest published sample · Amber = general guidance', 'dcc-wildlife' ); ?></p>
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
					</details>
				</div>
			<?php endif; ?>
			</div><?php /* /now */ ?>

			<div class="dccwl-water-tab" data-dccwl-water-tab="fishing">
			<?php if ( null !== $fishing && Guide_Data::resolve_hide( $opts['fishing'], true ) ) : ?>
				<?php self::render_fishing( $fishing ); ?>
			<?php endif; ?>

			<?php
			/*
			 * THE CHAIN MAP IS IN FISHING, AND IT IS ONE OF THE TWO THE OWNER
			 * WAS ASKED ABOUT. It shows boat ramps, the waters of the chain
			 * and the stations the readings come from. The ramps are the
			 * reason a guest opens it, and a ramp is a fishing plan — so it
			 * sits beside the seasons and the limits rather than under
			 * today's readings. The provenance argument for Now is now
			 * weaker anyway: since this release every reading's own source
			 * folds out of its own chip.
			 */
			?>
			<?php self::render_links( __( 'Local reports & charters', 'dcc-wildlife' ), $reports, 'dccwl-water-reports' ); ?>

			<?php if ( $links || $reports ) : ?>
				<p class="dccwl-water-disclaimer">
					<?php esc_html_e( 'Licences, seasons and limits change — check the FWC before you fish.', 'dcc-wildlife' ); ?>
				</p>
			<?php endif; ?>
			</div><?php /* /fishing */ ?>

			<div class="dccwl-water-tab" data-dccwl-water-tab="map">
			<?php if ( Guide_Data::resolve_hide( $opts['map_button'], Water_Data::map_possible() ) ) : ?>
				<?php /* Still nothing external until a guest opens the map. */ ?>
				<div class="dccwl-map-wrap" data-dccwl-map-wrap>
					<?php
					/*
					 * THE STAT TILES DOUBLE AS "COLOUR BY" (item 3, pick B).
					 *
					 * Shell only, hidden, filled by water.js from the SAME
					 * /conditions facts the Now tab renders — a number here is
					 * never one this codebase chose, and never baked into
					 * cached HTML. Each tile is a button: Level and Clarity
					 * open the map already coloured by that reading, which are
					 * the two colourings the map has. Wind has none, so it
					 * opens the map as the button does rather than inventing a
					 * colouring the data cannot support.
					 */
					?>
					<ul class="dccwl-water-stats" data-dccwl-water-stats hidden>
						<?php
						$stats = [
							'level'   => [ __( 'Level', 'dcc-wildlife' ), 'level' ],
							'clarity' => [ __( 'Clarity', 'dcc-wildlife' ), 'clarity' ],
							'wind'    => [ __( 'Wind', 'dcc-wildlife' ), '' ],
						];
						?>
						<?php foreach ( $stats as $skey => $stat ) : ?>
							<li class="dccwl-water-stat" data-dccwl-stat="<?php echo esc_attr( $skey ); ?>" hidden>
								<button type="button" class="dccwl-water-stat-btn" data-dccwl-stat-colour="<?php echo esc_attr( $stat[1] ); ?>">
									<span class="dccwl-water-stat-label"><?php echo esc_html( $stat[0] ); ?></span>
									<span class="dccwl-water-stat-value" data-dccwl-stat-value></span>
									<span class="dccwl-water-stat-sub" data-dccwl-stat-sub></span>
								</button>
							</li>
						<?php endforeach; ?>
					</ul>
					<p class="dccwl-map-intro"><?php esc_html_e( 'Boat ramps, the waters of the chain and the stations these readings come from. The map loads only when you open it.', 'dcc-wildlife' ); ?></p>
					<p>
						<button type="button" class="dccwl-btn dccwl-map-open" data-dccwl-map-open>
							<?php esc_html_e( 'Open the chain map', 'dcc-wildlife' ); ?>
						</button>
					</p>
				</div>
			<?php endif; ?>
			</div><?php /* /map */ ?>

			<?php if ( false !== $opts['about_fold'] ) : ?>
				<?php /* A standalone placement keeps its almanac; see about_fold above. */ ?>
				<?php self::about_fold(); ?>
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
	/**
	 * ITEM 4 (1.34.0) — the old About TAB, as a fold for the hub's bottom row.
	 *
	 * Rob asked for it beside Field Guide / Credits / By Month and to look and
	 * behave exactly like those, so it is the same <details class="dccwl-fullguide">
	 * the other two folds use rather than a new component. Render::footnotes()
	 * calls it; it prints nothing when there is nothing to show, which is what
	 * keeps the standalone month widget unchanged.
	 */
	private static bool $about_printed = false;

	public static function about_fold(): void {
		/* Once per page, first caller wins — the same guard shape the
		 * countdown shell and the prose guide use. A page can carry a hub, a
		 * standalone month widget and a standalone water widget at once, and
		 * each of them offers this fold; two copies of the almanac would be a
		 * duplicate, not a convenience. */
		if ( self::$about_printed ) {
			return;
		}
		$almanac = Water_Data::almanac( 'conditions' );
		$about   = Water_Data::almanac( 'about' );
		$links   = Water_Data::link_list( 'links' );
		if ( ! $almanac && ! $about && ! $links ) {
			return;
		}
		self::$about_printed = true;
		?>
		<details class="dccwl-fullguide dccwl-water-aboutfold">
			<?php
			/*
			 * STRUCTURALLY IDENTICAL TO Field Guide AND Credits, not merely
			 * styled to match. Rob asked for it to look and behave exactly
			 * like those three, and the first draft had only the label: no
			 * turning chevron, and a bare <span> whose line box sat 1.5px off
			 * the others' — which is the very misalignment item 17 was raised
			 * about, reintroduced by the fix for it. The chevron and the text
			 * wrapper are what make the row one row.
			 *
			 * Short label in the row, the full phrasing as the accessible
			 * name — the 1.28.0 rule, because the row must still fit one line
			 * on a phone with a fourth link in it.
			 */
			?>
			<summary class="dccwl-fullguide-summary" aria-label="<?php esc_attr_e( 'About the water and where these readings come from', 'dcc-wildlife' ); ?>">
				<span class="dccwl-fullguide-chev" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
				<span class="dccwl-fullguide-text">
					<span class="dccwl-fullguide-h"><?php esc_html_e( 'About', 'dcc-wildlife' ); ?></span>
					<span class="dccwl-fullguide-meta"><?php esc_html_e( 'the water, and where these readings come from', 'dcc-wildlife' ); ?></span>
				</span>
			</summary>
			<div class="dccwl-fullguide-body">
				<?php self::render_almanac( $almanac ); ?>
				<?php if ( $about ) : ?>
					<?php /* Reference facts about the waterbody rather than today's
					         conditions, and never enough on their own to make this
					         fold appear. */ ?>
					<div class="dccwl-water-about">
						<h3 class="dccwl-water-sub"><?php esc_html_e( 'About the water', 'dcc-wildlife' ); ?></h3>
						<?php foreach ( $about as $facts ) : ?>
							<ul class="dccwl-cards dccwl-water-facts">
								<?php foreach ( $facts as $fact ) : ?>
									<?php self::render_fact( $fact ); ?>
								<?php endforeach; ?>
							</ul>
						<?php endforeach; ?>
					</div>
				<?php endif; ?>
				<?php
				/*
				 * The official links live here: five of the six are where the
				 * readings come from, which is reference, not a plan. The sixth
				 * (FWC licences) is duplicated beside the keep-limits in
				 * Fishing, so nothing is lost by it being here.
				 */
				?>
				<?php self::render_links( __( 'Official information', 'dcc-wildlife' ), $links, 'dccwl-water-links' ); ?>
			</div>
		</details>
		<?php
	}

	/**
	 * Which calendar months a season row covers, read out of its OWN label.
	 *
	 * The seasons are owner-editable rows with no month field, so the months
	 * are DERIVED from the label a person typed ("Fall · Sep–Nov") by looking
	 * for this locale's month names — never from the row's position, which
	 * would silently mislabel every season the moment somebody reorders them
	 * or keeps five. Two names found means an inclusive range that may wrap
	 * the year end; one means that month alone; anything else yields nothing,
	 * and water.js then simply opens the first season rather than guessing.
	 *
	 * @return int[] 1-12, in no particular order.
	 */
	private static function season_months( string $label ): array {
		if ( '' === $label ) {
			return [];
		}
		$hay   = function_exists( 'mb_strtolower' ) ? mb_strtolower( $label ) : strtolower( $label );
		$found = [];
		for ( $m = 1; $m <= 12; $m++ ) {
			$ts = mktime( 0, 0, 0, $m, 1, 2026 );
			foreach ( [ date_i18n( 'M', $ts ), date_i18n( 'F', $ts ) ] as $name ) {
				$name = function_exists( 'mb_strtolower' ) ? mb_strtolower( $name ) : strtolower( $name );
				if ( '' !== $name && false !== strpos( $hay, $name ) ) {
					$found[ $m ] = (int) strpos( $hay, $name );
					break;
				}
			}
		}
		if ( 1 === count( $found ) ) {
			return array_keys( $found );
		}
		if ( 2 !== count( $found ) ) {
			return [];
		}
		asort( $found );            // the one written first is the start.
		$ends = array_keys( $found );
		$out  = [];
		for ( $m = $ends[0], $guard = 0; $guard < 12; $guard++ ) {
			$out[] = $m;
			if ( $m === $ends[1] ) {
				break;
			}
			$m = 12 === $m ? 1 : $m + 1;
		}
		return $out;
	}

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
				<?php
				/*
				 * ITEM 10 (1.34.0, Rob's pick A) — a season picker, then one
				 * labelled block per species, instead of one long run of text
				 * in which the seasons and the three species all looked alike.
				 *
				 * The picker is rendered HIDDEN and every season is visible, as
				 * the water tab bar is: with no JavaScript a guest still reads
				 * the whole year in one scroll rather than meeting four dead
				 * buttons. water.js unhides it and opens the CURRENT season —
				 * which it works out in canal time, never server-side, because
				 * the page is cached.
				 */
				?>
				<div class="dccwl-tabs dccwl-fish-seasons" role="group" aria-label="<?php esc_attr_e( 'Season', 'dcc-wildlife' ); ?>" data-dccwl-fish-seasons hidden>
					<?php foreach ( $seasons as $i => $s ) : ?>
						<?php if ( ! is_array( $s ) ) { continue; } ?>
						<button type="button" class="dccwl-tab" data-dccwl-fish-season-btn="<?php echo (int) $i; ?>" aria-pressed="<?php echo 0 === $i ? 'true' : 'false'; ?>">
							<?php echo esc_html( (string) ( $s['short'] ?? strtok( (string) ( $s['name'] ?? '' ), ' ·' ) ) ); ?>
						</button>
					<?php endforeach; ?>
				</div>
				<ul class="dccwl-fishing-seasons">
					<?php foreach ( $seasons as $i => $s ) : ?>
						<?php if ( ! is_array( $s ) ) { continue; } ?>
						<li class="dccwl-fishing-season dccwl-fish-season" data-dccwl-fish-season="<?php echo (int) $i; ?>" data-dccwl-fish-months="<?php echo esc_attr( implode( ',', self::season_months( (string) ( $s['name'] ?? '' ) ) ) ); ?>">
							<p class="dccwl-fishing-season-name"><?php echo esc_html( (string) ( $s['name'] ?? '' ) ); ?></p>
							<?php foreach ( $fish as $k => $label ) : ?>
								<?php if ( ! empty( $s[ $k ] ) ) : ?>
									<div class="dccwl-fish-species">
										<h4><?php echo esc_html( $label ); ?></h4>
										<p class="dccwl-fishing-line"><?php echo esc_html( (string) $s[ $k ] ); ?></p>
									</div>
								<?php endif; ?>
							<?php endforeach; ?>
						</li>
					<?php endforeach; ?>
				</ul>
				<hr class="dccwl-fish-rule">
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
				<?php /* ITEM 10 (pick A) — a ruled break, so the licences block reads
				         as its own thing and not as more fishing advice. */ ?>
				<hr class="dccwl-fish-rule">
				<div class="dccwl-fishing-regs">
					<h4 class="dccwl-fishing-h"><?php esc_html_e( 'Licences &amp; keep-limits — Florida FWC', 'dcc-wildlife' ); ?></h4>
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
						// The tile deck (1.23.0), shared with the species side.
						'deckPrev'    => __( 'Previous readings', 'dcc-wildlife' ),
						'deckNext'    => __( 'Next readings', 'dcc-wildlife' ),
						/* translators: 1: first item shown, 2: last item shown, 3: total. */
						'deckPos'     => __( '%1$s–%2$s of %3$s', 'dcc-wildlife' ),
						/* translators: %s: the chip's own words, e.g. "USGS · 3d". */
						/* The chip already reads "USGS · 3d" on screen; this is
						   what a screen reader hears instead, because the
						   visible words do not say what pressing it does. */
						'srcToggle'   => __( 'Source: %s — show where this reading came from', 'dcc-wildlife' ),
						/* translators: the three tabs at the top of the water panel. */
						'tabNow'      => __( 'Now', 'dcc-wildlife' ),
						'tabFishing'  => __( 'Fishing', 'dcc-wildlife' ),
						'tabAbout'    => __( 'About', 'dcc-wildlife' ),
						'tabsLabel'   => __( 'What to show', 'dcc-wildlife' ),
						'moon' => [
							'label' => __( 'Tonight on the Canal', 'dcc-wildlife' ),
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
						/* The wind badge (1.35.0). The compass sector and the
						 * speed are the forecast's own words and are never
						 * translated here; only the dial's N and the
						 * screen-reader sentence around them are ours. */
						'windNorth'   => _x( 'N', 'compass north on the wind dial', 'dcc-wildlife' ),
						/* translators: 1: compass direction the wind comes from, e.g. "NE". 2: wind speed as the forecast words it, e.g. "5 to 10 mph". 3: the full source name. */
						'windAria'    => __( 'Wind %1$s at %2$s — %3$s', 'dcc-wildlife' ),
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
						/* translators: %s: station identifier. */
						'stationTitle' => __( 'Station %s', 'dcc-wildlife' ),
						'stationPage'  => __( 'Station page', 'dcc-wildlife' ),
						'stationNone'  => __( 'No current reading from this station.', 'dcc-wildlife' ),
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
