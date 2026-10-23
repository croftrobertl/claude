'use strict';
/**
 * DCC Seasons — 4.13.0, the RED MAPLE redraw and the sweetgum question.
 *
 * Rob asked for the maple to be redrawn and for the sweetgum already in the
 * engine (leafs) to be shown as a candidate fourth leaf. Stills only.
 *
 * The species point, which is the whole reason the existing drawing is
 * wrong: the maple in the engine is a five-lobed sugar maple, the Canadian
 * flag leaf. A FLORIDA red maple (Acer rubrum) has three shallow lobes, a
 * coarsely toothed margin and a red stalk — a different silhouette, and the
 * one that actually grows on the canal.
 *
 *   node tools/maple-sheet.js
 *
 * Writes build/Seasons - 4.13.0 maple and sweetgum.png
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js');
const OUT = path.join(ROOT, 'build');

function readEngine() {
  const src = fs.readFileSync(ENGINE, 'utf8');
  const PAL = JSON.parse(src.match(/var PAL = (\{[\s\S]*?\});/)[1]);
  const block = src.match(/var SVGS = \{[\s\S]*?\n\t\};/)[0];
  const SVGS = new Function(`${block}\nreturn SVGS;`)();
  return { PAL, SVGS };
}

/* Three maples. A is what is in the engine today, for comparison only. */
const MAPLE = {
  /* B — Acer rubrum: THREE shallow lobes with V notches between them, a
   * finely toothed margin and a red stalk. The first pass serrated every
   * edge and the leaf read as a star; a red maple's teeth are small and the
   * lobes are what you see. */
  B: '24 30|<path d="M12 2.4 Q13.4 5 14.2 7.4 Q15 6.6 15.6 7.4 Q16 6.4 16.8 7.2 L18.6 5.6 Q18.4 7.4 19.6 7.8 L17.6 9.8 Q19.4 10 20.4 11 L16.6 12.6 Q17.4 13.6 17 14.6 L13.8 13.8 Q13.4 16.4 13 18.6 L12.6 18.2 L11.4 18.2 L11 18.6 Q10.6 16.4 10.2 13.8 L7 14.6 Q6.6 13.6 7.4 12.6 L3.6 11 Q4.6 10 6.4 9.8 L4.4 7.8 Q5.6 7.4 5.4 5.6 L7.2 7.2 Q8 6.4 8.4 7.4 Q9 6.6 9.8 7.4 Q10.6 5 12 2.4 Z" fill="#C62828"/><path d="M12 29 L12 18.2" stroke="#A3312B" stroke-width="1.5" fill="none"/><path d="M12 18 L12 4.5 M12 10.5 L16.6 8.6 M12 10.5 L7.4 8.6 M12 14 L15.4 12.8 M12 14 L8.6 12.8" stroke="#8E1F1F" stroke-width="0.85" fill="none"/>',
  /* C — the same leaf, caught mid-turn: scarlet at the rim, still amber
   * along the veins. The amber follows the blade's own shape rather than
   * sitting on it as a diamond, which is how a leaf actually turns. */
  C: '24 30|<path d="M12 2.4 Q13.4 5 14.2 7.4 Q15 6.6 15.6 7.4 Q16 6.4 16.8 7.2 L18.6 5.6 Q18.4 7.4 19.6 7.8 L17.6 9.8 Q19.4 10 20.4 11 L16.6 12.6 Q17.4 13.6 17 14.6 L13.8 13.8 Q13.4 16.4 13 18.6 L12.6 18.2 L11.4 18.2 L11 18.6 Q10.6 16.4 10.2 13.8 L7 14.6 Q6.6 13.6 7.4 12.6 L3.6 11 Q4.6 10 6.4 9.8 L4.4 7.8 Q5.6 7.4 5.4 5.6 L7.2 7.2 Q8 6.4 8.4 7.4 Q9 6.6 9.8 7.4 Q10.6 5 12 2.4 Z" fill="#B5342A"/><path d="M12 4 Q13.4 7.4 13.4 10.6 Q14.8 10 16 9.6 Q14.4 11.6 13.2 13.4 Q12.8 15.6 12.4 17.6 L11.6 17.6 Q11.2 15.6 10.8 13.4 Q9.6 11.6 8 9.6 Q9.2 10 10.6 10.6 Q10.6 7.4 12 4 Z" fill="#E8A33D"/><path d="M12 29 L12 18.2" stroke="#A3312B" stroke-width="1.5" fill="none"/><path d="M12 18 L12 4.5 M12 10.5 L16.6 8.6 M12 10.5 L7.4 8.6" stroke="#8E1F1F" stroke-width="0.85" fill="none"/>',
  /* D — a fallen leaf, curled: one lobe lifts and the leaf cups. */
  D: '26 26|<path d="M13 4 Q17 5.4 18.6 8.4 Q21.6 9 21.6 11.4 Q21.6 14.6 18 16.6 Q14.4 18.6 10.6 18 Q6.4 17.4 4.6 14.4 Q3.2 12 5 10 Q6.6 8.2 9 8.6 Q9.6 5.6 13 4 Z" fill="#C62828"/><path d="M13 4 Q10 8 10.6 12.4 Q11.2 16 13.4 18" stroke="#8E1F1F" stroke-width="1" fill="none"/><path d="M10.6 12.4 L5.6 11.2 M11.6 15.4 L7.2 15.6 M11.4 8.6 L16.6 8" stroke="#8E1F1F" stroke-width="0.8" fill="none"/><path d="M18.6 8.4 Q20.6 6.4 19.6 4.4" stroke="#A33" stroke-width="1.4" fill="none"/><path d="M4.6 14.4 Q3 16.6 4.4 18.4" fill="none" stroke="#9E2B22" stroke-width="0.9"/>',
};

