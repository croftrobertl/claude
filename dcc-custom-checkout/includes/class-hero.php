<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.35.0 — THE COTTAGE PHOTO AT THE TOP OF THE CHECKOUT (item 1, pictures 6
 * and 7). New layout only; today's checkout is untouched.
 *
 * ONE PHOTO, NOT TWO (picture 6). The checkout page's own featured image is
 * the canal banner, and the first prompt would have put the cottage photo
 * BELOW it — two full-bleed pictures before the first question. Instead the
 * cottage's photo REPLACES the banner inside the theme's own header.
 *
 * HOW, read from Bravada 1.2.0 on the server (Director, 2026-10-22):
 * `bravada_header_image_url()` in includes/core.php ends with
 * `apply_filters('bravada_header_image_url', $header_image)`, and
 * `bravada_header_image()` (on `cryout_headerimage_hook`, priority 99) prints
 * BOTH the visible `div.header-image` (a CSS background) and a 0px-tall
 * `<img>` from that ONE url. So filtering the url changes both, and nothing
 * is stacked, overlaid or overridden in CSS. /explore/ does the same job with
 * a `!important` background override keyed to a body class; that is the old
 * way and is deliberately not copied.
 *
 * THE LIP (picture 7) IS `#header-image-main-inside::after`, NOT A DIV. The
 * Director's mu-plugin `dcc-hero-frame.php` forces
 * `#header-image-main-inside > div:not(.dcc-hl-wrap):not(.dcc-gh):not(.dcc-gh-fore)`
 * to `height: 100% !important`, so a plain `<div>` lip would be stretched to
 * the full height of the photo and paint the whole thing white. The same
 * mu-plugin gives that box `position: relative; overflow: hidden`, which is
 * exactly what an ::after needs. See checkout-layout.css.
 *
 * NOTHING ELSE GOES ON THE PHOTO (Rob, 2026-10-22). DCC Hero Life and DCC Sun
 * on the Canal both skip booking pages, and this adds nothing animated or
 * drawn: the cottage name, the dates pill and the lip, and no more.
 */
final class Hero
{
    /** The theme's own filter — the single seam this feature uses. */
    public const URL_FILTER = 'bravada_header_image_url';

    /** Where the theme prints the header image; 99 is the theme's own. */
    public const PRINT_HOOK = 'cryout_headerimage_hook';

    /**
     * The theme's own page title, which is also on that hook — at priority
     * 100 (Director, `core.php:210`, read on the server 2026-10-22).
     *
     * On /submit-booking/ it prints `#header-page-title` reading "Submit
     * Booking" OVER the photo, which would sit on top of the cottage name and
     * the dates pill. Rob's picked design shows the cottage name and nothing
     * else, so with the new layout active the ACTION IS REMOVED rather than
     * the box hidden in CSS: a hidden heading is still a heading to a screen
     * reader, and this one would be the wrong one.
     */
    public const THEME_TITLE = 'bravada_header_title';
    public const THEME_TITLE_PRIORITY = 100;

    /**
     * Registered sizes to choose between, widest-useful first.
     *
     * The filter returns ONE url into a CSS background, so there is no srcset
     * to fall back on and the choice has to be right for every screen. The
     * floor below is what makes it right; this list is only the candidates.
     */
    private const CANDIDATES = ['large', '1536x1536', 'medium_large', 'full'];

    /** The narrowest image accepted when anything wider exists. */
    private const MIN_WIDTH = 1024;

    public function register(): void
    {
        // Decided per request: the gate, then the page.
        add_action('wp', [$this, 'maybe_hook'], 20);
    }

