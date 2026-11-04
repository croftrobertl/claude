/**
 * TEXT RULES ON LIVE (1.48.0) — the Irwin audit's own checker, re-run.
 *
 *   DCC_MODE=before node tools/live/text-rules.mjs   # live as served
 *   DCC_MODE=after  node tools/live/text-rules.mjs   # this build swapped in
 *
 * Walks /explore/ through Map, Now, Fishing, About, Wildlife and a species
 * sheet at 390 and 1440 and counts, per view: centred text without
 * `text-wrap: balance`, multi-sentence paragraphs that are centred, centred
 * list items, and Title Case misses on labels. GET only, as every live tool.
 * A paragraph's sentences are counted on its OWN words (a trailing link is
 * not a second sentence), the same test as Render::is_prose().
 */
import { chromium as getChromium, installSwap, SITE } from './swap.mjs';
const MODE = process.env.DCC_MODE || 'before';
const chromium = await getChromium();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });

const AUDIT = () => {
  const SMALL = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in', 'with', 'from', 'as', 'per', 'vs', 'via', 'into', 'up']);
  const UK = /\b(colou?rs?\b(?<!colors?)|colour\w*|behaviour\w*|centre\w*|grey\w*|favourit\w*|metres?\b|organis\w*|recognis\w*|licence\w*|travell\w*|neighbour\w*|harbour\w*|catalogue\w*|analys(e|ed|ing)\b|defence|programme|whilst|amongst|learnt|spelt|aluminium|mould\w*|moult\w*|manoeuvr\w*|savour\w*|flavour\w*|honour\w*|odour\w*|rumour\w*|vapour\w*|armour\w*|labour\w*|endeavour\w*|humour\w*|splendour|vigour|clamour|parlour|storey|tyres?\b|kerb|judgement|ageing|fulfil\b|enrol\b|sceptic\w*|plough\w*|cheque|realis(e|ed|es|ing)\b|minimis\w*|maximis\w*|optimis\w*|summaris\w*|apologis\w*|categoris\w*|criticis\w*|emphasis(e|ed|ing)\b|familiaris\w*|specialis\w*|characteris\w*|utilis\w*|practis(e|ed|ing)\b|towards|afterwards|grey)\b/gi;
  const surfaces = [...document.querySelectorAll('.dccwl-app, .dccwl-sheet')].filter((s) => s.getBoundingClientRect().width > 0);
  const seen = new Set();
  const out = { checked: 0, centeredNoBalance: [], notCentered: [], multiCentered: [], listCentered: [], titleCase: [], uk: [], gapless: [] };
  const vis = (e) => { const b = e.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none') return false; } return true; };
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const id = (e) => `${e.tagName}.${[...e.classList].slice(0, 2).join('.')}`;
  for (const s of surfaces) for (const e of s.querySelectorAll('*')) {
    if (seen.has(e)) continue; seen.add(e);
    if (/^(SCRIPT|STYLE|SVG|PATH|USE|IMG|INPUT|SELECT|OPTION|TEXTAREA|BR|I|EM|B|STRONG|A|SPAN|SMALL|ABBR|TIME)$/i.test(e.tagName) && !/\b(dccwl-(tile-name|fg-k|chip|tab|label|pill|badge|name|gp-name|sci))/.test(e.className)) continue;
    const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t || !own(e) && !/^(P|LI|H[1-6]|SUMMARY|BUTTON|LABEL|FIGCAPTION|DT|DD)$/.test(e.tagName)) continue;
    if (!vis(e)) continue;
    out.checked++;
    const cs = getComputedStyle(e);
    const align = cs.textAlign; const wrap = cs.textWrapStyle || cs.textWrap || '';
    const own2 = (() => { const c = e.cloneNode(true); c.querySelectorAll('a').forEach((x) => x.remove()); return (c.textContent || '').replace(/\s+/g, ' ').trim(); })();
    const sentences = /[.!?][\u201D\u2019"')\]]?\s+\S/.test(own2) ? 2 : 1;
    const inLi = !!e.closest('li') && (e.tagName === 'LI' || e.closest('li').contains(e)) && !!e.closest('ul.dccwl-bullets, ul:not([class]), ol:not([class]), .dccwl-fullguide-body ul, .dccwl-photo-credits-list');
    const isList = e.tagName === 'LI' && inLi;
    const item = `${id(e)} "${t.slice(0, 60)}" [${align}${wrap ? ', ' + wrap : ''}]`;
    const centered = align === 'center' || (align === 'start' && false);
    if (isList) { if (centered) out.listCentered.push(item); continue; }
    if (e.tagName === 'P' && sentences >= 2) { if (centered) out.multiCentered.push(item); continue; }
    if (/^(BUTTON|SUMMARY|LABEL)$/.test(e.tagName) || e.closest('button, summary, [role="tab"], [role="menuitem"]')) continue; /* controls: judged by look, not text-align */
    if (!centered) out.notCentered.push(item);
    else if (!/balance/.test(wrap)) out.centeredNoBalance.push(item);
  }
  /* Title Case on titles and labels: headings, sheet titles, tabs, buttons, summaries, tile names. */
  for (const e of [...document.querySelectorAll('.dccwl-app h1, .dccwl-app h2, .dccwl-app h3, .dccwl-app h4, .dccwl-sheet h2, .dccwl-sheet h3, .dccwl-sheet h4, .dccwl-sheet-title, .dccwl-app button, .dccwl-sheet button, .dccwl-app summary, .dccwl-app .dccwl-tile-name, .dccwl-app .dccwl-fg-k, .dccwl-sheet .dccwl-fg-k, .dccwl-app .dccwl-legend span, .dccwl-sheet .dccwl-detail-h')].filter(vis)) {
    const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 70) continue;
    const words = t.replace(/[^\p{L}\p{N}' -]/gu, ' ').split(/\s+/).filter(Boolean);
    const bad = words.filter((w, i) => /^[a-z]/.test(w) && !(i > 0 && SMALL.has(w)) && !/^(x|mph|ft|in|km|mi|vs|e\.g)$/.test(w));
    if (bad.length) out.titleCase.push(`${id(e)} "${t.slice(0, 60)}" -> ${bad.slice(0, 3).join(',')}`);
  }
  const all = surfaces.map((s) => s.innerText).join('\n');
  out.uk = [...new Set((all.match(UK) || []).map((x) => x.toLowerCase()))];
  for (const k of ['centeredNoBalance', 'notCentered', 'multiCentered', 'listCentered', 'titleCase']) { out[k + 'N'] = out[k].length; out[k] = [...new Set(out[k])].slice(0, 14); }
  return out;
};


const PAGE = process.env.DCC_PAGE || 'explore';
const totals = {};
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
  const page = await ctx.newPage();
  await installSwap(page, { mode: MODE });
  await page.goto(`${SITE}/${PAGE}/`, { waitUntil: 'load', timeout: 180000 });
  const tap = (sel) => (w < 900 ? page.tap(sel, { timeout: 8000 }) : page.click(sel, { timeout: 8000 }));
  await page.evaluate(() => document.querySelector('.dccwl-canal').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(3000);
  const views = {};
  views.map = await page.evaluate(AUDIT);
  await tap('[data-dccwl-water-tab-btn="now"]'); await page.waitForTimeout(900); views.now = await page.evaluate(AUDIT);
  await tap('[data-dccwl-water-tab-btn="fishing"]'); await page.waitForTimeout(900); views.fishing = await page.evaluate(AUDIT);
  await tap('.dccwl-canal summary[aria-label*="About"]'); await page.waitForTimeout(900); views.about = await page.evaluate(AUDIT);
  await tap('.dccwl-canal summary[aria-label*="About"]');
  await tap('[data-dccwl-viewtrigger]'); await tap('[data-dccwl-view="wildlife"]'); await page.waitForTimeout(3000); views.wildlife = await page.evaluate(AUDIT);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile')].find((x) => x.getBoundingClientRect().width > 0 && /Alligator/.test(x.textContent)) || [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile')].find((x) => x.getBoundingClientRect().width > 0); t.setAttribute('data-tr', '1'); });
  await tap('[data-tr="1"]'); await page.waitForTimeout(1500); views.sheet = await page.evaluate(AUDIT);
  for (const [k, v] of Object.entries(views)) {
    const row = { checked: v.checked, centeredNoBalance: v.centeredNoBalanceN, multiCentered: v.multiCenteredN, listCentered: v.listCenteredN, titleCase: v.titleCaseN };
    totals[`${w} ${k}`] = row;
    console.error(`${MODE} ${PAGE} ${w} ${k}: ${JSON.stringify(row)}${v.centeredNoBalanceN ? ' noBal: ' + JSON.stringify(v.centeredNoBalance.slice(0, 3)) : ''}${v.multiCenteredN ? ' multi: ' + JSON.stringify(v.multiCentered.slice(0, 3)) : ''}${v.titleCaseN ? ' tc: ' + JSON.stringify(v.titleCase.slice(0, 4)) : ''}`);
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ mode: MODE, page: PAGE, totals }, null, 1));
