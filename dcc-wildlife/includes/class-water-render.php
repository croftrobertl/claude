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
		$opts  = wp_parse_args( $opts, [ 'title' => '' ] );
		$title = sanitize_text_field( (string) $opts['title'] );
		if ( '' === $title ) {
			$title = __( 'Fishing & water conditions', 'dcc-wildlife' );
		}

		self::enqueue_assets();

		$almanac = Water_Data::almanac();
		$dock    = Water_Data::dock_notes();
		$links   = Water_Data::link_list( 'links' );
		$reports = Water_Data::link_list( 'reports' );
		$live    = Water_Data::live_enabled();

		ob_start();
		?>
		<section class="dccwl-water" aria-labelledby="dccwl-water-title">
			<h2 class="dccwl-water-title" id="dccwl-water-title"><?php echo esc_html( $title ); ?></h2>

			<?php if ( $live ) : ?>
				<?php /* Shell only — filled client-side so page caching cannot serve a stale reading. */ ?>
				<div class="dccwl-water-live" data-dccwl-water-live hidden>
					<h3 class="dccwl-water-sub"><?php esc_html_e( 'Right now', 'dcc-wildlife' ); ?></h3>
					<ul class="dccwl-water-facts" data-dccwl-water-facts></ul>
				</div>
			<?php endif; ?>

			<?php self::render_almanac( $almanac ); ?>

			<?php if ( null !== $dock ) : ?>
				<div class="dccwl-water-dock">
					<h3 class="dccwl-water-sub dccwl-water-dock-head">
						<?php esc_html_e( 'From the dock', 'dcc-wildlife' ); ?>
					</h3>
					<p class="dccwl-water-dock-meta">
						<?php
						if ( '' !== $dock['updated'] ) {
							printf(
								/* translators: %s: date the owner last updated the note. */
								esc_html__( 'First-hand notes from your hosts — updated %s', 'dcc-wildlife' ),
								esc_html( $dock['updated'] )
							);
						} else {
							esc_html_e( 'First-hand notes from your hosts', 'dcc-wildlife' );
						}
						?>
					</p>
					<div class="dccwl-water-dock-body">
						<?php echo wp_kses_post( wpautop( $dock['text'] ) ); ?>
					</div>
				</div>
			<?php endif; ?>

			<?php self::render_links( __( 'Official information', 'dcc-wildlife' ), $links, 'dccwl-water-links' ); ?>
			<?php self::render_links( __( 'Local reports & charters', 'dcc-wildlife' ), $reports, 'dccwl-water-reports' ); ?>

			<?php if ( $links || $reports ) : ?>
				<p class="dccwl-water-disclaimer">
					<?php esc_html_e( 'Licences, seasons and limits change — check the FWC before you fish.', 'dcc-wildlife' ); ?>
				</p>
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
					<ul class="dccwl-water-facts">
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
						<ul class="dccwl-water-facts">
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
	 * One fact row. Attribution is not optional decoration — it is rendered
	 * from the same object that guarantees the value was attributable.
	 */
	private static function render_fact( Water_Fact $fact ): void {
		$f = $fact->to_array();
		?>
		<li class="dccwl-water-fact dccwl-water-tier-<?php echo esc_attr( $f['tier'] ); ?>">
			<span class="dccwl-water-label"><?php echo esc_html( $f['label'] ); ?></span>
			<span class="dccwl-water-value"><?php echo esc_html( $f['value'] ); ?></span>
			<span class="dccwl-water-attr">
				<?php if ( '' !== $f['sourceUrl'] ) : ?>
					<a href="<?php echo esc_url( $f['sourceUrl'] ); ?>" rel="noopener nofollow" target="_blank">
						<?php echo esc_html( $f['sourceName'] ); ?>
					</a>
				<?php else : ?>
					<?php echo esc_html( $f['sourceName'] ); ?>
				<?php endif; ?>
				<span class="dccwl-water-date"><?php echo esc_html( $f['date'] ); ?></span>
				<?php if ( '' !== $f['note'] ) : ?>
					<span class="dccwl-water-note"><?php echo esc_html( $f['note'] ); ?></span>
				<?php endif; ?>
			</span>
		</li>
		<?php
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

		if ( ! Water_Data::live_enabled() ) {
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
					'i18n'     => [
						'asOf' => __( 'reading', 'dcc-wildlife' ),
					],
				]
			) . ';',
			'before'
		);
	}
}
