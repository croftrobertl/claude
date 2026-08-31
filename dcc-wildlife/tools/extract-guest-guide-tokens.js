/**
 * DCC Wildlife — Guest Guide token extractor.
 *
 * WHY THIS EXISTS
 * The Wildlife widgets are meant to read as the same app as the Guest Guide
 * at /guest/. The Guest Guide is a separate plugin that the build
 * environment cannot see (not in the repo, and the live site is unreachable
 * from it), so assets/css/app.css ships with Wildlife's own palette in the
 * Guest Guide's token STRUCTURE rather than with invented values pretending
 * to be measured ones.
 *
 * HOW TO USE IT
 *   1. Open https://doracanalcourt.com/guest/ in a desktop browser.
 *   2. Open the developer console (F12, or Cmd-Option-J on a Mac).
 *   3. Paste this whole file in and press Enter.
 *   4. Copy everything it prints and send it back.
 *
 * It only READS the page — it changes nothing, saves nothing, and sends
 * nothing anywhere.
 */
(function () {
	'use strict';

	// The guide's root: whichever element actually carries the tokens.
	var root = document.querySelector('[class*="dccgg"]');
	var probe = root;
	while (probe && probe !== document.documentElement) {
		if (getComputedStyle(probe).getPropertyValue('--dccgg-accent').trim()) {
			root = probe;
			break;
		}
		probe = probe.parentElement;
	}
	if (!root) { root = document.documentElement; }

	var cs = getComputedStyle(root);

	// Every --dccgg-* custom property the page's own stylesheets declare.
	var names = {};
	Array.prototype.forEach.call(document.styleSheets, function (sheet) {
		var rules;
		try { rules = sheet.cssRules; } catch (e) { return; } // cross-origin
		if (!rules) { return; }
		Array.prototype.forEach.call(rules, function walk(rule) {
			if (rule.style) {
				Array.prototype.forEach.call(rule.style, function (prop) {
					if (prop.indexOf('--dccgg') === 0) { names[prop] = true; }
				});
			}
			if (rule.cssRules) { Array.prototype.forEach.call(rule.cssRules, walk); }
		});
	});

	var out = [];
	out.push('===== DCC GUEST GUIDE TOKENS =====');
	out.push('page: ' + location.pathname);
	out.push('root element: <' + root.tagName.toLowerCase() + ' class="' + root.className + '">');
	out.push('OS dark mode active: ' + (window.matchMedia &&
		window.matchMedia('(prefers-color-scheme: dark)').matches));
	out.push('');

	out.push('--- classes on the guide root (theme preset / density / glass / dark) ---');
	out.push(String(root.className || '(none)'));
	out.push('');

	out.push('--- computed token values ---');
	Object.keys(names).sort().forEach(function (n) {
		out.push(n + ': ' + cs.getPropertyValue(n).trim());
	});
	if (!Object.keys(names).length) {
		out.push('(none found — the stylesheet may be cross-origin; send');
		out.push(' wp-content/plugins/dcc-guest-guide/assets/css/widget.css instead)');
	}
	out.push('');

	// The resolved look of the key surfaces, as a cross-check: these are what
	// the eye actually compares between the two pages.
	out.push('--- resolved surfaces ---');
	[
		['tile', '[class*="dccgg-tile"]'],
		['detail', '[class*="dccgg-detail"]'],
		['button', '[class*="dccgg"] button']
	].forEach(function (pair) {
		var node = document.querySelector(pair[1]);
		if (!node) { out.push(pair[0] + ': (not on this page)'); return; }
		var s = getComputedStyle(node);
		out.push(pair[0] + ': bg=' + s.backgroundColor + ' color=' + s.color +
			' radius=' + s.borderRadius + ' border=' + s.borderColor +
			' shadow=' + s.boxShadow + ' pad=' + s.padding +
			' font=' + s.fontSize + '/' + s.lineHeight);
	});
	out.push('');
	out.push('body: bg=' + getComputedStyle(document.body).backgroundColor +
		' font=' + getComputedStyle(document.body).fontFamily);
	out.push('===== END =====');

	var text = out.join('\n');
	console.log(text);
	try {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text);
			console.log('(copied to your clipboard)');
		}
	} catch (e) { /* console text is enough */ }
	return text;
})();
