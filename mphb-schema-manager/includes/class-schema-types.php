<?php
/**
 * Structured-data type registry — the single source of truth for every
 * supported schema @type: its neutral field definitions (rendered both as
 * Elementor document controls and as admin settings fields), its scope, its
 * required/recommended properties (used by the validator), and the builder
 * method on {@see Schema} that turns its stored values into JSON-LD.
 */

namespace MPHBSchema;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema_Types
{
    public const SCOPE_SITE     = 'site';
    public const SCOPE_COTTAGE  = 'cottage';
    public const SCOPE_DOCUMENT = 'document';

    /**
     * @var array<string,array<string,mixed>>|null
     */
    private static ?array $registry = null;

    /**
     * @return array<string,array<string,mixed>>
     */
    public static function all(): array
    {
        if (self::$registry !== null) {
            return self::$registry;
        }

        $types = [
            'organization' => [
                'type'        => ['LodgingBusiness', 'VacationRentalsBusiness'],
                'label'       => __('Business / Lodging', 'mphb-schema-manager'),
                'scope'       => self::SCOPE_SITE,
                'builder'     => 'build_organization',
                'required'    => ['name', 'address'],
                'recommended' => ['telephone', 'image', 'priceRange', 'geo'],
                'fields'      => [
                    ['name' => 'name',        'label' => __('Business name', 'mphb-schema-manager'),         'type' => 'text',     'default' => ''],
                    ['name' => 'description', 'label' => __('Description', 'mphb-schema-manager'),           'type' => 'textarea', 'default' => ''],
                    ['name' => 'telephone',   'label' => __('Telephone', 'mphb-schema-manager'),             'type' => 'text',     'default' => ''],
                    ['name' => 'email',       'label' => __('Email', 'mphb-schema-manager'),                 'type' => 'text',     'default' => ''],
                    ['name' => 'image',       'label' => __('Image / logo URL', 'mphb-schema-manager'),      'type' => 'url',      'default' => ''],
                    ['name' => 'price_range', 'label' => __('Price range (e.g. $$)', 'mphb-schema-manager'), 'type' => 'text',     'default' => ''],
                    ['name' => 'street',      'label' => __('Street address', 'mphb-schema-manager'),        'type' => 'text',     'default' => ''],
                    ['name' => 'locality',    'label' => __('City / locality', 'mphb-schema-manager'),       'type' => 'text',     'default' => ''],
                    ['name' => 'region',      'label' => __('Region / state', 'mphb-schema-manager'),        'type' => 'text',     'default' => ''],
                    ['name' => 'postal',      'label' => __('Postal code', 'mphb-schema-manager'),           'type' => 'text',     'default' => ''],
                    ['name' => 'country',     'label' => __('Country code (e.g. US)', 'mphb-schema-manager'),'type' => 'text',     'default' => ''],
                    ['name' => 'latitude',    'label' => __('Latitude', 'mphb-schema-manager'),              'type' => 'text',     'default' => ''],
                    ['name' => 'longitude',   'label' => __('Longitude', 'mphb-schema-manager'),             'type' => 'text',     'default' => ''],
                    ['name' => 'same_as',     'label' => __('Social profile URLs (one per line)', 'mphb-schema-manager'), 'type' => 'textarea', 'default' => ''],
                ],
            ],

            'website' => [
                'type'        => 'WebSite',
                'label'       => __('WebSite + Search box', 'mphb-schema-manager'),
                'scope'       => self::SCOPE_SITE,
                'builder'     => 'build_website',
                'required'    => ['name', 'url'],
                'recommended' => ['potentialAction'],
                'fields'      => [
                    ['name' => 'name',       'label' => __('Site name', 'mphb-schema-manager'), 'type' => 'text', 'default' => ''],
                    ['name' => 'search_url', 'label' => __('Search results URL template', 'mphb-schema-manager'), 'type' => 'text', 'default' => '', 'description' => __('e.g. https://example.com/?s={search_term_string}', 'mphb-schema-manager')],
                ],
            ],

            'vacation_rental' => [
                'type'        => 'VacationRental',
                'label'       => __('Vacation Rental + Offer (cottage)', 'mphb-schema-manager'),
                'scope'       => self::SCOPE_COTTAGE,
                'post_types'  => ['mphb_room_type'],
                'builder'     => 'build_vacation_rental',
                'required'    => ['name', 'image', 'address'],
                'recommended' => ['description', 'priceSpecification', 'numberOfRooms', 'amenityFeature'],
                'fields'      => [
                    ['name' => 'name',        'label' => __('Name', 'mphb-schema-manager'),        'type' => 'text',     'default' => '{{cottage_name}}',    'token_hint' => true],
                    ['name' => 'description', 'label' => __('Description', 'mphb-schema-manager'), 'type' => 'textarea', 'default' => '{{cottage_excerpt}}', 'token_hint' => true],
                    ['name' => 'image',       'label' => __('Image URL', 'mphb-schema-manager'),   'type' => 'url',      'default' => '{{cottage_image}}',   'token_hint' => true],
                    ['name' => 'auto_price',  'label' => __('Auto price from MotoPress', 'mphb-schema-manager'),        'type' => 'switcher', 'default' => 'yes'],
                    ['name' => 'price',       'label' => __('Price override (per night)', 'mphb-schema-manager'),       'type' => 'text',     'default' => '{{mphb_price}}', 'token_hint' => true],
                    ['name' => 'currency',    'label' => __('Currency code', 'mphb-schema-manager'), 'type' => 'text',  'default' => 'USD'],
                    ['name' => 'auto_avail',  'label' => __('Auto availability from MotoPress', 'mphb-schema-manager'), 'type' => 'switcher', 'default' => 'yes'],
                    ['name' => 'occupancy',   'label' => __('Max occupancy', 'mphb-schema-manager'), 'type' => 'number', 'default' => ''],
                    ['name' => 'amenities',   'label' => __('Amenities (one per line)', 'mphb-schema-manager'), 'type' => 'textarea', 'default' => ''],
                ],
            ],

            'faqpage' => [
                'type'        => 'FAQPage',
                'label'       => __('FAQ', 'mphb-schema-manager'),
                'scope'       => self::SCOPE_DOCUMENT,
                'builder'     => 'build_faqpage',
                'required'    => ['mainEntity'],
                'recommended' => [],
                'fields'      => [
                    [
                        'name'   => 'items',
                        'label'  => __('Questions', 'mphb-schema-manager'),
                        'type'   => 'repeater',
                        'fields' => [
                            ['name' => 'question', 'label' => __('Question', 'mphb-schema-manager'), 'type' => 'text',     'default' => ''],
                            ['name' => 'answer',   'label' => __('Answer', 'mphb-schema-manager'),   'type' => 'textarea', 'default' => ''],
                        ],
                    ],
                ],
            ],

            'breadcrumb' => [
                'type'        => 'BreadcrumbList',
                'label'       => __('Breadcrumbs', 'mphb-schema-manager'),
                'scope'       => self::SCOPE_DOCUMENT,
                'builder'     => 'build_breadcrumb',
                'required'    => ['itemListElement'],
                'recommended' => [],
                'fields'      => [
                    [
                        'name'   => 'items',
                        'label'  => __('Crumbs', 'mphb-schema-manager'),
                        'type'   => 'repeater',
                        'fields' => [
                            ['name' => 'name', 'label' => __('Name', 'mphb-schema-manager'), 'type' => 'text', 'default' => ''],
                            ['name' => 'url',  'label' => __('URL', 'mphb-schema-manager'),  'type' => 'url',  'default' => ''],
                        ],
                    ],
                ],
            ],

            'article' => [
                'type'        => 'Article',
                'label'       => __('Article (posts)', 'mphb-schema-manager'),
                'scope'       => self::SCOPE_DOCUMENT,
                'post_types'  => ['post'],
                'builder'     => 'build_article',
                'required'    => ['headline'],
                'recommended' => ['image', 'datePublished', 'author'],
                'fields'      => [
                    ['name' => 'headline', 'label' => __('Headline override', 'mphb-schema-manager'),  'type' => 'text', 'default' => '{{title}}',          'token_hint' => true],
                    ['name' => 'image',    'label' => __('Image URL override', 'mphb-schema-manager'), 'type' => 'url',  'default' => '{{featured_image}}', 'token_hint' => true],
                    ['name' => 'author',   'label' => __('Author name', 'mphb-schema-manager'),        'type' => 'text', 'default' => '{{author}}',         'token_hint' => true],
                ],
            ],

            'custom_jsonld' => [
                'type'        => null,
                'label'       => __('Custom JSON-LD (raw)', 'mphb-schema-manager'),
                'scope'       => self::SCOPE_DOCUMENT,
                'builder'     => 'build_custom_jsonld',
                'required'    => [],
                'recommended' => [],
                'fields'      => [
                    ['name' => 'raw', 'label' => __('Raw JSON-LD', 'mphb-schema-manager'), 'type' => 'textarea', 'default' => '', 'description' => __('Paste valid JSON-LD. Imported Custom HTML markup lands here.', 'mphb-schema-manager')],
                ],
            ],
        ];

        return self::$registry = $types;
    }

    /**
     * @return array<string,array<string,mixed>>
     */
    public static function by_scope(string $scope): array
    {
        return array_filter(self::all(), static fn(array $t): bool => ($t['scope'] ?? '') === $scope);
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function get(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }

    public static function applies_to_post_type(array $type_def, string $post_type): bool
    {
        $allowed = $type_def['post_types'] ?? null;
        if ($allowed === null) {
            return true;
        }
        return in_array($post_type, (array) $allowed, true);
    }
}
