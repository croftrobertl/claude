<?php
/**
 * Build the derived photo files beside each original in assets/photos/:
 *   <id>-600.jpg  — 600px-wide hero variant (srcset, 1.17.0)
 *   <id>-320.jpg  — 320×240 centre-cropped tile thumbnail (photo-first, 1.19.0)
 * Idempotent: rebuilds every variant from the original. Run from anywhere:
 *   php dcc-wildlife/tools/make-photo-variants.php
 * Then update Species::PHOTO_W for any NEW original (its pixel width).
 */
declare(strict_types=1);
$dir = dirname( __DIR__ ) . '/assets/photos/';
$n = 0;
foreach ( glob( $dir . '*.jpg' ) as $f ) {
	$base = basename( $f, '.jpg' );
	if ( preg_match( '/-(600|320)$/', $base ) ) { continue; }
	$src = imagecreatefromjpeg( $f );
	$w = imagesx( $src ); $h = imagesy( $src );
	// hero variant
	$tw = 600; $th = (int) round( $h * $tw / $w );
	$dst = imagecreatetruecolor( $tw, $th ); imagecopyresampled( $dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h );
	imagejpeg( $dst, $dir . $base . '-600.jpg', 80 ); imagedestroy( $dst );
	// 4:3 thumb, centre crop
	$cw = $w; $ch = (int) round( $w * 3 / 4 );
	if ( $ch > $h ) { $ch = $h; $cw = (int) round( $h * 4 / 3 ); }
	$sx = (int) ( ( $w - $cw ) / 2 ); $sy = (int) ( ( $h - $ch ) / 2 );
	$dst = imagecreatetruecolor( 320, 240 ); imagecopyresampled( $dst, $src, 0, 0, $sx, $sy, 320, 240, $cw, $ch );
	imagejpeg( $dst, $dir . $base . '-320.jpg', 82 ); imagedestroy( $dst ); imagedestroy( $src );
	printf( "%-12s %4dx%-4d -> -600 (%dx%d), -320 (320x240)\n", $base, $w, $h, $tw, $th );
	$n++;
}
echo "$n originals processed\n";