    public function maybe_hook(): void
    {
        if (!Layout::active() || !Assets::is_checkout_page()) {
            return;
        }
        if ($this->photo_url() === '') {
            return; // No cottage photo: the canal banner stays. Nothing breaks.
        }
        add_filter(self::URL_FILTER, [$this, 'filter_header_image_url'], 20);
        add_action('wp_head', [$this, 'print_preload'], 2);
        // After the theme's own 99, so this lands as the last child of
        // #header-image-main-inside rather than before the photo. CONFIRMED on
        // the server: header.php:85-89 calls cryout_headerimage_hook() inside
        // that div, and bravada_header_image is at 99 (Director, 2026-10-22).
        add_action(self::PRINT_HOOK, [$this, 'print_overlay'], 100);

        // AND THE THEME'S "Submit Booking" TITLE GOES. It is on the same hook
        // at the same priority, and would print over the cottage name. The
        // overlay's name becomes the page's single <h1> in its place, so the
        // page is not left with no main heading.
        remove_action(self::PRINT_HOOK, self::THEME_TITLE, self::THEME_TITLE_PRIORITY);

        /* AND THE CANAL BANNER STOPS BEING FETCHED AT ALL (v0.35.1, item 3),
           and the article's own "Submit Booking" heading leaves the HTML
           (item 5). Both hang off the checkout PAGE's featured image and
           title, never the cottage's — see the two methods below. They are
           inside this gate on purpose: if no cottage photo was found, the
           canal banner is still the header and its heading is still the
           page's only one, so neither may be taken away. */
        $this->suppress_page_featured_image();
        $this->suppress_entry_title();
    }

    /* --------------------------------------------------------------------- *
     * The checkout page's own featured image, which nothing on this page
     * shows and two things download (v0.35.1, item 3)
     * --------------------------------------------------------------------- */

    /**
     * THE CANAL BANNER WAS STILL BEING FETCHED TWICE, ALONGSIDE THE COTTAGE
     * PHOTO (the Director's live measurement, 2026-10-23):
     *
     *   - SpeedyCache Pro (`main/enhanced.php`) preloads the page's featured
     *     image at high priority — `DCC-Photos-Canal-3-graded-1080.webp`,
     *     227 KB, racing the photo it is not going to show;
     *   - the theme still prints the article's featured `<picture>`, hidden,
     *     through i0.wp.com.
     *
     * 0.35.0 replaced the header image's URL, which is what the header PAINTS.
     * It did nothing about the featured image itself, and both of those read
     * the featured image rather than the header.
     *
     * SO THE PAGE HAS NO FEATURED IMAGE FOR THIS REQUEST. `_thumbnail_id`
     * reads as absent, which is a state WordPress and every plugin already
     * handle — there is no "hidden" to be found, and nothing is left to
     * preload or print. Not CSS: a hidden download is a download.
     *
     * SCOPED TO THE CHECKOUT PAGE'S OWN ID AND NOTHING ELSE. The hero and the
     * Continue card read `_thumbnail_id` on the ROOM TYPE, which is a
     * different post; an unscoped filter would blank the cottage photo and
     * leave the page with no picture at all. The post id is compared before
     * anything else, and the filter is only added when it is known.
     */
    public function suppress_page_featured_image(): void
    {
        if (self::checkout_page_id() <= 0) {
            return;
        }
        add_filter('get_post_metadata', [$this, 'filter_thumbnail_meta'], 10, 4);
        add_filter('has_post_thumbnail', [$this, 'filter_has_thumbnail'], 10, 2);
    }

    /**
     * `_thumbnail_id` on the checkout page → absent.
     *
     * `null` means "no opinion" and lets the real row through, so an answer
     * has to be given — and the SHAPE of that answer depends on `$single`:
     *
     *     $check = apply_filters("get_{$meta_type}_metadata", null, …);
     *     if (null !== $check) {
     *         if ($single && is_array($check)) { return $check[0]; }
     *
     * `get_post_thumbnail_id()` asks with `$single = true`, so returning `[]`
     * to it reads `$check[0]` of an empty array — an undefined-offset WARNING
     * on every checkout render, and `null` rather than a clean empty. Found by
     * reading core rather than by a test, and the Director's own "no new PHP
     * warnings" is the check it would have failed. So: `''` for a single read,
     * `[]` for a list, which is what a post with no featured image gives.
     *
     * `''` is falsy, which is all `get_post_thumbnail_id()` needs — it returns
     * false for anything falsy, and `has_post_thumbnail()` is that cast.
     *
     * @param mixed  $value
     * @param int    $object_id
     * @param string $meta_key
     * @param bool   $single
     * @return mixed
     */
    public function filter_thumbnail_meta($value, $object_id, $meta_key, $single = false)
    {
        if ($meta_key !== '_thumbnail_id') {
            return $value;
        }
        if ((int) $object_id !== self::checkout_page_id()) {
            return $value;
        }
        return $single ? '' : [];
    }

