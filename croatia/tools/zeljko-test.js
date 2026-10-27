#!/usr/bin/env node
// The Zeljko Test: the accuracy check every history text on this site must pass before it ships.
// The standard it enforces is written out in croatia/ZELJKO-TEST.md.
//
//   node tools/zeljko-test.js           check everything; exit 1 on any failure
//   node tools/zeljko-test.js --sheet   also write ZELJKO-REVIEW.md, the sign-off sheet for local experts
//
// No dependencies. It reads history/chronicle.json, the history constants in bundle.js,
// history/history.js and trip.json, and only reports on history/history-data.json (never edits it).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fails = [], warns = [];
const fail = (where, msg) => fails.push(where + ': ' + msg);
const warn = (where, msg) => warns.push(where + ': ' + msg);

// ---------- load ----------
const chron = JSON.parse(read('history/chronicle.json'));
const bundle = read('bundle.js');
const histJs = read('history/history.js');
const trip = JSON.parse(read('trip.json'));
const placeNames = [...new Set(trip.days.flatMap(d => (d.places || []).map(p => p.name)))];

// pull a literal constant (`const NAME = [ ... ];` or `{ ... };`) out of bundle.js and evaluate it
function constant(name) {
  const at = bundle.indexOf('const ' + name + ' = ');
  if (at < 0) throw new Error('bundle.js: const ' + name + ' not found');
  const open = bundle.indexOf('=', at) + 1;
  const end = bundle.indexOf(/^\s*\[/.test(bundle.slice(open, open + 3)) ? '\n  ];' : '\n  };', open);
  const lit = end > 0 && end - open < 60000 ? bundle.slice(open, end + 4).replace(/;$/, '') : null;
  if (lit && /^\s*['"]/.test(bundle.slice(open, open + 3))) return null;
  return new Function('return ' + lit)();
}
function stringConstant(name) {
  const m = bundle.match(new RegExp('const ' + name + " = '((?:[^'\\\\]|\\\\.)*)'"));
  return m ? m[1].replace(/\\'/g, "'") : null;
}
const THEN_MARKS = constant('THEN_MARKS');
const PLACE_HISTORY = constant('PLACE_HISTORY');
const SIEGE_SPOTS = constant('SIEGE_SPOTS');
const SIEGE_AREAS = constant('SIEGE_AREAS');
const GLOSSARY = constant('GLOSSARY');
const EV_TIERS = constant('EV_TIERS');
const SIEGE_FORT = stringConstant('SIEGE_FORT');

// the site's own id and evidence functions, mirrored
const chronId = t => String(t).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tierOf = u => (EV_TIERS.find(t => t[2].test(u)) || EV_TIERS[3])[0];

// ---------- every piece of visible history text, with where it lives ----------
const texts = [];   // { where, text, src? }
chron.strands.forEach(st => {
  texts.push({ where: 'chronicle/' + st.id + ' intro', text: [st.name, st.kicker, st.intro].join(' ') });
  st.events.forEach(ev => {
    const w = 'chronicle/' + st.id + ' “' + ev.title + '”';
    texts.push({ where: w, text: [ev.y, ev.title, ev.text].concat((ev.days || []).map(d => d[2])).concat((ev.src || []).map(s => s[0])).join(' ') });
  });
});
texts.push({ where: 'chronicle/records', text: [chron.records.title].concat(chron.records.points).concat((chron.records.src || []).map(s => s[0])).join(' ') });
THEN_MARKS.forEach(m => texts.push({ where: 'landmark “' + m.t + '”', text: [m.t, m.s, m.x].concat((m.src || []).map(s => s[0])).join(' ') }));
PLACE_HISTORY.forEach(n => texts.push({ where: 'place note ' + n.re, text: [n.short, n.text].concat((n.src || []).map(s => s[0])).join(' ') }));
SIEGE_SPOTS.forEach(s => texts.push({ where: 'siege spot “' + s.t + '”', text: s.t + ' ' + s.s }));
Object.keys(SIEGE_AREAS).forEach(k => texts.push({ where: 'siege area ' + k, text: Object.values(SIEGE_AREAS[k]).filter(v => typeof v === 'string').join(' ') }));
if (SIEGE_FORT) texts.push({ where: 'SIEGE_FORT', text: SIEGE_FORT });
GLOSSARY.forEach(g => texts.push({ where: 'glossary “' + g[0] + '”', text: g.join(' ') }));
const stripUrls = t => String(t).replace(/https?:\/\/\S+/g, ' ');

// ---------- 1. known errors that must never come back ----------
// each was once on the site, or is a common mistake in guidebooks; the right version is in the comment
const KNOWN_ERRORS = [
  [/25 September 1991[^.]{0,80}blockad|blockad[^.]{0,80}25 September 1991/i, 'the naval blockade began on 17 September 1991, not the 25th'],
  [/23 September 1991[^.]{0,60}first shell|first shell[^.]{0,60}23 September/i, 'the first shells fell on 22 September 1991'],
  [/31 May 1992/, 'the siege was broken on 26 May 1992'],
  [/besieged it until 1 October|until 1 October 1806/i, 'the 1806 siege was lifted by Molitor on 6 July 1806'],
  [/bridge from 1537|1537[^.]{0,30}bridge/i, 'the stone bridge at Pile is from 1471, by Paskoje Miličević'],
  [/Left leaning by the 1667|leaning by 1667/i, 'the bell tower began to lean in the 1800s'],
  [/Orlando[’']?s? Column[^.]{0,80}1419|1419[^.]{0,80}Orlando/i, 'Orlando’s Column is from 1418'],
  [/\bcivil war\b[^.]{0,120}(199\d|Homeland|Dubrovnik|Yugoslav (army|navy)|JNA)|(199\d|Homeland|JNA)[^.]{0,120}\bcivil war\b/i, 'the 1991–95 war is the Homeland War (Domovinski rat); never call it a civil war'],
  [/Dubrovnik (fell|was taken|was captured|surrendered)/i, 'Dubrovnik was never taken in 1991–92'],
  [/Fort Imperial (fell|was taken|was captured)/i, 'Fort Imperial held on 6 December 1991'],
  [/Serbo-Croat(ian)? war|ethnic conflict between/i, 'say the attack on Dubrovnik / the Homeland War'],
  [/forty days[^.]{0,40}1377|1377[^.]{0,60}(forty|40) days/i, 'Ragusa’s 1377 law set 30 days (trentino); 40 days was Venice’s later rule'],
  [/Bonino da Milano[^.]{0,40}alone/i, 'Orlando was carved by Bonino da Milano with Antun Dubrovčanin'],
  [/Ragusa (was|became) (a )?(colony|part) of Venice (until|from) 1808/i, 'Venetian rule ended in 1358; the Republic was abolished by the French in 1808'],
  [/abolished (in|on) 1806/i, 'the French occupied Ragusa in 1806 and abolished the Republic on 31 January 1808'],
];
// the checker checks itself: each rule must still catch the mistake it was written for
const SAMPLES = ['On 25 September 1991 the navy began its blockade', 'the first shells fell on 23 September 1991', 'it ended on 31 May 1992',
  'they besieged it until 1 October', 'a stone bridge from 1537', 'Left leaning by the 1667 quake', 'Orlando’s Column was carved in 1419',
  'the civil war of 1991', 'and Dubrovnik fell', 'Fort Imperial fell that day', 'the Serbo-Croatian war', 'forty days, as decreed in 1377',
  'by Bonino da Milano alone', 'Ragusa was part of Venice until 1808', 'the Republic was abolished in 1806'];
KNOWN_ERRORS.forEach(([re], i) => { if (!SAMPLES[i] || !re.test(SAMPLES[i])) fail('zeljko-test.js', 'rule ' + re + ' no longer catches “' + SAMPLES[i] + '”'); });
texts.forEach(({ where, text }) => KNOWN_ERRORS.forEach(([re, why]) => { if (re.test(stripUrls(text))) fail(where, 'known error: ' + why); }));
[['bundle.js', bundle], ['history/history.js', histJs]].forEach(([f, src]) => KNOWN_ERRORS.forEach(([re, why]) => {
  const m = stripUrls(src).match(re);
  if (m) fail(f, 'known error “' + m[0] + '”: ' + why);
}));

// ---------- 2. local names spelled as the people there spell them ----------
// an ASCII-ized name in visible text means the diacritics were lost (Srđ, not Srd)
const ASCII_NAMES = ['Srd', 'Cilipi', 'Zupa', 'Gruz', 'Ploce', 'Sipan', 'Kolocep', 'Peljesac', 'Mokosica', 'Rozat',
  'Orasac', 'Brsecine', 'Zarkovica', 'Strincjera', 'Milicevic', 'Boskovic', 'Drzic', 'Kosaca', 'Kotromanic', 'Dusan',
  'Marinovic', 'Cosic', 'Tudjman', 'Tudman', 'Rudjer', 'Ruder', 'Sumet', 'Djurinici', 'Durinici', 'Dubrovcanin', 'Sudurad',
  'Skocibuha', 'Lopud', 'Cavtat', 'Mlini', 'Molunat', 'Gundulic', 'Getaldic', 'Lucic', 'Bunic', 'Gucetic', 'Sorkocevic',
  'Juraj Dalmatinac', 'Minceta', 'Lovrijenac', 'Konavle', 'Smokovljani', 'Dubravka', 'Sokol Grad', 'Vitaljina',
  'Grude', 'Pridvorje', 'Gruda', 'Mrcine', 'Popovici', 'Dunave', 'Komaji', 'Ljuta', 'Stravca', 'Brgat', 'Cibaca', 'Kupari',
  'Plat', 'Zaton', 'Trsteno', 'Slano', 'Ston', 'Lapad', 'Babin Kuk', 'Bosanka', 'Zarkovica', 'Nuncijata', 'Osojnik'];
// names in that list that are already correct in plain ASCII are fine; only flag those with a missing diacritic
const NEED_MARKS = ASCII_NAMES.filter(n => !/^(Lopud|Cavtat|Mlini|Molunat|Lovrijenac|Konavle|Smokovljani|Dubravka|Sokol Grad|Vitaljina|Grude|Pridvorje|Gruda|Dunave|Komaji|Ljuta|Stravca|Brgat|Kupari|Plat|Zaton|Trsteno|Slano|Ston|Lapad|Babin Kuk|Bosanka|Nuncijata|Osojnik|Juraj Dalmatinac)$/.test(n));
const asciiRe = new RegExp('(?<![\\p{L}\\-/.])(' + NEED_MARKS.join('|') + ')(?![\\p{L}])', 'u');
texts.forEach(({ where, text }) => {
  const m = stripUrls(text).match(asciiRe);
  if (m) fail(where, 'name without its diacritics: “' + m[1] + '”');
});

// ---------- 3. punctuation slips ----------
texts.forEach(({ where, text }) => {
  const t = stripUrls(text);
  if (/,,|(?<!\.)\.\.(?!\.)|\s[,.;:](?!\d)|\(\s|\s\)/.test(t)) fail(where, 'stray punctuation: “' + (t.match(/.{0,20}(,,|(?<!\.)\.\.(?!\.)|\s[,.;:](?!\d)|\(\s|\s\)).{0,20}/) || [''])[0] + '”');
  if (/ {2,}/.test(t)) warn(where, 'double space');
});

// ---------- 4. every claim traceable ----------
const BANNED_SOLE = /tripadvisor|airbnb|booking\.com|fandom\.com|medium\.com|substack\.com|quora\.com|reddit\.com|pinterest\./;
function checkSources(where, src, { need = true } = {}) {
  if (!src || !src.length) { if (need) fail(where, 'no sources'); return; }
  const urls = src.map(s => s[1]);
  src.forEach(([label, url]) => {
    if (!label || !url) fail(where, 'source without label or link');
    else if (!/^https:\/\//.test(url)) fail(where, 'source is not https: ' + url);
  });
  if (new Set(urls).size !== urls.length) fail(where, 'the same source listed twice');
  const tiers = urls.map(tierOf), best = Math.max(...tiers);
  const solid = urls.filter(u => !BANNED_SOLE.test(u));
  if (!solid.length) fail(where, 'only user-generated sources');
  // the rule: one institutional, archival, scholarly or court source, or two independent ones
  const domains = new Set(solid.map(u => u.replace(/^https:\/\/(www\.)?([^/]+).*/, '$2').replace(/^[a-z]{2}\.(wikipedia\.org)$/, '$1')));
  if (best < 3 && domains.size < 2) warn(where, 'thin evidence: one independent source below institutional level (' + [...domains].join(', ') + ')');
  if (best === 1) warn(where, 'only travel-guide or blog sources');
}
const seenTitles = new Map(), allIds = new Set();
chron.strands.forEach(st => {
  let lastSort = -Infinity, lastD = '';
  st.events.forEach(ev => {
    const w = 'chronicle/' + st.id + ' “' + ev.title + '”';
    checkSources(w, ev.src);
    // unique titles (their ids are the deep links)
    const id = chronId(ev.title);
    if (seenTitles.has(id)) fail(w, 'title clashes with ' + seenTitles.get(id));
    seenTitles.set(id, w); allIds.add(id);
    // dates agree with each other
    const yNums = (String(ev.y).match(/\d{3,4}s?/g) || []).map(n => ({ n: parseInt(n, 10), dec: /s$/.test(n) }));
    if (!/In memory|^c\.|BC|century/i.test(ev.y) && yNums.length) {
      const lo = Math.min(...yNums.map(x => x.n)), hi = Math.max(...yNums.map(x => x.n + (x.dec ? 9 : 0)));
      if (typeof ev.sort === 'number' && (ev.sort < lo - 1 || ev.sort > hi + 1)) fail(w, 'sort ' + ev.sort + ' is outside “' + ev.y + '”');
      (ev.days || []).forEach(([md, year]) => {
        if (year != null && year < lo || year > hi) fail(w, 'anniversary year ' + year + ' is outside “' + ev.y + '”');
      });
      if (ev.d) {
        const yr = +ev.d.slice(0, 4);
        if (yr < lo || yr > hi) fail(w, 'date ' + ev.d + ' is outside “' + ev.y + '”');
      }
    }
    (ev.days || []).forEach(([md, year, line]) => {
      // a null year is a yearly feast (St. Blaise, 3 February)
      const [m, d] = md.split('-').map(Number), dt = new Date(Date.UTC(year == null ? 2000 : year, m - 1, d));
      if (!/^\d\d-\d\d$/.test(md) || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) fail(w, 'not a real date: ' + md + ' ' + year);
      if (!line || /\.$/.test(line)) fail(w, 'anniversary line should be a sentence fragment without a full stop: “' + line + '”');
      // a single-day “y” must be that anniversary
      const one = String(ev.y).match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})$/);
      if (one && ev.days.length === 1 && year != null) {
        const mm = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(one[2]) / 3 + 1;
        if (+one[1] !== d || mm !== m || +one[3] !== year) fail(w, 'heading “' + ev.y + '” disagrees with anniversary ' + md + ' ' + year);
      }
    });
    if (ev.d) {
      if (!/^\d{4}-\d\d-\d\d$/.test(ev.d) || isNaN(Date.parse(ev.d))) fail(w, 'bad calendar date ' + ev.d);
      const one = String(ev.y).match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})$/);
      if (one) {
        const mm = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(one[2]) / 3 + 1;
        if (ev.d !== one[3] + '-' + String(mm).padStart(2, '0') + '-' + one[1].padStart(2, '0')) fail(w, 'calendar date ' + ev.d + ' disagrees with “' + ev.y + '”');
      }
      if (ev.d < lastD) fail(w, 'out of order on the siege calendar (' + ev.d + ' after ' + lastD + ')');
      lastD = ev.d;
    }
    if (typeof ev.sort === 'number') {
      if (ev.sort < lastSort) fail(w, 'out of order in its strand (sort ' + ev.sort + ' after ' + lastSort + ')');
      lastSort = ev.sort;
    }
    // places it links to are places you were
    if (ev.places) {
      let re;
      try { re = new RegExp(ev.places); } catch (e) { fail(w, 'places is not a valid pattern'); }
      if (re && !placeNames.some(n => re.test(n))) fail(w, 'places /' + ev.places + '/ matches none of the trip’s places');
    }
    // tradition is said to be tradition
    if (ev.tag === 'tradition' && !/tradition|legend|said|says|story|chronicle|according to|believed|records|tells/i.test(ev.text)) fail(w, 'tagged tradition but the text states it as fact');
    if (ev.tag === 'debated' && !/debat|disput|uncertain|some (say|historians)|others|perhaps|may have|unclear|thought|argued|forger|estimates?|between|about|some \d/i.test(ev.text)) warn(w, 'tagged debated but the text does not say what is in doubt');
  });
});
checkSources('chronicle/records', chron.records.src);

// ---------- 5. family: only as the family gives it ----------
const FAMILY = /\b(your|our|my) (family|grand(father|mother|parents)|uncle|aunt|cousin|great-)|\bZeljko\b|\bŽeljko\b|\bCroft\b/i;
texts.forEach(({ where, text }) => { if (FAMILY.test(stripUrls(text))) fail(where, 'family history must come from the family, cited by register or archive (see ZELJKO-TEST.md §6)'); });

// ---------- 6. the siege, as Dubrovnik remembers it ----------
const siege = chron.strands.find(s => s.id === 'siege');
const siegeAll = siege ? siege.events.map(e => e.title + ' ' + e.text).join(' ') : '';
if (!siege) fail('chronicle', 'the siege strand is missing');
else {
  // the dates every Dubrovnik family knows; each must be on the calendar exactly so
  const CANON = [
    ['1991-09-17', /blockade/i], ['1991-10-01', /attack/i], ['1991-10-15', /Cavtat/], ['1991-12-06', /darkest|6 December/i],
    ['1992-05-26', /broken|break/i]];
  CANON.forEach(([d, re]) => { if (!siege.events.some(e => e.d === d && re.test(e.title + ' ' + e.text))) fail('chronicle/siege', 'the canonical date ' + d + ' (' + re + ') is missing or moved'); });
  if (!/Homeland War/.test(siegeAll)) fail('chronicle/siege', 'never names the Homeland War');
  if (!/defenders?/i.test(siegeAll)) fail('chronicle/siege', 'never names the defenders');
  // contested numbers come with words that say so
  siege.events.forEach(e => {
    const n = (e.text.match(/\b\d{1,3}(,\d{3})+|\b\d{3,}\b(?! (BC|AD))/g) || []).filter(x => !/^1[0-9]{3}$|^20[0-9]{2}$/.test(x));
    if (n.length && !/about|some|almost|more than|over|at least|nearly|around|up to|between|estimate|counted|official|reported|according/i.test(e.text)) warn('chronicle/siege “' + e.title + '”', 'figures (' + n.join(', ') + ') given with no hedge or attribution');
  });
}

// ---------- 7. landmarks, notes and siege spots ----------
THEN_MARKS.forEach(m => {
  const w = 'landmark “' + m.t + '”';
  checkSources(w, m.src);
  // the year on the label is the year it appears on the map
  const n = String(m.s).match(/(\d{3,4})(s?)/);
  if (n) {
    const y = +n[1];
    if (n[2] ? (m.from < y || m.from > y + 9) : m.from !== y) fail(w, 'appears on the map in ' + m.from + ' but its label says ' + n[0]);
    if (m.x.indexOf(n[1]) < 0) fail(w, 'its label year ' + n[1] + ' is not in its text');
  }
  if (!/\.[”’]?$/.test(m.x)) fail(w, 'text does not end with a full stop');
});
PLACE_HISTORY.forEach(p => {
  const w = 'place note ' + p.re;
  checkSources(w, p.src);
  if (!placeNames.some(n => p.re.test(n))) fail(w, 'matches none of the trip’s places');
  if (!/\.[”’]?$/.test(p.text)) fail(w, 'text does not end with a full stop');
  // where a landmark tells the same story, every year in the note must be one the landmark gives too
  const key = String(p.re.source).replace(/[\\^$()|]/g, ' ').replace(/'s|’s/g, '').split(/\s+/).filter(x => x.length > 3 && !/^(Fort|Church|Large|Dubrovnik|Pleasure|Summer|Residence|Monastery|Benedictine|Cathedral|Cavtat|Luka)$/.test(x))[0];
  const mark = key && THEN_MARKS.find(m => m.t.indexOf(key) >= 0);
  if (mark) {
    const yrs = s => (s.match(/\b1\d{3}s?\b/g) || []);
    const extra = yrs(p.text).filter(y => yrs(mark.x).indexOf(y) < 0 && y !== '1991');
    if (extra.length) fail(w, 'gives ' + extra.join(', ') + ', which the landmark “' + mark.t + '” does not — the two must agree');
  }
});
SIEGE_SPOTS.forEach(s => {
  const w = 'siege spot “' + s.t + '”';
  if (!allIds.has(s.ev)) fail(w, 'its story link “' + s.ev + '” is not a chronicle entry');
  if (!placeNames.some(n => s.re.test(n))) fail(w, 'matches none of the trip’s places');
});
Object.keys(SIEGE_AREAS).forEach(k => {
  const A = SIEGE_AREAS[k];
  if (!A.ev) fail('siege area ' + k, 'no chronicle entry backs it (ev)');
  else if (!allIds.has(A.ev)) fail('siege area ' + k, 'its ev “' + A.ev + '” is not a chronicle entry');
});

// ---------- 8. history-data.json: report only, never hand-edited ----------
const hd = read('history/history-data.json');
KNOWN_ERRORS.forEach(([re, why]) => { const m = hd.match(re); if (m) warn('history-data.json (report only)', '“' + m[0] + '”: ' + why); });
{
  const m = stripUrls(hd).match(new RegExp(asciiRe.source, 'gu'));
  if (m) warn('history-data.json (report only)', 'names without diacritics: ' + [...new Set(m)].slice(0, 12).join(', '));
}

// ---------- report ----------
const count = { chronicle: chron.strands.reduce((n, s) => n + s.events.length, 0), landmarks: THEN_MARKS.length, notes: PLACE_HISTORY.length, spots: SIEGE_SPOTS.length, areas: Object.keys(SIEGE_AREAS).length };
console.log('Zeljko Test — ' + count.chronicle + ' chronicle entries, ' + count.landmarks + ' landmarks, ' + count.notes + ' place notes, ' + count.spots + ' siege spots, ' + count.areas + ' occupied areas');
warns.forEach(w => console.log('  warn  ' + w));
fails.forEach(f => console.log('  FAIL  ' + f));
console.log(fails.length ? '✗ ' + fails.length + ' failure(s), ' + warns.length + ' warning(s)' : '✓ passed' + (warns.length ? ' with ' + warns.length + ' warning(s) for a human to look at' : ''));

// ---------- the sign-off sheet for local experts ----------
if (process.argv.includes('--sheet')) {
  const tierName = u => (EV_TIERS.find(t => t[2].test(u)) || EV_TIERS[3])[1];
  const srcLine = src => (src || []).map(([l, u]) => '[' + l + '](' + u + ') — ' + tierName(u)).join('; ');
  const out = ['# Zeljko Test — review sheet', '',
    'Every history statement on the site, for a local expert to check line by line. Tick ✓ if right, or write the correction',
    'and its source (register, archive, book) beside it. Generated by `node tools/zeljko-test.js --sheet`; do not edit by hand —',
    'corrections go into the site’s sources, then the sheet is generated again.', '',
    '_Generated ' + new Date().toISOString().slice(0, 10) + ' · ' + count.chronicle + ' chronicle entries · ' + count.landmarks + ' landmarks · ' +
      count.notes + ' place notes · ' + count.spots + ' siege spots · ' + count.areas + ' occupied areas_', ''];
  const flagged = new Set(warns.map(w => w.split(': ')[0]));
  chron.strands.slice().sort((a, b) => (a.id === 'siege' ? -1 : b.id === 'siege' ? 1 : 0)).forEach(st => {
    out.push('## ' + st.name, '', '> ' + st.intro, '');
    st.events.forEach(ev => {
      const w = 'chronicle/' + st.id + ' “' + ev.title + '”';
      out.push('- [ ] **' + ev.y + ' — ' + ev.title + '**' + (ev.tag ? ' _(' + ev.tag + ')_' : '') + (flagged.has(w) ? ' ⚠' : ''),
        '  ' + ev.text);
      (ev.days || []).forEach(d => out.push('  - Anniversary ' + d[0] + ' ' + d[1] + ': ' + d[2]));
      out.push('  - Sources: ' + srcLine(ev.src), '');
    });
  });
  out.push('## Finding the family in the records', '');
  chron.records.points.forEach(p => out.push('- [ ] ' + p));
  out.push('  - Sources: ' + srcLine(chron.records.src), '');
  out.push('## The siege on the map', '');
  SIEGE_SPOTS.forEach(s => out.push('- [ ] **' + s.t + '** — ' + s.s));
  Object.keys(SIEGE_AREAS).forEach(k => out.push('- [ ] **' + SIEGE_AREAS[k].t + '** (occupied area) — ' + SIEGE_AREAS[k].s));
  if (SIEGE_FORT) out.push('- [ ] **Fort Imperial** — ' + SIEGE_FORT);
  out.push('', '## Landmarks on the Then map', '');
  THEN_MARKS.forEach(m => out.push('- [ ] **' + m.t + '** (' + m.s + ') — ' + m.x, '  - Sources: ' + srcLine(m.src)));
  out.push('', '## Notes on place pages', '');
  PLACE_HISTORY.forEach(p => out.push('- [ ] **' + p.short + '** — ' + p.text, '  - Sources: ' + srcLine(p.src)));
  out.push('', '## Glossary', '');
  GLOSSARY.forEach(g => out.push('- [ ] **' + g[0] + '** — ' + g[1]));
  if (warns.length) { out.push('', '## Flagged by the checker (⚠)', ''); warns.forEach(w => out.push('- ' + w)); }
  out.push('', '---', '', 'Reviewed by: ____________________   Date: ____________', '');
  fs.writeFileSync(path.join(ROOT, 'ZELJKO-REVIEW.md'), out.join('\n'));
  console.log('wrote ZELJKO-REVIEW.md');
}
process.exit(fails.length ? 1 : 0);
