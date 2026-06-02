<?php
/**
 * Structured-data type registry.
 *
 * Single source of truth for every supported schema @type: its neutral field
 * definitions (rendered both as Elementor document controls and as admin
 * settings fields), its scope, its required/recommended properties (used by the
 * validator), and the name of the builder method on {@see Schema} that turns its
 * stored values into a JSON-LD array.
 *
 * Keeping controls, emitter, and validator all reading this one registry is what
 * stops them from drifting apart as types are added.
 */

namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema_Types
{
    /**
     * Scopes:
     *  - 'site'     : edited on the admin settings page, emitted site-wide.
     *  - 'cottage'  : the accommodation-type template default (admin page) that
     *                 every mphb_room_type inherits, overridable per cottage in
     *                 that cottage's Elementor Settings tab.
     *  - 'document' : edited per page/post in the Elementor Settings tab.
     */
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
                'label'       => __('Business / Lodging', 'mphb-availability-calendar'),
                'scope'       => self::SCOPE_SITE,
                'builder'     => 'build_organization',
                'required'    => ['name', 'address'],
                'recommended' => ['telephone', 'image', 'priceRange', 'geo'],
                'fields'      => [
                    ['name' => 'name',        'label' => __('Business name', 'mphb-availability-calendar'),        'type' => 'text',     'default' => ''],
                    ['name' => 'description', 'label' => __('Description', 'mphb-availability-calendar'),          'type' => 'textarea', 'default' => ''],
                    ['name' => 'telephone',   'label' => __('Telephone', 'mphb-availability-calendar'),            'type' => 'text',     'default' => ''],
                    ['name' => 'email',       'label' => __('Email', 'mphb-availability-calendar'),                'type' => 'text',     'default' => ''],
                    ['name' => 'image',       'label' => __('Image / logo URL', 'mphb-availability-calendar'),     'type' => 'url',      'default' => ''],
                    ['name' => 'price_range', 'label' => __('Price range (e.g. $$)', 'mphb-availability-calendar'),'type' => 'text',     'default' => ''],
                    ['name' => 'street',      'label' => __('Street address', 'mphb-availability-calendar'),       'type' => 'text',     'default' => ''],
                    ['name' => 'locality',    'label' => __('City / locality', 'mphb-availability-calendar'),      'type' => 'text',     'default' => ''],
                    ['name' => 'region',      'label' => __('Region / state', 'mphb-availability-calendar'),       'type' => 'text',     'default' => ''],
                    ['name' => 'postal',      'label' => __('Postal code', 'mphb-availability-calendar'),          'type' => 'text',     'default' => ''],
                    ['name' => 'country',     'label' => __('Country code (e.g. US)', 'mphb-availability-calendar'),'type' => 'text',    'default' => ''],
                    ['name' => 'latitude',    'label' => __('Latitude', 'mphb-availability-calendar'),             'type' => 'text',     'default' => ''],
                    ['name' => 'longitude',   'label' => __('Longitude', 'mphb-availability-calendar'),            'type' => 'text',     'default' => ''],
                    ['name' => 'same_as',     'label' => __('Social profile URLs (one per line)', 'mphb-availability-calendar'), 'type' => 'textarea', 'default' => ''],
                ],
            ],

            'website' => [
                'type'        => 'WebSite',
                'label'       => __('WebSite + Search box', 'mphb-availability-calendar'),
                'scope'       => self::SCOPE_SITE,
                'builder'     => 'build_website',
                'required'    => ['name', 'url'],
                'recommended' => ['potentialAction'],
                'fields'      => [
                    ['name' => 'name',           'label' => __('Site name', 'mphb-availability-calendar'),        'type' => 'text',     'default' => ''],
                    ['name' => 'search_url',     'label' => __('Search results URL template', 'mphb-availability-calendar'), 'type' => 'text', 'default' => '', 'description' => __('e.g. https://example.com/?s={search_term_string}', 'mphb-availability-calendar')],
                ],
            ],

            'vacation_rental' => [
                'type'        => 'VacationRental',
                'label'       => __('Vacation Rental + Offer (cottage)', 'mphb-availability-calendar'),
                'scope'       => self::SCOPE_COTTAGE,
                'post_types'  => ['mphb_room_type'],
                'builder'     => 'build_vacation_rental',
                'required'    => ['name', 'image', 'address'],
                'recommended' => ['description', 'priceSpecification', 'numberOfRooms', 'amenityFeature'],
                'fields'      => [
                    ['name' => 'name',         'label' => __('Name', 'mphb-availability-calendar'),         'type' => 'text',     'default' => '{{cottage_name}}', 'token_hint' => true],
                    ['name' => 'description',  'label' => __('Description', 'mphb-availability-calendar'),  'type' => 'textarea', 'default' => '{{cottage_excerpt}}', 'token_hint' => true],
                    ['name' => 'image',        'label' => __('Image URL', 'mphb-availability-calendar'),    'type' => 'url',      'default' => '{{cottage_image}}', 'token_hint' => true],
                    ['name' => 'auto_price',   'label' => __('Auto price from MotoPress', 'mphb-availability-calendar'),       'type' => 'switcher', 'default' => 'yes'],
                    ['name' => 'price',        'label' => __('Price override (per night)', 'mphb-availability-calendar'),      'type' => 'text', 'default' => '{{mphb_price}}', 'token_hint' => true],
                    ['name' => 'currency',     'label' => __('Currency code', 'mphb-availability-calendar'), 'type' => 'text',    'default' => 'USD'],
                    ['name' => 'auto_avail',   'label' => __('Auto availability from MotoPress', 'mphb-availability-calendar'),'type' => 'switcher', 'default' => 'yes'],
                    ['name' => 'occupancy',    'label' => __('Max occupancy', 'mphb-availability-calendar'), 'type' => 'number',  'default' => ''],
                    ['name' => 'amenities',    'label' => __('Amenities (one per line)', 'mphb-availability-calendar'), 'type' => 'textarea', 'default' => ''],
                ],
            ],

            'faqpage' => [
                'type'        => 'FAQPage',
                'label'       => __('FAQ', 'mphb-availability-calendar'),
                'scope'       => self::SCOPE_DOCUMENT,
                'builder'     => 'build_faqpage',
                'required'    => ['mainEntity'],
                'recommended' => [],
                'fields'      => [
                    [
                        'name'   => 'items',
                        'label'  => __('Questions', 'mphb-availability-calendar'),
                        'type'   => 'repeater',
                        'fields' => [
                            ['name' => 'question', 'label' => __('Question', 'mphb-availability-calendar'), 'type' => 'text',     'default' => ''],
                            ['name' => 'answer',   'label' => __('Answer', 'mphb-availability-calendar'),   'type' => 'textarea', 'default' => ''],
                        ],
                    ],
                ],
            ],

            'breadcrumb' => [
                'type'        => 'BreadcrumbList',
                'label'       => __('Breadcrumbs', 'mphb-availability-calendar'),
                'scope'       => self::SCOPE_DOCUMENT,
                'builder'     => 'build_breadcrumb',
                'required'    => ['itemListElement'],
                'recommended' => [],
                'fields'      => [
                    [
                        'name'   => 'items',
                        'label'  => __('Crumbs', 'mphb-availability-calendar'),
                        'type'   => 'repeater',
                        'fields' => [
                            ['name' => 'name', 'label' => __('Name', 'mphb-availability-calendar'), 'type' => 'text', 'default' => ''],
                            ['name' => 'url',  'label' => __('URL', 'mphb-availability-calendar'),  'type' => 'url',  'default' => ''],
                        ],
                    ],
                ],
            ],

            'article' => [
                'type'        => 'Article',
                'label'       => __('Article (posts)', 'mphb-availability-calendar'),
                'scope'       => self::SCOPE_DOCUMENT,
                'post_types'  => ['post'],
                'builder'     => 'build_article',
                'required'    => ['headline'],
                'recommended' => ['image', 'datePublished', 'author'],
                'fields'      => [
                    ['name' => 'headline', 'label' => __('Headline override', 'mphb-availability-calendar'), 'type' => 'text', 'default' => '{{title}}', 'token_hint' => true],
                    ['name' => 'image',    'label' => __('Image URL override', 'mphb-availability-calendar'), 'type' => 'url', 'default' => '{{featured_image}}', 'token_hint' => true],
                    ['name' => 'author',   'label' => __('Author name', 'mphb-availability-calendar'),        'type' => 'text', 'default' => '{{author}}', 'token_hint' => true],
                ],
            ],

            'custom_jsonld' => [
                'type'        => null,
                'label'       => __('Custom JSON-LD (raw)', 'mphb-availability-calendar'),
                'scope'       => self::SCOPE_DOCUMENT,
                'builder'     => 'build_custom_jsonld',
                'required'    => [],
                'recommended' => [],
                'fields'      => [
                    ['name' => 'raw', 'label' => __('Raw JSON-LD', 'mphb-availability-calendar'), 'type' => 'textarea', 'default' => '', 'description' => __('Paste valid JSON-LD. Imported Custom HTML markup lands here.', 'mphb-availability-calendar')],
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

    /**
     * Whether a document-scope type should appear for a given post type.
     */
    public static function applies_to_post_type(array $type_def, string $post_type): bool
    {
        $allowed = $type_def['post_types'] ?? null;
        if ($allowed === null) {
            return true;
        }
        return in_array($post_type, (array) $allowed, true);
    }
}
