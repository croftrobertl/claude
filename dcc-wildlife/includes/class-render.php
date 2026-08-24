<?php
/**
 * Shared front-end renderer used by both the Elementor widget and the
 * [dcc_wildlife] shortcode, so the two outputs are identical.
 *
 * Cache-safety: this site is aggressively page-cached, so PHP must never
 * bake "the current month" into HTML. The full 12-month dataset ships to
 * the client (inline JSON config) and the JS picks the month from the
 * visitor's local date. The spotlight strip and month browser are
 * client-rendered; the field guide is month-independent and is rendered
 * server-side. The sightings section renders as a hidden shell that only
 * the JS reveals — with JS disabled it degrades to nothing.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Render {

	private static bool $config_added = false;

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
	 *     @type string $title        Heading override ('' = default).
	 *     @type bool   $show_guide   Render the field guide.
	 *     @type bool   $show_browser Render the month browser.
	 *     @type bool   $compact      Spotlight only (overrides the others).
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
		$sightings    = ! $compact && Sightings::is_enabled();

		$title = sanitize_text_field( (string) $opts['title'] );
		if ( '' === $title ) {
			$title = __( 'On the canal this month', 'dcc-wildlife' );
		}

		self::enqueue_assets();

		$instance = [
			'browser'   => $show_browser,
			'sightings' => $sightings,
		];

		ob_start();
		?>
		<div class="dccwl-root" data-dccwl="<?php echo esc_attr( (string) wp_json_encode( $instance ) ); ?>">

			<section class="dccwl-spotlight">
				<h2 class="dccwl-title"><?php echo esc_html( $title ); ?></h2>
				<?php if ( $show_browser ) : ?>
					<div class="dccwl-months" role="group" aria-label="<?php esc_attr_e( 'Browse wildlife by month', 'dcc-wildlife' ); ?>" hidden></div>
				<?php endif; ?>
				<ul class="dccwl-cards dccwl-spotlight-cards" aria-live="polite"></ul>
				<noscript>
					<p class="dccwl-noscript"><?php esc_html_e( 'Please enable JavaScript to see this month’s wildlife highlights.', 'dcc-wildlife' ); ?></p>
				</noscript>
			</section>

			<?php if ( $show_guide ) : ?>
				<section class="dccwl-guide">
					<h3 class="dccwl-section-title"><?php esc_html_e( 'Canal field guide', 'dcc-wildlife' ); ?></h3>
					<?php self::render_guide(); ?>
				</section>
			<?php endif; ?>

			<?php if ( $sightings ) : ?>
				<section class="dccwl-sightings" hidden>
					<h3 class="dccwl-section-title"><?php esc_html_e( 'Recent sightings', 'dcc-wildlife' ); ?></h3>
					<ul class="dccwl-sightings-list"></ul>
					<p class="dccwl-sightings-actions">
						<button type="button" class="dccwl-btn dccwl-log-btn"><?php esc_html_e( 'Log a sighting', 'dcc-wildlife' ); ?></button>
					</p>
					<div class="dccwl-form-slot"></div>
				</section>
			<?php endif; ?>

		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Server-rendered field guide: every species in three groups. This is
	 * month-independent, so it is safe inside cached HTML.
	 */
	private static function render_guide(): void {
		$dataset = Species::dataset();

		foreach ( Species::groups() as $slug => $label ) {
			$group_species = array_values( array_filter( $dataset, static fn( array $sp ): bool => $sp['group'] === $slug ) );
			if ( ! $group_species ) {
				continue;
			}
			?>
			<h4 class="dccwl-group-title"><?php echo esc_html( $label ); ?></h4>
			<ul class="dccwl-cards">
				<?php foreach ( $group_species as $sp ) : ?>
					<li class="dccwl-card">
						<div class="dccwl-card-head">
							<span class="dccwl-emoji" aria-hidden="true"><?php echo esc_html( $sp['emoji'] ); ?></span>
							<span class="dccwl-name"><?php echo esc_html( $sp['name'] ); ?></span>
							<?php if ( $sp['mascot'] ) : ?>
								<span class="dccwl-badge dccwl-badge-mascot"><?php esc_html_e( 'Our mascot', 'dcc-wildlife' ); ?></span>
							<?php endif; ?>
						</div>
						<p class="dccwl-fact"><?php echo esc_html( $sp['fact'] ); ?></p>
						<p class="dccwl-cardmeta">
							<span class="dccwl-pill dccwl-pill-best"><?php echo esc_html( $sp['best'] ); ?></span>
							<?php $months_label = Species::best_months_label( $sp['months'] ); ?>
							<?php if ( '' !== $months_label ) : ?>
								<span class="dccwl-pill dccwl-pill-months">
									<?php
									/* translators: %s: month range, e.g. "Nov–Mar" or "Year-round". */
									echo esc_html( sprintf( __( 'Best: %s', 'dcc-wildlife' ), $months_label ) );
									?>
								</span>
							<?php endif; ?>
						</p>
						<p class="dccwl-where"><?php echo esc_html( sprintf( /* translators: %s: where-to-look description. */ __( 'Where to look: %s', 'dcc-wildlife' ), $sp['where'] ) ); ?></p>
					</li>
				<?php endforeach; ?>
			</ul>
			<?php
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

		$config = [
			'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
			'species'    => Species::dataset(),
			'months'     => Species::month_abbrevs(),
			'monthsFull' => Species::month_names(),
			'sightings'  => Sightings::is_enabled(),
			'maxNote'    => Sightings::MAX_NOTE,
			'maxName'    => Sightings::MAX_NAME,
			'i18n'       => [
				'peak'        => __( 'Peak season', 'dcc-wildlife' ),
				'mascot'      => __( 'Our mascot', 'dcc-wildlife' ),
				'where'       => __( 'Where to look:', 'dcc-wildlife' ),
				'noSpotlight' => __( 'A quiet month on the canal — see the field guide below.', 'dcc-wildlife' ),
				'noSightings' => __( 'No sightings logged yet — be the first!', 'dcc-wildlife' ),
				'logSighting' => __( 'Log a sighting', 'dcc-wildlife' ),
				'species'     => __( 'What did you see?', 'dcc-wildlife' ),
				'choose'      => __( 'Choose a species…', 'dcc-wildlife' ),
				'date'        => __( 'When?', 'dcc-wildlife' ),
				'note'        => __( 'Note (optional)', 'dcc-wildlife' ),
				'notePh'      => __( 'e.g. Two otters playing by the dock', 'dcc-wildlife' ),
				'firstName'   => __( 'First name (optional)', 'dcc-wildlife' ),
				'submit'      => __( 'Submit sighting', 'dcc-wildlife' ),
				'sending'     => __( 'Sending…', 'dcc-wildlife' ),
				'cancel'      => __( 'Cancel', 'dcc-wildlife' ),
				'genericErr'  => __( 'Sorry — your sighting could not be saved right now.', 'dcc-wildlife' ),
			],
		];

		wp_add_inline_script(
			'dcc-wildlife',
			'window.DCC_WL_CFG = ' . wp_json_encode( $config ) . ';',
			'before'
		);
	}
}
