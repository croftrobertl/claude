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