    /**
     * @param mixed $has
     * @param mixed $post
     * @return mixed
     */
    public function filter_has_thumbnail($has, $post = null)
    {
        $id = $post instanceof \WP_Post ? (int) $post->ID : (int) $post;
        return $id === self::checkout_page_id() ? false : $has;
    }

    /* --------------------------------------------------------------------- *
     * The article's own heading (v0.35.1, item 5)
     * --------------------------------------------------------------------- */

    /**
     * ONE `<h1>` IN THE HTML, NOT ONE VISIBLE.
     *
     * 0.35.0 removed the theme's header-image title, which is the one that
     * printed OVER the photo. The article's own
     * `<h1 class="entry-title singular-title">Submit Booking</h1>` is a
     * different heading in a different place, and it was still in the page —
     * hidden by the layout's CSS. A hidden heading is still a heading: a
     * screen reader reads it, and the page had two h1s, the wrong one first.
     *
     * HOW IT IS REMOVED RATHER THAN HIDDEN, using core's own behaviour.
     * `the_title( $before, $after )` returns BEFORE printing anything when the
     * title is empty (wp-includes/post-template.php) — so a theme that wraps
     * the title the usual way, `the_title( '<h1 class="…">', '</h1>' )`,
     * prints no element at all. The filter below empties the title for the
     * checkout page inside the loop, and the whole heading goes with it.
     *
     * WHAT THIS CANNOT DO, STATED RATHER THAN ASSUMED: if Bravada's template
     * instead writes `<h1 class="…"><?php the_title(); ?></h1>` by hand, the
     * tags are not core's to withhold and an EMPTY `<h1>` remains. That shape
     * is asserted in `tests/hero/` as well, so which one live is in is a
     * reading rather than a hope. The Director's label-order check settles it.
     *
     * SCOPED THREE WAYS, because `the_title` is the most-read filter in
     * WordPress: the checkout page's own id, the main query's loop
     * (`in_the_loop()`, which the document `<title>`, the menus and the
     * breadcrumbs are all outside), and never in the admin or a feed.
     */
    public function suppress_entry_title(): void
    {
        if (self::checkout_page_id() <= 0) {
            return;
        }
        add_filter('the_title', [$this, 'filter_entry_title'], 10, 2);
    }

    /**
     * @param mixed $title
     * @param mixed $id
     * @return mixed
     */
    public function filter_entry_title($title, $id = 0)
    {
        if ((int) $id !== self::checkout_page_id()) {
            return $title;
        }
        if (is_admin() || (function_exists('is_feed') && is_feed())) {
            return $title;
        }
        if (!function_exists('in_the_loop') || !in_the_loop()) {
            return $title;
        }
        return '';
    }

    /**
     * The checkout page's post id, or 0 when it cannot be established.
     *
     * `Assets` already resolves this for the gate, filter and all, so this
     * asks it rather than keeping a second copy: the two must name the same
     * page or the suppression above could blank a cottage photo. 0 means every
     * filter stands down and today's page is untouched.
     */
    public static function checkout_page_id(): int
    {
        return Assets::checkout_page_id();
    }

    /**
     * The theme's header image url → the booked cottage's photo.
     *
     * @param mixed $url
     * @return mixed
     */
    public function filter_header_image_url($url)
    {
        $photo = $this->photo_url();
        return $photo !== '' ? $photo : $url;
    }

