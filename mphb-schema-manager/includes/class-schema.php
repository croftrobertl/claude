<?php
/**
 * Front-end JSON-LD emitter.
 *
 * On wp_head, merges the three layers (site default -> accommodation-type
 * template default -> per-document override), resolves dynamic tokens (incl.
 * live MotoPress price / availability via {@see Data}), links everything into
 * one @graph, and prints a single <script type="application/ld+json"> block.
 */

namespace MPHBSchema;

use DateTimeImmutable;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema
{
    public const OPT_SITE    = 'mphbsch_schema_defaults';
    public const OPT_COTTAGE = 'mphbsch_schema_cottage_defaults';

    private const AVAIL_DAYS = 90;

    public static function render(): void
    {
        if (is_feed() || is_404()) {
            return;
        }
        try {
            $ctx   = self::context();
            $graph = self::collect_graph($ctx);
            if (empty($graph)) {
                return;
            }
            $doc = [
                '@context' => 'https://schema.org',
                '@graph'   => array_values($graph),
            ];
            $json = wp_json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                return;
            }
            $json = str_replace('</', '<\/', $json);
            echo "\n<script type=\"application/ld+json\">{$json}</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput
        } catch (\Throwable $e) {
            error_log('MPHBSchema: schema render failed: ' . $e->getMessage());
        }
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    private static function collect_graph(array $ctx): array
    {
        $blocks = [];

        $site = (array) get_option(self::OPT_SITE, []);
        foreach (Schema_Types::by_scope(Schema_Types::SCOPE_SITE) as $key => $def) {
            $values = (array) ($site[$key] ?? []);
            if (($values['enable'] ?? '') !== 'yes') {
                continue;
            }
            $block = self::build($def['builder'], self::resolve($values, $ctx), $ctx);
            if ($block !== null) {
                $blocks[$key] = $block;
            }
        }

        if (!empty($ctx['cottage_id'])) {
            $tpl = (array) get_option(self::OPT_COTTAGE, []);
            foreach (Schema_Types::by_scope(Schema_Types::SCOPE_COTTAGE) as $key => $def) {
                $merged = self::merge_cottage_values($key, $def, (array) ($tpl[$key] ?? []), $ctx['document']);
                if ($merged === null) {
                    continue;
                }
                $block = self::build($def['builder'], self::resolve($merged, $ctx), $ctx);
                if ($block !== null) {
                    $blocks[$key] = $block;
                }
            }
        }

        if ($ctx['document'] !== null && !empty($ctx['post_type'])) {
            foreach (Schema_Types::by_scope(Schema_Types::SCOPE_DOCUMENT) as $key => $def) {
                if (!Schema_Types::applies_to_post_type($def, (string) $ctx['post_type'])) {
                    continue;
                }
                $values = self::doc_values($key, $def, $ctx['document']);
                if (($values['enable'] ?? '') !== 'yes') {
                    continue;
                }
                if ($key === 'custom_jsonld') {
                    foreach (self::custom_nodes(self::resolve($values, $ctx)) as $i => $node) {
                        $blocks['custom_' . $i] = $node;
                    }
                    continue;
                }
                $block = self::build($def['builder'], self::resolve($values, $ctx), $ctx);
                if ($block !== null) {
                    $blocks[$key] = $block;
                }
            }
        }

        return self::link_graph($blocks, $ctx);
    }

    /**
     * @return array<string,mixed>
     */
    private static function doc_values(string $key, array $def, $document): array
    {
        $prefix = 'mphbsch_s_' . $key . '_';
        $out    = ['enable' => self::doc_get($document, $prefix . 'enable')];
        foreach ((array) ($def['fields'] ?? []) as $field) {
            $out[$field['name']] = self::doc_get($document, $prefix . $field['name']);
        }
        return $out;
    }

    /**
     * @return array<string,mixed>|null
     */
    private static function merge_cottage_values(string $key, array $def, array $template, $document): ?array
    {
        $prefix = 'mphbsch_s_' . $key . '_';
        $mode   = $document ? (string) self::doc_get($document, $prefix . 'mode') : '';
        if ($mode === '') {
            $mode = 'inherit';
        }
        if ($mode === 'disable') {
            return null;
        }
        if (($template['enable'] ?? '') !== 'yes' && $mode !== 'override') {
            return null;
        }

        $values = $template;
        if ($mode === 'override') {
            foreach ((array) ($def['fields'] ?? []) as $field) {
                $name = $field['name'];
                $ov   = self::doc_get($document, $prefix . $name);
                if (is_array($ov) ? !empty($ov) : ($ov !== '' && $ov !== null)) {
                    $values[$name] = $ov;
                }
            }
        }
        return $values;
    }

    private static function doc_get($document, string $control_id)
    {
        if (!$document || !method_exists($document, 'get_settings')) {
            return '';
        }
        try {
            return $document->get_settings($control_id);
        } catch (\Throwable $e) {
            return '';
        }
    }

    /**
     * @return array<string,mixed>
     */
    private static function context(): array
    {
        $post_id   = (is_singular() ? get_queried_object_id() : 0);
        $permalink = $post_id ? (string) get_permalink($post_id) : home_url('/');
        $post_type = $post_id ? (string) get_post_type($post_id) : '';

        $document = null;
        if ($post_id && class_exists('\\Elementor\\Plugin')) {
            try {
                $document = \Elementor\Plugin::$instance->documents->get($post_id);
            } catch (\Throwable $e) {
                $document = null;
            }
        }

        $ctx = [
            'post_id'    => $post_id,
            'post_type'  => $post_type,
            'permalink'  => $permalink,
            'document'   => $document,
            'cottage_id' => 0,
            'tokens'     => [
                '{{site_name}}'      => (string) get_bloginfo('name'),
                '{{permalink}}'      => $permalink,
                '{{home_url}}'       => home_url('/'),
                '{{title}}'          => $post_id ? (string) get_the_title($post_id) : '',
                '{{featured_image}}' => $post_id ? (string) get_the_post_thumbnail_url($post_id, 'large') : '',
                '{{author}}'         => $post_id ? (string) get_the_author_meta('display_name', (int) get_post_field('post_author', $post_id)) : '',
            ],
        ];

        if ($post_type === 'mphb_room_type' && $post_id) {
            $ctx['cottage_id'] = $post_id;
            $price             = Data::cottage_price($post_id);
            $instock           = self::cottage_instock($post_id);
            $ctx['tokens']['{{cottage_name}}']      = (string) get_the_title($post_id);
            $ctx['tokens']['{{cottage_excerpt}}']   = self::plain_excerpt($post_id);
            $ctx['tokens']['{{cottage_image}}']     = (string) get_the_post_thumbnail_url($post_id, 'large');
            $ctx['tokens']['{{mphb_price}}']        = $price !== null ? (string) $price : '';
            $ctx['tokens']['{{mphb_availability}}'] = $instock ? 'InStock' : 'OutOfStock';
            $ctx['price']   = $price;
            $ctx['instock'] = $instock;
        }

        return $ctx;
    }

    /**
     * @param mixed $values
     * @return mixed
     */
    private static function resolve($values, array $ctx)
    {
        $tokens = (array) ($ctx['tokens'] ?? []);
        if (is_string($values)) {
            return strtr($values, $tokens);
        }
        if (is_array($values)) {
            $out = [];
            foreach ($values as $k => $v) {
                $out[$k] = self::resolve($v, $ctx);
            }
            return $out;
        }
        return $values;
    }

    private static function plain_excerpt(int $post_id): string
    {
        $post = get_post($post_id);
        if (!$post) {
            return '';
        }
        $text = $post->post_excerpt !== '' ? $post->post_excerpt : wp_strip_all_tags((string) $post->post_content);
        $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
        return mb_substr($text, 0, 300);
    }

    private static function cottage_instock(int $cottage_id): bool
    {
        try {
            $from  = Data::today();
            $to    = $from->modify('+' . self::AVAIL_DAYS . ' days');
            $avail = Data::get_availability([$cottage_id], $from, $to);
            foreach ((array) ($avail[$cottage_id] ?? []) as $status) {
                if ($status === Data::ST_AVAIL) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            error_log('MPHBSchema: cottage_instock failed: ' . $e->getMessage());
            return true; // fail open
        }
        return false;
    }

    /* --------------------------------------------------------------------- */
    /* Builders                                                               */
    /* --------------------------------------------------------------------- */

    /**
     * @return array<string,mixed>|null
     */
    private static function build(string $method, array $values, array $ctx): ?array
    {
        if (!method_exists(self::class, $method)) {
            return null;
        }
        try {
            return self::{$method}($values, $ctx);
        } catch (\Throwable $e) {
            error_log("MPHBSchema: schema builder {$method} failed: " . $e->getMessage());
            return null;
        }
    }

    private static function build_organization(array $v, array $ctx): ?array
    {
        if (($v['name'] ?? '') === '') {
            return null;
        }
        $node = [
            '@type' => Schema_Types::get('organization')['type'],
            '@id'   => self::id($ctx, 'organization'),
            'name'  => (string) $v['name'],
            'url'   => home_url('/'),
        ];
        self::set_if($node, 'description', $v['description'] ?? '');
        self::set_if($node, 'telephone', $v['telephone'] ?? '');
        self::set_if($node, 'email', $v['email'] ?? '');
        self::set_if($node, 'image', $v['image'] ?? '');
        self::set_if($node, 'priceRange', $v['price_range'] ?? '');

        $address = self::postal_address($v);
        if ($address !== null) {
            $node['address'] = $address;
        }
        if (($v['latitude'] ?? '') !== '' && ($v['longitude'] ?? '') !== '') {
            $node['geo'] = [
                '@type'     => 'GeoCoordinates',
                'latitude'  => (string) $v['latitude'],
                'longitude' => (string) $v['longitude'],
            ];
        }
        $same_as = self::lines($v['same_as'] ?? '');
        if (!empty($same_as)) {
            $node['sameAs'] = $same_as;
        }
        return $node;
    }

    private static function build_website(array $v, array $ctx): ?array
    {
        $name = ($v['name'] ?? '') !== '' ? (string) $v['name'] : (string) get_bloginfo('name');
        $node = [
            '@type' => 'WebSite',
            '@id'   => self::id($ctx, 'website'),
            'name'  => $name,
            'url'   => home_url('/'),
        ];
        $search = (string) ($v['search_url'] ?? '');
        if ($search !== '') {
            $node['potentialAction'] = [
                '@type'       => 'SearchAction',
                'target'      => ['@type' => 'EntryPoint', 'urlTemplate' => $search],
                'query-input' => 'required name=search_term_string',
            ];
        }
        return $node;
    }

    private static function build_vacation_rental(array $v, array $ctx): ?array
    {
        $name = (string) ($v['name'] ?? '');
        if ($name === '') {
            return null;
        }
        $node = [
            '@type' => 'VacationRental',
            '@id'   => self::id($ctx, 'vacation_rental'),
            'name'  => $name,
            'url'   => $ctx['permalink'],
        ];
        self::set_if($node, 'description', $v['description'] ?? '');
        if (($v['image'] ?? '') !== '') {
            $node['image'] = (string) $v['image'];
        }
        if (($v['occupancy'] ?? '') !== '' && is_numeric($v['occupancy'])) {
            $node['occupancy'] = ['@type' => 'QuantitativeValue', 'value' => (int) $v['occupancy']];
        }
        $amenities = self::lines($v['amenities'] ?? '');
        if (!empty($amenities)) {
            $node['amenityFeature'] = array_map(
                static fn(string $a): array => ['@type' => 'LocationFeatureSpecification', 'name' => $a, 'value' => true],
                $amenities
            );
        }
        $site = (array) (get_option(self::OPT_SITE, [])['organization'] ?? []);
        $addr = self::postal_address($site);
        if ($addr !== null) {
            $node['address'] = $addr;
        }

        $offer = self::build_offer($v, $ctx);
        if ($offer !== null) {
            $node['makesOffer'] = $offer;
        }
        return $node;
    }

    /**
     * @return array<string,mixed>|null
     */
    private static function build_offer(array $v, array $ctx): ?array
    {
        $price = '';
        if (($v['auto_price'] ?? 'yes') === 'yes' && isset($ctx['price']) && $ctx['price'] !== null) {
            $price = (string) $ctx['price'];
        } elseif (($v['price'] ?? '') !== '') {
            $price = (string) $v['price'];
        }
        if ($price === '' || !is_numeric($price)) {
            return null;
        }

        $availability = 'https://schema.org/InStock';
        if (($v['auto_avail'] ?? 'yes') === 'yes' && isset($ctx['instock'])) {
            $availability = $ctx['instock'] ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
        }

        $currency = (string) ($v['currency'] ?? 'USD');
        return [
            '@type'              => 'Offer',
            'availability'       => $availability,
            'price'              => $price,
            'priceCurrency'      => $currency,
            'url'                => $ctx['permalink'],
            'priceSpecification' => [
                '@type'         => 'UnitPriceSpecification',
                'price'         => $price,
                'priceCurrency' => $currency,
                'unitCode'      => 'DAY',
            ],
        ];
    }

    private static function build_faqpage(array $v, array $ctx): ?array
    {
        $items = [];
        foreach ((array) ($v['items'] ?? []) as $row) {
            $q = trim((string) ($row['question'] ?? ''));
            $a = trim((string) ($row['answer'] ?? ''));
            if ($q === '' || $a === '') {
                continue;
            }
            $items[] = [
                '@type'          => 'Question',
                'name'           => $q,
                'acceptedAnswer' => ['@type' => 'Answer', 'text' => $a],
            ];
        }
        if (empty($items)) {
            return null;
        }
        return [
            '@type'      => 'FAQPage',
            '@id'        => self::id($ctx, 'faqpage'),
            'mainEntity' => $items,
        ];
    }

    private static function build_breadcrumb(array $v, array $ctx): ?array
    {
        $list = [];
        $pos  = 1;
        foreach ((array) ($v['items'] ?? []) as $row) {
            $name = trim((string) ($row['name'] ?? ''));
            $url  = trim((string) ($row['url'] ?? ''));
            if ($name === '') {
                continue;
            }
            $item = ['@type' => 'ListItem', 'position' => $pos, 'name' => $name];
            if ($url !== '') {
                $item['item'] = $url;
            }
            $list[] = $item;
            $pos++;
        }
        if (empty($list)) {
            return null;
        }
        return [
            '@type'           => 'BreadcrumbList',
            '@id'             => self::id($ctx, 'breadcrumb'),
            'itemListElement' => $list,
        ];
    }

    private static function build_article(array $v, array $ctx): ?array
    {
        $headline = (string) ($v['headline'] ?? '');
        if ($headline === '') {
            return null;
        }
        $node = [
            '@type'    => 'Article',
            '@id'      => self::id($ctx, 'article'),
            'headline' => $headline,
            'url'      => $ctx['permalink'],
        ];
        self::set_if($node, 'image', $v['image'] ?? '');
        if (($v['author'] ?? '') !== '') {
            $node['author'] = ['@type' => 'Person', 'name' => (string) $v['author']];
        }
        if (!empty($ctx['post_id'])) {
            $node['datePublished'] = (string) get_post_time('c', true, $ctx['post_id']);
            $node['dateModified']  = (string) get_post_modified_time('c', true, $ctx['post_id']);
        }
        return $node;
    }

    /**
     * Expand the raw JSON-LD field into a list of graph nodes. Accepts a single
     * object, a list of objects, or a {"@graph":[...]} wrapper.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function custom_nodes(array $v): array
    {
        $raw = trim((string) ($v['raw'] ?? ''));
        if ($raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }
        if (isset($decoded['@graph']) && is_array($decoded['@graph'])) {
            $decoded = $decoded['@graph'];
        }
        $is_list = array_keys($decoded) === range(0, count($decoded) - 1);
        $nodes   = $is_list ? $decoded : [$decoded];

        $out = [];
        foreach ($nodes as $node) {
            if (is_array($node)) {
                unset($node['@context']);
                $out[] = $node;
            }
        }
        return $out;
    }

    /* --------------------------------------------------------------------- */
    /* Graph linking + helpers                                                */
    /* --------------------------------------------------------------------- */

    /**
     * @param array<string,array<string,mixed>> $blocks
     * @return array<int,array<string,mixed>>
     */
    private static function link_graph(array $blocks, array $ctx): array
    {
        $org_id = self::id($ctx, 'organization');
        $web_id = self::id($ctx, 'website');

        if (isset($blocks['website'], $blocks['organization'])) {
            $blocks['website']['publisher'] = ['@id' => $org_id];
        }
        if (isset($blocks['vacation_rental'], $blocks['organization'])) {
            $blocks['vacation_rental']['containedInPlace'] = ['@id' => $org_id];
            if (isset($blocks['vacation_rental']['makesOffer'])) {
                $blocks['vacation_rental']['makesOffer']['offeredBy'] = ['@id' => $org_id];
            }
        }
        if (isset($blocks['breadcrumb'], $blocks['website'])) {
            $blocks['breadcrumb']['isPartOf'] = ['@id' => $web_id];
        }
        return array_values($blocks);
    }

    private static function id(array $ctx, string $key): string
    {
        switch ($key) {
            case 'organization':
                return home_url('/#organization');
            case 'website':
                return home_url('/#website');
            default:
                $base = (string) ($ctx['permalink'] ?? home_url('/'));
                return $base . '#' . $key;
        }
    }

    /**
     * @return array<string,mixed>|null
     */
    private static function postal_address(array $v): ?array
    {
        $map = [
            'street'   => 'streetAddress',
            'locality' => 'addressLocality',
            'region'   => 'addressRegion',
            'postal'   => 'postalCode',
            'country'  => 'addressCountry',
        ];
        $addr = ['@type' => 'PostalAddress'];
        $has  = false;
        foreach ($map as $field => $prop) {
            if (($v[$field] ?? '') !== '') {
                $addr[$prop] = (string) $v[$field];
                $has = true;
            }
        }
        return $has ? $addr : null;
    }

    private static function set_if(array &$node, string $prop, $value): void
    {
        if (is_string($value) && trim($value) !== '') {
            $node[$prop] = $value;
        }
    }

    /**
     * @return string[]
     */
    private static function lines($value): array
    {
        $out = [];
        foreach (preg_split('/\r\n|\r|\n/', (string) $value) ?: [] as $line) {
            $line = trim($line);
            if ($line !== '') {
                $out[] = $line;
            }
        }
        return $out;
    }
}
