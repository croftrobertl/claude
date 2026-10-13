<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Builds and sends the branded HTML notification email, reproducing the WPForms
 * "Elegant" template look: round logo header on the page background, a rounded
 * white content card with each field as a bold label above its value, and a
 * muted centered footer. Includes a prefers-color-scheme dark variant.
 */
final class Email
{
    private const LOGO_URL = 'https://doracanalcourt.com/wp-content/uploads/2024/08/DCC-Photos-Logo-1-Round.png';

    /**
     * @param array<int,array{label:string,value:string}> $fields
     */
    public static function send(array $config, array $fields, string $subject): bool
    {
        $to = sanitize_email((string) ($config['recipient'] ?? ''));
        if ($to === '' || !is_email($to)) {
            $to = get_option('admin_email');
        }

        $from_email = self::aligned_from($config);
        $from_name = trim((string) ($config['from_name'] ?? ''));
        if ($from_name === '') {
            $from_name = get_bloginfo('name');
        }

        // Reply-To: submitter's email when present, so a plain "Reply" reaches them.
        $reply_to = '';
        if (!empty($config['reply_to']) && is_email($config['reply_to'])) {
            $reply_to = sanitize_email((string) $config['reply_to']);
        }

        $headers = [
            'Content-Type: text/html; charset=UTF-8',
            sprintf('From: %s <%s>', self::encode_name($from_name), $from_email),
        ];
        if ($reply_to !== '') {
            $headers[] = 'Reply-To: ' . $reply_to;
        }

        $body = self::render($fields);

        return (bool) wp_mail($to, $subject, $body, $headers);
    }

    /**
     * @param array<int,array{label:string,value:string}> $fields
     */
    public static function render(array $fields): string
    {
        $rows = '';
        foreach ($fields as $field) {
            $label = esc_html($field['label']);
            $value = trim((string) $field['value']);
            // Preserve line breaks for textarea-style values.
            $value = $value === ''
                ? '<span style="color:#999;">&mdash;</span>'
                : nl2br(esc_html($value));

            $rows .= '<tr><td style="padding:0 0 18px 0;">'
                . '<div style="font-weight:700;font-size:14px;line-height:1.4;margin:0 0 4px 0;">' . $label . '</div>'
                . '<div style="font-size:15px;line-height:1.5;">' . $value . '</div>'
                . '</td></tr>';
        }

        return self::wrap($rows);
    }

    /**
     * The acknowledgement sent to a visitor who ticked "send me a copy".
     *
     * SECURITY — this deliberately contains NONE of the submitted data, not in
     * the body and not in the subject. The earlier version mailed the submitted
     * fields back, which turned the form into a spam relay: an attacker typed
     * their payload into the message field and a victim's address into the email
     * field, and the site delivered it from support@ with valid SPF and DKIM.
     * Every byte of this message is fixed text, so there is nothing for an
     * attacker to put in front of a third party. Do not reintroduce field
     * values, the subject line, or any other submitted value here.
     */
    public static function render_acknowledgement(): string
    {
        $heading = esc_html__('Thank you — we have your message', 'dcc-contact-form');
        $body    = esc_html__('This is a confirmation that your enquiry reached Dora Canal Court. We will reply as soon as we can.', 'dcc-contact-form');
        $tail    = esc_html__('No reply is needed to this message.', 'dcc-contact-form');

        $card = '<tr><td style="padding:0;">'
            . '<div style="font-weight:700;font-size:16px;line-height:1.4;margin:0 0 12px 0;">' . $heading . '</div>'
            . '<div style="font-size:15px;line-height:1.6;margin:0 0 12px 0;">' . $body . '</div>'
            . '<div style="font-size:13px;line-height:1.5;color:#777;">' . $tail . '</div>'
            . '</td></tr>';

        return self::wrap($card);
    }

