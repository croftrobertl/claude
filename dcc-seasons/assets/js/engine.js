/* DCC Seasons — ambient engine v3. Lazy-loaded by ambient.js after idle;
 * never in the critical path. Everything is drawn in code: inline SVG
 * data-URIs + canvas primitives. No external requests, no libraries.
 *
 * Systems:
 *  - Bespoke illustrated sprite set (one consistent hand: 2–4 flat colors,
 *    bold shapes, legible at ~30px). Emoji remain as tofu-checked fallbacks.
 *  - THE WATERLINE (bottom ~8%): settle+ripples, floaters, cruise wakes,
 *    jumping bass, submerged manatee — the site's signature.
 *  - Depth layers: FAR (60% scale, 50% speed, 60% opacity) behind NEAR.
 *  - Waterline reflections: near actors within ~60px above the water draw a
 *    flipped, squashed, 25% mirror; floaters get a broken shimmer line.
 *    Off on mobile by default; first rung of the degrade ladder.
 *  - Pointer awareness (observation only — canvas stays pointer-events:
 *    none): soft repulsion near the cursor; a click landing on a particle
 *    pops it without consuming the click.
 *  - Vignette director: rare 5–12s choreographed scenes, one at a time,
 *    ≥90s apart, first ≥20s after load; actors borrow pool slots so the
 *    density cap is never exceeded; never overlaps a hero.
 *  - Evening tint (19:00–06:00 local): −10% brightness, +30% glow, one
 *    night variant per theme (fireflies, deck lights, sleigh-past-moon).
 *  - Christmas snow accumulation: a ≤6px snow line builds along the
 *    waterline from settled flakes; per-session only.
 *  - Auto-degrade: rolling ~8ms frame budget sheds reflections → far
 *    parallax → vignettes, silently.
 *  - Directional facing (face:'L'), motion personalities, hero crossers,
 *    and the v2.1 physics all carried forward.
 *
 * Every theme runs at full richness — the former "gentle" special case
 * for Patriot Day / MLK Day was retired in 3.2.0 at the owner's request;
 * the settings sliders are the way to tone things down. */
