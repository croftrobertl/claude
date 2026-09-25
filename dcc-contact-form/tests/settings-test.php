<?php
/**
 * Settings coverage for DCC Contact Form.
 *
 * Runs the REAL Settings class against a WordPress stub — no WP install needed:
 *   php dcc-contact-form/tests/settings-test.php
 *
 * Not shipped in the plugin zip (excluded at build time); it is source, not
 * runtime code.
 */

define('ABSPATH', __DIR__ . '/');

$GLOBALS['OPT'] = [];
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['OPT']) ? $GLOBALS['OPT'][$k] : $d; }
function update_option($k, $v, $a = null) { $GLOBALS['OPT'][$k] = $v; return true; }
function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
function sanitize_textarea_field($s) { return trim(strip_tags((string) $s)); }

require __DIR__ . '/../includes/class-settings.php';

use DCC_Contact\Settings;

$pass = 0; $fail = 0;
function check(string $label, $got, $want): void {
    global $pass, $fail;
    if ($got === $want) { $pass++; printf("  ok   %s\n", $label); return; }
    $fail++;
    printf("  FAIL %s\n         got=%s want=%s\n", $label, var_export($got, true), var_export($want, true));
}
function section(string $t): void { echo "\n=== $t ===\n"; }

/* ------------------------------------------------------------------ */
section('1. Defaults reproduce 1.5.0 behaviour exactly');
/* Every value here is what 1.5.0 shipped, taken from the Elementor control
   defaults and the old Settings::defaults(). If one of these changes, an
   untouched site changes behaviour on upgrade — which must never happen. */
$GLOBALS['OPT'] = [];
$d = Settings::all();
check('notify_to',            $d['notify_to'],            'contact@doracanalcourt.com');
check('notify_subject',       $d['notify_subject'],       'Contact Request: {Name}');
check('confirmation_message', $d['confirmation_message'], 'Thank you. We will contact you shortly.');
check('submit_text',          $d['submit_text'],          'Send Message');
check('submit_processing',    $d['submit_processing'],    'Sending...');
check('copy_to_sender OFF',   $d['copy_to_sender'],       false);
check('copy_label',           $d['copy_label'],           'Send me a copy of this message');
check('from_email',           $d['from_email'],           'contact@doracanalcourt.com');
check('from_name blank (Email resolves to site title)', $d['from_name'], '');
check('reply_to',             $d['reply_to'],             '{email}');
check('spam_honeypot ON',     $d['spam_honeypot'],        true);
check('spam_time_trap ON',    $d['spam_time_trap'],       true);
check('spam_keyword_filter ON', $d['spam_keyword_filter'], true);
check('spam_recaptcha ON',    $d['spam_recaptcha'],       true);
check('recaptcha_site_key',   $d['recaptcha_site_key'],   '');
check('recaptcha_secret_key', $d['recaptcha_secret_key'], '');
check('recaptcha_threshold',  $d['recaptcha_threshold'],  0.4);
check('min_submit_time',      $d['min_submit_time'],      2);
check('keyword_filter',       $d['keyword_filter'],       '');

/* ------------------------------------------------------------------ */
section('2. Upgrade: new keys merge into an already-stored row');
/* A row written by 1.5.0 knows only the five old keys. Every key added in
   1.6.0 must still read as its default, not as null/false. */
$GLOBALS['OPT'][Settings::OPTION] = [
    'recaptcha_site_key'   => 'OLD_SITE',
    'recaptcha_secret_key' => 'OLD_SECRET',
    'recaptcha_threshold'  => 0.7,
    'min_submit_time'      => 5,
    'keyword_filter'       => "casino\nviagra",
];
$u = Settings::all();
check('owner value survives (site key)',  $u['recaptcha_site_key'], 'OLD_SITE');
check('owner value survives (threshold)', $u['recaptcha_threshold'], 0.7);
check('owner value survives (min time)',  $u['min_submit_time'], 5);
check('NEW key notify_to defaults',       $u['notify_to'], 'contact@doracanalcourt.com');
check('NEW key submit_text defaults',     $u['submit_text'], 'Send Message');
check('NEW bool spam_honeypot defaults ON', $u['spam_honeypot'], true);
check('NEW bool copy_to_sender defaults OFF', $u['copy_to_sender'], false);
check('flag() agrees',                    Settings::flag('spam_time_trap'), true);

