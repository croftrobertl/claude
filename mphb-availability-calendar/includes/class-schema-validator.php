<?php
/**
 * Validation + detection helpers.
 *
 * - validate_values(): lints a type's stored values against the required /
 *   recommended properties declared in {@see Schema_Types}, returning
 *   human-readable errors/warnings for the admin Schema Health screen.
 * - detect(): fetches a rendered URL and extracts the JSON-LD actually present
 *   (this plugin's output plus anything from other plugins / Custom HTML
 *   widgets) so the owner can see what the external testers would see. Neither
 *   Google's Rich Results Test nor validator.schema.org exposes a callable API,
 *   so we parse the page ourselves and link out for the authoritative check.
 * - tools_html(): the one-click deep links shown in the Elementor panel.
 */

namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema_Validator
{
    /**
     * Map schema property names to the field(s) that satisfy them.
     *
     * @var array<string,string[]>
     */
    private const PROP_FIELDS = [
        'name'               => ['name'],
        'url'                => ['url'],
        'address'            => ['street', 'locality', 'region', 'postal', 'country'],
        'geo'                => ['latitude', 'longitude'],
        'telephone'          => ['telephone'],
        'image'              => ['image'],
        'priceRange'         => ['price_range'],
        'description'        => ['description'],
        'priceSpecification' => ['price', 'auto_price'],
        'numberOfRooms'      => ['occupancy'],
        'amenityFeature'     => ['amenities'],
        'mainEntity'         => ['items'],
        'itemListElement'    => ['items'],
        'headline'           => ['headline'],
        'datePublished'      => [],
        'author'             => ['author'],
        'potentialAction'    => ['search_url'],
    ];

    /**
     * @param array<string,mixed> $values
     * @return array{errors:string[],warnings:string[]}
     */
    public static function validate_values(string $key, array $def, array $values): array
    {
        $errors   = [];
        $warnings = [];

        foreach ((array) ($def['required'] ?? []) as $prop) {
            if (!self::satisfied($prop, $values)) {
                $errors[] = sprintf(
                    /* translators: 1: schema type label 2: property name */
                    __('%1$s is missing required property "%2$s".', 'mphb-availability-calendar'),
                    $def['label'],
                    $prop
                );
            }
        }
        foreach ((array) ($def['recommended'] ?? []) as $prop) {
            if (!self::satisfied($prop, $values)) {
                $warnings[] = sprintf(
                    /* translators: 1: schema type label 2: property name */
                    __('%1$s is missing recommended property "%2$s".', 'mphb-availability-calendar'),
                    $def['label'],
                    $prop
                );
            }
        }

        return ['errors' => $errors, 'warnings' => $warnings];
    }

    /**
     * @param array<string,mixed> $values
     */
    private static function satisfied(string $prop, array $values): bool
    {
        $fields = self::PROP_FIELDS[$prop] ?? [$prop];
        if (empty($fields)) {
            return true; // auto-derived (e.g. datePublished) — not user-entered
        }
        foreach ($fields as $f) {
            $v = $values[$f] ?? '';
            if (is_array($v) ? !empty($v) : (trim((string) $v) !== '')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Fetch a URL and extract the JSON-LD blocks present in its markup.
     *
     * @return array{types:string[],count:int,invalid:int,error:string,duplicates:bool}
     */
    public static function detect(string $url): array
    {
        $result = ['types' => [], 'count' => 0, 'invalid' => 0, 'error' => '', 'duplicates' => false];
        $resp   = wp_remote_get($url, ['timeout' => 15, 'redirection' => 3]);
        if (is_wp_error($resp)) {
            $result['error'] = $resp->get_error_message();
            return $result;
        }
        $body = (string) wp_remote_retrieve_body($resp);
        if ($body === '') {
            $result['error'] = __('Empty response.', 'mphb-availability-calendar');
            return $result;
        }

        if (!preg_match_all('#<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is', $body, $m)) {
            return $result;
        }
        foreach ($m[1] as $raw) {
            $result['count']++;
            $decoded = json_decode(trim($raw), true);
            if (!is_array($decoded)) {
                $result['invalid']++;
                continue;
            }
            foreach (self::types_in($decoded) as $t) {
                $result['types'][] = $t;
            }
        }
        $result['duplicates'] = count($result['types']) !== count(array_unique($result['types']));
        $result['types']      = array_values(array_unique($result['types']));
        return $result;
    }

    /**
     * Collect every @type string within a decoded JSON-LD structure.
     *
     * @param mixed $node
     * @return string[]
     */
    private static function types_in($node): array
    {
        $out = [];
        if (!is_array($node)) {
            return $out;
        }
        if (isset($node['@type'])) {
            foreach ((array) $node['@type'] as $t) {
                if (is_string($t)) {
                    $out[] = $t;
                }
            }
        }
        foreach ($node as $v) {
            if (is_array($v)) {
                $out = array_merge($out, self::types_in($v));
            }
        }
        return $out;
    }

    public static function validator_url(string $page_url): string
    {
        return 'https://validator.schema.org/#url=' . rawurlencode($page_url);
    }

    public static function rich_results_url(string $page_url): string
    {
        return 'https://search.google.com/test/rich-results?url=' . rawurlencode($page_url);
    }

    public static function tools_html(string $page_url): string
    {
        $validator = esc_url(self::validator_url($page_url));
        $rich      = esc_url(self::rich_results_url($page_url));
        $a         = ' target="_blank" rel="noopener" style="display:inline-block;margin:4px 8px 4px 0;"';
        return '<p>' . esc_html__('Open this page in an external tester:', 'mphb-availability-calendar') . '</p>'
            . '<a href="' . $validator . '"' . $a . '>' . esc_html__('Schema Markup Validator', 'mphb-availability-calendar') . '</a>'
            . '<a href="' . $rich . '"' . $a . '>' . esc_html__('Google Rich Results Test', 'mphb-availability-calendar') . '</a>'
            . '<p class="elementor-descriptor">' . esc_html__('Save and publish first so the tester fetches the latest markup.', 'mphb-availability-calendar') . '</p>';
    }
}
