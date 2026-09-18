'use strict';
/**
 * renderTemplate() and renderEstimateLine() — the booking sheet's price line.
 *
 * THIS IS THE ONE PLACE THE CLIENT USES innerHTML, and the rule that makes it
 * safe is narrow: only a value explicitly marked {html:…} is injected, into a
 * span of its own, with NO user input concatenated. Everything else in the
 * template — including the night count — goes in as a TEXT NODE. A template
 * placeholder that took the innerHTML path for an ordinary value would turn
 * the one controlled injection into a general one.
 */
const E = require('./extract.js');
const { document, El } = require('./minidom.js');
const { check, done } = E.reporter();

const R = E.build(['renderTemplate', 'renderEstimateLine'], { document });
const el = () => document.createElement('div');
const S = {
  priceLabel: 'Estimated total:',
  priceOneNight: '{price} for 1 night',
  priceForNights: '{price} for {nights} nights',
  priceAvg: '({avg}/night avg)',
};
const PRICE = '<span class="mphb-price">&#036;910</span>';
const AVG = '<span class="mphb-price">&#036;130</span>';

console.log('-- renderTemplate: text is text, html is html --');
{
  const p = el();
  R.renderTemplate(p, 'a {n} b', { n: 7 });
  check('a plain value becomes a TEXT node, not markup', p.textContent === 'a 7 b' && !p.innerHTML.includes('<span'), p.innerHTML);
  const q = el();
  R.renderTemplate(q, '{price} each', { price: { html: PRICE } });
  check('an {html:…} value is injected as markup, in its own span',
    q.innerHTML.includes('mphbac-estimate-amount') && q.innerHTML.includes('mphb-price'), q.innerHTML);
  const r = el();
  R.renderTemplate(r, 'x {evil} y', { evil: '<script>alert(1)</script>' });
  check('A PLAIN STRING IS NEVER INJECTED AS HTML, even one that looks like markup',
    !r.innerHTML.includes('<script') && r.textContent.includes('<script>alert(1)</script>'), r.innerHTML);
}
{
  const p = el();
  R.renderTemplate(p, 'a {missing} b', {});
  check('an unknown placeholder renders as nothing, not as the literal token',
    p.textContent === 'a  b', JSON.stringify(p.textContent));
  const q = el();
  R.renderTemplate(q, 'a {n} b', { n: null });
  check('a null value renders as nothing', q.textContent === 'a  b', JSON.stringify(q.textContent));
  const s = el();
  R.renderTemplate(s, 'no placeholders here', {});
  check('a template with no placeholders is passed through', s.textContent === 'no placeholders here');
  const t = el();
  R.renderTemplate(t, '{n}{n}', { n: 2 });
  check('a repeated placeholder is filled every time', t.textContent === '22', t.textContent);
}
{
  const p = el();
  p.appendChild(document.createTextNode('stale'));
  R.renderTemplate(p, 'fresh', {});
  check('the target is cleared first — no stale fragment survives', p.textContent === 'fresh', p.textContent);
}

console.log('\n-- the estimate line --');
{
  const line = el();
  R.renderEstimateLine(line, S, 7, PRICE, AVG);
  check('the label is a <strong> on its own, for the two-row layout',
    line.children[0].tagName === 'STRONG' && line.children[0].className === 'mphbac-estimate-label',
    line.children[0].className);
  check('the label text comes from the strings, not a literal',
    line.children[0].textContent === 'Estimated total:');
  check('the whole line reads correctly',
    line.textContent.replace(/\s+/g, ' ') === 'Estimated total: $910 for 7 nights ($130/night avg)',
    line.textContent);
  check('a space text node survives between label and amount, so the line reads even without the CSS',
    line.children[1].nodeType === 3 && line.children[1].data === ' ');
}
{
  const one = el();
  R.renderEstimateLine(one, S, 1, PRICE, AVG);
  check('ONE night uses the singular template', one.textContent.includes('for 1 night')
    && !one.textContent.includes('1 nights'), one.textContent);
  check('...and shows NO average, because there is nothing to average',
    !one.textContent.includes('avg'), one.textContent);
}
{
  const noAvg = el();
  R.renderEstimateLine(noAvg, S, 7, PRICE, null);
  check('no average from the server means no average rendered',
    !noAvg.textContent.includes('avg') && noAvg.textContent.includes('$910'), noAvg.textContent);
}
{
  const fallback = el();
  R.renderEstimateLine(fallback, {}, 3, PRICE, null);
  check('missing strings fall back to English rather than rendering empty',
    fallback.textContent.includes('Estimated total') && fallback.textContent.includes('3 nights'),
    fallback.textContent);
}
{
  const redraw = el();
  R.renderEstimateLine(redraw, S, 7, PRICE, AVG);
  R.renderEstimateLine(redraw, S, 2, PRICE, null);
  check('re-rendering replaces the line rather than appending to it',
    redraw.textContent.includes('2 nights') && !redraw.textContent.includes('7 nights'), redraw.textContent);
}

done();
