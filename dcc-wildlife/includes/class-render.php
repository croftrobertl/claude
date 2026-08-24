<?php
/**
 * Shared front-end renderer used by both the Elementor widget and the
 * [dcc_wildlife] shortcode, so the two outputs are identical.
 *
 * Cache-safety: this site is aggressively page-cached, so PHP must never
 * bake "the current month" into HTML. The full 12-month dataset ships to
 * the client (inline JSON config) and the JS picks the month from the
 * visitor's local date. The month headline, spotlight chip strip, month
 * nav and detail panel are client-rendered; only month-independent markup
 * (field-guide chip grids, shells) is server-rendered.
 *
 * v1.1.0 UI: compact chip strips + one shared, JS-built detail panel per
 * widget instance (opened below whichever row the tapped chip lives in),
 * guide as three tabbed chip grids. Default rendered height stays under
 * ~560px desktop / ~720px mobile. (The guest sightings module was removed
 * in v1.2.0 — see git history at v1.1.0 to restore it.)
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Render {

	private static bool $config_added  = false;
	private static bool $sheet_printed = false;

	/**
	 * [dcc_wildlife title="" guide="yes" browser="yes" compact="no"]
	 *
	 * @param array|string $atts Shortcode attributes.
	 */
	public static function shortcode( $atts ): string {
		$atts = shortcode_atts(
			[
				'title'   => '',
				'guide'   => 'yes',
				'browser' => 'yes',
				'compact' => 'no',
			],
			array_change_key_case( (array) $atts, CASE_LOWER ),
			'dcc_wildlife'
		);

		$truthy = static fn( string $v ): bool => ! in_array( strtolower( trim( $v ) ), [ 'no', 'false', '0', 'off' ], true );

		return self::render(
			[
				'title'        => $atts['title'],
				'show_guide'   => $truthy( $atts['guide'] ),
				'show_browser' => $truthy( $atts['browser'] ),
				'compact'      => $truthy( $atts['compact'] ),
			]
		);
	}

	/**
	 * Render the widget markup.
	 *
	 * @param array $opts {
	 *     @type string $title        Heading override ('' = JS month headline).
	 *     @type bool   $show_guide   Render the field guide tabs.
	 *     @type bool   $show_browser Render the month nav.
	 *     @type bool   $compact      Spotlight band only (overrides the others).
	 * }
	 */
	public static function render( array $opts ): string {
		$opts = wp_parse_args(
			$opts,
			[
				'title'        => '',
				'show_guide'   => true,
				'show_browser' => true,
				'compact'      => false,
			]
		);

		$compact      = (bool) $opts['compact'];
		$show_guide   = ! $compact && (bool) $opts['show_guide'];
		$show_browser = ! $compact && (bool) $opts['show_browser'];

		$title = sanitize_text_field( (string) $opts['title'] );

		self::enqueue_assets();

		$instance = [
			'browser'     => $show_browser,
			'customTitle' => '' !== $title,
		];

		ob_start();

		// Sprite symbol sheet: printed once per page; all chips/medallions
		// reference it via <use>, so path data is never duplicated.
		if ( ! self::$sheet_printed ) {
			self::$sheet_printed = true;
			echo Sprites::symbol_sheet(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted sprite markup.
		}
		?>
		<div class="dccwl-root" data-dccwl="<?php echo esc_attr( (string) wp_json_encode( $instance ) ); ?>">

			<header class="dccwl-hero">
				<h2 class="dccwl-title"><?php echo esc_html( '' !== $title ? $title : __( 'On the canal', 'dcc-wildlife' ) ); ?></h2>
				<p class="dccwl-sub" aria-live="polite"></p>
			</header>

			<?php if ( $show_browser ) : ?>
				<div class="dccwl-monthnav" hidden>
					<button type="button" class="dccwl-nav-arrow dccwl-nav-prev" aria-label="<?php esc_attr_e( 'Previous month', 'dcc-wildlife' ); ?>">
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
					<div class="dccwl-months" role="group" aria-label="<?php esc_attr_e( 'Browse wildlife by month', 'dcc-wildlife' ); ?>"></div>
					<button type="button" class="dccwl-nav-arrow dccwl-nav-next" aria-label="<?php esc_attr_e( 'Next month', 'dcc-wildlife' ); ?>">
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5.5 2.5 11 8l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
				</div>
			<?php endif; ?>

			<div class="dccwl-strip-wrap">
				<ul class="dccwl-chips dccwl-strip dccwl-spotlight-chips"></ul>
			</div>
			<div class="dccwl-panel-slot dccwl-slot-spotlight"></div>
			<noscript>
				<p class="dccwl-noscript"><?php esc_html_e( 'Please enable JavaScript to see this month’s wildlife highlights.', 'dcc-wildlife' ); ?></p>
			</noscript>

			<?php if ( $show_guide ) : ?>
				<section class="dccwl-guide" aria-label="<?php esc_attr_e( 'Canal field guide', 'dcc-wildlife' ); ?>">
					<div class="dccwl-tabs" role="group" aria-label="<?php esc_attr_e( 'Field guide groups', 'dcc-wildlife' ); ?>">
						<?php $first = true; ?>
						<?php foreach ( Species::groups() as $slug => $label ) : ?>
							<button type="button" class="dccwl-tab" data-dccwl-group="<?php echo esc_attr( $slug ); ?>" aria-pressed="<?php echo $first ? 'true' : 'false'; ?>">
								<?php echo esc_html( $label ); ?>
							</button>
							<?php $first = false; ?>
						<?php endforeach; ?>
					</div>
					<?php self::render_guide_grids(); ?>
					<div class="dccwl-panel-slot dccwl-slot-guide"></div>
				</section>
			<?php endif; ?>

		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Server-rendered field-guide chip grids (month-independent, so safe in
	 * cached HTML). One grid per group; only the first is visible until the
	 * JS wires the tabs. Chips are inert buttons until JS attaches the
	 * shared detail panel.
	 */
	private static function render_guide_grids(): void {
		$dataset = Species::dataset();
		$first   = true;

		foreach ( Species::groups() as $slug => $label ) {
			$group_species = array_values( array_filter( $dataset, static fn( array $sp ): bool => $sp['group'] === $slug ) );
			if ( ! $group_species ) {
				continue;
			}
			?>
			<ul class="dccwl-chips dccwl-guide-grid" data-dccwl-group="<?php echo esc_attr( $slug ); ?>"<?php echo $first ? '' : ' hidden'; ?> aria-label="<?php echo esc_attr( $label ); ?>">
				<?php foreach ( $group_species as $sp ) : ?>
					<li>
						<button type="button" class="dccwl-chip<?php echo $sp['mascot'] ? ' dccwl-chip-mascot' : ''; ?>" data-dccwl-species="<?php echo esc_attr( $sp['id'] ); ?>" aria-expanded="false">
							<?php if ( Sprites::has( $sp['id'] ) ) : ?>
								<?php echo Sprites::use_svg( $sp['id'], 'dccwl-chip-sprite' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted sprite markup. ?>
							<?php else : ?>
								<span class="dccwl-chip-emoji" aria-hidden="true"><?php echo esc_html( $sp['emoji'] ); ?></span>
							<?php endif; ?>
							<span class="dccwl-chip-name"><?php echo esc_html( $sp['name'] ); ?></span>
							<?php if ( $sp['mascot'] ) : ?>
								<span class="dccwl-sr"><?php esc_html_e( '— our mascot', 'dcc-wildlife' ); ?></span>
							<?php endif; ?>
						</button>
					</li>
				<?php endforeach; ?>
			</ul>
			<?php
			$first = false;
		}
	}

	/**
	 * Enqueue the (pre-registered) assets and print the shared JSON config
	 * once. Called at render time so assets only load on pages that
	 * actually use the widget/shortcode.
	 */
	private static function enqueue_assets(): void {
		wp_enqueue_style( 'dcc-wildlife' );
		wp_enqueue_script( 'dcc-wildlife' );

		if ( self::$config_added ) {
			return;
		}
		self::$config_added = true;

		// Species with a bespoke sprite get flagged; the JS falls back to the
		// emoji for any filter-added species without one.
		$species = array_map(
			static fn( array $sp ): array => $sp + [ 'sprite' => Sprites::has( $sp['id'] ) ],
			Species::dataset()
		);

		$config = [
			'species'    => $species,
			'months'     => Species::month_abbrevs(),
			'monthsFull' => Species::month_names(),
			'i18n'       => [
				/* translators: %s: month name, e.g. "August". */
				'headline'    => __( '%s on the canal', 'dcc-wildlife' ),
				/* translators: %d: number of species (2 or more). */
				'subPeak'     => __( '%d species at their peak', 'dcc-wildlife' ),
				'subPeakOne'  => __( '1 species at its peak', 'dcc-wildlife' ),
				/* translators: %d: number of species worth looking for. */
				'subSpot'     => __( '%d species to spot', 'dcc-wildlife' ),
				/* translators: 1: month name, 2: species-count phrase. */
				'monthSub'    => _x( '%1$s: %2$s', 'month subline', 'dcc-wildlife' ),
				'peak'        => __( 'Peak season', 'dcc-wildlife' ),
				'peakShort'   => __( 'Peak', 'dcc-wildlife' ),
				'mascot'      => __( 'Our mascot', 'dcc-wildlife' ),
				'where'       => __( 'Where to look:', 'dcc-wildlife' ),
				/* translators: %s: month range, e.g. "Nov–Mar" or "Year-round". */
				'bestMonths'  => __( 'Best: %s', 'dcc-wildlife' ),
				'close'       => __( 'Close details', 'dcc-wildlife' ),
				'details'     => __( 'Species details', 'dcc-wildlife' ),
				'noSpotlight' => __( 'A quiet month on the canal — browse the field guide below.', 'dcc-wildlife' ),
			],
		];

		wp_add_inline_script(
			'dcc-wildlife',
			'window.DCC_WL_CFG = ' . wp_json_encode( $config ) . ';',
			'before'
		);
	}
}
