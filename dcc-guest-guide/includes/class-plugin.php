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
    }

    /**
     * AJAX: deliver a guest-submitted "Report a problem" message to the
     * host via wp_mail(). Recipients come from the widget config (POSTed
     * with the report), one per line; falls back to admin_email if empty.
     * Per-IP rate limit: 3 reports / 15 minutes.
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
        $section     = isset($_POST['section'])     ? sanitize_text_field(wp_unslash((string) $_POST['section']))     : '';
        $item        = isset($_POST['item'])        ? sanitize_text_field(wp_unslash((string) $_POST['item']))        : '';
        $stay        = isset($_POST['stay'])        ? sanitize_text_field(wp_unslash((string) $_POST['stay']))        : '';
        $page_url    = isset($_POST['page_url'])    ? esc_url_raw(wp_unslash((string) $_POST['page_url']))            : '';
        $recipients  = isset($_POST['recipients'])  ? wp_unslash((string) $_POST['recipients'])                       : '';

        $description = mb_substr($description, 0, 1500);
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

        $ctx_label = $section !== '' ? $section : __('general', 'dcc-guest-guide');
        $subject = sprintf(
            /* translators: 1: category, 2: section title or "general" */
            __('[DCC Guest Guide] %1$s — %2$s', 'dcc-guest-guide'),
            $category !== '' ? $category : __('Report', 'dcc-guest-guide'),
            $ctx_label
        );

        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field(wp_unslash((string) $_SERVER['HTTP_USER_AGENT'])) : '';
        $ua = mb_substr($ua, 0, 250);

        $lines = [];
        $lines[] = __('A guest submitted a problem report from the Guest Guide.', 'dcc-guest-guide');
        $lines[] = str_repeat('-', 60);
        if ($category !== '') { $lines[] = __('Category:    ', 'dcc-guest-guide') . $category; }
        if ($section !== '')  { $lines[] = __('Section:     ', 'dcc-guest-guide') . $section; }
        if ($item !== '')     { $lines[] = __('Item:        ', 'dcc-guest-guide') . $item; }
        if ($stay !== '')     { $lines[] = __('Stay key:    ', 'dcc-guest-guide') . $stay; }
        if ($page_url !== '') { $lines[] = __('Page URL:    ', 'dcc-guest-guide') . $page_url; }
        if ($contact !== '')  { $lines[] = __('Reply to:    ', 'dcc-guest-guide') . $contact; }
        $lines[] = __('Submitted:   ', 'dcc-guest-guide') . current_time('mysql');
        if ($ua !== '')       { $lines[] = __('User-agent:  ', 'dcc-guest-guide') . $ua; }
        $lines[] = '';
        $lines[] = __('Message:', 'dcc-guest-guide');
        $lines[] = $description;

        $body    = implode("\n", $lines);
        $headers = [];
        if ($contact !== '' && is_email($contact)) {
            $headers[] = 'Reply-To: ' . $contact;
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
        $url = sprintf(
            'https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&timezone=auto',
            $lat,
            $lng
        );
        $res = wp_remote_get($url, ['timeout' => 8]);
        if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
            wp_send_json_error(['message' => 'Open-Meteo unavailable'], 502);
        }
        $data = json_decode(wp_remote_retrieve_body($res), true);
        if (!is_array($data)) {
            wp_send_json_error(['message' => 'Bad upstream response'], 502);
        }
        set_transient($key, $data, 30 * MINUTE_IN_SECONDS);
        wp_send_json_success($data);
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
