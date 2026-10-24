<?php
/**
 * THE WILDLIFE GUIDE PAGE (1.43.0) — the long-form read, at its own URL.
 *
 * WHY THIS EXISTS, because it reverses a rule this file has carried since
 * 1.16.0 and the reversal is the owner's, not a session's.
 *
 * Through 1.42.0 every one of the 402 species descriptions was server-rendered
 * into /explore/ inside a native <details>. That was deliberate — it is the
 * crawlable content, and the rule beside it reads "if you ever find yourself
 * hiding it with CSS or `hidden`, stop". The cost was measured on live at
 * 1.41.0: 1.40 MB of HTML, 910 KB of it markup, and the prose was ~853 KB of
 * that. Rob's words were "/explore/ has so much lag, way more than any other
 * page on the website".
 *
 * Three options were put to him on 2026-10-19 (build the prose on demand, move
 * it to its own page, or leave a lightweight list behind) and he chose the
 * page. It is the only one of the three that removes the weight from /explore/
 * AND keeps every word crawlable — the on-demand option would have taken 402
 * descriptions out of anything a crawler reads, and the JSON-LD does not
 * replace them because it deliberately carries no `description`.
 *
 * SO THE 1.16.0 RULE IS NOT WEAKENED, IT MOVED. Nothing here is hidden, behind
 * a fold, lazy-loaded or fetched. Every description is in this page's HTML on
 * arrival, at a URL that can itself rank.
 *
 * WHAT THIS FILE DOES NOT DO:
 *
 * - It does not re-render the per-species markup. `Render::species_prose()` is
 *   the one copy and this calls it, because two slightly different renderings
 *   of 402 entries is duplicated content with a drift problem attached.
 * - It carries NO JSON-LD. The ItemList stays on /explore/ exactly as today
 *   (the Director's instruction), and emitting the same ItemList at a second
 *   URL would invite a search engine to choose a canonical between two pages
 *   making one claim. This page's value is the prose, which is already text.
 * - It writes nothing, on install, activation or upgrade.
 *
 * @package DCC_Wildlife
 */

namespace DCC_WL;

defined( 'ABSPATH' ) || exit;

class Guide_Page {

	/**
	 * Where "Back To Explore" points.
	 *
	 * A site-root-relative path, not a stored setting and not a guessed
	 * absolute URL: /explore/ is where this plugin's app lives on this site,
	 * the Director named it, and a path survives http/https and a domain
	 * change. Filterable for anyone who moves the page.
	 */
	public static function explore_url(): string {
		return (string) apply_filters( 'dcc_wl_explore_url', '/explore/' );
	}

	/**
	 * The guide page's own URL, used by /explore/'s "Guide" link and by the
	 * detail sheet's "Read In The Full Guide" link.
	 *
	 * The Director will create the page after install and plans /wildlife-guide/.
	 * Until it exists the link still resolves to a 404 rather than to nowhere,
	 * which is the honest failure: a link that silently does nothing is worse
	 * than one that lands on "not found". Filterable for the same reason.
	 */
	public static function url(): string {
		return (string) apply_filters( 'dcc_wl_guide_page_url', '/wildlife-guide/' );
	}

	/**
	 * Where the credits live now: the guide page's own credits panel.
	 *
	 * /explore/ and the detail sheet both link here rather than each
	 * carrying a copy. One rendering of a licence surface is also one place
	 * for it to be correct.
	 */
	public static function credits_url(): string {
		return self::url() . '#credits';
	}

	/**
	 * The id prefix every species row carries (1.46.0).
	 *
	 * The Director's brief names `#dccwl-fl-<key>` and 1.45.0 could not use
	 * it: the anchor on this page was the bare registry id, and a link to an
	 * id that does not exist lands at the top of the page looking like a
	 * dud. The rows carry the prefixed id now, so the link in /explore/'s
	 * sheet points here — ONE definition of the prefix, used by the renderer
	 * that writes the id and by the config that ships the link.
	 */
	public const ANCHOR_PREFIX = 'dccwl-fl-';

	/** The anchor for one species — the registry's own id, never invented. */
	public static function anchor( string $id ): string {
		return self::url() . '#' . self::ANCHOR_PREFIX . $id;
	}

	/**
	 * Which pill a species sits under: its browse sub-group, or Safety.
	 *
	 * The Safety group carries no `browse` value — it never needed one,
	 * because nothing browsed it — so it would otherwise fall out of the
	 * pill row entirely. The 21 species the guide marks "Take Care" get
	 * their own pill, exactly as the old jump list gave them their own
	 * heading.
	 */
	public static function pill_of( array $sp ): string {
		$browse = (string) ( $sp['browse'] ?? '' );
		if ( '' !== $browse ) {
			return $browse;
		}
		return 'safety' === (string) ( $sp['group'] ?? '' ) ? 'safety' : 'other';
	}

