<?php
namespace DCCGG;

if (!defined('ABSPATH')) {
    exit;
}

final class Plugin
{
    private static ?Plugin $instance = null;
    private bool $booted = false;

    public static function instance(): self
    {
        return self::$instance ??= new self();
    }

    public function boot(): void
    {
        if ($this->booted) {
            return;
        }
        $this->booted = true;

        add_action('init', [$this, 'load_textdomain']);

        if (!$this->dependencies_present()) {
            add_action('admin_notices', [$this, 'render_missing_deps_notice']);
            return;
        }

        add_action('elementor/elements/categories_registered', [$this, 'register_category']);
        add_action('elementor/widgets/register', [$this, 'register_widget']);
        add_action('wp_enqueue_scripts', ['\\DCCGG\\Widget', 'register_assets']);
        add_action('elementor/preview/enqueue_scripts', ['\\DCCGG\\Widget', 'enqueue_for_preview']);
        // Welcome Pack button lives in the editor panel, not the preview
        // iframe — the script must also load on the editor side so the
        // delegated click handler actually fires.
        add_action('elementor/editor/after_enqueue_scripts', ['\\DCCGG\\Widget', 'enqueue_for_editor']);

        // v0.7: settings page (Gemini key) + AJAX endpoints (AI fallback +
        // weather proxy so the Open-Meteo response is transient-cached
        // server-side rather than re-hit on every page load).
        add_action('admin_menu', [$this, 'register_settings_page']);
        add_action('admin_init', [$this, 'register_settings_fields']);
        add_action('wp_ajax_dccgg_ai_query',        [$this, 'handle_ai_query']);
        add_action('wp_ajax_nopriv_dccgg_ai_query', [$this, 'handle_ai_query']);
        add_action('wp_ajax_dccgg_weather',         [$this, 'handle_weather']);
        add_action('wp_ajax_nopriv_dccgg_weather',  [$this, 'handle_weather']);
        add_action('wp_ajax_dccgg_report_problem',        [$this, 'handle_report_problem']);
        add_action('wp_ajax_nopriv_dccgg_report_problem', [$this, 'handle_report_problem']);
        add_action('wp_ajax_dccgg_noaa_alerts',         [$this, 'handle_noaa_alerts']);
        add_action('wp_ajax_nopriv_dccgg_noaa_alerts',  [$this, 'handle_noaa_alerts']);
        add_action('wp_ajax_dccgg_usgs',                [$this, 'handle_usgs']);
        add_action('wp_ajax_nopriv_dccgg_usgs',         [$this, 'handle_usgs']);
        add_action('wp_ajax_dccgg_search_index',        [$this, 'handle_search_index']);
        add_action('wp_ajax_nopriv_dccgg_search_index', [$this, 'handle_search_index']);
        // v0.9.7.15: stale-nonce refresh path. When SpeedyCache serves a
        // cached page populated by an anonymous visitor to a logged-in
        // admin, the inlined nonce is for user 0 and every dccgg_nonce
        // check fails with HTTP 403. The JS retries once after hitting
        // this endpoint to mint a fresh nonce for the current session.
        add_action('wp_ajax_dccgg_refresh_nonce',        [$this, 'handle_refresh_nonce']);
        add_action('wp_ajax_nopriv_dccgg_refresh_nonce', [$this, 'handle_refresh_nonce']);

        // v0.9.4: server-side Export / Import — the editor-panel JS API
        // path broke in Elementor 4.x, so read/write _elementor_data
        // postmeta directly from a privileged AJAX endpoint instead.
        add_action('wp_ajax_dccgg_export_guide', [$this, 'handle_export_guide']);
        add_action('wp_ajax_dccgg_import_guide', [$this, 'handle_import_guide']);
    }