(function () {
	'use strict';
	var FT = 'px sans-serif';
	var W = window, D = document, MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, mn = MT.min, mx2 = MT.max, atan2 = MT.atan2, sqrt = MT.sqrt, rand = MT.random;

	var DBG = typeof __DCC_DEBUG__ === 'undefined' ? true : __DCC_DEBUG__;
	function sgn() { return rand() < 0.5 ? -1 : 1; }
	function rnd(a, b) { return a + rand() * (b - a); }
	function pick(arr) { return arr[(rand() * arr.length) | 0]; }
	function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
	function lerp(a, b, t) { return a + (b - a) * t; }
	function easeIO(t) { return t < 0.5 ? 2 * t * t : 1 - MT.pow(-2 * t + 2, 2) / 2; }

	/* ---------- SVG sprite registry — one artist, one line weight ---------- */
	function plateSvg(bg, fg, txt, sil) {
		return '40 22|<rect x="1" y="1" width="38" height="20" rx="3" fill="' + bg + '"/><rect x="1" y="1" width="38" height="20" rx="3" fill="none" stroke="' + fg + '" stroke-width="1.6"/><text x="20" y="15.6" font-family="a" font-weight="bold" font-size="10" fill="' + fg + '" text-anchor="middle">' + txt + '</text><path d="' + sil + '" fill="' + fg + '" opacity=".45"/>';
	}
	function jackSvg(body, face) {
		return '30 28|<path d="M13 4q-1-3 2-4l1 4Z" fill="%c"/><ellipse cx="15" cy="16" rx="14" ry="12" fill="' + body + '"/><path d="M15 4v24" stroke="#E8590C" stroke-width="1"/>' + face;
	}
	var SVGS = {
		/* — canal & boats — */
		joint: '20 42|<path d="M8 38 12 38 15 16 5.6 16Z" fill="%d" stroke="#9AA3AD" stroke-width="1.4"/><path d="M8.6 33 11 33" stroke="#9AA3AD" stroke-width="0.9"/><circle cx="10.3" cy="12" r="4.8" fill="#FF6B1A" opacity="0.16"/><circle cx="10.3" cy="12" r="2.9" fill="#FF7A1A" opacity="0.45"/><path d="M5.6 16 15 16 14 12 12 13 10 11 8.7 13 7 12Z" fill="%q" stroke="#9AA3AD" stroke-width="1"/><circle cx="10.3" cy="12.4" r="1.7" fill="#FFC24D"/><path d="M13 8q3 -3 1 -6" fill="none" stroke="%t" stroke-width="1.3" opacity="0.5"/>',
		peacehand: '28 33|<g fill="#F2C79B" stroke="#C98F55" stroke-width="1"><path d="M11 17 8 5a2 2 0 0 1 3.7-1L15 16Z"/><path d="M16 16 21 5a2 2 0 0 1 3.5 1.4L20 17Z"/><path d="M9 15h11q3.4 0 3.4 5v3.2q0 8-7 8h-3.4q-5 0-5-6Z"/><path d="M10 20q-3.6-1.4-4 1.6t3.8 3.4"/></g><g fill="none" stroke="#C98F55" stroke-width="1"><path d="M11 23h11M12 26h11"/></g>',
		snowflake: '24 24|<g stroke="#8FC1E8" stroke-linecap="round" fill="none"><g stroke-width="2"><path d="M12 2v20M3.4 7l17 10M3.4 17 21 7"/></g><g stroke-width="1.4"><path d="m12 7-2.6-2.6M12 7l2.6-2.6M12 17l-2.6 2.6M12 17l2.6 2.6M7 9 3 9m2.8 6L3 15m14-6L21 9m-2.8 6L21 15"/></g></g>',
		sparkle: '24 24|<g fill="%k"><path d="M9 1c1.2 5 2.4 7 7 8-5 1-6 2.2-7 8-1.2-5-2.4-7-7-8 5-1 6-2.2 7-8Z"/><path d="M18 13c.7 3 1.3 3.7 4 4-2.7.6-3.3 1.3-4 4-.7-3-1.3-3.7-4-4 2.7-.6 3.3-1.3 4-4Z"/></g>',
		fleur: '26 34|<g fill="%a"><path d="M13 1C16 6 16 11 15 14 14 16 14 17 13 19 13 17 12 16 11 14 10 11 10 6 13 1Z"/><path d="M12 19C10 13 6 8.6 3.4 11 1.2 14 3 18 6.4 18 3.6 20 3 24 5.4 26 7.6 27 11 25 12 19Z"/><path d="M14 19C16 13 20 8.6 23 11 25 14 23 18 20 18 22 20 23 24 21 26 18 27 15 25 14 19Z"/></g><rect x="5" y="18.6" width="16" height="3.6" rx="1.4" fill="%f"/><path d="M10 22 16 22 13 32Z" fill="%a"/>',
		clover: '26 30|<g fill="%j"><path id="cv" d="M13 13C13 5 3.6 5 6 11 2.4 8.8 15 13 13Z"/><use href="#cv" transform="rotate(90 13 13)"/><use href="#cv" transform="rotate(180 13 13)"/><use href="#cv" transform="rotate(270 13 13)"/></g><path d="M13 14q1.6 8-2 15" fill="none" stroke="%c" stroke-width="1.8"/>',
		orange: '24 27|<circle cx="12" cy="16" r="10" fill="%r"/><path d="M12 6q4-5 9-3.4-2.4 5-8 5Z" fill="%j"/><path d="M12 5V8" stroke="%i" stroke-width="1.8"/><ellipse cx="8" cy="12" rx="2.6" ry="1.8" fill="#FFA94D" opacity=".75" transform="rotate(-40 8 12)"/>',
		banana: '30 24|<path d="M3.4 4q1.4 15 15 17 10 1.2 11-6-2.4 3.4-10 2.4Q7 16 7 3.6Z" fill="%k"/><path d="M5 3.6 3 1l3.6 1.4Zm23 11 2 1.4-2.4 2.4Z" fill="%i"/><path d="M5 5q1.6 12 13 14" fill="none" stroke="#E8C33C" stroke-width="1"/>',
		burger: '30 27|<path d="M2 12a13 9 0 0 1 26 0Z" fill="#E8A83C"/><g fill="%d"><circle cx="10" cy="8" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="21" cy="8" r="1"/></g><path d="M2.6 12h25l-1 3.2H3.6Z" fill="%j"/><rect x="2.4" y="15" width="25" height="5" rx="1.8" fill="#8B5A2B"/><path d="M3 19h24a12 6 0 0 1-24 0Z" fill="#D9963C"/>',
		olive: '30 21|<path d="M2 18q12-2.4 26-14" fill="none" stroke="%c" stroke-width="1.6"/><g fill="%j"><ellipse cx="8" cy="13" rx="4" ry="2.2" transform="rotate(-32 8 13)"/><ellipse cx="15" cy="9" rx="4" ry="2.2" transform="rotate(-32 15 9)"/><ellipse cx="22" cy="6" rx="4" ry="2.2" transform="rotate(-32 22 6)"/><ellipse cx="11" cy="18" rx="3.6" ry="2" transform="rotate(22 11 18)"/><ellipse cx="18" cy="15" rx="3.6" ry="2" transform="rotate(22 18 15)"/></g>',
		tree: '30 34|<circle cx="15" cy="12" r="10" fill="%j"/><circle cx="8" cy="16" r="6" fill="%c"/><circle cx="22" cy="16" r="6" fill="%c"/><rect x="13" y="20" width="4" height="13" rx="1" fill="%i"/>',
		flamingo: '28 40|<ellipse cx="14" cy="25" rx="10" ry="7" fill="%s"/><path d="M8 20q4-4 8-2" fill="none" stroke="%u" stroke-width="2.4" opacity=".55"/><path d="M17 20q3.4-9-2.6-12T6 11" fill="none" stroke="%s" stroke-width="4" stroke-linecap="round"/><circle cx="6" cy="10" r="3.4" fill="%s"/><path d="M3.6 12.2 14l4-.6Z" fill="%b"/><circle cx="5" cy="9" r=".9" fill="%g"/><path d="M12 31v7m4-7v7" stroke="%u" stroke-width="1.6"/><path d="M10 38H14m1 0h4" stroke="%u" stroke-width="1.4"/>',
		bat: '38 20|<path d="M19 5.4C21 2.6 23 1.6 26 2.2 25 4 25 5.6 26 6.8 29 4.2 32 3.8 35 5.4 31 6.8 29 9.4 29 13 26 11 24 12 22 14 21 12 20 10 19 10 18 10 17 12 16 14 14 12 12 11 9 13 8.6 9.4 6.6 6.8 3 5.4 6.2 3.8 9.4 4.2 12 6.8 13 5.6 13 4 12 2.2 15 1.6 17 2.6 19 5.4Z" fill="%b"/><path d="M17 3.8 16 0.8 18 2.4Z" fill="%b"/><path d="M21 3.8 22 0.8 20 2.4Z" fill="%b"/><circle cx="17.4" cy="7.2" r="0.9" fill="%e"/><circle cx="20.6" cy="7.2" r="0.9" fill="%e"/>',
		flutes: '30 34|<g fill="%d" stroke="#8A99A8" stroke-width="1.8"><path d="M4 3 11 5 9 14q-1 3-4 2T3 12Z"/><path d="M26 3 19 5l2 9q1 3 4 2t2-4Z"/></g><g fill="%k"><path d="M5 8l5 2-1 5q-1 2-3 1t-2-3Z"/><path d="M25 8l-5 2 1 5q1 2 3 1t2-3Z"/></g><path d="M7 17 9 29m14-12-2 12" stroke="#8A99A8" stroke-width="1.8"/><path d="M5 30h8m3 0h8" stroke="#8A99A8" stroke-width="2"/><g fill="%d" stroke="#8A99A8" stroke-width="1"><circle cx="13" cy="2" r="1.4"/><circle cx="18" cy="1.4" r="1.1"/></g>',
		umbrella: '32 35|<path d="M2 14a14 12 0 0 1 28 0Z" fill="%e"/><path d="M9 14q0-9 4-12a5 5 0 0 1 2.6-.2v12Zm7 0V2a5 5 0 0 1 2.6.2Q23 5 23 14Z" fill="%d"/><path d="M16 14v20" stroke="%p" stroke-width="2.2"/>',
		recycle: '34 34|<g fill="%j"><g id="rc"><rect x="7" y="8" width="14" height="4.4" rx="1.4"/><path d="M20 5 27.5 10.2 20 15.4Z"/></g><use href="#rc" transform="rotate(120 17 17)"/><use href="#rc" transform="rotate(240 17 17)"/></g>',
		hook: '20 30|<path d="M10 1.4v12" stroke="%t" stroke-width="2"/><path d="M10 14q0 9-4 9T2 17" fill="none" stroke="%t" stroke-width="2.2"/><path d="M2 16.2 20l3.8-.4Z" fill="%t"/><circle cx="10" cy="2" r="2.2" fill="%h"/>',
		pontoon: '46 28|<rect x="8" y="4" width="26" height="3" rx="2" fill="%m"/><line x1="11" y1="7" x2="11" y2="14" stroke="%h" stroke-width="2"/><line x1="31" y1="7" x2="31" y2="14" stroke="%h" stroke-width="2"/><path d="M4 14h34l-3 7H8Z" fill="%d"/><path d="M4 14h34l-1 3H5Z" fill="%o"/><rect x="2" y="21" width="38" height="5" rx="3" fill="#868E96"/><path d="M38 16h4v6h-3Z" fill="%b"/><line x1="40" y1="6" x2="40" y2="16" stroke="%h" stroke-width="1"/><path d="M40 6h5l-1 2L45 10h-5Z" fill="%e"/>',
		kayak: '52 22|<path d="M2 16q24-7 48 0-24 7-48 0Z" fill="%r"/><circle cx="26" cy="7" r="3" fill="%b"/><path d="M26 10v5" stroke="%b" stroke-width="2"/><line x1="14" y1="2" x2="38" y2="14" stroke="%p" stroke-width="2"/><ellipse cx="13" cy="2" rx="3" ry="2" fill="%a" transform="rotate(28 13 2)"/><ellipse cx="39" cy="14" rx="3" ry="2" fill="%a" transform="rotate(28 39 14)"/>',
		bobber: '24 30|<line x1="12" y1="0" x2="12" y2="4" stroke="%h" stroke-width="2"/><circle cx="12" cy="16" r="11" fill="%d"/><path d="M1 16a11 11 0 0 1 22 0Z" fill="%e"/><circle cx="12" cy="16" r="11" fill="none" stroke="%b" stroke-width="1"/><circle cx="12" cy="4" r="2" fill="%b"/>',
		tacklebox: '32 26|<rect x="2" y="9" width="28" height="15" rx="2" fill="%c"/><rect x="2" y="9" width="28" height="5" fill="#237032"/><path d="M12 9V6a4 4 0 0 1 8 0v3h-3V6a1 1 0 0 0-2 0v3Z" fill="%h"/><rect x="14" y="11" width="5" height="4" rx="1" fill="%a"/>',
		lure: '22 26|<ellipse cx="11" cy="9" rx="5" ry="8" fill="%e"/><ellipse cx="11" cy="7" rx="5" ry="5" fill="%d"/><path d="M11 17v4m0 0-3 3m3-3 3 3" fill="none" stroke="#868E96" stroke-width="1"/>',
		bass: '48 26|<path d="M6 13q12-10 28-8l10-4-3 8 3 8-10-4q-16 2-28-8Z" fill="#37633F"/><path d="M8 13q11-7 26-6-13 12-26 6Z" fill="#5C8A54"/><path d="M20 3q6-3 10 0l-4 4Z" fill="#37633F"/><path d="M22 22q5 3 9 1l-4-5Z" fill="#37633F"/><circle cx="12" cy="11" r="2" fill="#111"/><path d="M6 13q3 3 7 3" fill="none" stroke="#2F4F35" stroke-width="1"/>',
		lilypad: '36 20|<ellipse cx="18" cy="11" rx="17" ry="8" fill="%c"/><path d="M18 11 34 5q-4 12-16 6Z" fill="#40A85C"/><path d="M18 11 35 11" stroke="#237032" stroke-width="1"/><circle cx="12" cy="8" r="3" fill="%s"/><circle cx="12" cy="8" r="1" fill="#FDE68A"/>',
		frog: '26 20|<ellipse cx="13" cy="13" rx="11" ry="6" fill="%c"/><circle cx="6" cy="6" r="3" fill="%c"/><circle cx="20" cy="6" r="3" fill="%c"/><circle cx="6" cy="6" r="1" fill="%d"/><circle cx="20" cy="6" r="1" fill="%d"/><circle cx="6" cy="6" r=".6" fill="#111"/><circle cx="20" cy="6" r=".6" fill="#111"/><path d="M8 15q5 3 10 0" fill="none" stroke="#1E5B2B" stroke-width="1"/>',
		petal: '18 20|<path d="M9 1C15 6 16 13 9 19 2 13 3 6 9 1Z" fill="%s"/><path d="M9 4c3 4 4 8 0 13" fill="none" stroke="%u" stroke-width="1"/>',
		dragonfly: '36 22|<ellipse cx="12" cy="8" rx="10" ry="3" fill="#96C8F0" opacity=".8" transform="rotate(-20 12 8)"/><ellipse cx="12" cy="14" rx="10" ry="3" fill="#96C8F0" opacity=".8" transform="rotate(20 12 14)"/><rect x="6" y="10" width="26" height="2" rx="1" fill="#1864AB"/><circle cx="5" cy="11" r="3" fill="#1864AB"/>',
		/* — birds & wildlife — */
		heron0: '90 60|<path d="M12 26q4-8 14-6l4 3-6 5q-8 2-12-2Z" fill="%x"/><path d="M28 22 8 12l2 8 14 6Z" fill="#5D6D7E"/><path d="M8 12 2 10l5 4Z" fill="%a"/><path d="M30 25q18-14 44-10-12 10-26 12l16 2q-16 8-30 2Z" fill="%v"/><path d="M34 24Q52 4 78 8 64 20 48 26Z" fill="#5D8AA8"/><path d="M56 30q10 2 22 12-14 0-24-6Z" fill="%v"/><path d="M52 32l16 10 4 6-8-2-14-10Z" fill="#34495E"/>',
		heron1: '90 60|<path d="M12 30q4-8 14-6l4 3-6 5q-8 2-12-2Z" fill="%x"/><path d="M28 26 8 16l2 8 14 6Z" fill="#5D6D7E"/><path d="M8 16 2 14l5 4Z" fill="%a"/><path d="M30 29q18 14 44 10-12-10-26-12l16-2q-16-8-30-2Z" fill="%v"/><path d="M34 30q18 20 44 16-14-12-30-18Z" fill="#5D8AA8"/><path d="M52 30l16 12 4 6-8-2-14-12Z" fill="#34495E"/>',
		heron2: '90 60|<path d="M12 28q4-8 14-6l4 3-6 5q-8 2-12-2Z" fill="%x"/><path d="M28 24 8 14l2 8 14 6Z" fill="#5D6D7E"/><path d="M8 14 2 12l5 4Z" fill="%a"/><path d="M30 27q20-5 46-1-14 4-28 4l16 4q-18 2-34-3Z" fill="%v"/><path d="M34 27q20-8 44-4-14 8-30 8Z" fill="#5D8AA8"/><path d="M52 31l16 11 4 6-8-2-14-11Z" fill="#34495E"/>',
		heronstand: '44 64|<path d="M18 10q8 2 10 12v12q0 10-8 12l-4-2q6-6 4-14-8-6-2-20Z" fill="%v"/><path d="M20 6q-6 0-8 6l6-1q4 1 2 6" fill="none" stroke="#5D6D7E" stroke-width="3"/><path d="M12 8 2 6l8 5Z" fill="%a"/><circle cx="17" cy="9" r="1" fill="#111"/><line x1="20" y1="46" x2="19" y2="60" stroke="%f" stroke-width="2"/><line x1="24" y1="46" x2="26" y2="60" stroke="%f" stroke-width="2"/><path d="M15 60h17" stroke="%f" stroke-width="2"/>',
		manatee: '90 46|<ellipse cx="42" cy="24" rx="34" ry="17" fill="#8D99A6"/><path d="M72 20q14-4 16-12-2 12 2 18-4 6-2 18-8-10-16-12 4-6 0-12Z" fill="#7B8794"/><circle cx="14" cy="18" r="9" fill="#8D99A6"/><circle cx="10" cy="16" r="2" fill="%b"/><ellipse cx="7" cy="21" rx="4" ry="3" fill="#7B8794"/><circle cx="6" cy="20" r=".9" fill="%b"/><circle cx="9" cy="20" r=".9" fill="%b"/><path d="M34 38q6 6 12 0l-4 6h-4Z" fill="#7B8794"/>',
		dove: '46 34|<path d="M8 15q2-7 11-6 8 2 13 7l12 2-9 5 3 7-10-6q-9 3-16-3T8 15Z" fill="%d" stroke="#5A6B7C" stroke-width="2.8"/><path d="M19 15q6-10 14-9-2 7-6 11-4 3-8-2Z" fill="%q" stroke="#5A6B7C" stroke-width="2.4"/><path d="M7 14 2 16l5 2Z" fill="%a"/><circle cx="11" cy="13" r="1.4" fill="%g"/><ellipse cx="6" cy="21" rx="2.2" ry="1.2" fill="%c" transform="rotate(-25 6 21)"/><ellipse cx="10" cy="22" rx="2.2" ry="1.2" fill="%c" transform="rotate(-25 10 22)"/>',
		swan: '44 36|<path d="M9 25C4.6 18 7 9.6 14 7 18 5.8 21 6.8 22 9.2L19 11C18 9.4 16 9.2 14 10 9.4 13 8.2 19 12 25Z" fill="%d" stroke="#6B7A88" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 25 26 25C31 25 35 23 39 19 38 27 30 32 21 32 13 32 7.4 29 8 25Z" fill="%d" stroke="#6B7A88" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 27C19 24 27 24 32 27" fill="none" stroke="%o" stroke-width="1.5"/><circle cx="22.6" cy="8.4" r="3.2" fill="%d" stroke="#6B7A88" stroke-width="1.4"/><path d="M26 9 31 10 26 12Z" fill="%r"/><circle cx="25.2" cy="6.8" r="1.5" fill="%g"/><circle cx="21.8" cy="7.6" r="1" fill="%g"/>',
		ladybug: '22 18|<circle cx="7" cy="8" r="4" fill="%g"/><ellipse cx="13" cy="10" rx="8" ry="7" fill="%e"/><line x1="13" y1="3" x2="13" y2="17" stroke="%g" stroke-width="1"/><circle cx="10" cy="8" r="1" fill="%g"/><circle cx="17" cy="9" r="1" fill="%g"/><circle cx="14" cy="13" r="1" fill="%g"/><circle cx="6" cy="7" r=".8" fill="%d"/>',
		turkey: '40 36|<path d="M20 20 8 4q-3 8 4 14Zm0 0 4-18q6 4 3 14Zm0 0 12-14q4 8-5 15Z" fill="#A05A2C"/><ellipse cx="20" cy="25" rx="10" ry="9" fill="%i"/><circle cx="12" cy="18" r="5" fill="%i"/><circle cx="11" cy="17" r="1" fill="#111"/><path d="M8 18l-4 1 4 2Z" fill="%a"/><path d="M9 20q-2 3 0 5" stroke="%e" stroke-width="2" fill="none"/><line x1="17" y1="33" x2="17" y2="36" stroke="%f" stroke-width="2"/><line x1="23" y1="33" x2="23" y2="36" stroke="%f" stroke-width="2"/>',
		chick: '20 20|<circle cx="10" cy="12" r="7" fill="%k"/><circle cx="7" cy="6" r="4" fill="#FFE066"/><circle cx="6" cy="5" r=".9" fill="#111"/><path d="M3 6 .4 7l2 1Z" fill="%w"/><path d="M14 12q4-1 4 2-3 2-5 0Z" fill="#FAB005"/><line x1="8" y1="19" x2="8" y2="20" stroke="%w" stroke-width="1"/><line x1="12" y1="19" x2="12" y2="20" stroke="%w" stroke-width="1"/>',
		bunny: '32 30|<g fill="%q" stroke="#7A8290" stroke-width="1.8" stroke-linejoin="round"><path d="M9.6 13C7 7.4 8.4 2.6 11 3 13 3.4 14 8.4 12 14Z"/><path d="M14 13C13 6.8 16 3 18 4.4 20 5.8 19 10 17 13Z"/><path d="M23 26C27 26 29 22 28 18 27 14 23 11 18 11 14 11 11 12 9.4 14 7.2 13 5.2 14 4.6 16 4 19 5.4 20 7.6 21 7.4 23 9.6 26 13 26Z"/></g><circle cx="7.6" cy="17.4" r="1.4" fill="%g"/><path d="M5 19Q3.2 20 5 21" fill="none" stroke="#7A8290" stroke-width="1"/><path d="M28 20Q31 19 31 22 30 25 27 24" fill="%q" stroke="#7A8290" stroke-width="1.6"/>',
		bunnycarry: '32 32|<g fill="%q" stroke="#7A8290" stroke-width="1.8" stroke-linejoin="round"><path d="M11 12C8 6.4 9.4 1.6 12 2 14 2.4 15 7.4 13 13Z"/><path d="M15 12C14 5.8 17 2 19 3.4 21 4.8 20 9.2 18 12Z"/><path d="M24 27C28 27 30 24 29 20 28 15 24 12 19 12 15 12 12 13 10 15 8.2 15 6.2 16 5.6 18 5 20 6.4 22 8.6 22 8.4 25 11 27 14 27Z"/></g><circle cx="8.6" cy="18.8" r="1.4" fill="%g"/><ellipse cx="12.6" cy="23.4" rx="5" ry="6.2" fill="#BFDBFE" stroke="%l" stroke-width="1.6"/><path d="M7.8 22 17 22M8 25 17 25" stroke="%l" stroke-width="1.4"/><path d="M7.4 21Q6 23 8.6 26" fill="none" stroke="#7A8290" stroke-width="1.8"/><path d="M18 20Q19 23 17 26" fill="none" stroke="#7A8290" stroke-width="1.8"/>',
		/* — fall leaves: maple, oak, cypress, sweetgum — */
		leafm: '26 28|<path d="M13 2l3 5 5-2-2 5 6 2-5 4 3 5-6-1-1 6h-6l-1-6-6 1 3-5-5-4 6-2-2-5 5 2Z" fill="%r"/><path d="M13 6v16m0-12-5 6m5-6 5 6" stroke="#C44D0B" stroke-width="1" fill="none"/>',
		leafo: '22 30|<path d="M11 1q7 3 7 9 0 4-3 5 3 2 3 6 0 6-7 8-7-2-7-8 0-4 3-6-3-1-3-5 0-6 7-9Z" fill="#A0622D"/><path d="M11 4v22m0-16-4 3m4-3 4 3m-8 8 4 3m4-3-4 3" stroke="#7A4A21" stroke-width="1" fill="none"/>',
		leafc: '16 30|<path d="M8 1v28" stroke="#B4622E" stroke-width="1"/><g fill="#C97B3D"><path id="fr" d="M8 4 2 8l6 1Zm0 0 6 4-6 1Z"/><use href="#fr" y="6"/><use href="#fr" y="12"/></g>',
		leafs: '26 26|<path d="M13 1l4 8 8-3-5 7 6 5-8 1 1 8-6-5-6 5 1-8-8-1 6-5-5-7 8 3Z" fill="#B23A48"/><path d="M13 5v14m-6-8 12 6m0-6-12 6" stroke="#8C2B37" stroke-width="1" fill="none"/>',
		/* — halloween — */
		jack1: function () { return jackSvg('#FF7A00', '<path d="M8 12l5 3H6Zm14 0-5 3h7Z" fill="#111"/><path d="M8 21q7 5 14 0-2 4-7 4t-7-4Z" fill="#111"/>'); },
		jack2: function () { return jackSvg('#FF922B', '<circle cx="10" cy="13" r="3" fill="#111"/><circle cx="20" cy="13" r="3" fill="#111"/><path d="M13 17l2-3 2 3Z" fill="#111"/><path d="M8 21h14l-2 3-2-2-2 2-2-2-2 2Z" fill="#111"/>'); },
		jack3: function () { return jackSvg('#F76707', '<path d="M7 14q2-4 5-1Zm16 0q-2-4-5-1Z" fill="#111"/><path d="M10 20q5 6 10 0l-2 4h-6Z" fill="#111"/>'); },
		ghost: '26 32|<path d="M13 1q10 1 10 12v10l-3-2-3 4-4-3-4 3-3-4-3 3 1-12Q4 2 13 1Z" fill="%d" stroke="#8E97A3" stroke-width="1.8" opacity=".95"/><circle cx="9.6" cy="11" r="1.8" fill="%b"/><circle cx="16.4" cy="11" r="1.8" fill="%b"/><ellipse cx="13" cy="17" rx="2" ry="2.8" fill="%b"/>',
		spider: '24 22|<circle cx="12" cy="14" r="6" fill="%g"/><circle cx="12" cy="6" r="3" fill="%b"/><g stroke="%g" stroke-width="1" fill="none"><path d="M7 11 1 7m6 7H1m6 4-5 4m10-11 6-4m-6 8h6m-6 4 5 4"/></g><circle cx="11" cy="5" r=".8" fill="%e"/><circle cx="13" cy="5" r=".8" fill="%e"/>',
		web: '40 40|<g stroke="#8A94A0" stroke-width="1" fill="none" opacity=".9"><path d="M40 0 0 40M40 0v40M40 0H0M40 0 12 12M40 0 28 28"/><path d="M32 6Q28 16 38 20"/></g>',
		candycorn: '22 30|<path d="M11 1 21 29H1Z" fill="%k"/><path d="M4 19 11 1l7 18Z" fill="#FF922B"/><path d="M8 9 11 1l3 8Z" fill="#FFF9DB"/>',
		witchhat: '32 26|<ellipse cx="16" cy="22" rx="15" ry="4" fill="%g"/><path d="M16 0 24 21H8Z" fill="%b"/><rect x="9" y="16" width="14" height="4" fill="#9C36B5"/><rect x="14" y="17" width="3" height="3" fill="%k"/>',
		/* — thanksgiving / harvest — */
		acorn: '22 28|<path d="M4 12h14c0 8-4 13-7 15-3-2-7-7-7-15Z" fill="#B08552"/><path d="M2 12c0-5 4-8 9-8s9 3 9 8Z" fill="%i"/><line x1="11" y1="4" x2="11" y2="0" stroke="%i" stroke-width="2"/>',
		pie: '32 22|<path d="M3 11h26l-2.4 8q-.6 2-3 2H8q-2.4 0-3-2Z" fill="%o"/><path d="M1 11q3-8 15-8T31 11Z" fill="#E8B04B"/><g stroke="#B5772E" stroke-width="1" fill="none"><path d="M8 6 5 11m6-8L10 11M16 3.2V11m5-8L22 11m1.2-5L27 11"/></g>',
		cornucopia: '44 30|<path d="M42 4Q20 0 8 12q-8 8 2 14 8 5 12-2-8 2-10-4-2-7 8-10 14-5 22-6Z" fill="#A05A2C"/><circle cx="9" cy="22" r="4" fill="%e"/><ellipse cx="4" cy="26" rx="4" ry="3" fill="%w"/><circle cx="14" cy="19" r="3" fill="%c"/>',
		/* — christmas — */
		holly: '34 22|<path d="M15 10C11 2 4 2 1 6c4 1 4 5 8 7Z" fill="%c"/><path d="M19 10c4-8 11-8 14-4-4 1-4 5-8 7Z" fill="%j"/><circle cx="14" cy="14" r="4" fill="%e"/><circle cx="21" cy="14" r="4" fill="%n"/><circle cx="18" cy="18" r="4" fill="%e"/>',
		ornament: '24 30|<rect x="9" y="2" width="5" height="5" rx="1" fill="%f"/><circle cx="12" cy="8" r="2" fill="none" stroke="%f" stroke-width="2"/><circle cx="12" cy="19" r="10" fill="%n"/><path d="M3 16a10 10 0 0 1 19 0" fill="%e"/><path d="M2 19q10-4 20 0" stroke="%a" stroke-width="2" fill="none"/><ellipse cx="9" cy="14" rx="3" ry="4" fill="#FFF5F5" opacity=".55"/>',
		gift: '26 26|<rect x="2" y="9" width="22" height="16" rx="2" fill="%m"/><rect x="1" y="6" width="24" height="5" rx="2" fill="#1C7ED6"/><rect x="11" y="6" width="4" height="19" fill="%a"/><path d="M13 6Q7 6 7 2q4-1 6 4Zm0 0q6 0 6-4-4-1-6 4Z" fill="%a"/>',
		pine: '30 38|<path d="M15 0 26 14H4Z" fill="%c"/><path d="M15 8 28 24H2Z" fill="%j"/><path d="M15 18 30 34H0Z" fill="#37B24D"/><rect x="12" y="34" width="6" height="4" fill="%i"/><path d="M15 0l1 3h-3Z" fill="%k"/>',
		sleigh: '110 40|<path d="M60 8q22-2 34 6 8 5 6 12H62q-8 0-10-8Z" fill="%n"/><path d="M60 8q12-1 22 2l-4 8H58Z" fill="%e"/><path d="M56 30h46q4 0 6-4M58 30l-4 6m40-6 4 6" fill="none" stroke="%f" stroke-width="2"/><path d="M2 18h44" stroke="%p" stroke-width="2"/><path d="M10 16q8-8 16-6 8 2 10 8-4 6-12 6-10 0-14-8Z" fill="%p"/><path d="M14 12q-2-8 4-10-1 6 2 8" fill="none" stroke="%i" stroke-width="2"/><circle cx="8" cy="17" r="2" fill="%e"/>',
		/* — patriotic & winter visitors — */
		flagcloth: '40 26|<line x1="2" y1="0" x2="2" y2="26" stroke="%i" stroke-width="2"/><path d="M4 2q9 3 17-1 8-4 17 1v16q-9-4-17 0-8 4-17-1Z" fill="%d"/><path d="M4 2q9 3 17-1 8-4 17 1v3q-9-4-17 0-8 4-17-1Zm0 8q9 4 17 0 8-4 17 0v4q-9-4-17 0-8 4-17-1Z" fill="#B22234"/><path d="M4 2q7 2 13 0v9q-6 3-13-1Z" fill="#3C3B6E"/><g fill="%d"><circle cx="8" cy="5" r="1"/><circle cx="13" cy="5" r="1"/><circle cx="10" cy="8" r="1"/></g>',
		ribbon: '26 40|<path d="M8 2C4 10 6 20 16 34l6-4C14 20 12 10 15 2Z" fill="#B22234"/><path d="M18 2c4 8 2 18-8 32l-6-4C12 20 14 10 11 2Z" fill="#3C3B6E"/><path d="M11 2h4l-2 8Z" fill="%d"/>',
		plateny: function () { return plateSvg('#FDB515', '#1B335F', 'NY', 'M4 6l4-2 3 3-2 4-4-1Z'); },
		plateoh: function () { return plateSvg('%d', '%n', 'OH', 'M4 6h7l1 5-2 4H5l-2-4Z'); },
		platemi: function () { return plateSvg('#DCE9F5', '%m', 'MI', 'M4 10q2-5 6-4l2 3-1 5H6Z'); },
		suitcase: '30 26|<rect x="2" y="7" width="26" height="18" rx="3" fill="#A05A2C"/><path d="M11 7V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3h-3V4h-2v3Z" fill="%i"/><rect x="2" y="13" width="26" height="2" fill="%i"/><circle cx="9" cy="19" r="3" fill="%a"/>',
		sunshades: '36 36|<circle cx="18" cy="18" r="10" fill="%k"/><g stroke="#FAB005" stroke-width="2"><path d="M18 2v5M18 29v5M2 18h5m22 0h5"/></g><path d="M11 16h6l1 4q-4 3-7-1Zm14 0h-6l-1 4q4 3 7-1Z" fill="%g"/><path d="M17 17h2" stroke="%g" stroke-width="1"/>',
		/* — mardi gras / celebration — */
		beads: '40 26|<path d="M2 2q18 30 36 0" fill="none" stroke="#5F3DC4" stroke-width="1"/><circle cx="5" cy="6" r="3" fill="%l"/><circle cx="12" cy="13" r="3" fill="%j"/><circle cx="20" cy="17" r="4" fill="%a"/><circle cx="28" cy="13" r="3" fill="%l"/><circle cx="35" cy="6" r="3" fill="%j"/><g fill="#FFF" opacity=".7"><circle cx="11" cy="12" r=".9"/><circle cx="19" cy="15" r="1"/><circle cx="27" cy="12" r=".9"/></g>',
		doubloon: '26 26|<circle cx="13" cy="13" r="12" fill="%a"/><circle cx="13" cy="13" r="12" fill="none" stroke="%f" stroke-width="2"/><circle cx="13" cy="13" r="8" fill="none" stroke="%f" stroke-width="1"/><path d="M13 7c-2 3-2 3 0 5 2-2 2-2 0-5Zm0 12c2-3 2-3 0-5-2 2-2 2 0 5Zm-6-6c3 2 3 2 5 0-2-2-2-2-5 0Zm12 0c-3-2-3-2-5 0 2 2 2 2 5 0Z" fill="%f"/>',
		mask: '36 26|<path d="M4 2Q1 -1 2 4q1 4 5 5Zm28 0q3-3 2 2-1 4-5 5Z" fill="%j"/><path d="M2 10q16-8 32 0 0 10-9 10-4 0-7-3-3 3-7 3-9 0-9-10Z" fill="%l"/><ellipse cx="11" cy="13" rx="4" ry="3" fill="#FFF"/><ellipse cx="25" cy="13" rx="4" ry="3" fill="#FFF"/><path d="M2 10q16-6 32 0" stroke="%a" stroke-width="1" fill="none"/>',
		stilts: '30 74|<path d="M15 2 22 8l-3 2 4 3-8 3-8-3 4-3-3-2Z" fill="%l"/><circle cx="15" cy="19" r="4" fill="#F8D8B8"/><path d="M8 24h14l-2 14H10Z" fill="%j"/><path d="M8 24l-5 10 3 2 5-8Zm14 0 5 10-3 2-5-8Z" fill="%l"/><path d="M12 38h3v10H12Zm3 0H18v10h-3Z" fill="%a"/><line x1="13" y1="48" x2="13" y2="72" stroke="%i" stroke-width="2"/><line x1="17" y1="48" x2="17" y2="72" stroke="%i" stroke-width="2"/>',
		bottle: '18 44|<path d="M7 2h4v8q5 4 5 12v18q0 3-3 3H5q-3 0-3-3V22q0-8 5-12Z" fill="#1E5B2B"/><path d="M7 2h4v6H7Z" fill="%f"/><rect x="4" y="24" width="10" height="10" rx="1" fill="%d"/>',
		cork: '12 14|<path d="M2 2h8l1 10q-5 3-10 0Z" fill="#C9A227"/><path d="M2 2h8l.3 3H2Z" fill="%f"/>',
		/* — valentines — */
		balloon: '26 32|<path d="M13 2C6 2 2 7 2 12c0 7 7 12 11 15 4-3 11-8 11-15C24 7 20 2 13 2Z" fill="#FA5252"/><path d="M7 8q1-3 4-4" stroke="#FFC9C9" stroke-width="2" fill="none"/><path d="M12 27h3l-1 3Z" fill="%n"/>',
		letter0: '30 22|<rect x="1" y="1" width="28" height="20" rx="2" fill="#FFF0F3"/><rect x="1" y="1" width="28" height="20" rx="2" fill="none" stroke="%u" stroke-width="1"/><path d="M1 2l14 11L29 2" fill="none" stroke="%u" stroke-width="1"/><path d="M15 10c2-3 5-1 4 2-.6 2-4 3-4 3s-3-2-4-3c-1-3 2-4 4-2Z" fill="#FA5252"/>',
		letter1: '30 30|<path d="M1 10 15 1l14 9v18H1Z" fill="#FFDEEB"/><path d="M1 10l14 9 14-9" fill="none" stroke="%u" stroke-width="1"/><rect x="5" y="12" width="20" height="12" rx="1" fill="#FFF" stroke="%s"/><path d="M15 16c1-2 4-.8 3 1-.5 1-3 3-3 3s-3-2-3-3c-1-2 2-4 3-1Z" fill="#FA5252"/>',
		/* — presidents — */
		tophat: '32 28|<ellipse cx="16" cy="24" rx="15" ry="4" fill="%g"/><rect x="7" y="4" width="18" height="20" rx="2" fill="%b"/><rect x="7" y="16" width="18" height="4" fill="#B22234"/><path d="M14 17 16 15l2 2-.6 2h-2Z" fill="%d"/><ellipse cx="16" cy="5" rx="9" ry="2" fill="%g"/>',
		quill: '26 34|<path d="M22 2Q8 8 6 24l2 1Q12 10 24 4Z" fill="%d" stroke="#7C8894" stroke-width="1.8"/><path d="M22 2Q12 6 8 18q6-2 10-8 4-4 4-8Z" fill="%o"/><path d="M6 24 3 32l5-6Z" fill="%f"/>',
		cherry: '26 30|<path d="M13 2q-6 4-8 14m8-14q6 6 6 14" fill="none" stroke="%c" stroke-width="2"/><path d="M13 2q4-2 7 0-3 2-7 0Z" fill="%j"/><circle cx="5" cy="21" r="5" fill="%n"/><circle cx="19" cy="21" r="5" fill="%e"/><circle cx="3" cy="19" r="1" fill="#FFC9C9"/><circle cx="17" cy="19" r="1" fill="#FFC9C9"/>',
		/* — strawberry — */
		berry: '24 30|<path d="M12 3 12 8" stroke="%c" stroke-width="2"/><path d="M12 27C6 24 2.6 19 3 14 3.4 10 7 8 12 8 17 8 21 10 21 14 21 19 18 24 12 27Z" fill="%e"/><g fill="%j"><path d="M12 8 3.6 6 7 10Z"/><path d="M12 8 20 6 17 10Z"/><path d="M12 8 9 3.4 8.4 8.2Z"/><path d="M12 8 15 3.4 16 8.2Z"/></g><g fill="#FFE9A8"><circle cx="8" cy="13" r="1.1"/><circle cx="16" cy="13" r="1.1"/><circle cx="12" cy="16" r="1.1"/><circle cx="9" cy="19.6" r="1.1"/><circle cx="15" cy="19.6" r="1.1"/><circle cx="12" cy="22.6" r="1.1"/></g>',
		blossom: '24 24|<g fill="%d" stroke="#C97FA0" stroke-width="1.6"><circle cx="12" cy="5" r="4.4"/><circle cx="19" cy="10" r="4.4"/><circle cx="16.4" cy="18" r="4.4"/><circle cx="7.6" cy="18" r="4.4"/><circle cx="5" cy="10" r="4.4"/></g><circle cx="12" cy="12" r="3.4" fill="%k"/>',
		basket: '32 24|<path d="M6 8Q16 -4 26 8" fill="none" stroke="%p" stroke-width="2"/><path d="M2 8h28l-4 15H6Z" fill="#B08552"/><path d="M4 12h24m-23 5h22M9 8l3 15m8-15-3 15" stroke="%p" stroke-width="1" fill="none"/>',
		/* — st pat / april fools — */
		horseshoe: '30 30|<path d="M7.4 28C4.4 22 3 17 3.8 13 5 6.8 9.6 2.8 15 2.8 20 2.8 25 6.8 26 13 27 17 26 22 23 28L17 27C19 21 20 18 20 15 19 11 17 8.6 15 8.6 13 8.6 11 11 10 15 10 18 11 21 13 27Z" fill="#868E96"/><g fill="#39414A"><circle cx="7.6" cy="15.4" r="1.3"/><circle cx="8.4" cy="20" r="1.3"/><circle cx="9.8" cy="24.4" r="1.3"/><circle cx="22.4" cy="15.4" r="1.3"/><circle cx="21.6" cy="20" r="1.3"/><circle cx="20.2" cy="24.4" r="1.3"/></g>',
		rainbow: '96 62|<g fill="none" stroke-width="4"><path d="M5 60a40 40 0 0 1 80 0" stroke="%e"/><path d="M9 60a36 36 0 0 1 72 0" stroke="#FF922B"/><path d="M13 60a32 32 0 0 1 64 0" stroke="%k"/><path d="M17 60a28 28 0 0 1 56 0" stroke="%j"/><path d="M21 60a24 24 0 0 1 48 0" stroke="#5C7CFA"/></g><path d="M68 48h20l-3 10a7 7 0 0 1-7 4h-1a7 7 0 0 1-7-4Z" fill="%g"/><circle cx="73" cy="47" r="3" fill="%a"/><circle cx="79" cy="46" r="3" fill="%k"/><circle cx="85" cy="47" r="3" fill="%a"/><ellipse cx="64" cy="56" rx="7" ry="2" fill="#1E5B2B"/><path d="M60 50h8l-1 6h-6Z" fill="%c"/>',
		jester: '34 28|<path d="M5 22 2 4l10 10L17 2l5 12L32 4l-3 18Z" fill="%l"/><path d="M17 2l5 12 5-6-2 14H12l-2-14 5 6Z" fill="%j" opacity=".85"/><rect x="4" y="21" width="26" height="5" rx="3" fill="%a"/><circle cx="3" cy="4" r="2" fill="%a"/><circle cx="17" cy="3" r="2" fill="%a"/><circle cx="32" cy="4" r="2" fill="%a"/>',
		teeth0: '30 24|<path d="M2 10q13-8 26 0v5q-13 8-26 0Z" fill="%s"/><path d="M4 10q11-6 22 0l-1 3q-10 5-20 0Z" fill="#FFF"/><line x1="15" y1="7" x2="15" y2="14" stroke="%o"/><circle cx="25" cy="18" r="3" fill="%t"/>',
		teeth1: '30 24|<path d="M2 5q13-6 26 0v3q-13 6-26 0Z" fill="%s"/><path d="M2 16q13-6 26 0v3q-13 6-26 0Z" fill="%s"/><path d="M4 6q11-4 22 0v1q-11 4-22 0Z" fill="#FFF"/><path d="M4 17q11-4 22 0v1q-11 4-22 0Z" fill="#FFF"/><circle cx="25" cy="12" r="3" fill="%t"/>',
		disguise: '34 26|<circle cx="9" cy="8" r="7" fill="none" stroke="%b" stroke-width="2"/><circle cx="25" cy="8" r="7" fill="none" stroke="%b" stroke-width="2"/><path d="M16 8h2" stroke="%b" stroke-width="2"/><path d="M0 6h3m28 0h3" stroke="%b" stroke-width="2"/><path d="M17 10q-5 4-4 9 2 4 6 2" fill="#F8C8A8" stroke="#D9A06B"/>',
		peel: '30 16|<path d="M15 2 4 12q4 3 8-1 2 4 6 0 4 4 8 1Z" fill="%k"/><path d="M15 2l-4 5m4-5 1 6m-1-6 5 5" stroke="#E8B04B" stroke-width="1" fill="none"/><path d="M14 1h2l1 2h-4Z" fill="%p"/>',
		/* — 420 / earth — */
		cannabis: '32 34|<g fill="%c" transform="translate(16 30)"><path id="cl" d="M0 0 1.5-5 .8-6 2.6-10 1.8-11 3-15 2-17 2.2-20 1-21 0-26-1-21-2.2-20-2-17-3-15-1.8-11-2.6-10-.8-6-1.5-5Z"/><use href="#cl" transform="rotate(27) scale(.9)"/><use href="#cl" transform="rotate(-27) scale(.9)"/><use href="#cl" transform="rotate(54) scale(.74)"/><use href="#cl" transform="rotate(-54) scale(.74)"/><use href="#cl" transform="rotate(79) scale(.54)"/><use href="#cl" transform="rotate(-79) scale(.54)"/></g><path d="M16 29v5" stroke="%c" stroke-width="2"/>',
		peace: '30 30|<circle cx="15" cy="15" r="13" fill="none" stroke="%l" stroke-width="3"/><circle cx="15" cy="15" r="13" fill="none" stroke="%j" stroke-width="3" stroke-dasharray="14 27"/><path d="M15 2v26M15 15 6 24m9-9 9 9" stroke="%u" stroke-width="3"/>',
		sprout: '22 26|<path d="M11 26V10" stroke="%c" stroke-width="2"/><path d="M11 12Q3 12 1 4q9-1 10 8Z" fill="#37B24D"/><path d="M11 9Q19 9 21 2q-9-1-10 7Z" fill="%j"/>',
		globe: '30 30|<circle cx="15" cy="15" r="13" fill="#339AF0"/><path d="M8 6q6 2 5 8t3 7q-8 1-10-6-1-6 2-9Zm12 1q4 3 4 8 0 6-5 9-2-5 0-9t1-8Z" fill="#37B24D"/>',
		hands: '40 30|<circle cx="20" cy="12" r="9" fill="#339AF0"/><path d="M14 6q5 2 4 6t2 5q-6 1-7-4-1-4 1-7Z" fill="#37B24D"/><path d="M2 22q8-6 16-2m20 2q-8-6-16-2" fill="none" stroke="#D9A06B" stroke-width="2"/><path d="M2 22q6 6 16 4m20-4q-6 6-16 4" fill="none" stroke="#C48A5A" stroke-width="2"/>',
		/* — labor day picnic — */
		grill: '30 32|<path d="M2 8h26q0 9-13 9T2 8Z" fill="%g"/><path d="M2 8h26q0 3-13 3T2 8Z" fill="%b"/><line x1="9" y1="16" x2="6" y2="30" stroke="%h" stroke-width="2"/><line x1="21" y1="16" x2="24" y2="30" stroke="%h" stroke-width="2"/><circle cx="24" cy="30" r="2" fill="%h"/>',
		cooler: '28 24|<rect x="2" y="8" width="24" height="15" rx="2" fill="%m"/><rect x="1" y="5" width="26" height="5" rx="2" fill="#4DABF7"/><path d="M8 5V2m5 3V1m5 4V2" stroke="%p" stroke-width="2"/><rect x="11" y="14" width="6" height="3" rx="1" fill="%d"/>'
	};

	var PAL = {"a":"#F1C40F","b":"#343A40","c":"#2B8A3E","d":"#F1F3F5","e":"#E03131","f":"#B8860B","g":"#212529","h":"#495057","i":"#6F4E37","j":"#2F9E44","k":"#FFD43B","l":"#7C3AED","m":"#1864AB","n":"#C92A2A","o":"#DEE2E6","p":"#8B5A2B","q":"#E9ECEF","r":"#E8590C","s":"#F783AC","t":"#ADB5BD","u":"#E64980","v":"#4A6B8A","w":"#E8890C","x":"#2C3E50"};
	function svgDoc(raw) {
		if (typeof raw === 'function') { raw = raw(); }
		var cut = raw.indexOf('|');
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + raw.slice(0, cut) + '">' +
			raw.slice(cut + 1).replace(/%([a-x])/g, function (m2, k) { return PAL[k]; }) + '</svg>';
	}
	var sprites = {};
	function sprite(name) {
		var s = sprites[name];
		if (s) { return s; }
		s = { ready: false, img: new Image(), ratio: 1 };
		s.img.onload = function () {
			s.ratio = (s.img.naturalHeight || 1) / (s.img.naturalWidth || 1);
			s.ready = true;
		};
		s.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgDoc(SVGS[name] || '0 0|'));
		sprites[name] = s;
		return s;
	}

	/* ---------- Emoji tofu check ---------- */
	var tcx = null;
	function drawable(g) {
		try {
			if (!tcx) {
				var tcv = D.createElement('canvas');
				tcv.width = tcv.height = 24;
				tcx = tcv.getContext('2d', { willReadFrequently: true });
			}
			tcx.clearRect(0, 0, 24, 24);
			tcx.font = 20 + FT;
			tcx.fillText(g, 2, 18);
			var d = tcx.getImageData(0, 0, 24, 24).data;
			for (var j = 3; j < d.length; j += 4) { if (d[j]) { return true; } }
			return false;
		} catch (e) { return true; }
	}

	/* ---------- Canvas primitives (recolorable where emoji/SVG can't) ---------- */
	function drawStar(cx, r, color) {
		cx.fillStyle = color;
		cx.beginPath();
		for (var i = 0; i < 10; i++) {
			var rr = i % 2 ? r * 0.42 : r;
			var a = -MT.PI / 2 + i * MT.PI / 5;
			cx[i ? 'lineTo' : 'moveTo'](cos(a) * rr, sin(a) * rr);
		}
		cx.closePath();
		cx.fill();
		/* crisp inner facet line */
		cx.globalAlpha *= 0.5;
		cx.strokeStyle = '#00000033';
		cx.lineWidth = 1;
		cx.stroke();
		cx.globalAlpha *= 2;
	}
	var PRIMS = {
		star: function (cx, p, s) { drawStar(cx, p.size * 0.45 * s, p.color); },
		confetti: function (cx, p, s, t) {
			/* metallic shimmer: alternate a lighter tint every ~200ms */
			cx.fillStyle = (((t / 200) | 0) + (p.shim || 0)) % 2 ? p.color : '#FFFFFF';
			if (cx.fillStyle === '#FFFFFF') { cx.globalAlpha *= 0.8; }
			cx.fillRect(-p.size * 0.42 * s, -p.size * 0.17 * s, p.size * 0.84 * s, p.size * 0.34 * s);
		},
		bubble: function (cx, p, s) {
			cx.strokeStyle = p.color;
			cx.lineWidth = 1.8;
			cx.beginPath();
			cx.arc(0, 0, p.size * 0.26 * s, 0, TAU);
			cx.stroke();
		},
		egg: function (cx, p, s) {
			var rx = p.size * 0.37 * s, ry = p.size * 0.48 * s;
			cx.save();
			cx.beginPath();
			cx.ellipse(0, 0, rx, ry, 0, 0, TAU);
			cx.fillStyle = p.color;
			cx.fill();
			cx.clip();
			cx.fillStyle = p.color2;
			if (p.deco) {
				for (var i = 0; i < 5; i++) {
					cx.beginPath();
					cx.arc((i % 3 - 1) * rx * 0.7, ((i / 3 | 0) - 0.5) * ry * 0.8, rx * 0.16, 0, TAU);
					cx.fill();
				}
			} else {
				cx.fillRect(-rx, -ry * 0.45, rx * 2, ry * 0.22);
				cx.fillRect(-rx, ry * 0.15, rx * 2, ry * 0.22);
			}
			cx.restore();
		},
		heart: function (cx, p, s) {
			var r = p.size * 0.34 * s;
			cx.fillStyle = p.color;
			cx.beginPath();
			cx.moveTo(0, r);
			cx.bezierCurveTo(-r * 1.6, -r * 0.35, -r * 0.62, -r * 1.4, 0, -r * 0.45);
			cx.bezierCurveTo(r * 0.62, -r * 1.4, r * 1.6, -r * 0.35, 0, r);
			cx.fill();
		},
		tulip: function (cx, p, s) {
			var r = p.size * 0.32 * s;
			cx.fillStyle = p.color;
			cx.beginPath();
			cx.moveTo(-r, -r * 0.4);
			cx.quadraticCurveTo(-r, r, 0, r);
			cx.quadraticCurveTo(r, r, r, -r * 0.4);
			cx.lineTo(r * 0.45, r * 0.1);
			cx.lineTo(0, -r * 0.5);
			cx.lineTo(-r * 0.45, r * 0.1);
			cx.closePath();
			cx.fill();
			cx.strokeStyle = '#2B8A3E';
			cx.lineWidth = 1.6;
			cx.beginPath();
			cx.moveTo(0, r);
			cx.lineTo(0, r * 2.4);
			cx.stroke();
		},
	};

	/* ================= Engine ================= */
	function start(boot) {
		var CFG = boot.cfg || {};
		var theme = boot.theme;
		var themeKey = boot.themeKey || 'classic';
		var A = (theme && theme.ambient) || { particles: [] };
		var mq = boot.mq;
		var reduced = function () { return !!(mq && mq.matches); };
		if (reduced()) { return; }

		var water = !!A.water;
		var up = !!A.up;
		var burstMode = A.mode === 'burst';
		var alphaBase = clamp(CFG.opacity || 0.35, 0.05, 1);
		var maxTotal = clamp(CFG.density || 10, 1, 16); /* hard cap incl. ripples */
		var reserve = water ? 3 : 0;
		var maxParts = mx2(1, mn(maxTotal - reserve, A.max || 99));
		var heroEvery = CFG.heroEvery || [120, 180];
		var DEBUG = DBG && !!CFG.debug;

		/* Visual richness + advanced toggles. Classic = v2 behavior;
		 * Minimal = sprites only. Solemn themes never get the playful set. */
		var V = CFG.visual || {};
		var rich = V.richness || 'full';
		var mobile = W.innerWidth < 768;
		var FX = {
			parallax: rich === 'full',
			reflect: rich === 'full' && V.reflections !== false && !mobile && water,
			vig: rich === 'full' && V.vignettes !== false,
			pointer: rich === 'full' && V.pointer !== false,
			evening: rich === 'full' && V.evening !== false,
			snow: rich === 'full' && V.snow !== false && themeKey === 'christmas',
			heroes: rich !== 'minimal'
		};

		/* Evening: 19:00–06:00 by the visitor's clock (mockable in tests). */
		function localNow() {
			return (DEBUG && CFG.forceNow != null) ? new Date(CFG.forceNow) : new Date();
		}
		var hour = (DEBUG && CFG.forceHour != null) ? CFG.forceHour : localNow().getHours();
		var evening = FX.evening && (hour >= 19 || hour < 6);

		/* Static corner accents (DOM, no motion, no assets). */
		var ACCENTS = {
			halloween: ['web', 'right:0;top:0;width:64px;opacity:.5;'],
			thanksgiving: ['cornucopia', 'left:10px;bottom:10px;width:56px;opacity:.55;'],
			snowbird: ['sunshades', 'left:12px;top:12px;width:44px;opacity:.5;'],
			earth_day: ['hands', 'left:10px;bottom:10px;width:52px;opacity:.55;']
		};
		function accentEl(key, css) {
			if (!SVGS[key]) { return; }
			var el = D.createElement('div');
			el.setAttribute('aria-hidden', 'true');
			el.style.cssText = 'position:fixed;z-index:99990;pointer-events:none;' + css;
			el.innerHTML = svgDoc(SVGS[key]);
			D.body.appendChild(el);
		}
		if (A.accent && A.accent.svg) { accentEl(A.accent.svg, 'left:14px;bottom:14px;width:26px;opacity:.6;'); }
		if (rich === 'full' && ACCENTS[themeKey]) { accentEl(ACCENTS[themeKey][0], ACCENTS[themeKey][1]); }

		var cv = D.createElement('canvas');
		cv.setAttribute('aria-hidden', 'true');
		cv.className = 'dcc-seasons-canvas';
		/* Layering setting: behind interactive widgets (5) or in front of
		 * everything (99990). The egg overlay is never routed through this. */
		cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + (CFG.layer ? 5 : 99990) + ';';
		D.body.appendChild(cv);
		var cx = cv.getContext('2d');

		/* --- Sizing: one source (canvas rect × DPR), window + visualViewport
		 * resize, full re-seed on change. --- */
		var vw = 0, vh = 0, waterY = 0, ground = 0, sizeTimer = 0;
		function applySize() {
			var r = cv.getBoundingClientRect();
			var dpr = mn(W.devicePixelRatio || 1, 2);
			var w = mx2(1, MT.round(r.width));
			var h = mx2(1, MT.round(r.height));
			cv.width = MT.round(w * dpr);
			cv.height = MT.round(h * dpr);
			cx.setTransform(dpr, 0, 0, dpr, 0, 0);
			cx.textAlign = 'center';
			cx.textBaseline = 'middle';
			vw = w; vh = h;
			waterY = vh * 0.92;
			ground = vh - 16;
			for (var k = 0; k < parts.length; k++) { seed(parts[k], true); }
			ripples.length = 0;
			snowCols = FX.snow ? new Float32Array(MT.ceil(vw / 8) + 1) : null;
			if (hero) { hero = null; }
			if (vig) { endVig(); }
		}
		function queueSize() { clearTimeout(sizeTimer); sizeTimer = setTimeout(applySize, 150); }
		W.addEventListener('resize', queueSize);
		if (W.visualViewport) { W.visualViewport.addEventListener('resize', queueSize); }

		/* --- Resolve particle specs (sprite arrays, tofu-checked emoji). --- */
		function resolve(def) {
			var sp = { def: def, b: def.b || 'fall' };
			if (def.s) { sp.kind = 's'; sp.s = def.s; (Array.isArray(def.s) ? def.s : [def.s]).forEach(sprite); }
			else if (def.c) { sp.kind = 'c'; sp.c = def.c; }
			else {
				var g = def.e;
				if (!g || !drawable(g)) {
					var f = def.f || '*';
					if (f.charCodeAt(0) >= 0xD800 && drawable(f)) {
						sp.kind = 'e'; sp.g = f;
						return sp;
					}
					sp.kind = 't'; sp.g = f; sp.color = def.fc || '#888888';
					return sp;
				}
				sp.kind = 'e'; sp.g = g;
			}
			return sp;
		}
		var pool = [];
		(A.particles || []).forEach(function (def) {
			var sp = resolve(def), n = def.w || 1;
			while (n--) { pool.push(sp); }
		});
		/* Evening variant: fishing swaps one leaf slot for fireflies. */
		var firefly = null;
		if (evening && themeKey === 'fall_fishing') {
			firefly = { kind: 'c', c: 'firefly', b: 'firefly', def: { b: 'firefly' } };
			for (var fi = 0; fi < pool.length; fi++) {
				if (pool[fi].kind === 's' && Array.isArray(pool[fi].s)) { pool[fi] = firefly; break; }
			}
		}
		PRIMS.firefly = function (cx2, p, s) {
			var g = 0.5 + 0.5 * sin(p.ph * 2.4);
			cx2.fillStyle = 'rgba(255,236,150,' + (0.25 + 0.4 * g) + ')';
			cx2.beginPath(); cx2.arc(0, 0, 7 * s * (evening ? 1.3 : 1), 0, TAU); cx2.fill();
			cx2.fillStyle = '#FFEC99';
			cx2.beginPath(); cx2.arc(0, 0, 2.2 * s, 0, TAU); cx2.fill();
		};

		/* --- Ripples & pop-rings (both count toward the cap). --- */
		var ripples = [];
		function fxRoom() { return parts.length + ripples.length < maxTotal; }
		function addRipple(x, y, big) {
			if (!fxRoom()) { return; }
			ripples.push({ x: x, y: y, r: big ? 6 : 3, a: 0.8, big: !!big, ring: false });
		}
		function addRing(x, y) {
			if (!fxRoom()) { return; }
			ripples.push({ x: x, y: y, r: 3, a: 0.8, big: false, ring: true });
		}
		function stepRipples(dt) {
			for (var k = ripples.length - 1; k >= 0; k--) {
				var r = ripples[k];
				r.r += dt * (r.big ? 34 : 22);
				r.a -= dt * 0.9;
				if (r.a <= 0) { ripples.splice(k, 1); }
			}
		}
		function drawRipples() {
			cx.lineWidth = 1;
			for (var k = 0; k < ripples.length; k++) {
				var r = ripples[k];
				cx.globalAlpha = alphaBase * r.a;
				cx.strokeStyle = r.ring ? '#FFD43B' : '#9CC3E5';
				cx.beginPath();
				if (r.ring) { cx.arc(r.x, r.y, r.r, 0, TAU); }
				else { cx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, TAU); }
				cx.stroke();
			}
		}

		/* --- Christmas snow accumulation (≤6px, session-only). --- */
		var snowCols = null;
		function snowLand(x) {
			if (!snowCols) { return; }
			var i = clamp((x / 8) | 0, 0, snowCols.length - 1);
			snowCols[i] = mn(6, snowCols[i] + 0.7);
			if (i > 0) { snowCols[i - 1] = mn(6, snowCols[i - 1] + 0.3); }
			if (i < snowCols.length - 1) { snowCols[i + 1] = mn(6, snowCols[i + 1] + 0.3); }
		}
		function drawSnow() {
			if (!snowCols) { return; }
			cx.globalAlpha = mn(1, alphaBase * 2);
			cx.fillStyle = '#F1F5F9';
			cx.beginPath();
			cx.moveTo(0, waterY);
			for (var i = 0; i < snowCols.length; i++) { cx.lineTo(i * 8, waterY - snowCols[i]); }
			cx.lineTo(vw, waterY);
			cx.closePath();
			cx.fill();
		}

		/* --- Particles. --- */
		var parts = [];
		function dirY() { return up ? -1 : 1; }

		function seed(p, anywhere) {
			var sp = pick(pool);
			if (!sp) { return p; }
			var def = sp.def;
			p.sp = sp;
			p.b = sp.b;
			p.size = def.sz ? rnd(def.sz[0], def.sz[1]) : rnd(16, 24);
			p.sc = rnd(0.7, 1.4);
			p.rot = 0;
			p.vr = rnd(-1.2, 1.2);
			p.alpha = 1;
			p.ph = rnd(0, TAU);
			p.phv = rnd(0.8, 2);
			p.st = 0;
			p.t = 0;
			p.settled = 0;
			p.pop = 0;
			p.ox = 0; p.oy = 0;
			p.dormant = false;
			p.sKey = Array.isArray(sp.s) ? pick(sp.s) : sp.s;
			p.shim = (rand() * 2) | 0;
			p.trail = null;
			/* Depth layer: FAR = 60% scale, 50% speed, 60% opacity. Only
			 * free-air behaviors — staged/bottom actors stay NEAR. */
			var canFar = 'fall sway tumble flutter fly pulse rise twinkle spin vee wobble'.indexOf(p.b) >= 0;
			p.far = FX.parallax && canFar && rand() < 0.35;
			var slow = (def.slow ? 0.45 : 1) * (p.far ? 0.5 : 1);
			var b = p.b;
			p.x = rnd(0, vw);
			p.y = anywhere ? rnd(0, vh * 0.8) : (up ? vh + 30 : -30);
			p.vx = rnd(-8, 8) * (p.far ? 0.5 : 1);
			p.vy = rnd(14, 30) * slow * dirY();
			p.sw = 6;
			if (b === 'sway') { p.vy = rnd(8, 16) * slow * dirY(); p.sw = 22; p.vr = rnd(-0.6, 0.6); }
			if (b === 'tumble') { p.vr = rnd(-4, 4); p.sw = 10; }
			if (b === 'spin') { p.vy = rnd(4, 8) * dirY(); p.vr = rnd(0.5, 1); p.sw = 3; }
			if (b === 'wobble') { p.vy = rnd(6, 10); p.sw = 18; p.vr = 0; }
			if (b === 'flutter') {
				p.y = rnd(vh * 0.05, vh * 0.7);
				p.vx = (sgn()) * rnd(25, 55) * (p.far ? 0.5 : 1);
				p.vy = 0; p.vr = 0;
			}
			if (b === 'float') {
				p.x = rnd(vw * 0.05, vw * 0.95);
				p.y = waterY;
				p.vx = rnd(-4, 4); p.vy = 0; p.vr = 0;
			}
			if (b === 'rise') {
				p.y = anywhere ? rnd(vh * 0.3, vh) : vh + 20;
				p.vy = -rnd(15, 35) * (p.far ? 0.5 : 1); p.vr = 0; p.sw = 8;
			}
			if (b === 'grow') {
				p.y = vh + 20;
				p.gy = vh - rnd(30, 110);
				p.st = 1; p.vr = 0; p.vx = 0;
				p.lit = 0;
			}
			if (b === 'berrycycle') {
				p.y = vh + 20;
				p.gy = vh - rnd(36, 80);
				p.st = 1; p.vr = 0; p.vx = 0;
			}
			if (b === 'fly' || b === 'vee') {
				p.dir = sgn();
				p.x = p.dir > 0 ? -50 : vw + 50;
				p.y = def.low ? rnd(vh * 0.72, vh * 0.88) : rnd(vh * 0.08, vh * 0.55);
				p.vx = p.dir * rnd(30, 70) * slow;
				p.vy = 0; p.vr = 0;
				p.n = b === 'vee' ? 2 + ((rand() * 3) | 0) : 1;
				if (anywhere) { p.x = rnd(0, vw); }
			}
			if (b === 'cruise') {
				p.dir = sgn();
				p.x = anywhere ? rnd(0, vw) : (p.dir > 0 ? -60 : vw + 60);
				p.y = waterY;
				p.vx = p.dir * rnd(28, 50);
				p.vy = 0; p.vr = 0;
				p.wake = rnd(2, 4);
			}
			if (b === 'pulse') {
				p.y = anywhere ? rnd(0, vh) : vh + 20;
				p.vy = -rnd(6, 12) * (p.far ? 0.5 : 1); p.vr = 0; p.sw = 10;
			}
			if (b === 'orbit') {
				p.x = rnd(vw * 0.15, vw * 0.85);
				p.y = rnd(vh * 0.15, vh * 0.6);
				p.vx = rnd(-5, 5); p.vy = rnd(-4, -1);
				p.orr = rnd(14, 22); p.vr = 0;
			}
			if (b === 'dangle') {
				p.x = rnd(vw * 0.1, vw * 0.9);
				p.y = 0;
				p.dy = water ? waterY - 40 : rnd(vh * 0.2, vh * 0.5);
				p.st = 1; p.t = 0; p.vr = 0;
			}
			if (b === 'hang') {
				p.x = rnd(vw * 0.05, vw * 0.95);
				p.len = rnd(30, 80);
				p.vr = 0;
			}
			if (b === 'toss') {
				p.dir = sgn();
				p.x = p.dir > 0 ? -20 : vw + 20;
				p.y = rnd(-40, 0);
				p.vx = p.dir * rnd(120, 220);
				p.vy = rnd(-30, 10);
				p.vr = rnd(-5, 5);
			}
			if (b === 'hop' || b === 'waddle' || b === 'chatter') {
				p.dir = sgn();
				p.x = anywhere ? rnd(0, vw) : (p.dir > 0 ? -30 : vw + 30);
				p.vx = p.dir * (b === 'hop' ? rnd(40, 80) : b === 'chatter' ? rnd(50, 90) : rnd(15, 30));
				p.vy = 0; p.vr = 0;
				p.hopH = rnd(20, 40);
			}
			if (b === 'dart') {
				p.hx = rnd(vw * 0.1, vw * 0.9);
				p.hy = rnd(vh * 0.1, vh * 0.66);
				p.x = p.hx; p.y = p.hy;
				p.st = 1; p.t = rnd(1, 2.5); p.darts = 4 + ((rand() * 3) | 0); p.vr = 0;
			}
			if (b === 'twinkle') {
				p.x = rnd(0, vw); p.y = rnd(0, vh * 0.85);
				p.vx = 2; p.vy = 0; p.vr = 0;
				p.t = rnd(6, 10);
			}
			if (b === 'jump') {
				p.st = 1; p.t = rnd(3, 10); p.vr = 0;
			}
			if (b === 'firefly') {
				p.x = rnd(0, vw); p.y = rnd(vh * 0.4, vh * 0.85);
				p.vx = rnd(-8, 8); p.vy = rnd(-6, 6); p.vr = 0;
			}
			if (b === 'frogger') {
				p.st = 1; p.t = rnd(2, 5); p.pad = null; p.vr = 0;
				p.x = rnd(vw * 0.2, vw * 0.8); p.y = waterY;
			}
			if (def.cl) {
				p.color = pick(def.cl);
				p.color2 = pick(def.cl);
				var guard = 4;
				while (p.color2 === p.color && guard--) { p.color2 = pick(def.cl); }
				p.deco = rand() < 0.5 ? 1 : 0;
			}
			return p;
		}

		function settleLand(p) {
			p.settled = 1;
			p.vy = 0;
			p.vx = rnd(-8, 8);
			p.t = 2;
			p.y = waterY;
			addRipple(p.x, waterY);
			if (themeKey === 'christmas') { snowLand(p.x); }
		}

		/* --- Pointer awareness: observation only. The canvas never takes
		 * events; we listen on the document and gently repel nearby NEAR
		 * particles (≤30px, spring back). A click landing on a particle pops
		 * it — the page receives the click untouched. --- */
		var ptr = { x: -9999, y: -9999, on: false };
		function onMove(e) { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; }
		function pokeAt(x, y) {
			var best = null, bd = 26 * 26;
			for (var k = 0; k < parts.length; k++) {
				var p = parts[k];
				if (p.dormant || p.alpha <= 0 || p.far || p.pop) { continue; }
				var dx = p.x + p.ox - x, dy = p.y + p.oy - y;
				var d2 = dx * dx + dy * dy;
				if (d2 < bd) { bd = d2; best = p; }
			}
			if (best) {
				best.pop = 0.001; /* pop animation: spin, shrink, fade */
				best.vr = rnd(6, 10) * (sgn());
				best.vx += rnd(-30, 30);
				addRing(x, y);
			}
		}
		function onClick(e) { pokeAt(e.clientX, e.clientY); }
		function onTouch(e) {
			var t = e.touches && e.touches[0];
			if (t) { pokeAt(t.clientX, t.clientY); }
		}
		if (FX.pointer) {
			D.addEventListener('pointermove', onMove, { passive: true });
			D.addEventListener('click', onClick, { passive: true });
			D.addEventListener('touchstart', onTouch, { passive: true });
		}
		function repel(p, dt) {
			if (!FX.pointer || !ptr.on || p.far) {
				p.ox *= 0.9; p.oy *= 0.9;
				return;
			}
			var dx = p.x - ptr.x, dy = p.y - ptr.y;
			var d2 = dx * dx + dy * dy;
			if (d2 < 4900 && d2 > 0.01) {
				var d = sqrt(d2);
				var f = (1 - d / 70) * 30;
				p.ox += ((dx / d) * f - p.ox) * mn(1, dt * 8);
				p.oy += ((dy / d) * f - p.oy) * mn(1, dt * 8);
			} else {
				p.ox *= 0.92; p.oy *= 0.92;
			}
		}

		function step(p, dt, t) {
			var b = p.b, off = 40;
			p.ph += dt * p.phv;
			p.rot += p.vr * dt;
			if (p.pop) { /* click reaction: spin off and fade fast */
				p.pop += dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.alpha = clamp(1 - p.pop * 2, 0, 1);
				p.sc *= 1 - dt * 1.2;
				if (p.pop > 0.55) { seed(p); }
				return;
			}
			switch (b) {
				case 'fall': case 'sway': case 'tumble': case 'spin':
					if (p.settled) {
						p.x += p.vx * dt;
						p.t -= dt;
						p.alpha = clamp(p.t / 2, 0, 1);
						if (p.t <= 0) { seed(p); }
						return;
					}
					p.x += p.vx * dt + sin(p.ph) * p.sw * dt;
					p.y += p.vy * dt;
					if (p.sp.def.glint) { p.alpha = rand() < 0.03 ? 1 : 0.75; }
					if (p.sp.def.fx === 'trail') { /* quill ink squiggle */
						if (!p.trail) { p.trail = []; }
						if (!p.trail.length || abs(p.trail[p.trail.length - 1][1] - p.y) > 6) {
							p.trail.push([p.x, p.y]);
							if (p.trail.length > 8) { p.trail.shift(); }
						}
					}
					if (!up && water && p.sp.def.st && !p.far && p.y >= waterY) { settleLand(p); return; }
					if (p.y > vh + off || p.y < -off) { seed(p); }
					break;
				case 'wobble':
					p.x += sin(p.ph) * 18 * dt + p.vx * dt * 0.3;
					p.y += p.vy * dt;
					p.alpha = 0.35 + 0.35 * sin(p.ph * 0.7);
					if (p.y > vh + off) { seed(p); }
					break;
				case 'flutter':
					p.x += p.vx * dt;
					p.y += sin(p.ph * 2) * 30 * dt;
					if (rand() < dt * 0.4) { p.vx = -p.vx; }
					if (p.x < -off || p.x > vw + off) { seed(p); }
					break;
				case 'float':
					p.x += p.vx * dt + sin(p.ph * 0.4) * 4 * dt;
					p.y = waterY + sin(p.ph) * 3;
					p.rot = sin(p.ph) * 0.08;
					if (p.x < -off || p.x > vw + off) { seed(p); }
					break;
				case 'rise':
					p.x += sin(p.ph) * p.sw * dt;
					p.y += p.vy * dt;
					p.alpha = clamp(p.y / (vh * 0.3), 0, 1);
					if (p.y < -off) { seed(p); }
					break;
				case 'grow':
					if (p.st === 1) {
						p.y += (p.gy - p.y) * mn(1, dt * 2);
						if (abs(p.y - p.gy) < 2) { p.st = 2; p.t = rnd(2.5, 4.5); p.litAt = t; }
					} else if (p.st === 2) {
						p.rot = sin(p.ph) * 0.05;
						p.t -= dt;
						if (p.t <= 0) { p.st = 3; p.t = 1; }
					} else {
						p.t -= dt;
						p.alpha = clamp(p.t, 0, 1);
						if (p.t <= 0) { seed(p); }
					}
					break;
				case 'berrycycle':
					/* bloom → hold → morph to berry → drop off */
					if (p.st === 1) {
						p.y += (p.gy - p.y) * mn(1, dt * 2);
						p.morph = 0;
						if (abs(p.y - p.gy) < 2) { p.st = 2; p.t = 2; }
					} else if (p.st === 2) {
						p.t -= dt;
						if (p.t <= 0) { p.st = 3; p.t = 2; }
					} else if (p.st === 3) {
						p.t -= dt;
						p.morph = clamp(1 - p.t / 2, 0, 1);
						if (p.t <= 0) { p.st = 4; p.vy = 30; }
					} else {
						p.vy += 200 * dt;
						p.y += p.vy * dt;
						p.rot += dt * 3;
						if (p.y > vh + off) { seed(p); }
					}
					break;
				case 'fly': case 'vee':
					p.x += p.vx * dt;
					p.y += sin(p.ph) * 6 * dt;
					if ((p.dir > 0 && p.x > vw + 60) || (p.dir < 0 && p.x < -60)) { seed(p); }
					break;
				case 'cruise':
					p.x += p.vx * dt;
					p.y = waterY - p.size * 0.18 + sin(p.ph) * 2;
					p.rot = sin(p.ph) * 0.04;
					p.wake -= dt;
					if (p.wake <= 0) {
						addRipple(p.x - p.dir * p.size * 0.6, waterY + 2);
						p.wake = rnd(2, 4);
					}
					if ((p.dir > 0 && p.x > vw + 80) || (p.dir < 0 && p.x < -80)) { seed(p); }
					break;
				case 'pulse':
					p.x += sin(p.ph) * p.sw * dt;
					p.y += p.vy * dt;
					if (p.y < -off) { seed(p); }
					break;
				case 'orbit':
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					if (p.y < -off || p.x < -off || p.x > vw + off) { seed(p); }
					break;
				case 'dangle':
					if (p.st === 1) {
						p.y += 40 * dt;
						if (p.y >= p.dy) { p.st = 2; p.t = rnd(1.5, 3); }
					} else if (p.st === 2) {
						p.t -= dt;
						p.x += sin(p.ph) * 3 * dt;
						if (p.t <= 0) { p.st = 3; }
					} else if (p.st === 3) {
						p.y -= 60 * dt;
						if (p.y <= 0) { p.st = 4; p.t = rnd(3, 8); p.alpha = 0; }
					} else {
						p.t -= dt;
						if (p.t <= 0) { seed(p); p.alpha = 1; }
					}
					break;
				case 'hang':
					p.rot = sin(p.ph) * 0.12;
					break;
				case 'toss':
					p.vy += 160 * dt;
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					if (water && p.y >= waterY) { addRipple(p.x, waterY); seed(p); return; }
					if (p.y > vh + off || p.x < -60 || p.x > vw + 60) { seed(p); }
					break;
				case 'hop':
					p.x += p.vx * dt;
					p.y = ground - abs(sin(p.ph * 3)) * p.hopH;
					if (p.x < -60 || p.x > vw + 60) { seed(p); }
					break;
				case 'waddle': case 'chatter':
					p.x += p.vx * dt;
					p.y = ground + sin(p.ph * 6) * 2;
					p.rot = sin(p.ph * 6) * 0.08;
					if (b === 'chatter') { p.frame = ((t / 160) | 0) % 2; }
					if (p.x < -60 || p.x > vw + 60) { seed(p); }
					break;
				case 'dart':
					if (p.st === 1) {
						p.x = p.hx + sin(p.ph * 5) * 3;
						p.y = p.hy + cos(p.ph * 4) * 3;
						p.t -= dt;
						if (p.t <= 0) {
							p.st = 2;
							p.tx = clamp(p.hx + rnd(-150, 150), 20, vw - 20);
							p.ty = clamp(p.hy + rnd(-100, 100), 20, vh * 0.7);
						}
					} else {
						p.x += (p.tx - p.x) * mn(1, dt * 6);
						p.y += (p.ty - p.y) * mn(1, dt * 6);
						if (abs(p.x - p.tx) < 4 && abs(p.y - p.ty) < 4) {
							p.hx = p.tx; p.hy = p.ty;
							p.st = 1; p.t = rnd(1, 2.5);
							if (--p.darts <= 0) { seed(p); }
						}
					}
					break;
				case 'twinkle':
					p.alpha = 0.25 + 0.75 * abs(sin(p.ph));
					p.x += p.vx * dt;
					p.t -= dt;
					if (p.t <= 0) { seed(p, true); p.t = rnd(6, 10); }
					break;
				case 'firefly':
					p.x += p.vx * dt + sin(p.ph * 0.7) * 10 * dt;
					p.y += p.vy * dt + cos(p.ph * 0.5) * 8 * dt;
					if (p.x < -off || p.x > vw + off || p.y < vh * 0.2 || p.y > vh) { seed(p); }
					break;
				case 'jump':
					if (p.st === 1) {
						p.alpha = 0;
						p.t -= dt;
						if (p.t <= 0) {
							p.st = 2;
							p.x = rnd(vw * 0.1, vw * 0.9);
							p.y = waterY + 6;
							p.vy = -rnd(290, 350);
							p.vx = rnd(-40, 40);
							p.alpha = 1;
							addRipple(p.x, waterY);
						}
					} else {
						p.vy += 420 * dt;
						p.x += p.vx * dt;
						p.y += p.vy * dt;
						p.rot = atan2(p.vy, p.vx * 4) * 0.5;
						if (p.vy > 0 && p.y >= waterY) {
							addRipple(p.x, waterY, true);
							p.st = 1; p.t = rnd(4, 12); p.alpha = 0;
						}
					}
					break;
				case 'frogger':
					/* sit on a lily pad, hop to another every few seconds */
					if (p.st === 1) {
						if (p.pad && !p.pad.dormant && p.pad.b === 'float') {
							p.x = p.pad.x; p.y = p.pad.y - p.size * 0.5;
						} else { p.y = waterY - p.size * 0.4; }
						p.t -= dt;
						if (p.t <= 0) {
							var pads = [];
							for (var q = 0; q < parts.length; q++) {
								var c = parts[q];
								if (c !== p && !c.dormant && c.b === 'float' && c.alpha > 0) { pads.push(c); }
							}
							p.st = 2;
							p.pad = pads.length ? pick(pads) : null;
							p.jx = p.x; p.jy = p.y;
							p.tx = p.pad ? p.pad.x : rnd(vw * 0.1, vw * 0.9);
							p.ty = (p.pad ? p.pad.y : waterY) - p.size * 0.5;
							p.t = 0;
						}
					} else {
						p.t += dt * 2.2;
						var u = mn(1, p.t);
						p.x = lerp(p.jx, p.tx, u);
						p.y = lerp(p.jy, p.ty, u) - sin(u * MT.PI) * 46;
						if (u >= 1) {
							p.st = 1; p.t = rnd(3, 6);
							if (!p.pad) { addRipple(p.x, waterY); }
						}
					}
					break;
			}
		}

		/* --- Facing + drawing --- */
		function facingRight(p) {
			var b = p.b;
			if (b === 'fly' || b === 'vee' || b === 'hop' || b === 'waddle' || b === 'chatter' || b === 'cruise') {
				return p.dir > 0;
			}
			if (b === 'frogger') { return p.tx > p.jx; }
			return p.vx > 0;
		}

		function drawGlyph(p, s, flip, t) {
			var sp = p.sp;
			if (flip && sp.kind === 'c') { flip = false; }
			if (flip) { cx.save(); cx.scale(-1, 1); }
			if (sp.kind === 'e' || sp.kind === 't') {
				cx.font = MT.round(p.size * s) + FT;
				if (sp.def.glow) {
					cx.save();
					cx.globalAlpha *= 0.35 * (evening ? 1.3 : 1);
					cx.fillStyle = '#FF922B';
					cx.beginPath();
					cx.arc(0, 0, p.size * 0.65 * s * (evening ? 1.3 : 1), 0, TAU);
					cx.fill();
					cx.restore();
				}
				if (sp.kind === 't') { cx.fillStyle = sp.color; }
				cx.fillText(sp.g, 0, 0);
			} else if (sp.kind === 's') {
				var key = p.sKey === 'teeth' ? 'teeth' + (p.frame || 0) : p.sKey;
				if (sp.def.fx === 'letter') { key = p.y > vh * 0.5 ? 'letter1' : 'letter0'; }
				if (sp.def.glow) { /* jack-o'-lantern flicker glow */
					var fl = 0.3 + 0.15 * sin(p.ph * 7) + (evening ? 0.12 : 0);
					cx.save();
					cx.globalAlpha *= fl;
					cx.fillStyle = '#FFB44D';
					cx.beginPath();
					cx.arc(0, 0, p.size * 0.8 * s, 0, TAU);
					cx.fill();
					cx.restore();
				}
				var im = sprite(key);
				if (im.ready) {
					var w = p.size * 1.3 * s, h = w * im.ratio;
					cx.drawImage(im.img, -w / 2, -h / 2, w, h);
					fxExtras(p, s, w, h, t);
				}
			} else if (sp.kind === 'c') {
				PRIMS[sp.c](cx, p, s, t);
			}
			if (flip) { cx.restore(); }
		}

		/* Sprite draw extras: smoke, glint sweep, tree lights, balloon
		 * string, letter hearts, bead shine handled in art, orbit arrows,
		 * trailing chicks. */
		function fxExtras(p, s, w, h, t) {
			var fx = p.sp.def.fx || (evening && p.sKey === 'pontoon' ? 'deck' : 0);
			if (!fx) { return; }
			if (fx === 'smoke') {
				cx.strokeStyle = 'rgba(160,160,160,.6)';
				cx.lineWidth = 1.4;
				cx.lineCap = 'round';
				for (var i = 0; i < 2; i++) {
					var phw = p.ph * 1.4 + i * 2;
					cx.beginPath();
					cx.moveTo((i - 0.5) * w * 0.3, -h * 0.5);
					cx.quadraticCurveTo((i - 0.5) * w * 0.3 + sin(phw) * 5, -h * 0.75, (i - 0.5) * w * 0.3 + sin(phw * 1.3) * 7, -h * 0.95);
					cx.stroke();
				}
			} else if (fx === 'glint') {
				var gx = ((t / 1800) % 1) * w * 1.6 - w * 0.8;
				cx.save();
				cx.globalAlpha *= 0.55;
				cx.strokeStyle = '#FFFFFF';
				cx.lineWidth = 2;
				cx.beginPath();
				cx.moveTo(gx - 3, h * 0.4);
				cx.lineTo(gx + 3, -h * 0.4);
				cx.stroke();
				cx.restore();
			} else if (fx === 'lights' && p.st >= 2) {
				/* pine pops its lights on string by string after growing */
				var strings = mn(3, 1 + (((t - (p.litAt || t)) / 700) | 0));
				var cols = ['#FFD43B', '#E03131', '#4DABF7'];
				for (var r2 = 0; r2 < strings; r2++) {
					var yy = -h * 0.32 + r2 * h * 0.22;
					var wid = w * (0.24 + r2 * 0.14);
					for (var k2 = -1; k2 <= 1; k2++) {
						cx.fillStyle = cols[(r2 + k2 + 3) % 3];
						cx.beginPath();
						cx.arc(k2 * wid, yy + abs(k2) * 2, 1.6, 0, TAU);
						cx.fill();
					}
				}
			} else if (fx === 'string') {
				cx.strokeStyle = 'rgba(160,160,160,.8)';
				cx.lineWidth = 1;
				cx.beginPath();
				cx.moveTo(0, h * 0.5);
				cx.quadraticCurveTo(sin(p.ph * 1.6) * 6, h * 0.9, sin(p.ph) * 8, h * 1.3);
				cx.stroke();
			} else if (fx === 'letter' && p.y > vh * 0.5) {
				/* three tiny hearts drift up from the opened letter */
				cx.fillStyle = '#FA5252';
				cx.font = 10 + FT;
				for (var m2 = 0; m2 < 3; m2++) {
					var lp = (p.ph * 0.5 + m2 * 0.33) % 1;
					cx.globalAlpha = alphaBase * (1 - lp);
					cx.fillText('♥', (m2 - 1) * 8 + sin(p.ph + m2) * 3, -h * 0.6 - lp * 22);
				}
				cx.globalAlpha = alphaBase;
			} else if (fx === 'orbitarrows') {
				cx.save();
				cx.rotate(p.ph);
				cx.strokeStyle = '#2F9E44';
				cx.lineWidth = 2;
				for (var a2 = 0; a2 < 2; a2++) {
					cx.beginPath();
					cx.arc(0, 0, w * 0.62, a2 * MT.PI + 0.3, a2 * MT.PI + 2.4);
					cx.stroke();
				}
				cx.restore();
			} else if (fx === 'chicks') {
				/* turkey leads two chicks — drawn behind, un-mirrored space */
				var cim = sprite('chick');
				if (cim.ready) {
					for (var c2 = 1; c2 <= 2; c2++) {
						var cw = w * 0.42;
						cx.drawImage(cim.img, w * 0.55 + c2 * cw * 0.9 - cw / 2, h * 0.5 - cw * cim.ratio + sin(p.ph * 6 + c2) * 1.5 - 1, cw, cw * cim.ratio);
					}
				}
			} else if (fx === 'deck' && evening) {
				var dcols = ['#FFD43B', '#FFE066'];
				for (var d2 = -2; d2 <= 2; d2++) {
					cx.fillStyle = dcols[(d2 + 2) % 2];
					cx.beginPath();
					cx.arc(d2 * w * 0.18, -h * 0.28, 1.5, 0, TAU);
					cx.fill();
				}
			}
		}

		function drawP(p, t) {
			if (p.dormant || p.alpha <= 0) { return; }
			var b = p.b;
			var layerA = p.far ? 0.6 : 1;
			var layerS = p.far ? 0.6 : 1;
			cx.save();
			cx.globalAlpha = alphaBase * clamp(p.alpha, 0, 1) * layerA * (evening ? 0.9 : 1);
			if (b === 'dangle' && p.st !== 4) {
				cx.strokeStyle = 'rgba(90,90,90,.6)';
				cx.lineWidth = 1;
				cx.beginPath(); cx.moveTo(p.x, 0); cx.lineTo(p.x, p.y); cx.stroke();
			}
			if (b === 'hang') {
				cx.strokeStyle = 'rgba(120,120,120,.5)';
				cx.lineWidth = 1;
				cx.beginPath(); cx.moveTo(p.x, 0); cx.lineTo(p.x + sin(p.ph) * 8, p.len); cx.stroke();
			}
			if (p.trail && p.trail.length > 1) { /* quill ink squiggle */
				cx.strokeStyle = 'rgba(52,58,64,.4)';
				cx.lineWidth = 1;
				cx.beginPath();
				for (var q2 = 0; q2 < p.trail.length; q2++) {
					var tp = p.trail[q2];
					cx[q2 ? 'lineTo' : 'moveTo'](tp[0] + sin(q2 * 2.6) * 4, tp[1]);
				}
				cx.stroke();
			}
			var px = p.x + p.ox, py = p.y + p.oy;
			if (b === 'hang') { px = p.x + sin(p.ph) * 8; py = p.len + p.size * 0.5; }
			cx.translate(px, py);
			if (p.rot) { cx.rotate(p.rot); }
			var s = p.sc * layerS;
			var flip = !!(p.sp.def.face && facingRight(p));
			if (b === 'pulse') { s *= 1 + 0.18 * sin(p.ph * 2.2); }
			if (b === 'berrycycle') { /* blossom morphs into a swelling berry */
				var mo = p.morph || 0;
				if (mo < 1) {
					cx.save();
					cx.globalAlpha *= (1 - mo);
					var bim = sprite('blossom');
					if (bim.ready) { var bw = p.size * (1 - mo * 0.4); cx.drawImage(bim.img, -bw / 2, -bw / 2, bw, bw); }
					cx.restore();
				}
				if (mo > 0 || p.st === 4) {
					var rim = sprite('berry');
					if (rim.ready) {
						var rw = p.size * (0.4 + 0.9 * (p.st === 4 ? 1 : mo));
						cx.globalAlpha *= (p.st === 4 ? 1 : mx2(0.25, mo));
						cx.drawImage(rim.img, -rw / 2, -rw / 2, rw, rw * rim.ratio);
					}
				}
			} else if (b === 'orbit') {
				for (var k = 0; k < 2; k++) {
					cx.save();
					cx.translate(cos(p.ph + k * MT.PI) * p.orr, sin(p.ph + k * MT.PI) * p.orr * 0.5);
					drawGlyph(p, s * 0.85, flip, t);
					cx.restore();
				}
			} else if (b === 'vee') {
				var offs = [[0, 0], [-24, 12], [-24, -12], [-48, 24]];
				for (var m = 0; m < p.n && m < offs.length; m++) {
					cx.save();
					cx.translate(offs[m][0] * (p.dir > 0 ? 1 : -1), offs[m][1]);
					drawGlyph(p, s * (m ? 0.85 : 1), flip, t);
					cx.restore();
				}
			} else if (p.sp.def.worm && p.b === 'dangle' && p.st === 2) {
				drawGlyph(p, s, flip, t);
				cx.font = MT.round(p.size * 0.7) + FT;
				cx.fillText(drawable('🪱') ? '🪱' : '~', 0, p.size * 0.8);
			} else {
				drawGlyph(p, s, flip, t);
			}
			cx.restore();
		}

		/* --- Waterline reflections: near actors just above the water get a
		 * flipped, squashed 25% mirror; floaters get a broken shimmer. --- */
		function drawReflections(t) {
			if (!FX.reflect) { return; }
			for (var k = 0; k < parts.length; k++) {
				var p = parts[k];
				if (p.dormant || p.far || p.alpha <= 0) { continue; }
				if (p.b === 'float' || p.b === 'cruise') {
					cx.save();
					cx.globalAlpha = alphaBase * 0.28 * (0.6 + 0.4 * sin(p.ph * 2));
					cx.strokeStyle = '#DDEAF5';
					cx.lineWidth = 1.4;
					var wd = p.size * 0.5;
					cx.beginPath();
					cx.moveTo(p.x - wd, waterY + 5); cx.lineTo(p.x - wd * 0.3, waterY + 5);
					cx.moveTo(p.x + wd * 0.15, waterY + 8); cx.lineTo(p.x + wd * 0.7, waterY + 8);
					cx.stroke();
					cx.restore();
					continue;
				}
				var dy = waterY - p.y;
				if (dy <= 0 || dy > 60) { continue; }
				cx.save();
				cx.globalAlpha = alphaBase * 0.25 * clamp(p.alpha, 0, 1);
				cx.translate(p.x + p.ox, waterY + dy * 0.55);
				cx.scale(1, -0.55);
				if (p.rot) { cx.rotate(-p.rot); }
				drawGlyph(p, p.sc, !!(p.sp.def.face && facingRight(p)), t);
				cx.restore();
			}
			if (hero && hero.kind === 'bass' && hero.g && waterY - hero.y > 0 && waterY - hero.y < 90) {
				cx.save();
				cx.globalAlpha = alphaBase * 0.25;
				cx.translate(hero.x, waterY + (waterY - hero.y) * 0.55);
				cx.scale(1, -0.55);
				cx.font = 40 + FT;
				cx.fillText(hero.g, 0, 0);
				cx.restore();
			}
		}

		/* --- Burst mode (New Year's): firework emitter + auto-year. --- */
		var nextBurst = 0, yearFx = null, flash = null;
		var yearNow = localNow();
		var yearText = String(yearNow.getFullYear() + (yearNow.getMonth() >= 6 ? 1 : 0));
		var sparkCl = A.sparkCl || ['#FFD43B', '#CED4DA'];
		var bursts = [];
		function fire(t) {
			var bx = rnd(vw * 0.18, vw * 0.82), by = rnd(vh * 0.12, vh * 0.42);
			var col = pick(sparkCl), n = 26, sp = [];
			for (var i = 0; i < n; i++) {
				var a = (i / n) * TAU + rnd(-0.09, 0.09), v = rnd(150, 265);
				sp.push({ x: bx, y: by, vx: cos(a) * v, vy: sin(a) * v });
			}
			bursts.push({ s: sp, life: 0, col: col });
			if (bursts.length > 2) { bursts.shift(); }
			flash = { x: bx, y: by, a: 1 };
			yearFx = { x: bx, y: by, a: 1.4 };
			nextBurst = t + rnd(1400, 2800);
		}
		function stepBursts(dt) {
			for (var k = bursts.length - 1; k >= 0; k--) {
				var b2 = bursts[k];
				b2.life += dt;
				var fade = clamp(1 - b2.life / 1.6, 0, 1);
				if (fade <= 0) { bursts.splice(k, 1); continue; }
				cx.save();
				cx.globalAlpha = mn(1, alphaBase * 1.9) * fade;
				cx.strokeStyle = b2.col;
				cx.lineWidth = 2.6;
				cx.lineCap = 'round';
				cx.beginPath();
				for (var i = 0; i < b2.s.length; i++) {
					var q = b2.s[i];
					q.vy += 130 * dt;
					q.x += q.vx * dt;
					q.y += q.vy * dt;
					cx.moveTo(q.x - q.vx * 0.055, q.y - q.vy * 0.055);
					cx.lineTo(q.x, q.y);
				}
				cx.stroke();
				cx.restore();
			}
		}
		function drawFlash(dt) {
			if (!flash) { return; }
			flash.a -= dt * 3.2;
			if (flash.a <= 0) { flash = null; return; }
			cx.save();
			cx.globalAlpha = clamp(flash.a * 0.5, 0, 1);
			cx.fillStyle = '#FFF3C4';
			cx.beginPath();
			cx.arc(flash.x, flash.y, 26 * (1.4 - flash.a), 0, TAU);
			cx.fill();
			cx.restore();
		}

		/* --- Heroes: rare crossers. The heron (3-frame wingbeat, occasional
		 * full landing sequence) is always in the rotation. --- */
		var hero = null, heroNext = 0;
		var heroPool = ['heron'];
		if (A.hero) { heroPool.push(A.hero); }
		var HERON_FRAMES = ['heron0', 'heron1', 'heron2', 'heron1'];
		function spawnHero(t) {
			if (!FX.heroes || vig) { heroNext = t + 4000; return; }
			var kind = pick(heroPool);
			var dir = sgn();
			hero = { kind: kind, dir: dir, t: 0, ph: 0 };
			if (kind === 'heron') {
				hero.x = dir > 0 ? -110 : vw + 110;
				hero.y = rnd(vh * 0.15, vh * 0.45);
				hero.vx = dir * rnd(60, 90);
				hero.w = 96;
				HERON_FRAMES.forEach(sprite); sprite('heronstand');
				/* The only day the heron flies inverted: April Fool's, rarely. */
				hero.invert = themeKey === 'april_fools' && rand() < 0.25;
				/* Classic landing sequence: glide in → land → stand → leave. */
				hero.land = !hero.invert && water && rand() < (themeKey === 'classic' ? 0.5 : 0.15);
				if (hero.land) { hero.lx = rnd(vw * 0.25, vw * 0.75); hero.st = 1; }
			} else if (kind === 'eagle' || kind === 'witch') {
				var g = kind === 'eagle' ? '🦅' : '🧙‍♀️';
				if (!drawable(g)) { hero = null; heroNext = t + 5000; return; }
				hero.g = g;
				hero.x = dir > 0 ? -60 : vw + 60;
				hero.y = rnd(vh * 0.1, vh * 0.4);
				hero.vx = dir * rnd(70, 110);
			} else if (kind === 'sleigh') {
				hero.x = dir > 0 ? -140 : vw + 140;
				hero.y = rnd(vh * 0.08, vh * 0.3);
				hero.vx = dir * rnd(80, 120);
				hero.w = 120;
				sprite('sleigh');
			} else if (kind === 'manatee') {
				hero.x = dir > 0 ? -110 : vw + 110;
				hero.y = vh * 0.955;
				hero.vx = dir * rnd(22, 34);
				hero.w = 96;
				hero.rip = 0;
				hero.calf = rand() < 0.5; /* mom with calf */
				sprite('manatee');
			} else if (kind === 'bass') {
				hero.g = drawable('🐟') ? '🐟' : (drawable('🐠') ? '🐠' : null);
				if (!hero.g) { hero = null; heroNext = t + 5000; return; }
				hero.x = rnd(vw * 0.15, vw * 0.85);
				hero.y = waterY + 8;
				hero.vy = -rnd(340, 400);
				hero.vxj = rnd(-50, 50);
				addRipple(hero.x, waterY, true);
			} else if (kind === 'ducks') {
				hero.x = dir > 0 ? -90 : vw + 90;
				hero.y = ground;
				hero.vx = dir * rnd(30, 45);
			} else if (kind === 'rainbow') {
				hero.corner = rand() < 0.5 ? 0 : 1;
				hero.t = 0;
				sprite('rainbow');
			}
		}
		function stepHero(dt, t) {
			if (!hero) {
				if (!heroNext) { heroNext = t + rnd(heroEvery[0], heroEvery[1]) * 1000; }
				else if (t >= heroNext && !vig) { spawnHero(t); heroNext = 0; }
				return;
			}
			var h = hero;
			h.ph += dt * 2;
			h.t += dt;
			if (h.kind === 'rainbow') {
				if (h.t > 7) { hero = null; }
				return;
			}
			if (h.kind === 'bass') {
				h.vy += 420 * dt;
				h.x += h.vxj * dt;
				h.y += h.vy * dt;
				if (h.vy > 0 && h.y >= waterY) { addRipple(h.x, waterY, true); hero = null; }
				return;
			}
			if (h.kind === 'heron' && h.land) {
				if (h.st === 1) { /* glide toward the landing spot */
					h.x += h.vx * dt;
					var dxl = h.lx - h.x;
					if ((h.dir > 0 && dxl < 140) || (h.dir < 0 && dxl > -140)) {
						h.y += (waterY - 26 - h.y) * mn(1, dt * 1.6);
						h.vx *= 1 - dt * 0.8;
					}
					if (abs(dxl) < 12 || abs(h.vx) < 12) {
						h.st = 2; h.t2 = 2.5;
						addRipple(h.x, waterY);
					}
				} else if (h.st === 2) { /* stand a moment */
					h.y = waterY - 26;
					h.t2 -= dt;
					if (h.t2 <= 0) { h.st = 3; addRipple(h.x, waterY); }
				} else { /* take off */
					h.vx += h.dir * 60 * dt;
					h.x += h.vx * dt;
					h.y -= 55 * dt;
					if ((h.dir > 0 && h.x > vw + 150) || (h.dir < 0 && h.x < -150) || h.y < -80) { hero = null; }
				}
				return;
			}
			h.x += h.vx * dt;
			if (h.kind !== 'manatee' && h.kind !== 'ducks') { h.y += sin(h.ph) * 8 * dt; }
			if (h.kind === 'manatee') {
				h.rip -= dt;
				if (h.rip <= 0) { addRipple(h.x + h.dir * 40, waterY + 2); h.rip = rnd(2, 4); }
			}
			if ((h.dir > 0 && h.x > vw + 150) || (h.dir < 0 && h.x < -150)) { hero = null; }
		}
		function drawHero(t) {
			if (!hero) { return; }
			var h = hero;
			cx.save();
			if (h.kind === 'rainbow') {
				/* upgraded corner moment: rainbow + pot + leprechaun hat,
				 * coin arcs clinking in, a clover strip that grows and fades */
				var a = h.t < 1 ? h.t : (h.t > 6 ? clamp(7 - h.t, 0, 1) : 1);
				cx.globalAlpha = clamp(alphaBase * 1.6 * a, 0, 1);
				var im = sprite('rainbow');
				if (im.ready) {
					var w = 150, hh = w * im.ratio;
					var x = h.corner ? vw - w - 10 : 10;
					cx.drawImage(im.img, x, vh - hh - 6, w, hh);
					/* coin arc into the pot */
					if (h.t > 1.4 && h.t < 4.4) {
						var potX = x + w * 0.81, potY = vh - hh * 0.18;
						for (var c3 = 0; c3 < 3; c3++) {
							var cu = (h.t - 1.4 - c3 * 0.5) / 0.9;
							if (cu > 0 && cu < 1) {
								var cxx = lerp(x + w * 0.2, potX, cu);
								var cyy = lerp(vh - hh * 0.9, potY, cu) - sin(cu * MT.PI) * 46;
								cx.fillStyle = '#F1C40F';
								cx.beginPath(); cx.arc(cxx, cyy, 3.2, 0, TAU); cx.fill();
								if (cu > 0.94) { addRing(potX, potY - 6); }
							}
						}
					}
					/* clover strip along the bottom */
					cx.fillStyle = '#2F9E44';
					for (var v3 = 0; v3 < 6; v3++) {
						var gu = clamp((h.t - 0.6 - v3 * 0.18) / 0.5, 0, 1);
						if (gu > 0) {
							var gx2 = (h.corner ? vw - 190 : 40) + v3 * 26;
							cx.font = MT.round(8 + gu * 6) + FT;
							cx.fillText('☘', gx2, vh - 4 - gu * 4);
						}
					}
				}
				cx.restore();
				return;
			}
			cx.globalAlpha = mn(1, alphaBase * 2) * (h.kind === 'manatee' ? 0.55 : 1) * (evening ? 0.92 : 1);
			cx.translate(h.x, h.y);
			if (h.kind === 'heron') {
				var stand = h.land && h.st === 2;
				var frame = stand ? 'heronstand' : HERON_FRAMES[((t / 260) | 0) % 4];
				var him = sprite(frame);
				if (him.ready) {
					if (h.dir > 0) { cx.scale(-1, 1); }
					if (h.invert) { cx.scale(1, -1); }
					var hw = stand ? 52 : h.w;
					cx.drawImage(him.img, -hw / 2, -hw * him.ratio / 2, hw, hw * him.ratio);
				}
			} else if (h.kind === 'sleigh' || h.kind === 'manatee') {
				var sim = sprite(h.kind);
				if (sim.ready) {
					if (h.dir > 0) { cx.scale(-1, 1); }
					cx.drawImage(sim.img, -h.w / 2, -h.w * sim.ratio / 2, h.w, h.w * sim.ratio);
					if (h.kind === 'manatee' && h.calf) {
						cx.drawImage(sim.img, h.w * 0.42, -h.w * sim.ratio * 0.1, h.w * 0.5, h.w * 0.5 * sim.ratio);
					}
				}
			} else if (h.kind === 'bass') {
				cx.rotate(atan2(h.vy, h.vxj * 4) * 0.5);
				if (h.vxj > 0) { cx.scale(-1, 1); }
				cx.font = 40 + FT;
				cx.fillText(h.g, 0, 0);
			} else if (h.kind === 'eagle' || h.kind === 'witch') {
				cx.font = 42 + FT;
				if (h.kind === 'witch') { cx.rotate(h.dir * -0.15); }
				if (h.dir > 0) { cx.scale(-1, 1); }
				cx.fillText(h.g, 0, 0);
			} else if (h.kind === 'ducks') {
				var duck = drawable('🦆') ? '🦆' : '🐤';
				var chick = drawable('🐥') ? '🐥' : '🐤';
				var duckling = function (g, ox, oy, fs) {
					cx.save();
					cx.translate(ox, oy);
					if (h.dir > 0) { cx.scale(-1, 1); }
					cx.font = fs + FT;
					cx.fillText(g, 0, 0);
					cx.restore();
				};
				duckling(duck, 0, sin(h.ph * 3) * 2, 30);
				duckling(chick, -h.dir * 30, sin(h.ph * 3 + 1) * 2, 20);
				duckling(chick, -h.dir * 54, sin(h.ph * 3 + 2) * 2, 20);
			}
			cx.restore();
		}

		/* --- Vignette director: rare 5–12s choreographed scenes. One at a
		 * time, ≥90s apart, first ≥20s in, never alongside a hero, actors
		 * borrow (dormant) pool slots so the cap holds. --- */
		var vig = null, vigNext = 0, countdownDone = false;
		var VA = mn(1, alphaBase * 2.2); /* scenes read a touch stronger */
		function dspr(key, x, y, w, flipX, rot, alpha) {
			var im = sprite(key);
			if (!im.ready) { return; }
			cx.save();
			cx.globalAlpha = clamp(alpha == null ? VA : alpha, 0, 1);
			cx.translate(x, y);
			if (rot) { cx.rotate(rot); }
			if (flipX) { cx.scale(-1, 1); }
			cx.drawImage(im.img, -w / 2, -w * im.ratio / 2, w, w * im.ratio);
			cx.restore();
		}
		function dtxt(g, x, y, fs, color, alpha, rot, flipX) {
			cx.save();
			cx.globalAlpha = clamp(alpha == null ? VA : alpha, 0, 1);
			cx.translate(x, y);
			if (rot) { cx.rotate(rot); }
			if (flipX) { cx.scale(-1, 1); }
			cx.font = (fs | 0) + FT;
			cx.textAlign = 'center';
			if (color) { cx.fillStyle = color; }
			cx.fillText(g, 0, 0);
			cx.restore();
		}
		function sBeg(color, width, alpha) {
			cx.save();
			cx.globalAlpha = alpha == null ? VA * 0.7 : alpha;
			cx.strokeStyle = color;
			cx.lineWidth = width;
			cx.beginPath();
		}
		function sEnd() { cx.stroke(); cx.restore(); }
		function moonDraw(mx, my, a) {
			cx.save();
			cx.globalAlpha = clamp(a * 0.5, 0, 1);
			cx.fillStyle = '#F4EFD8';
			cx.beginPath(); cx.arc(mx, my, 46, 0, TAU); cx.fill();
			cx.globalAlpha = clamp(a * 0.18, 0, 1);
			cx.beginPath(); cx.arc(mx, my, 58, 0, TAU); cx.fill();
			cx.restore();
		}

		function crosserScene(key, w, yOff, speed, onWater) {
			return { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -60 : vw + 60; st.ph = 0; st.wk = 1; }
				st.ph += dt * 3.6;
				st.x += st.dir * speed * dt;
				if (onWater) {
					st.wk -= dt;
					if (st.wk <= 0) { addRipple(st.x - st.dir * 20, waterY + 2); st.wk = rnd(0.9, 1.6); }
				}
				var y = onWater ? waterY - 6 : vh - yOff;
				dspr(key, st.x, y + sin(st.ph) * 1.8 + (onWater ? 0 : abs(sin(st.ph)) * -5), w, st.dir > 0, sin(st.ph) * 0.07);
				return (st.dir > 0 && st.x > vw + 70) || (st.dir < 0 && st.x < -70);
			} };
		}
		function flightScene(key, n, w) {
			return { actors: 3, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -90 : vw + 90; st.ph = 0; }
				st.ph += dt * 2.4;
				st.x += st.dir * 72 * dt;
				for (var i = 0; i < n; i++) {
					dspr(key, st.x - st.dir * i * 46, vh * 0.26 + i * 22 + sin(st.ph + i) * 9, w * (i ? 0.82 : 1), st.dir > 0, sin(st.ph + i) * 0.09);
				}
				return (st.dir > 0 && st.x > vw + 160) || (st.dir < 0 && st.x < -160);
			} };
		}
		var SCENES = {
			/* Labor Day: three pontoons in loose formation, wakes overlapping */
			flotilla: { actors: 3, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.dir = sgn();
					st.boats = [0, 1, 2].map(function (i) {
						return { x: (st.dir > 0 ? -80 : vw + 80) - st.dir * i * 110, y: waterY - 8 - (i % 2) * 10, v: st.dir * rnd(42, 52), ph: rnd(0, TAU), wk: rnd(1, 2) };
					});
				}
				var alive = 0;
				st.boats.forEach(function (b2) {
					b2.x += b2.v * dt; b2.ph += dt * 2;
					b2.wk -= dt;
					if (b2.wk <= 0) { addRipple(b2.x - st.dir * 22, waterY + 2); b2.wk = rnd(1.4, 2.4); }
					if ((st.dir > 0 && b2.x < vw + 90) || (st.dir < 0 && b2.x > -90)) { alive++; }
					dspr('pontoon', b2.x, b2.y + sin(b2.ph) * 2, 40, st.dir > 0, sin(b2.ph) * 0.04);
					if (evening) { /* deck lights */
					cx.save(); cx.globalAlpha = VA; cx.fillStyle = '#FFD43B';
					for (var li = -1; li <= 1; li++) { cx.beginPath(); cx.arc(b2.x + li * 10, b2.y - 10, 1.5, 0, TAU); cx.fill(); }
					cx.restore();
				}
				});
				return alive === 0;
			} },
			/* Fall Fishing: THE full cast — 10 seconds of story */
			fullcast: { actors: 4, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.ph = 0; st.x = rnd(vw * 0.3, vw * 0.7); st.p = 1; st.t2 = 0; }
				st.t2 += dt; st.ph += dt * 3;
				var x = st.x;
				if (st.p === 1) { /* lure arcs in on a line from the top edge */
					var u = mn(1, st.t2 / 1.2);
					var lx = lerp(x - 260, x, easeIO(u)), ly = lerp(-30, waterY, u * u);
					sBeg('#9BA4AD', 1);
					cx.moveTo(lx - 40, 0); cx.quadraticCurveTo(lx - 10, ly * 0.5, lx, ly); sEnd();
					dspr('lure', lx, ly, 16, false, u * 2);
					if (u >= 1) { st.p = 2; st.t2 = 0; addRipple(x, waterY, true); }
				} else if (st.p === 2) { /* bobber settles */
					dspr('bobber', x, waterY - 4 + sin(st.ph) * 2.5, 16);
					lineTo0(x);
					if (st.t2 > 2) { st.p = 3; st.t2 = 0; }
				} else if (st.p === 3) { /* underwater shadow circles in */
					dspr('bobber', x, waterY - 4 + sin(st.ph) * 2, 16);
					lineTo0(x);
					cx.save();
					cx.globalAlpha = VA * 0.28;
					cx.fillStyle = '#20303C';
					var sx = x + cos(st.ph * 0.8) * (60 - st.t2 * 18);
					cx.beginPath(); cx.ellipse(sx, waterY + 8, 26, 6, 0, 0, TAU); cx.fill();
					cx.restore();
					if (st.t2 > 2.5) { st.p = 4; st.t2 = 0; addRipple(x, waterY, true); }
				} else if (st.p === 4) { /* STRIKE — bass leaps, line bends */
					var u2 = mn(1, st.t2 / 1.4);
					var by = waterY - sin(u2 * MT.PI) * 110;
					var bx2 = x + u2 * 30;
					sBeg('#9BA4AD', 1);
					cx.moveTo(bx2 - 40, 0); cx.quadraticCurveTo(bx2 - 60, by * 0.7, bx2, by); sEnd();
					dspr('bass', bx2, by, 46, true, (u2 - 0.5) * 1.6);
					if (st.t2 < 0.3) { for (var dd = 0; dd < 2; dd++) { addRipple(x + rnd(-14, 14), waterY); } }
					if (u2 >= 1) { st.p = 5; st.t2 = 0; addRipple(bx2, waterY, true); }
				} else { /* both exit */
					return st.t2 > 1;
				}
				return false;
				function lineTo0(bx3) {
					sBeg('#9BA4AD', 1);
					cx.moveTo(bx3 - 40, 0); cx.quadraticCurveTo(bx3 - 12, waterY * 0.55, bx3, waterY - 10); sEnd();
				}
			} },
			/* dragonfly lands on the bobber, wings flick twice, departs */
			dragonlands: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.x = rnd(vw * 0.3, vw * 0.7); st.p = 1; st.t2 = 0; st.dx = st.x - 160; st.dy = waterY - 140; }
				st.t2 += dt;
				dspr(st.tgt || 'bobber', st.x, waterY - 4, 16);
				if (st.p === 1) {
					var u = mn(1, st.t2 / 1.6);
					var fx2 = lerp(st.dx, st.x, easeIO(u)), fy = lerp(st.dy, waterY - 18, easeIO(u));
					dspr('dragonfly', fx2, fy, 26, false, sin(st.t2 * 6) * 0.1);
					if (u >= 1) { st.p = 2; st.t2 = 0; }
				} else if (st.p === 2) { /* wings flick twice (scale pulse) */
					var fl = st.t2 < 0.5 || (st.t2 > 1 && st.t2 < 1.5) ? 1 + sin(st.t2 * 25) * 0.15 : 1;
					dspr('dragonfly', st.x, waterY - 18, 26 * fl);
					if (st.t2 > 2.6) { st.p = 3; st.t2 = 0; }
				} else {
					var u3 = mn(1, st.t2 / 1.2);
					dspr('dragonfly', st.x + u3 * 120, waterY - 18 - u3 * 150, 26, true);
					return u3 >= 1;
				}
				return false;
			} },
			/* Halloween: the witch crosses a faint full moon */
			witchmoon: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.mx = rand() < 0.5 ? vw * 0.2 : vw * 0.8; st.my = vh * 0.16; st.t2 = 0; }
				st.t2 += dt;
				var a = st.t2 < 1 ? st.t2 : (st.t2 > 5 ? clamp(6 - st.t2, 0, 1) : 1);
				moonDraw(st.mx, st.my, a);
				if (st.t2 > 1.2 && st.t2 < 4.2) {
					var u = (st.t2 - 1.2) / 3;
					var wx = lerp(st.mx - 140, st.mx + 140, u);
					if (drawable('🧙‍♀️')) { dtxt('🧙‍♀️', wx, st.my + sin(u * 6) * 6, 34, null, VA, -0.12); }
					else { dspr('witchhat', wx, st.my, 30, false, -0.2); }
				}
				return st.t2 > 6;
			} },
			/* Christmas: sleigh crosses high and drops a parachuting gift */
			giftdrop: { actors: 3, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.sx = st.dir > 0 ? -130 : vw + 130; st.gy = -30; st.gd = false; st.t2 = 0; st.ph = 0; st.land = 0; }
				st.t2 += dt; st.ph += dt * 2;
				st.sx += st.dir * 95 * dt;
				var sleighOn = (st.dir > 0 && st.sx < vw + 140) || (st.dir < 0 && st.sx > -140);
				if (sleighOn) { dspr('sleigh', st.sx, vh * 0.14 + sin(st.ph) * 4, 110, st.dir > 0); }
				if (!st.gd && ((st.dir > 0 && st.sx > vw / 2) || (st.dir < 0 && st.sx < vw / 2))) {
					st.gd = true; st.gx = st.sx; st.gy = vh * 0.17;
				}
				if (st.gd && !st.land) {
					st.gy += 55 * dt;
					st.gx += sin(st.ph * 1.4) * 14 * dt;
					var target = waterY - (snowCols ? snowCols[clamp((st.gx / 8) | 0, 0, snowCols.length - 1)] : 0) - 8;
					/* parachute */
					cx.save(); cx.globalAlpha = VA;
					cx.fillStyle = '#E03131';
					cx.beginPath(); cx.arc(st.gx, st.gy - 22, 14, MT.PI, 0); cx.closePath(); cx.fill();
					cx.strokeStyle = '#B8860B'; cx.lineWidth = 1;
					cx.beginPath();
					cx.moveTo(st.gx - 13, st.gy - 21); cx.lineTo(st.gx - 5, st.gy - 6);
					cx.moveTo(st.gx + 13, st.gy - 21); cx.lineTo(st.gx + 5, st.gy - 6);
					cx.stroke(); cx.restore();
					dspr('gift', st.gx, st.gy, 20);
					if (st.gy >= target) { st.land = st.t2; }
				} else if (st.land) {
					dspr('gift', st.gx, st.gy, 20);
					if (st.t2 - st.land > 3) { return true; }
				}
				return !sleighOn && !st.gd;
			} },
			/* evening-only: the sleigh silhouette crosses the moon */
			sleighmoon: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.mx = vw * 0.75; st.my = vh * 0.15; st.t2 = 0; }
				st.t2 += dt;
				var a = st.t2 < 1 ? st.t2 : (st.t2 > 5 ? clamp(6 - st.t2, 0, 1) : 1);
				moonDraw(st.mx, st.my, a);
				if (st.t2 > 1 && st.t2 < 4.6) {
					var u = (st.t2 - 1) / 3.6;
					dspr('sleigh', lerp(st.mx - 150, st.mx + 150, u), st.my + sin(u * 5) * 5, 100, true);
				}
				return st.t2 > 6;
			} },
			/* New Year's: cork pop from a corner */
			corkpop: { actors: 3, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.bx = 40; st.by = vh - 40; st.trail = []; }
				st.t2 += dt;
				var tilt = clamp(st.t2 / 0.8, 0, 1) * -0.6;
				dspr('bottle', st.bx, st.by, 18, false, tilt);
				if (st.t2 > 0.9) {
					var u = clamp((st.t2 - 0.9) / 1.4, 0, 1);
					var cxx = st.bx + 14 + u * vw * 0.3;
					var cyy = st.by - 30 - sin(mn(1, u * 1.2) * MT.PI * 0.9) * vh * 0.4;
					if (u < 1) {
						st.trail.push([cxx, cyy]);
						if (st.trail.length > 14) { st.trail.shift(); }
						dspr('cork', cxx, cyy, 10, false, u * 9);
					}
					cx.save(); cx.globalAlpha = VA * 0.8; cx.strokeStyle = '#F783AC'; cx.lineWidth = 1.6;
					cx.beginPath();
					for (var q3 = 0; q3 < st.trail.length; q3++) {
						cx[q3 ? 'lineTo' : 'moveTo'](st.trail[q3][0], st.trail[q3][1] + sin(q3) * 3);
					}
					cx.stroke(); cx.restore();
					if (st.t2 < 1.5) { addRing(st.bx + 12, st.by - 32); }
					if (rand() < dt * 4) { addRing(st.bx + rnd(-4, 10), st.by - rnd(20, 60)); }
				}
				return st.t2 > 5.5;
			} },
			/* Snowbird: flamingo V glides down, lands one by one, departs */
			arrival: { actors: 3, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.t2 = 0;
					var bx4 = rnd(vw * 0.3, vw * 0.7);
					st.birds = [0, 1, 2].map(function (i) {
						return { tx: bx4 + (i - 1) * 56, x: -60 - i * 46, y: vh * 0.1 + i * 24, land: 1.6 + i * 0.8, st2: 1, ph: rnd(0, TAU) };
					});
				}
				st.t2 += dt;
				var g = drawable('🦩') ? '🦩' : null;
				var done = true;
				st.birds.forEach(function (b3) {
					b3.ph += dt * 3;
					if (b3.st2 === 1) {
						done = false;
						var u = clamp(st.t2 / b3.land, 0, 1);
						b3.x = lerp(b3.x0 == null ? (b3.x0 = b3.x) : b3.x0, b3.tx, easeIO(u));
						b3.y = lerp(vh * 0.1, waterY - 12, u * u);
						if (u >= 1) { b3.st2 = 2; addRipple(b3.tx, waterY); }
					} else if (b3.st2 === 2) {
						b3.x = b3.tx; b3.y = waterY - 12 + sin(b3.ph) * 2;
						if (st.t2 > 6) { b3.st2 = 3; addRipple(b3.tx, waterY); }
						done = false;
					} else {
						b3.x += 90 * dt; b3.y -= 70 * dt;
						if (b3.x < vw + 60 && b3.y > -60) { done = false; }
					}
					if (g) { dtxt(g, b3.x, b3.y, 26, null, VA, 0, true); }
					else { dtxt('v', b3.x, b3.y, 22, '#F783AC'); }
				});
				return done;
			} },
			/* shared crosser: sprite walks/paddles across the bottom or water */
			flagfly: flightScene('flagcloth', 3, 42),
			doveflight: flightScene('dove', 3, 34),
			stilts: crosserScene('stilts', 34, 52, 55, 0),
			kayaker: crosserScene('kayak', 48, 0, 60, 1),
			/* Mardi Gras: golden doubloon shower into the water */
			doubloons: { actors: 3, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.t2 = 0; st.corner = rand() < 0.5 ? 0 : vw;
					st.coins = [0, 1, 2, 3, 4, 5].map(function (i) { return { d: i * 0.35, u: 0, tx: rnd(vw * 0.25, vw * 0.75) }; });
				}
				st.t2 += dt;
				var done = true;
				st.coins.forEach(function (c4) {
					var u = clamp((st.t2 - c4.d) / 1.6, 0, 1);
					if (u <= 0) { done = false; return; }
					if (u < 1) {
						done = false;
						var xx = lerp(st.corner, c4.tx, u);
						var yy = lerp(-20, waterY, u) - sin(u * MT.PI) * vh * 0.3;
						dspr('doubloon', xx, yy, 16, false, u * 8);
					} else if (!c4.spl) {
						c4.spl = 1; addRipple(c4.tx, waterY); addRing(c4.tx, waterY - 4);
					}
				});
				return done && st.t2 > 3;
			} },
			/* Valentine's: two swans meet, necks forming a heart */
			swans: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.cxm = vw / 2; }
				st.t2 += dt;
				var u = clamp(st.t2 / 3, 0, 1);
				var gap = lerp(vw * 0.5, 21, easeIO(u));
				var y = waterY - 12 + sin(st.t2 * 2) * 1.5;
				if (st.t2 > 5.5) { gap = 21 + (st.t2 - 5.5) * 60; }
				dspr('swan', st.cxm - gap, y, 34, true);
				dspr('swan', st.cxm + gap, y, 34, false);
				if (u >= 1 && st.t2 < 5.5) {
					dtxt('♥', st.cxm, y - 26 + sin(st.t2 * 3) * 2, 12, '#FA5252', VA * clamp(st.t2 - 3, 0, 1));
					if (rand() < dt) { addRipple(st.cxm + rnd(-20, 20), waterY); }
				}
				return st.t2 > 7.5;
			} },
			/* Strawberry: a falling berry lands neatly in the basket */
			catch1: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.x = rnd(vw * 0.3, vw * 0.7); st.by = -20; st.sq = 1; }
				st.t2 += dt;
				var caught = st.by >= vh - 34;
				if (st.t2 > 1.2 && !caught) {
					st.by += 160 * dt;
					dspr('berry', st.x, st.by, 20, false, st.t2 * 3);
				}
				if (caught && !st.hit) { st.hit = st.t2; }
				if (st.hit) { st.sq = 1 + sin((st.t2 - st.hit) * 12) * 0.12 * MT.exp(-(st.t2 - st.hit) * 3); }
				dspr('basket', st.x, vh - 24, 30 * st.sq);
				return st.hit && st.t2 - st.hit > 2.5;
			} },
			/* Easter: the egg hunt */
			egghunt: { actors: 3, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.gx = [vw * 0.3, vw * 0.5, vw * 0.7].map(function (v) { return v + rnd(-30, 30); }); st.p = 1; st.bx = -30; st.color = '#BFDBFE'; }
				st.t2 += dt;
				/* grass tufts grow */
				st.gx.forEach(function (gx3, i) {
					var gu = clamp((st.t2 - i * 0.3) / 0.8, 0, 1);
					cx.save(); cx.globalAlpha = VA; cx.strokeStyle = '#2F9E44'; cx.lineWidth = 2; cx.lineCap = 'round';
					for (var bl = -2; bl <= 2; bl++) {
						cx.beginPath();
						cx.moveTo(gx3 + bl * 4, vh - 4);
						cx.lineTo(gx3 + bl * 5, vh - 4 - gu * (14 - abs(bl) * 2));
						cx.stroke();
					}
					cx.restore();
				});
				var ex = st.gx[1] + 12;
				var hasEgg = st.p < 4;
				if (st.t2 > 1 && hasEgg) { /* the decorated egg sits behind a tuft */
					cx.save(); cx.globalAlpha = VA; cx.translate(ex, vh - 14);
					PRIMS.egg(cx, { size: 22, color: st.color, color2: '#E64980', deco: 1 }, 1);
					cx.restore();
				}
				if (st.t2 > 2.4 && st.p === 1) { st.p = 2; }
				if (st.p === 2) { /* bunny hops in */
					st.bx += 85 * dt;
					dspr('bunny', st.bx, vh - 18 - abs(sin(st.t2 * 7)) * 16, 26, true);
					if (st.bx >= ex - 22) { st.p = 3; st.sn = st.t2; }
				} else if (st.p === 3) { /* stop, sniff */
					dspr('bunny', st.bx, vh - 18 + sin((st.t2 - st.sn) * 10) * 1.5, 26, true);
					if (st.t2 - st.sn > 1.2) { st.p = 4; }
				} else if (st.p === 4) { /* carry pose, hop off */
					st.bx += 95 * dt;
					dspr('bunnycarry', st.bx, vh - 20 - abs(sin(st.t2 * 7)) * 14, 28, true);
					if (st.bx > vw + 40) { return true; }
				}
				return false;
			} },
			/* Easter: the hatch — wobble, crack ×3, chick pops out */
			hatch: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.x = rnd(vw * 0.35, vw * 0.65); st.p = 1; }
				st.t2 += dt;
				var y = vh - 20;
				if (st.p === 1) {
					var wob = sin(st.t2 * (4 + st.t2 * 3)) * 0.14 * mn(1, st.t2 / 2);
					cx.save(); cx.globalAlpha = VA; cx.translate(st.x, y); cx.rotate(wob);
					PRIMS.egg(cx, { size: 26, color: '#FDE68A', color2: '#7C3AED', deco: 0 }, 1);
					/* crack stages */
					var stg = mn(3, 1 + (st.t2 / 1.2) | 0);
					cx.strokeStyle = '#8A6D1A'; cx.lineWidth = 1.2;
					cx.beginPath();
					if (stg >= 1) { cx.moveTo(-4, -8); cx.lineTo(0, -3); }
					if (stg >= 2) { cx.lineTo(4, -7); cx.lineTo(7, -1); }
					if (stg >= 3) { cx.moveTo(0, -3); cx.lineTo(-2, 3); cx.lineTo(3, 6); }
					cx.stroke();
					cx.restore();
					if (st.t2 > 3.6) { st.p = 2; st.pop2 = st.t2; }
				} else {
					var pu = clamp((st.t2 - st.pop2) / 0.5, 0, 1);
					cx.save(); cx.globalAlpha = VA * (1 - pu * 0.6); cx.translate(st.x, y);
					PRIMS.egg(cx, { size: 26, color: '#FDE68A', color2: '#7C3AED', deco: 0 }, 1);
					cx.restore();
					var wx2 = st.x + (st.t2 - st.pop2) * 70;
					dspr('chick', wx2, y - 12 - sin(mn(1, pu) * MT.PI) * 24 + sin(st.t2 * 10) * 1.5, 18, true);
					if (wx2 > vw + 30) { return true; }
				}
				return false;
			} },
			/* April Fool's: the jester hits the banana peel */
			bananaslip: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.px = rnd(vw * 0.4, vw * 0.65); st.jx = -30; st.p = 1; st.ph = 0; }
				st.t2 += dt; st.ph += dt * 6;
				dspr('peel', st.px, vh - 10, 22);
				if (st.p === 1) {
					st.jx += 90 * dt;
					dspr('jester', st.jx, vh - 22 + sin(st.ph) * 2, 28, true, sin(st.ph) * 0.06);
					if (st.jx >= st.px - 8) { st.p = 2; st.slip = st.t2; }
				} else if (st.p === 2) { /* slip! circling stars */
					var su = clamp((st.t2 - st.slip) / 0.4, 0, 1);
					dspr('jester', st.px + su * 16, vh - 14, 28, true, su * -1.4);
					for (var s4 = 0; s4 < 3; s4++) {
						dtxt('★', st.px + 16 + cos(st.ph + s4 * 2.1) * 16, vh - 34 + sin(st.ph + s4 * 2.1) * 7, 10, '#F1C40F');
					}
					if (st.t2 - st.slip > 1.8) { st.p = 3; }
				} else { /* up and off */
					st.jx += 110 * dt;
					dspr('jester', st.jx, vh - 22, 28, true);
					if (st.jx > vw + 40) { return true; }
				}
				return false;
			} },
			/* Spring: mama duck parade on the water */
			duckparade: { actors: 3, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -140 : vw + 140; st.ph = 0; st.wk = 1; }
				st.ph += dt * 3;
				st.x += st.dir * 42 * dt;
				st.wk -= dt;
				if (st.wk <= 0) { addRipple(st.x - st.dir * 10, waterY + 2); st.wk = rnd(1.2, 2); }
				var duck = drawable('🦆') ? '🦆' : '🐤';
				var chick = drawable('🐥') ? '🐥' : '🐤';
				var flip = st.dir > 0;
				dtxt(duck, st.x, waterY - 8 + sin(st.ph) * 2, 28, null, VA, 0);
				for (var i4 = 1; i4 <= 4; i4++) {
					dtxt(chick, st.x - st.dir * (22 + i4 * 20), waterY - 5 + sin(st.ph + i4) * 2, 15, null, VA, 0);
				}
				if (flip) { /* facing handled by glyph choice being symmetric enough at this size */ }
				return (st.dir > 0 && st.x > vw + 160) || (st.dir < 0 && st.x < -160);
			} },
			/* Spring: dragonfly lands on a lotus */
			dragonlotus: { actors: 2, run: function (st, dt) {
				if (!st.tgt) { st.tgt = 'lilypad'; }
				return SCENES.dragonlands.run.call(this, st, dt);
			} }
		};
		var VIGS = {
			labor_day: ['flotilla'],
			patriot_day: ['flagfly'],
			mlk: ['doveflight'],
			fall_fishing: ['fullcast', 'dragonlands'],
			halloween: ['witchmoon'],
			christmas: ['giftdrop'],
			new_years: ['corkpop'],
			snowbird: ['arrival'],
			mardi_gras: ['stilts', 'doubloons'],
			valentines: ['swans'],
			strawberry: ['catch1'],
			easter: ['egghunt', 'hatch'],
			april_fools: ['bananaslip'],
			spring_canal: ['duckparade', 'kayaker', 'dragonlotus']
		};
		var vigList = (FX.vig && VIGS[themeKey]) ? VIGS[themeKey].slice() : [];
		if (FX.vig && themeKey === 'christmas' && evening) { vigList.push('sleighmoon'); }

		function startVig(name) {
			var sc = SCENES[name];
			if (!sc) { return; }
			var need = sc.actors || 3, freed = 0;
			for (var k = 0; k < parts.length && freed < need; k++) {
				if (!parts[k].dormant) { parts[k].dormant = true; freed++; }
			}
			vig = { name: name, st: { t: 0 }, sc: sc };
		}
		function endVig(t) {
			if (!vig) { return; }
			vig = null;
			for (var k = 0; k < parts.length; k++) {
				if (parts[k].dormant) { parts[k].dormant = false; seed(parts[k]); }
			}
			vigNext = (t || 0) + ((DEBUG && CFG.vigGap) || rnd(90, 150) * 1000);
		}
		function stepVig(dt, t) {
			/* THE showstopper: the real New Year's countdown, wall-clock. */
			if (themeKey === 'new_years' && FX.vig && !countdownDone) {
				var nw = localNow();
				if (nw.getMonth() === 11 && nw.getDate() === 31 && nw.getHours() === 23 && nw.getMinutes() === 59 && nw.getSeconds() >= 50) {
					if (!vig || vig.name !== 'countdown') {
						if (vig) { endVig(t); }
						vig = { name: 'countdown', st: {}, sc: null };
					}
				}
			}
			if (vig && vig.name === 'countdown') {
				var nw2 = localNow();
				var left = nw2.getMonth() === 11 && nw2.getDate() === 31 ? 60 - nw2.getSeconds() : 0;
				if (left > 0 && left <= 10) {
					cx.save();
					cx.font = 'bold 96px sans-serif';
					cx.textAlign = 'center';
					cx.lineWidth = 7;
					cx.strokeStyle = '#7A4E00';
					cx.strokeText(String(left), vw / 2, vh * 0.4);
					cx.fillStyle = '#FFD43B';
					cx.fillText(String(left), vw / 2, vh * 0.4);
					cx.restore();
				} else { /* midnight! triple mega-burst + the year in gold */
					vig.st.after = (vig.st.after || 0) + dt;
					if (!vig.st.boom) { vig.st.boom = 1; fire(t); fire(t); fire(t); nextBurst = t + 800; }
					dtxt(yearText, vw / 2, vh * 0.4, 84, '#FFD43B', mn(1, VA * 1.4) * clamp(3 - vig.st.after, 0, 1));
					if (vig.st.after > 3) { countdownDone = true; endVig(t); }
				}
				return;
			}
			if (vig) {
				if (vig.sc.run(vig.st, dt, t)) { endVig(t); }
				return;
			}
			if (!vigList.length || hero) { return; }
			if (!vigNext) { vigNext = t + ((DEBUG && CFG.vigFirst) || 20000 + rnd(0, 8000)); return; } /* let the page settle */
			if (t >= vigNext) { startVig(pick(vigList)); }
		}

		/* --- Boot + main loop with the degrade ladder. --- */
		applySize();
		for (var i = 0; i < maxParts && pool.length; i++) { parts.push(seed({}, true)); }

		var running = !D.hidden, last = 0, raf = 0;
		var frameAvg = 4, shed = 0;
		function degrade(cost, t) {
			frameAvg = frameAvg * 0.95 + cost * 0.05;
			if (frameAvg <= 8) { return; }
			if (shed === 0) { FX.reflect = false; shed = 1; frameAvg = 4; }
			else if (shed === 1) {
				FX.parallax = false; shed = 2; frameAvg = 4;
				for (var k = 0; k < parts.length; k++) { parts[k].far = false; }
			} else if (shed === 2) { FX.vig = false; vigList = []; if (vig) { endVig(t); } shed = 3; frameAvg = 4; }
		}
		function frame(t) {
			raf = 0;
			if (!running) { return; }
			var t0 = (W.performance && performance.now) ? performance.now() : 0;
			var dt = last ? mn((t - last) / 1000, 0.05) : 0.016;
			last = t;
			cx.clearRect(0, 0, vw, vh);
			drawSnow();
			if (burstMode) {
				if (!nextBurst) { nextBurst = t + 1500; }
				else if (t >= nextBurst) { fire(t); }
				stepBursts(dt);
				drawFlash(dt);
				if (yearFx) {
					yearFx.a -= dt * 0.42;
					yearFx.y -= dt * 12;
					if (yearFx.a <= 0) { yearFx = null; }
					else {
						cx.save();
						cx.globalAlpha = clamp(mn(1, alphaBase * 2.4) * clamp(yearFx.a, 0, 1), 0, 1);
						cx.font = 'bold 46px sans-serif';
						cx.lineWidth = 4;
						cx.strokeStyle = '#7A4E00';
						cx.strokeText(yearText, yearFx.x, yearFx.y);
						cx.fillStyle = sparkCl[0];
						cx.fillText(yearText, yearFx.x, yearFx.y);
						cx.restore();
					}
				}
			}
			var k, p;
			for (k = 0; k < parts.length; k++) {
				p = parts[k];
				if (p.dormant) { continue; }
				repel(p, dt);
				step(p, dt, t);
			}
			/* FAR layer first, then water, then NEAR */
			for (k = 0; k < parts.length; k++) { p = parts[k]; if (!p.dormant && p.far) { drawP(p, t); } }
			stepRipples(dt);
			drawRipples();
			for (k = 0; k < parts.length; k++) {
				p = parts[k];
				if (p.dormant || p.far) { continue; }
				drawP(p, t);
			}
			stepVig(dt, t);
			stepHero(dt, t);
			drawHero(t);
			drawReflections(t);
			if (DEBUG && DBG && W.DCCSeasonsEngine._slow) {
				var until = performance.now() + W.DCCSeasonsEngine._slow;
				while (performance.now() < until) { /* synthetic load for tests */ }
			}
			if (t0) { degrade(performance.now() - t0, t); }
			raf = W.requestAnimationFrame(frame);
		}
		function play() { if (!raf && running) { last = 0; raf = W.requestAnimationFrame(frame); } }
		D.addEventListener('visibilitychange', function () {
			running = !D.hidden && !reduced();
			if (running) { play(); }
		});
		if (mq && mq.addEventListener) {
			mq.addEventListener('change', function () {
				if (reduced()) {
					running = false;
					cv.style.display = 'none';
				} else {
					cv.style.display = '';
					running = !D.hidden;
					play();
				}
			});
		}
		if (DEBUG && DBG) {
			W.DCCSeasonsEngine._state = {
				get fx() { return FX; },
				get parts() { return parts; },
				get live() { var n = 0; for (var k = 0; k < parts.length; k++) { if (!parts[k].dormant) { n++; } } return n; },
				get ripples() { return ripples.length; },
				get cap() { return maxTotal; },
				get vig() { return vig && vig.name; },
				get hero() { return hero && hero.kind; },
				get evening() { return evening; },
				get snowMax() { var m = 0; if (snowCols) { for (var k = 0; k < snowCols.length; k++) { m = mx2(m, snowCols[k]); } } return m; },
				get frameAvg() { return frameAvg; },
				get shed() { return shed; }
			};
		}
		play();
	}

	W.DCCSeasonsEngine = { start: start };
})();