	/**
	 * THE ONE CHIP A ROW MAY CARRY — and since 1.46.1 "Keep Away" is NOT
	 * one of them.
	 *
	 * Rob's decision of 2026-10-23: a hazard gets a RED EDGE STRIPE down the
	 * row instead of a chip, and the stripe covers all 28 species
	 * `is_hazard()` flags rather than the 21 in the Safety group. 1.46.0
	 * followed the rule as the Director first wrote it, which left the
	 * alligator — the hazard on this canal — with no mark at all, and he
	 * saw it in the screenshot. Taking it out of the chip slot is what lets
	 * the cane toad keep "Lake County" while still being marked dangerous:
	 * the two facts are no longer competing for one place.
	 *
	 * So the chip is now: "Protected" (the official lists, below), then
	 * "Lake County" (a NEAR species). At most one, in that order.
	 *
	 * @return array{0:string,1:string}|null [ slug, label ]
	 */
	public static function chip_of( array $sp ): ?array {
		$id = (string) ( $sp['id'] ?? '' );
		if ( isset( self::PROTECTED[ $id ] ) ) {
			return [ 'protected', __( 'Protected', 'dcc-wildlife' ) ];
		}
		if ( 'NEAR' === Local::class_of( $id ) ) {
			return [ 'near', __( 'Lake County', 'dcc-wildlife' ) ];
		}
		return null;
	}

	/**
	 * WHAT "PROTECTED" MEANS, AND WHERE IT COMES FROM (1.46.1, Rob's pick).
	 *
	 * Through 1.46.0 the chip sat on six species "whose own safety text
	 * names federal or state protection" — which made the GUIDE'S OWN PROSE
	 * the authority for a legal claim. It is now the official list, and the
	 * source travels with it so the sheet can cite what it is asserting.
	 *
	 * Thirteen keys, each with the status that actually applies (twelve in
	 * 1.46.1; the red-cockaded woodpecker, federally Threatened since the
	 * 2024 downlisting and on the rule's federally-designated list, was the
	 * Director's own omission, added 1.46.2):
	 *
	 *   'federal' — listed Threatened under the federal Endangered Species
	 *               Act. Five: the indigo snake, the sand skink, the scrub
	 *               jay, the wood stork and the manatee (which is also
	 *               covered by the Marine Mammal Protection Act and the
	 *               Florida Manatee Sanctuary Act).
	 *   'state'   — State-designated Threatened on Florida's list. Six.
	 *   'eagle'   — the bald eagle, which came OFF that list in 2007 and is
	 *               protected by the federal Bald and Golden Eagle
	 *               Protection Act and FWC rule 68A-16.002 instead. Its own
	 *               status rather than a footnote to somebody else's.
	 *
	 * THE ALLIGATOR IS DELIBERATELY ABSENT. It appears on the federal list
	 * only "due to similarity of appearance" to the American crocodile — a
	 * listing about enforcement, not about the alligator's own standing —
	 * so a Protected chip would mislead. Its Keep Away stripe is the mark
	 * that matters on a canal. THE CERAUNUS BLUE IS ABSENT FOR THE SAME
	 * REASON (1.46.2): the rule carries it only as T(S/A), similarity of
	 * appearance to the Miami blue.
	 *
	 * THE MANATEE IS ON NO LINE OF THIS RULE. The Director read both the
	 * April 2025 and June 2026 texts; its line names only what protects it
	 * (the Endangered Species Act, the Marine Mammal Protection Act, the
	 * Florida Manatee Sanctuary Act) and carries no rule link.
	 *
	 * NOTHING HERE IS DERIVED. The `protected` FLAG in the registry is close
	 * to this set and not equal to it; a badge that over-claims teaches a
	 * guest to ignore badges, which is the 1.33.0 kestrel lesson — and the
	 * kestrel is in this list for exactly that reason, with a line of its
	 * own saying which kestrel.
	 */
	public const PROTECTED = [
		'indigosnake'    => 'federal',
		'sandskink'      => 'federal',
		'scrubjay'       => 'federal',
		'redcockaded'    => 'federal',
		'woodstork'      => 'federal',
		'manatee'        => 'federal',
		'gophertortoise' => 'state',
		'sandhill'       => 'state',
		'blackskimmer'   => 'state',
		'littleblue'     => 'state',
		'tricolored'     => 'state',
		'kestrel'        => 'state',
		'eagle'          => 'eagle',
	];

	/**
	 * The list the thirteen come from, stored rather than written into a
	 * sentence: a citation is data, and this one has a date that will move.
	 */
	public const PROTECTED_SOURCE = [
		'name'      => 'Florida\'s Endangered and Threatened Species List',
		'rule'      => 'Fla. Admin. Code R. 68A-27.003',
		'effective' => '2026-06-10',
		'url'       => 'https://www.flrules.org/gateway/RuleNo.asp?id=68A-27.003',
	];

	/** Kept as the old name so nothing that read it breaks; same thirteen. */
	public const PROTECTED_KEYS = [
		'indigosnake',
		'sandskink',
		'scrubjay',
		'redcockaded',
		'woodstork',
		'manatee',
		'gophertortoise',
		'sandhill',
		'blackskimmer',
		'littleblue',
		'tricolored',
		'kestrel',
		'eagle',
	];