    /**
     * AJAX: export the DCC Guest Guide widget's sections + items from the
     * given Elementor post's _elementor_data meta as a JSON payload.
     * Editor-only (current_user_can('edit_posts')) + nonce-protected.
     * Returns a clear error if zero or more than one widget exists on
     * the page.
     */
    public function handle_export_guide(): void
    {
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(['message' => __('Insufficient permissions.', 'dcc-guest-guide')], 403);
        }
        check_ajax_referer('dccgg_export', 'nonce');
        $post_id = isset($_POST['post_id']) ? (int) $_POST['post_id'] : 0;
        if ($post_id <= 0) {
            wp_send_json_error(['message' => __('Missing post ID.', 'dcc-guest-guide')], 400);
        }
        if (!current_user_can('edit_post', $post_id)) {
            wp_send_json_error(['message' => __('You cannot edit this page.', 'dcc-guest-guide')], 403);
        }
        $raw = get_post_meta($post_id, '_elementor_data', true);
        if (!is_string($raw) || $raw === '') {
            wp_send_json_error(['message' => __('No Elementor data on this page.', 'dcc-guest-guide')], 404);
        }
        $tree = json_decode($raw, true);
        if (!is_array($tree)) {
            wp_send_json_error(['message' => __('Could not parse Elementor data.', 'dcc-guest-guide')], 500);
        }
        $hits = [];
        $this->collect_dccgg_widgets($tree, $hits);
        if (empty($hits)) {
            wp_send_json_error(['message' => __('This page has no DCC Guest Guide widget.', 'dcc-guest-guide')], 404);
        }
        if (count($hits) > 1) {
            wp_send_json_error(['message' => __('Multiple DCC Guest Guide widgets found on this page — Export only supports one widget per page right now.', 'dcc-guest-guide')], 409);
        }
        $widget   = $hits[0];
        $settings = (array) ($widget['settings'] ?? []);
        $sections = $this->strip_row_ids((array) ($settings['guide_sections'] ?? []));
        $items    = $this->strip_row_ids((array) ($settings['guide_items']    ?? []));
        wp_send_json_success([
            'schema'    => 1,
            'widget_id' => (string) ($widget['id'] ?? ''),
            'sections'  => $sections,
            'items'     => $items,
        ]);
    }

    /**
     * AJAX: import a Guide JSON payload into the single DCC Guest Guide
     * widget on the given Elementor post. Replace or append mode.
     * Writes _elementor_data meta back and clears Elementor's cached CSS
     * for the post so the front-end reflects the change on the next view.
     */
    public function handle_import_guide(): void
    {
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(['message' => __('Insufficient permissions.', 'dcc-guest-guide')], 403);
        }
        check_ajax_referer('dccgg_import', 'nonce');
        $post_id = isset($_POST['post_id']) ? (int) $_POST['post_id'] : 0;
        $payload_raw = isset($_POST['payload']) ? wp_unslash((string) $_POST['payload']) : '';
        $replace = !empty($_POST['replace']);
        if ($post_id <= 0 || $payload_raw === '') {
            wp_send_json_error(['message' => __('Missing post ID or payload.', 'dcc-guest-guide')], 400);
        }
        if (!current_user_can('edit_post', $post_id)) {
            wp_send_json_error(['message' => __('You cannot edit this page.', 'dcc-guest-guide')], 403);
        }
        $payload = json_decode($payload_raw, true);
        if (!is_array($payload) || !isset($payload['sections']) || !isset($payload['items'])
            || !is_array($payload['sections']) || !is_array($payload['items'])) {
            wp_send_json_error(['message' => __('Unrecognized schema — expected { sections: [...], items: [...] }.', 'dcc-guest-guide')], 400);
        }
        $raw = get_post_meta($post_id, '_elementor_data', true);
        if (!is_string($raw) || $raw === '') {
            wp_send_json_error(['message' => __('No Elementor data on this page.', 'dcc-guest-guide')], 404);
        }
        $tree = json_decode($raw, true);
        if (!is_array($tree)) {
            wp_send_json_error(['message' => __('Could not parse Elementor data.', 'dcc-guest-guide')], 500);
        }

        $new_sections = $this->assign_row_ids($payload['sections']);
        $new_items    = $this->assign_row_ids($payload['items']);

        $matched = 0;
        $written_sections = 0;
        $written_items = 0;
        $update_widget = function (array &$w) use ($replace, $new_sections, $new_items, &$matched, &$written_sections, &$written_items) {
            $settings = (array) ($w['settings'] ?? []);
            $existing_s = (array) ($settings['guide_sections'] ?? []);
            $existing_i = (array) ($settings['guide_items']    ?? []);
            $settings['guide_sections'] = $replace ? $new_sections : array_merge($existing_s, $new_sections);
            $settings['guide_items']    = $replace ? $new_items    : array_merge($existing_i, $new_items);
            $w['settings'] = $settings;
            $matched++;
            $written_sections = count($settings['guide_sections']);
            $written_items    = count($settings['guide_items']);
        };
        $this->walk_dccgg_widgets($tree, $update_widget);

        if ($matched === 0) {
            wp_send_json_error(['message' => __('This page has no DCC Guest Guide widget to import into. Add the widget first, save the page, then try again.', 'dcc-guest-guide')], 404);
        }
        if ($matched > 1) {
            wp_send_json_error(['message' => __('Multiple DCC Guest Guide widgets found on this page — Import only supports one widget per page right now.', 'dcc-guest-guide')], 409);
        }

        $encoded = wp_slash(wp_json_encode($tree));
        update_post_meta($post_id, '_elementor_data', $encoded);

        // Best-effort CSS-cache flush so the front-end picks up the new
        // content without waiting for the editor to re-save.
        try {
            if (class_exists('\\Elementor\\Plugin')) {
                $el = \Elementor\Plugin::instance();
                if (isset($el->files_manager) && method_exists($el->files_manager, 'clear_cache')) {
                    $el->files_manager->clear_cache();
                }
            }
        } catch (\Throwable $e) {
            error_log('DCCGG: post-import cache clear failed — ' . $e->getMessage());
        }

        wp_send_json_success([
            'imported_sections' => count($new_sections),
            'imported_items'    => count($new_items),
            'total_sections'    => $written_sections,
            'total_items'       => $written_items,
        ]);
    }

    /**
     * Look up a single DCCGG widget's saved Elementor settings by post +
     * widget ID. Returns [] when the post has no Elementor data, the JSON
     * is unparseable, or no matching widget exists. Used by the report
     * and search-index handlers so sensitive fields (recipient emails,
     * From identity, templates) never have to round-trip through the JS
     * payload.
     */
    private function find_widget_settings(int $post_id, string $widget_id): array
    {
        if ($post_id <= 0 || $widget_id === '') {
            return [];
        }
        $raw = get_post_meta($post_id, '_elementor_data', true);
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        $tree = json_decode($raw, true);
        if (!is_array($tree)) {
            return [];
        }
        $hits = [];
        $this->collect_dccgg_widgets($tree, $hits);
        foreach ($hits as $w) {
            if ((string) ($w['id'] ?? '') === $widget_id) {
                return (array) ($w['settings'] ?? []);
            }
        }
        return [];
    }

    /** Recursively collect every widget with widgetType=dccgg_guide in
     *  an Elementor element tree. */
    private function collect_dccgg_widgets(array $tree, array &$out): void
    {
        foreach ($tree as $node) {
            if (!is_array($node)) { continue; }
            if (($node['elType'] ?? '') === 'widget' && ($node['widgetType'] ?? '') === 'dccgg_guide') {
                $out[] = $node;
            }
            if (!empty($node['elements']) && is_array($node['elements'])) {
                $this->collect_dccgg_widgets($node['elements'], $out);
            }
        }
    }

    /** Recursively walk the tree in place, calling $fn on each
     *  dccgg_guide widget so the caller can mutate its settings. */
    private function walk_dccgg_widgets(array &$tree, callable $fn): void
    {
        foreach ($tree as &$node) {
            if (!is_array($node)) { continue; }
            if (($node['elType'] ?? '') === 'widget' && ($node['widgetType'] ?? '') === 'dccgg_guide') {
                $fn($node);
            }
            if (!empty($node['elements']) && is_array($node['elements'])) {
                $this->walk_dccgg_widgets($node['elements'], $fn);
            }
        }
        unset($node);
    }

    private function strip_row_ids(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) { continue; }
            unset($row['_id']);
            $out[] = $row;
        }
        return $out;
    }

    /** Assign a fresh 7-char Elementor-style _id to each row. */
    private function assign_row_ids(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) { continue; }
            $row['_id'] = substr(bin2hex(random_bytes(4)), 0, 7);
            $out[] = $row;
        }
        return $out;
    }

    /**
     * AJAX: NWS active-alert proxy. Mirrors handle_weather() — round lat/lng
     * to 3 decimals, 30-min transient cache, single shared upstream call.
     * NWS requires a polite User-Agent identifying the contact email.
     * On debug, accepts ?fake=1 to return a synthetic Hurricane Warning so
     * the banner can be exercised without waiting for live weather.
     */
    public function handle_noaa_alerts(): void
    {
        check_ajax_referer('dccgg_nonce', 'nonce');
        $lat = isset($_GET['lat']) ? (float) $_GET['lat'] : 0.0;
        $lng = isset($_GET['lng']) ? (float) $_GET['lng'] : 0.0;
        if ($lat === 0.0 && $lng === 0.0) {
            wp_send_json_error(['message' => 'lat/lng required'], 400);
        }
        if (!empty($_GET['fake'])) {
            wp_send_json_success([
                'alerts' => [[
                    'event'    => 'Hurricane Warning (TEST)',
                    'headline' => 'TEST — Hurricane Warning in effect for Lake County. This is a simulated alert.',
                    'severity' => 'Extreme',
                    'url'      => 'https://www.weather.gov/',
                ]],
            ]);
        }
        $lat = round($lat, 3);
        $lng = round($lng, 3);
        $key = 'dccgg_noaa_' . md5($lat . ':' . $lng);
        $cached = get_transient($key);
        if (is_array($cached)) {
            wp_send_json_success($cached);
        }
        $url = sprintf('https://api.weather.gov/alerts/active?point=%s,%s', $lat, $lng);
        $contact = (string) get_option('admin_email', '');
        $res = wp_remote_get($url, [
            'timeout' => 8,
            'headers' => [
                'Accept'     => 'application/geo+json',
                'User-Agent' => 'DCC Guest Guide / WP plugin (contact: ' . ($contact !== '' ? $contact : 'site-admin') . ')',
            ],
        ]);
        if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
            // Cache a tombstone so a broken upstream doesn't re-hit on every visitor.
            set_transient($key, ['alerts' => []], 10 * MINUTE_IN_SECONDS);
            wp_send_json_success(['alerts' => []]);
        }
        $data = json_decode(wp_remote_retrieve_body($res), true);
        $alerts = [];
        if (is_array($data) && isset($data['features']) && is_array($data['features'])) {
            foreach ($data['features'] as $f) {
                $p = $f['properties'] ?? [];
                $event    = (string) ($p['event']    ?? '');
                $headline = (string) ($p['headline'] ?? $event);
                $severity = (string) ($p['severity'] ?? '');
                if ($event === '') { continue; }
                $alerts[] = [
                    'event'    => $event,
                    'headline' => $headline,
                    'severity' => $severity,
                    'url'      => (string) ($p['@id'] ?? ''),
                ];
            }
        }
        $payload = ['alerts' => $alerts];
        set_transient($key, $payload, 30 * MINUTE_IN_SECONDS);
        wp_send_json_success($payload);
    }

    /**
     * AJAX: deliver a guest-submitted "Report a problem" message to the
     * host via wp_mail(). Recipients come from the widget config (POSTed
     * with the report), one per line; falls back to admin_email if empty.
     * Per-IP rate limit: 3 reports / 15 minutes.
     *
     * v0.9.7: subject + body templates with smart-tag placeholders, custom
     * From email/name (with Reply-To fallback for deliverability), plus
     * reporter Name + Cottage fields.
     */
    public function handle_report_problem(): void
    {
        check_ajax_referer('dccgg_nonce', 'nonce');

        $ip_hash = substr(sha1((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0')), 0, 12);
        $rl_key  = 'dccgg_report_rl_' . $ip_hash;
        $count   = (int) get_transient($rl_key);
        if ($count >= 3) {
            wp_send_json_error(['message' => __('Too many reports in a short window — please try again in a few minutes.', 'dcc-guest-guide')], 429);
        }

        $category    = isset($_POST['category'])    ? sanitize_text_field(wp_unslash((string) $_POST['category']))    : '';
        $description = isset($_POST['description']) ? sanitize_textarea_field(wp_unslash((string) $_POST['description'])) : '';
        $contact     = isset($_POST['contact'])     ? sanitize_email(wp_unslash((string) $_POST['contact']))          : '';
        $reporter_name    = isset($_POST['reporter_name'])    ? sanitize_text_field(wp_unslash((string) $_POST['reporter_name']))    : '';
        $reporter_cottage = isset($_POST['reporter_cottage']) ? sanitize_text_field(wp_unslash((string) $_POST['reporter_cottage'])) : '';
        $reporter_phone   = isset($_POST['reporter_phone'])   ? sanitize_text_field(wp_unslash((string) $_POST['reporter_phone']))   : '';
        $section     = isset($_POST['section'])     ? sanitize_text_field(wp_unslash((string) $_POST['section']))     : '';
        $item        = isset($_POST['item'])        ? sanitize_text_field(wp_unslash((string) $_POST['item']))        : '';
        $stay        = isset($_POST['stay'])        ? sanitize_text_field(wp_unslash((string) $_POST['stay']))        : '';
        $page_url    = isset($_POST['page_url'])    ? esc_url_raw(wp_unslash((string) $_POST['page_url']))            : '';
        $post_id     = isset($_POST['post_id'])     ? (int) $_POST['post_id']                                         : 0;
        $widget_id   = isset($_POST['widget_id'])   ? sanitize_text_field(wp_unslash((string) $_POST['widget_id']))   : '';

        // v0.9.7.14: recipient list, From identity and templates used to round-trip
        // through the JS payload (visible in page source). Now resolved server-side
        // from the widget's saved Elementor settings, keyed by post_id + widget_id.
        $widget_settings = $this->find_widget_settings($post_id, $widget_id);
        $recipients  = (string) ($widget_settings['problem_report_recipients'] ?? '');
        $subject_tpl = (string) ($widget_settings['problem_report_subject']    ?? '');
        $body_tpl    = (string) ($widget_settings['problem_report_body']       ?? '');
        $from_email  = (string) ($widget_settings['problem_report_from_email'] ?? '');
        $from_name   = (string) ($widget_settings['problem_report_from_name']  ?? '');
        $include_ua  = (($widget_settings['problem_report_include_ua'] ?? 'yes') === 'no') ? 'no' : 'yes';

        $description       = mb_substr($description, 0, 1500);
        $reporter_name     = mb_substr($reporter_name, 0, 100);
        $reporter_cottage  = mb_substr($reporter_cottage, 0, 100);
        $reporter_phone    = mb_substr($reporter_phone, 0, 40);

        if ($description === '') {
            wp_send_json_error(['message' => __('Please describe the problem.', 'dcc-guest-guide')], 400);
        }

        $to = $this->parse_recipient_list($recipients);
        if (empty($to)) {
            $admin = get_option('admin_email', '');
            if (is_email($admin)) { $to = [$admin]; }
        }
        if (empty($to)) {
            wp_send_json_error(['message' => __('No recipient configured.', 'dcc-guest-guide')], 500);
        }

        $ua = '';
        if ($include_ua === 'yes') {
            $ua = isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field(wp_unslash((string) $_SERVER['HTTP_USER_AGENT'])) : '';
            $ua = mb_substr($ua, 0, 250);
        }

        $tags = [
            '{site_name}'        => (string) get_bloginfo('name'),
            '{site_url}'         => (string) home_url('/'),
            '{page_url}'         => $page_url,
            '{category}'         => $category !== '' ? $category : __('Report', 'dcc-guest-guide'),
            '{section_title}'    => $section !== '' ? $section : __('general', 'dcc-guest-guide'),
            '{item_title}'       => $item !== '' ? $item : '—',
            '{report_text}'      => $description,
            '{reporter_name}'    => $reporter_name !== '' ? $reporter_name : '—',
            '{reporter_cottage}' => $reporter_cottage !== '' ? $reporter_cottage : '—',
            '{reporter_phone}'   => $reporter_phone !== '' ? $reporter_phone : '—',
            '{reporter_email}'   => $contact !== '' ? $contact : '—',
            '{timestamp}'        => current_time('mysql'),
            '{user_agent}'       => $ua,
        ];

        if ($subject_tpl === '') {
            $subject_tpl = '[DCC Guest Guide] {category} — {section_title}';
        }
        $subject = strtr($subject_tpl, $tags);

        if ($body_tpl === '') {
            $body_tpl = "<p>A guest submitted a problem report from {site_name}.</p>\n"
                     . "<p><strong>Name:</strong> {reporter_name}<br>"
                     . "<strong>Cottage:</strong> {reporter_cottage}<br>"
                     . "<strong>Reply-to:</strong> {reporter_email}<br>"
                     . "<strong>Category:</strong> {category}<br>"
                     . "<strong>Section:</strong> {section_title}<br>"
                     . "<strong>Item:</strong> {item_title}<br>"
                     . "<strong>Page:</strong> {page_url}<br>"
                     . "<strong>Submitted:</strong> {timestamp}</p>\n"
                     . "<p><strong>Message:</strong></p>\n"
                     . "<blockquote>{report_text}</blockquote>\n"
                     . "<p style=\"font-size:11px;color:#888\">{user_agent}</p>";
        }
        // {report_text} is plaintext from a textarea — newline-to-<br> so guest
        // line breaks survive into the HTML email. esc_html keeps it safe.
        $tags['{report_text}'] = nl2br(esc_html($description));
        $tags['{user_agent}']  = $ua !== '' ? esc_html($ua) : '';
        $tags['{page_url}']    = $page_url !== '' ? esc_url($page_url) : '—';
        $body = strtr($body_tpl, $tags);

        $headers = ['Content-Type: text/html; charset=UTF-8'];
        if ($contact !== '' && is_email($contact)) {
            $headers[] = 'Reply-To: ' . $contact;
        }
        if ($from_email !== '' && is_email($from_email)) {
            $name = $from_name !== '' ? $from_name : (string) get_bloginfo('name');
            // v0.9.7.18: belt-and-suspenders against header injection.
            // is_email() already rejects newlines in $from_email, but the
            // display name is admin-controlled free text and could otherwise
            // splice a Bcc: via a compromised admin or a future panel-
            // injection bug.
            $name = trim(str_replace(["\r", "\n", "\0"], '', $name));
            $headers[] = 'From: ' . $name . ' <' . $from_email . '>';
        }

        $ok = wp_mail($to, $subject, $body, $headers);
        if (!$ok) {
            error_log('DCCGG: wp_mail() returned false for problem report to ' . implode(',', $to));
            wp_send_json_error(['message' => __('Could not send your report. Please contact the host directly.', 'dcc-guest-guide')], 502);
        }

        set_transient($rl_key, $count + 1, 15 * MINUTE_IN_SECONDS);
        wp_send_json_success(['ok' => true]);
    }

    /**
     * Parse a newline / comma separated string of email addresses into a
     * deduplicated array of valid recipients. Used by handle_report_problem
     * to interpret the per-widget recipients TEXTAREA.
     */
    private function parse_recipient_list(string $raw): array
    {
        $parts = preg_split('/[\s,;]+/', trim($raw)) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = trim($p);
            if ($p === '') { continue; }
            if (is_email($p)) { $out[$p] = true; }
        }
        return array_keys($out);
    }

    public function register_settings_page(): void
    {
        add_options_page(
            __('DCC Guest Guide', 'dcc-guest-guide'),
            __('DCC Guest Guide', 'dcc-guest-guide'),
            'manage_options',
            'dccgg-settings',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings_fields(): void
    {
        register_setting('dccgg_settings_group', 'dccgg_gemini_key', [
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => '',
        ]);
        register_setting('dccgg_settings_group', 'dccgg_gemini_model', [
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => 'gemini-2.5-flash',
        ]);
    }

    public function render_settings_page(): void
    {
        if (!current_user_can('manage_options')) { return; }
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('DCC Guest Guide', 'dcc-guest-guide'); ?></h1>
            <p><?php echo esc_html__('Server-side settings shared by all DCC Guest Guide widgets on this site. Per-widget settings live in Elementor.', 'dcc-guest-guide'); ?></p>
            <form method="post" action="options.php">
                <?php settings_fields('dccgg_settings_group'); ?>
                <h2><?php echo esc_html__('AI Fallback Search', 'dcc-guest-guide'); ?></h2>
                <p class="description">
                    <?php echo esc_html__('Optional. When a guest\'s search returns no fuzzy matches, the widget can offer an "Ask anything" button that routes the question to Google Gemini with the guide content as context.', 'dcc-guest-guide'); ?><br>
                    <?php
                    printf(
                        /* translators: %s: AI Studio URL */
                        esc_html__('Get a free Gemini API key at %s (1,500 free requests / day). Leave blank to keep AI search disabled site-wide.', 'dcc-guest-guide'),
                        '<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com/app/apikey</a>'
                    ); ?>
                </p>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="dccgg_gemini_key"><?php echo esc_html__('Gemini API key', 'dcc-guest-guide'); ?></label></th>
                        <td>
                            <input type="password" id="dccgg_gemini_key" name="dccgg_gemini_key" value="<?php echo esc_attr((string) get_option('dccgg_gemini_key', '')); ?>" class="regular-text" autocomplete="off">
                            <p class="description"><?php echo esc_html__('Stored in wp_options, never sent to the browser.', 'dcc-guest-guide'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="dccgg_gemini_model"><?php echo esc_html__('Model', 'dcc-guest-guide'); ?></label></th>
                        <td>
                            <input type="text" id="dccgg_gemini_model" name="dccgg_gemini_model" value="<?php echo esc_attr((string) get_option('dccgg_gemini_model', 'gemini-2.5-flash')); ?>" class="regular-text">
                            <p class="description"><?php echo esc_html__('Default: gemini-2.5-flash. Other options: gemini-2.5-flash-lite (faster, cheaper), gemini-2.0-flash.', 'dcc-guest-guide'); ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    /**
     * AJAX: forward a guest's question to Gemini with the guide content as
     * system context. Key lives in wp_options, never touches the browser.
     */
    public function handle_ai_query(): void
    {
        check_ajax_referer('dccgg_nonce', 'nonce');

        // v0.9.7.14: per-IP burst limit (5 / 15 min) + site-wide daily cap
        // so distributed scraping can't drain the 1500/day Gemini free tier.
        $ip_hash = substr(sha1((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0')), 0, 12);
        $rl_key  = 'dccgg_ai_rl_' . $ip_hash;
        $rl_count = (int) get_transient($rl_key);
        if ($rl_count >= 5) {
            wp_send_json_error(['message' => __('Too many questions in a short window — please try again in a few minutes.', 'dcc-guest-guide')], 429);
        }
        $daily_cap   = (int) apply_filters('dccgg_ai_daily_cap', 500);
        $daily_count = (int) get_transient('dccgg_ai_daily');
        if ($daily_cap > 0 && $daily_count >= $daily_cap) {
            wp_send_json_error(['message' => __('AI search has hit today\'s usage limit. Please try again tomorrow or contact the host.', 'dcc-guest-guide')], 429);
        }

        $key   = (string) get_option('dccgg_gemini_key', '');
        $model = (string) get_option('dccgg_gemini_model', 'gemini-2.5-flash');
        if ($key === '') {
            wp_send_json_error(['message' => __('AI search is not configured on this site.', 'dcc-guest-guide')], 503);
        }
        $question = isset($_POST['question']) ? sanitize_textarea_field(wp_unslash((string) $_POST['question'])) : '';
        $context  = isset($_POST['context'])  ? wp_kses_post(wp_unslash((string) $_POST['context']))            : '';
        $question = mb_substr($question, 0, 500);
        $context  = mb_substr($context, 0, 20000);
        if ($question === '' || $context === '') {
            wp_send_json_error(['message' => __('Question and context are required.', 'dcc-guest-guide')], 400);
        }

        $system = "You are a helpful concierge for a vacation rental. Answer ONLY using the guide content provided. "
                . "If the answer isn't in the guide, say so and suggest contacting the host. "
                . "Keep answers under 80 words, conversational, no markdown headings.\n\n"
                . "=== GUIDE CONTENT ===\n" . $context;
        $body = [
            'system_instruction' => ['parts' => [['text' => $system]]],
            'contents' => [
                ['role' => 'user', 'parts' => [['text' => $question]]],
            ],
            'generationConfig' => [
                'temperature'     => 0.3,
                'maxOutputTokens' => 256,
            ],
        ];
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($key);
        $res = wp_remote_post($url, [
            'timeout' => 15,
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode($body),
        ]);
        if (is_wp_error($res)) {
            error_log('DCCGG: Gemini request failed — ' . $res->get_error_message());
            wp_send_json_error(['message' => __('Could not reach the AI service.', 'dcc-guest-guide')], 502);
        }
        $code = wp_remote_retrieve_response_code($res);
        $data = json_decode(wp_remote_retrieve_body($res), true);
        if ($code !== 200 || !is_array($data)) {
            error_log('DCCGG: Gemini non-200 (' . $code . ') ' . wp_remote_retrieve_body($res));
            wp_send_json_error(['message' => __('AI service returned an error.', 'dcc-guest-guide')], 502);
        }
        $answer = '';
        if (isset($data['candidates'][0]['content']['parts']) && is_array($data['candidates'][0]['content']['parts'])) {
            foreach ($data['candidates'][0]['content']['parts'] as $part) {
                if (isset($part['text'])) { $answer .= $part['text']; }
            }
        }
        $answer = trim($answer);
        if ($answer === '') {
            wp_send_json_error(['message' => __('AI returned an empty answer.', 'dcc-guest-guide')], 502);
        }
        set_transient($rl_key, $rl_count + 1, 15 * MINUTE_IN_SECONDS);
        // v0.9.7.27: expire the daily counter at the site's local midnight
        // instead of DAY_IN_SECONDS. The fixed 24h TTL was re-stamped on
        // every increment, turning the "daily" cap into a sliding window
        // that steady usage could extend indefinitely — under-delivering
        // the configured quota. Anchoring to midnight makes it a true
        // calendar-day cap that resets when the day does.
        $now = current_datetime();
        $midnight = $now->modify('tomorrow')->setTime(0, 0, 0);
        $ttl = max(MINUTE_IN_SECONDS, $midnight->getTimestamp() - $now->getTimestamp());
        set_transient('dccgg_ai_daily', $daily_count + 1, $ttl);
        wp_send_json_success(['answer' => $answer]);
    }

    /**
     * AJAX: Open-Meteo proxy with 30-min transient cache so widgets share
     * a single upstream call per lat/lng pair instead of one per visitor.
     */
    public function handle_weather(): void
    {
        check_ajax_referer('dccgg_nonce', 'nonce');
        $lat = isset($_GET['lat']) ? (float) $_GET['lat'] : 0.0;
        $lng = isset($_GET['lng']) ? (float) $_GET['lng'] : 0.0;
        if ($lat === 0.0 && $lng === 0.0) {
            wp_send_json_error(['message' => 'lat/lng required'], 400);
        }
        $lat = round($lat, 3);
        $lng = round($lng, 3);
        $key = 'dccgg_wx_' . md5($lat . ':' . $lng);
        $cached = get_transient($key);
        if (is_array($cached)) {
            wp_send_json_success($cached);
        }
        // Open-Meteo's documented param names: `past_days=1` (not `past_hours`),
        // `pressure_unit` only accepts hPa/mmHg — convert to inHg client-side.
        $url = sprintf(
            'https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s'
            . '&current=temperature_2m,apparent_temperature,weather_code,is_day,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
            . '&hourly=surface_pressure'
            . '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,uv_index_max'
            . '&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&past_days=1&timezone=auto',
            $lat,
            $lng
        );
        $res = wp_remote_get($url, ['timeout' => 8]);
        // v0.9.7.18: gate ?debug=1 behind a manage_options check — both this
        // handler and dccgg_usgs are registered for wp_ajax_nopriv_, so an
        // anonymous visitor could otherwise see upstream URLs / response
        // excerpts. Diagnostic value is admin-only by design.
        $debug = !empty($_GET['debug']) && current_user_can('manage_options');
        if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
            if ($debug) {
                $err = is_wp_error($res)
                    ? $res->get_error_message()
                    : 'HTTP ' . wp_remote_retrieve_response_code($res) . ' — ' . substr((string) wp_remote_retrieve_body($res), 0, 400);
                wp_send_json_error(['message' => 'Open-Meteo unavailable', 'debug' => ['url' => $url, 'error' => $err]], 502);
            }
            wp_send_json_error(['message' => 'Open-Meteo unavailable'], 502);
        }
        $data = json_decode(wp_remote_retrieve_body($res), true);
        if (!is_array($data)) {
            if ($debug) {
                wp_send_json_error(['message' => 'Bad upstream response', 'debug' => ['url' => $url, 'body_excerpt' => substr((string) wp_remote_retrieve_body($res), 0, 400)]], 502);
            }
            wp_send_json_error(['message' => 'Bad upstream response'], 502);
        }
        set_transient($key, $data, 30 * MINUTE_IN_SECONDS);
        wp_send_json_success($data);
    }

    /**
     * AJAX: USGS NWIS proxy. Picks the nearest published Harris-Chain gauge
     * for the cottage lat/lng (Lake Dora, Lake Eustis, Lake Harris) and
     * returns gauge height + surface water temperature when available.
     * 30-min transient cache, mirrors handle_weather() / handle_noaa_alerts().
     *
     * USGS NWIS sites used (all publish elevation; some publish temp):
     *   Lake Dora    — 02238500
     *   Lake Eustis  — 02236000
     *   Lake Harris  — 02237700
     */
    public function handle_usgs(): void
    {
        check_ajax_referer('dccgg_nonce', 'nonce');
        $lat = isset($_GET['lat']) ? (float) $_GET['lat'] : 0.0;
        $lng = isset($_GET['lng']) ? (float) $_GET['lng'] : 0.0;
        if ($lat === 0.0 && $lng === 0.0) {
            wp_send_json_error(['message' => 'lat/lng required'], 400);
        }
        $lat = round($lat, 3);
        $lng = round($lng, 3);
        // v0.9.7.18: admin-only, same as dccgg_weather above.
        $debug = !empty($_GET['debug']) && current_user_can('manage_options');
        // Cache key is the cottage lat/lng so a fallback to a sibling site
        // still satisfies repeat lookups from the same widget instance.
        $key = 'dccgg_usgs_' . md5($lat . ':' . $lng);
        $cached = get_transient($key);
        if (is_array($cached) && !$debug) {
            wp_send_json_success($cached);
        }
        $sites = $this->ordered_harris_chain_sites($lat, $lng);
        $tries = [];
        $contact = (string) get_option('admin_email', '');
        $payload = [
            'available' => false,
            'lake_name' => $sites[0]['name'],
            'site_id'   => $sites[0]['id'],
        ];
        // Parameter codes: 00065 = gauge height (ft), 00010 = water temp (°C).
        foreach ($sites as $site) {
            $url = sprintf(
                'https://waterservices.usgs.gov/nwis/iv/?sites=%s&parameterCd=00065,00010&format=json&siteStatus=active',
                $site['id']
            );
            $res = wp_remote_get($url, [
                'timeout' => 8,
                'headers' => [
                    'Accept'     => 'application/json',
                    'User-Agent' => 'DCC Guest Guide / WP plugin (contact: ' . ($contact !== '' ? $contact : 'site-admin') . ')',
                ],
            ]);
            $http = is_wp_error($res) ? 0 : (int) wp_remote_retrieve_response_code($res);
            $body = is_wp_error($res) ? '' : (string) wp_remote_retrieve_body($res);
            $tries[] = [
                'site'  => $site['id'],
                'name'  => $site['name'],
                'url'   => $url,
                'http'  => $http,
                'error' => is_wp_error($res) ? $res->get_error_message() : '',
            ];
            if ($http !== 200) { continue; }
            $data = json_decode($body, true);
            $candidate = [
                'available' => false,
                'lake_name' => $site['name'],
                'site_id'   => $site['id'],
            ];
            if (is_array($data) && isset($data['value']['timeSeries']) && is_array($data['value']['timeSeries'])) {
                foreach ($data['value']['timeSeries'] as $ts) {
                    $code  = $ts['variable']['variableCode'][0]['value'] ?? '';
                    $value = $ts['values'][0]['value'][0]['value'] ?? null;
                    if (!is_string($value) || $value === '' || (float) $value <= -9999) {
                        continue;
                    }
                    if ($code === '00065') {
                        $candidate['gauge_ft']  = round((float) $value, 2);
                        $candidate['available'] = true;
                    } elseif ($code === '00010') {
                        // °C → °F.
                        $candidate['surface_f'] = (int) round((float) $value * 9 / 5 + 32);
                        $candidate['available'] = true;
                    }
                }
            }
            if ($candidate['available']) {
                $payload = $candidate;
                break;
            }
        }
        // Tombstone an unavailable lookup for 10 min so a broken upstream
        // doesn't trigger 3 retries on every visitor.
        set_transient($key, $payload, $payload['available'] ? 30 * MINUTE_IN_SECONDS : 10 * MINUTE_IN_SECONDS);
        if ($debug) {
            $payload['debug'] = ['tries' => $tries];
        }
        wp_send_json_success($payload);
    }

    /**
     * AJAX: return the search-index payload for one widget on one page.
     * v0.9.7.14: index used to be inlined into data-config on every page
     * load (~30-50 KB on a 50-item guide). Now fetched lazily on the
     * first search-focus. Cached server-side by post_id + content hash so
     * the index regenerates only when the host re-saves the guide.
     */
    public function handle_search_index(): void
    {
        check_ajax_referer('dccgg_nonce', 'nonce');
        $post_id   = isset($_REQUEST['post_id'])   ? (int) $_REQUEST['post_id']                                          : 0;
        $widget_id = isset($_REQUEST['widget_id']) ? sanitize_text_field(wp_unslash((string) $_REQUEST['widget_id']))    : '';
        if ($post_id <= 0 || $widget_id === '') {
            wp_send_json_error(['message' => 'post_id and widget_id required'], 400);
        }
        $settings = $this->find_widget_settings($post_id, $widget_id);
        if (empty($settings)) {
            wp_send_json_success(['index' => []]);
        }
        $hash = substr(sha1((string) wp_json_encode($settings)), 0, 12);
        $key  = 'dccgg_searchidx_' . $post_id . '_' . $hash;
        $cached = get_transient($key);
        if (is_array($cached)) {
            wp_send_json_success(['index' => $cached]);
        }
        $index = Widget::build_search_index($settings);
        set_transient($key, $index, HOUR_IN_SECONDS);
        wp_send_json_success(['index' => $index]);
    }

    /**
     * AJAX: return a fresh dccgg_nonce bound to the current session.
     * v0.9.7.15: full-page caches (SpeedyCache, on this host) bake the
     * anonymous-user nonce into the cached HTML, so logged-in visitors
     * loading that cached page get a stale nonce on their data-config.
     * The JS hits this endpoint after a 403 to mint a fresh one. No
     * check_ajax_referer here — the session cookie is what authenticates
     * the requester, and the returned nonce is bound to that session so
     * it can't be used to escalate privileges.
     */
    public function handle_refresh_nonce(): void
    {
        wp_send_json_success(['nonce' => wp_create_nonce('dccgg_nonce')]);
    }

    /**
     * Order the Harris Chain sites by squared-degree distance from the
     * cottage. First entry is the closest; the AJAX handler walks down the
     * list as a fallback chain when the closest site has no usable data.
     */
    private function ordered_harris_chain_sites(float $lat, float $lng): array
    {
        $sites = [
            ['id' => '02238500', 'name' => 'Lake Dora',   'lat' => 28.7920, 'lng' => -81.6390],
            ['id' => '02236000', 'name' => 'Lake Eustis', 'lat' => 28.8470, 'lng' => -81.7270],
            ['id' => '02237700', 'name' => 'Lake Harris', 'lat' => 28.7740, 'lng' => -81.8190],
        ];
        usort($sites, static function ($a, $b) use ($lat, $lng) {
            $da = ($a['lat'] - $lat) ** 2 + ($a['lng'] - $lng) ** 2;
            $db = ($b['lat'] - $lat) ** 2 + ($b['lng'] - $lng) ** 2;
            return $da <=> $db;
        });
        return $sites;
    }

    public function load_textdomain(): void
    {
        load_plugin_textdomain(
            'dcc-guest-guide',
            false,
            dirname(plugin_basename(DCCGG_FILE)) . '/languages'
        );
    }

    public function dependencies_present(): bool
    {
        return did_action('elementor/loaded') > 0;
    }

    public function render_missing_deps_notice(): void
    {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html__('DCC Guest Guide requires the Elementor plugin to be active.', 'dcc-guest-guide')
        );
    }

    public function register_category(\Elementor\Elements_Manager $elements_manager): void
    {
        // Shared with MPHB Availability Calendar; add_category is idempotent so
        // it's safe to register from both plugins regardless of activation order.
        $elements_manager->add_category(
            'claude-code',
            [
                'title' => __('Claude Code', 'dcc-guest-guide'),
                'icon'  => 'fa fa-plug',
            ]
        );
    }

    public function register_widget(\Elementor\Widgets_Manager $widgets_manager): void
    {
        $widgets_manager->register(new Widget());
    }
}