    /**
     * The branded shell both emails share: round logo on the page background,
     * a rounded content card, muted footer, and a prefers-color-scheme dark
     * variant. Inline styles carry the light scheme (broadest client support);
     * the <style> block adds the dark override for clients that honour it.
     *
     * @param string $card Pre-escaped <tr> rows for the content card.
     */
    private static function wrap(string $card): string
    {
        $logo   = esc_url(self::LOGO_URL);
        $footer = esc_html__('Sent from DORA CANAL COURT', 'dcc-contact-form');

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  body { margin:0; padding:0; }
  a { color:#3081e3; }
  .dcc-page { background:#67c3f5; }
  .dcc-card { background:#ffffff; color:#333333; }
  .dcc-footer { color:#5b5b5b; }
  @media (prefers-color-scheme: dark) {
    .dcc-page { background:#5fa7fa !important; }
    .dcc-card { background:#1f1f1f !important; color:#dddddd !important; }
    .dcc-card a { color:#4059ff !important; }
    .dcc-footer { color:#c9c9c9 !important; }
  }
</style>
</head>
<body class="dcc-page" style="margin:0;padding:0;background:#67c3f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#67c3f5;" class="dcc-page">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
          <tr>
            <td align="center" style="padding:8px 0 22px 0;">
              <img src="{$logo}" width="110" height="110" alt="Dora Canal Court" style="display:block;width:110px;height:110px;border-radius:50%;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td class="dcc-card" style="background:#ffffff;color:#333333;border-radius:12px;padding:30px 32px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                {$card}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" class="dcc-footer" style="padding:20px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.5px;color:#5b5b5b;">
              {$footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }

    /**
     * Resolve the From address, forcing it onto the site's own domain.
     *
     * The site publishes DMARC p=reject, so only a domain-aligned sender
     * delivers: an off-domain From (or, worse, the guest's own address) is
     * silently discarded by the receiver and the enquiry is simply lost. The
     * From field is free text in the Elementor panel, so this guard is what
     * makes a typo survivable. Reply-To is where the guest's address belongs.
     *
     * Deliberately overridable for a site whose DNS is set up to authorise a
     * third-party sender:
     *   add_filter( 'dcc_contact_allow_unaligned_from', '__return_true' );
     */
    private static function aligned_from(array $config): string
    {
        $domain   = self::site_domain();
        $fallback = 'contact@' . $domain;

        $from = sanitize_email((string) ($config['from_email'] ?? ''));
        if ($from === '' || !is_email($from)) {
            return $fallback;
        }

        $host = strrchr($from, '@');
        $host = is_string($host) ? strtolower(substr($host, 1)) : '';
        $host = preg_replace('/^www\./', '', $host) ?? $host;

        if ($host === $domain) {
            return $from;
        }

        return apply_filters('dcc_contact_allow_unaligned_from', false, $from) ? $from : $fallback;
    }

    /**
     * Opt-in acknowledgement to the person who filled the form.
     *
     * Carries NO submitted content — see render_acknowledgement(). Subject and
     * body are both fixed text, so an attacker who supplies a third party's
     * address has nothing of their own delivered to it. Sent only to the address
     * typed into the form's own email field, only after every spam layer passes,
     * and only within the per-IP rate limit. From stays domain-aligned; Reply-To
     * points back at the site.
     */
    public static function send_copy(array $config, string $to): bool
    {
        $to = sanitize_email($to);
        if ($to === '' || !is_email($to)) {
            return false;
        }

        $from_email = self::aligned_from($config);
        $from_name  = trim((string) ($config['from_name'] ?? ''));
        if ($from_name === '') {
            $from_name = get_bloginfo('name');
        }

        $reply_to = sanitize_email((string) ($config['recipient'] ?? ''));
        if ($reply_to === '' || !is_email($reply_to)) {
            $reply_to = $from_email;
        }

        // Fixed subject. The notification's subject carries the {Name} merge tag
        // and therefore submitted text, so it must never be reused here.
        $subject = sprintf(
            /* translators: %s: site name */
            __('We received your message — %s', 'dcc-contact-form'),
            get_bloginfo('name')
        );

        $headers = [
            'Content-Type: text/html; charset=UTF-8',
            sprintf('From: %s <%s>', self::encode_name($from_name), $from_email),
            'Reply-To: ' . $reply_to,
            // A courtesy auto-copy should not trigger vacation responders.
            'Auto-Submitted: auto-generated',
            'X-Auto-Response-Suppress: All',
        ];

        return (bool) wp_mail($to, $subject, self::render_acknowledgement(), $headers);
    }

    private static function site_domain(): string
    {
        $host = wp_parse_url(home_url(), PHP_URL_HOST);
        $host = is_string($host) ? preg_replace('/^www\./', '', $host) : '';
        return $host !== '' ? $host : 'localhost';
    }

    /** Encode a display name for a mail header if it contains non-ASCII. */
    private static function encode_name(string $name): string
    {
        if (preg_match('/[^\x20-\x7E]/', $name)) {
            return '=?UTF-8?B?' . base64_encode($name) . '?=';
        }
        // Quote if it contains characters that need it.
        if (preg_match('/[",:;<>@\[\]\\\\]/', $name)) {
            return '"' . str_replace('"', '', $name) . '"';
        }
        return $name;
    }
}