	/**
	 * The one sourced line a protected species carries under Take Care.
	 *
	 * WORDED PER STATUS, because the three are not the same claim and a
	 * guest who looks one up must find the guide supported rather than
	 * contradicted (the 1.33.0 scrub-jay rule, applied to law instead of
	 * ecology).
	 */
	public static function protected_line( string $id ): string {
		$status = self::PROTECTED[ $id ] ?? '';
		if ( '' === $status ) {
			return '';
		}
		$when = __( 'June 2026', 'dcc-wildlife' );

		if ( 'kestrel' === $id ) {
			/*
			 * THE KESTREL TRUTH, which the Director asked for by name. Only
			 * the RESIDENT subspecies is listed; the birds wintering here
			 * from the north are not, and they are the ones most guests see.
			 */
			return sprintf(
				/* translators: %s: the month and year the list took effect. */
				__( 'The Southeastern American kestrel that nests here is State-designated Threatened (Florida\'s Endangered and Threatened Species List, %s); winter visitors from the north are not.', 'dcc-wildlife' ),
				$when
			);
		}
		if ( 'eagle' === $id ) {
			return __( 'Not on Florida\'s Threatened list since 2007, but protected by the federal Bald and Golden Eagle Protection Act and FWC rule 68A-16.002.', 'dcc-wildlife' );
		}
		if ( 'manatee' === $id ) {
			/*
			 * NOT ON 68A-27.003 AT ALL (the Director read the rule, 1.46.2): its
			 * federal mammal list runs from the Anastasia Island beach mouse to
			 * the Florida bonneted bat with no manatee. 1.46.1 cited the list
			 * anyway. Like the eagle, its own status — and no rule link.
			 */
			return __( 'Federally Threatened under the Endangered Species Act, and protected by the Marine Mammal Protection Act and the Florida Manatee Sanctuary Act.', 'dcc-wildlife' );
		}
		if ( 'federal' === $status ) {
			return sprintf(
				/* translators: %s: the month and year the list took effect. */
				__( 'Federally Threatened (Florida\'s Endangered and Threatened Species List, %s).', 'dcc-wildlife' ),
				$when
			);
		}
		return sprintf(
			/* translators: %s: the month and year the list took effect. */
			__( 'State-designated Threatened (Florida\'s Endangered and Threatened Species List, %s).', 'dcc-wildlife' ),
			$when
		);
	}

	/** Whether a protected species' line links the rule: all but the manatee, which the rule does not name. */
	public static function cites_rule( string $id ): bool {
		return isset( self::PROTECTED[ $id ] ) && 'manatee' !== $id;
	}

	/** How many cards "Most Recorded Here" shows; the subtitle says "four". */
	public const SPOTLIGHT_COUNT = 4;

	/**
	 * "MOST RECORDED HERE" (1.47.0, Rob's pick C): the species with the most
	 * iNaturalist records within the pull's radius, COMPUTED from the `n`
	 * column of the local-first table, never named here.
	 *
	 * Only HERE species with a numeric count are ranked — the manatee's
	 * `n` is "owner" (the hosts' own sightings, not an iNaturalist count),
	 * and NEAR / WIDER species have none. Only species with a photograph,
	 * because each one is a photo card. Ties break on the registry key so
	 * the four are the same on every render, which a cached page needs.
	 *
	 * @param array<int,array<string,mixed>> $rows The dataset.
	 * @return array<int,array<string,mixed>>      The top `$k`, most first.
	 */
	public static function most_recorded( array $rows, int $k = self::SPOTLIGHT_COUNT ): array {
		$ranked = [];
		foreach ( $rows as $sp ) {
			$id  = (string) ( $sp['id'] ?? '' );
			$loc = Local::row( $id );
			if ( ! $loc || 'HERE' !== ( $loc['class'] ?? '' ) ) {
				continue;
			}
			$n = (string) ( $loc['n'] ?? '' );
			if ( '' === $n || ! ctype_digit( $n ) ) {
				continue;
			}
			$src = is_array( $sp['src'] ?? null ) ? $sp['src'] : [];
			if ( '' === (string) ( $src['mid'] ?? ( $src['full'] ?? '' ) ) ) {
				continue;
			}
			$ranked[] = [ (int) $n, $id, $sp ];
		}
		usort(
			$ranked,
			static fn( array $a, array $b ): int => ( $b[0] <=> $a[0] ) ?: strcmp( $a[1], $b[1] )
		);
		return array_map( static fn( array $r ): array => $r[2], array_slice( $ranked, 0, max( 0, $k ) ) );
	}

	/**
	 * The "as of" month and year, FROM A DATE IN THE DATA.
	 *
	 * The cards carry no numbers because a count is a snapshot that goes
	 * quietly stale (the Director's note); the subtitle carries the date
	 * instead. It is the PULL date, `Local::PULLED`: each row's own `date`
	 * is the newest OBSERVATION of that species (the CSV's `latest_date`),
	 * not when the counts were taken. Never a literal.
	 */
	public static function as_of( string $ymd ): string {
		$ts = strtotime( $ymd . ' 12:00:00' );
		return false === $ts ? '' : (string) date_i18n( 'F Y', $ts );
	}