    /**
     * Ask the browser for the photo early.
     *
     * The visible image is a CSS BACKGROUND, and a background cannot carry
     * `fetchpriority`; a preload link is how the same thing is said for one.
     * The 0px `<img>` the theme prints fetches the same url, so the browser
     * serves both from one request.
     */
    public function print_preload(): void
    {
        $photo = $this->photo_url();
        if ($photo === '') {
            return;
        }
        printf(
            '<link rel="preload" as="image" href="%s" fetchpriority="high">' . "\n",
            esc_url($photo)
        );
    }

    /** The cottage name, its number and the dates pill, over the photo. */
    public function print_overlay(): void
    {
        $name  = $this->cottage_name();
        $label = $this->cottage_label();
        $pill  = $this->dates_pill();
        if ($name === '' && $pill === '') {
            return;
        }

        echo '<div class="dcc_hero-overlay"><div class="dcc_hero-overlay__inner">';
        if ($name !== '') {
            /* AN <h1>, AND THE PAGE'S ONLY ONE. The theme's own title has been
               removed above, so without this the page would have no main
               heading at all — which is what a screen reader navigates by.
               Centred, per Rob's standing rule for titles. */
            printf('<h1 class="dcc_hero-overlay__name">%s</h1>', esc_html($name));
        }
        if ($label !== '') {
            printf('<p class="dcc_hero-overlay__label">%s</p>', esc_html($label));
        }
        if ($pill !== '') {
            printf('<p class="dcc_hero-overlay__dates">%s</p>', esc_html($pill));
        }
        echo '</div></div>';
    }

    /* --------------------------------------------------------------------- *
     * What is being booked
     * --------------------------------------------------------------------- */

    /** The booked room type, from the submission MotoPress is rendering. */
    public static function room_type_id(): int
    {
        return Rendered_Stay::room_type_id();
    }

    /**
     * The chosen photo's url, or '' when there is none.
     *
     * Resolved once per request: it is asked for by the filter, the preload
     * and (through the chosen attachment) the Continue card.
     */
    public function photo_url(): string
    {
        $chosen = self::photo(self::room_type_id());
        return $chosen['url'];
    }

    /**
     * THE SIZE IS CHOSEN BY MEASURED WIDTH, NOT BY NAME.
     *
     * `bravada-header` is not registered on this site, so the theme would
     * serve the full original — up to 2560px and a megabyte (Director's
     * table, 2026-10-22). Asking for one named size instead is not enough
     * either: `large` is a 1024x1024 BOUNDING BOX, so the portrait Cottage 36
     * photo comes back 768 wide from it, which is too soft for a full-bleed
     * band on a desktop.
     *
     * So: take the NARROWEST candidate at least MIN_WIDTH wide, and when
     * nothing reaches that — Cottage 22's original is 960x720 — the widest
     * there is. WordPress returns the full image for a size an attachment is
     * too small to have, so that fallback needs no special case.
     *
     * @return array{url:string,width:int,height:int,size:string}
     */
    public static function photo(int $room_type_id): array
    {
        $none = ['url' => '', 'width' => 0, 'height' => 0, 'size' => ''];
        if ($room_type_id <= 0 || !function_exists('get_post_thumbnail_id')) {
            return $none;
        }
        $attachment = (int) get_post_thumbnail_id($room_type_id);
        if ($attachment <= 0) {
            return $none;
        }

        $best = null;   // narrowest at or above the floor
        $widest = null; // fallback
        foreach (self::CANDIDATES as $size) {
            $candidate = self::local_sized($attachment, $size);
            if ($candidate === null || $candidate['width'] <= 0) {
                continue;
            }
            if ($widest === null || $candidate['width'] > $widest['width']) {
                $widest = $candidate;
            }
            if ($candidate['width'] >= self::MIN_WIDTH
                && ($best === null || $candidate['width'] < $best['width'])) {
                $best = $candidate;
            }
        }

        $chosen = $best ?? $widest;
        if ($chosen === null) {
            return $none;
        }
        return [
            'url'    => $chosen['url'],
            'width'  => $chosen['width'],
            'height' => $chosen['height'],
            'size'   => $chosen['size'],
        ];
    }

