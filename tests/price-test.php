<?php
/**
 * The price-estimate endpoint's validator and formatter.
 *
 * THIS IS THE ONE PLACE THE CLIENT INSERTS HTML. Everything else the plugin
 * sends is rendered with textContent; the price cannot be, because
 * mphb_format_price() emits the currency symbol as an entity and wraps parts
 * in spans. So the rule is narrower and stricter: the HTML is produced on the
 * server, passed through wp_kses to formatting-only tags, and the client puts
 * it into a controlled element with NO user input concatenated.
 *
 * The validator is the other half — it decides which requests reach MotoPress
 * at all, from a whitelisted accommodation id and a clamped date range.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
/** wp_kses, close enough to matter: it must actually drop disallowed tags. */
function wp_kses($html, $allowed) {
    $tags = implode(',', array_map(static fn($t) => '<' . $t . '>', array_keys($allowed)));
    return strip_tags((string) $html, $tags);
}
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-ajax.php';

use MPHBAC\Ajax;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$v = new ReflectionMethod(Ajax::class, 'validate_price_request');
$v->setAccessible(true);
$f = new ReflectionMethod(Ajax::class, 'format_price_html');
$f->setAccessible(true);
$today = new DateTimeImmutable('2026-09-20');
$valid = [22, 31, 35];
$ok = static fn($id, $ci, $co) => $v->invoke(null, $id, $ci, $co, $valid, $today);

echo "-- the accommodation id must be one we offer --\n";
check('a whitelisted id with a sane range validates', $ok(22, '2026-09-21', '2026-09-24') !== null);
check('an id not in the whitelist is refused', $ok(99, '2026-09-21', '2026-09-24') === null);
check('zero is refused', $ok(0, '2026-09-21', '2026-09-24') === null);
check('a negative id is refused', $ok(-22, '2026-09-21', '2026-09-24') === null);

echo "\n-- the dates --\n";
check('checkout before checkin is refused', $ok(22, '2026-09-24', '2026-09-21') === null);
check('a zero-night stay is refused', $ok(22, '2026-09-21', '2026-09-21') === null);
check('a checkin in the past is refused — the sheet\'s min attribute agrees',
    $ok(22, '2026-09-19', '2026-09-24') === null);
check('today itself is allowed', $ok(22, '2026-09-20', '2026-09-21') !== null);
check('junk dates are refused', $ok(22, 'tomorrow', 'next week') === null);
check('an empty date is refused', $ok(22, '', '') === null);
check('a far-future checkout is refused rather than queried',
    $ok(22, '2026-09-21', '2030-01-01') === null);
check('an over-long stay is refused', $ok(22, '2026-09-21', '2027-09-21') === null);

echo "\n-- the night count it hands on --\n";
{
    [$ci, $co, $nights] = $ok(22, '2026-09-21', '2026-09-24');
    check('three nights counted as three', $nights === 3, $nights);
    check('the parsed dates come back, not the raw strings',
        $ci instanceof DateTimeImmutable && $co instanceof DateTimeImmutable);
}

echo "\n-- the formatter, with MotoPress present --\n";
{
    // MPHB's real output shape: entity currency inside nested spans.
    eval('function mphb_format_price($p) { return "<span class=\"mphb-price\"><span class=\"mphb-currency\">&#036;</span>" . number_format((float) $p, 2) . "</span>"; }');
    $html = $f->invoke(null, 1234.0);
    check('the span wrapper survives — the client inserts this as HTML',
        str_contains($html, '<span'), $html);
    check('the entity currency survives, undecoded, for the browser to render',
        str_contains($html, '&#036;'), $html);
}

echo "\n-- ...and what it refuses to pass through --\n";
{
    // A formatter — MPHB's, a filter, or a theme override — could emit
    // anything. wp_kses is the wall, so prove it is a wall.
    $bad = '<span class="mphb-price">$10</span><script>alert(1)</script><img src=x onerror=1>';
    $out = wp_kses($bad, ['span' => ['class' => true], 'bdi' => []]);
    check('a script tag does not survive the allowlist', !str_contains($out, '<script'), $out);
    check('an img tag does not survive either', !str_contains($out, '<img'), $out);
    check('the price itself still comes through', str_contains($out, '$10'), $out);
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-ajax.php');
    preg_match("/wp_kses\(\s*\\\$html,\s*\[(.*?)\]\s*\);/s", $src, $km);
    preg_match_all("/^\s*'(\w+)'\s*=>/m", $km[1] ?? '', $tags);
    check('the allowlist really is only span and bdi',
        ($tags[1] ?? []) === ['span', 'bdi'], $tags[1] ?? null);
    check('and the reason is recorded where it is done', str_contains($src, 'sanitized here'));
}

echo "\n-- the no-MotoPress fallback --\n";
{
    $r = new ReflectionMethod(Ajax::class, 'format_price_html');
    $r->setAccessible(true);
    // Can't unload the function; assert the fallback's shape from the source.
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-ajax.php');
    check('the fallback is guarded on function_exists, not assumed',
        str_contains($src, "function_exists('mphb_format_price')"));
    check('...and emits a plain dollar entity rather than markup',
        str_contains($src, "'&#36;' . number_format"));
}

echo "\n-- a price of zero is not offered at all --\n";
{
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-ajax.php');
    check('priceHtml is only attached when the price is above zero',
        preg_match('/if \(\$price > 0\) \{\s*\$payload\[.priceHtml.\]/', $src) === 1);
    check('a failed lookup logs and does not fabricate a number',
        str_contains($src, 'period price lookup failed'));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