	/**
	 * The spotlight itself: a centred title, a subtitle naming the source
	 * and the date, and four photo cards. Each card is a REAL LINK to the
	 * species' anchor — it works with no script, and guide.js upgrades it
	 * to open the entry in this pane.
	 *
	 * @param array<int,array<string,mixed>> $spot The four.
	 */
	private static function spotlight( array $spot ): void {
		?>
		<section class="dccwl-gp-spot" data-dccwl-gp-spot>
			<h2 class="dccwl-gp-spot-h" id="dccwl-gp-spot-h"><?php esc_html_e( 'Most Recorded Here', 'dcc-wildlife' ); ?></h2>
			<p class="dccwl-gp-spot-sub" data-dccwl-gp-spot-asof>
				<?php
				printf(
					/* translators: %s: a month and year, e.g. "October 2026". */
					esc_html__( 'The four species recorded most on this canal on iNaturalist, as of %s', 'dcc-wildlife' ),
					esc_html( self::as_of( Local::PULLED ) )
				);
				?>
			</p>
			<ul class="dccwl-gp-spot-grid">
				<?php foreach ( $spot as $sp ) : ?>
					<?php
					$id    = (string) $sp['id'];
					$src   = is_array( $sp['src'] ?? null ) ? $sp['src'] : [];
					$photo = (string) ( $src['mid'] ?? ( $src['full'] ?? '' ) );
					?>
					<li>
						<a class="dccwl-gp-spot-card" href="#<?php echo esc_attr( self::ANCHOR_PREFIX . $id ); ?>"
							data-dccwl-gp-spot-key="<?php echo esc_attr( $id ); ?>">
							<img class="dccwl-gp-spot-img" src="<?php echo esc_url( $photo ); ?>" alt=""
								loading="lazy" decoding="async" />
							<span class="dccwl-gp-spot-name"><?php echo esc_html( (string) $sp['name'] ); ?><?php if ( Species::is_hazard( $sp ) ) : ?><span aria-hidden="true"> · <?php esc_html_e( 'Keep Away', 'dcc-wildlife' ); ?></span><span class="dccwl-sr"><?php esc_html_e( ', Keep Away', 'dcc-wildlife' ); ?></span><?php endif; ?></span>
						</a>
					</li>
				<?php endforeach; ?>
			</ul>
		</section>
		<?php
	}

	/** `[dcc_wildlife_guide]` */
	public static function shortcode( array $atts = [] ): string {
		ob_start();
		self::render( (array) $atts );
		return (string) ob_get_clean();
	}

