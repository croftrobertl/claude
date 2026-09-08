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
				// 1.16.0: whether THIS call prints the crawlable prose guide.
				// The hub sets it false and prints the prose itself at its own
				// top level — otherwise the prose lands inside the hub's
				// display:none species panel, where a crawler discounts it and
				// the whole point of the prose (being read) is lost. Same shape
				// as the countdown, which the hub also lifts out and re-emits.
				'guide_prose'  => true,
				// 1.18.0: the spotlight strip. The standalone widget keeps it; the
				// hub turns it off and month-filters the guide grid instead.
				'spotlight'    => true,
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

			<?php if ( $opts['spotlight'] ) : ?>
				<?php /* Spotlight tiles — built client-side from the month the
				         visitor is actually in, so page caching can never serve a
				         stale month. */ ?>
				<ul class="dccwl-tiles dccwl-spotlight-tiles"></ul>
			<?php endif; ?>
			<noscript>
				<p class="dccwl-noscript"><?php esc_html_e( 'Please enable JavaScript to see this month’s wildlife highlights.', 'dcc-wildlife' ); ?></p>
			</noscript>

			<?php if ( $show_guide ) : ?>
				<section class="dccwl-guide" aria-label="<?php esc_attr_e( 'Canal field guide', 'dcc-wildlife' ); ?>">
					<?php /* A segmented control (1.18.0): one bordered group, so the
					         three categories read as a single switch, not as three
					         more cards among the tiles. */ ?>
					<div class="dccwl-tabs" role="group" aria-label="<?php esc_attr_e( 'Field guide groups', 'dcc-wildlife' ); ?>">
						<?php $first = true; ?>
						<?php foreach ( Species::tab_labels() as $slug => $label ) : ?>
							<button type="button" class="dccwl-tab" data-dccwl-group="<?php echo esc_attr( $slug ); ?>" aria-pressed="<?php echo $first ? 'true' : 'false'; ?>">
								<?php echo esc_html( $label ); ?>
							</button>
							<?php $first = false; ?>
						<?php endforeach; ?>
					</div>
					<?php /* The one colour a tile can carry, explained where it is used
					         (1.18.0). If a colour cannot earn a line here, it must not
					         carry meaning. */ ?>
					<p class="dccwl-legend" aria-label="<?php esc_attr_e( 'Key', 'dcc-wildlife' ); ?>">
						<span class="dccwl-legend-item"><span class="dccwl-tile-sub dccwl-tile-peak dccwl-legend-badge" aria-hidden="true"><?php esc_html_e( 'Peak', 'dcc-wildlife' ); ?></span><?php esc_html_e( 'at its best this month', 'dcc-wildlife' ); ?></span>
						<?php /* The flag marks (1.19.0), explained beside the tiles that
						         carry them. Only flags some species actually has. */ ?>
						<?php foreach ( self::flags_in_use() as $flag => $def ) : ?>
							<span class="dccwl-legend-item"><?php echo Sprites::mark_html( $flag, $def[0] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted markup. ?><span><b><?php echo esc_html( $def[0] ); ?></b> — <?php echo esc_html( $def[1] ); ?></span></span>
						<?php endforeach; ?>
					</p>
					<?php self::render_guide_grids(); ?>
					<?php /* Month-filtered on the hub (canal.js): a species not likely
					         this month is hidden, and this line says so when a whole
					         category goes quiet. Filled client-side; empty in the HTML. */ ?>
					<p class="dccwl-guide-empty" data-dccwl-guide-empty hidden></p>
					<?php if ( $opts['guide_prose'] ) { self::render_guide_text(); } ?>
				</section>
				<?php self::render_species_jsonld(); ?>
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
			$group_species = Species::group_members( $dataset, $slug );
			if ( ! $group_species ) {
				continue;
			}
			?>
			<ul class="dccwl-tiles dccwl-guide-grid" data-dccwl-group="<?php echo esc_attr( $slug ); ?>"<?php echo $first ? '' : ' hidden'; ?> aria-label="<?php echo esc_attr( $label ); ?>">
				<?php foreach ( $group_species as $sp ) : ?>
					<li>
						<button type="button" class="dccwl-tile" data-dccwl-species="<?php echo esc_attr( $sp['id'] ); ?>" aria-haspopup="dialog" aria-expanded="false">
							<?php echo self::tile_media( $sp ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside. ?>
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
	 * Photo-first tile face (1.19.0): the vetted photo's 4:3 thumbnail, else
	 * the neutral GROUP glyph — never a drawing that could be the wrong
	 * animal. Flag marks sit on the corner. The same face is built
	 * client-side by widget.js for spotlight tiles; keep the two in step.
	 */
	private static function tile_media( array $sp ): string {
		$out = '<span class="dccwl-tile-media">';
		if ( '' !== (string) $sp['thumb'] ) {
			$out .= '<img class="dccwl-tile-photo" src="' . esc_url( DCC_WL_URL . 'assets/photos/' . $sp['thumb'] ) . '" alt="" width="320" height="240" loading="lazy" decoding="async">';
		} else {
			$out .= Sprites::glyph_svg( (string) $sp['group'], 'dccwl-glyph dccwl-tile-glyph' );
		}
		if ( ! empty( $sp['flags'] ) ) {
			$labels = Species::flags();
			$out   .= '<span class="dccwl-tile-flags">';
			foreach ( (array) $sp['flags'] as $flag ) {
				$out .= Sprites::mark_html( (string) $flag, (string) ( $labels[ $flag ][0] ?? $flag ) );
			}
			$out .= '</span>';
		}
		return $out . '</span>';
	}

	/** The flags at least one species carries, in legend order. */
	private static function flags_in_use(): array {
		$used = [];
		foreach ( Species::dataset() as $sp ) {
			foreach ( (array) $sp['flags'] as $f ) {
				$used[ $f ] = true;
			}
		}
		return array_intersect_key( Species::flags(), $used );
	}

	/**
	 * "Photo credits" (1.19.0): every non-public-domain image, in a collapsed
	 * <details> like the prose guide — crawlable, no JS. Printed by
	 * render_guide_text() so it travels with the prose.
	 */
	private static function render_photo_credits( array $dataset ): void {
		$credits = Species::photo_credits();
		$rows    = [];
		foreach ( $dataset as $sp ) {
			if ( '' !== $sp['photo'] && isset( $credits[ $sp['id'] ] ) ) {
				$rows[] = [ $sp['name'], $credits[ $sp['id'] ] ];
			}
		}
		if ( ! $rows ) {
			return;
		}
		?>
		<details class="dccwl-fullguide dccwl-photo-credits">
			<summary class="dccwl-fullguide-summary">
				<span class="dccwl-fullguide-chev" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
				<span class="dccwl-fullguide-text">
					<h2 class="dccwl-fullguide-h"><?php esc_html_e( 'Photo credits', 'dcc-wildlife' ); ?></h2>
					<span class="dccwl-fullguide-meta">
						<?php
						/* translators: %d: number of photographs. */
						echo esc_html( sprintf( _n( '%d photograph, and who took it', '%d photographs, and who took them', count( $rows ), 'dcc-wildlife' ), count( $rows ) ) );
						?>
					</span>
				</span>
			</summary>
			<div class="dccwl-fullguide-body">
				<ul class="dccwl-photo-credits-list">
					<?php foreach ( $rows as [ $name, $c ] ) : ?>
						<li><b><?php echo esc_html( $name ); ?></b> — <?php echo esc_html( $c[0] ); ?><?php if ( '' !== $c[1] ) : ?>, <?php echo esc_html( $c[1] ); ?><?php endif; ?><?php if ( '' !== $c[2] ) : ?> (<a href="<?php echo esc_url( $c[2] ); ?>" rel="noopener"><?php esc_html_e( 'source', 'dcc-wildlife' ); ?></a>)<?php endif; ?></li>
					<?php endforeach; ?>
				</ul>
			</div>
		</details>
		<?php
	}

	/**
	 * The whole field guide, in words (1.16.0).
	 *
	 * WHY THIS EXISTS. Everything that makes this guide worth reading — the
	 * scientific names, the facts, the calls, the field marks that separate
	 * two white waders — lived only inside the inline JSON config, i.e. inside
	 * a <script> tag. Measured on the live page: the species NAMES were
	 * readable as page text, but "Ardea herodias" and every fact appeared
	 * exactly once in the HTML and zero times in the text a crawler reads. A
	 * search engine could see the shelf and not the books.
	 *
	 * So the same content is rendered here as real, server-side prose. This is
	 * NOT a hidden-text trick: it is a native <details>, any visitor can open
	 * it, it needs no JavaScript, and it is the same text the sheet shows. It
	 * doubles as the no-JS and poor-signal fallback — a guest on the dock with
	 * one bar gets the entire guide.
	 *
	 * CACHE-SAFE. Every field used here is month-independent (bestLabel is a
	 * static range like "Nov–Mar", never "this month"), so it is safe in
	 * page-cached HTML — the same rule that keeps the spotlight client-side.
	 */
	private static function render_guide_text(): void {
		// Once per page, first caller wins — the same rule the countdown shell
		// follows. A page carrying both the hub and a standalone [dcc_wildlife]
		// must not print the whole guide twice: that is duplicated content for
		// a crawler and a second long block for a screen reader to wade past.
		if ( self::$fullguide_printed ) {
			return;
		}
		$dataset = Species::dataset();
		if ( ! $dataset ) {
			return;
		}
		self::$fullguide_printed = true;
		?>
		<details class="dccwl-fullguide">
			<summary class="dccwl-fullguide-summary">
				<?php /* A real affordance (1.18.0): chevron that turns on open, a label
				   that is the section's H2 (so Critters/Birds/Plants own a place in
				   the outline), and a meta line. Still a native <details>, still
				   server-rendered — this is the crawlable prose. */ ?>
				<span class="dccwl-fullguide-chev" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
				<span class="dccwl-fullguide-text">
					<h2 class="dccwl-fullguide-h"><?php esc_html_e( 'The whole field guide', 'dcc-wildlife' ); ?></h2>
					<span class="dccwl-fullguide-meta">
						<?php
						printf(
							/* translators: %d: number of species in the field guide. "Species" is invariant in English, so this needs no plural form. */
							esc_html__( '%d species, in words — tap to read', 'dcc-wildlife' ),
							count( $dataset )
						);
						?>
					</span>
				</span>
			</summary>
			<div class="dccwl-fullguide-body">
				<?php foreach ( Species::groups() as $slug => $label ) : ?>
					<?php
					$in_group = array_values( array_filter( $dataset, static fn( array $sp ): bool => $sp['group'] === $slug ) );
					if ( ! $in_group ) {
						continue;
					}
					?>
					<h3 class="dccwl-fg-group"><?php echo esc_html( $label ); ?></h3>
					<?php foreach ( $in_group as $sp ) : ?>
						<article class="dccwl-fg">
							<h4 class="dccwl-fg-name">
								<?php echo esc_html( $sp['name'] ); ?>
								<?php if ( '' !== $sp['sci'] ) : ?>
									<i class="dccwl-fg-sci"><?php echo esc_html( $sp['sci'] ); ?></i>
								<?php endif; ?>
							</h4>
							<?php if ( '' !== $sp['fact'] ) : ?>
								<p class="dccwl-fg-fact"><?php echo esc_html( $sp['fact'] ); ?></p>
							<?php endif; ?>
							<?php if ( ! empty( $sp['flags'] ) ) : ?>
								<p class="dccwl-fg-line"><span class="dccwl-fg-k"><?php esc_html_e( 'Take care', 'dcc-wildlife' ); ?></span> <?php echo esc_html( implode( ' · ', array_map( static fn( string $f ): string => Species::flags()[ $f ][0] ?? $f, (array) $sp['flags'] ) ) ); ?></p>
							<?php endif; ?>
							<?php if ( '' !== $sp['safe'] ) : ?>
								<p class="dccwl-fg-line dccwl-fg-safe"><span class="dccwl-fg-k"><?php esc_html_e( 'What to do', 'dcc-wildlife' ); ?></span> <?php echo esc_html( $sp['safe'] ); ?></p>
							<?php endif; ?>
							<?php if ( '' !== $sp['where'] ) : ?>
								<p class="dccwl-fg-line"><span class="dccwl-fg-k"><?php esc_html_e( 'Where to look', 'dcc-wildlife' ); ?></span> <?php echo esc_html( $sp['where'] ); ?></p>
							<?php endif; ?>
							<?php if ( '' !== $sp['best'] || '' !== $sp['bestLabel'] ) : ?>
								<p class="dccwl-fg-line"><span class="dccwl-fg-k"><?php esc_html_e( 'Best time', 'dcc-wildlife' ); ?></span>
									<?php
									$when = array_values( array_filter( [ (string) $sp['best'], (string) $sp['bestLabel'] ] ) );
									echo esc_html( implode( ' · ', $when ) );
									?>
								</p>
							<?php endif; ?>
							<?php if ( '' !== $sp['sound'] ) : ?>
								<p class="dccwl-fg-line"><span class="dccwl-fg-k"><?php esc_html_e( 'Listen for', 'dcc-wildlife' ); ?></span> <?php echo esc_html( $sp['sound'] ); ?></p>
							<?php endif; ?>
							<?php if ( '' !== $sp['mark'] ) : ?>
								<p class="dccwl-fg-line"><span class="dccwl-fg-k"><?php esc_html_e( 'Tell it apart', 'dcc-wildlife' ); ?></span> <?php echo esc_html( $sp['mark'] ); ?></p>
							<?php endif; ?>
						</article>
					<?php endforeach; ?>
				<?php endforeach; ?>
			</div>
		</details>
		<?php
		self::render_photo_credits( $dataset );
	}

	/** One prose guide and one JSON-LD block per page, however many widgets are placed. */
	private static bool $fullguide_printed = false;
	private static bool $jsonld_printed    = false;

	/**
	 * The crawlable prose guide, for the hub to place at its OWN top level
	 * (1.16.0).
	 *
	 * The hub's field guide lives inside a display:none panel three taps deep,
	 * so prose rendered there is content a crawler sees hidden and discounts.
	 * The hub therefore calls Render::render() with guide_prose=false and emits
	 * this instead, in normal flow at the foot of the canal module. Same
	 * $fullguide_printed guard, so it is still exactly once per page.
	 */
	public static function guide_prose_for_canal(): string {
		ob_start();
		self::render_guide_text();
		return (string) ob_get_clean();
	}

	/**
	 * schema.org for the field guide (1.16.0).
	 *
	 * An ItemList of Taxon nodes, each carrying the common name, the
	 * scientific name as alternateName, and `sameAs` pointing at the VERIFIED
	 * Wikipedia article and/or Wikidata item (see Species::entities()). That
	 * sameAs list is the whole point: it is what tells a machine that this
	 * page's "Limpkin" is the same entity the rest of the web knows, which is
	 * the difference between text about birds and data about a species.
	 *
	 * HONEST SCOPE. Google publishes no rich result for a species, so this
	 * will not draw a snippet or a carousel — the win is entity clarity for
	 * search and for AI retrieval, not decoration in the SERP. It deliberately
	 * carries no `description`: the facts are already on the page as prose
	 * above, and repeating them here would inflate every cached page for
	 * nothing. It also never invents a node — a species with no verified
	 * entity ships name and alternateName alone.
	 *
	 * `Taxon` is schema.org pending vocabulary; consumers that don't know it
	 * ignore the type and still read the names, so there is no downside.
	 * Emitted separately from AIOSEO's graph (WebPage/Organization/
	 * LocalBusiness), which it neither touches nor duplicates.
	 */
	private static function render_species_jsonld(): void {
		if ( self::$jsonld_printed ) {
			return;
		}
		$dataset = Species::dataset();
		if ( ! $dataset ) {
			return;
		}
		self::$jsonld_printed = true;

		$items    = [];

		foreach ( $dataset as $i => $sp ) {
			$taxon = [
				'@type' => 'Taxon',
				'name'  => $sp['name'],
			];
			if ( '' !== $sp['sci'] ) {
				// The scientific name as an alternate name — true for every
				// row. NOT taxonRank: our set mixes ranks (species, the two
				// manatee/water-snake SUBSPECIES, and "Turtles", which is two
				// genera at once), so a blanket 'species' would be wrong for
				// several. An unverifiable rank is worse than none — the same
				// rule the water module's Fact gate follows.
				$taxon['alternateName'] = $sp['sci'];
			}
			$links = Species::entity_links( $sp['id'] );
			if ( $links ) {
				// One or more VERIFIED targets — a Wikipedia article and its
				// Wikidata item where both were checked, Wikidata alone where
				// only the item was, and two items for the one tile that
				// honestly covers two taxa (mosquitoes and no-see-ums).
				$taxon['sameAs'] = $links;
			}
			$items[] = [
				'@type'    => 'ListItem',
				'position' => $i + 1,
				'item'     => $taxon,
			];
		}

		$graph = [
			'@context'        => 'https://schema.org',
			'@type'           => 'ItemList',
			'name'            => __( 'Dora Canal field guide', 'dcc-wildlife' ),
			'description'     => __( 'Wildlife recorded along the Dora Canal in Tavares, Florida.', 'dcc-wildlife' ),
			'numberOfItems'   => count( $items ),
			'itemListOrder'   => 'https://schema.org/ItemListUnordered',
			'itemListElement' => $items,
		];

		// Slashes stay ESCAPED (no JSON_UNESCAPED_SLASHES): that is what stops
		// a literal "</script>" in any future filtered species name from
		// breaking out of this tag. "https:\/\/…" is valid JSON-LD and every
		// consumer reads it. Unicode is left literal so accented names read
		// cleanly. wp_json_encode already escapes for safe embedding.
		echo '<script type="application/ld+json">' . wp_json_encode( $graph, JSON_UNESCAPED_UNICODE ) . '</script>';
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
				// 1.19.0 data model: flag names for the tile marks and sheet
				// badges, the odds labels, the what-to-do heading.
				'flagNames'   => array_map( static fn( array $d ): string => $d[0], Species::flags() ),
				'oddsNames'   => Species::odds(),
				'safe'        => __( 'What to do', 'dcc-wildlife' ),
				'place'       => __( 'Where to go', 'dcc-wildlife' ),
				// Detail-drawer headings (1.9.0): these label their own
				// sections now, so they carry no trailing colon.
				'where'       => __( 'Where to look', 'dcc-wildlife' ),
				'listen'      => __( 'Listen for', 'dcc-wildlife' ),
				'confused'    => __( 'Easily confused with', 'dcc-wildlife' ),
				/* translators: %s: a field mark, e.g. "its bright golden-yellow feet". */
				'tellBy'      => __( 'Tell this one by %s.', 'dcc-wildlife' ),
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
				/* translators: %s: month name. Value line while a season is still on, e.g. "through April". */
				'cdThrough'   => __( 'through %s', 'dcc-wildlife' ),
				/* translators: %s: month name. Shown when no species in a category is likely that month. */
				'guideEmpty'  => __( 'Nothing in this group is likely in %s.', 'dcc-wildlife' ),
				'likeKey'     => __( 'Key', 'dcc-wildlife' ),
				/* translators: 1: species name, 2: "N days away". The next rise, shown under a season that is still on. */
				'cdNext'      => __( 'Next up: %1$s season, %2$s.', 'dcc-wildlife' ),
			],
		];

		wp_add_inline_script(
			'dcc-wildlife',
			'window.DCC_WL_CFG = ' . wp_json_encode( $config ) . ';',
			'before'
		);
	}
}
