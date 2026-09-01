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
 * v1.9.0 UI: the Guest Guide's app language — species render as TILES that
 * open the shared sliding SHEET (assets/js/sheet.js), the month browser is a
 * segmented timeline, and the season countdown leads as a hero stat. The
 * server still emits only month-independent markup; everything month-shaped
 * is built client-side. (The guest sightings module was removed in v1.2.0 —
 * see git history at v1.1.0 to restore it.)
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Render {

	private static bool $config_added  = false;
	private static bool $sheet_printed = false;

	/**
	 * Is the retired mu-plugin (dcc-wildlife-countdown.php) still installed?
	 *
	 * While it exists it wraps the [dcc_wildlife] shortcode and appends its
	 * own countdown, so this plugin must not render a second one. The moment
	 * the owner deletes the file, this returns false and the native rendering
	 * below takes over with the same option, markup and styling — the
	 * handover needs no settings change and no cache flush beyond the usual.
	 */
	private static function mu_countdown_active(): bool {
		return function_exists( 'dcc_wl_countdown_html' );
	}

	/** Countdown renders: toggle on, mu-plugin gone, species data present. */
	private static function countdown_possible(): bool {
		return Water_Admin::countdown_enabled()
			&& ! self::mu_countdown_active()
			&& [] !== Species::dataset();
	}

	/**
	 * [dcc_wildlife_countdown] — the season-countdown line on its own, for
	 * manual placement (absorbed from the mu-plugin in 1.8.0). Registered
	 * only when the mu-plugin has not already claimed the tag.
	 */
	public static function countdown_shortcode(): string {
		if ( ! self::countdown_possible() ) {
			return '';
		}
		// The countdown is computed by widget.js from the shared config, so a
		// standalone placement needs the same assets as the widget.
		self::enqueue_assets();
		return self::countdown_shell( true );
	}

	/** One shell per page (1.8.1) — see countdown_shell(). */
	private static bool $shell_printed = false;

	/**
	 * The empty countdown shell. Same markup as the mu-plugin's: an empty,
	 * hidden div the JS fills — the number of days is computed in the
	 * browser, NEVER baked into cached HTML (same doctrine as "the current
	 * month").
	 *
	 * Emitted ONCE per page (1.8.1): three entry points share this renderer —
	 * the month widget's toggle, the standalone dccwl_countdown widget and
	 * the legacy [dcc_wildlife_countdown] shortcode — and a page using more
	 * than one must still show exactly one line. First caller wins; the rest
	 * get ''. The JS is naturally single-copy via wp_enqueue_script.
	 */
	private static function countdown_shell( bool $standalone = false ): string {
		if ( self::$shell_printed ) {
			return '';
		}
		self::$shell_printed = true;

		// 1.9.0: the countdown is a HERO STAT card, not a footnote line. The
		// shell is still empty and hidden — widget.js fills it client-side in
		// canal time — but it now carries the hero structure the JS populates.
		$shell = '<div class="dccwl-hero-stat" data-dccwl-countdown hidden></div>';

		// Placed inside the month widget it inherits that instance's app
		// classes; standing alone it needs its own token scope.
		return $standalone
			? '<div class="' . esc_attr( self::app_classes() ) . '">' . $shell . '</div>'
			: $shell;
	}

	/**
	 * The countdown shell for the canal hub (1.10.0).
	 *
	 * Same gate and the same once-per-page guard as every other entry
	 * point — the hub is simply a fourth one. Returns '' when the countdown
	 * is off, when the retired mu-plugin is still rendering it, or when a
	 * shell has already been emitted on this page.
	 */
	public static function countdown_shell_for_canal(): string {
		return self::countdown_possible() ? self::countdown_shell() : '';
	}

	/**
	 * The app-layer classes every Wildlife surface carries (1.9.0).
	 *
	 * `dccwl-app` scopes the token block; the modifiers mirror what /guest/
	 * actually renders — density cozy, glass on, and NO dark class, because
	 * the Guide renders light on every OS and so does this (1.9.1). Kept
	 * filterable so a theme change on the Guide side is a one-line change
	 * here rather than a release.
	 */
	public static function app_classes(): string {
		$classes = [ 'dccwl-app', 'dccwl-density-cozy', 'dccwl-glass-yes' ];

		/**
		 * Filter the app-layer classes (density / dark / glass modifiers).
		 *
		 * @param string[] $classes
		 */
		$classes = (array) apply_filters( 'dcc_wl_app_classes', $classes );

		return implode( ' ', array_map( 'sanitize_html_class', $classes ) );
	}

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
				// 1.8.1: per-placement countdown append (the month widget's
				// "Show season countdown" toggle maps here). The global
				// dcc_wl_countdown_enabled option still governs above this:
				// when it is off, countdown_possible() is false and no path
				// renders anything regardless of this flag.
				'countdown'    => true,
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
		<div class="dccwl-root <?php echo esc_attr( self::app_classes() ); ?>" data-dccwl="<?php echo esc_attr( (string) wp_json_encode( $instance ) ); ?>">

			<?php
			/* Season countdown as the HERO STAT (1.9.0), at the TOP: it is the
			   strongest come-back-later element on the page, so it leads rather
			   than trailing the widget as it did in 1.8.x. Still an empty shell —
			   the day count is computed client-side in canal time. */
			if ( $opts['countdown'] && self::countdown_possible() ) {
				echo self::countdown_shell(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted shell markup.
			}
			?>

			<header class="dccwl-head">
				<h2 class="dccwl-title"><?php echo esc_html( '' !== $title ? $title : __( 'On the canal', 'dcc-wildlife' ) ); ?></h2>
				<p class="dccwl-sub" aria-live="polite"></p>
			</header>

			<?php if ( $show_browser ) : ?>
				<?php /* Segmented timeline (1.9.0): a scrollable month strip with
				         the canal's current month anchored. Same month logic as
				         before — the control around it is what changed. */ ?>
				<div class="dccwl-timeline" hidden>
					<button type="button" class="dccwl-timeline-arrow dccwl-timeline-prev" aria-label="<?php esc_attr_e( 'Previous month', 'dcc-wildlife' ); ?>">
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
					<div class="dccwl-timeline-track" role="group" aria-label="<?php esc_attr_e( 'Browse wildlife by month', 'dcc-wildlife' ); ?>"></div>
					<button type="button" class="dccwl-timeline-arrow dccwl-timeline-next" aria-label="<?php esc_attr_e( 'Next month', 'dcc-wildlife' ); ?>">
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5.5 2.5 11 8l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
				</div>
			<?php endif; ?>

			<?php /* Spotlight tiles — built client-side from the month the
			         visitor is actually in, so page caching can never serve a
			         stale month. */ ?>
			<ul class="dccwl-tiles dccwl-spotlight-tiles"></ul>
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
					<?php /* Owner's decision (1.8.0): the guide's notes and the
					         likelihood calendar are editorial local knowledge,
					         and this one line says whose — deliberately not
					         per-species sourcing. */ ?>
					<p class="dccwl-credit"><?php esc_html_e( 'Wildlife notes are local knowledge from your hosts — sightings vary.', 'dcc-wildlife' ); ?></p>
				</section>
			<?php endif; ?>

		</div>
		<?php
		$out = (string) ob_get_clean();

		// (The countdown is emitted INSIDE the root as the hero stat since
		// 1.9.0 — see the top of the markup above. It used to be appended
		// here, below the widget, which is where the mu-plugin put it.)

		return $out;
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
			<ul class="dccwl-tiles dccwl-guide-grid" data-dccwl-group="<?php echo esc_attr( $slug ); ?>"<?php echo $first ? '' : ' hidden'; ?> aria-label="<?php echo esc_attr( $label ); ?>">
				<?php foreach ( $group_species as $sp ) : ?>
					<li>
						<button type="button" class="dccwl-tile" data-dccwl-species="<?php echo esc_attr( $sp['id'] ); ?>" aria-haspopup="dialog" aria-expanded="false">
							<span class="dccwl-tile-icon">
								<?php if ( Sprites::has( $sp['id'] ) ) : ?>
									<?php echo Sprites::use_svg( $sp['id'], 'dccwl-chip-sprite' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted sprite markup. ?>
								<?php else : ?>
									<span class="dccwl-tile-emoji" aria-hidden="true"><?php echo esc_html( $sp['emoji'] ); ?></span>
								<?php endif; ?>
							</span>
							<span class="dccwl-tile-name"><?php echo esc_html( $sp['name'] ); ?></span>
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
			'photoBase'  => esc_url_raw( DCC_WL_URL . 'assets/photos/' ),
			'months'     => Species::month_abbrevs(),
			'monthsFull' => Species::month_names(),
			// Toggle state is baked into the cached page, matching the
			// mu-plugin's behaviour; only the DAY COUNT is computed client-side.
			'countdown'  => self::countdown_possible(),
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
				// Detail-drawer headings (1.9.0): these label their own
				// sections now, so they carry no trailing colon.
				'where'       => __( 'Where to look', 'dcc-wildlife' ),
				'bestTime'    => __( 'Best time', 'dcc-wildlife' ),
				/* translators: %s: month range, e.g. "Nov–Mar" or "Year-round". */
				'bestMonths'  => __( 'Best: %s', 'dcc-wildlife' ),
				'close'       => __( 'Close details', 'dcc-wildlife' ),
				'details'     => __( 'Species details', 'dcc-wildlife' ),
				'photoCredit' => __( 'Photo: Adobe Stock', 'dcc-wildlife' ),
				'noSpotlight' => __( 'A quiet month on the canal — browse the field guide below.', 'dcc-wildlife' ),

				// The 12-month likelihood strip in the detail drawer. The
				// bars are decoration; these words are what a screen reader
				// actually reads, one per month.
				'likelihood'  => __( 'Through the year', 'dcc-wildlife' ),
				'likeRare'    => __( 'rarely seen', 'dcc-wildlife' ),
				'likePossible'=> __( 'possible', 'dcc-wildlife' ),
				'likeGood'    => __( 'good chance', 'dcc-wildlife' ),
				'likePeak'    => __( 'peak season', 'dcc-wildlife' ),

				// Hero stat (1.9.0). The countdown reads as a headline stat
				// rather than a sentence, so its parts are separate strings.
				/* translators: %s: species name, e.g. "Manatee". */
				'cdLabel'     => __( '%s season', 'dcc-wildlife' ),
				'cdDays'      => __( 'days away', 'dcc-wildlife' ),
				'cdDay'       => __( 'day away', 'dcc-wildlife' ),
				'cdNow'       => __( 'is here now', 'dcc-wildlife' ),
				/* translators: %s: month name, e.g. "December". */
				'cdWhy'       => __( 'Peak sightings begin in %s.', 'dcc-wildlife' ),
				/* translators: %s: month name, e.g. "December". */
				'cdWhyNow'    => __( 'Peak sightings run through %s.', 'dcc-wildlife' ),
			],
		];

		wp_add_inline_script(
			'dcc-wildlife',
			'window.DCC_WL_CFG = ' . wp_json_encode( $config ) . ';',
			'before'
		);
	}
}