	/**
	 * THE WHOLE PAGE (rebuilt in 1.46.0 as an app-style list).
	 *
	 * Rob picked this from three mockups. What it replaces: 402 descriptions
	 * stacked one after another, about 359,000px tall at 390px, 6,337
	 * elements, three photographs on the whole page. Finding the alligator
	 * meant a very long scroll.
	 *
	 * WHAT MAKES IT BOTH CRAWLABLE AND FAST, which is the hard part and was
	 * his explicit requirement ("keep every word for search engines AND be
	 * fast"):
	 *
	 *   - EVERY ONE OF THE 402 ENTRIES IS STILL SERVER-RENDERED, in full, in
	 *     this page's HTML, each with its own `#dccwl-fl-<key>` anchor. The
	 *     page's HTML stays large by design and that is reported, not hidden.
	 *   - Each entry sits inside a native `<details>` whose `<summary>` IS
	 *     the row. That is the 1.16.0 rule holding: a visitor can open any
	 *     entry with no JavaScript at all, so nothing here is hidden text.
	 *     With JavaScript the row opens the sheet instead and the fold never
	 *     runs — one copy of the content, two ways to reach it.
	 *   - Speed comes from `content-visibility: auto` with a
	 *     `contain-intrinsic-size` on each row (guide.css), so a browser
	 *     lays out only what is on screen. A browser without it draws
	 *     everything, exactly as today.
	 *
	 * NOTHING ON THIS PAGE IS MONTH-DEPENDENT OR TIME-SENSITIVE, so all of
	 * it is cache-safe — the oldest rule in this plugin, and the reason the
	 * pill counts can be server-rendered while /explore/'s cannot.
	 *
	 * @param array<string,mixed> $args
	 */
	public static function render( array $args = [] ): void {
		$dataset = Species::dataset();
		if ( ! $dataset ) {
			return;
		}

		wp_enqueue_style( 'dcc-wildlife-guide' );
		wp_enqueue_script( 'dcc-wildlife-guide' );
		self::print_config( $dataset );

		/*
		 * ONE ORDER FOR THE WHOLE LIST, and it is the deck's: each browse
		 * sub-group is a contiguous run, in the order the pills show them,
		 * with the Safety group last. So "show only Birds" hides rows either
		 * side of a run rather than scattering what is left.
		 */
		$rows = Species::browse_order( $dataset );

		$pills = self::pill_counts( $rows );
		$tally = Local::tally( array_map( static fn( array $sp ): string => (string) $sp['id'], $rows ) );
		?>
		<div class="dccwl-guidepage dccwl-gp <?php echo esc_attr( Render::app_classes() ); ?>" data-dccwl-gp>

			<?php /* The way back, at the head as well as the foot. The page is
			         402 rows long: a guest who opens it from /explore/ and
			         changes their mind must not have to scroll to the bottom
			         or use the browser's own button to return. */ ?>
			<p class="dccwl-guidepage-back">
				<a class="dccwl-guidepage-backlink" href="<?php echo esc_url( self::explore_url() ); ?>">
					<?php esc_html_e( 'Back To Explore', 'dcc-wildlife' ); ?>
				</a>
			</p>

			<h1 class="dccwl-gp-title"><?php esc_html_e( 'Wildlife Guide', 'dcc-wildlife' ); ?></h1>
			<p class="dccwl-gp-sub">
				<?php
				printf(
					/* translators: %d: how many species the guide holds. */
					esc_html__( '%d Species On The Dora Canal And The Harris Chain', 'dcc-wildlife' ),
					count( $rows )
				);
				?>
			</p>

			<?php
			/*
			 * THE PINNED CONTROLS, in the Director's Option 1 order: the
			 * two-way switch on its own row, the search under it, the group
			 * pills under that. Sticky as one block, so a guest scrolling
			 * 402 rows never has to scroll back up to change what they are
			 * looking at.
			 *
			 * The switch is `.dccwl-tabs` + `.dccwl-tab` — THE SAME MARKUP
			 * AND THE SAME RULES as Water's Map | Now | Fishing, which is
			 * what he asked for ("in the exact style of"). Two controls that
			 * look identical must be identical, so this one borrows the
			 * classes rather than copying their declarations.
			 */
			?>
			<div class="dccwl-gp-top" data-dccwl-gp-top>
				<div class="dccwl-tabs dccwl-gp-switch" role="group"
					aria-label="<?php esc_attr_e( 'Which species to show', 'dcc-wildlife' ); ?>">
					<button type="button" class="dccwl-tab" data-dccwl-gp-scope="here" aria-pressed="true">
						<?php esc_html_e( 'Seen Here', 'dcc-wildlife' ); ?>
					</button>
					<button type="button" class="dccwl-tab" data-dccwl-gp-scope="wider" aria-pressed="false">
						<?php esc_html_e( 'Wider Florida', 'dcc-wildlife' ); ?>
					</button>
				</div>

				<div class="dccwl-search-field dccwl-gp-search">
					<span class="dccwl-search-icon" aria-hidden="true">
						<svg viewBox="0 0 20 20" width="20" height="20" focusable="false"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
					</span>
					<label class="dccwl-sr" for="dccwl-gp-search"><?php esc_html_e( 'Search species by name', 'dcc-wildlife' ); ?></label>
					<?php
					/*
					 * The placeholder states the scope AND its count, and it
					 * is rewritten by the switch. Server-rendered with the
					 * "Seen Here" wording because that is the view the page
					 * opens on — nothing here needs to know the date, so a
					 * cached page cannot be wrong about it.
					 */
					?>
					<input type="search" id="dccwl-gp-search" class="dccwl-search-input dccwl-gp-searchinput"
						data-dccwl-gp-search
						autocomplete="off" autocorrect="off" spellcheck="false"
						placeholder="<?php echo esc_attr( sprintf( /* translators: %d: number of species. */ __( 'Search %d Species Seen Here', 'dcc-wildlife' ), $tally['here'] ) ); ?>" />
					<button type="button" class="dccwl-search-clear dccwl-gp-clear" data-dccwl-gp-clear hidden
						aria-label="<?php esc_attr_e( 'Clear the search', 'dcc-wildlife' ); ?>">
						<svg viewBox="0 0 20 20" width="20" height="20" focusable="false" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
					</button>
				</div>

				<div class="dccwl-gp-pills" role="group" aria-label="<?php esc_attr_e( 'Groups', 'dcc-wildlife' ); ?>" data-dccwl-gp-pills>
					<button type="button" class="dccwl-chip dccwl-gp-pill" data-dccwl-gp-group="all" aria-pressed="true">
						<?php esc_html_e( 'All', 'dcc-wildlife' ); ?>
						<span class="dccwl-gp-count" data-dccwl-gp-count="all"><?php echo esc_html( (string) $tally['here'] ); ?></span>
					</button>
					<?php foreach ( $pills as $slug => $pill ) : ?>
						<button type="button" class="dccwl-chip dccwl-gp-pill" data-dccwl-gp-group="<?php echo esc_attr( $slug ); ?>" aria-pressed="false">
							<?php echo esc_html( $pill['label'] ); ?>
							<span class="dccwl-gp-count" data-dccwl-gp-count="<?php echo esc_attr( $slug ); ?>"><?php echo esc_html( (string) $pill['here'] ); ?></span>
						</button>
					<?php endforeach; ?>
				</div>
			</div>

			<?php /* Filled by the search; empty and hidden in the HTML, so a
			         cached page carries no result count of its own. */ ?>
			<p class="dccwl-gp-status" data-dccwl-gp-status role="status" aria-live="polite" hidden></p>

			<?php
			$spot = self::most_recorded( $rows );
			$spot = self::SPOTLIGHT_COUNT === count( $spot ) ? $spot : [];
			?>
			<div class="dccwl-gp-split">
				<?php
				/*
				 * THE DESKTOP PANE (picture 3), and since 1.47.0 it is never
				 * empty on a wide screen: before a species is opened it holds
				 * "Most Recorded Here" (Rob's pick, option C), SERVER-RENDERED
				 * so the page caches whole. A row or a card replaces it with
				 * that species' entry, cloned from the row as before.
				 *
				 * IT COMES BEFORE THE LIST IN THE SOURCE, and the grid puts it
				 * back on the right. Two reasons, both keyboard: the four
				 * cards are reached after the pinned controls rather than
				 * after 395 rows, and Tab from the LAST row leaves the list
				 * for "Back To Explore" and the credits, which is what the
				 * Director's brief asks of the scroll box. Below 900px the
				 * pane is not displayed at all, so the order changes nothing
				 * there.
				 *
				 * With no spotlight (a data import that left fewer than four
				 * rankable species) the pane is `hidden` exactly as 1.46.2
				 * shipped it, and the list is not boxed.
				 */
				?>
				<aside class="dccwl-gp-pane" data-dccwl-gp-pane<?php echo $spot ? '' : ' hidden'; ?>
					data-dccwl-gp-pane-label="<?php esc_attr_e( 'The species you chose', 'dcc-wildlife' ); ?>"
					<?php if ( $spot ) : ?>aria-labelledby="dccwl-gp-spot-h"<?php else : ?>aria-label="<?php esc_attr_e( 'The species you chose', 'dcc-wildlife' ); ?>"<?php endif; ?>><?php
					if ( $spot ) {
						self::spotlight( $spot );
					}
				?></aside>

				<ol class="dccwl-gp-list<?php echo $spot ? ' dccwl-gp-list-split' : ''; ?>" data-dccwl-gp-list>
					<?php foreach ( $rows as $sp ) { self::row( $sp ); } ?>
				</ol>
			</div>

			<p class="dccwl-gp-empty" data-dccwl-gp-empty hidden></p>

			<p class="dccwl-guidepage-back dccwl-guidepage-back-foot">
				<a class="dccwl-guidepage-backlink" href="<?php echo esc_url( self::explore_url() ); ?>">
					<?php esc_html_e( 'Back To Explore', 'dcc-wildlife' ); ?>
				</a>
			</p>

			<?php /* The credits are a LICENCE SURFACE and they follow the
			         photographs wherever they go. Four carry a real CC BY
			         obligation plus the modification notice. Printed by
			         Render so there is one copy. */ ?>
			<?php Render::photo_credits_for_guide_page( $dataset ); ?>

			<?php
			/*
			 * The species JSON-LD (1.45.0, item 3): this is the canonical
			 * page for these entities, so this is where the machine-readable
			 * copy lives. Same `show_jsonld` setting, same once-per-page
			 * guard in Render.
			 */
			if ( 1 === (int) Guide_Data::all()['show_jsonld'] ) {
				Render::render_species_jsonld();
			}
			?>
		</div>
		<?php
	}

