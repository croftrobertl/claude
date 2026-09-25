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

	/**
	 * The tab slug of the Peak Now filter (1.27.0). Not a section: it cannot
	 * collide with one because sections() is a fixed list and this is not in
	 * it, and the leading underscores say so at a glance in the DOM.
	 */
	public const PEAK_TAB = '__peak';

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
		/*
		 * RETIRED IN 1.27.0. The season countdown was the hero card at the top
		 * of the widget: fillCountdown() in widget.js stamped .dccwl-hero-stat
		 * into one of three states — "is here now" at peak, "through April"
		 * mid-run, "42 days away" while counting down.
		 *
		 * The owner asked for the "is here now" state to go. Removing only that
		 * string would have left the card counting down all year and never
		 * arriving, so the choice put to him was the whole card, and he took
		 * it. The feature is retired, not one of its sentences.
		 *
		 * This is the single gate every path runs through — the widget, the
		 * canal hub, and the standalone countdown widget and shortcode — so
		 * returning false here retires all of them at once while leaving those
		 * registrations in place. An Elementor page that already places the
		 * countdown widget therefore renders nothing rather than erroring.
		 * fillCountdown() and the cd* strings are gone with it; bringing the
		 * feature back means restoring those too, not just this line.
		 */
		return false;
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
					<div class="dccwl-tabs" role="group" aria-label="<?php esc_attr_e( 'Field guide sections', 'dcc-wildlife' ); ?>">
						<?php $first = true; ?>
						<?php foreach ( Species::sections() as $slug => $label ) : ?>
							<button type="button" class="dccwl-tab" data-dccwl-group="<?php echo esc_attr( $slug ); ?>" aria-pressed="<?php echo $first ? 'true' : 'false'; ?>">
								<?php echo esc_html( $label ); ?>
							</button>
							<?php $first = false; ?>
						<?php endforeach; ?>
						<?php /* Peak Now (1.27.0) is a FILTER, not a section: it cuts
						         across all three, safety included, and shows everything
						         at its best in the month the VISITOR is in. So it names
						         no month and counts nothing here — widget.js fills it
						         from canal time, exactly as the spotlight does, and a
						         cached page can never carry a stale month. */ ?>
						<button type="button" class="dccwl-tab dccwl-tab-peak" data-dccwl-group="<?php echo esc_attr( self::PEAK_TAB ); ?>" aria-pressed="false">
							<?php esc_html_e( 'Peak Now', 'dcc-wildlife' ); ?>
						</button>
					</div>
					<?php /* Search (1.21.0). At 51 species the tabs alone are not
					         navigation. It filters the tiles already on the page — no
					         request, nothing month-dependent, so it is safe in cached
					         HTML — and it adds no text of its own to the crawlable
					         prose below. Hidden until the script unhides it: with
					         JavaScript off there is nothing here that could not work. */ ?>
					<div class="dccwl-search" data-dccwl-search hidden>
						<span class="dccwl-search-field">
							<svg class="dccwl-search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13.5 13.5 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
							<input type="search" class="dccwl-search-input" data-dccwl-search-input
								aria-label="<?php esc_attr_e( 'Search the field guide', 'dcc-wildlife' ); ?>"
								placeholder="<?php
									/* translators: %d: number of species in the guide. */
									echo esc_attr( sprintf( __( 'Search %d species', 'dcc-wildlife' ), count( Species::dataset() ) ) );
								?>"
								autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
							<button type="button" class="dccwl-search-clear" data-dccwl-search-clear hidden aria-label="<?php esc_attr_e( 'Clear search', 'dcc-wildlife' ); ?>">
								<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
							</button>
						</span>
						<p class="dccwl-sr" role="status" aria-live="polite" data-dccwl-search-status></p>
					</div>
					<?php /* The one colour a tile can carry, explained where it is used
					         (1.18.0). If a colour cannot earn a line here, it must not
					         carry meaning. */ ?>
					<p class="dccwl-legend" aria-label="<?php esc_attr_e( 'Key', 'dcc-wildlife' ); ?>">
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
					<?php /* The cap (1.21.0): a long group opens at its first tiles and
					         says how many more there are, rather than running for
					         screens. Label and count are filled client-side. */ ?>
					<?php /* The "Show all" control was here, under each section. The
					         twelve-tile cap it opened was removed in 1.28.0 — see the
					         note in widget.js where GUIDE_CAP used to be. Every species
					         in a section is on the page now. */ ?>
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

		foreach ( Species::sections() as $slug => $label ) {
			$group_species = Species::section_members( $dataset, $slug );
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
		// 1.29.0: the URL comes from the media library, then from a bundled
		// file if this release still ships one, and is '' when neither has it.
		// An empty URL is not an error — it falls through to the drawing and
		// then the glyph, the same landing a species with no photograph has
		// always had. A missing attachment must never be a broken image.
		$thumb = Photo_Library::url( (string) $sp['id'], 'thumb' );
		if ( '' !== $thumb ) {
			$out .= '<img class="dccwl-tile-photo" src="' . esc_url( $thumb ) . '" alt="" width="320" height="240" loading="lazy" decoding="async">';
		} elseif ( Sprites::has( (string) $sp['id'] ) ) {
			// 1.23.0: the species' own drawing before the group glyph. It is
			// still not a photograph, but it is THIS animal rather than a
			// feather standing in for every bird — and the drawings already
			// exist, so seven tiles stopped being interchangeable for nothing.
			$out .= Sprites::use_svg( (string) $sp['id'], 'dccwl-tile-sprite' );
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
			<summary class="dccwl-fullguide-summary" aria-label="<?php esc_attr_e( 'Photo credits', 'dcc-wildlife' ); ?>">
				<span class="dccwl-fullguide-chev" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
				<span class="dccwl-fullguide-text">
					<?php /* "Credits" in the row, "Photo credits" to a screen reader
					         (1.28.0). Measured on live at 393px, three full labels came
					         to 350px in a 337px row and "By month" dropped to a second
					         line; this label was the cheapest 55px. */ ?>
					<span class="dccwl-fullguide-h"><?php esc_html_e( 'Credits', 'dcc-wildlife' ); ?></span>
					<span class="dccwl-fullguide-meta">
						<?php
						/* translators: %d: number of photographs. */
						echo esc_html( sprintf( _n( '%d photograph, and who took it', '%d photographs, and who took them', count( $rows ), 'dcc-wildlife' ), count( $rows ) ) );
						?>
					</span>
				</span>
			</summary>
			<div class="dccwl-fullguide-body">
				<?php
				/*
				 * Indicating modification (1.26.0). Every photograph here is
				 * cropped and resized into three renditions, which makes each
				 * one an adapted work. CC BY 4.0 and CC BY-SA 4.0 both
				 * require that modification be indicated, and until now
				 * nothing on the page said so. One sentence covers all of
				 * them, which is better than appending "(cropped)" to
				 * forty-four credit lines.
				 */
				?>
				<p class="dccwl-photo-credits-note"><?php esc_html_e( 'Every photograph here has been cropped and resized for this guide.', 'dcc-wildlife' ); ?></p>
				<ul class="dccwl-photo-credits-list">
					<?php foreach ( $rows as [ $name, $c ] ) : ?>
						<li><b><?php echo esc_html( $name ); ?></b> — <?php echo esc_html( $c[0] ); ?><?php if ( '' !== $c[1] ) : ?>, <?php echo esc_html( $c[1] ); ?><?php endif; ?><?php if ( '' !== $c[2] ) : ?> (<a href="<?php echo esc_url( $c[2] ); ?>" rel="noopener" aria-label="<?php
						/* translators: %s: a species name. The accessible name of a photo-credit source link. */
						echo esc_attr( sprintf( __( 'Source for the %s photograph', 'dcc-wildlife' ), $name ) );
					?>"><?php esc_html_e( 'source', 'dcc-wildlife' ); ?></a>)<?php endif; ?></li>
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
		<?php /* THE FOOTNOTE ROW (1.27.0). The prose guide and the photo credits
		         used to be two H2-headed sections stacked at the foot of the
		         page, which gave them the visual weight of destinations. They
		         are references. One row of small links, side by side, wrapping
		         on a narrow phone. The content behind them is unchanged and
		         still native <details> — what shrank is the entry point.
		         Third link: the month picker, which lost its chip in the
		         navigation bar this release and would otherwise be stranded.
		         It is hidden until canal.js wires it, because the panel it
		         opens only exists inside the hub app. */ ?>
		<div class="dccwl-footnotes">
		<details class="dccwl-fullguide">
			<summary class="dccwl-fullguide-summary" aria-label="<?php esc_attr_e( 'The whole field guide', 'dcc-wildlife' ); ?>">
				<?php /* A real affordance (1.18.0): chevron that turns on open, a label
				   that is the section's H2 (so Critters/Birds/Plants own a place in
				   the outline), and a meta line. Still a native <details>, still
				   server-rendered — this is the crawlable prose. */ ?>
				<span class="dccwl-fullguide-chev" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><path d="M5 7.5 10 12.5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
				<span class="dccwl-fullguide-text">
					<?php /* Short in the row, long to a screen reader (1.27.0). Three
					         full-length labels do not fit on one line at 393px, which is
					         the width this was measured at, and the ask was one row. The
					         meta line under it still says what the panel holds. */ ?>
					<span class="dccwl-fullguide-h"><?php esc_html_e( 'Field guide', 'dcc-wildlife' ); ?></span>
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
				<?php foreach ( Species::sections() as $slug => $label ) : ?>
					<?php
					// false: no dual membership in the PROSE. The alligator has
					// two tiles on purpose; it must not have two write-ups.
					$in_group = Species::section_members( $dataset, $slug, false );
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
		?>
		<button type="button" class="dccwl-footnote-link" data-dccwl-go="month" data-dccwl-monthlink hidden
			aria-label="<?php esc_attr_e( 'Browse the guide by month', 'dcc-wildlife' ); ?>">
			<?php esc_html_e( 'By month', 'dcc-wildlife' ); ?>
		</button>
		</div>
		<?php
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
			/*
			 * 1.29.0: real URLs, resolved per species, NOT a base the client
			 * sticks a filename onto. The old scheme built the srcset by
			 * replacing ".jpg" with "-600.jpg"; WordPress dedupes filenames on
			 * upload, so one pre-existing fern.jpg would have made ours
			 * fern-1.jpg and that species would have silently lost its srcset.
			 * photoBase was kept for a while so an older cached script could
			 * not break outright. It is now actively WRONG: since 1.30.0 the
			 * zip does not ship assets/photos at all, so the URL it advertised
			 * is a 404 on a fresh install. Nothing has composed with it since
			 * 1.29.0, and shipping a dead path in every page's config invites
			 * someone to use it. Removed.
			 */
			'months'     => Species::month_abbrevs(),
			'monthsFull' => Species::month_names(),
			// Toggle state is baked into the cached page, matching the
			// mu-plugin's behaviour; only the DAY COUNT is computed client-side.
			'countdown'  => self::countdown_possible(),
			'i18n'       => [
				/* translators: %s: month name, e.g. "August". */
				'headline'    => __( '%s on the canal', 'dcc-wildlife' ),
				/* translators: %d: number of species (2 or more). */
				/*
				 * 1.27.0: "%d species at their peak" is gone from the subline
				 * under the navigation. subSpot carries it now, which counts
				 * what is worth looking for without ranking it.
				 */
				/* translators: %d: number of species worth looking for. */
				/*
				 * 1.29.0: the month is IN the sentence now. Since 1.28.0 the
				 * category tabs are unfiltered, so this line sat above a guide
				 * showing 38 animals while saying "36 species to spot" — a
				 * guest who counts finds that wrong. Naming the month makes it
				 * a claim about the month, which is what it always measured,
				 * rather than a claim about the size of the guide.
				 */
				'subSpot'     => __( '%1$d at their best in %2$s', 'dcc-wildlife' ),
				/* translators: 1: month name, 2: species-count phrase. */
				/* monthSub wrapped the subline in "September: …". Since 1.29.0
				   subSpot names the month itself, so nothing reads this. */
				'peak'        => __( 'Peak season', 'dcc-wildlife' ),
				'peakShort'   => __( 'Peak', 'dcc-wildlife' ),
				// 1.19.0 data model: flag names for the tile marks and sheet
				// badges, the odds labels, the what-to-do heading.
				'flagNames'   => array_map( static fn( array $d ): string => $d[0], Species::flags() ),
				/*
				 * 1.27.0: the odds labels are no longer sent, so no tile and no
				 * sheet can show one. The owner's reason, and it is a good one:
				 * "You will see one" is a guarantee he cannot make, and he does
				 * not want to offer probabilities at all, so that nobody arrives
				 * with an expectation the canal has not agreed to.
				 *
				 * odds() and the per-species `odds` value stay — they are data,
				 * used for ranking — but nothing renders them. Do not reinstate
				 * this key: five labels would come back, not three. The one that
				 * carried real information rather than a probability was
				 * 'daytrip' ("A day trip away"), and the `place` field already
				 * says that in its own "Where to go" section.
				 */
				'safe'        => __( 'What to do', 'dcc-wildlife' ),
				'tellApart'   => __( 'Tell it apart', 'dcc-wildlife' ),
				'deckPrev'    => __( 'Previous species', 'dcc-wildlife' ),
				'deckNext'    => __( 'Next species', 'dcc-wildlife' ),
				/* translators: 1: first item shown, 2: last item shown, 3: total. */
				'deckPos'     => __( '%1$s–%2$s of %3$s', 'dcc-wildlife' ),
				/* translators: %s: what the visitor typed. */
				'searchNone'  => __( 'Nothing matches “%s”.', 'dcc-wildlife' ),
				/* translators: %d: number of matching species. */
				'searchCount' => __( '%d species match', 'dcc-wildlife' ),
				'searchOne'   => __( '1 species matches', 'dcc-wildlife' ),
				/* translators: %d: total number of species in this view. */
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

				/*
				 * The cd* strings were the season countdown's — cdLabel, cdDays,
				 * cdDay, cdNow, cdWhy, cdWhyNow, cdThrough, cdNext. The card was
				 * retired in 1.27.0 (see countdown_possible()) and they went with
				 * it. Nothing reads them; do not reinstate them alone.
				 */
				/* translators: %s: month name. Shown when no species in a section is likely that month. */
				'guideEmpty'  => __( 'Nothing in this group is likely in %s.', 'dcc-wildlife' ),
				/* translators: %s: month name. Peak Now (1.27.0) with nothing in it. */
				'peakNone'    => __( 'Nothing is at its peak in %s.', 'dcc-wildlife' ),
				'likeKey'     => __( 'Key', 'dcc-wildlife' ),
			],
		];

		wp_add_inline_script(
			'dcc-wildlife',
			'window.DCC_WL_CFG = ' . wp_json_encode( $config ) . ';',
			'before'
		);
	}
}
