'use strict';
/**
 * DCC Seasons — the PHP and JS schedule resolvers must agree, every day.
 *
 * The schedule is rules, not dates, and the SAME rules are resolved twice:
 * in PHP for the admin table, and in ambient.js from the visitor's local
 * clock (which is what keeps cached HTML date-agnostic). Two
 * implementations of one spec drift silently — the failure is a visitor
 * seeing a different season from the one the owner scheduled, on some days
 * of some years only.
 *
 * So: resolve every day of a span of years both ways and compare. Anchors
 * move (Easter, the nth-weekday holidays), which is exactly where a drift
 * would hide, so the span covers enough years to exercise them.
 *
 * Usage: node tools/test-schedule.js [firstYear] [lastYear]
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

const ROOT = path.resolve(__dirname, '..');
const Y0 = parseInt(process.argv[2], 10) || 2024;
const Y1 = parseInt(process.argv[3], 10) || 2035;

/** PHP's answer for every day in the span. */
function phpDays() {
  const script = `
    define('ABSPATH', 1);
    function __($s, $d = null) { return $s; }
    function apply_filters($t, $v) { return $v; }
    require '${ROOT}/dcc-seasons/includes/class-schedule.php';
    $rows = \\DCC_Seasons\\Schedule::defaults();
    $out = [];
    for ($y = ${Y0}; $y <= ${Y1}; $y++) {
      for ($d = new DateTime("$y-01-01"); $d->format('Y') == $y; $d->modify('+1 day')) {
        $ds = $d->format('Y-m-d');
        $r = \\DCC_Seasons\\Schedule::active($rows, $ds);
        $out[$ds] = $r ? $r['theme'] : null;
      }
    }
    echo json_encode($out);
  `;
  const tmp = path.join(require('os').tmpdir(), 'dcc-sched-' + process.pid + '.php');
  fs.writeFileSync(tmp, '<?php ' + script);
  try {
    return JSON.parse(execFileSync('php', [tmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } finally { fs.unlinkSync(tmp); }
}

(async () => {
  const php = phpDays();
  const dates = Object.keys(php);
  console.log(`comparing ${dates.length} days, ${Y0}-${Y1}`);

  const cfg = config([]);
  const ses = await open(fixture({ kind: 'bravada', config: cfg }));
  try {
    await ses.page.waitForFunction(() => !!window.DCCSeasonsSchedule, null, { timeout: 15000 });

    /* ambient.js resolves the row; ask it the same question for each day.
     * activeRow() is the exported entry point the loader itself uses, so
     * this tests the shipped path, not a re-implementation of it. */
    const js = await ses.page.evaluate(({ rows, dates }) => {
      const out = {};
      for (const d of dates) {
        const r = window.DCCSeasonsSchedule.activeRow(rows, d);
        out[d] = r ? r.theme : null;
      }
      return out;
    }, { rows: cfg.schedule, dates });

    let same = 0;
    const diffs = [];
    for (const d of dates) {
      if (php[d] === js[d]) { same++; }
      else { diffs.push({ date: d, php: php[d], js: js[d] }); }
    }

    console.log(`  agree: ${same}/${dates.length}`);
    if (diffs.length) {
      console.log(`  DISAGREE on ${diffs.length} day(s):`);
      diffs.slice(0, 25).forEach(x => console.log(`    ${x.date}  php=${x.php}  js=${x.js}`));
      if (diffs.length > 25) { console.log(`    ... and ${diffs.length - 25} more`); }
    }

    /* Coverage: with the year-round base row present, no day may resolve to
     * nothing — a hole means a visitor gets no theme at all. */
    const holes = dates.filter(d => php[d] === null);
    console.log(`  uncovered days: ${holes.length}${holes.length ? ' -> ' + holes.slice(0, 5).join(', ') : ''}`);

    /* The base theme must actually win days, or naming it "year-round base"
     * is a fiction. This is the assertion 4.0.0 exists to make true. */
    const perYear = {};
    for (const d of dates) {
      const y = d.slice(0, 4);
      perYear[y] = perYear[y] || {};
      perYear[y][php[d]] = (perYear[y][php[d]] || 0) + 1;
    }
    const baseDays = Object.entries(perYear).map(([y, c]) => [y, c.florida_keys || 0]);
    const worstBase = Math.min(...baseDays.map(([, n]) => n));
    console.log(`  florida_keys days per year: ${baseDays.map(([y, n]) => y + ':' + n).join(' ')}`);

    const fail = diffs.length || holes.length || worstBase < 1;
    console.log(fail ? '\nFAIL' : '\nPASS — resolvers agree, no uncovered days, base theme appears every year');
    process.exit(fail ? 1 : 0);
  } finally { await ses.close(); }
})().catch(e => { console.error(e); process.exit(1); });