    /**
     * ONE SIZE OF ONE ATTACHMENT, AS A FILE ON THIS SERVER — NOT AS PHOTON
     * SERVES IT (v0.35.1, item 4; the Director's live measurement 2026-10-23).
     *
     * WHAT WENT WRONG IN 0.35.0. This asked `wp_get_attachment_image_src()`,
     * and on this site Jetpack's Site Accelerator filters that into
     *
     *     https://i0.wp.com/…/Cottage-34-Photos-17.jpg?fit=1024,768
     *
     * — the ORIGINAL file's name, on another host, with the size in a query
     * string. Two consequences, and the second is the one that hid the first:
     * Photon re-encodes that to a 76 KB WebP when the twin beside the sized
     * file is 53 KB (Cottage 36: 124 KB against 86 KB); and `prefer_webp()`'s
     * `/\.(jpe?g|png)$/` could never match a URL ending `?fit=1024,768`, so
     * the twin lookup was dead code on every request. It was green in the
     * suite because the fixture's URLs were local ones.
     *
     * SO THE URL IS BUILT FROM THE ATTACHMENT'S OWN METADATA. `sizes[<size>]`
     * carries the real sized FILENAME (`…-1024x768.jpg`) and its real pixel
     * dimensions, and the uploads base URL plus the original's subdirectory
     * carries the rest. Nothing here passes through `image_downsize`, which is
     * the filter Photon rewrites on, so there is nothing to opt out of.
     *
     * The floor in `photo()` needs TRUE dimensions, and these are the stored
     * ones rather than a bounding box — which is what makes portrait Cottage
     * 36 resolve honestly.
     *
     * A missing or unusable metadata row falls back to
     * `wp_get_attachment_image_src()`, today's behaviour: a Photon URL is a
     * working photo, and a broken header is not.
     *
     * @return array{url:string,width:int,height:int,size:string}|null
     */
    public static function local_sized(int $attachment, string $size): ?array
    {
        if ($attachment <= 0 || $size === '') {
            return null;
        }

        $meta = function_exists('wp_get_attachment_metadata')
            ? wp_get_attachment_metadata($attachment)
            : null;
        $uploads = function_exists('wp_get_upload_dir') ? wp_get_upload_dir() : null;
        $original = function_exists('get_attached_file') ? get_attached_file($attachment) : '';

        if (is_array($meta) && is_array($uploads) && is_string($original) && $original !== ''
            && !empty($uploads['baseurl']) && !empty($uploads['basedir'])) {
            $file = null;
            $width = 0;
            $height = 0;
            if ($size === 'full') {
                $file = basename($original);
                $width = (int) ($meta['width'] ?? 0);
                $height = (int) ($meta['height'] ?? 0);
            } elseif (isset($meta['sizes'][$size]) && is_array($meta['sizes'][$size])) {
                $row = $meta['sizes'][$size];
                $file = isset($row['file']) ? basename((string) $row['file']) : null;
                $width = (int) ($row['width'] ?? 0);
                $height = (int) ($row['height'] ?? 0);
            }

            if (!is_string($file) || $file === '' || $width <= 0) {
                /* THE METADATA IS READABLE AND SAYS THIS SIZE DOES NOT EXIST.
                   That is an answer, not a failure: WordPress never generates
                   a size whose box is not smaller than the original, which is
                   exactly how a 960-wide cottage photo has no `large`. Saying
                   "none" here lets `photo()` fall to the `full` candidate — and
                   keeps that cottage on the LOCAL file, where its twin is. The
                   fallback below is for an attachment with no usable metadata
                   at all, and letting a missing SIZE reach it would hand that
                   cottage a Photon URL and lose its 40 KB twin. */
                return null;
            }

            $dir = dirname($original);
            $path = $dir . '/' . $file;
            /* The URL is the base URL plus the SAME subdirectory the file
               is in on disk, so the two can never name different files. */
            $sub = ltrim(str_replace('\\', '/', substr($dir, strlen((string) $uploads['basedir']))), '/');
            $url = rtrim((string) $uploads['baseurl'], '/')
                . ($sub !== '' ? '/' . $sub : '') . '/' . $file;
            /* THE TWIN IF IT IS THERE; OTHERWISE WHATEVER THE SITE
               NORMALLY SERVES. Returning the local JPEG when no twin
               exists would be a step BACKWARDS on this site — Photon's
               re-encode of it is smaller than the JPEG — so the only
               reason to leave `image_downsize` behind is a real twin.
               The DIMENSIONS stay the metadata's either way: they are the
               true pixels, which is what the floor in `photo()` needs,
               and a Photon URL does not state them. */
            $twin = self::webp_twin($path, $url);
            if ($twin === $url) {
                $src = wp_get_attachment_image_src($attachment, $size);
                if (is_array($src) && !empty($src[0])) {
                    $twin = (string) $src[0];
                }
            }
            return [
                'url'    => $twin,
                'width'  => $width,
                'height' => $height,
                'size'   => $size,
            ];
        }

        $src = wp_get_attachment_image_src($attachment, $size);
        if (!is_array($src) || empty($src[0])) {
            return null;
        }
        return [
            'url'    => self::prefer_webp($attachment, (string) $src[0]),
            'width'  => (int) ($src[1] ?? 0),
            'height' => (int) ($src[2] ?? 0),
            'size'   => $size,
        ];
    }

