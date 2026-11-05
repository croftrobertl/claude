/**
 * HTML PATCHES (1.48.0, extended for 1.48.1) — the served-HTML equivalent
 * of each PHP change since live's 1.47.3, applied by swap.mjs in `after` mode only. Each is a
 * function of the page text; swap.mjs reports any that changed nothing, so
 * a patch that silently stopped matching live cannot pass as applied.
 *
 * These are a MEASUREMENT AID, not the change: the PHP is the change, and
 * the offline harness (tools/tests/test-1480.php) proves the PHP renders
 * this markup. Each patch names the PHP it stands in for.
 */

/* Render::is_prose() — the same test, so patched markup is classed alike. */
const PROSE = /[.!?][”’"')\]]?\s+\S/;
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

export const HTML_PATCHES = [
  /* Water_Render::render_fishing() — one FWC link, no table (fix 6). */
  {
    name: 'fishing: limits table -> one FWC link',
    pages: ['/explore/', '/test/'],
    apply: (b) => b.replace(
      /<ul class="dccwl-fishing-reglist">[\s\S]*?<\/ul>\s*<p class="dccwl-fishing-note dccwl-fishing-verified">[\s\S]*?<\/p>/,
      '<p class="dccwl-fishing-limits"><a class="dccwl-fishing-limits-link" href="https://myfwc.com/fishing/freshwater/regulations/general/" rel="noopener nofollow" target="_blank">Current Limits on FWC <span aria-hidden="true">&#8599;</span></a></p>'),
  },
  /* The bottom link row no longer repeats the limits link; the source
   * line loses "veteran-guide reports" (Water_Data::default_fishing). */
  {
    name: 'fishing: source line and the one-link rule',
    pages: ['/explore/', '/test/'],
    apply: (b) => b
      .replace(/ · <a href="https:\/\/myfwc\.com\/fishing\/freshwater\/regulations\/general\/"[^>]*>[^<]*<\/a>/, '')
      .replace(/Limits, sportfish and attractors from Florida FWC; seasonal patterns from FWC’s Harris Chain forecast and veteran-guide reports\. The FWC forecast updates through the year — always check the FWC before you keep a fish\./,
        'Sportfish and attractors from Florida FWC. Season lines marked (FWC) are from FWC’s Harris Chain forecast; the others are general angling patterns, not measured on this water. The FWC forecast updates through the year — always check FWC before you keep a fish.'),
  },
  /* Render::prose_class() on the fishing paragraphs (fix 7). */
  {
    name: 'fishing: multi-sentence paragraphs marked prose',
    pages: ['/explore/', '/test/'],
    apply: (b) => b.replace(/<p class="(dccwl-fishing-(?:intro|line|note|src)[^"]*)">([\s\S]*?)<\/p>/g, (m, cls, inner) => {
      const own = strip(inner.replace(/<a\b[\s\S]*?<\/a>/g, ''));
      return PROSE.test(own) && !/dccwl-prose/.test(cls) ? `<p class="${cls} dccwl-prose">${inner}</p>` : m;
    }),
  },
  /* Water_Render::about_fold() — a list for the depth map, after the
   * block's own static facts (fix 8). */
  {
    name: 'about: live list for the depth map',
    pages: ['/explore/', '/test/'],
    apply: (b) => {
      const open = '<div class="dccwl-water-about">';
      const at = b.indexOf(open);
      if (at < 0) { return b; }
      /* Walk to this div's own closing tag. */
      const re = /<div\b|<\/div>/g;
      re.lastIndex = at + open.length;
      let depth = 1, m, end = -1;
      while ((m = re.exec(b))) { depth += '</div>' === m[0] ? -1 : 1; if (!depth) { end = m.index; break; } }
      if (end < 0) { return b; }
      return b.slice(0, at) + '<div class="dccwl-water-about" data-dccwl-about-block>' + b.slice(at + open.length, end) +
        '<ul class="dccwl-cards dccwl-water-facts" data-dccwl-about-live hidden></ul>' + b.slice(end);
    },
  },
  /* The water config: the tense age and the new strings (fix 8). */
  {
    name: 'water config: tenseDays, Issued, Today',
    pages: ['/explore/', '/test/'],
    apply: (b) => b
      .replace('"ageMax":{"level":14,"clarity":120,"oxygen":120}', '"ageMax":{"level":14,"clarity":120,"oxygen":120},"tenseDays":30')
      .replace('"freshToday":"Measured Today"', '"issuedToday":"Issued Today","issuedYesterday":"Issued Yesterday","issuedDays":"Issued %d Days Ago","freshToday":"Measured Today"')
      .replace('"ageToday":"today"', '"ageToday":"Today"'),
  },
  /* Water_Data::upgrade() — the stored seeded row's source, Title Case. */
  {
    name: 'about: seeded source chip Title Case',
    pages: ['/explore/', '/test/'],
    apply: (b) => b.split('Lake Dora (WBID 2831B), retrieved').join('Lake Dora (WBID 2831B), Retrieved'),
  },
  /* Render: the search placeholder in Title Case (fix 7). */
  {
    name: 'explore: search placeholder',
    pages: ['/explore/', '/test/'],
    apply: (b) => b.replace(/placeholder="Search (\d+) species"/, 'placeholder="Search $1 Species"'),
  },
  /* Guide_Page — the list carries the view; rows no longer ship hidden;
   * one rule per pill (fix 3). */
  {
    name: 'guide: list attributes, filter style, rows unhidden',
    pages: ['/wildlife-guide/'],
    apply: (b) => {
      const pills = [...new Set([...b.matchAll(/data-dccwl-gp-group="([a-z0-9_-]+)"/g)].map((m) => m[1]).filter((p) => 'all' !== p))];
      const style = `<style id="dccwl-gp-filter">${pills.map((p) => `.dccwl-gp .dccwl-gp-list[data-gp-group="${p}"]>.dccwl-gp-item:not([data-group="${p}"])`).join(',')}{border-width:0;contain-intrinsic-size:0 0;content-visibility:hidden;visibility:hidden}</style>`;
      return b
        .replace('<ol class="dccwl-gp-list dccwl-gp-list-split" data-dccwl-gp-list>', `${style}<ol class="dccwl-gp-list dccwl-gp-list-split" data-dccwl-gp-list data-gp-scope="here" data-gp-group="all">`)
        .replace(/(<li class="dccwl-gp-item[^>]*?id="[^"]+")\s+hidden(?=\s)/g, '$1');
    },
  },
  /* Guide_Page — one search wording (fix 7). */
  {
    name: 'guide: search wording',
    pages: ['/wildlife-guide/'],
    apply: (b) => b
      .replace(/Search (\d+) Species Seen Here/g, 'Search $1 Species')
      .replace('"searchHere":"Search %d Species Seen Here"', '"searchHere":"Search %d Species"')
      .replace('"searchWider":"Search All %d Species"', '"searchWider":"Search %d Species"'),
  },
  /* Guide_Page::row() — 168px thumbnails and data-no-lazy (fixes 9 and the
   * Director's request). Photon sizes from the width/height attributes, so
   * its URL is what those attributes would produce. */
  {
    name: 'guide: 3x thumbnails, data-no-lazy',
    pages: ['/wildlife-guide/'],
    apply: (b) => b
      .replace(/(<img[^>]*class="dccwl-gp-thumb"[^>]*?)resize=56%2C56([^>]*?)width="56" height="56"/g, '$1resize=168%2C168$2width="168" height="168" data-no-lazy="1"')
      .replace(/(<img[^>]*class="dccwl-gp-spot-img"[^>]*?)(\s*\/?>)/g, '$1 data-no-lazy="1"$2'),
  },
];

