<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Processes submissions from both the AJAX endpoint and the non-JS fallback
 * POST. All trusted config (recipient, subject, fields, spam toggles) is loaded
 * server-side by form_id via Form_Config — never taken from the request body.
 */
final class Form_Handler
{
    public const NONCE_ACTION = 'dcc_contact_submit';

    /* ------------------------------------------------------------------ */
    /* Entry points                                                        */
    /* ------------------------------------------------------------------ */

    public static function handle_ajax(): void
    {
        if (!headers_sent()) {
            nocache_headers();
        }

        $result = self::process($_POST);

        if ($result['ok']) {
            wp_send_json_success(['confirmation' => $result['confirmation']]);
        }

        wp_send_json_error([
            'message' => $result['message'],
            'errors'  => $result['errors'],
        ]);
    }

    /**
     * Non-JS fallback: full page POST to admin-post.php. We can't reliably show
     * the confirmation on the (cached) origin page, so we render a minimal
     * standalone themed response with a back link.
     */
    public static function handle_post(): void
    {
        $result = self::process($_POST);

        $back = wp_get_referer() ?: home_url('/');
        $back = esc_url($back);

        if ($result['ok']) {
            $title   = esc_html__('Message sent', 'dcc-contact-form');
            $heading = wp_kses_post($result['confirmation']);
        } else {
            $title = esc_html__('There was a problem', 'dcc-contact-form');
            $lines = '';
            if ($result['message'] !== '') {
                $lines .= '<p>' . esc_html($result['message']) . '</p>';
            }
            foreach ($result['errors'] as $err) {
                $lines .= '<p>' . esc_html($err) . '</p>';
            }
            if ($lines === '') {
                $lines = '<p>' . esc_html__('Please check your entries and try again.', 'dcc-contact-form') . '</p>';
            }
            $heading = $lines;
        }

        $back_label = esc_html__('&larr; Go back', 'dcc-contact-form');

        nocache_headers();
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>' . $title . '</title>'
            . '<style>body{font-family:Raleway,Arial,sans-serif;background:#f6f6f6;color:#222;margin:0;padding:48px 16px;}'
            . '.box{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 6px 24px rgba(0,0,0,.08);text-align:center;}'
            . 'a{display:inline-block;margin-top:20px;color:#006bcf;font-weight:600;text-decoration:none;}</style></head><body>'
            . '<div class="box">' . $heading . '<a href="' . $back . '">' . $back_label . '</a></div></body></html>';
        exit;
    }