function svgData(raw, PAL) {
  if (typeof raw === 'function') { raw = raw(); }
  const cut = raw.indexOf('|');
  const [w, h] = raw.slice(0, cut).split(' ').map(Number);
  const body = raw.slice(cut + 1).replace(/%([a-x])/g, (m, k) => PAL[k] || '#f0f');
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
  return { w, h, url: 'data:image/svg+xml;utf8,' + encodeURIComponent(doc) };
}

(async () => {
  const { PAL, SVGS } = readEngine();
  const rows = [
    {
      title: 'The red maple — Rob asked for a redraw',
      note: 'A is the leaf in the engine today, shown only for comparison: it is a five-lobed sugar maple, the Canadian flag leaf, which does not grow here. B is Acer rubrum, the Florida red maple — three shallow lobes, a toothed margin and a red stalk. C is the same leaf caught mid-turn, scarlet at the edge and still amber at the middle. D is a fallen leaf that has curled, which is what most of them look like on the ground in November.',
      opts: [
        ['A — in the engine today (sugar maple)', SVGS.leafm],
        ['B — Florida red maple', MAPLE.B],
        ['C — red maple, mid-turn', MAPLE.C],
        ['D — red maple, curled', MAPLE.D],
      ],
    },
    {
      title: 'The sweetgum — a fourth leaf, yes or no',
      note: 'Sweetgum is one of the few Central Florida trees with real fall colour, so it earns its place on the ground of truth. But the drawing already in the engine does not read as one: a sweetgum leaf is a five-pointed star, and A renders as a stacked chevron closer to a little pine tree. So the honest version of "it costs no new bytes" is that A costs none and does not look like the tree, while B looks like the tree and costs about the same as any other leaf. If Rob wants the sweetgum, I would ship B.',
      opts: [
        ['A — the drawing in the engine (leafs)', SVGS.leafs],
        ['B — a real sweetgum: a five-pointed star', '26 30|<path d="M13 1.5 L15.4 8.2 L21.4 5.6 L18.2 11.8 L24.6 13.4 L18.4 16.2 L21.8 22 L15.2 19.6 L13 26.2 L10.8 19.6 L4.2 22 L7.6 16.2 L1.4 13.4 L7.8 11.8 L4.6 5.6 L10.6 8.2 Z" fill="#B5342A"/><path d="M13 29 L13 24" stroke="#8B4513" stroke-width="1.5" fill="none"/><path d="M13 24 L13 4 M13 12 L18.6 8.4 M13 12 L7.4 8.4 M13 17.4 L18 19.4 M13 17.4 L8 19.4" stroke="#8C2B37" stroke-width="0.9" fill="none"/>'],
      ],
    },
    {
      title: 'The set as it would fall, with the sweetgum in',
      note: '',
      opts: [
        ['Live oak (picked)', '18 28|<path d="M9 2 Q14 7 14 15 Q14 22 9 25 Q4 22 4 15 Q4 7 9 2 Z" fill="#A0622D"/><path d="M9 27 L9 3" stroke="#6F4E37" stroke-width="1.3" fill="none"/><path d="M9 8 Q12 9 12.6 11 M9 8 Q6 9 5.4 11 M9 13 Q12.6 14 13.4 16 M9 13 Q5.4 14 4.6 16 M9 18 Q12 19 12.4 20.6 M9 18 Q6 19 5.6 20.6" stroke="#6F4E37" stroke-width="0.8" fill="none"/><path d="M9 2 Q14 7 14 15 Q14 22 9 25 Q4 22 4 15 Q4 7 9 2 Z" fill="none" stroke="#8A5024" stroke-width="0.7"/>'],
        ['Bald cypress (picked)', '20 30|<path d="M10 29 L10 2" stroke="#8B4513" stroke-width="1.5" fill="none"/><g stroke="#C97B3D" stroke-width="2.1" stroke-linecap="round"><path d="M10 5 L6 2.6M10 5 L14 2.6M10 8.5 L4.6 5.6M10 8.5 L15.4 5.6M10 12 L3.6 9M10 12 L16.4 9M10 15.5 L3.4 13M10 15.5 L16.6 13M10 19 L4 17M10 19 L16 17M10 22.5 L5 21M10 22.5 L15 21"/></g>'],
        ['Red maple B', MAPLE.B],
        ['Sweetgum B', '26 30|<path d="M13 1.5 L15.4 8.2 L21.4 5.6 L18.2 11.8 L24.6 13.4 L18.4 16.2 L21.8 22 L15.2 19.6 L13 26.2 L10.8 19.6 L4.2 22 L7.6 16.2 L1.4 13.4 L7.8 11.8 L4.6 5.6 L10.6 8.2 Z" fill="#B5342A"/><path d="M13 29 L13 24" stroke="#8B4513" stroke-width="1.5" fill="none"/><path d="M13 24 L13 4 M13 12 L18.6 8.4 M13 12 L7.4 8.4 M13 17.4 L18 19.4 M13 17.4 L8 19.4" stroke="#8C2B37" stroke-width="0.9" fill="none"/>'],
      ],
    },
  ];

  const { chromium } = playwright();
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) { browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 3 });

  const html = rows.map(r => {
    const cols = r.opts.map(([name, raw]) => {
      const s = svgData(raw, PAL);
      const onPage = 26 / Math.max(s.w, s.h);
      return `<div class="opt">
        <div class="big"><img src="${s.url}" style="width:${s.w * (150 / Math.max(s.w, s.h))}px"></div>
        <div class="row">
          <span class="onpage light"><img src="${s.url}" style="width:${s.w * onPage}px"></span>
          <span class="onpage dark"><img src="${s.url}" style="width:${s.w * onPage}px"></span>
        </div>
        <p>${name}</p>
      </div>`;
    }).join('');
    return `<section><h2>${r.title}</h2>${r.note ? `<p class="note">${r.note}</p>` : ''}<div class="opts">${cols}</div></section>`;
  }).join('');

  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
    /* Rob's rule: titles and headings centered, only multi-sentence paragraphs left. */
    h1{font-size:19px;margin:0 0 2px;text-align:center}
    .sub{color:#6b6b6b;margin:0 auto 16px;max-width:900px}
    section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
    h2{font-size:15px;margin:0 0 4px;text-align:center}
    .note{margin:0 auto 10px;color:#6b6b6b;max-width:880px}
    .opts{display:flex;gap:30px;flex-wrap:wrap;justify-content:center}
    .opt{text-align:center} .opt p{margin:6px 0 0;font-weight:600;max-width:210px}
    .big{height:160px;display:flex;align-items:flex-end;justify-content:center}
    .row{display:flex;gap:8px;justify-content:center;margin-top:8px}
    .onpage{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:5px}
    .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}
    </style>
    <h1>Seasons 4.13.0 — The Red Maple, and a Fourth Leaf</h1>
    <p class="sub">Each leaf large enough to judge, then at the size a guest sees it on cream and on the navy footer. Nothing here is in the plugin yet. Rob picks one maple, and yes or no on the sweetgum.</p>
    ${html}`);
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 1180, height: await page.evaluate(() => document.body.scrollHeight) });
  await page.screenshot({ path: path.join(OUT, 'Seasons - 4.13.0 maple and sweetgum.png') });
  await browser.close();
  console.log('maple sheet: ok');
})().catch(e => { console.error(e); process.exit(1); });
