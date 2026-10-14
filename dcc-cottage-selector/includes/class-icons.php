<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Inline SVG for the Font Awesome icons this plugin ships as DEFAULTS (0.53.1).
 *
 * Why inline: the icons must render on every page, including cottage pages where
 * Elementor has not loaded the Font Awesome font. An inline <svg> needs no font,
 * no request and no library, and inherits the label's colour (fill: currentColor),
 * so it turns white on the coral hover with the text. When an editor picks one of
 * these three icons in the panel it renders the same way; any OTHER icon still goes
 * through Elementor's Icons_Manager exactly as before.
 *
 * Paths: Font Awesome Free 5.15.4 (solid), https://fontawesome.com
 * License: icons CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/),
 * see https://fontawesome.com/license/free. Copied verbatim from the
 * @fortawesome/free-solid-svg-icons@5.15.4 package; only the three below.
 */
final class Icons
{
    /** value => [viewBox width, viewBox height, path] */
    private const SVG = [
        'fas fa-clipboard-check' => [384, 512, 'M336 64h-80c0-35.3-28.7-64-64-64s-64 28.7-64 64H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48zM192 40c13.3 0 24 10.7 24 24s-10.7 24-24 24-24-10.7-24-24 10.7-24 24-24zm121.2 231.8l-143 141.8c-4.7 4.7-12.3 4.6-17-.1l-82.6-83.3c-4.7-4.7-4.6-12.3.1-17L99.1 285c4.7-4.7 12.3-4.6 17 .1l46 46.4 106-105.2c4.7-4.7 12.3-4.6 17 .1l28.2 28.4c4.7 4.8 4.6 12.3-.1 17z'],
        'fas fa-balance-scale' => [640, 512, 'M256 336h-.02c0-16.18 1.34-8.73-85.05-181.51-17.65-35.29-68.19-35.36-85.87 0C-2.06 328.75.02 320.33.02 336H0c0 44.18 57.31 80 128 80s128-35.82 128-80zM128 176l72 144H56l72-144zm511.98 160c0-16.18 1.34-8.73-85.05-181.51-17.65-35.29-68.19-35.36-85.87 0-87.12 174.26-85.04 165.84-85.04 181.51H384c0 44.18 57.31 80 128 80s128-35.82 128-80h-.02zM440 320l72-144 72 144H440zm88 128H352V153.25c23.51-10.29 41.16-31.48 46.39-57.25H528c8.84 0 16-7.16 16-16V48c0-8.84-7.16-16-16-16H383.64C369.04 12.68 346.09 0 320 0s-49.04 12.68-63.64 32H112c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h129.61c5.23 25.76 22.87 46.96 46.39 57.25V448H112c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h416c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16z'],
        'fas fa-hat-wizard' => [512, 512, 'M496 448H16c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h480c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zm-304-64l-64-32 64-32 32-64 32 64 64 32-64 32-16 32h208l-86.41-201.63a63.955 63.955 0 0 1-1.89-45.45L416 0 228.42 107.19a127.989 127.989 0 0 0-53.46 59.15L64 416h144l-16-32zm64-224l16-32 16 32 32 16-32 16-16 32-16-32-32-16 32-16z'],
    ];

    /** The Elementor icon VALUES this class renders itself. */
    public static function values(): array
    {
        return array_keys(self::SVG);
    }

    /**
     * Decorative inline SVG for a Font Awesome value, or '' when this class does not
     * carry it. Height 1em; the width follows the glyph's own proportions, as the
     * font glyph's advance width does.
     */
    public static function svg(string $value): string
    {
        $value = trim($value);
        if (!isset(self::SVG[$value])) {
            return '';
        }
        [$w, $h, $d] = self::SVG[$value];
        return '<svg class="dccs-svg-icon" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
            . (int) $w . ' ' . (int) $h . '"><path fill="currentColor" d="' . $d . '"/></svg>';
    }
}
