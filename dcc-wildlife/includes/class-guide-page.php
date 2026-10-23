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
	 * THE ONE CHIP A ROW MAY CARRY, by the Director's exact rules.
	 *
	 * "Keep Away": the 21 species in the Safety GROUP. Not `is_hazard()`,
	 * which also returns the alligator, the cane toad, the Cuban treefrog
	 * and the two flagged plants — those are animals and plants that happen
	 * to be dangerous, and they carry their warning in their own entry.
	 *
	 * "Protected": exactly six keys, listed here and NOWHERE DERIVED. The
	 * `protected` flag is close to this set but not equal to it, and the
	 * brief is explicit — "never infer any other status". A badge that
	 * over-claims teaches a guest to ignore badges (the 1.33.0 kestrel
	 * lesson), and this one names federal and state law.
	 *
	 * "Lake County": a NEAR species, from the local-first pull.
	 *
	 * AT MOST ONE, in that order. A safety species that is also NEAR — the
	 * diamondback is both — shows "Keep Away", because the ranking is what
	 * the guest needs first, not what is most interesting.
	 *
	 * @return array{0:string,1:string}|null [ slug, label ]
	 */
	public static function chip_of( array $sp ): ?array {
		$id = (string) ( $sp['id'] ?? '' );
		if ( 'safety' === (string) ( $sp['group'] ?? '' ) ) {
			return [ 'danger', __( 'Keep Away', 'dcc-wildlife' ) ];
		}
		if ( in_array( $id, self::PROTECTED_KEYS, true ) ) {
			return [ 'protected', __( 'Protected', 'dcc-wildlife' ) ];
		}
		if ( 'NEAR' === Local::class_of( $id ) ) {
			return [ 'near', __( 'Lake County', 'dcc-wildlife' ) ];
		}
		return null;
	}

	/**
	 * The six, by key. Written out because the Director wrote them out: the
	 * species whose own safety text names federal or state protection.
	 */
	public const PROTECTED_KEYS = [ 'manatee', 'eagle', 'kestrel', 'littleblue', 'tricolored', 'woodstork' ];

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

			<div class="dccwl-gp-split">
				<ol class="dccwl-gp-list" data-dccwl-gp-list>
					<?php foreach ( $rows as $sp ) { self::row( $sp ); } ?>
				</ol>

				<?php
				/*
				 * THE DESKTOP PANE (picture 3). Empty, and `hidden` until a
				 * wide screen has something to put in it — guide.js fills it
				 * from the row's own entry rather than from a second copy of
				 * the data. On a phone it never appears and the sheet is
				 * what opens.
				 */
				?>
				<aside class="dccwl-gp-pane" data-dccwl-gp-pane hidden
					aria-label="<?php esc_attr_e( 'The species you chose', 'dcc-wildlife' ); ?>"></aside>
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
		$id    = (string) $sp['id'];
		$chip  = self::chip_of( $sp );
		$local = Local::row( $id );
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
		<li class="dccwl-gp-item" id="<?php echo esc_attr( self::ANCHOR_PREFIX . $id ); ?>"
			data-dccwl-gp-item
			data-key="<?php echo esc_attr( $id ); ?>"
			data-group="<?php echo esc_attr( self::pill_of( $sp ) ); ?>"
			data-scope="<?php echo esc_attr( Local::seen_here( $id ) ? 'here' : 'wider' ); ?>"
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
					<span class="dccwl-gp-text">
						<span class="dccwl-gp-name">
							<?php echo esc_html( (string) $sp['name'] ); ?>
							<?php if ( $chip ) : ?>
								<span class="dccwl-gp-chip dccwl-gp-chip-<?php echo esc_attr( $chip[0] ); ?>"><?php echo esc_html( $chip[1] ); ?></span>
							<?php endif; ?>
						</span>
						<?php if ( '' !== (string) $sp['where'] ) : ?>
							<span class="dccwl-gp-where"><?php echo esc_html( (string) $sp['where'] ); ?></span>
						<?php endif; ?>
					</span>
					<?php
					/*
					 * THE CHEVRON IS DRAWN IN CSS, not shipped per row.
					 *
					 * As an inline SVG it was about 200 bytes 402 times — 80
					 * KB of this page to draw one arrow four hundred times.
					 * A page whose size is its whole cost should not spend it
					 * on decoration, and this one is `aria-hidden` anyway:
					 * nothing is lost but the bytes.
					 */
					?>
					<span class="dccwl-gp-go" aria-hidden="true"></span>
				</summary>
				<div class="dccwl-gp-entry" data-dccwl-gp-entry>
					<?php Render::species_prose( $sp, false ); ?>
					<?php self::local_line( $id, $local ); ?>
				</div>
			</details>
		</li>
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