    /**
     * THE WEBP TWIN, WHEN THE FILE IS REALLY THERE (Director, live,
     * 2026-10-22; re-measured 2026-10-23).
     *
     * Every sized file on this site has a `.webp` beside it with the extension
     * SWAPPED — `…-1024x768.jpg` next to `…-1024x768.webp` — served as
     * `200 image/webp`. The `…jpg.webp` form 404s, which is why this swaps
     * rather than appends.
     *
     * WHY THIS PLUGIN HAS TO DO IT: the chosen URL goes into a CSS background
     * and a preload link. SpeedyCache's rewriting only touches `<img>`
     * elements and Photon only rewrites what passes through `image_downsize`,
     * so nothing else on the page would ever serve the twin here. It is the
     * difference between 76 KB and 53 KB on Cottage 34 and between 124 KB and
     * 86 KB on portrait Cottage 36, on the one request that blocks the top of
     * the page.
     *
     * THE FILE IS CHECKED ON DISK, NEVER GUESSED FROM THE NAME. A twin that
     * does not exist would be a broken header; the JPEG always exists.
     *
     * @param string $path The sized file's absolute path on this server.
     * @param string $url  The URL that names that same file.
     */
    public static function webp_twin(string $path, string $url): string
    {
        if ($path === '' || $url === '') {
            return $url;
        }
        if (!preg_match('/\.(jpe?g|png)$/i', $path)) {
            return $url; // already a webp, or something this does not know
        }
        $twin = (string) preg_replace('/\.(jpe?g|png)$/i', '.webp', $path);
        if ($twin === '' || $twin === $path || !file_exists($twin)) {
            return $url;
        }
        /* THE URL IS SWAPPED ON ITS PATH ONLY. A query string ("?fit=1024,768")
           must not be matched as the extension — that is exactly the bug this
           release fixes, and `$url` is the caller's to keep intact. */
        $parts = explode('?', $url, 2);
        $swapped = (string) preg_replace('/\.(jpe?g|png)$/i', '.webp', $parts[0]);
        if ($swapped === '' || $swapped === $parts[0]) {
            return $url;
        }
        return $swapped . (isset($parts[1]) ? '?' . $parts[1] : '');
    }

