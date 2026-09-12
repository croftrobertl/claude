(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const root = document.querySelector('.dccgg-root');
  const cfg = root ? (root.getAttribute('data-config') || '') : '';
  let idx = 0, items = 0;
  try { const p = JSON.parse(cfg); idx = JSON.stringify(p.searchIndex || []).length; } catch (e) {}
  items = document.querySelectorAll('.dccgg-item').length;
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  const rows = [
    ['HTML document, decompressed', kb(nav.decodedBodySize || 0)],
    ['HTML document, ON THE WIRE',  kb(nav.encodedBodySize || 0)],
    ['compression ratio', nav.encodedBodySize ? (nav.decodedBodySize / nav.encodedBodySize).toFixed(1) + 'x' : 'NONE'],
    ['time to first byte', Math.round(nav.responseStart - nav.requestStart) + ' ms'],
    ['guide widget markup', kb(root ? root.outerHTML.length : 0)],
    ['  of which data-config', kb(cfg.length)],
    ['  of which searchIndex', kb(idx)],
    ['guide as % of document', nav.decodedBodySize ? ((root ? root.outerHTML.length : 0) / nav.decodedBodySize * 100).toFixed(1) + '%' : '?'],
    ['items rendered', String(items)],
  ];
  const assets = performance.getEntriesByType('resource')
    .filter(r => /dccgg|widget\.min/.test(r.name))
    .map(r => [r.name.split('/').pop().split('?')[0],
               kb(r.encodedBodySize || 0) + (r.transferSize === 0 ? '  (from cache)' : '  (network)')]);
  console.table(Object.fromEntries(rows.concat(assets)));
  return Object.fromEntries(rows.concat(assets));
})()
