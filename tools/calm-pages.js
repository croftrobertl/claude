'use strict';
/**
 * DCC Seasons — the two pages Calmer Seasons (4.15.0) is judged on, built
 * on the real-theme fixture (tests/real-theme/, the live home page):
 *
 *   contact(opts)  /contact/: the page's content replaced by an intro, the
 *                  DCC Contact Form's own markup (its widget's render(), the
 *                  fields /contact/ shows) and its own stylesheet and script
 *   cottages(opts) the Cottage Selector as the plugin ships it: its real
 *                  dccs.js and stylesheet, booting the live data-config the
 *                  fixture carries; open the quiz with openQuiz(page)
 *
 * The plugins' files are vendored in tests/calm/ from their own branches
 * (Cottage Selector 0.55.1, origin claude/dora-canal-cottage-selector-qy12qf
 * at 573d338; Contact Form 1.7.1, claude/dcc-contact-form-plugin-qo31yc at
 * 5c549b7): nothing in either plugin changes for Seasons.
 *
 *   const cp = require('./calm-pages');
 *   const ses = await open(cp.contact({ config: cfg }), { ...rt.opts(390), ... });
 */
const fs = require('fs');
const path = require('path');
const rt = require('./real-theme');
const DIR = path.join(__dirname, '..', 'tests', 'calm');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

const FORM = `<div class="dcc-contact-wrap"><form class="dcc-contact-form" method="post" novalidate>
<div class="dcc-fields">
 <div class="dcc-field dcc-field-name dcc-required" data-field="name"><label class="dcc-label" for="dcc-f-name-first">Name <span class="dcc-req" aria-hidden="true">*</span></label>
  <div class="dcc-name"><span class="dcc-subfield"><label class="dcc-sublabel dcc-sr-only" for="dcc-f-name-first">First</label><input type="text" class="dcc-input" id="dcc-f-name-first" placeholder="First"></span>
  <span class="dcc-subfield"><label class="dcc-sublabel dcc-sr-only" for="dcc-f-name-last">Last</label><input type="text" class="dcc-input" id="dcc-f-name-last" placeholder="Last"></span></div><div class="dcc-error"></div></div>
 <div class="dcc-field dcc-field-email dcc-required" data-field="email"><label class="dcc-label" for="dcc-f-email">Email <span class="dcc-req" aria-hidden="true">*</span></label><input type="email" class="dcc-input" id="dcc-f-email" autocomplete="email"><div class="dcc-error"></div></div>
 <div class="dcc-field dcc-field-phone" data-field="phone"><label class="dcc-label" for="dcc-f-phone">Phone</label><input type="tel" class="dcc-input" id="dcc-f-phone" autocomplete="tel"><div class="dcc-error"></div></div>
 <div class="dcc-field dcc-field-select" data-field="topic"><label class="dcc-label" for="dcc-f-topic">What can we help with?</label><select class="dcc-input dcc-select" id="dcc-f-topic"><option value="">— Select —</option><option>A question about a cottage</option><option>Long stays</option><option>Something else</option></select><div class="dcc-error"></div></div>
 <div class="dcc-field dcc-field-textarea dcc-required" data-field="message"><label class="dcc-label" for="dcc-f-message">Message <span class="dcc-req" aria-hidden="true">*</span></label><textarea class="dcc-textarea" id="dcc-f-message" rows="5"></textarea><div class="dcc-error"></div></div>
 <div class="dcc-copy"><label class="dcc-copy-label" for="dcc-f-copy"><input type="checkbox" class="dcc-checkbox" id="dcc-f-copy"> Send me a copy</label></div>
</div>
<div class="dcc-form-error" role="alert" aria-live="assertive"></div>
<div class="dcc-actions"><button type="submit" class="dcc-submit">Send Message</button>
<p class="dcc-recaptcha-note">This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.</p></div>
</form><div class="dcc-form-confirmation" role="status" aria-live="polite" hidden></div></div>`;

const INTRO = `<h2>Get in Touch</h2><p>Questions about a cottage, a long stay or the canal? Send us a note and we will get back to you within a day. For a booking already made, please include your confirmation number.</p><p>Dora Canal Court, 2200 Dora Canal Ave, Tavares, Florida.</p>`;

/* the article's content area: from <div class="entry-content ...> to the
 * closing tag before </article> */
function replaceContent(html, inner) {
  const a = html.indexOf('class="entry-content'), start = html.lastIndexOf('<div', a), open = html.indexOf('>', a) + 1;
  const end = html.lastIndexOf('</div>', html.indexOf('</article>'));
  if (a < 0 || start < 0 || end < open) { throw new Error('the fixture has no entry-content'); }
  return html.slice(0, open) + inner + html.slice(end);
}

function contact(opts = {}) {
  let html = rt.page(opts);
  html = html.replace(/<h1 class="entry-title[^>]*>[^<]*</, m => m.replace(/>[^<]*<$/, '>Contact Us<'));
  html = html.replace('<body class="', '<body class="page-template-default page page-id-22 ').replace(/\bhome\b(?=[^"]*"[^>]*>)/, 'page');
  html = replaceContent(html, `<div style="max-width:720px;margin:0 auto;padding:24px 16px">${INTRO}${FORM}</div>`);
  /* the captured theme CSS gives a textarea no line height (wrapped lines
   * overlap in the fixture, not on the site): a fixture fix only */
  html = html.replace('</head>', `<style>${read('contact-form.css')} .dcc-contact-form textarea.dcc-textarea{line-height:1.45;text-align:left}</style></head>`);
  html = html.replace('</body>', `<script>${read('contact-form.js')}</script></body>`);
  return html;
}

function cottages(opts = {}) {
  let html = rt.page(opts);
  /* the capture is the selector already booted: unmark it so its own script boots it */
  html = html.replace(/(class="dccs-root[^"]*"[^>]*?) data-dccs-ready="1" data-dccs-uid="[^"]*"/, '$1');
  html = html.replace('</head>', `<style>${read('selector.min.css')}</style></head>`);
  html = html.replace('</body>', `<script>${read('dccs.js')}</script></body>`);
  return html;
}

/* the quiz, opened the way a guest opens it: tap the first landing choice */
async function openQuiz(page) {
  await page.waitForSelector('.dccs-root .dccs-landing-choice', { timeout: 15000 });
  await page.evaluate(() => { const r = document.querySelector('.dccs-root'); r.scrollIntoView({ block: 'start' }); });
  await page.click('.dccs-root .dccs-landing-choice');
  await page.waitForSelector('.dccs-root .dccs-wizard', { timeout: 10000 });
}

module.exports = { contact, cottages, openQuiz, FORM };