/* ---------------------------------------------------------------------
 * 1.48.1 — CREDITS BEHIND ⓘ. One builder, the exact markup Render::info()
 * prints (tools/tests/test-1481.php pins that markup in PHP), so the live
 * run exercises the same button, panel and ids the release ships.
 * ------------------------------------------------------------------- */
const INFO_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5M10 6.2v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
let infoSeq = 0;
const info = (label, inner) => {
  infoSeq += 1;
  const id = `dccwl-info-p${infoSeq}`;
  return `<span class="dccwl-info"><button type="button" class="dccwl-info-btn" popovertarget="${id}" aria-label="${label}">${INFO_SVG}</button><span class="dccwl-info-pop" id="${id}" popover="auto">${inner}</span></span>`;
};
const line = (html, role = '') => `<span class="dccwl-info-line${role ? ' ' + role : ''}">${html}</span>`;
const infoPatch = (p) => ({ ...p, apply: (b) => { infoSeq = 0; return p.apply(b); } });

HTML_PATCHES.push(
  /* Plugin::register_assets() — info.js, a dependency of sheet.js. */
  {
    name: '1.48.1: info.js before sheet.js',
    apply: (b) => b.replace(/(<script id="dcc-wildlife-sheet-js" src="([^"]*?)sheet\.js\?ver=[^"]*"><\/script>)/,
      (m, tag, base) => `<script id="dcc-wildlife-info-js" src="${base}info.js?ver=1.48.1"></script>${tag}`),
  },
  /* Water_Render::render_fishing() — the source line moves into an ⓘ at
   * the end of "Fishing the Harris Chain"; the limits action stays put. */
  infoPatch({
    name: '1.48.1: fishing sources -> ⓘ on the heading',
    pages: ['/explore/', '/test/'],
    apply: (b) => {
      const src = b.match(/<p class="dccwl-fishing-src[^"]*">\s*<span class="dccwl-fishing-src-note">([\s\S]*?)<\/span>\s*<span class="dccwl-fishing-src-links">\s*(<a [^>]*>FWC — Harris Chain fishing forecast<\/a>)[\s\S]*?<\/p>/);
      if (!src) { return b; }
      const panel = line(src[1].trim()) + line(src[2]);
      return b.replace(src[0], '')
        .replace('<h3 class="dccwl-water-sub">Fishing the Harris Chain</h3>',
          `<h3 class="dccwl-water-sub">Fishing the Harris Chain${info('Sources for the fishing guide', panel)}</h3>`);
    },
  }),
  /* Water_Render::render_fact() — the almanac cards: chip and attribution
   * line out, one ⓘ at the end of the card head holding source and date. */
  {
    name: '1.48.1: almanac cards -> ⓘ',
    pages: ['/explore/', '/test/'],
    apply: (b) => b.replace(
      /<div class="dccwl-card-head">\s*<span class="dccwl-card-label">([^<]*)<\/span>\s*<span class="dccwl-metachip dccwl-card-src">[\s\S]*?<\/span><\/span><\/div>(<p class="dccwl-card-value">[\s\S]*?<\/p>)\s*<p class="dccwl-water-attr">\s*([\s\S]*?)\s*(?:<span class="dccwl-water-date">\s*([^<]*)<\/span>)?\s*<\/p>/g,
      (m, label, value, srcHtml, date) => {
        infoSeq += 100;
        const panel = line(srcHtml.trim().replace(/>\s+/, '>'), 'dccwl-water-src') + (date ? line(date.trim(), 'dccwl-water-date') : '');
        return `<div class="dccwl-card-head"> <span class="dccwl-card-label">${label}</span>${info(`Source of ${label}`, panel)} </div> ${value}`;
      }),
  },
  /* Guide_Page — the spotlight's "as of" line into an ⓘ on its heading,
   * and the pane named by the title's own span. */
  infoPatch({
    name: '1.48.1: guide spotlight "as of" -> ⓘ',
    pages: ['/wildlife-guide/'],
    apply: (b) => b
      .replace('aria-labelledby="dccwl-gp-spot-h"', 'aria-labelledby="dccwl-gp-spot-t"')
      .replace(/<h2 class="dccwl-gp-spot-h" id="dccwl-gp-spot-h">Most Recorded Here<\/h2>\s*<p class="dccwl-gp-spot-sub" data-dccwl-gp-spot-asof>\s*([^<]*)<\/p>/,
        (m, asof) => `<h2 class="dccwl-gp-spot-h" id="dccwl-gp-spot-h"><span id="dccwl-gp-spot-t">Most Recorded Here</span>${info('Where these counts come from', `<span data-dccwl-gp-spot-asof>${line(asof.trim())}</span>`)}</h2>`),
  }),
  /* Guide_Page — each record's iNaturalist link, and each listing's rule. */
  {
    name: '1.48.1: guide records and listings -> ⓘ',
    pages: ['/wildlife-guide/'],
    apply: (b) => {
      infoSeq = 1000;
      return b
        .replace(/(<span class="dccwl-fg-k">Recorded (?:In Lake County|Near Here)<\/span>)\s*(<a class="dccwl-gp-locallink"[^>]*>)\s*([\s\S]*?<\/a>)/g,
          (m, k, open, rest) => `${k}${info('Source of this record', line(open + rest))} `)
        .replace(/(<p class="dccwl-fg-line dccwl-gp-protected" data-k="protected">[\s\S]*?\.)\s*(<a class="dccwl-gp-locallink"[^>]*>[^<]*<\/a>)<\/p>/g,
          (m, head, a) => `${head}${info('Source of the listing', line(a))} </p>`);
    },
  },
);

