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

	/** The anchor for one species — the registry's own id, never invented. */
	public static function anchor( string $id ): string {
		return self::url() . '#' . $id;
	}

	/** `[dcc_wildlife_guide]` */
	public static function shortcode( array $atts = [] ): string {
		ob_start();
		self::render( (array) $atts );
		return (string) ob_get_clean();
	}

	/**
	 * The whole page.
	 *
	 * @param array<string,mixed> $args
	 */
	public static function render( array $args = [] ): void {
		$dataset = Species::dataset();
		if ( ! $dataset ) {
			return;
		}

		/*
		 * STYLES ONLY — NO JAVASCRIPT ON THIS PAGE, which is the Director's
		 * "nothing heavy runs on load". The `dcc-wildlife` handle pulls
		 * app.css (tokens + primitives) and widget.css (the .dccwl-fg prose
		 * rules) and nothing else. The sheet, the deck and widget.js are not
		 * registered as its dependencies, so none of them loads here: this
		 * page is 402 descriptions and two links, and it needs no script to
		 * be any of that.
		 */
		wp_enqueue_style( 'dcc-wildlife' );

		$sections = Species::sections();
		$groups   = Species::browse_groups();

		/*
		 * THE JUMP LIST IS BUILT FROM WHAT IS ACTUALLY RENDERED, not from the
		 * group table. A heading that has no species must not appear in the
		 * list, and a list entry pointing at a heading that was skipped is the
		 * same defect as a category count that over-promises (1.38.1).
		 *
		 * So the body is built FIRST, into a buffer, collecting its own
		 * headings as it goes; the list is printed from that record. One pass
		 * over the dataset either way.
		 */
		[ $body, $toc ] = self::body( $dataset, $sections, $groups );
		?>
		<div class="dccwl-guidepage <?php echo esc_attr( Render::app_classes() ); ?>">

			<?php /* Centred, like every other label and heading here. The
			         multi-sentence paragraphs below stay left-aligned — Rob's
			         alignment ruling of 2026-10-19, which this page is the
			         main consumer of. */ ?>
			<p class="dccwl-guidepage-intro">
				<?php
				printf(
					/* translators: %d: number of species in the guide. "Species" is invariant in English. */
					esc_html__( 'Every one of the %d species on the Dora Canal and the Harris Chain, in words — what it is, where to look for it, and how to tell it from the ones it resembles.', 'dcc-wildlife' ),
					count( $dataset )
				);
				?>
			</p>

			<p class="dccwl-guidepage-back">
				<?php /* Same tab, by the Director's instruction: no target. */ ?>
				<a class="dccwl-guidepage-backlink" href="<?php echo esc_url( self::explore_url() ); ?>">
					<?php esc_html_e( 'Back To Explore', 'dcc-wildlife' ); ?>
				</a>
			</p>

			<?php if ( count( $toc ) > 1 ) : ?>
				<nav class="dccwl-guidepage-toc" aria-label="<?php esc_attr_e( 'Jump To A Group', 'dcc-wildlife' ); ?>">
					<h2 class="dccwl-guidepage-toch"><?php esc_html_e( 'Jump To A Group', 'dcc-wildlife' ); ?></h2>
					<ul class="dccwl-guidepage-toclist">
						<?php foreach ( $toc as $slug => $row ) : ?>
							<li>
								<a href="#<?php echo esc_attr( $slug ); ?>">
									<?php echo esc_html( $row['label'] ); ?>
									<span class="dccwl-guidepage-tocn"><?php echo esc_html( (string) $row['n'] ); ?></span>
								</a>
							</li>
						<?php endforeach; ?>
					</ul>
				</nav>
			<?php endif; ?>

			<?php
			// Already escaped on the way in: every value went through
			// esc_html()/esc_attr() inside Render::species_prose().
			echo $body; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			?>

			<?php /* The credits are a LICENCE SURFACE and they follow the
			         prose wherever the prose goes. Four photographs carry a
			         real CC BY obligation plus the modification notice; a page
			         showing 402 photographs without them would be a breach,
			         not a tidy-up. Printed by Render so there is one copy. */ ?>
			<?php Render::photo_credits_for_guide_page( $dataset ); ?>

			<p class="dccwl-guidepage-back dccwl-guidepage-back-foot">
				<a class="dccwl-guidepage-backlink" href="<?php echo esc_url( self::explore_url() ); ?>">
					<?php esc_html_e( 'Back To Explore', 'dcc-wildlife' ); ?>
				</a>
			</p>
		</div>
		<?php
	}

	/**
	 * The grouped body, plus the record the jump list is printed from.
	 *
	 * Grouping follows the app exactly, which is the Director's instruction:
	 * Animals split by their browse sub-group, then Plants (also by sub-group,
	 * as the app does), then Safety as one list.
	 *
	 * `$include_flagged = false` on the section members: the alligator has two
	 * TILES on purpose and must not have two write-ups. That rule predates
	 * this page (1.27.0) and is why Safety reads as a cross-reference of
	 * hazards that also live under Animals and Plants.
	 *
	 * @param array<int,array<string,mixed>> $dataset
	 * @param array<string,string>           $sections
	 * @param array<string,string>           $groups
	 * @return array{0:string,1:array<string,array{label:string,n:int}>}
	 */
	private static function body( array $dataset, array $sections, array $groups ): array {
		$toc = [];
		ob_start();

		foreach ( $sections as $section => $section_label ) {
			$members = Species::section_members( $dataset, $section, false );
			if ( ! $members ) {
				continue;
			}

			// Which sub-groups does this section actually hold, in the group
			// table's own order? Safety has no sub-groups and renders flat.
			$buckets = [];
			foreach ( $groups as $slug => $label ) {
				$rows = array_values(
					array_filter(
						$members,
						static function ( array $sp ) use ( $slug ): bool {
							return $slug === (string) ( $sp['browse'] ?? '' );
						}
					)
				);
				if ( $rows ) {
					$buckets[ $slug ] = [ 'label' => $label, 'rows' => $rows ];
				}
			}

			// Anything in the section with no sub-group slug keeps its place
			// under the section's own heading. Safety is entirely this case;
			// so is any species a future batch adds without a `browse` value.
			$loose = array_values(
				array_filter(
					$members,
					static function ( array $sp ) use ( $groups ): bool {
						return ! isset( $groups[ (string) ( $sp['browse'] ?? '' ) ] );
					}
				)
			);

			printf( '<h2 class="dccwl-guidepage-section" id="%s">%s</h2>', esc_attr( 'section-' . $section ), esc_html( $section_label ) );

			foreach ( $buckets as $slug => $bucket ) {
				$anchor_id          = 'group-' . $slug;
				$toc[ $anchor_id ]  = [ 'label' => $bucket['label'], 'n' => count( $bucket['rows'] ) ];
				printf( '<h3 class="dccwl-fg-group" id="%s">%s</h3>', esc_attr( $anchor_id ), esc_html( $bucket['label'] ) );
				foreach ( $bucket['rows'] as $sp ) {
					Render::species_prose( $sp, true );
				}
			}

			if ( $loose ) {
				if ( $buckets ) {
					// A sub-heading only where it would otherwise follow a
					// group heading with no label of its own.
					$anchor_id         = 'group-' . $section . '-other';
					$toc[ $anchor_id ] = [ 'label' => $section_label, 'n' => count( $loose ) ];
					printf( '<h3 class="dccwl-fg-group" id="%s">%s</h3>', esc_attr( $anchor_id ), esc_html( $section_label ) );
				} else {
					$toc[ 'section-' . $section ] = [ 'label' => $section_label, 'n' => count( $loose ) ];
				}
				foreach ( $loose as $sp ) {
					Render::species_prose( $sp, true );
				}
			}
		}

		return [ (string) ob_get_clean(), $toc ];
	}
}
