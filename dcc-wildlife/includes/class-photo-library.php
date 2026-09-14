<?php
/**
 * The species photographs, as WordPress media (1.29.0).
 *
 * WHY THIS EXISTS. assets/photos/ reached 11MB of a 12MB plugin — 153 files —
 * and every update zip carried all of it, uploaded from a phone. Photographs
 * are content, not code. They belong in the media library, where they are
 * served by whatever the site serves media with (Jetpack Photon on this site,
 * so 11MB stops coming off HostGator at all) and where a plugin update is a
 * plugin update again.
 *
 * TWO THINGS THIS CLASS EXISTS TO PREVENT.
 *
 * 1. FILENAME SURGERY. The old client built the srcset by string-replacing
 *    ".jpg" with "-600.jpg" on a base URL. WordPress dedupes filenames on
 *    upload: if anything called fern.jpg is already in that month's folder,
 *    ours becomes fern-1.jpg and the replace yields fern-1-600.jpg — a 404,
 *    silently, visible only on a retina screen. So nothing here composes a
 *    URL. Each rendition is its own attachment, found by its own meta, and
 *    the URL comes from wp_get_attachment_url(). That survives dedupe, a site
 *    move, and someone reorganising uploads.
 *
 * 2. RE-CROPPING. The -320 tile faces are hand-cropped onto the animal, not
 *    centre-cropped: a centre crop of the white pelican in a big sky is a
 *    speck. Intermediate size generation is suppressed for every file this
 *    imports, so WordPress never makes a "medium" that something later serves
 *    in place of the crop we chose. It also saves ~600 junk files.
 *
 * WHAT STAYS IN CODE: the credits. Species::PHOTO_SOURCES is the source of
 * truth and does not move. Four of these carry a real CC BY obligation, and a
 * licence that lives in a database row is one accidental media-library edit
 * away from a breach. The attachment caption is a convenience copy for anyone
 * browsing Media — never the thing the credits panel reads.
 *
 * @package DCC_Wildlife
 */

namespace DCC_WL;

defined( 'ABSPATH' ) || exit;

class Photo_Library {

	/** Marks an attachment as ours, and says which species and rendition. */
	public const META_SPECIES   = '_dcc_wl_species';
	public const META_RENDITION = '_dcc_wl_rendition';

	/** The three renditions, and how each maps onto a filename. */
	public const RENDITIONS = [ 'full', 'mid', 'thumb' ];

	/** Where a drop folder lives, relative to wp-content/uploads/. */
	public const DROP_DIR = 'dcc-wildlife-photos';

	/** Resolved map, built once per request. species => rendition => [url, w, h, id]. */
	private static ?array $map = null;

	/**
	 * The filename each rendition of a species has, in every source we read.
	 * The ONLY place this naming is encoded — and it is used to FIND a file to
	 * import, never to build a URL.
	 */
	public static function filename( string $slug, string $rendition ): string {
		$photo = (string) ( Species::photos()[ $slug ] ?? '' );
		if ( '' === $photo ) {
			return '';
		}
		$base = (string) preg_replace( '/\.jpg$/', '', $photo );
		if ( 'full' === $rendition ) {
			return $photo;
		}
		return $base . ( 'mid' === $rendition ? '-600' : '-320' ) . '.jpg';
	}

	/**
	 * Directories an import reads from, in order, first hit wins.
	 *
	 * RELEASE A ships the photos, so the bundled directory is the source and
	 * the import is a one-time copy into the library. RELEASE B removes that
	 * directory from the zip — the files stay in the REPOSITORY as the
	 * provenance record, and ship as a separate photo pack. A fresh install
	 * then drops that pack into uploads/dcc-wildlife-photos/ and runs the
	 * import once. Both paths are read here so neither release needs a
	 * different importer.
	 *
	 * @return array<int,string> Absolute directory paths that exist.
	 */
	public static function sources(): array {
		// Guarded: the bundled directory only exists while a release ships it,
		// and the constant only exists when the plugin bootstrapped. Neither
		// absence is an error — see url() for the same reasoning.
		$dirs = defined( 'DCC_WL_DIR' ) ? [ DCC_WL_DIR . 'assets/photos' ] : [];
		// Guarded like dir_url(): this only exists inside WordPress, and the
		// class must be loadable without it.
		$up = function_exists( 'wp_get_upload_dir' ) ? wp_get_upload_dir() : [];
		if ( empty( $up['error'] ) && ! empty( $up['basedir'] ) ) {
			$dirs[] = rtrim( (string) $up['basedir'], '/\\' ) . '/' . self::DROP_DIR;
		}
		/**
		 * Filter the directories the photo import reads from, in order.
		 *
		 * @param array<int,string> $dirs Absolute paths.
		 */
		$dirs = (array) apply_filters( 'dcc_wl_photo_sources', $dirs );
		return array_values( array_filter( $dirs, static fn( $d ): bool => is_string( $d ) && is_dir( $d ) ) );
	}

	/** The first readable file for a rendition, or '' if no source has it. */
	public static function source_file( string $slug, string $rendition ): string {
		$hit = self::source_hit( $slug, $rendition );
		return $hit ? $hit['path'] : '';
	}