/*
 * THE /conditions PAYLOAD — the server-side half of fix 8, as Water_Live
 * now builds it: the depth map keyed `depth`, a past-tense value beside a
 * clarity comparison, and Title Case source names. Applied to the JSON the
 * live route returns.
 */
export function patchConditions(json) {
  let d;
  try { d = JSON.parse(json); } catch { return json; }
  const tc = (s) => String(s || '')
    .replace('open the depth map (PDF)', 'Open the Depth Map (PDF)')
    .replace(/, station /, ', Station ')
    .replace('USGS rain gauge (site ', 'USGS Rain Gauge (Site ')
    .replace('National Weather Service forecast', 'National Weather Service Forecast')
    .replace('SJRWMD station', 'SJRWMD Station');
  for (const f of (d.facts || [])) {
    if ('Depth Map' === f.label) { f.key = 'depth'; }
    if ('clarity' === f.key && f.short && f.detail && /than usual here$/.test(f.value || '')) {
      f.valuePast = `${f.short} — was ${f.detail}`;
    }
    if ('chain' === f.group && / — (clearer|murkier|about) (than )?usual for this water/.test(f.value || '')) {
      f.valuePast = f.value.replace(/ — (clearer|murkier|about)/, ' — was $1');
    }
    f.sourceName = tc(f.sourceName);
  }
  return JSON.stringify(d);
}
