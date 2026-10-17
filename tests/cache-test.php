<?php
/**
 * Cache::key() / get_or_set() / flush_all().
 *
 * The behaviour that matters is the OUT-PARAMS. The client uses the age of a
 * hit to decide whether page-embedded availability is fresh enough to skip a
 * background revalidate, so "hit" and "age" have to be honest — and an age of
 * 0s on a genuine hit must NOT read as a miss, which is exactly why `$hit` is
 * a separate out-param rather than inferred from the age.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';

$GLOBALS['t_transients'] = [];
function get_transient($k) { t_count('get_transient'); return $GLOBALS['t_transients'][$k] ?? false; }
function set_transient($k, $v, $t) { t_count('set_transient'); $GLOBALS['t_transients'][$k] = $v; return true; }
function delete_transient($k) { unset($GLOBALS['t_transients'][$k]); return true; }
// Settings is required by the classes below since 0.40.0 (Cache::ttl(),
// Staff::page_id(), the Ajax clamps, the widgets' control defaults). In
// production the plugin's autoloader supplies it on demand; these harnesses
// require their classes explicitly, so it has to be named here. Left out, the
// suite FATALS rather than failing — which mutate.php reports as NO RUN, and
// which is how this was caught before it shipped.
require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';

use MPHBAC\Cache;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

echo "-- keys --\n";
$k1 = Cache::key(['a', 1]);
$k2 = Cache::key(['a', 1]);
$k3 = Cache::key(['a', 2]);
check('the same parts give the same key', $k1 === $k2);
check('different parts give different keys', $k1 !== $k3);
check('keys are namespaced, so a flush can find them', str_starts_with($k1, 'mphbac_'), $k1);

echo "\n-- get_or_set: miss, then hit --\n";
{
    $calls = 0;
    $produce = function () use (&$calls) { $calls++; return ['v' => 42]; };
    $age = null; $hit = null;
    $a = Cache::get_or_set($k1, $produce, 60, $age, $hit);
    check('a miss runs the producer and reports hit=false, age=0',
        $a === ['v' => 42] && $calls === 1 && $hit === false && $age === 0, compact('calls', 'hit', 'age'));
    $age = null; $hit = null;
    $b = Cache::get_or_set($k1, $produce, 60, $age, $hit);
    check('a hit does NOT run the producer and returns the same value',
        $b === ['v' => 42] && $calls === 1, compact('calls'));
    check('AN AGE OF 0 ON A HIT STILL REPORTS hit=true — the client depends on this',
        $hit === true && $age === 0, compact('hit', 'age'));
}

echo "\n-- an entry not in the current shape is recomputed, not returned raw --\n";
{
    $GLOBALS['t_options'][$k3] = ['bare' => 'legacy'];   // no __v / __t / __e
    $calls = 0;
    $age = null; $hit = null;
    $v = Cache::get_or_set($k3, function () use (&$calls) { $calls++; return 'fresh'; }, 60, $age, $hit);
    check('the unwrapped payload fails the shape check and is replaced',
        $v === 'fresh' && $calls === 1 && $hit === false, compact('calls', 'hit'));
    $row = $GLOBALS['t_options'][$k3] ?? null;
    check('...and the replacement IS wrapped — value, written-at and expiry — so the next read can age it',
        is_array($row) && array_key_exists('__v', $row) && isset($row['__t'], $row['__e']) && $row['__e'] === $row['__t'] + 60, $row);
}

echo "\n-- 0.47.4: A READ NEVER DELETES (the 2026-10-17 deadlock) --\n";
{
    $k = Cache::key(['expiry']);
    Cache::get_or_set($k, static fn() => 'old', 60);
    check('an entry is a plain option, NOT autoloaded (never in the every-page alloptions load)',
        isset($GLOBALS['t_options'][$k]) && ($GLOBALS['t_autoload'][$k] ?? null) === false, $GLOBALS['t_autoload'][$k] ?? 'unset');
    $GLOBALS['t_options'][$k]['__e'] = time() - 1;           // it has expired
    t_reset();
    $hit = null;
    $v = Cache::get_or_set($k, static fn() => 'new', 60, $age, $hit);
    check('an EXPIRED entry is a miss: recomputed, not served', $v === 'new' && $hit === false, compact('v', 'hit'));
    check('...and nothing was deleted on the way — no delete_option, no get_transient (which deletes an expired transient as it reads it)',
        !isset($GLOBALS['t_calls']['delete_option']) && !isset($GLOBALS['t_calls']['get_transient']) && !isset($GLOBALS['t_calls']['delete_transient']), $GLOBALS['t_calls']);
    check('...the row is overwritten in place with a new expiry', ($GLOBALS['t_options'][$k]['__v'] ?? null) === 'new' && $GLOBALS['t_options'][$k]['__e'] > time());
    $GLOBALS['t_options'][$k]['__e'] = time() - 1;
    t_reset();
    $p = Cache::peek($k);
    check('peek() of an expired entry: a miss, and no delete either', $p === null && !isset($GLOBALS['t_calls']['delete_option']) && !isset($GLOBALS['t_calls']['get_transient']), [$p, $GLOBALS['t_calls']]);
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-cache.php');
    $code = preg_replace('~/\*.*?\*/|//[^\n]*~s', '', $src);
    check('Cache calls no transient function at all any more', !preg_match('/\b(get|set|delete)_transient\s*\(/', $code));
    check('...and delete_option() appears only in sweep(), the daily clean-up',
        substr_count($code, 'delete_option(') === 1 && preg_match('/function sweep\b(?:(?!function ).)*delete_option\(/s', $code) === 1);
}

echo "\n-- a stored FALSE is a value, not a miss --\n";
{
    // get_option() answers its default for "absent", so a cached false would
    // be indistinguishable without the wrapper. The wrapper is what makes it
    // distinguishable; prove it.
    $k = Cache::key(['falsy']);
    $calls = 0;
    $produce = function () use (&$calls) { $calls++; return false; };
    Cache::get_or_set($k, $produce, 60);
    $hit = null;
    $v = Cache::get_or_set($k, $produce, 60, $age, $hit);
    check('a cached false is returned as a HIT, not recomputed',
        $v === false && $calls === 1 && $hit === true, compact('calls', 'hit'));
}

echo "\n-- flush_all is O(1) via the generation, not a scan --\n";
{
    $before = Cache::key(['same']);
    Cache::flush_all();
    $after = Cache::key(['same']);
    check('bumping the generation changes every key, so old entries are never read again',
        $before !== $after, ['before' => substr($before, -8), 'after' => substr($after, -8)]);
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-cache.php');
    check('the generation lives in an option, so it works with an external object cache',
        str_contains($src, 'update_option') && str_contains($src, 'GEN_OPTION'));
}

echo "\n-- the out-params are optional --\n";
{
    $k = Cache::key(['noout']);
    $v = Cache::get_or_set($k, static fn() => 'x', 60);
    check('a two-arg call still works (out-params are optional)', $v === 'x');
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
