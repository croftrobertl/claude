<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The Selector's landing screen, rendered on the SERVER (0.58.0) so the page does
 * not jump when the script arrives. It must stay identical to renderLanding() in
 * assets/js/selector.js: the script's first render replaces this markup, and any
 * difference in size is a layout shift. dom-smoke 109 renders both from the same
 * config and compares the parsed DOM. Kept free of Elementor so the tests and the
 * live-page harness can load it on its own.
 */
final class Landing
{
    /**
     * The landing exactly as selector.js renderLanding() builds it: heading + intro
     * (unless the heading is off) and one button per enabled mode. Every string is
     * escaped here; the icon HTML is the plugin's own (Icons / Elementor), as in JS.
     *
     * @param array<string,mixed> $config The widget's data-config.
     */
    public static function html(array $config): string
    {
        $S     = is_array($config['strings'] ?? null) ? $config['strings'] : [];
        $icons = is_array($config['icons'] ?? null) ? $config['icons'] : [];
        $modes = is_array($config['enabledModes'] ?? null) && $config['enabledModes'] !== []
            ? $config['enabledModes'] : ['quick', 'weights', 'compare'];
        $label = ['quick' => 'mode_quick', 'weights' => 'mode_weights', 'compare' => 'mode_compare'];
        $head  = '';
        if (($config['showHeading'] ?? true) !== false) {
            $head = '<div class="dccs-head"><h2 class="dccs-heading">' . esc_html((string) ($S['heading'] ?? '')) . '</h2>'
                . '<p class="dccs-intro">' . esc_html((string) ($S['intro'] ?? '')) . '</p></div>';
        }
        $choices = '';
        foreach ($modes as $m) {
            $m    = (string) $m;
            $ico  = isset($icons['mode_' . $m]) && is_string($icons['mode_' . $m]) && $icons['mode_' . $m] !== ''
                ? '<span class="dccs-ico">' . $icons['mode_' . $m] . '</span>' : '';
            $text = isset($label[$m], $S[$label[$m]]) && (string) $S[$label[$m]] !== '' ? (string) $S[$label[$m]] : $m;
            $choices .= '<button type="button" class="dccs-landing-choice" data-mode="' . esc_attr($m) . '">' . $ico
                . '<span class="dccs-landing-choice-label">' . esc_html($text) . '</span></button>';
        }
        return '<div class="dccs-landing">' . $head
            . '<div class="dccs-landing-choices" role="group" aria-label="' . esc_attr((string) ($S['heading'] ?? '')) . '">'
            . $choices . '</div></div>';
    }
}
