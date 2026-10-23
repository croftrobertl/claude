/**
 * v0.25.0: the front end is no longer one script, so the browser suites need
 * one place that knows which files a visitor actually runs.
 *
 *   widget.js            core, always
 *   widget-guest.js      the Front Desk form, the review prompt, the voice
 *                        concierge and the AI answer — the FULL guide only
 *   widget-<name>.js     four per-element chunks core fetches at init, and
 *                        only when the page contains the element they drive
 *
 * A suite that inlines only core gets a guide whose Front Desk button does
 * nothing, which looks exactly like a regression and is not one. Everything
 * here exists so that mistake is impossible to make quietly.
 *
 * The editor bundle is deliberately absent: no visitor loads it.
 */
const fs = require('fs');

/** Core + the guest bundle, in load order, for inlining into a test page. */
function frontEndJs(assetsDir, useSource) {
    const pick = (name) => assetsDir + 'js/' + name + (useSource ? '.js' : '.min.js');
    return fs.readFileSync(pick('widget'), 'utf8') + '\n;\n'
         + fs.readFileSync(pick('widget-guest'), 'utf8');
}

/** Core reads this to know where to fetch a chunk from. */
function chunkBootTag(useSource) {
    return '<script>window.dccggChunks={base:"https://dccgg.test/a/",'
         + 'ver:"test",min:' + (useSource ? 'false' : 'true') + '};</script>';
}

/**
 * Serve the chunks over HTTP, the way the browser really gets them. Inlining
 * them instead would hide the one thing worth testing here: that a chunk is
 * requested only where its element is, and that it has arrived before a guest
 * can reach the feature.
 */
async function routeChunks(page, assetsDir, useSource) {
    await page.route('https://dccgg.test/a/*', (route) => {
        const file = route.request().url().split('/a/')[1].split('?')[0];
        const path = assetsDir + 'js/' + file;
        if (!/^widget-[a-z]+(\.min)?\.js$/.test(file) || !fs.existsSync(path)) {
            return route.fulfill({ status: 404, body: '' });
        }
        return route.fulfill({ status: 200, contentType: 'application/javascript',
            body: fs.readFileSync(path, 'utf8') });
    });
}

module.exports = { frontEndJs, chunkBootTag, routeChunks };
