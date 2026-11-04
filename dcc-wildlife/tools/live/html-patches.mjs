/**
 * HTML PATCHES (1.48.0) — the served-HTML equivalent of each PHP change in
 * this release, applied by swap.mjs in `after` mode only. Each is a
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
      const style = `<style id="dccwl-gp-filter">${pills.map((p) => `.dccwl-gp .dccwl-gp-list[data-gp-group="${p}"]>.dccwl-gp-item:not([data-group="${p}"])`).join(',')}{display:none}</style>`;
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