    /* ------------------------------------------------------------------ */
    /* Core processing                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * @return array{ok:bool,confirmation:string,message:string,errors:array<string,string>}
     */
    public static function process(array $post): array
    {
        $fail = static function (string $message, array $errors = []): array {
            return ['ok' => false, 'confirmation' => '', 'message' => $message, 'errors' => $errors];
        };

        // Lightweight CSRF posture. A hard nonce check would break under
        // full-page caching (SpeedyCache stores the nonce in cached HTML; it
        // expires after ~12-24h and every cached visitor would be rejected).
        // A nonce failure is also NOT rejected for logged-in users: a cache
        // layer can serve a logged-in visitor (e.g. the site owner testing the
        // live form) a page carrying an anonymous visitor's nonce, which never
        // verifies against their session — rejecting there makes the owner's
        // own tests fail while real visitors succeed. Instead every submission,
        // logged-in or not, goes through the same validation: the same-origin
        // referer check below plus all four spam layers (reCAPTCHA, honeypot,
        // time-trap, keyword filter). CSRF value on a public contact form is
        // negligible — the endpoint takes no privileged action on behalf of
        // the logged-in user.
        $referer = wp_get_referer();
        if ($referer) {
            $ref_host  = wp_parse_url($referer, PHP_URL_HOST);
            $home_host = wp_parse_url(home_url(), PHP_URL_HOST);
            if ($ref_host && $home_host && strcasecmp($ref_host, $home_host) !== 0) {
                return $fail(__('Your request could not be verified. Please reload the page and try again.', 'dcc-contact-form'));
            }
        }

        $form_id = isset($post['form_id']) ? sanitize_text_field((string) wp_unslash($post['form_id'])) : '';
        $config  = Form_Config::get($form_id);
        if ($config === null) {
            return $fail(__('This form is no longer available. Please reload the page and try again.', 'dcc-contact-form'));
        }

        // 1) Honeypot — bots that fill the hidden field get a fake success and
        //    no email. Recorded as spam for the owner's visibility. The field
        //    is named innocuously (dcc_contact_code, label "Code") so bots
        //    can't skip it by pattern-matching "hp"/"honeypot"; dcc_hp is still
        //    checked for HTML cached before the rename.
        if (!empty($config['spam']['honeypot'])) {
            $hp = isset($post['dcc_contact_code']) ? trim((string) wp_unslash($post['dcc_contact_code'])) : '';
            if ($hp === '' && isset($post['dcc_hp'])) {
                $hp = trim((string) wp_unslash($post['dcc_hp']));
            }
            if ($hp !== '') {
                self::store_spam($config, $form_id, 'honeypot', []);
                return ['ok' => true, 'confirmation' => self::confirmation_html($config), 'message' => '', 'errors' => []];
            }
        }

        // 2) Validate + sanitize declared fields.
        [$values, $errors] = self::collect_fields($config['fields'], $post);
        if (!empty($errors)) {
            return $fail('', $errors);
        }

        // Build the ordered label => value rows used for storage + email.
        $rows = [];
        foreach ($config['fields'] as $field) {
            $rows[] = [
                'label' => $field['label'] !== '' ? $field['label'] : ucfirst($field['type']),
                'value' => (string) ($values[$field['id']] ?? ''),
            ];
        }

        // 3) Time-trap — reject submissions faster than the site minimum. JS
        //    writes elapsed ms into dcc_ts; a non-JS submit leaves it empty and
        //    skips this layer (the other layers still apply).
        if (!empty($config['spam']['time_trap'])) {
            $elapsed_raw = isset($post['dcc_ts']) ? (string) wp_unslash($post['dcc_ts']) : '';
            if ($elapsed_raw !== '' && is_numeric($elapsed_raw)) {
                $min_ms = Settings::min_submit_time() * 1000;
                if ((float) $elapsed_raw < $min_ms) {
                    self::store_spam($config, $form_id, 'time', $rows);
                    return $fail(__('This form was submitted too quickly. Please wait a moment and try again.', 'dcc-contact-form'));
                }
            }
        }

        // 4) Keyword filter.
        if (!empty($config['spam']['keyword_filter'])) {
            $keywords = Settings::keywords();
            if (!empty($keywords) && self::contains_keyword($rows, $keywords)) {
                self::store_spam($config, $form_id, 'keyword', $rows);
                return $fail(__("Sorry, your message can't be submitted because it contains prohibited words.", 'dcc-contact-form'));
            }
        }

        // 5) reCAPTCHA v3 — when enabled AND keys configured (graceful degrade:
        //    blank keys skip this layer entirely). Enforced on BOTH the AJAX
        //    path and the non-JS admin-post fallback: the fallback URL is
        //    printed in the form's action attribute, and bots that scrape the
        //    form POST straight to it — exempting that path would exempt most
        //    real bot traffic. A genuine no-JS visitor gets the failure
        //    message (v3 requires JS to mint a token; WPForms behaves the same).
        if (!empty($config['spam']['recaptcha']) && Settings::recaptcha_configured()) {
            $token = isset($post['dcc_recaptcha']) ? sanitize_text_field((string) wp_unslash($post['dcc_recaptcha'])) : '';
            if (!Recaptcha::verify($token)) {
                self::store_spam($config, $form_id, 'recaptcha', $rows);
                return $fail(__('Google reCAPTCHA verification failed, please try again later.', 'dcc-contact-form'));
            }
        }

        // Passed all layers. Build subject, store, email.
        $subject = self::build_subject($config, $config['fields'], $values);

        Entries::insert($rows, $subject, $form_id, 'ham');

        $config_for_email = $config;
        $config_for_email['reply_to'] = self::resolve_reply_to($config, $config['fields'], $values);
        Email::send($config_for_email, $rows, $subject);

        return ['ok' => true, 'confirmation' => self::confirmation_html($config), 'message' => '', 'errors' => []];
    }

    /* ------------------------------------------------------------------ */
    /* Field collection + validation                                       */
    /* ------------------------------------------------------------------ */

