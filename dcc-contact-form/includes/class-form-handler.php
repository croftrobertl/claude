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

    /**
     * Server-side length caps, in characters.
     *
     * The browser gets matching maxlength attributes, but those are a courtesy:
     * a scripted POST ignores them, so the limit that matters is this one. An
     * over-long value is reported to the visitor AND trimmed before storage,
     * so an unbounded field can neither be stored nor emailed whole.
     */
    public const MAX_LEN_TEXTAREA = 5000;
    public const MAX_LEN_FIELD    = 200;

    /** The cap that applies to a field type. */
    public static function max_len(string $type): int
    {
        return $type === 'textarea' ? self::MAX_LEN_TEXTAREA : self::MAX_LEN_FIELD;
    }

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

        // The arrow is concatenated, not translated: esc_html__() would escape
        // the entity and render a literal "&larr;" on the page.
        $back_label = '&larr; ' . esc_html__('Go back', 'dcc-contact-form');

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
        // referer check below plus the spam layers. CSRF value on a public
        // contact form is negligible — the endpoint takes no privileged action
        // on behalf of the logged-in user.
        if (!self::referer_ok()) {
            return $fail(__('Your request could not be verified. Please reload the page and try again.', 'dcc-contact-form'));
        }

        $form_id = isset($post['form_id']) ? sanitize_text_field((string) wp_unslash($post['form_id'])) : '';
        $config  = Form_Config::get($form_id);
        if ($config === null) {
            return $fail(__('This form is no longer available. Please reload the page and try again.', 'dcc-contact-form'));
        }

        // 1) Validate + sanitize the declared fields. Any errors are HELD here
        //    rather than returned: the honeypot below must answer first, so a
        //    bot never learns which fields it got wrong, and it needs the
        //    sanitized values so that a honeypot catch is stored WITH its
        //    content. An over-long value is recorded as an error and also
        //    trimmed, so the stored copy is bounded either way.
        [$values, $errors] = self::collect_fields($config['fields'], $post);

        // The ordered label => value rows used for storage + email.
        $rows = self::build_rows($config['fields'], $values);

        // 2) Honeypot — bots that fill the hidden field get a fake success and
        //    no email. Recorded as spam, WITH the submitted values: the field
        //    is hidden from humans but an aggressive autofill (iOS, a password
        //    manager) can still reach it, and an empty row would mean a real
        //    enquiry vanished behind a fake thank-you with nothing left to
        //    recover. The field is named innocuously (dcc_contact_code, label
        //    "Code") so bots can't skip it by pattern-matching
        //    "hp"/"honeypot"; dcc_hp is still checked for HTML cached before
        //    the rename.
        if (!empty($config['spam']['honeypot'])) {
            $hp = isset($post['dcc_contact_code']) ? trim((string) wp_unslash($post['dcc_contact_code'])) : '';
            if ($hp === '' && isset($post['dcc_hp'])) {
                $hp = trim((string) wp_unslash($post['dcc_hp']));
            }
            if ($hp !== '') {
                // A trapped submission that reads as human is flagged for
                // review, so the admin notice can raise a hand over it. It is
                // still stored as spam and still goes unemailed — the flag only
                // means "worth a look", never "deliver this".
                $layer = Triage::looks_human($rows) ? 'honeypot:maybe-real' : 'honeypot';
                self::store_spam($config, $form_id, $layer, $rows);
                return ['ok' => true, 'confirmation' => self::confirmation_html($config), 'message' => '', 'errors' => []];
            }
        }

        // 3) Now the held validation errors may be reported.
        if (!empty($errors)) {
            return $fail('', $errors);
        }

        // 4) Time-trap. The timing field is REQUIRED: a submission that omits
        //    it, or sends something non-numeric, FAILS the minimum-time check
        //    rather than skipping it. Previously an absent dcc_ts skipped the
        //    layer entirely, so the cheapest possible bypass was to not send
        //    the field — which is exactly what a scripted POST does.
        //
        //    This means submitting requires JavaScript. That is already true
        //    whenever reCAPTCHA is enabled, since v3 cannot mint a token
        //    without it; with reCAPTCHA off, this layer becomes the one that
        //    requires it. Turn the time-trap off to accept scripted or
        //    JS-less submissions.
        if (!empty($config['spam']['time_trap'])) {
            $elapsed_raw = isset($post['dcc_ts']) ? (string) wp_unslash($post['dcc_ts']) : '';
            $min_ms      = Settings::min_submit_time() * 1000;
            $too_fast    = ($elapsed_raw === '' || !is_numeric($elapsed_raw))
                || ((float) $elapsed_raw < $min_ms);

            if ($too_fast) {
                self::store_spam($config, $form_id, 'time', $rows);
                return $fail(__('This form was submitted too quickly. Please wait a moment and try again.', 'dcc-contact-form'));
            }
        }

        // 5) Keyword filter.
        if (!empty($config['spam']['keyword_filter'])) {
            $keywords = Settings::keywords();
            if (!empty($keywords) && self::contains_keyword($rows, $keywords)) {
                self::store_spam($config, $form_id, 'keyword', $rows);
                return $fail(__("Sorry, your message can't be submitted because it contains prohibited words.", 'dcc-contact-form'));
            }
        }

        // 6) reCAPTCHA v3 — when enabled AND keys configured (graceful degrade:
        //    blank keys skip this layer entirely). Enforced on BOTH the AJAX
        //    path and the non-JS admin-post fallback: the fallback URL is
        //    printed in the form's action attribute, and bots that scrape the
        //    form POST straight to it — exempting that path would exempt most
        //    real bot traffic.
        //
        //    ONLY A REAL VERDICT REJECTS. Google saying "this scores below the
        //    threshold", or "this token was not minted for your site", is
        //    evidence and still files the submission as spam. Never obtaining a
        //    verdict is NOT: a blocked script, a dropped or timed-out
        //    verification call, an expired token, or a wrong secret key used to
        //    lose the enquiry entirely. Those now go through as UNVERIFIED —
        //    saved, emailed, flagged for the owner — and the visitor sees the
        //    ordinary thank-you. A real guest is never turned away because a
        //    third-party script failed to load.
        $unverified = false;
        if (!empty($config['spam']['recaptcha']) && Settings::recaptcha_configured()) {
            $token   = isset($post['dcc_recaptcha']) ? sanitize_text_field((string) wp_unslash($post['dcc_recaptcha'])) : '';
            $verdict = Recaptcha::check($token);

            if ($verdict === Recaptcha::SPAM) {
                self::store_spam($config, $form_id, 'recaptcha', $rows);
                return $fail(__('Google reCAPTCHA verification failed, please try again later.', 'dcc-contact-form'));
            }

            $unverified = ($verdict === Recaptcha::UNVERIFIED);
        }

        // 7) Per-IP limit. Checked after the spam layers and before anything
        //    is stored or sent, so it meters ACCEPTED submissions — the only
        //    kind that can be used to send mail. See Rate_Limit for why
        //    attempts are deliberately not metered, and for the privacy
        //    posture (an HMAC of the address in a short-lived transient; no
        //    raw IP anywhere, nothing in the entries table).
        if (Rate_Limit::exceeded()) {
            self::store_spam($config, $form_id, 'rate', $rows);
            return $fail(__('You have sent several messages recently. Please wait a few minutes and try again.', 'dcc-contact-form'));
        }

        // Passed all layers. Build subject, store, email.
        $subject = self::build_subject($config, $config['fields'], $values);
        $status  = $unverified ? Entries::STATUS_UNVERIFIED : Entries::STATUS_OK;

        $entry_id = Entries::insert($rows, $subject, $form_id, $status);

        // The stored subject stays clean so it still matches what the guest
        // was told; the flag rides on the EMAIL subject, where the owner needs
        // to see it, and on the entry's status, which drives the Submissions
        // tab and badge.
        $email_subject = $unverified
            ? sprintf(
                /* translators: 1: "Unverified" marker, 2: the message subject */
                _x('[%1$s] %2$s', 'email subject with marker', 'dcc-contact-form'),
                __('Unverified', 'dcc-contact-form'),
                $subject
            )
            : $subject;

        $config_for_email = $config;
        $submitter = self::submitter_email($config['fields'], $values);
        $config_for_email['reply_to'] = self::resolve_reply_to($config, $config['fields'], $values);
        $sent = Email::send($config_for_email, $rows, $email_subject);

        // Opt-in acknowledgement. It carries NONE of the submitted content —
        // fixed text only — so supplying someone else's address here delivers
        // nothing of the sender's to them. That is what closed the relay: the
        // address is still attacker-chosen, but the payload is gone.
        if (!empty($config['copy_enabled']) && $submitter !== '') {
            $wants_copy = isset($post['dcc_copy']) && (string) wp_unslash($post['dcc_copy']) !== '';
            if ($wants_copy) {
                Email::send_copy($config_for_email, $submitter);
            }
        }

        // The entry is stored first, so a mail failure never loses the enquiry —
        // but it would otherwise be invisible. Flag it on the entry so the
        // Submissions screen shows which enquiries were never actually emailed.
        if (!$sent && $entry_id > 0) {
            Entries::set_status($entry_id, Entries::mail_failed_status($status));
            // Keep the count the admin notice is built from true.
            Entries::refresh_mail_failed_count();
        }

        // Count this submission against the address's allowance.
        Rate_Limit::record();

        return ['ok' => true, 'confirmation' => self::confirmation_html($config), 'message' => '', 'errors' => []];
    }

    /* ------------------------------------------------------------------ */
    /* Field collection + validation                                       */
    /* ------------------------------------------------------------------ */

    /**
     * Same-origin check on the RAW Referer header.
     *
     * It has to be the raw header. The previous version read wp_get_referer(),
     * which passes the value through wp_validate_redirect() and returns FALSE
     * for any host that is not this site — so `if ($referer)` was falsy exactly
     * when the referer was hostile, and the check could never reject anything.
     * A POST carrying `Referer: https://evil.example/` went straight through.
     *
     * An absent or empty header is allowed on purpose: referrer-policy and
     * browser privacy settings strip it from perfectly genuine submissions, and
     * rejecting those would cost real enquiries.
     *
     * A header that IS present but names a different host is refused. The
     * comparison ignores a www. prefix, so a visitor on the other spelling of
     * the domain is not turned away.
     */
    private static function referer_ok(): bool
    {
        $referer = isset($_SERVER['HTTP_REFERER']) ? trim((string) $_SERVER['HTTP_REFERER']) : '';
        if ($referer === '') {
            return true;
        }

        $ref_host = wp_parse_url($referer, PHP_URL_HOST);
        if (!is_string($ref_host) || $ref_host === '') {
            // Present but unparseable — not the same thing as absent.
            return false;
        }

        $home_host = wp_parse_url(home_url(), PHP_URL_HOST);
        if (!is_string($home_host) || $home_host === '') {
            return true;
        }

        return Urls::same_host($ref_host, $home_host);
    }

    /**
     * The ordered label => value rows used for storage and email.
     *
     * @return array<int,array{label:string,value:string}>
     */
    private static function build_rows(array $fields, array $values): array
    {
        $rows = [];
        foreach ($fields as $field) {
            $rows[] = [
                'label' => $field['label'] !== '' ? $field['label'] : ucfirst($field['type']),
                'value' => (string) ($values[$field['id']] ?? ''),
            ];
        }
        return $rows;
    }

    /**
     * Enforce a length cap: report it to the visitor and trim the value.
     *
     * Both halves matter. Reporting alone would let an unbounded string reach
     * storage on the honeypot path, which returns a fake success and never
     * looks at errors; trimming alone would silently swallow part of a genuine
     * enquiry without telling anyone.
     *
     * @param array<string,string> $errors Modified in place.
     */
    private static function cap(string $value, string $type, string $id, array &$errors): string
    {
        $max = self::max_len($type);
        if (mb_strlen($value) <= $max) {
            return $value;
        }

        if (!isset($errors[$id])) {
            $errors[$id] = sprintf(
                /* translators: %s: maximum number of characters */
                __('Please shorten this to %s characters or fewer.', 'dcc-contact-form'),
                number_format_i18n($max)
            );
        }

        return mb_substr($value, 0, $max);
    }

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
                    // Capped per subfield, before they are joined.
                    $first = self::cap($first, $type, $id, $errors);
                    $last  = self::cap($last, $type, $id, $errors);
                    $value = trim($first . ' ' . $last);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'email':
                    $value = sanitize_email(is_array($in) ? '' : (string) $in);
                    $value = self::cap($value, $type, $id, $errors);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    } elseif ($value !== '' && !is_email($value)) {
                        $errors[$id] = __('Please enter a valid email address.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'tel':
                    $value = sanitize_text_field(is_array($in) ? '' : (string) $in);
                    $value = self::cap($value, $type, $id, $errors);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    } elseif ($value !== '' && !self::valid_phone($value)) {
                        $errors[$id] = __('Please enter a valid phone number.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'textarea':
                    $value = sanitize_textarea_field(is_array($in) ? '' : (string) $in);
                    $value = self::cap($value, $type, $id, $errors);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'number':
                    $value = sanitize_text_field(is_array($in) ? '' : (string) $in);
                    $value = self::cap($value, $type, $id, $errors);
                    if ($required && $value === '') {
                        $errors[$id] = __('This field is required.', 'dcc-contact-form');
                    } elseif ($value !== '' && !is_numeric($value)) {
                        $errors[$id] = __('Please enter a valid number.', 'dcc-contact-form');
                    }
                    $values[$id] = $value;
                    break;

                case 'select':
                    $value = sanitize_text_field(is_array($in) ? '' : (string) $in);
                    $value = self::cap($value, $type, $id, $errors);
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
                    $value = self::cap($value, $type, $id, $errors);
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
            if ($kw === '') {
                continue;
            }

            // Multi-word phrases match as substrings. A single word matches only
            // on word boundaries, so a blocklist entry like "ass" no longer
            // silently rejects a genuine enquiry containing "class" or "Cassidy".
            if (mb_strpos($kw, ' ') !== false) {
                if (mb_strpos($haystack, $kw) !== false) {
                    return true;
                }
                continue;
            }

            $pattern = '/(?<![\p{L}\p{N}])' . preg_quote($kw, '/') . '(?![\p{L}\p{N}])/u';
            if (preg_match($pattern, $haystack) === 1) {
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

    /** The address the visitor typed into the form's first email field. */
    private static function submitter_email(array $fields, array $values): string
    {
        foreach ($fields as $field) {
            if ($field['type'] === 'email') {
                return (string) ($values[$field['id']] ?? '');
            }
        }
        return '';
    }

    private static function resolve_reply_to(array $config, array $fields, array $values): string
    {
        $raw = trim((string) ($config['reply_to'] ?? ''));

        $submitter = self::submitter_email($fields, $values);

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
        // insert_spam(), not insert(): past the daily cap the content is not
        // written at all, only tallied.
        Entries::insert_spam($rows, (string) $subject, $form_id, 'spam:' . $type);
    }
}
