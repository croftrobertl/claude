<?php
/**
 * The Canal hub (v1.10.0) — one app, four levels.
 *
 * Restructures the two flat widgets into hub → section → detail, in the
 * Guest Guide's tile/stage idiom:
 *
 *   L1 hub      countdown hero + two tiles (Wildlife, Water)
 *   L2a month   a 12-month picker, current month pre-highlighted
 *   L3a species the EXISTING month widget (headline, spotlight, timeline,
 *               tabs + full guide grids, credit)
 *   L4a detail  the existing species sheet (assets/js/sheet.js)
 *   L2b water   the EXISTING water module, every section in today's order;
 *               the chain map still opens as a sheet
 *
 * COMPOSITION, NOT A FORK. The species and water panels call
 * Render::render() and Water_Render::render() unchanged, so content parity
 * is structural rather than something to keep re-checking, and the legacy
 * widgets keep working when placed on their own.
 *
 * CACHE DOCTRINE, UNCHANGED. Nothing month-dependent or time-sensitive is
 * server-rendered — not even the hub previews or the month tiles' labels.
 * The month grid ships as an empty shell and assets/js/canal.js fills it,
 * exactly as the spotlight has worked since 1.0.0.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Canal_Render {

	private static bool $config_added = false;

	/**
	 * [dcc_canal title=""]
	 *
	 * @param array|string $atts
	 */
	public static function shortcode( $atts ): string {
		$atts = shortcode_atts(
			[ 'title' => '' ],
			array_change_key_case( (array) $atts, CASE_LOWER ),
			'dcc_canal'
		);
		return self::render( [ 'title' => $atts['title'] ] );
	}

	/**
	 * @param array<string,mixed> $opts
	 */
	/**
	 * Only the hub values THIS placement overrode.
	 *
	 * They ride the root element rather than the shared DCC_WL_CANAL config,
	 * for the same reason the month widget's do: the config is emitted once per
	 * page, so anything in it cannot differ between two placements. An
	 * untouched widget produces `{}` and the script falls back to the
	 * site-wide value, which is what "an untouched control writes nothing"
	 * means once it reaches the browser.
	 *
	 * @param array<string,mixed> $opts
	 * @return array<string,int>
	 */
	private static function per_root( array $opts ): array {
		/* One key left: the other three went with the hub in 1.44.0. The map
		 * stays a map rather than collapsing into a single lookup, because
		 * the next per-placement number goes in here. */
		$map = [
			'sticky_offset' => 'stickyOffset',
		];
		$out = [];
		foreach ( $map as $key => $js ) {
			$raw = $opts[ $key ] ?? null;
			if ( null === $raw || '' === $raw || ! is_numeric( $raw ) ) {
				continue;
			}
			$out[ $js ] = Guide_Data::resolve_num( $raw, $key );
		}
		return $out;
	}

	public static function render( array $opts = [] ): string {
		$opts = wp_parse_args(
			$opts,
			[
				'title'           => '',
				// Per-placement overrides; null means this placement said
				// nothing and the site-wide setting stands.
				'sticky_offset'   => null,
				'search'          => null,
				'subnav'          => null,
				'deck_rows'       => null,
			]
		);
		$title = sanitize_text_field( (string) $opts['title'] );

		// The water module decides for itself whether it has anything to
		// say (its 1.5.0 auto-hide). An empty string means "nothing at all
		// today" — so the hub simply does not offer a Water tile.
		/* false: the hub's footnote row prints the About fold (item 4,
		 * 1.34.0), so the water panel must not print a second copy. */
		$water_html = Water_Render::render( [ 'about_fold' => false ] );
		$has_water  = '' !== $water_html;

		// The month widget, minus its hero: the countdown belongs to the hub
		// now, so it is visible with zero taps.
		//
		// guide_prose => false: the field guide's prose lives inside this
		// panel, which is display:none until a visitor taps three levels in —
		// where a crawler discounts it. The hub prints the prose itself, in
		// normal flow, at the foot of the module (see below). Same move the
		// countdown already makes.
		$species_html = Render::render(
			[
				'countdown'    => false,
				'show_guide'   => true,
				'show_browser' => true,
				'guide_prose'  => false,
				// 1.18.0: no spotlight strip on the month screen. It duplicated
				// the grid below it and was the biggest single reason the screen
				// read as "too much at once". The grid is month-filtered instead
				// (canal.js + annotateGuide), so one grid does the job.
				'spotlight'    => false,

				/*
				 * The hub's guide gates, passed through rather than re-decided.
				 * Composition, not a fork: Render still owns what these mean
				 * and what they default to, and the hub only relays what its
				 * own placement overrode. `null` relays nothing.
				 */
				'search'        => Guide_Data::resolve( $opts['search'], 'show_search' ),
				'subnav'        => $opts['subnav'],
				'rows_override' => $opts['deck_rows'],
			]
		);

		self::enqueue_assets();

		ob_start();
		?>
		<div class="dccwl-canal <?php echo esc_attr( Render::app_classes() ); ?>" data-dccwl-canal="<?php
			// Cast to object so an empty result encodes as {} rather than [] —
			// the script reads named keys off it, and a JSON array would be a
			// lie about the shape even though JSON.parse tolerates it.
			echo esc_attr( (string) wp_json_encode( (object) self::per_root( $opts ) ) );
		?>">

			<?php
			/* ==============================================================
			 * ONE DROPDOWN, TWO SIBLING VIEWS (1.44.0, Rob's pick).
			 *
			 * THE HUB IS GONE. From 1.10.0 this was four stacked LEVELS —
			 * hub, month, species, water — with a Back bar on each and a
			 * history entry per drill-down. Rob's instruction is that
			 * /explore/ opens straight into Water, that the two big hub
			 * tiles go, and that one Cottage-Selector-style dropdown both
			 * titles the section and switches between Water and Wildlife in
			 * a single tap.
			 *
			 * So they are SIBLINGS now, not levels, and that has a
			 * consequence worth stating plainly: switching views pushes no
			 * history entry, exactly as a tab does not. Back leaves
			 * /explore/ rather than walking up a level, because there is no
			 * level to walk up to. The sheet's own history contract
			 * (sheet.js pushes on open, pops on close) is untouched — it was
			 * never part of the level machinery.
			 *
			 * THE MONTH PANEL WENT WITH THE HUB. Its twelve tiles are
			 * replaced by the Month menu in the Wildlife control row, so the
			 * picker is a menu on the screen it belongs to rather than a
			 * destination two taps away.
			 * ============================================================== */
			?>
			<div class="dccwl-viewbar">
				<?php self::view_select( $has_water ); ?>
			</div>

			<div class="dccwl-stage" data-dccwl-stage>

				<?php if ( $has_water ) : ?>
					<?php /* THE DEFAULT VIEW. It is first in the DOM and it is the
					         one not hidden, so nothing has to name a default — the
					         same mechanism the water tab bar uses for Map. */ ?>
					<section class="dccwl-panel dccwl-panel-water" data-dccwl-panel="water" tabindex="-1">
						<?php echo $water_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Water_Render::render() escapes its own output. ?>
					</section>
				<?php endif; ?>

				<section class="dccwl-panel dccwl-panel-species" data-dccwl-panel="species" tabindex="-1"<?php echo $has_water ? ' hidden' : ''; ?>>
					<?php echo $species_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Render::render() escapes its own output. ?>
				</section>

			</div>

			<?php
			/* The whole field guide, in words (1.16.0), at the hub's own top
			   level — NOT inside the display:none species panel above, where a
			   crawler and a screen reader would both meet it hidden. Collapsed
			   it is a single line, so the render budget is unchanged; open, it
			   is the entire guide as real prose, no JavaScript required. Prints
			   once per page via Render's own guard. */
			echo Render::guide_prose_for_canal(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Render escapes its own output.
			?>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * THE VIEW DROPDOWN (1.44.0) — "Water ▾" / "Wildlife ▾".
	 *
	 * It is the section's TITLE and its switch at once, which is what Rob
	 * asked for: the light-blue "‹ Back / Water" bar and the separate
	 * "Fishing & Water Conditions" heading are both gone, and this says
	 * where you are and takes you to the other place in one tap.
	 *
	 * MODELLED ON THE COTTAGE SELECTOR'S MODE DROPDOWN, deliberately — the
	 * Director's instruction was to match what Rob already sees on the
	 * site rather than invent a third pattern. The values are the ones he
	 * re-measured on live with nothing focused, which differ from that
	 * plugin's source defaults because a site-level setting overrides them
	 * there; ours are BAKED IN so they cannot depend on another plugin's
	 * widget settings. They live in canal.css beside this.
	 *
	 * A REAL MENU BUTTON, not a <select> and not a div: `aria-haspopup`,
	 * `aria-expanded`, arrow/Home/End keys, Escape, an outside tap, and
	 * focus returning to the trigger. Each row is a 44px target. The whole
	 * thing is rendered OPEN-able without JavaScript in the sense that
	 * matters — with no script the list stays closed and both views are
	 * still present in the page, which is the no-JS fallback this app has
	 * always had.
	 *
	 * @param bool $has_water False when the water module emits nothing; the
	 *                        dropdown then has one destination and renders
	 *                        as a plain heading instead of a dead control
	 *                        (the 1.31.0 rule: a control that cannot work is
	 *                        not offered).
	 */
	private static function view_select( bool $has_water ): void {
		$views = [];
		if ( $has_water ) {
			$views['water'] = __( 'Water', 'dcc-wildlife' );
		}
		$views['wildlife'] = __( 'Wildlife', 'dcc-wildlife' );

		$first       = (string) array_key_first( $views );
		$first_label = (string) $views[ $first ];

		if ( count( $views ) < 2 ) {
			printf(
				'<h2 class="dccwl-viewselect-solo">%s</h2>',
				esc_html( $first_label )
			);
			return;
		}
		?>
		<div class="dccwl-viewselect" data-dccwl-viewselect>
			<button type="button" class="dccwl-viewselect-trigger" data-dccwl-viewtrigger
				aria-haspopup="true" aria-expanded="false">
				<span class="dccwl-viewselect-label" data-dccwl-viewlabel><?php echo esc_html( $first_label ); ?></span>
				<span class="dccwl-caret" aria-hidden="true">&#9662;</span>
			</button>
			<ul class="dccwl-viewselect-list" data-dccwl-viewlist role="menu" hidden>
				<?php foreach ( $views as $slug => $label ) : ?>
					<li role="none">
						<button type="button" class="dccwl-viewselect-item" role="menuitem"
							data-dccwl-view="<?php echo esc_attr( $slug ); ?>"><?php echo esc_html( $label ); ?></button>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
		<?php
	}


	/** The right-edge chevron that marks a hub tile as a door, not a card. */
	private static function door_chevron(): void {
		?>
		<span class="dccwl-hub-go" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
		<?php
	}

	private static function enqueue_assets(): void {
		wp_enqueue_style( 'dcc-wildlife-canal' );
		wp_enqueue_script( 'dcc-wildlife-canal' );

		if ( self::$config_added ) {
			return;
		}
		self::$config_added = true;

		wp_add_inline_script(
			'dcc-wildlife-canal',
			'window.DCC_WL_CANAL = ' . wp_json_encode(
				[
					/*
					 * ONE TUNABLE LEFT (1.44.0). The hub's three preview caps
					 * went with the hub. `stickyOffset` belongs here and not
					 * in the guide's config: canal.js is its only reader.
					 */
					'set'  => [
						'stickyOffset' => Guide_Data::num( 'sticky_offset' ),
					],
					/*
					 * AND THE STRING TABLE IS EMPTY NOW. Kept as a key rather
					 * than dropped: canal.js reads `CFG.i18n || {}`, and the
					 * next string this file needs goes here.
					 */
					'i18n' => [
						/*
						 * THE AGE WORDS ARE GONE (1.44.0), AND THE NOTE THAT
						 * KEPT THEM IN THIS RELEASE'S FIRST INCREMENT WAS
						 * WRONG — corrected after the suite failed on it.
						 *
						 * They were added to the HUB's table in 1.33.0 for a
						 * good reason: canal.js formatted a reading's age for
						 * the Water preview tile, those words lived ONLY in
						 * the water module's config, and on a page where the
						 * water section was off or auto-hidden canal.js fell
						 * through to hardcoded 'today' / 'd' / 'mo' / 'y' —
						 * strings LocoTranslate never sees and therefore
						 * cannot translate at all.
						 *
						 * Rob removed the hub, so `ageWords()` went with the
						 * preview it served and canal.js formats nothing. An
						 * earlier comment here claimed the age words stay
						 * "because the sheet's water cards still read them".
						 * THEY DO NOT: water.js and water-map.js read
						 * `DCC_WL_WATER.i18n`, which Water_Render emits and
						 * which is untouched. These were a second copy with
						 * exactly one reader, and that reader is gone.
						 */
						/*
						 * THE MONTH-PICKER AND HUB-PREVIEW STRINGS ARE GONE
						 * (1.44.0): `monthAria`, `atPeak`, `monthChipAria`,
						 * `toSpot`, `quiet`, `and`, `yearBestOne`, `yearBest`
						 * and `now`. Every one of them was composed by a
						 * builder in canal.js that Rob's removal of the hub
						 * left with nothing to build, and those builders are
						 * deleted rather than left unreachable. Dropping the
						 * strings with them is what stops a translator being
						 * asked for a sentence nothing can ever print.
						 *
						 * The age words stay: the sheet's water cards still
						 * read them, and the reason they live here rather
						 * than only in the water module's config is above.
						 */
					],
				]
			) . ';',
			'before'
		);
	}
}
