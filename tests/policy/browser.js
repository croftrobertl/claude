/**
 * v0.30.0 — the checkout's acceptance box, in real Chromium at 390 and 1280.
 *
 *     npm install && node browser.js
 *
 * The box's markup is what tests/policy/run.php prints through the SHIPPED
 * PHP (Policy_Record's label window around a stand-in of MotoPress's render —
 * see run.php for which parts of that are verified). It is placed in a
 * checkout form styled by the SHIPPED checkout.css.
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const CSS  = fs.readFileSync(path.join(ROOT, 'dcc-custom-checkout/assets/checkout.css'), 'utf8');
const box  = which => execFileSync('php', [path.join(__dirname, 'run.php'), 'fixture', which], { encoding: 'utf8' });

let failures = 0, passes = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passes++; } else { failures++; }
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
    if (!ok) {
        console.log('      expected: ' + JSON.stringify(expected));
        console.log('      actual:   ' + JSON.stringify(actual));
    }
}

const page = fragment => `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;font:16px/1.5 Raleway,sans-serif}${CSS}</style></head><body>
<form class="mphb_sc_checkout-form" id="f" action="/submit" method="post">
  <section class="mphb-checkout-section">${fragment}</section>
  <p class="mphb_sc_checkout-submit-wrapper"><input type="submit" class="button" value="Book Now"></p>
</form>
<script>window.submits = 0; document.getElementById('f').addEventListener('submit', e => { e.preventDefault(); window.submits++; });</script>
</body></html>`;

(async () => {
    const browser = await chromium.launch(
        fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}
    );
    for (const width of [390, 1280]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        // Nothing leaves the machine: every link target answers locally.
        await ctx.route('**/*', r => r.request().url().startsWith('https://doracanalcourt.com/')
            ? r.fulfill({ status: 200, contentType: 'text/html', body: '<title>policy</title>' }) : r.continue());
        const pg = await ctx.newPage();
        await pg.setContent(page(box('published')));

        const label = await pg.$eval('.mphb-terms-and-conditions-accept label', l => l.innerText.replace(/\s+/g, ' ').trim());
        check(`${width}px: the label reads as one sentence with both policies`,
            label, "I've read and accept the Terms & Conditions and the Cancellation & Refund Policy. *");
        const links = await pg.$$eval('.mphb-terms-and-conditions-accept label a', as => as.map(a => [a.textContent, a.getAttribute('href'), a.target, a.rel, !!a.getClientRects().length]));
        check(`${width}px: two visible links, each target=_blank rel=noopener`, links, [
            ['Terms & Conditions', 'https://doracanalcourt.com/terms-conditions/', '_blank', 'noopener', true],
            ['Cancellation & Refund Policy', 'https://doracanalcourt.com/cancellation-refund-policy/', '_blank', 'noopener', true],
        ]);
        const [tab] = await Promise.all([ctx.waitForEvent('page'), pg.click('text=Cancellation & Refund Policy')]);
        await tab.waitForLoadState();
        check(`${width}px: clicking the refund link opens it in a NEW tab, the checkout stays put`,
            [tab.url(), pg.url()], ['https://doracanalcourt.com/cancellation-refund-policy/', 'about:blank']);
        await tab.close();

        check(`${width}px: the box is still required — the form will not submit unticked`,
            await pg.evaluate(() => [document.getElementById('mphb_accept_terms').required, document.getElementById('f').checkValidity()]),
            [true, false]);
        await pg.click('input[type=submit]');
        check(`${width}px: pressing Book Now unticked does not submit`, await pg.evaluate(() => window.submits), 0);
        await pg.check('#mphb_accept_terms');
        await pg.click('input[type=submit]');
        check(`${width}px: ticked, it submits`, await pg.evaluate(() => window.submits), 1);
        const geo = await pg.evaluate(() => ({
            right: Math.max(...Array.from(document.querySelectorAll('.mphb-terms-and-conditions-accept label, .mphb-terms-and-conditions-accept label a'))
                .map(e => e.getBoundingClientRect().right)),
            page: document.documentElement.scrollWidth - window.innerWidth,
        }));
        check(`${width}px: nothing runs past the screen edge`, [geo.right <= width + 0.5, geo.page <= 0], [true, true]);

        await pg.setContent(page(box('unpublished')));
        check(`${width}px, refund page unpublished: MotoPress's original label and its one link`,
            await pg.$eval('.mphb-terms-and-conditions-accept label', l => [l.innerText.replace(/\s+/g, ' ').trim(), l.querySelectorAll('a').length]),
            ["I've read and accept the terms & conditions *", 1]);
        await ctx.close();
    }
    await browser.close();
    console.log(failures ? `\n${failures} failing, ${passes} passing` : `\nall passing (${passes})`);
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