/* ------------------------------------------------------------------ */
section('3. Save with ABSENT keys (the trap the audit found)');
/* An unchecked checkbox posts nothing. A boolean must therefore read absence
   as FALSE; if it fell back to the default it would switch itself back on at
   every save, and a disabled spam layer could never be disabled. */
$GLOBALS['OPT'][Settings::OPTION] = Settings::defaults();
$saved = Settings::sanitize([
    'notify_to'     => 'new@doracanalcourt.com',
    'spam_honeypot' => '1',
    // spam_time_trap, spam_keyword_filter, spam_recaptcha, copy_to_sender absent
]);
check('posted bool stays ON',            $saved['spam_honeypot'], true);
check('ABSENT bool -> OFF (not default)', $saved['spam_time_trap'], false);
check('ABSENT bool -> OFF (not default)', $saved['spam_keyword_filter'], false);
check('ABSENT bool -> OFF (not default)', $saved['spam_recaptcha'], false);
check('posted text saved',               $saved['notify_to'], 'new@doracanalcourt.com');

/* A non-boolean absent from the POST must be PRESERVED, not reset — this is
   what the 1.5.0 sanitize() got wrong. */
$GLOBALS['OPT'][Settings::OPTION] = array_merge(Settings::defaults(), ['min_submit_time' => 9]);
$partial = Settings::sanitize(['notify_to' => 'x@doracanalcourt.com']);
check('ABSENT int preserves stored value', $partial['min_submit_time'], 9);
$GLOBALS['OPT'][Settings::OPTION] = array_merge(Settings::defaults(), ['keyword_filter' => 'casino']);
$partial2 = Settings::sanitize(['notify_to' => 'x@doracanalcourt.com']);
check('ABSENT textarea preserves stored', $partial2['keyword_filter'], 'casino');

/* ------------------------------------------------------------------ */
section('4. Sanitisation rejects bad input');
$GLOBALS['OPT'][Settings::OPTION] = Settings::defaults();
check('threshold 5 -> default',     Settings::sanitize(['recaptcha_threshold' => '5'])['recaptcha_threshold'], 0.4);
check('threshold -1 -> default',    Settings::sanitize(['recaptcha_threshold' => '-1'])['recaptcha_threshold'], 0.4);
check('threshold 0 honoured',       Settings::sanitize(['recaptcha_threshold' => '0'])['recaptcha_threshold'], 0.0);
check('threshold blank -> default', Settings::sanitize(['recaptcha_threshold' => ''])['recaptcha_threshold'], 0.4);
check('negative time clamped to 0', Settings::sanitize(['min_submit_time' => '-4'])['min_submit_time'], 0);
check('tags stripped from key',     Settings::sanitize(['recaptcha_site_key' => '<b>K</b>'])['recaptcha_site_key'], 'K');
check('tags stripped from subject', Settings::sanitize(['notify_subject' => '<script>x</script>Hi'])['notify_subject'], 'xHi');
check('non-array input survives',   is_array(Settings::sanitize('nonsense')), true);

/* ------------------------------------------------------------------ */
section('5. Typed accessors');
$GLOBALS['OPT'][Settings::OPTION] = array_merge(Settings::defaults(), [
    'recaptcha_threshold' => 2.5,        // out of range in storage
    'min_submit_time'     => -3,
    'keyword_filter'      => "Casino,\n viagra \n\n",
]);
check('threshold clamps on read', Settings::recaptcha_threshold(), 0.4);
check('min time clamps on read',  Settings::min_submit_time(), 0);
check('keywords parsed+lowered',  Settings::keywords(), ['casino', 'viagra']);
check('recaptcha not configured when keys blank', Settings::recaptcha_configured(), false);
$GLOBALS['OPT'][Settings::OPTION]['recaptcha_site_key']   = 'S';
$GLOBALS['OPT'][Settings::OPTION]['recaptcha_secret_key'] = 'K';
check('recaptcha configured with both keys', Settings::recaptcha_configured(), true);

echo "\n" . ($fail === 0 ? "ALL $pass CHECKS PASS\n" : "$fail FAILED / $pass passed\n");
exit($fail === 0 ? 0 : 1);
