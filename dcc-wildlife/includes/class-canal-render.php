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
	public static function render( array $opts = [] ): string {
		$opts  = wp_parse_args( $opts, [ 'title' => '' ] );
		$title = sanitize_text_field( (string) $opts['title'] );

		// The water module decides for itself whether it has anything to
		// say (its 1.5.0 auto-hide). An empty string means "nothing at all
		// today" — so the hub simply does not offer a Water tile.
		$water_html = Water_Render::render( [] );
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
			]
		);

		self::enqueue_assets();

		ob_start();
		?>
		<div class="dccwl-canal <?php echo esc_attr( Render::app_classes() ); ?>" data-dccwl-canal>

			<div class="dccwl-stage" data-dccwl-stage>

				<?php /* ---------- L1: the hub ---------- */ ?>
				<section class="dccwl-panel dccwl-panel-hub" data-dccwl-panel="hub" tabindex="-1">
					<?php /* The hub's heading is for the outline and screen readers only
					         (1.18.0). The heritage hero that used to sit here — title,
					         Grantland Rice quote, attribution — and the "right now on the
					         canal" line were removed at the owner's request; the hub's one
					         job is now: what is coming, and where to go. */ ?>
					<h2 class="dccwl-panel-title dccwl-sr"><?php echo esc_html( '' !== $title ? $title : __( 'On the canal', 'dcc-wildlife' ) ); ?></h2>

					<?php
					/* The season countdown: the hub's one living element. Still exactly
					   one shell per page (the 1.8.1 first-caller-wins guard is untouched)
					   and still an empty div the browser fills in canal time. */
					echo Render::countdown_shell_for_canal(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted shell markup.
					?>
					<noscript>
						<?php /* The two tiles below are buttons the hub script drives; without
						   it they are inert. Say so, and point at the prose guide, which
						   is right here on the page and needs nothing (1.17.0). */ ?>
						<p class="dccwl-noscript"><?php esc_html_e( 'The guided view needs JavaScript. The whole field guide is just below, in words.', 'dcc-wildlife' ); ?></p>
					</noscript>
					<ul class="dccwl-hub-tiles">
						<li>
							<button type="button" class="dccwl-hub-tile" data-dccwl-go="month">
								<span class="dccwl-hub-name"><?php esc_html_e( 'Wildlife', 'dcc-wildlife' ); ?></span>
								<?php /* Filled client-side from the bundled species
								         calendar — always available, never cached. */ ?>
								<span class="dccwl-hub-preview" data-dccwl-preview="wildlife"></span>
								<?php /* Species art for the month, added client-side.
								         Decorative: the preview line above says what
								         it means. */ ?>
								<span class="dccwl-hub-art" data-dccwl-hub-art="wildlife" aria-hidden="true"></span>
								<?php self::door_chevron(); ?>
							</button>
						</li>
						<?php if ( $has_water ) : ?>
							<li>
								<button type="button" class="dccwl-hub-tile" data-dccwl-go="water" data-dccwl-water-tile>
									<span class="dccwl-hub-name"><?php esc_html_e( 'Water', 'dcc-wildlife' ); ?></span>
									<?php /* Filled ONLY from sourced facts the existing
									         /conditions route returns. No facts, a failed
									         fetch or a stale-gated reading leaves this
									         empty and the tile shows its name alone —
									         the same rule the module itself follows. */ ?>
									<span class="dccwl-hub-preview" data-dccwl-preview="water"></span>
									<?php /* Source + age chips for the very facts above —
									         the same provenance the cards carry. */ ?>
									<span class="dccwl-hub-art" data-dccwl-hub-art="water"></span>
									<?php self::door_chevron(); ?>
								</button>
							</li>
						<?php endif; ?>
					</ul>
				</section>

				<?php /* ---------- L2a: the month picker ---------- */ ?>
				<section class="dccwl-panel dccwl-panel-month" data-dccwl-panel="month" tabindex="-1" hidden>
					<?php self::level_bar( __( 'Back', 'dcc-wildlife' ), [ __( 'Wildlife', 'dcc-wildlife' ) ] ); ?>
					<h2 class="dccwl-panel-title"><?php esc_html_e( 'The canal year', 'dcc-wildlife' ); ?></h2>
					<?php /* "The fullest months are…" — computed client-side from the
					         same bundled calendar the tiles use, so a cached page can
					         never state a stale one. Empty until the JS fills it. */ ?>
					<p class="dccwl-year-note" data-dccwl-year-note></p>
					<?php /* Twelve tiles, built client-side: the labels are
					         month-independent but the highlight and the preview
					         lines are not, and mixing the two server-side is how
					         a cached page starts lying about the date. */ ?>
					<ul class="dccwl-month-tiles" data-dccwl-month-tiles></ul>
					<?php /* The one colour the picker carries, explained where it is used. */ ?>
					<p class="dccwl-legend" aria-label="<?php esc_attr_e( 'Key', 'dcc-wildlife' ); ?>">
						<span class="dccwl-legend-item"><span class="dccwl-legend-swatch dccwl-legend-swatch-now" aria-hidden="true"></span><?php esc_html_e( 'this month', 'dcc-wildlife' ); ?></span>
					</p>
				</section>

				<?php /* ---------- L3a: species for the chosen month ---------- */ ?>
				<section class="dccwl-panel dccwl-panel-species" data-dccwl-panel="species" tabindex="-1" hidden>
					<?php /* The month segment is filled client-side (canal.js setMonth): a
					         cached page must never name a month. */ ?>
					<?php self::level_bar( __( 'All months', 'dcc-wildlife' ), [ __( 'Wildlife', 'dcc-wildlife' ), '' ], 'month' ); ?>
					<?php echo $species_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Render::render() escapes its own output. ?>
				</section>

				<?php if ( $has_water ) : ?>
					<?php /* ---------- L2b: the whole water module ---------- */ ?>
					<section class="dccwl-panel dccwl-panel-water" data-dccwl-panel="water" tabindex="-1" hidden>
						<?php self::level_bar( __( 'Back', 'dcc-wildlife' ), [ __( 'Water', 'dcc-wildlife' ) ] ); ?>
						<?php echo $water_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Water_Render::render() escapes its own output. ?>
					</section>
				<?php endif; ?>

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

	/** The centred back control every non-hub level carries. */
	/**
	 * The level bar (1.18.0): a sticky, tinted band at the top of every panel
	 * below the hub — Back on the left, a breadcrumb in the middle — so depth
	 * is visible: where am I, what is this a child of, how do I get back.
	 * Nothing else may share this surface treatment; tiles are the only cards.
	 *
	 * @param string   $back    Back button label.
	 * @param string[] $crumbs  Breadcrumb segments; an empty string is a
	 *                          client-filled slot (the month name).
	 * @param string   $fill    data-dccwl-crumb key for the client-filled slot.
	 */
	private static function level_bar( string $back, array $crumbs, string $fill = '' ): void {
		?>
		<div class="dccwl-levelbar">
			<button type="button" class="dccwl-back" data-dccwl-back>
				<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<span><?php echo esc_html( $back ); ?></span>
			</button>
			<nav class="dccwl-crumbs" aria-label="<?php esc_attr_e( 'You are here', 'dcc-wildlife' ); ?>">
				<?php $last = count( $crumbs ) - 1; ?>
				<?php foreach ( $crumbs as $i => $crumb ) : ?>
					<?php if ( $i > 0 ) : ?><span class="dccwl-crumb-sep" aria-hidden="true">›</span><?php endif; ?>
					<span class="dccwl-crumb<?php echo $i === $last ? ' dccwl-crumb-here' : ''; ?>"<?php echo $i === $last ? ' aria-current="location"' : ''; ?><?php echo ( '' === $crumb && '' !== $fill ) ? ' data-dccwl-crumb="' . esc_attr( $fill ) . '"' : ''; ?>><?php echo esc_html( $crumb ); ?></span>
				<?php endforeach; ?>
			</nav>
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
					'i18n' => [
						'now'        => __( 'now', 'dcc-wildlife' ),
						/* translators: %s: a month name. */
						'monthAria'  => __( 'Wildlife in %s', 'dcc-wildlife' ),
						/* translators: %d: number of species at peak. */
						'atPeak'     => __( '%d at peak', 'dcc-wildlife' ),
						/* translators: %d: number of species worth looking for. */
						'toSpot'     => __( '%d to spot', 'dcc-wildlife' ),
						'quiet'      => __( 'a quiet month', 'dcc-wildlife' ),
						/* translators: %s: month name — the Wildlife tile's preview. */
						'hubMonth'   => __( '%1$s in %2$s', 'dcc-wildlife' ),
						/* translators: joins the last two items of a list, e.g. "April and May". */
						'and'        => __( 'and', 'dcc-wildlife' ),
						/* translators: 1: a month name, 2: number of species at peak. */
						'yearBestOne' => __( '%1$s is the canal’s fullest month — %2$d species at their peak.', 'dcc-wildlife' ),
						/* translators: 1: a list of month names, 2: number of species at peak. */
						'yearBest'   => __( '%1$s are the canal’s fullest months — %2$d species at their peak.', 'dcc-wildlife' ),

					],
				]
			) . ';',
			'before'
		);
	}
}
