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
        return Checkout_Request::posted_room_type_id();
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
            $src = wp_get_attachment_image_src($attachment, $size);
            if (!is_array($src) || empty($src[0])) {
                continue;
            }
            $candidate = [
                'url'    => (string) $src[0],
                'width'  => (int) ($src[1] ?? 0),
                'height' => (int) ($src[2] ?? 0),
                'size'   => $size,
            ];
            if ($candidate['width'] <= 0) {
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

        $chosen = $best ?? $widest ?? $none;
        if ($chosen['url'] !== '') {
            $chosen['url'] = self::prefer_webp($attachment, $chosen['url']);
        }
        return $chosen;
    }

    /**
     * THE WEBP TWIN, WHEN THERE IS ONE (Director, live, 2026-10-22).
     *
     * Every sized file on this site has a `.webp` beside it with the extension
     * SWAPPED — `…-1024x768.jpg` next to `…-1024x768.webp` — and that URL is
     * served as `200 image/webp`. The `…jpg.webp` form 404s, which is why this
     * swaps rather than appends.
     *
     * WHY THIS PLUGIN HAS TO DO IT: the chosen URL goes into a CSS background
     * and a preload link, and SpeedyCache's rewriting only touches `<img>`
     * elements — so nothing else on the page would ever serve the twin here.
     * It is the difference between 128 KB and 53 KB on Cottage 34, and between
     * 236 KB and 86 KB on portrait Cottage 36, on the one request that blocks
     * the top of the page.
     *
     * The file is checked on DISK, not guessed from the name: a twin that does
     * not exist would be a broken header, and the JPEG always does.
     */
    public static function prefer_webp(int $attachment, string $url): string
    {
        if ($url === '' || $attachment <= 0) {
            return $url;
        }
        if (!preg_match('/\.(jpe?g|png)$/i', $url)) {
            return $url; // already a webp, or something this does not know
        }
        if (!function_exists('get_attached_file')) {
            return $url;
        }

        $original = get_attached_file($attachment);
        if (!is_string($original) || $original === '') {
            return $url;
        }
        $path = (string) parse_url($url, PHP_URL_PATH);
        $file = basename($path);
        if ($file === '') {
            return $url;
        }
        $twin = (string) preg_replace('/\.(jpe?g|png)$/i', '.webp', $file);
        if ($twin === '' || $twin === $file) {
            return $url;
        }
        /* The sized files sit beside the original, which is the only path
           WordPress will tell us without guessing at the uploads layout. */
        if (!file_exists(dirname($original) . '/' . $twin)) {
            return $url;
        }
        return (string) preg_replace('/\.(jpe?g|png)$/i', '.webp', $url);
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
        [$in, $out] = Checkout_Request::stay_dates();
        if ($in === null || $out === null) {
            return '';
        }
        $nights = Checkout_Request::nights();
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
