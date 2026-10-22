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
        // #header-image-main-inside rather than before the photo.
        add_action(self::PRINT_HOOK, [$this, 'print_overlay'], 100);
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
            printf('<p class="dcc_hero-overlay__name">%s</p>', esc_html($name));
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

        return $best ?? $widest ?? $none;
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