	/**
	 * One row: the summary a guest reads, and the entry a crawler reads.
	 *
	 * The `data-` attributes are what the search and the two filters work
	 * from, so none of them is derived in the browser: the scope comes from
	 * the local-first pull, the pill from the registry, and the name and
	 * scientific name are the same strings the row prints. A client-side
	 * re-derivation of any of them is a second definition free to drift.
	 *
	 * @param array<string,mixed> $sp
	 */
	private static function row( array $sp ): void {
		$id     = (string) $sp['id'];
		$chip   = self::chip_of( $sp );
		$local  = Local::row( $id );
		/*
		 * 1.46.1: the hazard mark is a STRIPE on the row, not a chip, and it
		 * follows `is_hazard()` — the one definition (the Safety group, plus
		 * anything flagged `danger` wherever it is filed). All 28.
		 */
		$hazard = Species::is_hazard( $sp );
		$src   = is_array( $sp['src'] ?? null ) ? $sp['src'] : [];
		$thumb = (string) ( $src['thumb'] ?? '' );
		/*
		 * The sheet's hero is the 600px rendition, never the original: a
		 * 1100px photograph to fill a phone-width sheet is bytes nobody
		 * sees. The CREDIT rides with it, because a sheet showing a
		 * photograph at size must show its credit (1.24.0) — and the entry
		 * below does not carry one, so this is where it comes from.
		 */
		$photo  = (string) ( $src['mid'] ?? ( $src['full'] ?? '' ) );
		/*
		 * `Species::photo_credit_line()`, NOT the dataset's `credit` field.
		 *
		 * The dataset sends `credit` only where it DIFFERS from the default
		 * Adobe Stock line — transport economy for the wire, documented as
		 * such in 1.24.0 — so reading it here would leave most species with
		 * no credit at all under a photograph shown at full size. That is a
		 * licence breach rather than a missing nicety, and it is exactly
		 * the mistake 1.24.0 warns about: the sheet is where the photograph
		 * is displayed at size, so the sheet needs the COMPLETE line, which
		 * this function always returns.
		 */
		$credit = Species::photo_credit_line( $id );
		?>
		<?php
		/*
		 * THE DEFAULT VIEW IS SERVER-RENDERED (1.46.1, speed).
		 *
		 * The page opens on "Seen Here", so the seven Wider Florida rows
		 * ship with `hidden` already on them. Nothing about which view is
		 * the default depends on the date or the visitor, so this is
		 * cache-safe — and it means guide.js has NO DOM WRITES to make on
		 * load for the view every guest arrives at. 1.46.0's init set
		 * `.hidden` on all 402 rows (395 of them to the value they already
		 * had) and that was most of a 479 ms task on a 4x-throttled CPU.
		 */
		$seen = Local::seen_here( $id );
		?>
		<li class="dccwl-gp-item<?php echo $hazard ? ' dccwl-gp-item-hazard' : ''; ?>" id="<?php echo esc_attr( self::ANCHOR_PREFIX . $id ); ?>"
			<?php echo $seen ? '' : 'hidden'; ?>
			<?php echo $hazard ? 'data-hazard="1"' : ''; ?>
			data-dccwl-gp-item
			data-key="<?php echo esc_attr( $id ); ?>"
			data-group="<?php echo esc_attr( self::pill_of( $sp ) ); ?>"
			data-scope="<?php echo esc_attr( $seen ? 'here' : 'wider' ); ?>"
			data-name="<?php echo esc_attr( (string) $sp['name'] ); ?>"
			data-sci="<?php echo esc_attr( (string) $sp['sci'] ); ?>"
			<?php if ( '' !== $photo ) : ?> data-photo="<?php echo esc_url( $photo ); ?>"<?php endif; ?>
			<?php if ( '' !== $credit ) : ?> data-credit="<?php echo esc_attr( $credit ); ?>"<?php endif; ?>
			<?php if ( '' !== (string) ( $sp['creditUrl'] ?? '' ) ) : ?> data-credit-url="<?php echo esc_url( (string) $sp['creditUrl'] ); ?>"<?php endif; ?>>
			<details class="dccwl-gp-details" data-dccwl-gp-details>
				<summary class="dccwl-gp-row">
					<?php if ( '' !== $thumb ) : ?>
						<?php /* 56px, lazy, and the existing -320 rendition — no new
						         image is generated for this page. `alt` is empty
						         because the name is right beside it: a screen
						         reader reading both would say the species twice. */ ?>
						<img class="dccwl-gp-thumb" src="<?php echo esc_url( $thumb ); ?>"
							width="56" height="56" loading="lazy" decoding="async" alt="" />
					<?php else : ?>
						<span class="dccwl-gp-thumb dccwl-gp-thumb-none" aria-hidden="true"></span>
					<?php endif; ?>
					<?php
					/*
					 * NO TEXT WRAPPER AND NO CHEVRON ELEMENT (1.46.1, speed).
					 * The summary is a grid now — thumb | name / where | arrow
					 * — so the name and the where-line are laid out as its own
					 * children, and the chevron is the summary's ::after. Two
					 * elements fewer per row is 804 fewer nodes for the parser
					 * and the style engine to visit on a page whose first
					 * paint is bounded by exactly that work.
					 */
					?>
						<span class="dccwl-gp-name">
							<?php echo esc_html( (string) $sp['name'] ); ?>
							<?php if ( $hazard ) : ?>
								<?php
								/*
								 * THE STRIPE IS SILENT, SO THE NAME SAYS IT.
								 *
								 * A coloured edge is nothing to a screen
								 * reader, so the row's accessible name gains
								 * ", Keep Away" — the Director's own wording.
								 * It is the FIRST thing after the name rather
								 * than the last, because a guest listening to
								 * a list of 402 should hear the warning with
								 * the species, not after everything else
								 * about it.
								 */
								?>
								<span class="dccwl-sr"><?php echo esc_html( __( ', Keep Away', 'dcc-wildlife' ) ); ?></span>
							<?php endif; ?>
							<?php if ( $chip ) : ?>
								<span class="dccwl-gp-chip dccwl-gp-chip-<?php echo esc_attr( $chip[0] ); ?>"><?php echo esc_html( $chip[1] ); ?></span>
							<?php endif; ?>
						</span>
						<?php if ( '' !== (string) $sp['where'] ) : ?>
							<span class="dccwl-gp-where"><?php echo esc_html( (string) $sp['where'] ); ?></span>
						<?php endif; ?>
				</summary>
				<div class="dccwl-gp-entry" data-dccwl-gp-entry>
					<?php if ( $hazard ) : ?>
						<?php
						/*
						 * "Keep Away" IN THE SHEET TOO (1.46.1). Rendered
						 * into the ENTRY rather than built by the script, so
						 * one piece of markup serves all three readers: the
						 * sheet (which clones this), the no-JavaScript fold,
						 * and a crawler. The entry's own "Take Care" line
						 * below still names the flags — danger, invasive,
						 * nuisance — which is a different and longer answer.
						 */
						?>
						<p class="dccwl-gp-keepaway" data-k="keepaway"><?php esc_html_e( 'Keep Away', 'dcc-wildlife' ); ?></p>
					<?php endif; ?>
					<?php Render::species_prose( $sp, false ); ?>
					<?php self::protected_note( $id ); ?>
					<?php self::local_line( $id, $local ); ?>
				</div>
			</details>
		</li>
		<?php
	}

