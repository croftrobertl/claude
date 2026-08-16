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

        $from_email = sanitize_email((string) ($config['from_email'] ?? ''));
        if ($from_email === '' || !is_email($from_email)) {
            $from_email = 'contact@' . self::site_domain();
        }
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

        $logo = esc_url(self::LOGO_URL);
        $footer = esc_html__('Sent from DORA CANAL COURT', 'dcc-contact-form');

        // Inline styles carry the light scheme (broadest client support); the
        // <style> block adds the prefers-color-scheme dark override for clients
        // that honor it (Apple Mail, iOS Mail, etc.).
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
                {$rows}
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