    /**
     * @return array{0:array<string,string>,1:array<string,string>} [values, errors]
     */
    private static function collect_fields(array $fields, array $post): array
    {
        $values = [];
        $errors = [];

        $raw = isset($post['dcc_field']) && is_array($post['dcc_field'])
            ? wp_unslash($post['dcc_field'])
            : [];

        foreach ($fields as $field) {
            $id       = $field['id'];
            $type     = $field['type'];
            $required = !empty($field['required']);
            $label    = $field['label'];
            $in       = $raw[$id] ?? '';

            switch ($type) {
                case 'name':
                    $first = is_array($in) ? sanitize_text_field((string) ($in['first'] ?? '')) : '';
                    $last  = is_array($in) ? sanitize_text_field((string) ($in['last'] ?? '')) : '';
                    $value = trim($first . ' ' . $last);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'email':
                    $value = sanitize_email(is_array($in) ? '' : (string) $in);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    } elseif ($value !== '' && !is_email($value)) {
                        $errors[$id] = __('Please enter a valid email address.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'tel':
                    $value = sanitize_text_field(is_array($in) ? '' : (string) $in);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    } elseif ($value !== '' && !self::valid_phone($value)) {
                        $errors[$id] = __('Please enter a valid phone number.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'textarea':
                    $value = sanitize_textarea_field(is_array($in) ? '' : (string) $in);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'number':
                    $value = sanitize_text_field(is_array($in) ? '' : (string) $in);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    } elseif ($value !== '' && !is_numeric($value)) {
                        $errors[$id] = __('Please enter a valid number.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'select':
                    $value = sanitize_text_field(is_array($in) ? '' : (string) $in);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    } elseif ($value !== '' && !empty($field['options']) && !in_array($value, $field['options'], true)) {
                        $errors[$id] = __('Please select a valid option.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'checkbox':
                    $checked = !is_array($in) && (string) $in !== '';
                    if ($required && !$checked) {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    }
                    $values[$id] = $checked ? ($label !== '' ? $label : __('Yes', 'dcc-contact-form')) : '';
                    break;

                case 'text':
                default:
                    $value = sanitize_text_field(is_array($in) ? '' : (string) $in);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;
            }
        }

        return [$values, $errors];
    }

    private static function valid_phone(string $value): bool
    {
        // Lightweight, library-free validation: allow digits and common
        // separators, require at least 7 digits total.
        if (!preg_match('/^[0-9+()\-.\s]{7,32}$/', $value)) {
            return false;
        }
        return preg_match_all('/[0-9]/', $value) >= 7;
    }

    private static function contains_keyword(array $rows, array $keywords): bool
    {
        $haystack = '';
        foreach ($rows as $row) {
            $haystack .= ' ' . $row['value'];
        }
        $haystack = mb_strtolower($haystack);
        foreach ($keywords as $kw) {
            if ($kw !== '' && mb_strpos($haystack, $kw) !== false) {
                return true;
            }
        }
        return false;
    }

    /* ------------------------------------------------------------------ */
    /* Merge tags / subject / reply-to / confirmation                      */
    /* ------------------------------------------------------------------ */

    private static function build_subject(array $config, array $fields, array $values): string
    {
        $subject = (string) ($config['subject'] ?? '');
        if ($subject === '') {
            $subject = __('Contact Request', 'dcc-contact-form');
        }
        $subject = self::replace_tags($subject, $fields, $values);
        $subject = trim(preg_replace('/\s+/', ' ', wp_strip_all_tags($subject)));
        return $subject !== '' ? $subject : __('Contact Request', 'dcc-contact-form');
    }

    /** Replace {Label} tokens (e.g. {Name}) with the matching field's value. */
    private static function replace_tags(string $text, array $fields, array $values): string
    {
        return preg_replace_callback('/\{([^{}]+)\}/', static function ($m) use ($fields, $values) {
            $token = trim($m[1]);
            $lower = mb_strtolower($token);
            foreach ($fields as $field) {
                if (mb_strtolower($field['label']) === $lower) {
                    return (string) ($values[$field['id']] ?? '');
                }
            }
            // {email} / {submitter email} → first email field value.
            if (in_array($lower, ['email', 'submitter email', 'submitter_email'], true)) {
                foreach ($fields as $field) {
                    if ($field['type'] === 'email') {
                        return (string) ($values[$field['id']] ?? '');
                    }
                }
            }
            return $m[0];
        }, $text) ?? $text;
    }

    private static function resolve_reply_to(array $config, array $fields, array $values): string
    {
        $raw = trim((string) ($config['reply_to'] ?? ''));

        $submitter = '';
        foreach ($fields as $field) {
            if ($field['type'] === 'email') {
                $submitter = (string) ($values[$field['id']] ?? '');
                break;
            }
        }

        if ($raw === '') {
            return $submitter;
        }
        $resolved = self::replace_tags($raw, $fields, $values);
        return sanitize_email($resolved);
    }

    private static function confirmation_html(array $config): string
    {
        $msg = trim((string) ($config['confirmation'] ?? ''));
        if ($msg === '') {
            $msg = __('Thank you. We will contact you shortly.', 'dcc-contact-form');
        }
        return wpautop(wp_kses_post($msg));
    }

    private static function store_spam(array $config, string $form_id, string $type, array $rows): void
    {
        $subject = $config['subject'] ?? '';
        if (is_string($subject) && $subject !== '') {
            $subject = wp_strip_all_tags($subject);
        }
        Entries::insert($rows, (string) $subject, $form_id, 'spam:' . $type);
    }
}