	/**
	 * The first readable source file AND the URL it serves from.
	 *
	 * One notion of "where the files are", shared by the importer and by the
	 * fallback URL below. They used to disagree: the importer read a list of
	 * directories while the fallback hardcoded the plugin's, so dropping the
	 * uploads folder from the list changed nothing a test could see. It also
	 * means a fresh install SERVES the photographs the moment the pack is
	 * dropped into uploads, before the import has run at all.
	 *
	 * @return array{path:string,url:string}|null
	 */
	public static function source_hit( string $slug, string $rendition ): ?array {
		$name = self::filename( $slug, $rendition );
		if ( '' === $name ) {
			return null;
		}
		foreach ( self::sources() as $dir ) {
			$path = $dir . '/' . $name;
			if ( is_file( $path ) && is_readable( $path ) ) {
				return [ 'path' => $path, 'url' => self::dir_url( $dir ) . $name ];
			}
		}
		return null;
	}

	/** The URL a source directory serves from, or '' if it serves from none. */
	private static function dir_url( string $dir ): string {
		$dir = rtrim( $dir, '/\\' );
		if ( defined( 'DCC_WL_DIR' ) && defined( 'DCC_WL_URL' )
			&& $dir === rtrim( DCC_WL_DIR . 'assets/photos', '/\\' ) ) {
			return DCC_WL_URL . 'assets/photos/';
		}
		$up = function_exists( 'wp_get_upload_dir' ) ? wp_get_upload_dir() : [];
		if ( empty( $up['error'] ) && ! empty( $up['basedir'] ) && ! empty( $up['baseurl'] ) ) {
			$base = rtrim( (string) $up['basedir'], '/\\' );
			if ( str_starts_with( $dir, $base ) ) {
				return rtrim( (string) $up['baseurl'], '/' ) . str_replace( '\\', '/', substr( $dir, strlen( $base ) ) ) . '/';
			}
		}
		return '';
	}

	/**
	 * Every Wildlife attachment, as species => rendition => details.
	 *
	 * One query for all of them rather than one per species per rendition:
	 * the guide renders 52 tiles and opens sheets, and 153 round trips would
	 * be a page's worth of work for nothing.
	 *
	 * @return array<string,array<string,array{id:int,url:string,w:int,h:int}>>
	 */
	public static function map(): array {
		if ( null !== self::$map ) {
			return self::$map;
		}
		self::$map = [];
		if ( ! function_exists( 'get_posts' ) ) {
			return self::$map;
		}
		$ids = get_posts(
			[
				'post_type'        => 'attachment',
				'post_status'      => 'inherit',
				'numberposts'      => -1,
				'fields'           => 'ids',
				'no_found_rows'    => true,
				'suppress_filters' => false,
				'meta_query'       => [ // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
					[
						'key'     => self::META_SPECIES,
						'compare' => 'EXISTS',
					],
				],
			]
		);
		foreach ( (array) $ids as $id ) {
			$id   = (int) $id;
			$slug = (string) get_post_meta( $id, self::META_SPECIES, true );
			$rend = (string) get_post_meta( $id, self::META_RENDITION, true );
			if ( '' === $slug || ! in_array( $rend, self::RENDITIONS, true ) ) {
				continue;
			}
			$meta = (array) wp_get_attachment_metadata( $id );
			// wp_get_attachment_url(), never a composed path: this is what
			// Photon rewrites, and what survives a site move.
			self::$map[ $slug ][ $rend ] = [
				'id'  => $id,
				'url' => (string) wp_get_attachment_url( $id ),
				'w'   => (int) ( $meta['width'] ?? 0 ),
				'h'   => (int) ( $meta['height'] ?? 0 ),
			];
		}
		return self::$map;
	}

	/** Forget the cached map — after an import, or in a test. */
	public static function flush(): void {
		self::$map = null;
	}

	/**
	 * The URL for one rendition, with the fallback the guide has always had.
	 *
	 * Media library, else the bundled file if this release still carries one,
	 * else '' — and '' is not a failure: the caller falls through to the
	 * species' own drawing and then to the group glyph, exactly as a species
	 * with no photograph does. A missing attachment must never be a broken
	 * image.
	 */
	public static function url( string $slug, string $rendition ): string {
		$hit = self::map()[ $slug ][ $rendition ] ?? null;
		if ( $hit && '' !== $hit['url'] ) {
			return (string) $hit['url'];
		}
		$hit = self::source_hit( $slug, $rendition );
		if ( $hit && '' !== $hit['url'] ) {
			return $hit['url'];
		}
		// Nothing anywhere. NOT a failure: the caller falls through to the
		// drawing and then the glyph, which is where a species with no
		// photograph has always landed. Release B ships no bundled files, so
		// this is the normal answer there until the import has run.
		return '';
	}