	/**
	 * The sourced status line, under the entry's own Take Care (1.46.1).
	 *
	 * It cites the list and its date, and links to the rule — because the
	 * chip above it makes a LEGAL claim about a species, and a claim a guest
	 * cannot check is the kind this module exists not to make. Printed only
	 * for the thirteen; every other species says nothing, which is what the
	 * absence of a chip already says. The manatee's line links nothing: it
	 * is not on the rule (see PROTECTED), and a link would say it was.
	 */
	private static function protected_note( string $id ): void {
		$line = self::protected_line( $id );
		if ( '' === $line ) {
			return;
		}
		?>
		<p class="dccwl-fg-line dccwl-gp-protected" data-k="protected">
			<span class="dccwl-fg-k"><?php esc_html_e( 'Protected', 'dcc-wildlife' ); ?></span>
			<?php echo esc_html( $line ); ?>
			<?php if ( self::cites_rule( $id ) ) : ?>
			<a class="dccwl-gp-locallink" href="<?php echo esc_url( (string) self::PROTECTED_SOURCE['url'] ); ?>"
				rel="noopener nofollow" target="_blank"><?php echo esc_html( (string) self::PROTECTED_SOURCE['rule'] ); ?></a>
			<?php endif; ?>
		</p>
		<?php
	}