    /**
     * The twin for a URL whose file is found through the attachment.
     *
     * Kept for callers that already hold a URL rather than a path — the
     * Continue card's thumbnail. It resolves the file beside the ORIGINAL,
     * which is the only path WordPress will state without guessing at the
     * uploads layout, and then defers to `webp_twin()` so there is one rule
     * about what a twin is.
     */
    public static function prefer_webp(int $attachment, string $url): string
    {
        if ($url === '' || $attachment <= 0 || !function_exists('get_attached_file')) {
            return $url;
        }
        $original = get_attached_file($attachment);
        if (!is_string($original) || $original === '') {
            return $url;
        }
        /* The PATH decides, and it is read from the URL's path component so a
           Photon URL's query string cannot defeat the match. */
        $file = basename((string) parse_url(explode('?', $url, 2)[0], PHP_URL_PATH));
        if ($file === '') {
            return $url;
        }
        return self::webp_twin(dirname($original) . '/' . $file, $url);
    }

    /**
     * "Coconut Cottage" — the name without its number.
     *
     * MotoPress titles these "Cottage 34: Coconut Cottage" (the Director's
     * read of the Add New step: "Cottage 36: Sunshine Suite"). A title
     * without a colon is shown whole, because a title this does not recognise
     * is still the owner's own words for the cottage.
     */
    public function cottage_name(): string
    {
        [$label, $name] = $this->split_title();
        return $name;
    }

    /** "Cottage 34", or '' when the title does not carry one. */
    public function cottage_label(): string
    {
        [$label, $name] = $this->split_title();
        return $label;
    }

    /**
     * NOTHING IS INVENTED HERE. The G mockup showed "Cottage 34 · Studio ·
     * 1 Queen"; "Studio · 1 Queen" is not in the title and this does not go
     * looking for it in attributes it has never read. Rob's instruction was
     * to show that line only if it comes from the cottage's own fields, and
     * the honest answer today is that only the title is known.
     *
     * @return array{0:string,1:string} [label, name]
     */
    private function split_title(): array
    {
        $id = self::room_type_id();
        if ($id <= 0) {
            return ['', ''];
        }
        $title = (string) get_the_title($id);
        $title = trim(wp_strip_all_tags($title));
        if ($title === '') {
            return ['', ''];
        }
        $parts = explode(':', $title, 2);
        if (count($parts) === 2 && trim($parts[1]) !== '') {
            return [trim($parts[0]), trim($parts[1])];
        }
        return ['', $title];
    }

    /** "Mon, Nov 16 → Thu, Nov 19 · 3 Nights", or '' when the dates are not readable. */
    public function dates_pill(): string
    {
        return self::stay_dates_text();
    }

    /**
     * The stay as one line, for the hero's pill AND the desktop summary card
     * (item 8).
     *
     * Static and shared so the two cannot word the same stay differently —
     * the card sits beside the photo on a desktop and the guest reads both at
     * once.
     */
    public static function stay_dates_text(): string
    {
        /* THE STAY THIS PAGE IS RENDERING, not the stay that was posted
           (v0.35.1, item 1). A plain GET after a POST has no $_POST at all and
           MotoPress rebuilds the form from its own cookies; reading only the
           submission left the hero — and this pill — blank on a page that was
           otherwise the new layout. See class-rendered-stay.php for why the
           cookie fallback is NOT in Checkout_Request. */
        [$in, $out] = Rendered_Stay::dates();
        if ($in === null || $out === null) {
            return '';
        }
        $nights = Rendered_Stay::nights();
        /* translators: the date format for the checkout's header pill, e.g. "Mon, Nov 16". */
        $format = _x('D, M j', 'checkout hero date', 'dcc-checkout');
        $range  = sprintf(
            /* translators: 1: check-in date, 2: check-out date. */
            _x('%1$s → %2$s', 'checkout hero dates', 'dcc-checkout'),
            date_i18n($format, $in),
            date_i18n($format, $out)
        );
        if ($nights <= 0) {
            return $range;
        }
        return $range . ' · ' . sprintf(
            /* translators: %s: number of nights. */
            _n('%s Night', '%s Nights', $nights, 'dcc-checkout'),
            number_format_i18n($nights)
        );
    }
}