	/**
	 * The real pixel width of a rendition.
	 *
	 * From the attachment metadata where we have it, so it cannot drift from
	 * the file the way a hand-maintained table can. PHOTO_W is the fallback
	 * while a site still serves bundled files.
	 */
	public static function width( string $slug, string $rendition ): int {
		$hit = self::map()[ $slug ][ $rendition ] ?? null;
		if ( $hit && $hit['w'] > 0 ) {
			return (int) $hit['w'];
		}
		if ( 'full' === $rendition ) {
			return Species::photo_width( $slug );
		}
		return 'mid' === $rendition ? 600 : 320;
	}

	/** Has this species a usable photograph from any source? */
	public static function has( string $slug ): bool {
		return '' !== self::url( $slug, 'thumb' );
	}

	/**
	 * Import every rendition of every species into the media library.
	 *
	 * IDEMPOTENT: a rendition already carrying our meta is skipped, so a
	 * second run creates nothing. This is the one function; WP-CLI and the
	 * admin button are both callers.
	 *
	 * @param array{dry_run?:bool} $args
	 * @return array{created:array,skipped:array,failed:array,missing:array,total:int}
	 */
	public static function import( array $args = [] ): array {
		$dry    = ! empty( $args['dry_run'] );
		$report = [ 'created' => [], 'skipped' => [], 'failed' => [], 'missing' => [], 'total' => 0 ];

		if ( ! $dry ) {
			require_once ABSPATH . 'wp-admin/includes/image.php';
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
		}

		// Suppress every intermediate size for the duration. The -320 crops
		// are hand-made; a WP-generated "medium" standing in for one puts the
		// specks back, and 153 files x 4 sizes is ~600 files of nothing.
		$no_sizes = static fn(): array => [];
		add_filter( 'intermediate_image_sizes_advanced', $no_sizes, 99 );
		add_filter( 'big_image_size_threshold', '__return_false', 99 );

		try {
			foreach ( array_keys( Species::photos() ) as $slug ) {
				foreach ( self::RENDITIONS as $rend ) {
					++$report['total'];
					$key = $slug . '/' . $rend;

					if ( self::existing_id( $slug, $rend ) ) {
						$report['skipped'][] = $key;
						continue;
					}
					$src = self::source_file( $slug, $rend );
					if ( '' === $src ) {
						$report['missing'][] = $key;
						continue;
					}
					if ( $dry ) {
						$report['created'][] = $key;
						continue;
					}
					$id = self::sideload( $slug, $rend, $src );
					if ( $id > 0 ) {
						$report['created'][] = $key;
					} else {
						$report['failed'][] = $key;
					}
				}
			}
		} finally {
			remove_filter( 'intermediate_image_sizes_advanced', $no_sizes, 99 );
			remove_filter( 'big_image_size_threshold', '__return_false', 99 );
			self::flush();
		}
		return $report;
	}

	/** The attachment id for a rendition, or 0. Meta lookup, never a filename. */
	public static function existing_id( string $slug, string $rendition ): int {
		return (int) ( self::map()[ $slug ][ $rendition ]['id'] ?? 0 );
	}

	/**
	 * Copy one file into the library and mark it as ours.
	 *
	 * The caption carries the credit line as a courtesy so anyone browsing
	 * Media sees who took it. It is a COPY of what PHOTO_SOURCES says, not the
	 * source of truth; the credits panel never reads it.
	 */
	private static function sideload( string $slug, string $rendition, string $src ): int {
		$up = wp_upload_dir();
		if ( ! empty( $up['error'] ) ) {
			return 0;
		}
		$name = wp_unique_filename( (string) $up['path'], basename( $src ) );
		$dest = rtrim( (string) $up['path'], '/\\' ) . '/' . $name;
		if ( ! @copy( $src, $dest ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			return 0;
		}

		$credit  = Species::photo_credits()[ $slug ] ?? [ '', '', '' ];
		$names   = [];
		foreach ( Species::dataset() as $sp ) { $names[ $sp['id'] ] = $sp['name']; }
		$species = (string) ( $names[ $slug ] ?? $slug );

		$id = wp_insert_attachment(
			[
				'post_mime_type' => 'image/jpeg',
				'post_title'     => sprintf( '%s (%s)', $species, $rendition ),
				'post_excerpt'   => trim( (string) $credit[0] ),          // caption
				'post_content'   => trim( implode( ' — ', array_filter( [ (string) $credit[0], (string) $credit[1] ] ) ) ),
				'post_status'    => 'inherit',
			],
			$dest
		);
		if ( ! $id || is_wp_error( $id ) ) {
			return 0;
		}
		$id = (int) $id;
		wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $dest ) );
		update_post_meta( $id, self::META_SPECIES, $slug );
		update_post_meta( $id, self::META_RENDITION, $rendition );
		update_post_meta( $id, '_wp_attachment_image_alt', $species );
		self::flush();
		return $id;
	}

	/** One line per outcome, for a CLI run or an admin notice. */
	public static function summarise( array $report ): string {
		return sprintf(
			/* translators: 1: created, 2: skipped, 3: failed, 4: missing, 5: total. */
			__( '%1$d created, %2$d already there, %3$d failed, %4$d with no file to import, of %5$d.', 'dcc-wildlife' ),
			count( $report['created'] ),
			count( $report['skipped'] ),
			count( $report['failed'] ),
			count( $report['missing'] ),
			(int) $report['total']
		);
	}
}