	/**
	 * WHERE THIS SPECIES HAS ACTUALLY BEEN RECORDED (1.46.0, Part C).
	 *
	 * One line, and it is a CITATION rather than a claim of our own: the
	 * link goes to the observation itself, so a guest can check it. Three
	 * cases, and the first is the one that matters most —
	 *
	 *   - the manatee is HERE on the OWNERS' own sightings. Rob, Erica and
	 *     Rick have watched them in the canal and on the Chain. iNaturalist
	 *     hides manatee coordinates, so its records support them but cannot
	 *     stand on their own, and crediting this to iNaturalist would put
	 *     somebody else's name on Rob's sighting.
	 *   - HERE or NEAR with an observation: the link, worded for which.
	 *   - WIDER, or a species the pull could not place: NOTHING. "No record
	 *     within 40 km" is not a statement a guide should make about an
	 *     animal — iNaturalist is presence-only and this area is
	 *     undersampled — and silence is what this module does with what it
	 *     does not know.
	 *
	 * @param array{class:string,n:string,date:string,url:string}|null $local
	 */
	private static function local_line( string $id, ?array $local ): void {
		if ( ! $local || 'WIDER' === $local['class'] ) {
			return;
		}
		if ( 'owner' === $local['n'] ) {
			?>
			<p class="dccwl-gp-local" data-k="local">
				<span class="dccwl-fg-k"><?php esc_html_e( 'Seen Here', 'dcc-wildlife' ); ?></span>
				<?php esc_html_e( 'By your hosts, in the canal and on the Chain.', 'dcc-wildlife' ); ?>
			</p>
			<?php
			return;
		}
		if ( '' === $local['url'] ) {
			return;
		}
		$label = 'NEAR' === $local['class']
			? __( 'Recorded In Lake County', 'dcc-wildlife' )
			: __( 'Recorded Near Here', 'dcc-wildlife' );
		?>
		<p class="dccwl-gp-local" data-k="local">
			<span class="dccwl-fg-k"><?php echo esc_html( $label ); ?></span>
			<a class="dccwl-gp-locallink" href="<?php echo esc_url( $local['url'] ); ?>"
				rel="noopener nofollow" target="_blank">
				<?php esc_html_e( 'iNaturalist', 'dcc-wildlife' ); ?>
				<span class="dccwl-gp-localarrow" aria-hidden="true">&#8594;</span>
			</a>
		</p>
		<?php
	}

	/**
	 * The pill row: every group that actually has rows, with both counts.
	 *
	 * BUILT FROM WHAT IS RENDERED, never from the group table — the 1.38.1
	 * rule that a count beside a category is a promise. A pill for a group
	 * with nothing in it would be a control that shows an empty list.
	 *
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<string,array{label:string,here:int,wider:int}>
	 */
	private static function pill_counts( array $rows ): array {
		$labels = Species::browse_groups();
		$labels['safety'] = Species::sections()['safety'] ?? __( 'Safety', 'dcc-wildlife' );

		$out = [];
		foreach ( $rows as $sp ) {
			$slug = self::pill_of( $sp );
			if ( ! isset( $labels[ $slug ] ) ) {
				continue;
			}
			if ( ! isset( $out[ $slug ] ) ) {
				$out[ $slug ] = [ 'label' => $labels[ $slug ], 'here' => 0, 'wider' => 0 ];
			}
			$out[ $slug ][ Local::seen_here( (string) $sp['id'] ) ? 'here' : 'wider' ] += 1;
		}

		// The group table's own order, not first-seen order.
		$ordered = [];
		foreach ( $labels as $slug => $_label ) {
			if ( isset( $out[ $slug ] ) ) {
				$ordered[ $slug ] = $out[ $slug ];
			}
		}
		return $ordered;
	}

	/**
	 * The strings and counts guide.js needs, printed once.
	 *
	 * SMALL ON PURPOSE: no species data rides here. Everything the script
	 * filters on is already an attribute on the row it filters, which is
	 * both less to download and impossible to get out of step with what is
	 * on screen.
	 *
	 * @param array<int,array<string,mixed>> $dataset
	 */
	private static function print_config( array $dataset ): void {
		$ids   = array_map( static fn( array $sp ): string => (string) $sp['id'], $dataset );
		$tally = Local::tally( $ids );
		wp_add_inline_script(
			'dcc-wildlife-guide',
			'window.DCC_WL_GUIDE = ' . wp_json_encode(
				[
					'appClasses' => Render::app_classes(),
					'anchor'     => self::ANCHOR_PREFIX,
					'counts'     => $tally,
					'i18n'       => [
						/* translators: %d: number of species. */
						'searchHere'  => __( 'Search %d Species Seen Here', 'dcc-wildlife' ),
						/* translators: %d: number of species. */
						'searchWider' => __( 'Search All %d Species', 'dcc-wildlife' ),
						/* translators: %s: what the visitor typed. */
						'none'        => __( 'Nothing matches “%s”.', 'dcc-wildlife' ),
						/* translators: %d: number of matching species. */
						'count'       => __( '%d species match', 'dcc-wildlife' ),
						'countOne'    => __( '1 species matches', 'dcc-wildlife' ),
						'close'       => __( 'Close', 'dcc-wildlife' ),
						'closeAll'    => __( 'Close', 'dcc-wildlife' ),
						'credit'      => __( 'Photo Credits', 'dcc-wildlife' ),
					],
					'creditsUrl' => self::credits_url(),
				]
			) . ';',
			'before'
		);
	}
}
