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
 *  - No snow anywhere (4.2.0, Rob: "it doesn't snow in Florida").
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
		sparkle: '24 24|<g fill="%k"><path d="M9 1c1.2 5 2.4 7 7 8-5 1-6 2.2-7 8-1.2-5-2.4-7-7-8 5-1 6-2.2 7-8Z"/><path d="M18 13c.7 3 1.3 3.7 4 4-2.7.6-3.3 1.3-4 4-.7-3-1.3-3.7-4-4 2.7-.6 3.3-1.3 4-4Z"/></g>',
		fleur: '26 34|<g fill="%a"><path d="M13 1C16 6 16 11 15 14 14 16 14 17 13 19 13 17 12 16 11 14 10 11 10 6 13 1Z"/><path d="M12 19C10 13 6 8.6 3.4 11 1.2 14 3 18 6.4 18 3.6 20 3 24 5.4 26 7.6 27 11 25 12 19Z"/><path d="M14 19C16 13 20 8.6 23 11 25 14 23 18 20 18 22 20 23 24 21 26 18 27 15 25 14 19Z"/></g><rect x="5" y="18.6" width="16" height="3.6" rx="1.4" fill="%f"/><path d="M10 22 16 22 13 32Z" fill="%a"/>',
		clover: '26 30|<g fill="%j"><path id="cv" d="M13 13C13 4.6 3.6 5 5.6 11C2.4 8.4 0.8 15 13 13Z"/><use href="#cv" transform="rotate(90 13 13)"/><use href="#cv" transform="rotate(180 13 13)"/><use href="#cv" transform="rotate(270 13 13)"/></g><path d="M13 14q1.6 8-2 15" fill="none" stroke="%c" stroke-width="1.8"/>',
		orange: '24 27|<circle cx="12" cy="16" r="10" fill="%r"/><path d="M12 6q4-5 9-3.4-2.4 5-8 5Z" fill="%j"/><path d="M12 5V8" stroke="%i" stroke-width="1.8"/><ellipse cx="8" cy="12" rx="2.6" ry="1.8" fill="#FFA94D" opacity=".75" transform="rotate(-40 8 12)"/>',
		banana: '30 24|<path d="M3.4 4q1.4 15 15 17 10 1.2 11-6-2.4 3.4-10 2.4Q7 16 7 3.6Z" fill="%k"/><path d="M5 3.6 3 1l3.6 1.4Zm23 11 2 1.4-2.4 2.4Z" fill="%i"/><path d="M5 5q1.6 12 13 14" fill="none" stroke="#E8C33C" stroke-width="1"/>',
		burger: '30 27|<path d="M2 12a13 9 0 0 1 26 0Z" fill="#E8A83C"/><g fill="%d"><circle cx="10" cy="8" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="21" cy="8" r="1"/></g><path d="M2.6 12h25l-1 3.2H3.6Z" fill="%j"/><rect x="2.4" y="15" width="25" height="5" rx="1.8" fill="#8B5A2B"/><path d="M3 19h24a12 6 0 0 1-24 0Z" fill="#D9963C"/>',
		olive: '30 21|<path d="M2 18q12-2.4 26-14" fill="none" stroke="%c" stroke-width="1.6"/><g fill="%j"><ellipse cx="8" cy="13" rx="4" ry="2.2" transform="rotate(-32 8 13)"/><ellipse cx="15" cy="9" rx="4" ry="2.2" transform="rotate(-32 15 9)"/><ellipse cx="22" cy="6" rx="4" ry="2.2" transform="rotate(-32 22 6)"/><ellipse cx="11" cy="18" rx="3.6" ry="2" transform="rotate(22 11 18)"/><ellipse cx="18" cy="15" rx="3.6" ry="2" transform="rotate(22 18 15)"/></g>',
		tree: '30 34|<circle cx="15" cy="12" r="10" fill="%j"/><circle cx="8" cy="16" r="6" fill="%c"/><circle cx="22" cy="16" r="6" fill="%c"/><rect x="13" y="20" width="4" height="13" rx="1" fill="%i"/>',
		flamingo: '28 40|<ellipse cx="14" cy="25" rx="10" ry="7" fill="%s"/><path d="M8 20q4-4 8-2" fill="none" stroke="%u" stroke-width="2.4" opacity="0.55"/><path d="M17 20q3.4-9-2.6-12.4T6 11" fill="none" stroke="%s" stroke-width="4.2" stroke-linecap="round"/><circle cx="6" cy="10" r="3.4" fill="%s"/><path d="M3.4 11 0.4 14 4.4 13Z" fill="%b"/><circle cx="5.2" cy="9" r="0.9" fill="%g"/><path d="M12 31v7m4.4-7v7" stroke="%u" stroke-width="1.6"/><path d="M9.6 38H14m1 0h4.4" stroke="%u" stroke-width="1.4"/>',
		bat: '38 20|<path d="M19 5.4C21 2.6 23 1.6 26 2.2 25 4 25 5.6 26 6.8 29 4.2 32 3.8 35 5.4 31 6.8 29 9.4 29 13 26 11 24 12 22 14 21 12 20 10 19 10 18 10 17 12 16 14 14 12 12 11 9 13 8.6 9.4 6.6 6.8 3 5.4 6.2 3.8 9.4 4.2 12 6.8 13 5.6 13 4 12 2.2 15 1.6 17 2.6 19 5.4Z" fill="%b"/><path d="M17 3.8 16 0.8 18 2.4Z" fill="%b"/><path d="M21 3.8 22 0.8 20 2.4Z" fill="%b"/><circle cx="17.4" cy="7.2" r="0.9" fill="%e"/><circle cx="20.6" cy="7.2" r="0.9" fill="%e"/>',
		flutes: '30 34|<g fill="%d" stroke="#8A99A8" stroke-width="1.8"><path d="M4 3 11 5 9 14q-1 3-4 2T3 12Z"/><path d="M26 3 19 5l2 9q1 3 4 2t2-4Z"/></g><g fill="%k"><path d="M5 8l5 2-1 5q-1 2-3 1t-2-3Z"/><path d="M25 8l-5 2 1 5q1 2 3 1t2-3Z"/></g><path d="M7 17 9 29m14-12-2 12" stroke="#8A99A8" stroke-width="1.8"/><path d="M5 30h8m3 0h8" stroke="#8A99A8" stroke-width="2"/><g fill="%d" stroke="#8A99A8" stroke-width="1"><circle cx="13" cy="2" r="1.4"/><circle cx="18" cy="1.4" r="1.1"/></g>',
		umbrella: '32 35|<path d="M2 14a14 12 0 0 1 28 0Z" fill="%e"/><path d="M9 14q0-9 4-12a5 5 0 0 1 2.6-.2v12Zm7 0V2a5 5 0 0 1 2.6.2Q23 5 23 14Z" fill="%d"/><path d="M16 14v20" stroke="%p" stroke-width="2.2"/>',
		recycle: '34 34|<g fill="%j"><g id="rc"><rect x="7" y="8" width="14" height="4.4" rx="1.4"/><path d="M20 5 27.5 10.2 20 15.4Z"/></g><use href="#rc" transform="rotate(120 17 17)"/><use href="#rc" transform="rotate(240 17 17)"/></g>',
		hook: '20 30|<path d="M10 1.4v12" stroke="%t" stroke-width="2"/><path d="M10 14q0 9.4-4.2 9.4T2 17" fill="none" stroke="%t" stroke-width="2.2"/><path d="M2 17 4.8 20 1 19Z" fill="%t"/><circle cx="10" cy="2" r="2.2" fill="%h"/>',
		pontoon: '48 30|<path d="M3 21 L45 21 Q47 21 47 24 Q47 27 45 27 L3 27 Q1 27 1 24 Q1 21 3 21 Z" fill="#868E96"/><path d="M4 17 L42 17 L44 21 L2 21 Z" fill="%d"/><path d="M6 6 L36 6 L38 9 L4 9 Z" fill="%e"/><path d="M7 9 L7 17 M35 9 L35 17" stroke="%h" stroke-width="1.6"/><circle cx="21" cy="13" r="2.6" fill="%b"/><path d="M19 16 L23 16 L23 19 L19 19 Z" fill="%m"/><path d="M40 12 L44 12 L44 17 L40 17 Z" fill="%b"/><path d="M42 3 L47 3 L46 5 L47 7 L42 7 Z" fill="%a"/><path d="M42 3 L42 12" stroke="%h" stroke-width="1.2"/>',
		kayak: '52 22|<path d="M2 16q24-7 48 0-24 7-48 0Z" fill="%r"/><circle cx="26" cy="7" r="3" fill="%b"/><path d="M26 10v5" stroke="%b" stroke-width="2"/><line x1="14" y1="2" x2="38" y2="14" stroke="%p" stroke-width="2"/><ellipse cx="13" cy="2" rx="3" ry="2" fill="%a" transform="rotate(28 13 2)"/><ellipse cx="39" cy="14" rx="3" ry="2" fill="%a" transform="rotate(28 39 14)"/>',
		bobber: '24 30|<line x1="12" y1="0" x2="12" y2="4" stroke="%h" stroke-width="2"/><circle cx="12" cy="16" r="11" fill="%d"/><path d="M1 16a11 11 0 0 1 22 0Z" fill="%e"/><circle cx="12" cy="16" r="11" fill="none" stroke="%b" stroke-width="1"/><circle cx="12" cy="4" r="2" fill="%b"/>',
		tacklebox: '32 26|<rect x="2" y="9" width="28" height="15" rx="2" fill="%c"/><rect x="2" y="9" width="28" height="5" fill="#237032"/><path d="M12 9V6a4 4 0 0 1 8 0v3h-3V6a1 1 0 0 0-2 0v3Z" fill="%h"/><rect x="14" y="11" width="5" height="4" rx="1" fill="%a"/>',
		lure: '30 20|<path d="M5 9.6 L1 5.6 Q0.2 4 2 4.2 L6.6 7.4 Z" fill="%o"/><ellipse cx="13" cy="10" rx="8.4" ry="4.8" fill="%e"/><path d="M4.8 9.6 Q13 5.4 21.2 9.6 Q13 8.6 4.8 9.6 Z" fill="%d"/><path d="M21.4 10 L28.6 6.2 L27.2 10 L28.6 13.8 Z" fill="%e"/><circle cx="7.6" cy="8.4" r="1.6" fill="%d"/><circle cx="7.6" cy="8.4" r="0.85" fill="#111"/><path d="M11 14.6 V17 Q11 18.8 12.8 18.8" stroke="%h" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M18.6 14.4 V16.8 Q18.6 18.6 20.4 18.6" stroke="%h" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
		bass: '48 26|<path d="M6 13q12-10 28-8l10-4-3 8 3 8-10-4q-16 2-28-8Z" fill="#37633F"/><path d="M8 13q11-7 26-6-13 12-26 6Z" fill="#5C8A54"/><path d="M20 3q6-3 10 0l-4 4Z" fill="#37633F"/><path d="M22 22q5 3 9 1l-4-5Z" fill="#37633F"/><circle cx="12" cy="11" r="2" fill="#111"/><path d="M6 13q3 3 7 3" fill="none" stroke="#2F4F35" stroke-width="1"/>',
		/* 4.2.0 — the jumping-bass hero, drawn: a largemouth mid-leap, mouth open. */
		bassleap: '76 44|<path d="M12 22Q24 6 44 10Q58 12 62 18L73 9L70 22L73 35L62 26Q54 33 40 33Q22 34 12 24Z" fill="#5C940D"/><path d="M14 24Q26 32 42 31Q54 30 60 25Q48 27 36 26Q24 25 14 24Z" fill="#E9FAC8"/><path d="M20 20Q30 16 38 20Q46 18 54 21Q46 23 38 22Q30 24 20 20Z" fill="#2B8A3E" opacity=".75"/><path d="M28 10L34 2L40 9L46 4L50 12Z" fill="#2B8A3E"/><path d="M38 31L42 38L46 31Z" fill="#2B8A3E"/><path d="M13 21L4 15Q6 14 12 18Z" fill="#5C940D"/><path d="M13 21L4 15Q3 21 6 27L13 24Z" fill="#7A1E1E"/><path d="M13 24L6 27Q9 29 14 26Z" fill="#E9FAC8"/><circle cx="18" cy="17" r="2.6" fill="#FFD43B"/><circle cx="18" cy="17" r="1.4" fill="%g"/><path d="M22 14Q24 20 22 25" stroke="#2B8A3E" stroke-width="1.2" fill="none"/>',
		/* 4.2.0 — Florida Keys boat: an aluminium jon boat with a small outboard. */
		jonboat: '58 22|<path d="M3 10H50L55 14L52 20H6Z" fill="#9AA5B1"/><path d="M3 10H50L52 12H4Z" fill="#C3CBD3"/><path d="M8 14H48" stroke="#7D8894" stroke-width="1"/><rect x="18" y="6" width="10" height="4" fill="#5C940D"/><path d="M52 10L52 3Q52 1 54 1H56L56 16H54" fill="#343A40"/><path d="M55 16L56 21" stroke="#343A40" stroke-width="1.6"/>',
		lilypad: '36 22|<path d="M31.9 7 A16 8 0 1 0 33 13.7 L18 11 Z" fill="%c"/><path d="M18 11 L4 8 M18 11 L5 14 M18 11 L11 18 M18 11 L20 18 M18 11 L19 3 M18 11 L28 4" stroke="#237032" stroke-width="0.9" fill="none"/><circle cx="10" cy="7" r="3" fill="%s"/><circle cx="10" cy="7" r="1.1" fill="#FDE68A"/>',
		sabalpalm: '34 38|<path d="M14 38 L15 20 L19 20 L20 38 Z" fill="%p"/><path d="M14.6 25 L19.4 25 M14.4 30 L19.6 30 M14.2 35 L19.8 35" stroke="%i" stroke-width="1.1" fill="none"/><g fill="%c"><path id="fr" d="M17 19 L12.4 7.6 L14.6 10.4 L15.6 4.6 L17 8.6 L18.4 4.6 L19.4 10.4 L21.6 7.6 Z"/><use href="#fr" transform="rotate(30 17 19)"/><use href="#fr" transform="rotate(-30 17 19)"/><use href="#fr" transform="rotate(60 17 19)"/><use href="#fr" transform="rotate(-60 17 19)"/><use href="#fr" transform="rotate(88 17 19)"/><use href="#fr" transform="rotate(-88 17 19)"/><use href="#fr" transform="rotate(112 17 19)"/><use href="#fr" transform="rotate(-112 17 19)"/></g><g fill="%j"><path id="fs" d="M17 19 L14 10.6 L15.6 12.6 L17 8.6 L18.4 12.6 L20 10.6 Z"/><use href="#fs" transform="rotate(45 17 19)"/><use href="#fs" transform="rotate(-45 17 19)"/><use href="#fs" transform="rotate(74 17 19)"/><use href="#fs" transform="rotate(-74 17 19)"/></g><circle cx="17" cy="19" r="2.4" fill="%i"/>',
		hibiscus: '30 30|<g fill="%e"><path id="pt" d="M15 16 C8.6 13.6 7 6 15 3 C23 6 21.4 13.6 15 16 Z"/><use href="#pt" transform="rotate(72 15 16)"/><use href="#pt" transform="rotate(144 15 16)"/><use href="#pt" transform="rotate(216 15 16)"/><use href="#pt" transform="rotate(288 15 16)"/></g><circle cx="15" cy="16" r="3.6" fill="%n"/><path d="M8.6 23 Q3 26.6 6 29 Q11 27.6 11.6 23.6 Z" fill="%j"/><path d="M15 16 L26.4 5.2" stroke="%k" stroke-width="1.8" fill="none"/><g fill="%a"><circle cx="21.6" cy="9.6" r="1"/><circle cx="23.6" cy="8" r="1.1"/><circle cx="25.4" cy="6.2" r="1.1"/></g><circle cx="26.6" cy="4.6" r="1.7" fill="%k"/><g fill="%u"><circle cx="25.6" cy="3.2" r="0.8"/><circle cx="27.6" cy="2.8" r="0.8"/><circle cx="28.4" cy="4.8" r="0.8"/></g>',
		petal: '18 22|<path d="M9 1 Q15.4 6.4 15 13 Q14.6 18.6 10.6 20.4 Q9.6 19.6 9 18.6 Q8.4 19.6 7.4 20.4 Q3.4 18.6 3 13 Q2.6 6.4 9 1 Z" fill="%s"/><path d="M9 4 L9 17" stroke="%u" stroke-width="1" fill="none"/><path d="M9 9.4 Q12.2 12 12.6 15.6 M9 9.4 Q5.8 12 5.4 15.6" stroke="%u" stroke-width="0.8" fill="none"/>',
		dragonfly: '40 26|<g fill="#9CCBEF" opacity="0.85"><ellipse cx="14" cy="7" rx="8" ry="2.6" transform="rotate(-14 14 7)"/><ellipse cx="14" cy="19" rx="8" ry="2.6" transform="rotate(14 14 19)"/><ellipse cx="20.4" cy="8.6" rx="6.6" ry="2.2" transform="rotate(-8 20 8.6)"/><ellipse cx="20.4" cy="17.4" rx="6.6" ry="2.2" transform="rotate(8 20 17)"/></g><path d="M11 13 38 13" stroke="#1864AB" stroke-width="2.6" stroke-linecap="round"/><g stroke="#74C0FC" stroke-width="1"><path d="M23 12v2.8M27 12v2.4M31 12v2M35 12v2"/></g><ellipse cx="11" cy="13" rx="4.2" ry="3.4" fill="#1864AB"/><circle cx="6.4" cy="13" r="3.6" fill="#1864AB"/><circle cx="5.2" cy="11.6" r="1.4" fill="#74C0FC"/>',
		/* — birds & wildlife — */
		manatee: '92 48|<path d="M69 17 Q88 9.6 89 25 Q88 40.4 69 33 Z" fill="#7B8794"/><path d="M13 25 Q13 9 40 9 Q64 9 71 20 L71 30 Q64 41 40 41 Q13 41 13 25 Z" fill="#8D99A6"/><ellipse cx="14" cy="28" rx="8" ry="6.5" fill="#7B8794"/><circle cx="10" cy="25.6" r="1.2" fill="%b"/><circle cx="14.4" cy="25.2" r="1.2" fill="%b"/><circle cx="21" cy="19" r="1.4" fill="%b"/><path d="M28 40 Q32 48 41 44 Z" fill="#7B8794"/><path d="M48 41 Q52 47 59 44 Z" fill="#7B8794"/><path d="M30 15 Q44 12 58 15" stroke="#7B8794" stroke-width="1.2" fill="none"/>',
		dove: '46 34|<path d="M8 15q2-7 11-6 8 2 13 7l12 2-9 5 3 7-10-6q-9 3-16-3T8 15Z" fill="%d" stroke="#5A6B7C" stroke-width="2.8"/><path d="M19 15q6-10 14-9-2 7-6 11-4 3-8-2Z" fill="%q" stroke="#5A6B7C" stroke-width="2.4"/><path d="M7 14 2 16l5 2Z" fill="%a"/><circle cx="11" cy="13" r="1.4" fill="%g"/><ellipse cx="6" cy="21" rx="2.2" ry="1.2" fill="%c" transform="rotate(-25 6 21)"/><ellipse cx="10" cy="22" rx="2.2" ry="1.2" fill="%c" transform="rotate(-25 10 22)"/>',
		/* 4.2.0 — the eagle hero, drawn as a two-frame wingbeat (July 4 and Patriot Day). */
		eagleup: '110 60|<ellipse cx="58" cy="38" rx="22" ry="9" fill="#3E2716"/><path d="M76 35L95 30L96 44L76 41Z" fill="#F8F9FA" stroke="#CED4DA" stroke-width="1"/><path d="M48 36Q52 14 70 2L70 8L76 4L74 11L80 9L74 16Q66 26 62 38Z" fill="#4E3019"/><path d="M34 29Q44 28 46 37Q42 42 34 42Z" fill="#F8F9FA"/><ellipse cx="33" cy="34" rx="11" ry="8" fill="#F8F9FA"/><path d="M23 30Q15 30 13 35Q13 39 16 39Q16 36 19 36L24 37Z" fill="#FCC419" stroke="#E67700" stroke-width=".8"/><path d="M27 31L33 30.4" stroke="%b" stroke-width="1.3"/><circle cx="29.5" cy="32.6" r="1.5" fill="%g"/>',
		eagledown: '110 60|<ellipse cx="58" cy="30" rx="22" ry="9" fill="#3E2716"/><path d="M76 27L95 22L96 36L76 33Z" fill="#F8F9FA" stroke="#CED4DA" stroke-width="1"/><path d="M48 30Q54 46 66 58L67 52L72 57L71 50L77 53L73 46Q66 38 62 30Z" fill="#4E3019"/><path d="M34 21Q44 20 46 29Q42 34 34 34Z" fill="#F8F9FA"/><ellipse cx="33" cy="26" rx="11" ry="8" fill="#F8F9FA"/><path d="M23 22Q15 22 13 27Q13 31 16 31Q16 28 19 28L24 29Z" fill="#FCC419" stroke="#E67700" stroke-width=".8"/><path d="M27 23L33 22.4" stroke="%b" stroke-width="1.3"/><circle cx="29.5" cy="24.6" r="1.5" fill="%g"/>',
		/* 4.2.0 — Florida Keys hero: an osprey carrying a fish, two-frame wingbeat.
		 * The -nf frames are the same bird before the catch (the osprey scene). */
		ospreyup: '92 50|<path d="M42 24Q50 8 58 6Q70 2 86 4L82 7L88 9L81 11L86 14L76 14Q64 14 56 26Z" fill="#5C4033"/><path d="M50 16Q58 10 66 9" stroke="#8C6E5A" stroke-width="2" fill="none"/><ellipse cx="46" cy="27" rx="17" ry="6.5" fill="#F8F9FA"/><path d="M60 24L74 21L75 30L60 30Z" fill="#6B5446"/><circle cx="29" cy="24" r="6.2" fill="#F8F9FA"/><path d="M24 23L36 22L40 26L28 26Z" fill="#3B2A20"/><path d="M23.5 22.5Q19 23 19 27Q21 25.5 24 26Z" fill="#23272E"/><circle cx="27" cy="23.4" r="1.1" fill="#FCC419"/><path d="M42 33l-2 5m5-5l0 5" stroke="#ADB5BD" stroke-width="1.6"/><path d="M34 40Q40 36 48 38Q52 39 53 41L57 38L56 42L57 46L53 43Q49 45 42 44Q36 43 34 40Z" fill="#8FA3B3"/><path d="M36 40Q44 40 52 41" stroke="#5C6F80" stroke-width="1" fill="none"/>',
		ospreydown: '92 58|<ellipse cx="46" cy="21" rx="17" ry="6.5" fill="#F8F9FA"/><path d="M42 20Q50 36 60 44Q70 52 84 54L80 50L86 49L79 46L84 43L74 42Q64 36 56 20Z" fill="#5C4033"/><path d="M60 18L74 15L75 24L60 24Z" fill="#6B5446"/><circle cx="29" cy="18" r="6.2" fill="#F8F9FA"/><path d="M24 17L36 16L40 20L28 20Z" fill="#3B2A20"/><path d="M23.5 16.5Q19 17 19 21Q21 19.5 24 20Z" fill="#23272E"/><circle cx="27" cy="17.4" r="1.1" fill="#FCC419"/><path d="M42 27l-2 5m5-5l0 5" stroke="#ADB5BD" stroke-width="1.6"/><path d="M34 34Q40 30 48 32Q52 33 53 35L57 32L56 36L57 40L53 37Q49 39 42 38Q36 37 34 34Z" fill="#8FA3B3"/><path d="M36 34Q44 34 52 35" stroke="#5C6F80" stroke-width="1" fill="none"/>',
		ospreyupnf: '92 50|<path d="M42 24Q50 8 58 6Q70 2 86 4L82 7L88 9L81 11L86 14L76 14Q64 14 56 26Z" fill="#5C4033"/><path d="M50 16Q58 10 66 9" stroke="#8C6E5A" stroke-width="2" fill="none"/><ellipse cx="46" cy="27" rx="17" ry="6.5" fill="#F8F9FA"/><path d="M60 24L74 21L75 30L60 30Z" fill="#6B5446"/><circle cx="29" cy="24" r="6.2" fill="#F8F9FA"/><path d="M24 23L36 22L40 26L28 26Z" fill="#3B2A20"/><path d="M23.5 22.5Q19 23 19 27Q21 25.5 24 26Z" fill="#23272E"/><circle cx="27" cy="23.4" r="1.1" fill="#FCC419"/><path d="M42 33l-2 5m5-5l0 5" stroke="#ADB5BD" stroke-width="1.6"/>',
		ospreydownnf: '92 58|<ellipse cx="46" cy="21" rx="17" ry="6.5" fill="#F8F9FA"/><path d="M42 20Q50 36 60 44Q70 52 84 54L80 50L86 49L79 46L84 43L74 42Q64 36 56 20Z" fill="#5C4033"/><path d="M60 18L74 15L75 24L60 24Z" fill="#6B5446"/><circle cx="29" cy="18" r="6.2" fill="#F8F9FA"/><path d="M24 17L36 16L40 20L28 20Z" fill="#3B2A20"/><path d="M23.5 16.5Q19 17 19 21Q21 19.5 24 20Z" fill="#23272E"/><circle cx="27" cy="17.4" r="1.1" fill="#FCC419"/><path d="M42 27l-2 5m5-5l0 5" stroke="#ADB5BD" stroke-width="1.6"/>',
		/* 4.2.0 — Central Florida cast for the Keys. */
		ibis: '70 30|<path d="M28 13Q36 2 50 1L47 4L52 5L46 7L50 9L42 10Q37 13 36 16Z" fill="#F8F9FA" stroke="#CED4DA" stroke-width=".6"/><path d="M47 1.6L52 5L46 7L50 9L45 9.6Z" fill="#23272E"/><ellipse cx="34" cy="16" rx="12" ry="5" fill="#F8F9FA" stroke="#CED4DA" stroke-width=".6"/><path d="M24 15L12 13" stroke="#F8F9FA" stroke-width="3" stroke-linecap="round"/><ellipse cx="10" cy="12.6" rx="3.2" ry="2.8" fill="#FFA8A8"/><path d="M8 12Q3 12.6 1 17Q4 14.6 8 13.8Z" fill="#FF6B6B"/><circle cx="10.2" cy="11.8" r=".8" fill="#74C0FC"/><path d="M45 17L66 20M45 18L65 22" stroke="#FF8787" stroke-width="1.3"/>',
		anhingaswim: '56 30|<path d="M20 27Q34 22 54 26L54 28H18Z" fill="#23272E"/><path d="M22 26Q18 16 22 10Q26 4 20 3" stroke="#23272E" stroke-width="3.2" fill="none" stroke-linecap="round"/><ellipse cx="18" cy="3.6" rx="3.4" ry="2.4" fill="#3A3F47"/><path d="M15 3.4L3 4.6L15 5Z" fill="#C9A227"/><circle cx="18.4" cy="3.2" r=".9" fill="#E03131"/>',
		anhingadry: '76 70|<path d="M36 70L37 52Q30 46 26 44L28 42Q33 45 38 48L40 38L43 38L41 52L44 70Z" fill="#6B5B4B"/><g fill="#23272E"><path d="M33 28L6 20L2 26L7 27L3 31L9 31L6 35L12 34L10 38L33 36Z"/><path d="M43 28L70 20L74 26L69 27L73 31L67 31L70 35L64 34L66 38L43 36Z"/><ellipse cx="38" cy="33" rx="6" ry="11"/><path d="M36 42L32 52L44 52L40 42Z"/></g><g fill="#DEE2E6" opacity=".85"><path d="M30 29L14 25L15 27L30 31ZM30 32L17 29L18 31L30 34Z"/><path d="M46 29L62 25L61 27L46 31ZM46 32L59 29L58 31L46 34Z"/></g><path d="M37 24Q33 18 36 12Q38 8 34 6" stroke="#23272E" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="33" cy="6" rx="3.2" ry="2.3" fill="#3A3F47"/><path d="M30.4 5.6L20 7L30.6 7.6Z" fill="#C9A227"/><circle cx="33.4" cy="5.6" r=".9" fill="#E03131"/><path d="M37 44l-2 4h4Z" fill="#6B5B4B"/>',
		snag: '76 70|<path d="M36 70L37 52Q30 46 26 44L28 42Q33 45 38 48L40 38L43 38L41 52L44 70Z" fill="#6B5B4B"/><path d="M37 44l-2 4h4Z" fill="#6B5B4B"/>',
		crane: '44 70|<path d="M20 44L18 68M26 44L27 68" stroke="#495057" stroke-width="1.8"/><path d="M14 30Q20 22 32 26Q42 30 40 40Q36 46 26 45Q16 44 14 36Z" fill="#9AA2AA"/><path d="M30 28Q40 30 42 42Q36 38 32 38Z" fill="#7B838B"/><path d="M16 32Q12 18 14 8" stroke="#A8B0B8" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="13" cy="7" rx="4.2" ry="3.6" fill="#A8B0B8"/><path d="M10.5 4.5Q13 2 15.5 4.5L14 6.5L11 6.5Z" fill="#E03131"/><path d="M9.5 7L1 9L9.6 9.2Z" fill="#343A40"/><path d="M11 8.5Q13 10 16 9" stroke="#F8F9FA" stroke-width="1.4" fill="none"/><circle cx="12.4" cy="6.4" r=".8" fill="#FAB005"/>',
		cranedance: '64 70|<path d="M30 46L26 60M36 46L40 58" stroke="#495057" stroke-width="1.8"/><path d="M26 32Q30 26 38 28Q46 32 44 42Q40 48 32 47Q24 46 24 38Z" fill="#9AA2AA"/><path d="M30 30Q20 14 4 8L8 14L2 16L10 20L6 24L16 26L28 36Z" fill="#8A929A"/><path d="M40 30Q48 14 62 8L58 14L64 16L56 20L60 24L50 26L40 36Z" fill="#9AA2AA"/><path d="M28 32Q22 22 20 12" stroke="#A8B0B8" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="19" cy="11" rx="4.2" ry="3.6" fill="#A8B0B8"/><path d="M16.5 8.5Q19 6 21.5 8.5L20 10.5L17 10.5Z" fill="#E03131"/><path d="M15.5 11L7 12.5L15.6 13.2Z" fill="#343A40"/><circle cx="18.4" cy="10.4" r=".8" fill="#FAB005"/>',
		limpkin: '46 56|<path d="M22 38L20 54M28 38L30 54" stroke="#6C5B4B" stroke-width="1.8"/><path d="M14 24Q22 18 34 22Q44 26 42 34Q38 40 28 39Q16 38 14 30Z" fill="#6F4E37"/><g fill="#F1E3C8"><circle cx="22" cy="26" r=".9"/><circle cx="27" cy="24" r=".9"/><circle cx="31" cy="28" r=".9"/><circle cx="36" cy="27" r=".9"/><circle cx="25" cy="31" r=".9"/><circle cx="33" cy="33" r=".9"/><circle cx="19" cy="29" r=".9"/></g><path d="M17 26Q13 16 14 9" stroke="#7A5A42" stroke-width="3.4" fill="none" stroke-linecap="round"/><ellipse cx="13.6" cy="8" rx="3.6" ry="3" fill="#7A5A42"/><path d="M11 7Q5 8 1 12Q6 10 11 9.2Z" fill="#C9A227"/><circle cx="13" cy="7.4" r=".8" fill="#23272E"/><g fill="#F1E3C8"><circle cx="14" cy="12" r=".7"/><circle cx="15" cy="16" r=".7"/></g>',
		applesnail: '16 14|<path d="M2 12Q1 4 8 2Q15 2 15 8Q15 13 9 13Z" fill="#8C6A3F"/><path d="M8 5Q12 5 12 8.5Q12 11 9 11Q6 11 6 8.5Q6 6.8 8 6.8" stroke="#5E4526" stroke-width="1.2" fill="none"/><path d="M4 6Q6 4 8 4" stroke="#B08A55" stroke-width="1" fill="none"/>',
		snaileggs: '10 30|<path d="M5 30V2" stroke="#6B8E4E" stroke-width="1.6"/><g fill="#F783AC"><circle cx="5" cy="10" r="2"/><circle cx="3.6" cy="12.6" r="2"/><circle cx="6.4" cy="12.8" r="2"/><circle cx="5" cy="15.4" r="2"/><circle cx="3.8" cy="18" r="1.8"/><circle cx="6.2" cy="18" r="1.8"/></g>',
		/* 4.2.0 — Summer on the Canal scenes. */
		gator: '90 20|<path d="M2 14Q6 10 14 11L30 10Q36 6 40 10L44 12Q60 11 88 15L88 17H2Z" fill="#3F5A2A"/><g fill="#2F4420"><path d="M50 12l3-3 3 3ZM58 12.5l3-3 3 3ZM66 13l3-3 3 3ZM74 13.6l3-2.6 3 3Z"/></g><circle cx="7" cy="12" r="1" fill="#1B2512"/><ellipse cx="35" cy="8.4" rx="3.2" ry="2.6" fill="#556B2F"/><circle cx="35.6" cy="8" r="1.3" fill="#E6C229"/><path d="M35.6 7v2" stroke="%g" stroke-width=".7"/>',
		mullet: '34 14|<path d="M3 7Q10 1 22 3Q27 4 28 7L33 2L32 7L33 12L28 7Q27 10 22 11Q10 13 3 7Z" fill="#CED4DA" stroke="#495057" stroke-width=".8"/><path d="M3.5 6.5Q10 1.4 22 3.2Q26 4 28 6.5Q18 6 8 6.6Z" fill="#5C6B55"/><path d="M8 8Q16 9.5 26 8" stroke="#868E96" stroke-width="1" fill="none"/><circle cx="7" cy="6" r="1.1" fill="%g"/>',
		swan: '44 38|<path d="M9 26 Q9 17 20 16 Q32 15 39 21 Q34 32 21 33 Q11 33 9 26 Z" fill="%d" stroke="#7D8B99" stroke-width="1.4" stroke-linejoin="round"/><path d="M16 21 Q26 17 35 22 Q28 29 18 27 Z" fill="%q" stroke="#7D8B99" stroke-width="1.2"/><path d="M19 18 Q11 14 13 8 Q15 2.6 22 3.4 Q27.6 4.2 28 9 L24.6 9 Q24.2 7 21.6 6.6 Q17.6 6.2 16.6 9.6 Q15.6 14 22.4 16.4 Z" fill="%d" stroke="#7D8B99" stroke-width="1.2"/><circle cx="26" cy="8" r="3.4" fill="%d" stroke="#7D8B99" stroke-width="1.2"/><path d="M29 8 L34 9.6 L29 11 Z" fill="%r"/><circle cx="27" cy="6.8" r="0.9" fill="%g"/>',
		ladybug: '24 20|<ellipse cx="14" cy="11" rx="8.4" ry="7" fill="%e"/><path d="M14 4v14" stroke="%g" stroke-width="1.2"/><g fill="%g"><circle cx="10.6" cy="8.4" r="1.4"/><circle cx="17.4" cy="8.4" r="1.4"/><circle cx="10.2" cy="13.4" r="1.4"/><circle cx="17.8" cy="13.4" r="1.4"/></g><circle cx="7" cy="8" r="4" fill="%g"/><path d="M5.4 4.6Q3.4 1.6 1.6 2.4M8.2 4.2Q7.6 1 5.6 0.8" fill="none" stroke="%g" stroke-width="1"/><circle cx="5.6" cy="6.6" r="0.8" fill="%d"/>',
		turkey: '40 36|<path d="M20 20 8 4q-3 8 4 14Zm0 0 4-18q6 4 3 14Zm0 0 12-14q4 8-5 15Z" fill="#A05A2C"/><ellipse cx="20" cy="25" rx="10" ry="9" fill="%i"/><circle cx="12" cy="18" r="5" fill="%i"/><circle cx="11" cy="17" r="1" fill="#111"/><path d="M8 18l-4 1 4 2Z" fill="%a"/><path d="M9 20q-2 3 0 5" stroke="%e" stroke-width="2" fill="none"/><line x1="17" y1="33" x2="17" y2="36" stroke="%f" stroke-width="2"/><line x1="23" y1="33" x2="23" y2="36" stroke="%f" stroke-width="2"/>',
		chick: '20 20|<circle cx="10" cy="12" r="7" fill="%k"/><circle cx="7" cy="6" r="4" fill="#FFE066"/><circle cx="6" cy="5" r=".9" fill="#111"/><path d="M3 6 .4 7l2 1Z" fill="%w"/><path d="M14 12q4-1 4 2-3 2-5 0Z" fill="#FAB005"/><line x1="8" y1="19" x2="8" y2="20" stroke="%w" stroke-width="1"/><line x1="12" y1="19" x2="12" y2="20" stroke="%w" stroke-width="1"/>',
		bunny: '32 30|<g fill="%q" stroke="#7A8290" stroke-width="1.8" stroke-linejoin="round"><path d="M9.6 13C7 7.4 8.4 2.6 11 3 13 3.4 14 8.4 12 14Z"/><path d="M14 13C13 6.8 16 3 18 4.4 20 5.8 19 10 17 13Z"/><path d="M23 26C27 26 29 22 28 18 27 14 23 11 18 11 14 11 11 12 9.4 14 7.2 13 5.2 14 4.6 16 4 19 5.4 20 7.6 21 7.4 23 9.6 26 13 26Z"/></g><circle cx="7.6" cy="17.4" r="1.4" fill="%g"/><path d="M5 19Q3.2 20 5 21" fill="none" stroke="#7A8290" stroke-width="1"/><path d="M28 20Q31 19 31 22 30 25 27 24" fill="%q" stroke="#7A8290" stroke-width="1.6"/>',
		bunnycarry: '32 32|<ellipse cx="11" cy="7" rx="2.6" ry="6" fill="%q" stroke="%t" stroke-width="1.6"/><ellipse cx="17" cy="6.4" rx="2.6" ry="6" fill="%q" stroke="%t" stroke-width="1.6"/><ellipse cx="18" cy="20" rx="11" ry="8" fill="%q" stroke="%t" stroke-width="1.6"/><circle cx="28.4" cy="18.4" r="2.8" fill="%q" stroke="%t" stroke-width="1.4"/><circle cx="10.4" cy="15.6" r="6" fill="%q" stroke="%t" stroke-width="1.6"/><circle cx="7.8" cy="14.6" r="1.1" fill="#212529"/><ellipse cx="15.4" cy="27" rx="4.2" ry="4.8" fill="%l"/><path d="M11.4 26 h8 M11.6 28.6 h7.6" stroke="%q" stroke-width="1.3"/><path d="M11.4 21.6 Q12.8 25.6 15.8 26.4" stroke="%t" stroke-width="2" fill="none" stroke-linecap="round"/>',
		/* — fall leaves: maple, oak, cypress, sweetgum — */
		leafm: '26 30|<path d="M13 2 L16 8 L21 5 L19 11 L25 10 L20 15 L24 18 L17 19 L15 22 L11 22 L9 19 L2 18 L6 15 L1 10 L7 11 L5 5 L10 8 Z" fill="%r"/><path d="M13 29 L13 20" stroke="#8B4513" stroke-width="1.6" fill="none"/><path d="M13 21 L13 6 M13 12 L19 8 M13 12 L7 8 M13 17 L20 15 M13 17 L6 15" stroke="#C44D0B" stroke-width="1" fill="none"/>',
		leafo: '22 30|<path d="M11 1 Q14 3 13.6 5.4 Q17 5 17.6 7.6 Q20 9 18.6 11.4 Q21 13 19 15.4 Q21 17.6 18.6 19.4 Q19.6 22.4 16.6 23 Q15.6 26 12.6 25.6 L11.6 29 L10.4 29 L9.4 25.6 Q6.4 26 5.4 23 Q2.4 22.4 3.4 19.4 Q1 17.6 3 15.4 Q1 13 3.4 11.4 Q2 9 4.4 7.6 Q5 5 8.4 5.4 Q8 3 11 1 Z" fill="#A0622D"/><path d="M11 4 L11 27" stroke="#6F4E37" stroke-width="1.2" fill="none"/><path d="M11 9 L6 7 M11 9 L16 7 M11 14 L5 12 M11 14 L17 12 M11 19 L6 18 M11 19 L16 18" stroke="#6F4E37" stroke-width="0.9" fill="none"/>',
		leafc: '20 30|<path d="M10 29 L10 3" stroke="#8B4513" stroke-width="1.6" fill="none"/><g fill="#C97B3D"><ellipse cx="10" cy="4" rx="2.6" ry="3.4"/><ellipse cx="5" cy="8" rx="4.4" ry="2.4" transform="rotate(-24 5 8)"/><ellipse cx="15" cy="8" rx="4.4" ry="2.4" transform="rotate(24 15 8)"/><ellipse cx="4" cy="14" rx="5" ry="2.6" transform="rotate(-20 4 14)"/><ellipse cx="16" cy="14" rx="5" ry="2.6" transform="rotate(20 16 14)"/><ellipse cx="5" cy="20" rx="4.4" ry="2.4" transform="rotate(-16 5 20)"/><ellipse cx="15" cy="20" rx="4.4" ry="2.4" transform="rotate(16 15 20)"/></g>',
		leafs: '26 28|<path d="M13 1 L17 4 L16 6 L20 7 L18 10 L22 11 L20 14 L23 16 L19 18 L21 21 L16 21 L15 24 L13 22 L11 24 L10 21 L5 21 L7 18 L3 16 L6 14 L4 11 L8 10 L6 7 L10 6 L9 4 Z" fill="#B23A48"/><path d="M13 27 L13 22" stroke="#8B4513" stroke-width="1.6" fill="none"/><path d="M13 22 L13 3 M13 8 L18 7 M13 8 L8 7 M13 13 L20 12 M13 13 L6 12 M13 18 L19 17 M13 18 L7 17" stroke="#8C2B37" stroke-width="1" fill="none"/>',
		/* — halloween — */
		jack1: function () { return jackSvg('#FF7A00', '<path d="M8 12l5 3H6Zm14 0-5 3h7Z" fill="#111"/><path d="M8 21q7 5 14 0-2 4-7 4t-7-4Z" fill="#111"/>'); },
		jack2: function () { return jackSvg('#FF922B', '<circle cx="10" cy="13" r="3" fill="#111"/><circle cx="20" cy="13" r="3" fill="#111"/><path d="M13 17l2-3 2 3Z" fill="#111"/><path d="M8 21h14l-2 3-2-2-2 2-2-2-2 2Z" fill="#111"/>'); },
		jack3: function () { return jackSvg('#F76707', '<path d="M7 14q2-4 5-1Zm16 0q-2-4-5-1Z" fill="#111"/><path d="M10 20q5 6 10 0l-2 4h-6Z" fill="#111"/>'); },
		ghost: '26 32|<path d="M13 1q10 1 10 12v10l-3-2-3 4-4-3-4 3-3-4-3 3 1-12Q4 2 13 1Z" fill="%d" stroke="#8E97A3" stroke-width="1.8" opacity=".95"/><circle cx="9.6" cy="11" r="1.8" fill="%b"/><circle cx="16.4" cy="11" r="1.8" fill="%b"/><ellipse cx="13" cy="17" rx="2" ry="2.8" fill="%b"/>',
		spider: '24 24|<g id="sl" stroke="%g" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M6.4 11 1.6 6.2M6 13 0.8 11M6 16 1 18M6.6 18 2.4 22"/></g><use href="#sl" transform="translate(24 0) scale(-1 1)"/><ellipse cx="12" cy="15" rx="6" ry="5.4" fill="%g"/><circle cx="12" cy="7" r="3.6" fill="%b"/><circle cx="10.6" cy="6" r="0.9" fill="%e"/><circle cx="13.4" cy="6" r="0.9" fill="%e"/>',
		web: '40 40|<g stroke="#8A94A0" stroke-width="1" fill="none" opacity="0.9"><path d="M40 0 2 0M40 0 4.9 15M40 0 13 27M40 0 26 35M40 0 40 38"/><path d="M40 12 35 11 32 8.5 29 4.6 28 0"/><path d="M40 20 30 19 26 14 22 7.7 20 0"/><path d="M40 28 29 26 20 20 14 11 12 0"/><path d="M40 36 26 33 15 26 6.7 14 4 0"/></g>',
		candycorn: '22 30|<path d="M11 1 21 29H1Z" fill="%k"/><path d="M4 19 11 1l7 18Z" fill="#FF922B"/><path d="M8 9 11 1l3 8Z" fill="#FFF9DB"/>',
		witchhat: '32 26|<ellipse cx="16" cy="22" rx="15" ry="4" fill="%g"/><path d="M16 0 24 21H8Z" fill="%b"/><rect x="9" y="16" width="14" height="4" fill="#9C36B5"/><rect x="14" y="17" width="3" height="3" fill="%k"/>',
		/* 4.2.0 — the witch hero, drawn: a silhouette with her cat on the broom tail. */
		flamup: '100 54|<g transform="translate(0 5)"><path d="M60 25L98 26.6M60 26.4L97 28.6" stroke="%u" stroke-width="1.4" stroke-linecap="round"/><path d="M44 24Q30 23 16 21.6" stroke="%s" stroke-width="3.4" stroke-linecap="round" fill="none"/><g transform="translate(51 23) scale(1.25) translate(-51 -23)"><path d="M45 23Q46 11 53 3L57 2Q57 13 56 23Z" fill="#F06595"/><path d="M57 2Q63 4 67 7Q61 14 60 23L56 23Q57 13 57 2Z" fill="%g"/><path d="M51 6Q52 4 53 3L57 2L56.6 7Z" fill="%g"/></g><ellipse cx="52" cy="25" rx="11" ry="5.4" fill="%s"/><path d="M61 23.4L66 24.6L61 27Z" fill="%s"/><ellipse cx="13.4" cy="21" rx="3.8" ry="3.1" fill="%s"/><path d="M10 20L4.6 21.4Q3 23.2 4.4 24.8L9.6 22.8Z" fill="#FFE3EC"/><path d="M5.8 21.1L4.6 21.4Q3 23.2 4.4 24.8L6 24.2Z" fill="%g"/><circle cx="13.6" cy="20.2" r=".9" fill="%g"/></g>',
		flamdown: '100 54|<g transform="translate(0 5)"><path d="M60 21L98 22.6M60 22.4L97 24.6" stroke="%u" stroke-width="1.4" stroke-linecap="round"/><path d="M44 20Q30 19 16 17.6" stroke="%s" stroke-width="3.4" stroke-linecap="round" fill="none"/><g transform="translate(51 21) scale(1.25) translate(-51 -21)"><path d="M45 21Q46 33 53 41L57 42Q57 31 56 21Z" fill="#F06595"/><path d="M57 42Q63 40 67 37Q61 30 60 21L56 21Q57 31 57 42Z" fill="%g"/><path d="M51 38Q52 40 53 41L57 42L56.6 37Z" fill="%g"/></g><ellipse cx="52" cy="21" rx="11" ry="5.4" fill="%s"/><path d="M61 19.4L66 20.6L61 23Z" fill="%s"/><ellipse cx="13.4" cy="17" rx="3.8" ry="3.1" fill="%s"/><path d="M10 16L4.6 17.4Q3 19.2 4.4 20.8L9.6 18.8Z" fill="#FFE3EC"/><path d="M5.8 17.1L4.6 17.4Q3 19.2 4.4 20.8L6 20.2Z" fill="%g"/><circle cx="13.6" cy="16.2" r=".9" fill="%g"/></g>',
		duckhen: '46 30|<path d="M9 19Q11 13 20 13L33 13Q40 13 43 8Q45 15 41 20Q35 27 21 27Q11 27 9 19Z" fill="#8C6A44"/><path d="M18 17l3 2 3-2M25 18l3 2 3-2M20 22l3 2 3-2M28 22l3 2 3-2M14 21l3 2 3-2" stroke="#5E4329" stroke-width="1" fill="none"/><path d="M30 15.6L38 15L37 17.4L30 18Z" fill="#4C6EF5"/><path d="M30 15.6L38 15M30 18L37 17.4" stroke="#F8F9FA" stroke-width=".6"/><path d="M9 13Q8 17 11 19L16 15Q13 13 12 10Z" fill="#9C7B52"/><circle cx="10.4" cy="9.4" r="5.4" fill="#B08C5F"/><path d="M7.4 5.2Q10.6 3.6 13.6 5Q12 5.8 10.2 6Q8.6 6 7.4 5.2Z" fill="#6B4F33"/><path d="M5.8 9.2Q9 8.8 14.6 10" stroke="#6B4F33" stroke-width=".55" fill="none"/><circle cx="8.6" cy="8.9" r=".95" fill="%g"/><path d="M5.6 10L.6 11.2Q.4 13 2 13.2L5.8 12.2Z" fill="#B8A23C"/><circle cx="1.2" cy="12" r=".6" fill="%g"/>',
		duckling: '20 16|<ellipse cx="11" cy="10.4" rx="7.4" ry="5" fill="#6B4F33"/><path d="M6 12Q11 15.4 16 12Q11 13 6 12Z" fill="#E9C46A"/><path d="M16 8.6L19.4 7.4L18.4 10Z" fill="#6B4F33"/><circle cx="6" cy="6" r="3.8" fill="#E9C46A"/><path d="M2.6 4.6Q5 1.4 8.6 3Q9.6 4.6 9 6Q6 4.4 2.6 4.6Z" fill="#6B4F33"/><path d="M2.8 6.4L9.4 6" stroke="#6B4F33" stroke-width=".7"/><circle cx="4.8" cy="6.2" r=".8" fill="%g"/><path d="M2.6 6.8L.2 7.6L2.6 8.4Z" fill="#495057"/>',
		witchsil: '92 66|<g fill="#1B1B24" stroke="#9C36B5" stroke-width=".7" paint-order="stroke"><path d="M10 48L74 44" stroke="#1B1B24" stroke-width="3" stroke-linecap="round"/><path d="M72 44L90 36L88 44L91 50L72 47Z"/><path d="M38 30Q52 31 58 45L46 46Z"/><path d="M32 30H44L48 47H30Z"/><path d="M33 47L27 56H20V53H26L29 47Z"/><path d="M36 33L27 46" stroke="#1B1B24" stroke-width="3" stroke-linecap="round"/><path d="M39 21Q50 22 52 32Q46 27 40 28Z"/><circle cx="36" cy="24" r="6"/><path d="M30.5 24L27 26L31 27Z"/><ellipse cx="38" cy="18.5" rx="11" ry="2.4" transform="rotate(-8 38 18.5)"/><path d="M31 18L41 16L50 2L44 3Z"/><ellipse cx="68" cy="40" rx="5.5" ry="3.6"/><circle cx="63.5" cy="36.4" r="3.2"/><path d="M61.4 34.6L61.8 30.8L64 33.4ZM65 33.4L66.6 30.4L67 34.6Z"/><path d="M73 40Q78 34 75.5 29" stroke="#1B1B24" stroke-width="1.6" fill="none"/></g><path d="M32 16.6L41 15L41.8 13.6L33 15Z" fill="#9C36B5"/><circle cx="62.6" cy="36" r=".8" fill="%k"/><circle cx="35" cy="23.5" r=".9" fill="%k"/>',
		/* — thanksgiving / harvest — */
		acorn: '22 28|<path d="M4 12h14c0 8-4 13-7 15-3-2-7-7-7-15Z" fill="#B08552"/><path d="M2 12c0-5 4-8 9-8s9 3 9 8Z" fill="%i"/><line x1="11" y1="4" x2="11" y2="0" stroke="%i" stroke-width="2"/>',
		pie: '32 22|<path d="M3 11h26l-2.4 8q-.6 2-3 2H8q-2.4 0-3-2Z" fill="%o"/><path d="M1 11q3-8 15-8T31 11Z" fill="#E8B04B"/><g stroke="#B5772E" stroke-width="1" fill="none"><path d="M8 6 5 11m6-8L10 11M16 3.2V11m5-8L22 11m1.2-5L27 11"/></g>',
		cornucopia: '48 32|<path d="M31 5 Q15 4 9 14 Q4 22 10 28 Q16 33 21 28 Q13 26 12 20 Q11 13 21 10 Q26 8 31 8 Z" fill="#A05A2C"/><path d="M12 20 Q18 17 24 18 M11 25 Q16 23 21 24" stroke="#7A421F" stroke-width="1" fill="none"/><ellipse cx="31" cy="12" rx="6" ry="8" fill="#7A421F"/><ellipse cx="31" cy="12" rx="6" ry="8" fill="none" stroke="#C98A4B" stroke-width="1.6"/><circle cx="38" cy="10" r="4.4" fill="%e"/><path d="M38 6 Q39 3 41 3" stroke="%c" stroke-width="1.4" fill="none"/><circle cx="44" cy="16" r="3.6" fill="%w"/><ellipse cx="36" cy="21" rx="5" ry="4" fill="%r"/><path d="M36 17 L36 19" stroke="%c" stroke-width="1.4"/><circle cx="43" cy="24" r="2.2" fill="%l"/><circle cx="46" cy="27" r="2" fill="%l"/><circle cx="41" cy="28" r="2" fill="%l"/>',
		/* — christmas — */
		holly: '34 22|<path d="M15 10C11 2 4 2 1 6c4 1 4 5 8 7Z" fill="%c"/><path d="M19 10c4-8 11-8 14-4-4 1-4 5-8 7Z" fill="%j"/><circle cx="14" cy="14" r="4" fill="%e"/><circle cx="21" cy="14" r="4" fill="%n"/><circle cx="18" cy="18" r="4" fill="%e"/>',
		ornament: '24 30|<rect x="9" y="2" width="5" height="5" rx="1" fill="%f"/><circle cx="12" cy="8" r="2" fill="none" stroke="%f" stroke-width="2"/><circle cx="12" cy="19" r="10" fill="%n"/><path d="M3 16a10 10 0 0 1 19 0" fill="%e"/><path d="M2 19q10-4 20 0" stroke="%a" stroke-width="2" fill="none"/><ellipse cx="9" cy="14" rx="3" ry="4" fill="#FFF5F5" opacity=".55"/>',
		gift: '26 26|<rect x="2" y="9" width="22" height="16" rx="2" fill="%m"/><rect x="1" y="6" width="24" height="5" rx="2" fill="#1C7ED6"/><rect x="11" y="6" width="4" height="19" fill="%a"/><path d="M13 6Q7 6 7 2q4-1 6 4Zm0 0q6 0 6-4-4-1-6 4Z" fill="%a"/>',
		pine: '30 38|<path d="M15 0 26 14H4Z" fill="%c"/><path d="M15 8 28 24H2Z" fill="%j"/><path d="M15 18 30 34H0Z" fill="#37B24D"/><rect x="12" y="34" width="6" height="4" fill="%i"/><path d="M15 0l1 3h-3Z" fill="%k"/>',
		sleigh: '122 46|<path d="M44 24 L62 28" stroke="%i" stroke-width="1.6" fill="none"/><g fill="%p"><path d="M16 18 Q28 13 40 18 Q45 20 45 26 Q45 32 39 32 L20 32 Q14 32 14 26 Q14 20 16 18 Z"/><path d="M16 22 Q9 21 6 15 Q4 10 9 9 Q14 8 16 13 Z"/><path d="M44 20 L50 12 L48 22 Z"/></g><path d="M11 9 L9 2 M9 4 L4 2 M9 6 L3 6 M14 9 L16 1 M16 3 L21 1" stroke="%i" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="6" cy="13" r="1.8" fill="%e"/><circle cx="13" cy="12" r="1" fill="%g"/><path d="M20 32 L17 44 M26 32 L29 44 M36 32 L33 44 M41 32 L45 43" stroke="%i" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M100 8 Q112 12 110 26 L104 26 Q106 16 98 13 Z" fill="%n"/><path d="M62 20 L104 20 Q110 20 110 26 L110 34 L64 34 Q59 30 60 24 Z" fill="%n"/><rect x="72" y="11" width="13" height="10" rx="1" fill="%c"/><path d="M78.5 11 L78.5 21 M72 16 L85 16" stroke="%k" stroke-width="1.4"/><rect x="88" y="14" width="9" height="7" rx="1" fill="%a"/><path d="M58 38 L112 38" stroke="%f" stroke-width="2.4"/><path d="M58 38 Q52 38 53 33 Q55 30 59 32" stroke="%f" stroke-width="2.4" fill="none"/><path d="M64 34 L64 38 M94 34 L94 38" stroke="%f" stroke-width="2"/>',
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
		stilts: '32 78|<rect x="9" y="30" width="3.2" height="46" rx="1.2" fill="%p"/><rect x="19.8" y="30" width="3.2" height="46" rx="1.2" fill="%p"/><rect x="6.6" y="44" width="8" height="2.6" rx="1" fill="#6F4E37"/><rect x="17.4" y="44" width="8" height="2.6" rx="1" fill="#6F4E37"/><path d="M12.6 30 L10.8 45" stroke="%j" stroke-width="3.4" stroke-linecap="round"/><path d="M19.4 30 L21.2 45" stroke="%j" stroke-width="3.4" stroke-linecap="round"/><path d="M9.6 14 Q16 11.6 22.4 14 L24 30 Q16 32.6 8 30 Z" fill="%l"/><path d="M9.6 19.4 Q16 22.4 24 19.4" stroke="%a" stroke-width="2.4" fill="none"/><path d="M9.8 16 L3.6 23.6" stroke="%l" stroke-width="3.2" stroke-linecap="round"/><path d="M22.2 16 L28.4 23.6" stroke="%l" stroke-width="3.2" stroke-linecap="round"/><circle cx="16" cy="9" r="4.4" fill="#F0C8A0"/><path d="M11 6.2 Q16 -0.6 21 6.2 Z" fill="%a"/><circle cx="11" cy="5.6" r="1.6" fill="%j"/><circle cx="21" cy="5.6" r="1.6" fill="%j"/><circle cx="16" cy="1" r="1.6" fill="%e"/>',
		bottle: '18 44|<path d="M7 2h4v8q5 4 5 12v18q0 3-3 3H5q-3 0-3-3V22q0-8 5-12Z" fill="#1E5B2B"/><path d="M7 2h4v6H7Z" fill="%f"/><rect x="4" y="24" width="10" height="10" rx="1" fill="%d"/>',
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
		disguise: '34 26|<circle cx="9" cy="8" r="7" fill="none" stroke="%b" stroke-width="2"/><circle cx="25" cy="8" r="7" fill="none" stroke="%b" stroke-width="2"/><path d="M16 8h2" stroke="%b" stroke-width="2"/><path d="M0 6h3m28 0h3" stroke="%b" stroke-width="2"/><path d="M17 10q-5 4-4 9 2 4 6 2" fill="#F8C8A8" stroke="#D9A06B"/>',
		peel: '36 16|<path d="M17 8 Q9 8 3 12.4 Q2 14 4.4 14 Q11 12 17.6 10.6 Z" fill="%k"/><path d="M17 8 Q25 8 31.6 12 Q33 13.6 30.6 13.8 Q24 11.8 17.4 10.6 Z" fill="%a"/><path d="M17 8.6 Q16 12 13.6 15.2 Q15.6 16.4 17.6 15.2 Q19.6 12 19 8.8 Z" fill="%k"/><ellipse cx="17.4" cy="8.2" rx="3.4" ry="2.4" fill="#E8C33A"/><path d="M16.4 5.4 Q17.6 3 18.8 5.6 Q17.6 6.4 16.4 5.4 Z" fill="#8A6D1F"/>',
		/* — 420 / earth — */
		cannabis: '32 34|<g fill="%c" transform="translate(16 30)"><path id="cl" d="M0 0 1.5-5 .8-6 2.6-10 1.8-11 3-15 2-17 2.2-20 1-21 0-26-1-21-2.2-20-2-17-3-15-1.8-11-2.6-10-.8-6-1.5-5Z"/><use href="#cl" transform="rotate(27) scale(.9)"/><use href="#cl" transform="rotate(-27) scale(.9)"/><use href="#cl" transform="rotate(54) scale(.74)"/><use href="#cl" transform="rotate(-54) scale(.74)"/><use href="#cl" transform="rotate(79) scale(.54)"/><use href="#cl" transform="rotate(-79) scale(.54)"/></g><path d="M16 29v5" stroke="%c" stroke-width="2"/>',
		peace: '30 30|<circle cx="15" cy="15" r="13" fill="none" stroke="%l" stroke-width="3"/><circle cx="15" cy="15" r="13" fill="none" stroke="%j" stroke-width="3" stroke-dasharray="14 27"/><path d="M15 2v26M15 15 6 24m9-9 9 9" stroke="%u" stroke-width="3"/>',
		sprout: '22 26|<path d="M11 26V10" stroke="%c" stroke-width="2"/><path d="M11 12Q3 12 1 4q9-1 10 8Z" fill="#37B24D"/><path d="M11 9Q19 9 21 2q-9-1-10 7Z" fill="%j"/>',
		/* 4.2.0 — 4/20: the hippie van (no badge) takes the picnic basket's grow-and-stand role. */
		van: '48 30|<path d="M4 6Q4 2 9 2H42Q46 2 46 7V23H2V11Q2 7 4 6Z" fill="#F8F9FA" stroke="#868E96" stroke-width="1"/><path d="M2 15H46V23H2Z" fill="#12B886"/><path d="M2 15Q10 20 13 15" fill="#F8F9FA"/><path d="M6 5H13V12H4Z" fill="#A5D8FF"/><path d="M16 5H23V12H16ZM26 5H33V12H26ZM36 5H43V12H36Z" fill="#A5D8FF"/><g fill="%k"><circle cx="24" cy="19" r="2.4"/><circle cx="32" cy="18" r="1.6"/></g><g fill="%u"><circle cx="24" cy="19" r="1"/><circle cx="32" cy="18" r=".7"/></g><circle cx="11" cy="24" r="4.2" fill="%g"/><circle cx="37" cy="24" r="4.2" fill="%g"/><circle cx="11" cy="24" r="1.6" fill="%t"/><circle cx="37" cy="24" r="1.6" fill="%t"/><rect x="1" y="17" width="3" height="2" fill="%k"/>',
		globe: '30 30|<circle cx="15" cy="15" r="13" fill="#339AF0"/><path d="M8 6q6 2 5 8t3 7q-8 1-10-6-1-6 2-9Zm12 1q4 3 4 8 0 6-5 9-2-5 0-9t1-8Z" fill="#37B24D"/>',
		hands: '44 32|<circle cx="22" cy="12" r="8.6" fill="#2E86DE"/><path d="M15.6 7.4 Q21 4.6 24.6 9 Q22.6 15 17 15.4 Q13.6 11.6 15.6 7.4 Z" fill="%j"/><path d="M26 8.4 Q30 11 28.4 16 Q24.6 17.4 24 12.4 Z" fill="%j"/><path d="M1.6 31 Q0.6 23.6 6 20.6 Q10 19 13.6 21.4 L20 25 Q21.6 26.4 20 27.6 L13 26.6 Q9 26.6 8.6 31 Z" fill="#D9A06B"/><path d="M6.4 22.6 L12.6 25.4 M8 25.4 L13.6 27.2 M4.6 25 L9 27.6" stroke="#B87F4E" stroke-width="0.9" fill="none" stroke-linecap="round"/><path d="M42.4 31 Q43.4 23.6 38 20.6 Q34 19 30.4 21.4 L24 25 Q22.4 26.4 24 27.6 L31 26.6 Q35 26.6 35.4 31 Z" fill="#D9A06B"/><path d="M37.6 22.6 L31.4 25.4 M36 25.4 L30.4 27.2 M39.4 25 L35 27.6" stroke="#B87F4E" stroke-width="0.9" fill="none" stroke-linecap="round"/>',
		/* — labor day picnic — */
		sparkler: '22 34|<path d="M11 33 L11 15" stroke="%h" stroke-width="2.2" stroke-linecap="round"/><path d="M11 13 L11 2 M11 13 L20 5 M11 13 L21 13 M11 13 L20 21 M11 13 L2 5 M11 13 L1 13 M11 13 L2 21" stroke="%a" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M11 13 L15 3 M11 13 L7 3 M11 13 L19 9 M11 13 L3 9 M11 13 L18 18 M11 13 L4 18" stroke="%d" stroke-width="1.1" stroke-linecap="round" fill="none"/><circle cx="11" cy="13" r="2.6" fill="%d"/><circle cx="11" cy="13" r="1.4" fill="%a"/>',
		poppy: '26 30|<path d="M13 22 L13 29" stroke="%c" stroke-width="1.6"/><g fill="%e"><ellipse cx="8" cy="10" rx="6.4" ry="5.6" transform="rotate(-30 8 10)"/><ellipse cx="18" cy="10" rx="6.4" ry="5.6" transform="rotate(30 18 10)"/><ellipse cx="8" cy="17" rx="6.4" ry="5.6" transform="rotate(30 8 17)"/><ellipse cx="18" cy="17" rx="6.4" ry="5.6" transform="rotate(-30 18 17)"/></g><path d="M13 13 L7 8 M13 13 L19 8 M13 13 L7 19 M13 13 L19 19" stroke="#C92A2A" stroke-width="1.2" fill="none"/><circle cx="13" cy="13.4" r="3.4" fill="%g"/><circle cx="13" cy="13.4" r="1.4" fill="#495057"/>',
		tulip: '22 34|<path d="M11 33 L11 18" stroke="%c" stroke-width="1.8"/><path d="M11 30 Q3 28 2 20 Q8 22 11 27 Z" fill="%j"/><path d="M3 9 Q2 20 11 21 Q20 20 19 9 L15 13 L11 6 L7 13 Z" fill="%u"/><path d="M8 12 L11 6 L14 12 L14 20 Q11 21 8 20 Z" fill="%s"/>',
		necktie: '16 40|<clipPath id="nt"><path d="M8 9 L13 7 L14 30 L8 39 L2 30 L3 7 Z"/></clipPath><path d="M5 2 L11 2 L13 7 L8 9 L3 7 Z" fill="%n"/><path d="M8 9 L13 7 L14 30 L8 39 L2 30 L3 7 Z" fill="%e"/><g clip-path="url(#nt)"><path d="M0 15 L16 11 M0 23 L16 19 M0 31 L16 27" stroke="%m" stroke-width="2.4"/></g><path d="M8 9 L13 7 L14 30 L8 39 L2 30 L3 7 Z" fill="none" stroke="#8C1D1D" stroke-width="0.8"/>',
		medal: '22 34|<path d="M6 1 L16 1 L14 16 L8 16 Z" fill="%e"/><path d="M9 1 L13 1 L12.4 16 L9.6 16 Z" fill="%d"/><path d="M6 1 L8.4 1 L8.6 16 L8 16 Z M13.6 1 L16 1 L14 16 L13.4 16 Z" fill="%m"/><circle cx="11" cy="23.5" r="8.6" fill="%f"/><circle cx="11" cy="23.5" r="7" fill="%a"/><path d="M11 17.4 L12.8 21.2 L17 21.6 L13.8 24.4 L14.8 28.6 L11 26.4 L7.2 28.6 L8.2 24.4 L5 21.6 L9.2 21.2 Z" fill="%f"/>',
		sun: '34 34|<path d="M17 1.5 L17 6 M32.5 17 L28 17 M17 32.5 L17 28 M1.5 17 L6 17 M28 6 L24.8 9.2 M28 28 L24.8 24.8 M6 28 L9.2 24.8 M6 6 L9.2 9.2" stroke="%k" stroke-width="2.4" stroke-linecap="round" fill="none"/><circle cx="17" cy="17" r="9" fill="%r"/><circle cx="17" cy="17" r="7" fill="%k"/>',
		watermelon: '34 22|<path d="M1 3 A16 16 0 0 1 33 3 L17 21 Z" fill="%c"/><path d="M3.6 3.6 A13.4 13.4 0 0 1 30.4 3.6 L17 19 Z" fill="%d"/><path d="M5.6 4 A11.4 11.4 0 0 1 28.4 4 L17 17 Z" fill="#FA5252"/><g fill="%g"><ellipse cx="12" cy="7.6" rx="1.1" ry="1.8" transform="rotate(20 12 7.6)"/><ellipse cx="22" cy="7.6" rx="1.1" ry="1.8" transform="rotate(-20 22 7.6)"/><ellipse cx="17" cy="11" rx="1.1" ry="1.8"/><ellipse cx="13.6" cy="12.6" rx="1" ry="1.6" transform="rotate(25 13.6 12.6)"/></g>',
		flipflop: '18 34|<path d="M9 1 Q17 1 17 12 L16 26 Q15 33 9 33 Q3 33 2 26 L1 12 Q1 1 9 1 Z" fill="%k"/><path d="M9 3 Q15 3 15 12 L14 25 Q13.4 31 9 31 Q4.6 31 4 25 L3 12 Q3 3 9 3 Z" fill="#FFE066"/><path d="M9 11 L3.4 19 M9 11 L14.6 19" stroke="%u" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="9" cy="10.6" r="1.6" fill="%u"/>',
		floatie: '56 46|<ellipse cx="28" cy="38" rx="25" ry="6.5" fill="#F783AC"/><ellipse cx="28" cy="37" rx="14" ry="3" fill="#FCC2D7"/><path d="M40 34Q44 20 40 10Q38 4 32 5Q27 6 28 11" stroke="#F783AC" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="30" cy="10" r="5" fill="#F783AC"/><path d="M26 10L20 13L24 15Z" fill="%g"/><path d="M26 10.5L22.5 12" stroke="#F1F3F5" stroke-width="1.2"/><circle cx="30" cy="8.5" r="1.1" fill="%g"/><path d="M14 36Q18 34 22 36" stroke="#FCC2D7" stroke-width="1.4" fill="none"/>',
		icecream: '22 36|<path d="M3 16 L11 35 L19 16 Z" fill="%w"/><path d="M5 18 L17 18 M6.4 22 L15.6 22 M8 26 L14 26 M9.4 30 L12.6 30 M6 16 L13 30 M16 16 L9 30" stroke="#B8690C" stroke-width="0.9" fill="none"/><circle cx="11" cy="12.4" r="7.2" fill="%s"/><circle cx="11" cy="7.4" r="6" fill="%d"/><circle cx="8.6" cy="5.6" r="1.4" fill="%e"/>',
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

	/* The behaviours that are placed in free air and nowhere in particular:
	 * the guardrail spreads them at seed time and the anti-clump keeps them
	 * apart afterwards. Everything else is staged on purpose — water-line
	 * riders, growers, off-screen entrances, the hero — and is left alone. */
	var FREEAIR = ' fall sway tumble spin wobble jump flutter rise pulse orbit dangle hang dart twinkle firefly ';

	/* ================= Engine ================= */
	/* --- Layer 1 effects (4.4.0: hoisted so engine and Theme guide share them).
	 * kitG = { cx, vw, vh }, read live on every call (not 'g': effects use
	 * their own var g for gradients). --- */
	function subtleKit(kitG) {
		var SUBTLE = {
			/* Fall — leaves drifting down, tumbling as they go. */
			leaves: {
				n: 11, a: 0.28, cl: ['#C1440E', '#E07A2F', '#B8860B', '#8B5A2B', '#A2562B'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : rnd(-60, -10);
					p.r = rnd(4.5, 8.5); p.vy = rnd(13, 26); p.ph = rnd(0, TAU);
					p.sp = rnd(0.5, 1.2); p.rot = rnd(0, TAU); p.rv = rnd(-0.7, 0.7);
					p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt;
					p.x += sin(p.ph) * 16 * dt; p.rot += p.rv * dt;
				},
				draw: function (p) {
					kitG.cx.translate(p.x, p.y); kitG.cx.rotate(p.rot);
					kitG.cx.fillStyle = p.c;
					kitG.cx.beginPath();
					kitG.cx.ellipse(0, 0, p.r, p.r * 0.52, 0, 0, TAU);
					kitG.cx.fill();
					kitG.cx.strokeStyle = 'rgba(0,0,0,.25)'; kitG.cx.lineWidth = 0.7;
					kitG.cx.beginPath(); kitG.cx.moveTo(-p.r, 0); kitG.cx.lineTo(p.r, 0); kitG.cx.stroke();
				}
			},
			/* Spring — blossom petals, lighter and slower than leaves. */
			blossom: {
				n: 12, a: 0.27, cl: ['#F8C8DC', '#FADCE6', '#F6B8CE', '#FFFFFF'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : rnd(-50, -8);
					p.r = rnd(3.2, 6.2); p.vy = rnd(10, 19); p.ph = rnd(0, TAU);
					p.sp = rnd(0.6, 1.4); p.rot = rnd(0, TAU); p.rv = rnd(-0.5, 0.5);
					p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt;
					p.x += sin(p.ph) * 20 * dt; p.rot += p.rv * dt;
				},
				draw: function (p) {
					kitG.cx.translate(p.x, p.y); kitG.cx.rotate(p.rot);
					kitG.cx.fillStyle = p.c;
					kitG.cx.beginPath();
					kitG.cx.ellipse(0, 0, p.r, p.r * 0.42, 0, 0, TAU);
					kitG.cx.fill();
				}
			},
			/* Summer — a few dragonflies over a faint heat shimmer on the
			 * water. The shimmer is the band, the dragonflies are the
			 * particles; both are deliberately near the bottom. */
			dragonheat: {
				n: 5, a: 0.30, shimmer: true, cl: ['#4DABF7', '#38D9A9', '#74C0FC'],
				seed: function (p, first) {
					p.x = first ? rnd(0, kitG.vw) : (rand() < 0.5 ? -30 : kitG.vw + 30);
					p.y = rnd(kitG.vh * 0.45, kitG.vh * 0.88);
					p.r = rnd(5, 9); p.dir = p.x < kitG.vw / 2 ? 1 : -1;
					p.v = rnd(16, 34); p.ph = rnd(0, TAU); p.sp = rnd(1.6, 3.0);
					p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.ph += p.sp * dt;
					p.x += p.dir * p.v * dt;
					p.y += sin(p.ph) * 10 * dt;
				},
				draw: function (p) {
					kitG.cx.translate(p.x, p.y);
					kitG.cx.strokeStyle = p.c; kitG.cx.lineWidth = 1.1;
					kitG.cx.beginPath(); kitG.cx.moveTo(-p.r, 0); kitG.cx.lineTo(p.r * 0.6, 0); kitG.cx.stroke();
					var w = p.r * 0.85, fl = sin(p.ph * 4) * 0.35 + 0.65;
					kitG.cx.globalAlpha *= 0.85;
					kitG.cx.beginPath();
					kitG.cx.ellipse(0, -w * 0.35 * fl, w, w * 0.3 * fl, -0.3, 0, TAU);
					kitG.cx.ellipse(0, w * 0.35 * fl, w, w * 0.3 * fl, 0.3, 0, TAU);
					kitG.cx.stroke();
				}
			},
			/* Valentine's — hearts, rising rather than falling. */
			hearts: {
				n: 9, a: 0.26, cl: ['#FF6B81', '#FF8FA3', '#E8375A'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : kitG.vh + rnd(8, 50);
					p.r = rnd(4, 7.5); p.vy = -rnd(12, 24); p.ph = rnd(0, TAU);
					p.sp = rnd(0.5, 1.1); p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt; p.x += sin(p.ph) * 14 * dt;
				},
				draw: function (p) {
					var r = p.r;
					kitG.cx.translate(p.x, p.y); kitG.cx.fillStyle = p.c;
					kitG.cx.beginPath();
					kitG.cx.moveTo(0, r * 0.75);
					kitG.cx.bezierCurveTo(-r * 1.3, -r * 0.2, -r * 0.5, -r, 0, -r * 0.35);
					kitG.cx.bezierCurveTo(r * 0.5, -r, r * 1.3, -r * 0.2, 0, r * 0.75);
					kitG.cx.fill();
				}
			},
			/* New Year's — confetti, tumbling down. */
			confetti: {
				n: 14, a: 0.30, cl: ['#FFD43B', '#FF6B6B', '#4DABF7', '#51CF66', '#F1F3F5'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : rnd(-50, -8);
					p.r = rnd(2.6, 5); p.vy = rnd(22, 42); p.ph = rnd(0, TAU);
					p.sp = rnd(1.4, 3.2); p.rot = rnd(0, TAU); p.rv = rnd(-2.4, 2.4);
					p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt;
					p.x += sin(p.ph) * 22 * dt; p.rot += p.rv * dt;
				},
				draw: function (p) {
					kitG.cx.translate(p.x, p.y); kitG.cx.rotate(p.rot);
					kitG.cx.fillStyle = p.c;
					/* The vertical squash is the tumble: a flat rectangle
					 * edge-on reads as a spinning chip without a 3D turn. */
					kitG.cx.fillRect(-p.r, -p.r * 0.45 * abs(cos(p.ph)), p.r * 2, p.r * 0.9 * abs(cos(p.ph)) + 0.6);
				}
			},
			/* Halloween — embers rising and winking out. */
			embers: {
				n: 12, a: 0.30, cl: ['#FF7A00', '#FF9E3D', '#E8590C', '#FFC078'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : kitG.vh + rnd(6, 40);
					p.r = rnd(1.2, 2.8); p.vy = -rnd(16, 34); p.ph = rnd(0, TAU);
					p.sp = rnd(1.8, 3.6); p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt; p.x += sin(p.ph) * 11 * dt;
				},
				draw: function (p) {
					kitG.cx.globalAlpha *= 0.55 + 0.45 * (sin(p.ph * 2) * 0.5 + 0.5);
					kitG.cx.fillStyle = p.c;
					kitG.cx.beginPath(); kitG.cx.arc(p.x, p.y, p.r, 0, TAU); kitG.cx.fill();
				}
			},
			/* July 4 — drifting sparks, red/white/blue, falling away. */
			sparks: {
				n: 12, a: 0.28, cl: ['#FF5252', '#F1F3F5', '#5C7CFA'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : rnd(-40, -6);
					p.r = rnd(1.1, 2.4); p.vy = rnd(18, 36); p.ph = rnd(0, TAU);
					p.sp = rnd(2.2, 4.4); p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt; p.x += sin(p.ph) * 13 * dt;
				},
				draw: function (p) {
					kitG.cx.globalAlpha *= 0.5 + 0.5 * (sin(p.ph) * 0.5 + 0.5);
					kitG.cx.strokeStyle = p.c; kitG.cx.lineWidth = p.r;
					kitG.cx.beginPath();
					kitG.cx.moveTo(p.x, p.y - p.r * 2); kitG.cx.lineTo(p.x, p.y + p.r * 2);
					kitG.cx.stroke();
				}
			},
			/* Christmas — slow warm bokeh, the softest of the set. */
			bokeh: {
				n: 8, a: 0.22, cl: ['#FFD8A8', '#FFE8CC', '#FFC9C9', '#D8F5A2'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : rnd(-70, -20);
					p.r = rnd(9, 20); p.vy = rnd(5, 12); p.ph = rnd(0, TAU);
					p.sp = rnd(0.25, 0.6); p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt; p.x += sin(p.ph) * 7 * dt;
				},
				draw: function (p) {
					var g = kitG.cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
					g.addColorStop(0, p.c);
					g.addColorStop(0.55, p.c);
					g.addColorStop(1, 'rgba(255,255,255,0)');
					kitG.cx.globalAlpha *= 0.55 + 0.45 * (sin(p.ph * 1.7) * 0.5 + 0.5);
					kitG.cx.fillStyle = g;
					kitG.cx.beginPath(); kitG.cx.arc(p.x, p.y, p.r, 0, TAU); kitG.cx.fill();
				}
			},
			/* Orange blossom — Florida's state flower; the groves bloom
			 * February to April (Presidents Day). Five cream petals, a gold
			 * eye, and a warm outline so the flower survives white copy. */
			orangeblossom: {
				n: 10, a: 0.46, cl: ['#FFF4E6', '#FFFFFF'],
				seed: function (p, first) {
					p.x = rnd(0, kitG.vw); p.y = first ? rnd(0, kitG.vh) : rnd(-40, -8);
					p.r = rnd(3.6, 6); p.vy = rnd(9, 17); p.ph = rnd(0, TAU);
					p.sp = rnd(0.5, 1.1); p.rot = rnd(0, TAU); p.rv = rnd(-0.6, 0.6);
					p.c = pick(this.cl);
				},
				step: function (p, dt) {
					p.y += p.vy * dt; p.ph += p.sp * dt;
					p.x += sin(p.ph) * 15 * dt; p.rot += p.rv * dt;
				},
				draw: function (p) {
					var r = p.r;
					kitG.cx.translate(p.x, p.y); kitG.cx.rotate(p.rot);
					kitG.cx.fillStyle = p.c;
					kitG.cx.strokeStyle = 'rgba(170,125,60,.6)'; kitG.cx.lineWidth = 0.7;
					for (var i = 0; i < 5; i++) {
						kitG.cx.rotate(TAU / 5);
						kitG.cx.beginPath(); kitG.cx.ellipse(0, -r * 0.62, r * 0.34, r * 0.62, 0, 0, TAU);
						kitG.cx.fill(); kitG.cx.stroke();
					}
					kitG.cx.fillStyle = '#FAB005';
					kitG.cx.beginPath(); kitG.cx.arc(0, 0, r * 0.24, 0, TAU); kitG.cx.fill();
				}
			}
		};

		/* Colour variants of two effects above, each its OWN named choice in
		 * the settings dropdown (Rob's call: a hidden per-theme palette would
		 * make "Bokeh" look different depending on the theme). They share the
		 * parent's motion and drawing, so they cannot drift apart from it. */
		function variant(base, cl) { var o = {}, k; for (k in base) { o[k] = base[k]; } o.cl = cl; return o; }
		SUBTLE.sunglow = variant(SUBTLE.bokeh, ['#FFE8A3', '#FFD8A8', '#FFF3BF', '#FFC078']);
		SUBTLE.goldlight = variant(SUBTLE.bokeh, ['#FFE066', '#FFEC99', '#E9ECEF', '#FCC419']);
		SUBTLE.mardiconfetti = variant(SUBTLE.confetti, ['#7C3AED', '#2F9E44', '#F1C40F', '#B197FC']);

		/* Theme -> effect. PHP owns this map so the owner can re-point any
		 * theme from the settings page without a plugin release; this is
		 * only the fallback for a config that predates the setting. */
		return SUBTLE;
	}

	var ACCENTS = {
		/* The web is 96px since 4.10.3 (Rob: "make it medium", 1.5x the old
		 * 64): its stroke scales with the viewBox (1 unit of 40 = 2.4px),
		 * so it is the same drawing bigger, never thinner. */
		halloween: ['web', 'right:0;top:0;width:96px;opacity:.5;'],
		thanksgiving: ['cornucopia', 'left:10px;bottom:10px;width:56px;opacity:.55;'],
		snowbird: ['sunshades', 'left:12px;top:12px;width:44px;opacity:.5;'],
		earth_day: ['hands', 'left:10px;bottom:10px;width:52px;opacity:.55;'],
		summer_canal: ['sun', 'right:12px;top:12px;width:54px;opacity:.5;'],
		/* The Keys sun is a corner accent only (Rob, 4.2.0): never a
		 * sprite, so never two suns on screen. */
		florida_keys: ['sun', 'right:12px;top:12px;width:54px;opacity:.5;']
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
		spring_canal: ['duckparade', 'kayaker', 'dragonlotus'],
		summer_canal: ['gatorglide', 'floatdrift', 'mulletskip'],
		florida_keys: ['anhinga', 'ospreycatch', 'cranes', 'limpkinsnail', 'hibfloat']
	};

	var WINGS = { eagle: ['eagleup', 'eagledown', 280], osprey: ['ospreyup', 'ospreydown', 260] };

	/* --- How many sprites, and of what (4.2.0 rules; 4.4.0 made them pure so
	 * the admin Theme guide computes its counts with the SAME functions).
	 * PHONES: the sprite count follows the screen — clamp(width / 1280,
	 * 0.45, 1) — on the SPRITES only, never the ripple reserve; a theme's
	 * cap scales the same way but never below 3 (a cap of 1 stays 1);
	 * phoneMin overrides below 768px. --- */
	function phoneScaleAt(w) { return clamp(w / 1280, 0.45, 1); }
	function partTargetFor(A, density, w) {
		var maxTotal = clamp(density || 10, 1, 16), reserve = A.water ? 3 : 0, sc = phoneScaleAt(w);
		var n = MT.round((maxTotal - reserve) * sc);
		if (A.max) { n = mn(n, A.max <= 1 ? A.max : mx2(3, MT.round(A.max * sc))); }
		if (A.phoneMin && w < 768) { n = mx2(n, A.phoneMin); }
		return mx2(1, mn(n, maxTotal - reserve));
	}
	function specLimitAt(def, w) { return def.n ? mx2(1, MT.round(def.n * phoneScaleAt(w))) : 0; }
	/* Each spec's share of the total: its weight's share, with any spec over
	 * its limit held at the limit and the rest shared out again
	 * (water-filling). Specs are { wt, def }; sets .share on each. */
	function sharesAt(specs, total, w) {
		var rem = total, live = specs.slice(), i, W2, capped;
		for (i = 0; i < specs.length; i++) { specs[i].share = 0; }
		while (live.length) {
			W2 = 0;
			for (i = 0; i < live.length; i++) { W2 += live[i].wt; }
			capped = [];
			for (i = 0; i < live.length; i++) {
				if (live[i].def.n && live[i].wt / W2 * rem > specLimitAt(live[i].def, w)) { capped.push(live[i]); }
			}
			if (!capped.length) {
				for (i = 0; i < live.length; i++) { live[i].share = live[i].wt / W2 * rem; }
				break;
			}
			for (i = 0; i < capped.length; i++) { capped[i].share = specLimitAt(capped[i].def, w); rem -= capped[i].share; }
			live = live.filter(function (x) { return capped.indexOf(x) < 0; });
		}
		return specs;
	}

	/* --- Timing, in seconds of VISIBLE time (Rob, 4.9.0: scene first,
	 * flyer second). The season's scene first at 6-10 s; on a visit's
	 * first page the flyer (hero) follows `breath` (2 s) after the scene
	 * ends, never on top of it; a theme with no scene sends its hero at
	 * 6-10 s instead. After that ONE appearance every 60-90 s (counted from
	 * the end of the last one), scene and hero taking turns, never two at
	 * once. `every` is the fallback for a config without CFG.every
	 * (Plugin::EVERY sends it). 4.8.0 had the flyer first at 3-5 s. --- */
	var TIMING = { vigFirst: [6, 10], every: [60, 90], breath: 2, xaTurn: 45 };
	/* Scenes added only in the evening, and the theme with the midnight countdown. */
	var EVENING_VIGS = { christmas: ['sleighmoon'] };
	var COUNTDOWN_THEME = 'new_years';
	/* The drawing that stands for each hero and scene in the admin Theme
	 * guide — the hero's own sprite, or the scene's main actor. */
	/* The one emoji a hero draws (Rob's exception): the rainbow's clover strip. */
	var HERO_GLYPHS = { rainbow: '☘' };
	var HERO_ART = { heron: 'heron', eagle: 'eagleup', osprey: 'ospreyup', witch: 'witchsil', bass: 'bassleap', sleigh: 'sleigh', manatee: 'manatee', rainbow: 'rainbow' };
	var SCENE_ART = {
		flotilla: 'pontoon', fullcast: 'bass', dragonlands: 'dragonfly', dragonlotus: 'dragonfly', witchmoon: 'witch',
		gatorglide: 'gator', floatdrift: 'floatie', mulletskip: 'mullet', hibfloat: 'hibiscus', anhinga: 'anhingadry',
		ospreycatch: 'ospreyup', cranes: 'cranedance', limpkinsnail: 'limpkin', giftdrop: 'gift', sleighmoon: 'sleigh',
		corkpop: 'bottle', arrival: 'flamup', flagfly: 'flagcloth', doveflight: 'dove', stilts: 'stilts', kayaker: 'kayak',
		doubloons: 'doubloon', swans: 'swan', catch1: 'berry', egghunt: 'bunny', hatch: 'chick', bananaslip: 'peel', duckparade: 'duckhen'
	};

	/* ---------- The heron (4.9.0, Rob's pick: style A · Field guide) ------
	 * A Great Blue Heron drawn in code: the neck folded back in an S with
	 * the head drawn in, the legs trailing past the tail, long broad wings
	 * with dark flight feathers, a slate back, the white face with the black
	 * stripe running back into the plumes, a heavy yellow dagger bill, a
	 * pale streaked foreneck, rust at the thighs and the wrist.
	 *
	 * ONE continuous wingbeat, about two a second, the downstroke the longer
	 * of the two: the wing straightens and the primaries fan on the way
	 * down and it folds at the wrist on the way up; the body lifts on each
	 * downstroke and the neck lags it. Bouts of 4-6 beats with short glides.
	 *
	 * Drawn fresh, the bird cost ~4 ms a frame on a slow phone, so it is
	 * PRE-DRAWN once after the page loads (`hnCache` in start()): 24 points
	 * through the beat, 6 glide blends, the landing flare and the standing
	 * bird, each on its own tight canvas. A crossing is then one drawImage a
	 * frame, like the old three-frame sprite. Only the legs are drawn live —
	 * two thin lines — so they can swing down for the landing.
	 *
	 * The bird faces LEFT and is ~100 units from bill tip to toes; the
	 * engine draws it at w / 100 px a unit. The standing bird has its
	 * origin at the feet. Pose keys: b0-b23 beat, g1-g6 glide blend (g0 is
	 * b10), f flare, s standing. */
	var HN_DOWN = 0.56, HN_BEATS = 24, HN_GLIDES = 6, HN_GB = 10;
	var HN = {
		back: '#7F95AE', back2: '#62788F', belly: '#5D6B7C', cov: '#86A0BA', cov2: '#6E87A2', covLine: '#5B7189',
		flight: '#2E394A', prim: '#222A36', rachis: '#56657A', farTint: 0.72, edge: 'rgba(226,232,240,.5)',
		neck: '#ECE7DD', neckBack: '#A3AEBE', streak: 'rgba(58,66,80,.55)', face: '#F6F4EE', cap: '#1A1D22',
		bill: '#E2B23E', billTop: '#7A6326', eye: '#F2C230', leg: '#55553F', thigh: '#8E4A2A', wrist: '#A75C36', tail: '#5E7389'
	};
	function hnEase(t) { return 0.5 - 0.5 * cos(MT.PI * clamp(t, 0, 1)); }
	/* phase 0 = top of the upstroke; the downstroke runs 0 -> HN_DOWN. psi is
	 * the wing's direction from the shoulder (-1.85 up and back, +1.05 down),
	 * flex how far the hand folds at the wrist, spread how far the
	 * primaries fan. */
	function hnBeat(ph) {
		var p = ph - MT.floor(ph), u, psi, flex, spread, PI = MT.PI;
		if (p < HN_DOWN) {
			u = hnEase(p / HN_DOWN);
			psi = lerp(-1.85, 1.05, u);
			flex = 0.12 + 0.18 * (1 - sin(PI * p / HN_DOWN));
			spread = sin(PI * p / HN_DOWN);
		} else {
			u = hnEase((p - HN_DOWN) / (1 - HN_DOWN));
			psi = lerp(1.05, -1.85, u);
			flex = 0.3 + 0.7 * sin(PI * (p - HN_DOWN) / (1 - HN_DOWN));
			spread = 0.15 * (1 - sin(PI * (p - HN_DOWN) / (1 - HN_DOWN)));
		}
		return { psi: psi, flex: flex, spread: spread, bob: -sin(TAU * (p - 0.12)) * 2.2, neck: -sin(TAU * (p - 0.28)) * 1.1 };
	}
	var HN_GLIDE = { psi: 0.22, flex: 0.18, spread: 0.55, bob: 0, neck: 0 };
	/* the landing flare: wings raised and fanned, braking */
	var HN_FLARE = { psi: -1.45, flex: 0.04, spread: 1, bob: 0, neck: -0.8 };
	function hnMix(a, b, t) {
		return { psi: lerp(a.psi, b.psi, t), flex: lerp(a.flex, b.flex, t), spread: lerp(a.spread, b.spread, t), bob: lerp(a.bob, b.bob, t), neck: lerp(a.neck, b.neck, t) };
	}
	function hnPose(key) {
		var n = +key.slice(1);
		if (key[0] === 'b') { return hnBeat(n / HN_BEATS); }
		if (key[0] === 'g') { return hnMix(hnBeat(HN_GB / HN_BEATS), HN_GLIDE, n / HN_GLIDES); }
		return HN_FLARE;
	}
	function hnShade(hex, f) {
		var n = parseInt(hex.slice(1), 16);
		return 'rgb(' + MT.round(((n >> 16) & 255) * f) + ',' + MT.round(((n >> 8) & 255) * f) + ',' + MT.round((n & 255) * f) + ')';
	}
	/* One wing's outline from the pose, plus its seven primaries. */
	function hnWing(pose, far) {
		var k = far ? 0.86 : 1, S = far ? [-1, -6.5] : [-3, -4.6], ps = pose.psi;
		/* a wing pointing at the viewer is foreshortened, never to nothing */
		var fore = 0.62 + 0.38 * abs(sin(ps));
		var La = 30 * k * fore, Lh = 41 * k * (0.55 + 0.45 * fore);
		var ax = 0.42 + 0.22 * cos(ps), ay = sin(ps), an = sqrt(ax * ax + ay * ay);
		ax /= an; ay /= an;
		var aa = atan2(ay, ax), Wr = [S[0] + ax * La, S[1] + ay * La];
		/* the hand: the arm's line, folded back toward the tail */
		var hb = ay < 0 ? aa + pose.flex * 1.1 : aa - pose.flex * 0.9;
		var Tp = [Wr[0] + cos(hb) * Lh, Wr[1] + sin(hb) * Lh];
		var nx = -sin(aa), ny = cos(aa);
		if (nx < 0) { nx = -nx; ny = -ny; }
		var hx = -sin(hb), hy = cos(hb);
		if (hx < 0) { hx = -hx; hy = -hy; }
		var w = { S: S, W: Wr, T: Tp, Wt: [Wr[0] + nx * 19 * k, Wr[1] + ny * 19 * k], R: [14 * k, -3.5], hb: hb, hx: hx, hy: hy, ax: ax, ay: ay, Lh: Lh, prim: [] };
		for (var i = 0; i < 7; i++) {
			var q = i / 6;
			var bx = lerp(Wr[0], Tp[0], 0.35 + 0.25 * q), by = lerp(Wr[1], Tp[1], 0.35 + 0.25 * q);
			var ang = hb + (q - 0.3) * (0.25 + 0.55 * pose.spread) * (ay < 0 ? 1 : -1);
			var L = Lh * (0.62 - 0.05 * abs(q - 0.3));
			w.prim.push([bx, by, bx + cos(ang) * L, by + sin(ang) * L, ang, q]);
		}
		return w;
	}
	function hnWingPath(g, w) {
		g.beginPath();
		g.moveTo(w.S[0], w.S[1]);
		g.quadraticCurveTo((w.S[0] + w.W[0]) / 2 - w.ax * 2, (w.S[1] + w.W[1]) / 2 - 2.5, w.W[0], w.W[1]);
		g.quadraticCurveTo((w.W[0] + w.T[0]) / 2, (w.W[1] + w.T[1]) / 2 - 1.5 * (w.ay < 0 ? -1 : 1), w.T[0], w.T[1]);
		g.quadraticCurveTo((w.T[0] + w.Wt[0]) / 2 + w.hx * 6, (w.T[1] + w.Wt[1]) / 2 + w.hy * 6, w.Wt[0], w.Wt[1]);
		g.quadraticCurveTo((w.Wt[0] + w.R[0]) / 2 + 2, (w.Wt[1] + w.R[1]) / 2 + 2, w.R[0], w.R[1]);
		g.closePath();
	}
	function hnDrawWing(g, w, far) {
		var f = far ? HN.farTint : 1, i;
		/* the flight feathers: the whole wing, dark */
		hnWingPath(g, w);
		g.fillStyle = hnShade(HN.flight, f); g.fill();
		/* the primaries, separate at the tip, each with its shaft */
		for (i = 0; i < 7; i++) {
			var p = w.prim[i], ang = p[4], px = -sin(ang) * 2.1, py = cos(ang) * 2.1;
			g.beginPath();
			g.moveTo(p[0] - px, p[1] - py);
			g.quadraticCurveTo(p[2] - px * 0.6 - cos(ang) * 3, p[3] - py * 0.6 - sin(ang) * 3, p[2], p[3]);
			g.quadraticCurveTo(p[2] + px * 0.6 - cos(ang) * 3, p[3] + py * 0.6 - sin(ang) * 3, p[0] + px, p[1] + py);
			g.closePath();
			g.fillStyle = hnShade(HN.prim, f * (0.9 + 0.2 * p[5])); g.fill();
			g.strokeStyle = hnShade(HN.rachis, f); g.lineWidth = 0.35;
			g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); g.stroke();
		}
		/* the coverts: the slate inner wing over the flight feathers */
		var cT = [lerp(w.W[0], w.T[0], 0.25), lerp(w.W[1], w.T[1], 0.25)];
		var cB = [lerp(w.Wt[0], w.R[0], 0.12), lerp(w.Wt[1], w.R[1], 0.12)];
		g.beginPath();
		g.moveTo(w.S[0], w.S[1]);
		g.quadraticCurveTo((w.S[0] + w.W[0]) / 2 - w.ax * 2, (w.S[1] + w.W[1]) / 2 - 2.5, w.W[0], w.W[1]);
		g.lineTo(cT[0], cT[1]);
		g.quadraticCurveTo(lerp(cT[0], cB[0], 0.5) + w.hx * 3, lerp(cT[1], cB[1], 0.5) + w.hy * 3, cB[0], cB[1]);
		g.quadraticCurveTo((cB[0] + w.R[0]) / 2, (cB[1] + w.R[1]) / 2 - 1, w.R[0], w.R[1]);
		g.closePath();
		var gr = g.createLinearGradient(w.S[0], w.S[1], cB[0], cB[1]);
		gr.addColorStop(0, hnShade(HN.cov, f)); gr.addColorStop(1, hnShade(HN.cov2, f));
		g.fillStyle = gr; g.fill();
		/* two soft rows of coverts */
		g.strokeStyle = hnShade(HN.covLine, f); g.lineWidth = 0.5;
		for (i = 1; i <= 2; i++) {
			var t = i / 3, a0 = [lerp(w.S[0], w.R[0], t), lerp(w.S[1], w.R[1], t)], a1 = [lerp(w.W[0], cB[0], t), lerp(w.W[1], cB[1], t)];
			g.beginPath(); g.moveTo(a0[0], a0[1]);
			g.quadraticCurveTo((a0[0] + a1[0]) / 2 + w.hx * 1.5, (a0[1] + a1[1]) / 2 + w.hy * 1.5, a1[0], a1[1]); g.stroke();
		}
		g.lineCap = 'round';
		/* the pale leading edge of the near arm */
		if (!far) {
			g.strokeStyle = HN.edge; g.lineWidth = 0.7;
			g.beginPath(); g.moveTo(lerp(w.S[0], w.W[0], 0.1), lerp(w.S[1], w.W[1], 0.1) + 0.6); g.lineTo(lerp(w.S[0], w.W[0], 0.5), lerp(w.S[1], w.W[1], 0.5) + 0.5); g.stroke();
		}
		/* rust at the wrist */
		g.strokeStyle = hnShade(HN.wrist, f); g.lineWidth = 1.8;
		g.beginPath(); g.moveTo(lerp(w.S[0], w.W[0], 0.55), lerp(w.S[1], w.W[1], 0.55) - 0.6); g.lineTo(w.W[0], w.W[1]); g.stroke();
	}
	/* The head with its plumes and bill, at (hx, hy); pl bends the plumes. */
	function hnHead(g, hx, hy, pl, r) {
		r = r || 1;
		g.fillStyle = HN.neckBack;
		g.beginPath(); g.ellipse(hx, hy, 5.2 * r, 4.1 * r, -0.12, 0, TAU); g.fill();
		g.fillStyle = HN.face;
		g.beginPath(); g.ellipse(hx - 1.8 * r, hy + 0.6 * r, 3.5 * r, 2.6 * r, -0.2, 0, TAU); g.fill();
		/* the black stripe over the eye, back into two plumes */
		g.fillStyle = HN.cap;
		g.beginPath();
		g.moveTo(hx - 4 * r, hy - 1.4 * r);
		g.quadraticCurveTo(hx, hy - 4.1 * r, hx + 5 * r, hy - 2.6 * r);
		g.lineTo(hx + 4.8 * r, hy - 1.2 * r);
		g.quadraticCurveTo(hx, hy - 2.3 * r, hx - 3.8 * r, hy - 0.5 * r);
		g.closePath(); g.fill();
		g.strokeStyle = HN.cap; g.lineCap = 'round'; g.lineWidth = 0.75;
		g.beginPath(); g.moveTo(hx + 4.2 * r, hy - 2 * r); g.quadraticCurveTo(hx + 9.5 * r, hy - 3 * r + pl * 0.4, hx + 14.5 * r, hy - r + pl * 0.6); g.stroke();
		g.beginPath(); g.moveTo(hx + 4 * r, hy - 1.5 * r); g.quadraticCurveTo(hx + 8.5 * r, hy - 1.8 * r, hx + 12.5 * r, hy + 0.5 * r + pl * 0.3); g.stroke();
		/* the bill: deep at the base, the culmen almost straight */
		var bx = hx - 3.6 * r, by = hy + 0.6 * r;
		g.beginPath();
		g.moveTo(bx + 0.8 * r, by - 1.9 * r);
		g.quadraticCurveTo(bx - 10 * r, by - 1.5 * r, bx - 24 * r, by + 0.7 * r);
		g.quadraticCurveTo(bx - 10 * r, by + 1.9 * r, bx + 0.8 * r, by + 2 * r);
		g.closePath();
		var bg = g.createLinearGradient(0, by - 2 * r, 0, by + 2 * r);
		bg.addColorStop(0, HN.billTop); bg.addColorStop(0.45, HN.bill); bg.addColorStop(1, HN.bill);
		g.fillStyle = bg; g.fill();
		g.strokeStyle = 'rgba(90,70,30,.6)'; g.lineWidth = 0.4;
		g.beginPath(); g.moveTo(bx + 1.2 * r, by + 0.5 * r); g.quadraticCurveTo(bx - 10 * r, by + 0.6 * r, bx - 21 * r, by + 0.75 * r); g.stroke();
		g.fillStyle = HN.eye;
		g.beginPath(); g.arc(hx - 2 * r, hy - 0.4 * r, 1.05 * r, 0, TAU); g.fill();
		g.fillStyle = '#111';
		g.beginPath(); g.arc(hx - 2.15 * r, hy - 0.4 * r, 0.5 * r, 0, TAU); g.fill();
	}
	/* streaks down a cubic (the pale foreneck) */
	function hnStreaks(g, P, n) {
		g.strokeStyle = HN.streak; g.lineWidth = 0.42;
		for (var i = 0; i < n; i++) {
			var u = (i + 0.5) / n, v = 1 - u;
			var sx = v * v * v * P[0] + 3 * v * v * u * P[2] + 3 * v * u * u * P[4] + u * u * u * P[6];
			var sy = v * v * v * P[1] + 3 * v * v * u * P[3] + 3 * v * u * u * P[5] + u * u * u * P[7];
			g.beginPath(); g.moveTo(sx + 0.4, sy - 0.6); g.lineTo(sx - 0.2, sy + 0.6); g.stroke();
		}
	}
	/* The flying bird, legs excluded (they are drawn live), no bob. */
	function hnFly(g, pose) {
		var far = hnWing(pose, true), near = hnWing(pose, false), i;
		hnDrawWing(g, far, true);
		/* the tail: short and square */
		g.fillStyle = HN.tail;
		g.beginPath(); g.moveTo(14, -3.2); g.lineTo(27, -2.4); g.lineTo(27, 1.4); g.lineTo(14, 3); g.closePath(); g.fill();
		/* the body: a long teardrop, slate over a darker belly */
		g.beginPath();
		g.moveTo(-17, -1);
		g.bezierCurveTo(-14, -8, 6, -7.5, 18, -2.8);
		g.bezierCurveTo(19, 0.5, 14, 5.5, 6, 6.6);
		g.bezierCurveTo(-4, 7.6, -14, 6, -17, -1);
		g.closePath();
		var gr = g.createLinearGradient(0, -7, 0, 7);
		gr.addColorStop(0, HN.back); gr.addColorStop(0.55, HN.back2); gr.addColorStop(1, HN.belly);
		g.fillStyle = gr; g.fill();
		g.strokeStyle = 'rgba(236,231,221,.55)'; g.lineWidth = 0.55;
		for (i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-10 + i * 4, 4.4); g.lineTo(-7 + i * 4, 5.6); g.stroke(); }
		g.fillStyle = HN.thigh;
		g.beginPath(); g.ellipse(9.5, 4.6, 3.8, 1.9, 0.05, 0, TAU); g.fill();
		/* the folded neck: a slim S forward and down from the shoulders,
		 * back up under the head, which sits drawn in on the chest */
		var hx = -28, hy = -5.5 + pose.neck;
		g.lineCap = 'round'; g.lineJoin = 'round';
		g.strokeStyle = HN.neckBack; g.lineWidth = 6.2;
		g.beginPath(); g.moveTo(-12.5, -3); g.bezierCurveTo(-17, 3.4, -23.5, 5.6, -26.2, 0.6); g.lineTo(hx + 0.5, hy + 1); g.stroke();
		g.strokeStyle = HN.neck; g.lineWidth = 2.5;
		g.beginPath(); g.moveTo(-14.5, 1.4); g.bezierCurveTo(-18.8, 6.2, -25.5, 8, -28.3, 2.4); g.stroke();
		hnStreaks(g, [-14.5, 1.4, -18.8, 6.2, -25.5, 8, -28.3, 2.4], 6);
		hnHead(g, hx, hy, pose.neck);
		hnDrawWing(g, near, false);
	}
	/* The legs, live: 0 = trailing straight back past the tail, 1 = hanging
	 * down and reaching forward for the landing. The heel bends back. */
	function hnLegs(g, legs) {
		var e = hnEase(legs), a1 = lerp(-0.05, 1.3, e), a2 = lerp(-0.06, 2.0, e), ta = lerp(-0.1, 2.5, e);
		g.strokeStyle = HN.leg; g.lineCap = 'round'; g.lineJoin = 'round';
		for (var i = 0; i < 2; i++) {
			var hx = 10 + i * 0.5, hy = 4.5 + i, kx = hx + cos(a1 + i * 0.06) * 18, ky = hy + sin(a1 + i * 0.06) * 18;
			var fx = kx + cos(a2 - i * 0.1) * 24, fy = ky + sin(a2 - i * 0.1) * 24;
			g.lineWidth = i ? 1.5 : 1.7;
			g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy);
			g.lineTo(fx + cos(ta) * 5, fy + sin(ta) * 5); g.stroke();
		}
	}
	/* Standing in the shallows, origin at the feet: long legs with the
	 * heel joint, rust thighs, the body tilted up with the wing folded and
	 * the black shoulder patch, shaggy pale breast plumes, the neck up in
	 * an S and the head level. */
	function hnStand(g) {
		g.lineCap = 'round'; g.lineJoin = 'round';
		/* legs */
		g.strokeStyle = HN.leg; g.lineWidth = 1.8;
		g.beginPath(); g.moveTo(1.5, -36); g.lineTo(0.5, -18); g.lineTo(-0.5, 0); g.moveTo(-0.5, 0); g.lineTo(-5, 0.6); g.stroke();
		g.lineWidth = 1.6;
		g.beginPath(); g.moveTo(5, -36); g.lineTo(6.5, -18); g.lineTo(7.5, 0); g.lineTo(3, 0.6); g.stroke();
		g.fillStyle = HN.thigh;
		g.beginPath(); g.ellipse(3, -37, 3.6, 2.6, 0.2, 0, TAU); g.fill();
		/* body and folded wing, tilted up at the front */
		g.save(); g.translate(6, -45); g.rotate(0.42);
		g.beginPath();
		g.moveTo(-18, -2);
		g.bezierCurveTo(-15, -10, 8, -10, 21, -2.5);
		g.bezierCurveTo(22, 3, 12, 8.5, 0, 8.5);
		g.bezierCurveTo(-11, 8.5, -18, 4.5, -18, -2);
		g.closePath();
		var gr = g.createLinearGradient(0, -10, 0, 8.5);
		gr.addColorStop(0, HN.back); gr.addColorStop(0.6, HN.back2); gr.addColorStop(1, HN.belly);
		g.fillStyle = gr; g.fill();
		/* the folded flight feathers down the back to the tail */
		g.fillStyle = HN.prim;
		g.beginPath(); g.moveTo(-1, 0); g.quadraticCurveTo(14, -4, 27, 1.2); g.quadraticCurveTo(15, 6.5, 0, 5); g.closePath(); g.fill();
		/* the coverts over them, with one soft row */
		var cg = g.createLinearGradient(-14, -8, 12, 3);
		cg.addColorStop(0, HN.cov); cg.addColorStop(1, HN.cov2);
		g.fillStyle = cg;
		g.beginPath(); g.moveTo(-14, -3); g.bezierCurveTo(-10, -9.5, 9, -9, 18, -2); g.quadraticCurveTo(5, 4, -12, 2.5); g.closePath(); g.fill();
		g.strokeStyle = HN.covLine; g.lineWidth = 0.5;
		g.beginPath(); g.moveTo(-9, -1.5); g.quadraticCurveTo(3, -4.5, 13, -1); g.stroke();
		g.beginPath(); g.moveTo(-6, 1); g.quadraticCurveTo(5, -1.5, 15, 1); g.stroke();
		/* the black shoulder patch and the rust bend of the wing */
		g.fillStyle = HN.cap;
		g.beginPath(); g.ellipse(-14, 1.5, 3.4, 2.6, 0.3, 0, TAU); g.fill();
		g.strokeStyle = HN.wrist; g.lineWidth = 1.6;
		g.beginPath(); g.moveTo(-14.5, -2.5); g.lineTo(-10, -5.5); g.stroke();
		g.restore();
		/* the neck: a thick S up from the front of the body to the head */
		g.strokeStyle = HN.neckBack; g.lineWidth = 6.6;
		g.beginPath(); g.moveTo(-6, -53); g.bezierCurveTo(-15, -61, -1, -69, -5.5, -79); g.stroke();
		g.strokeStyle = HN.neck; g.lineWidth = 3;
		var P = [-8.6, -53, -17.2, -61, -3.6, -68.5, -8.2, -78];
		g.beginPath(); g.moveTo(P[0], P[1]); g.bezierCurveTo(P[2], P[3], P[4], P[5], P[6], P[7]); g.stroke();
		hnStreaks(g, P, 6);
		/* shaggy pale plumes hanging over the breast */
		g.strokeStyle = 'rgba(214,220,228,.9)'; g.lineWidth = 0.8;
		for (var i = 0; i < 6; i++) {
			g.beginPath(); g.moveTo(-10 + i * 0.8, -55 + i * 0.5); g.quadraticCurveTo(-13 + i * 0.5, -49 + i, -11.5 + i * 0.9, -43 + i * 1.1); g.stroke();
		}
		hnHead(g, -6, -81, 0.6, 1.05);
	}
	/* Each pose's box in units, a little generous: the body, the bill and
	 * the head plumes, both wings and their primaries. */
	function hnBounds(key) {
		if (key === 's') { return [-36, -92, 34, 3]; }
		var p = hnPose(key), b = [-57, -13, 30, 10], ws = [hnWing(p, true), hnWing(p, false)];
		function add(x, y) { b[0] = mn(b[0], x); b[1] = mn(b[1], y); b[2] = mx2(b[2], x); b[3] = mx2(b[3], y); }
		for (var i = 0; i < 2; i++) {
			var w = ws[i];
			add(w.W[0], w.W[1]); add(w.T[0], w.T[1]); add(w.Wt[0], w.Wt[1]);
			add(w.T[0] + w.hx * 6, w.T[1] + w.hy * 6);
			for (var j = 0; j < 7; j++) { add(w.prim[j][2], w.prim[j][3]); }
		}
		return [MT.floor(b[0] - 4), MT.floor(b[1] - 4), MT.ceil(b[2] + 4), MT.ceil(b[3] + 4)];
	}
	/* ---------- The full moon (4.10.0, Rob: "Real full moon, clear sky") --
	 * The near side as it hangs over Florida, north up: the dark maria that
	 * make the "man in the moon", each placed from its real selenographic
	 * centre (latitude, longitude) and size and projected onto the disc, so
	 * Crisium sits near the right-hand limb, Imbrium is the big upper-left
	 * eye, Serenitatis the right one, Tranquillitatis below it, Procellarum
	 * the grey sweep down the left side. The young craters show as they do
	 * at full moon: Tycho bright near the south with its long rays,
	 * Copernicus, Kepler and Aristarchus bright on the western maria,
	 * Proclus by Crisium; Plato and Grimaldi are dark floors. Faint mottling
	 * in the highlands, gentle shading toward the limb, a faint glow. No
	 * clouds. Pre-rendered once (moonPaint) and drawn as one image.
	 * Rows: [lat, lon, radius (all degrees), darkness 0-1, seed]. */
	var MARIA = [
		[32.8, -15.6, 18.5, 0.62, 1], [28.0, 17.5, 11.0, 0.5, 2], [8.5, 31.4, 13.5, 0.66, 3],
		[17.0, 59.1, 9.0, 0.7, 4], [-7.8, 51.3, 12.5, 0.58, 5], [-15.2, 35.5, 5.6, 0.55, 6],
		[-21.3, -16.6, 11.0, 0.52, 7], [-24.4, -38.6, 6.4, 0.6, 8], [13.3, 3.6, 4.2, 0.5, 9],
		[7.5, -30.9, 8.0, 0.55, 10], [-10.0, -23.1, 4.6, 0.5, 11], [2.4, 1.7, 3.0, 0.42, 12],
		[10.9, -8.8, 3.6, 0.5, 13], [44.1, -31.5, 4.0, 0.5, 14],
		/* Oceanus Procellarum: a broad irregular sweep, built from overlaps */
		[10, -50, 16, 0.56, 15], [26, -55, 15, 0.56, 16], [40, -48, 11, 0.52, 17], [-2, -44, 13, 0.52, 18],
		[-8, -56, 11, 0.52, 19], [30, -38, 11, 0.54, 20], [16, -66, 10, 0.54, 21], [-14, -40, 9, 0.5, 31],
		/* Mare Frigoris: the thin band across the north */
		[56, -38, 5, 0.45, 22], [57, -22, 5.5, 0.45, 23], [57, -6, 5, 0.45, 24], [58, 10, 5, 0.45, 25], [57, 26, 4.5, 0.42, 26],
		/* small maria near the eastern limb */
		[15.6, 87, 6, 0.5, 27], [1.3, 86.9, 5.5, 0.45, 28], [7, 68.5, 3.5, 0.45, 29], [-1, 65, 3, 0.4, 30]
	];
	function mRng(seed) {
		var a = seed * 2654435761 >>> 0;
		return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = MT.imul(t ^ (t >>> 15), t | 1); t ^= t + MT.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}
	var DEG = MT.PI / 180;
	/* the point rho away from (lat, lon) along bearing b (radians), on the sphere */
	function mDest(lat, lon, rho, b) {
		var la = MT.asin(sin(lat) * cos(rho) + cos(lat) * sin(rho) * cos(b));
		return [la, lon + atan2(sin(b) * sin(rho) * cos(lat), cos(rho) - sin(lat) * sin(la))];
	}
	/* orthographic, north up, east (positive longitude) to the right */
	function mProj(lat, lon) {
		var x = cos(lat) * sin(lon), y = -sin(lat), z = cos(lat) * cos(lon);
		if (z < 0) { var n = sqrt(x * x + y * y) || 1; x /= n; y /= n; }
		return [x, y, z];
	}
	function mBlob(g, r, lat, lon, rho, rnd2) {
		var a1 = rnd2() * TAU, a2 = rnd2() * TAU, a3 = rnd2() * TAU, a4 = rnd2() * TAU, k1 = 0.06 + rnd2() * 0.06, k2 = 0.04 + rnd2() * 0.04;
		g.beginPath();
		for (var i = 0; i <= 72; i++) {
			var b = TAU * i / 72, rr = rho * (1 + k1 * sin(2 * b + a1) + k2 * sin(3 * b + a2) + 0.035 * sin(5 * b + a3) + 0.025 * sin(9 * b + a4));
			var d = mDest(lat, lon, rr, b), p = mProj(d[0], d[1]);
			if (i) { g.lineTo(p[0] * r, p[1] * r); } else { g.moveTo(p[0] * r, p[1] * r); }
		}
		g.closePath();
	}
	function mSpot(g, r, lat, lon, rad, color, alpha) {
		var p = mProj(lat * DEG, lon * DEG);
		if (p[2] <= 0) { return; }
		/* foreshortened toward the limb: squash along the radius */
		var d = sqrt(p[0] * p[0] + p[1] * p[1]), ang = atan2(p[1], p[0]);
		g.save();
		g.translate(p[0] * r, p[1] * r); g.rotate(ang); g.scale(mx2(0.3, p[2]), 1);
		var gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
		gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
		g.globalAlpha = alpha; g.fillStyle = gr;
		g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.fill();
		g.restore();
		return d;
	}
	/* rays: great-circle streaks out of a crater */
	function mRays(g, r, lat, lon, n, len0, len1, alpha, seed) {
		var R2 = mRng(seed);
		g.lineCap = 'round';
		for (var i = 0; i < n; i++) {
			var b = TAU * i / n + R2() * 0.4, L = (len0 + R2() * (len1 - len0)) * DEG, w = r * (0.012 + R2() * 0.014);
			for (var j = 0; j < 10; j++) {
				var d0 = mDest(lat * DEG, lon * DEG, L * j / 10, b), d1 = mDest(lat * DEG, lon * DEG, L * (j + 1) / 10, b);
				var p0 = mProj(d0[0], d0[1]), p1 = mProj(d1[0], d1[1]);
				if (p0[2] <= 0 || p1[2] <= 0) { break; }
				g.globalAlpha = alpha * (1 - j / 10);
				g.strokeStyle = '#FFFDF4'; g.lineWidth = w * (1 - j / 14);
				g.beginPath(); g.moveTo(p0[0] * r, p0[1] * r); g.lineTo(p1[0] * r, p1[1] * r); g.stroke();
			}
		}
		g.globalAlpha = 1;
	}
	/* Paint the moon of radius r centred on the origin, glow included (the
	 * glow reaches 1.3 r). */
	function moonPaint(g, r) {
		var i, R1 = mRng(99);
		/* the faint glow */
		var gl = g.createRadialGradient(0, 0, r * 0.95, 0, 0, r * 1.3);
		gl.addColorStop(0, 'rgba(255,248,226,.36)'); gl.addColorStop(0.4, 'rgba(255,246,220,.12)'); gl.addColorStop(1, 'rgba(255,244,214,0)');
		g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 1.3, 0, TAU); g.fill();
		g.save();
		g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
		/* the highlands: warm grey-white, a touch brighter to the south */
		var hl = g.createLinearGradient(0, -r, 0, r);
		hl.addColorStop(0, '#E7E3D6'); hl.addColorStop(1, '#EFEBDF');
		g.fillStyle = hl; g.fillRect(-r, -r, 2 * r, 2 * r);
		/* the highlands' fine texture: a dust of tiny, low-contrast specks
		 * and a few broad, faint variations — never visible dots */
		for (i = 0; i < 26; i++) {
			mSpot(g, r, MT.asin(R1() * 2 - 1) / DEG, (R1() * 2 - 1) * 85, r * (0.12 + R1() * 0.18), R1() < 0.5 ? '#D3CEBF' : '#F6F3EA', 0.25);
		}
		var sp = mx2(1, r / 60);
		for (i = 0; i < 1400; i++) {
			var px = (R1() * 2 - 1) * r, py = (R1() * 2 - 1) * r;
			if (px * px + py * py > r * r) { continue; }
			g.globalAlpha = 0.05 + R1() * 0.08;
			g.fillStyle = R1() < 0.55 ? '#8F8A7E' : '#FFFFFF';
			g.fillRect(px, py, sp * (0.5 + R1()), sp * (0.5 + R1()));
		}
		g.globalAlpha = 1;
		/* the maria: painted solid on a small canvas and scaled up, which
		 * softens their edges the way the eye sees them (no canvas filter:
		 * Safari has none). Two layers: a wide faint one, a firmer core. */
		[[7, 0.3, 1.1], [2.4, 0.42, 1]].forEach(function (L) {
			var k = L[0], n = MT.ceil(2 * r / k) + 2, c = D.createElement('canvas');
			c.width = c.height = n;
			var q = c.getContext('2d');
			if (!q) { return; }
			q.translate(n / 2, n / 2);
			for (var j = 0; j < MARIA.length; j++) {
				var m = MARIA[j];
				mBlob(q, r / k, m[0] * DEG, m[1] * DEG, m[2] * DEG * L[2], mRng(m[4]));
				var v = MT.round(255 * (1 - m[3]));
				q.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
				q.globalCompositeOperation = 'darken';
				q.fill();
			}
			/* white where there is no mare, so 'multiply' leaves it alone */
			q.globalCompositeOperation = 'destination-over';
			q.fillStyle = '#FFFFFF'; q.fillRect(-n, -n, 2 * n, 2 * n);
			g.save();
			g.globalAlpha = L[1];
			g.globalCompositeOperation = 'multiply';
			g.imageSmoothingEnabled = true;
			if ('imageSmoothingQuality' in g) { g.imageSmoothingQuality = 'high'; }
			g.drawImage(c, -n / 2 * k, -n / 2 * k, n * k, n * k);
			g.restore();
		});
		/* the maria's cool grey cast and a little texture inside them */
		for (i = 0; i < 40; i++) {
			var mm = MARIA[(R1() * 14) | 0], dd = mDest(mm[0] * DEG, mm[1] * DEG, mm[2] * 0.75 * R1() * DEG, R1() * TAU);
			mSpot(g, r, dd[0] / DEG, dd[1] / DEG, r * (0.08 + R1() * 0.1), R1() < 0.5 ? '#5F6672' : '#9A9890', 0.08);
		}
		/* the dark floors */
		mSpot(g, r, 51.6, -9.4, r * 0.05, '#3F444C', 0.75);   /* Plato */
		mSpot(g, r, -5.2, -68.6, r * 0.07, '#454950', 0.7);   /* Grimaldi */
		/* the bright craters and their rays */
		mRays(g, r, -43.3, -11.2, 18, 18, 62, 0.3, 7);        /* Tycho */
		mRays(g, r, 9.6, -20.1, 12, 8, 22, 0.2, 8);           /* Copernicus */
		mRays(g, r, 8.1, -38, 9, 5, 14, 0.16, 9);             /* Kepler */
		mRays(g, r, 16.1, 46.8, 7, 6, 16, 0.18, 10);          /* Proclus */
		mSpot(g, r, -43.3, -11.2, r * 0.07, '#FFFFFA', 0.95);
		mSpot(g, r, -43.3, -11.2, r * 0.03, '#FFFFFF', 1);
		mSpot(g, r, 9.6, -20.1, r * 0.055, '#FFFDF2', 0.9);
		mSpot(g, r, 8.1, -38, r * 0.035, '#FFFDF2', 0.85);
		mSpot(g, r, 23.7, -47.4, r * 0.04, '#FFFFFF', 1);      /* Aristarchus, the brightest spot */
		mSpot(g, r, 16.1, 46.8, r * 0.03, '#FFFDF2', 0.85);
		mSpot(g, r, -8.9, 61.1, r * 0.025, '#FFFDF2', 0.7);    /* Langrenus */
		/* gentle shading toward the limb, a little warm */
		var ld = g.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
		ld.addColorStop(0, 'rgba(80,70,55,0)'); ld.addColorStop(0.75, 'rgba(80,70,55,.08)'); ld.addColorStop(1, 'rgba(70,60,48,.3)');
		g.fillStyle = ld; g.fillRect(-r, -r, 2 * r, 2 * r);
		g.restore();
		/* a crisp but soft limb */
		g.strokeStyle = 'rgba(255,252,240,.45)'; g.lineWidth = mx2(0.6, r * 0.012);
		g.beginPath(); g.arc(0, 0, r - g.lineWidth / 2, 0, TAU); g.stroke();
	}

	/* ---------- The witch (4.10.0, drawn to the heron's standard) ---------
	 * Seated upright on her broom (Rob's 4.9.0 pick) with her black cat on
	 * the handle behind her (his 4.2.0 pick): pointed hat with a purple band
	 * and buckle, long dark hair, a profile with the long nose, bodice and
	 * bell sleeve, a skirt that flutters, purple-and-black striped
	 * stockings, pointed boots; an ash handle with a twine collar and a
	 * fan of separate straw bristles. Faces LEFT; about 106 units from the
	 * handle's tip to the bristle ends, drawn at width / 100 px a unit.
	 * witchBody() is ONE phase of the riding cycle (the bristles flick, the
	 * hat tip, skirt hem and cat's tail sway); the engine pre-draws 12 of
	 * them at load. Her CAPE and HAIR are not in it: they are short chains
	 * the engine simulates live (gravity, air drag), so they trail behind
	 * her through the dive and the swoop. WITCH_CAPE / WITCH_HAIR are their anchors. */
	var WITCH_CAPE = [[-3, -22], [2.5, -17.5]], WITCH_CAPE_K = 4, WITCH_HAIR = [[-1.5, -29], [0.2, -27], [-0.8, -25]];
	var WITCH_BOX = [-56, -56, 58, 17];
	var WC = { ink: '#16131D', dress: '#1E1928', dress2: '#2A2236', purple: '#9C36B5', purple2: '#6E2A86', skin: '#E2CDB6', skin2: '#C4AA90',
		hat: '#17141E', band: '#9C36B5', gold: '#E2B23E', wood: '#6B4A2E', wood2: '#4A321F', twine: '#B89A62', straw: ['#C9A55A', '#B38F48', '#D8B96E', '#A07E3E'],
		boot: '#121016', stripe: '#7B2F96', cat: '#121016', catEye: '#F2D13A', hair: '#231D2B' };
	function witchBody(g, ph) {
		var T = ph * TAU, i;
		g.lineCap = 'round'; g.lineJoin = 'round';
		/* the far leg, in shadow */
		g.strokeStyle = '#0E0C12'; g.lineWidth = 2.6;
		g.beginPath(); g.moveTo(3, -3); g.lineTo(-7, 0.5); g.lineTo(-7.5, 8); g.stroke();
		g.fillStyle = '#0E0C12';
		g.beginPath(); g.moveTo(-6, 7); g.lineTo(-9, 9.6); g.quadraticCurveTo(-13, 10, -14.5, 7.8); g.lineTo(-9, 7.4); g.closePath(); g.fill();
		/* the broom handle: ash, a little bowed, with a knot */
		var hg = g.createLinearGradient(0, -3.4, 0, 2.6);
		hg.addColorStop(0, '#8A6544'); hg.addColorStop(0.5, WC.wood); hg.addColorStop(1, WC.wood2);
		g.strokeStyle = hg; g.lineWidth = 2.4;
		g.beginPath(); g.moveTo(-52, -3.2); g.quadraticCurveTo(-14, -1.6, 27, 1); g.stroke();
		g.fillStyle = WC.wood2; g.beginPath(); g.ellipse(-31, -2.3, 1.1, 0.7, 0, 0, TAU); g.fill();
		/* the bristles: separate straws fanning back, each flicking a little */
		for (i = 0; i < 16; i++) {
			var q = i / 15, a0 = lerp(-0.2, 0.36, q) + 0.07 * sin(T + i * 0.9) + 0.03 * sin(2 * T + i * 1.7);
			var L = 22 + 4 * sin(i * 2.3) + (q > 0.4 && q < 0.7 ? 3 : 0);
			var bx = 27 + q * 1.2, by = -1.6 + q * 4.6;
			g.strokeStyle = WC.straw[i % 4]; g.lineWidth = 0.9 - q * 0.15;
			g.beginPath(); g.moveTo(bx, by);
			g.quadraticCurveTo(bx + L * 0.55 * cos(a0 * 0.6), by + L * 0.55 * sin(a0 * 0.6), bx + L * cos(a0), by + L * sin(a0)); g.stroke();
		}
		/* the twine collar binding them on */
		g.fillStyle = WC.twine;
		g.beginPath(); g.moveTo(24.5, -2.8); g.lineTo(30, -2.4); g.lineTo(30.4, 4.4); g.lineTo(24.8, 3.8); g.closePath(); g.fill();
		g.strokeStyle = '#7E6538'; g.lineWidth = 0.5;
		for (i = 0; i < 4; i++) { g.beginPath(); g.moveTo(25.4 + i * 1.3, -2.6); g.lineTo(25.7 + i * 1.3, 4.1); g.stroke(); }
		/* the cat, sitting on the handle behind her, tail curling */
		var ct = sin(T) * 0.5;
		g.strokeStyle = WC.cat; g.lineWidth = 1.5;
		g.beginPath(); g.moveTo(20.5, -2.5); g.bezierCurveTo(25, -4, 23 + ct * 2, -11, 21 + ct * 3, -12.5 - ct); g.stroke();
		/* a thin purple rim keeps the black cat clear of the cape behind it */
		g.strokeStyle = WC.purple; g.lineWidth = 0.9;
		g.beginPath(); g.ellipse(18, -4.2, 3.9, 3.4, -0.2, 0, TAU); g.stroke();
		g.beginPath(); g.arc(14.6, -9.4, 2.5, 0, TAU); g.stroke();
		g.beginPath(); g.moveTo(12.7, -10.6); g.lineTo(12.9, -13.6); g.lineTo(14.4, -11.6); g.moveTo(15, -11.8); g.lineTo(16.6, -14.1); g.lineTo(16.8, -10.9); g.stroke();
		g.fillStyle = WC.cat;
		g.beginPath(); g.ellipse(18, -4.2, 3.9, 3.4, -0.2, 0, TAU); g.fill();
		g.beginPath(); g.ellipse(15.8, -6.2, 2.2, 2.6, 0.3, 0, TAU); g.fill();
		g.beginPath(); g.arc(14.6, -9.4, 2.5, 0, TAU); g.fill();
		g.beginPath(); g.moveTo(12.7, -10.6); g.lineTo(12.9, -13.6); g.lineTo(14.4, -11.6); g.closePath(); g.fill();
		g.beginPath(); g.moveTo(15, -11.8); g.lineTo(16.6, -14.1); g.lineTo(16.8, -10.9); g.closePath(); g.fill();
		g.fillStyle = WC.catEye;
		g.beginPath(); g.ellipse(13.4, -9.6, 0.55, 0.42, 0, 0, TAU); g.fill();
		g.beginPath(); g.ellipse(15.3, -9.7, 0.5, 0.42, 0, 0, TAU); g.fill();
		/* the skirt: over the hips and down, the hem fluttering back */
		var f1 = sin(T) * 1.2, f2 = sin(T + 1.3) * 1.6, f3 = sin(T + 2.4) * 1.3;
		var sk = g.createLinearGradient(-10, -9, 14, 8);
		sk.addColorStop(0, WC.dress2); sk.addColorStop(1, WC.dress);
		g.fillStyle = sk;
		g.beginPath();
		g.moveTo(7.5, -8.5); g.lineTo(-2.5, -9.2);
		g.quadraticCurveTo(-9, -5, -12.2, 0.5);
		g.lineTo(-12.8, 4.8);
		g.quadraticCurveTo(-8, 6.5 + f1 * 0.4, -3.5, 7 + f1);
		g.quadraticCurveTo(2, 8.6 + f2, 7.5, 8 + f2);
		g.quadraticCurveTo(12, 7.6 + f3, 15.5, 5.5 + f3);
		g.quadraticCurveTo(14, 1, 10.5, -3);
		g.closePath(); g.fill();
		g.strokeStyle = WC.purple2; g.lineWidth = 0.5;
		g.beginPath(); g.moveTo(-6, -3); g.quadraticCurveTo(-4, 2, -2.5, 6.8 + f1); g.moveTo(2, -4); g.quadraticCurveTo(4, 2, 5.5, 7.8 + f2); g.stroke();
		/* the near leg: striped stocking and a pointed boot */
		g.save();
		g.beginPath(); g.moveTo(-11.6, 3); g.lineTo(-8.4, 3); g.lineTo(-8.6, 9); g.lineTo(-11.8, 9); g.closePath(); g.clip();
		for (i = 0; i < 4; i++) { g.fillStyle = i % 2 ? WC.ink : WC.stripe; g.fillRect(-12, 3 + i * 1.6, 4, 1.6); }
		g.restore();
		g.fillStyle = WC.boot;
		g.beginPath(); g.moveTo(-8.3, 8.4); g.lineTo(-11.9, 8.3); g.quadraticCurveTo(-15.5, 9.6, -18.4, 8.2);
		g.quadraticCurveTo(-18.2, 10.8, -14.5, 11.4); g.lineTo(-8.4, 11.2); g.closePath(); g.fill();
		/* the bodice, leaning forward over the broom */
		var bd = g.createLinearGradient(-6, -21, 6, -8);
		bd.addColorStop(0, WC.dress2); bd.addColorStop(1, WC.dress);
		g.fillStyle = bd;
		g.beginPath(); g.moveTo(6.5, -8.5); g.lineTo(-3, -9.3); g.quadraticCurveTo(-6.5, -15, -5.6, -20.4);
		g.quadraticCurveTo(-2, -23, 1.8, -21.4); g.quadraticCurveTo(5.8, -15, 6.5, -8.5); g.closePath(); g.fill();
		g.strokeStyle = WC.purple; g.lineWidth = 0.45;
		g.beginPath(); g.moveTo(-4.4, -18.5); g.lineTo(-2.4, -10.5); g.stroke();
		/* the belt and its buckle */
		g.fillStyle = WC.purple2; g.beginPath(); g.moveTo(-3.2, -10.6); g.lineTo(6.6, -9.8); g.lineTo(6.5, -8.2); g.lineTo(-3, -9); g.closePath(); g.fill();
		g.strokeStyle = WC.gold; g.lineWidth = 0.45; g.strokeRect(0.2, -10.5, 1.8, 1.8);
		/* the arm reaching forward to the handle, a bell sleeve at the wrist */
		g.strokeStyle = WC.dress2; g.lineWidth = 3;
		g.beginPath(); g.moveTo(-2.4, -19); g.quadraticCurveTo(-10, -14, -14.6, -5.6); g.stroke();
		g.fillStyle = WC.dress2;
		g.beginPath(); g.moveTo(-13, -8); g.lineTo(-17.6, -6.4 + sin(T) * 0.4); g.lineTo(-15.6, -2.4); g.closePath(); g.fill();
		g.fillStyle = WC.skin;
		g.beginPath(); g.ellipse(-17.4, -3, 1.7, 1.3, 0.3, 0, TAU); g.fill();
		/* the head in profile: the long nose and pointed chin */
		g.fillStyle = WC.skin;
		g.beginPath();
		g.moveTo(-2.6, -24); g.quadraticCurveTo(-3, -31, -7.8, -30.6);
		g.quadraticCurveTo(-9.8, -29.4, -10.2, -27.4);
		g.lineTo(-13.4, -25.2); g.lineTo(-10.2, -25.4);
		g.quadraticCurveTo(-10.4, -24, -9.6, -23.4); g.quadraticCurveTo(-10.6, -21.6, -8.6, -21.4);
		g.quadraticCurveTo(-5.2, -21.4, -2.6, -24); g.closePath(); g.fill();
		g.fillStyle = WC.skin2;
		g.beginPath(); g.ellipse(-5, -24.6, 2.4, 2.6, 0, 0, TAU); g.fill();
		g.fillStyle = WC.ink; g.beginPath(); g.ellipse(-8.2, -27.4, 0.75, 0.55, -0.2, 0, TAU); g.fill();
		g.fillStyle = WC.catEye; g.beginPath(); g.arc(-8.4, -27.5, 0.28, 0, TAU); g.fill();
		g.strokeStyle = '#7A4E52'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(-9.8, -23.6); g.lineTo(-8.4, -23.4); g.stroke();
		/* hair under the brim, falling at the back of the head */
		g.fillStyle = WC.hair;
		g.beginPath(); g.moveTo(-8, -30.8); g.quadraticCurveTo(-1, -32.4, 0.6, -26); g.quadraticCurveTo(0.8, -22, -1.6, -20.6);
		g.quadraticCurveTo(-2, -25, -4.4, -28.4); g.closePath(); g.fill();
		/* the hat: a wide brim, a bent cone whose tip lags, a purple band and buckle */
		var tip = sin(T - 0.8) * 1.2;
		g.fillStyle = WC.hat;
		g.beginPath(); g.ellipse(-4.6, -31.2, 12.4, 2.5, -0.12, 0, TAU); g.fill();
		g.beginPath(); g.moveTo(-10, -31.6); g.quadraticCurveTo(-7, -40, -3, -44.5);
		g.quadraticCurveTo(1.5, -48.5, 9 + tip, -50.4 + tip * 0.6);
		g.quadraticCurveTo(4, -45.5, 2.2, -41); g.quadraticCurveTo(1.2, -36, 1.4, -32.6); g.closePath(); g.fill();
		g.strokeStyle = WC.purple2; g.lineWidth = 0.4;
		g.beginPath(); g.moveTo(-6.4, -37.6); g.quadraticCurveTo(-3.6, -41, -1.4, -43.6); g.stroke();
		g.fillStyle = WC.band;
		g.beginPath(); g.moveTo(-9.7, -32.4); g.lineTo(1.4, -33.2); g.lineTo(1.4, -35.4); g.lineTo(-8.9, -34.6); g.closePath(); g.fill();
		g.strokeStyle = WC.gold; g.lineWidth = 0.5; g.strokeRect(-5.4, -35.1, 2.1, 2);
		/* a thin purple rim on the brim and the cone, as in the old silhouette */
		g.strokeStyle = WC.purple; g.lineWidth = 0.35;
		g.beginPath(); g.ellipse(-4.6, -31.2, 12.4, 2.5, -0.12, 0, TAU); g.stroke();
	}
	/* The cape (4.10.1: cloth, not planks). S is a fan of strands, each a
	 * list of points from the shoulders to the hem, in the same units as
	 * the drawing. The strands start close together across her shoulders
	 * and spread to a wide hem, so the cape narrows to the shoulders and
	 * widens to a soft hem. Each panel between two strands is filled in its
	 * own tone, light and dark alternating like folds, with a curved fold
	 * line down the strand between; the hem sags in a scallop between strand
	 * tips, its lining showing in purple. Edges are smoothed through the
	 * points (quadratics through the midpoints), so nothing is straight. */
	var CAPE_TONES = ['#33224B', '#24183A', '#2F1F45', '#21152F'];
	/* a smooth line through P from the current point (P[0], or P[n] going
	 * back): quadratics with the points as controls, through the midpoints */
	function capeEdge(g, P, back) {
		var n = P.length - 1, j;
		if (!back) {
			for (j = 1; j < n; j++) { g.quadraticCurveTo(P[j][0], P[j][1], (P[j][0] + P[j + 1][0]) / 2, (P[j][1] + P[j + 1][1]) / 2); }
			g.lineTo(P[n][0], P[n][1]);
		} else {
			for (j = n - 1; j > 0; j--) { g.quadraticCurveTo(P[j][0], P[j][1], (P[j][0] + P[j - 1][0]) / 2, (P[j][1] + P[j - 1][1]) / 2); }
			g.lineTo(P[0][0], P[0][1]);
		}
	}

	/* the hem between two strand tips: a soft downward scallop */
	function capeHem(g, p, q, sag) {
		var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1], l = sqrt(dx * dx + dy * dy) || 1;
		/* sag away from the cape's middle: along the hem's normal, the side
		 * the strands point to */
		var nx = -dy / l, ny = dx / l;
		if (nx * sag[0] + ny * sag[1] < 0) { nx = -nx; ny = -ny; }
		g.quadraticCurveTo(mx + nx * l * 0.35, my + ny * l * 0.35, q[0], q[1]);
	}
	function witchCape(g, S) {
		var K = S.length, n = S[0].length - 1, j;
		/* which way the cape hangs: root to tip, averaged */
		var sx = 0, sy = 0;
		for (j = 0; j < K; j++) { sx += S[j][n][0] - S[j][0][0]; sy += S[j][n][1] - S[j][0][1]; }
		var sl = sqrt(sx * sx + sy * sy) || 1, sag = [sx / sl, sy / sl];
		g.lineJoin = 'round'; g.lineCap = 'round';
		for (j = 0; j < K - 1; j++) {
			var A = S[j], B = S[j + 1];
			g.beginPath(); g.moveTo(A[0][0], A[0][1]);
			capeEdge(g, A, false);
			capeHem(g, A[n], B[n], sag);
			capeEdge(g, B, true);
			g.closePath();
			g.fillStyle = CAPE_TONES[j % CAPE_TONES.length]; g.fill();
		}
		/* fold lines down the inner strands, from a little below the shoulders */
		g.strokeStyle = 'rgba(12,8,18,.5)'; g.lineWidth = 0.55;
		for (j = 1; j < K - 1; j++) {
			var P = S[j].slice(1);
			g.beginPath(); g.moveTo(P[0][0], P[0][1]); capeEdge(g, P, false); g.stroke();
		}
		/* the outer edges, a faint purple rim so the dark cape reads */
		g.strokeStyle = 'rgba(110,42,134,.55)'; g.lineWidth = 0.6;
		g.beginPath(); g.moveTo(S[0][0][0], S[0][0][1]); capeEdge(g, S[0], false); g.stroke();
		g.beginPath(); g.moveTo(S[K - 1][0][0], S[K - 1][0][1]); capeEdge(g, S[K - 1], false); g.stroke();
		/* the hem, with the lining showing */
		g.strokeStyle = '#7B3296'; g.lineWidth = 1.2;
		g.beginPath(); g.moveTo(S[0][n][0], S[0][n][1]);
		for (j = 0; j < K - 1; j++) { capeHem(g, S[j][n], S[j + 1][n], sag); }
		g.stroke();
	}
	function witchHair(g, s) {
		g.strokeStyle = WC.hair; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 1.5;
		g.beginPath();
		for (var i = 0; i < s.length; i++) {
			var c = s[i];
			g.moveTo(c[0][0], c[0][1]);
			for (var j = 1; j < c.length - 1; j++) { g.quadraticCurveTo(c[j][0], c[j][1], (c[j][0] + c[j + 1][0]) / 2, (c[j][1] + c[j + 1][1]) / 2); }
			g.lineTo(c[c.length - 1][0], c[c.length - 1][1]);
		}
		g.stroke();
	}
	/* Her in level flight to the left, cape and hair streaming as they
	 * settle at a steady speed: the Theme guide's picture and the sheets. */
	function witchStill(g, ph) {
		var S = [], i, j, K = WITCH_CAPE_K, N = 7;
		witchBody(g, ph);
		/* level flight to the left: the cape streams back and a little down,
		 * fanning from the shoulders, a slow ripple along it */
		for (j = 0; j < K; j++) {
			var q = j / (K - 1), r = [lerp(WITCH_CAPE[0][0], WITCH_CAPE[1][0], q), lerp(WITCH_CAPE[0][1], WITCH_CAPE[1][1], q)], c = [r];
			for (i = 1; i <= N; i++) {
				var t = i / N;
				c.push([r[0] + t * (30 + 4 * q), r[1] + t * (4 + 12 * q) + t * t * 3 + sin(ph * TAU * 2 - i * 1.1 + j * 0.7) * 1.6 * t]);
			}
			S.push(c);
		}
		witchCape(g, S);
		witchHair(g, WITCH_HAIR.map(function (a, k) {
			var c = [];
			for (j = 0; j <= 5; j++) { c.push([a[0] + j * 2.6, a[1] + j * (1.2 + k * 0.4) + sin(ph * TAU - j) * 0.4]); }
			return c;
		}));
	}


	/* Art drawn in code for the admin Theme guide: fn(g, width, height)
	 * paints it into that box (HERO_ART / SCENE_ART name the key). */
	var ART_DRAW = {
		heron: function (g, w, h) {
			var b = hnBounds('g6'), s = mn(w / (b[2] - b[0] + 26), h / (b[3] - b[1]));
			g.save();
			g.translate(w / 2 - (b[0] + b[2] + 26) / 2 * s, h / 2 - (b[1] + b[3]) / 2 * s);
			g.scale(s, s);
			hnLegs(g, 0);
			hnFly(g, hnPose('g6'));
			g.restore();
		},
		witch: function (g, w, h) {
			var b = WITCH_BOX, s2 = mn(w / (b[2] - b[0] + 20), h / (b[3] - b[1]));
			g.save();
			g.translate(w / 2 - (b[0] + b[2] + 20) / 2 * s2, h / 2 - (b[1] + b[3]) / 2 * s2);
			g.scale(s2, s2);
			witchStill(g, 0.2);
			g.restore();
		}
	};

	function start(boot) {
		var CFG = boot.cfg || {};
		var theme = boot.theme;
		var themeKey = boot.themeKey || 'florida_keys';
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
		/* PHONES (4.2.0): the sprite count follows the screen, on the same
		 * curve the subtle layer uses — clamp(width / 1280, 0.45, 1) — applied
		 * to the SPRITES only, never to the ripple reserve. At 390px density
		 * 16 gives 7 (13 → 6 on a water theme); from 1280px up, the full
		 * count. The width is the VIEWPORT's, not the canvas's: in content
		 * placement the canvas is only the column, and a 1280px screen must
		 * still get the full 16. A theme's own cap scales the same way but
		 * never below 3 ('classic' keeps its 1), so the MIX stays the same at
		 * the smaller total. Christmas carries a phone floor (phoneMin) that
		 * overrides its scaled cap. Rob's density setting is never touched. */
		function phoneScale() { return phoneScaleAt(W.innerWidth); }
		function partTarget() { return partTargetFor(A, CFG.density, W.innerWidth); }
		var maxParts = partTarget();
		var EVERY = CFG.every || TIMING.every, INF = 1e12;
		/* CFG.diag, not CFG.debug: the plugin has only ever emitted 'diag'
		 * (Plugin::config), so this read a key that was never sent and DEBUG
		 * was permanently false on every real page. The diagnostics PANEL
		 * still worked because it tests CFG.diag directly, which is why the
		 * mismatch stayed hidden — but _state, the forceNow/forceHour test
		 * hooks and the slow-frame report were all unreachable. */
		var DEBUG = DBG && !!CFG.diag;

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
			heroes: rich !== 'minimal'
		};

		/* Evening: 19:00–06:00 by the visitor's clock (mockable in tests). */
		function localNow() {
			return (DEBUG && CFG.forceNow != null) ? new Date(CFG.forceNow) : new Date();
		}
		var hour = (DEBUG && CFG.forceHour != null) ? CFG.forceHour : localNow().getHours();
		var evening = FX.evening && (hour >= 19 || hour < 6);

		/* Static corner accents (DOM, no motion, no assets). */
		/* Accents are built here but mounted with the canvas below, so they
		 * follow the layering setting: through 3.6.2 they sat on the body at
		 * z-index 99990 in EVERY mode, floating over text and widgets even
		 * when the owner had chosen "behind". */
		var accents = [];
		function accentEl(key, css) {
			if (!SVGS[key]) { return; }
			var el = D.createElement('div');
			el.setAttribute('aria-hidden', 'true');
			el.className = 'dcc-seasons-accent';
			el.style.cssText = 'position:fixed;pointer-events:none;' + css;
			el.innerHTML = svgDoc(SVGS[key]);
			accents.push(el);
		}
		if (A.accent && A.accent.svg) { accentEl(A.accent.svg, 'left:14px;bottom:14px;width:26px;opacity:.6;'); }
		if (rich === 'full' && ACCENTS[themeKey]) { accentEl(ACCENTS[themeKey][0], ACCENTS[themeKey][1]); }

		var cv = D.createElement('canvas');
		cv.setAttribute('aria-hidden', 'true');
		cv.className = 'dcc-seasons-canvas';

		/* --- Where the canvas is MOUNTED decides whether "behind" works. ---
		 *
		 * "In front of everything": body, at FRONT_Z (see the band below).
		 *
		 * "Behind": mounting on the body cannot express it. The theme's
		 * content column (Bravada/cryout: main.main) is position:relative
		 * with z-index:9 AND an opaque white background, so it establishes a
		 * stacking context and paints over any body-level canvas below 9 —
		 * and going above 9 is just "front" again. There is no body-level
		 * z-index that lands BETWEEN that white background and the text on
		 * top of it, which is what "behind" means.
		 *
		 * So the canvas is mounted INSIDE that element with z-index:-1. Per
		 * the CSS painting order a negative-z-index positioned descendant
		 * paints after its stacking context's own background and border but
		 * before that context's in-flow content: above the white, below
		 * every piece of text, image and widget. It needs no cooperation
		 * from individual widgets at all.
		 *
		 * It stays position:fixed, so it is still a non-scrolling backdrop
		 * and still covers the viewport outside the host (the coloured page
		 * margins). A fixed element's containing block is the viewport, so
		 * the host's overflow:hidden does not clip it — unless the host or
		 * an ancestor has a transform/filter/perspective, which WOULD make
		 * it the containing block. Rather than enumerate those properties,
		 * the mount is verified below by measuring the canvas. --- */
		/* --- Choosing the element to mount inside, on a real theme. -------
		 *
		 * Measured on the live site (Bravada/Cryout), the content chain is:
		 *
		 *   div#content.cryout   transparent, 0px wide
		 *     main#main.main     WHITE, position:relative z-index:9, no transform
		 *       article#post-620 WHITE, but carries translateZ(-0.001px)
		 *         div.entry-content  transparent, 0px wide
		 *
		 * Three traps in that, all of which this code now handles:
		 *
		 *  1. The DEEPEST anchor (.entry-content) is transparent and ZERO
		 *     WIDTH — Elementor breaks out of the theme wrappers, so they
		 *     collapse. A deepest-first walk that only asks "opaque?" can
		 *     land on an invisible, zero-area host.
		 *  2. article carries a non-identity 3D transform, which makes it the
		 *     containing block for position:fixed descendants. Mounting there
		 *     turns the fixed backdrop into an article-sized box that scrolls
		 *     and clips — the same trap the availability calendar's popup hit
		 *     before it portalled to <body>.
		 *  3. Only a POSITIONED element with a numeric z-index above the
		 *     body-mount z-index can actually cover a body-level canvas. A
		 *     stacking context made by transform or opacity alone paints in
		 *     the z-index:auto step, i.e. BELOW a fixed z-index:5 element, so
		 *     it is not what is hiding the particles and must not outrank the
		 *     element that is. main#main.main (z-index 9) is the real one.
		 * ------------------------------------------------------------------ */
		var BODY_Z = 5; /* z-index used when the canvas falls back to <body> */
		/* --- The z-index band, and why "front" is not 99990 any more. -------
		 *
		 * Decoration must never outrank anything the visitor NEEDS to see. At
		 * 99990 the ambient canvas drew over the site's severe-weather banner
		 * (.dcc-wx-banner, z-index 10000) — sprites over live NWS tornado,
		 * hurricane and flood warnings. That is the clearest possible case of
		 * a decorative layer claiming a z-index it has no business claiming.
		 *
		 * The band this plugin targets, lowest first:
		 *
		 *        -1   'behind' mode, inside the host element
		 *         5   'behind' mode when it falls back to <body> (BODY_Z)
		 *      9000   'front' mode — THIS CANVAS. Above ordinary content and
		 *             above Elementor sections, below everything that matters.
		 *      9999   Elementor lightbox / slideshow
		 *     10000   .dcc-wx-banner severe-weather alerts
		 *    99999+   consent and cookie UI, Elfsight popups, mobile nav
		 *  2.147e9    the Matrix egg — a modal the visitor just invoked by
		 *             tapping five times, and dismissible. Unchanged.
		 *
		 * Anything that needs to sit above the canvas only has to clear 9000.
		 * Tunable from the settings page, and via the dcc_seasons_front_z
		 * filter, because this band is a property of the SITE, not of the
		 * plugin: a theme that raises its own menu changes the answer. */
		var FRONT_Z = (CFG.frontZ | 0) || 9000;

		function alphaOf(cs) {
			if (cs.backgroundImage && cs.backgroundImage !== 'none') { return 1; }
			var m = /^rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
			if (!m) { return 0; }
			var parts2 = m[1].split(',');
			return parts2.length < 4 ? 1 : parseFloat(parts2[3]) || 0;
		}
		/* Painted enough to hide anything behind it. Not literally alpha > 0:
		 * a 2% wash is not what is covering the particles, and treating it as
		 * a host would mount the canvas UNDER a background that never
		 * occluded it. */
		function paintsOpaque(el) { return alphaOf(W.getComputedStyle(el)) > 0.05; }

		function rectOf(el) { return el.getBoundingClientRect(); }
		function hasArea(el) {
			var r = rectOf(el);
			return r.width >= 1 && r.height >= 1;
		}
		/* Does this element establish the containing block for fixed
		 * descendants? Anything here makes `position:fixed` resolve against
		 * the element instead of the viewport. */
		function fixesDescendants(el) {
			var cs = W.getComputedStyle(el);
			if (cs.transform && cs.transform !== 'none') { return true; }
			if (cs.perspective && cs.perspective !== 'none') { return true; }
			if (cs.filter && cs.filter !== 'none') { return true; }
			if (cs.backdropFilter && cs.backdropFilter !== 'none') { return true; }
			if (cs.willChange && /transform|perspective|filter/.test(cs.willChange)) { return true; }
			if (cs.contain && /paint|layout|strict|content/.test(cs.contain)) { return true; }
			if (cs.containerType && cs.containerType !== 'normal') { return true; }
			return false;
		}
		function trapped(el) {
			for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
				if (fixesDescendants(n)) { return true; }
			}
			return false;
		}
		/* Tier 1: can actually cover a body-level canvas (see note 3 above). */
		function occluder(el) {
			var cs = W.getComputedStyle(el);
			var z = parseInt(cs.zIndex, 10);
			return cs.position !== 'static' && !isNaN(z) && z > BODY_Z;
		}
		/* Tier 2: makes a stacking context some other way. Kept as a safety
		 * net for themes where the reasoning above doesn't hold; never tried
		 * before a tier-1 candidate. */
		function stacks(el) {
			var cs = W.getComputedStyle(el);
			if (cs.position !== 'static' && cs.zIndex !== 'auto') { return true; }
			if (parseFloat(cs.opacity) < 1) { return true; }
			if (cs.isolation === 'isolate') { return true; }
			if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') { return true; }
			return fixesDescendants(el);
		}
		/* Being inside a transform does NOT disqualify a host — it only rules
		 * out a position:fixed canvas there, and mountIn() has a sticky mode
		 * for exactly that. Abandoning such a column to the body mount would
		 * leave "behind" broken on any theme that uses a translateZ hack. */
		function viable(el) {
			return paintsOpaque(el) && hasArea(el);
		}
		function depth(el) {
			var n = 0;
			while ((el = el.parentElement)) { n++; }
			return n;
		}
		function pathOf(el) {
			if (!el || el.nodeType !== 1) { return String(el); }
			return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
				(el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
		}

		/* Candidate hosts: the filter's selector first, then tier 1 deepest
		 * first, then tier 2 deepest first. Anchors are walked from EVERY
		 * match, not just the first in document order — a wrapper like
		 * #content encloses the real column, and walking up from an ancestor
		 * can never reach what is inside it. */
		function backdropHosts() {
			var out = [], el, i;
			if (CFG.backdropHost) {
				try { el = D.querySelector(CFG.backdropHost); } catch (e) { el = null; }
				if (el && el !== D.body) { out.push(el); }
			}
			var anchors = D.querySelectorAll('main, [role="main"], #main, #content, .site-content, .site-main, article, .entry-content');
			var t1 = [], t2 = [], seen = [];
			for (i = 0; i < anchors.length; i++) {
				for (el = anchors[i]; el && el.nodeType === 1 && el !== D.body; el = el.parentElement) {
					if (seen.indexOf(el) >= 0) { continue; }
					seen.push(el);
					if (!viable(el)) { continue; }
					if (occluder(el)) { t1.push(el); } else if (stacks(el)) { t2.push(el); }
				}
			}
			var byDepth = function (a, b) { return depth(b) - depth(a); };
			t1.sort(byDepth);
			t2.sort(byDepth);
			for (i = 0; i < t1.length; i++) { if (out.indexOf(t1[i]) < 0) { out.push(t1[i]); } }
			for (i = 0; i < t2.length; i++) { if (out.indexOf(t2[i]) < 0) { out.push(t2[i]); } }
			return out;
		}
		/* --- Footer placement. -----------------------------------------
		 * "It basically only appears over my About Us text, which blocks
		 * exactly the type of stuff I want guests to be able to read easily."
		 * Decoration must not sit on body copy, so the default placement
		 * mounts the canvas INSIDE the site footer and draws nothing outside
		 * it. The canvas is absolutely positioned to the footer's padding box,
		 * which takes no flow space — the footer's own height cannot change.
		 * If the theme has no footer, nothing renders: falling back into the
		 * content would be the one outcome the setting exists to prevent. */
		/* A page cached before the upgrade carries a config with no placement
		 * key. Default it to footer, not to the old whole-column backdrop:
		 * the safe direction is the one that cannot cover body copy. */
		var footMode = (CFG.placement || 'footer') === 'footer';
		function footerHosts() {
			var out = [], i, el, list;
			/* The selector comes from the config so the loader and the engine
			 * cannot disagree about what a footer is; the constant is only for
			 * a page cached before the key existed. */
			var sel = CFG.footerSel || CFG.footerHost ||
				'footer#colophon, #colophon, footer.site-footer, .site-footer, footer[role="contentinfo"], #footer, footer';
			try { list = D.querySelectorAll(sel); } catch (e2) { list = []; }
			for (i = 0; i < list.length; i++) {
				el = list[i];
				/* A footer inside an article is a post footer, not the site's. */
				if (el.closest && el.closest('article')) { continue; }
				if (!hasArea(el) || rectOf(el).height < 40) { continue; }
				if (out.indexOf(el) < 0) { out.push(el); }
			}
			return out;
		}
		var footRO = null;
		function footWatch(el) {
			if (footRO) { footRO.disconnect(); footRO = null; }
			if (el && W.ResizeObserver) {
				footRO = new W.ResizeObserver(function () { queueSize(); });
				footRO.observe(el);
			}
		}
		function mountOnBody(z) {
			cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + z + ';';
			D.body.appendChild(cv);
		}
		/* Mount and MEASURE. Two modes:
		 *
		 *  'fixed'  — the normal one. The canvas must come out as the
		 *             viewport, not merely at-least-viewport-sized: a tall
		 *             transformed ancestor would satisfy a ">=" test while
		 *             actually producing a box that scrolls with the page and
		 *             is clipped by its overflow.
		 *
		 *  'sticky' — for a host inside a transformed subtree, where
		 *             position:fixed resolves against that ancestor instead
		 *             of the viewport and is unusable. A sticky FIRST child
		 *             with a negative bottom margin takes no layout space,
		 *             stays viewport-tall, and follows the scroll through the
		 *             host — so the particles ride the content column instead
		 *             of the window. This is the only way to express "behind"
		 *             under a transform, and Bravada puts a translateZ() hack
		 *             on its article element.
		 */
		/* A sticky canvas is viewport-tall, which is right for a column
		 * taller than the window and wrong for a short one: 100vh inside a
		 * 287px column overflows it and lengthens the page, which is a
		 * layout change this plugin promises never to make. Fit it to
		 * whichever is smaller, and keep it fitted as the column grows —
		 * lazy images and late content change that height without a resize
		 * event, and a backdrop that stops short of the fold is worse than
		 * the scroll it saves. */
		var stickyHost = null, stickyRO = null, stickyPad = 0, stickyH = 0;
		function stickyWatch(el) {
			if (stickyRO) { stickyRO.disconnect(); stickyRO = null; }
			stickyHost = el;
		}
		/* The SMALL viewport height: what the window is with the browser's own
		 * chrome SHOWING. Unlike innerHeight it does not move when the iOS URL
		 * bar collapses on scroll — and innerHeight moving is why the canvas
		 * was resized, and the whole scene re-seeded, on nearly every swipe.
		 * Measured once from a probe rather than assumed, which doubles as the
		 * feature test: where 100svh is not supported the probe has no height
		 * and innerHeight is used instead. */
		var svhCache = 0;
		function svhPx() {
			if (svhCache) { return svhCache; }
			var d = D.createElement('div');
			d.style.cssText = 'position:absolute;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none;';
			D.body.appendChild(d);
			svhCache = MT.round(d.getBoundingClientRect().height) || W.innerHeight;
			D.body.removeChild(d);
			return svhCache;
		}
		function stickyFit() {
			if (!stickyHost) { return; }
			var h = mx2(1, MT.round(mn(svhPx(), mx2(rectOf(stickyHost).height, 1))));
			stickyH = h;
			cv.style.cssText = 'position:sticky;display:block;top:0;left:0;width:100%;height:' + h +
				'px;margin-bottom:-' + (h + stickyPad) + 'px;pointer-events:none;z-index:-1;';
			if (!stickyRO && W.ResizeObserver) {
				stickyRO = new W.ResizeObserver(function () { stickyFit(); queueSize(); });
				stickyRO.observe(stickyHost);
			}
		}
		/* height + margin-bottom cancel the canvas's OWN flow height, and that
		 * is not the whole story: inserting a block as the host's first child
		 * also stops the previous first child's top margin from collapsing
		 * through the host, and that recovered margin is real page height —
		 * exactly 50px on the live site, which the assertion below now
		 * catches. Measure it instead of guessing at it: how much taller is
		 * the document with the canvas than without? Whatever the answer,
		 * take it off the negative margin. Self-correcting, so it survives
		 * margin collapse, a lazy-image reflow, and themes never seen. */
		function stickyBalance() {
			if (!stickyHost || !cv.parentNode) { return 0; }
			/* Take the no-canvas baseline ONCE and compare every round against
			 * it. Toggling display:none repeatedly perturbs the very page it
			 * is measuring — measured on the live site, the first toggle of a
			 * page load reads the true delta and a second or third reads ~36px
			 * of residue, which looks exactly like a regression that is not
			 * there. One toggle, then arithmetic. */
			cv.style.display = 'none';
			var base = D.documentElement.scrollHeight;
			cv.style.display = 'block';
			var d = 0;
			for (var i = 0; i < 3; i++) {
				d = D.documentElement.scrollHeight - base;
				if (!d) { break; }
				stickyPad += d;
				stickyFit();
			}
			return d;
		}
		function mountIn(el, mode) {
			/* z-index:-1 resolves inside the nearest ANCESTOR stacking
			 * context, not inside the element it is written on. Mount into an
			 * element that isn't one and the canvas lands behind that
			 * element's own background — invisible, the very failure this is
			 * meant to fix. `isolation:isolate` makes the host a stacking
			 * context and changes nothing visually. */
			if (!stacks(el)) {
				el.style.isolation = 'isolate';
				diag.notes.push('isolation:isolate applied to ' + pathOf(el) + ' so z-index:-1 resolves inside it');
			}
			if (mode === 'footer') {
				/* Absolute against the footer's padding box: no flow space, so
				 * no layout shift. display:block for the same reason a sticky
				 * canvas needs it — an inline canvas sits on a text baseline. */
				stickyWatch(null);
				if (W.getComputedStyle(el).position === 'static') { el.style.position = 'relative'; }
				/* width/height 100% are NOT redundant next to inset:0. A canvas
				 * is a REPLACED element, and an absolutely positioned replaced
				 * element with width:auto takes its INTRINSIC size (300x150) —
				 * the insets are then over-constrained and ignored. Without
				 * these two the mount is rejected and nothing renders. */
				cv.style.cssText = 'position:absolute;display:block;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;';
				el.insertBefore(cv, el.firstChild);
				footWatch(el);
			} else if (mode === 'sticky') {
				/* display:block matters: a canvas is inline by default, so it would
				 * sit on a text baseline and add descender space — a layout
				 * shift, which this plugin promises never to cause. */
				stickyWatch(el);
				stickyFit();
				el.insertBefore(cv, el.firstChild);
			} else {
				/* Leaving sticky behind: a stale observer would re-apply the
				 * sticky geometry over this one the next time the old host
				 * resized. */
				stickyWatch(null);
				cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;';
				el.appendChild(cv);
			}
			var r = cv.getBoundingClientRect();
			var ok;
			if (mode === 'footer') {
				/* Did the canvas get the footer's box? Same question the sticky
				 * acceptance asks: what the canvas GOT, not what the host is
				 * now. */
				ok = r.width >= 1 && MT.abs(r.width - el.clientWidth) <= 2 && r.height >= 40;
			} else if (mode === 'sticky') {
				/* width:100% resolves against the host's CONTENT box, so a
				 * padded column legitimately yields a narrower canvas —
				 * comparing against the border box rejected every padded
				 * host on a narrow viewport. Compare like for like. */
				var hcs = W.getComputedStyle(el);
				var inner = el.clientWidth - (parseFloat(hcs.paddingLeft) || 0) - (parseFloat(hcs.paddingRight) || 0);
				/* Ask whether the canvas GOT the geometry it was given, not
				 * whether it matches the host now: inserting it can change the
				 * host's own height (it un-collapses the next element's top
				 * margin), and comparing a pre-insertion fit against a
				 * post-insertion host rejected a perfectly good mount — 23px
				 * of canvas against a host that had just grown to 38px.
				 * Whether the host is short is the fit's business, below. */
				ok = r.width >= 1 && r.width >= mx2(inner, 1) - 2 && r.height >= mx2(stickyH - 1, 1);
			} else {
				ok = MT.abs(r.width - W.innerWidth) <= 2 && MT.abs(r.height - W.innerHeight) <= 2 &&
					MT.abs(r.top) <= 2 && MT.abs(r.left) <= 2;
			}
			if (ok) {
				/* Re-fit once: the host's height may have changed by the very
				 * act of inserting the canvas. The ResizeObserver keeps it in
				 * step from here. */
				if (mode === 'sticky') { stickyFit(); }
				return true;
			}
			el.removeChild(cv);
			return false;
		}
		function tryHost(el) { return mountIn(el, 'fixed'); }

		/* What is actually painting at a point — the first element at or
		 * above it with a real background. Used to verify the mount: a
		 * painter that is a DESCENDANT of the host sits above the canvas and
		 * is hiding it; the host itself or an ancestor sits below it. */
		function painterAt(x, y) {
			var el = D.elementFromPoint(x, y);
			for (; el && el.nodeType === 1 && el !== D.documentElement; el = el.parentElement) {
				if (paintsOpaque(el)) { return el; }
			}
			return null;
		}
		/* THE post-condition: with the canvas where it is now, does anything
		 * paint OVER it? For a grid of points inside the canvas's own visible
		 * box, find the first element that paints something; if that element
		 * is a DESCENDANT of the canvas's parent it is above the canvas in
		 * paint order and is hiding it. The host itself, or anything above
		 * the host, is below the canvas — that is the good case.
		 *
		 * Hit-testing, not pixel sampling, on purpose. elementFromPoint is
		 * layout, so this is valid in a headless browser whose
		 * visibilityState pauses requestAnimationFrame — the state that made
		 * the last round of measurements meaningless.
		 */
		function coverage() {
			var host = cv.parentElement;
			var out = { measurable: false, reach: 1, cover: null, coverN: 0, total: 0, distinct: 0 };
			if (!host) { return out; }
			/* Only the part of the canvas that is ON SCREEN can be sampled:
			 * elementFromPoint outside the viewport returns null, which says
			 * nothing at all about what paints there. An unmeasurable sample
			 * must never be reported as a covered one — it was, and it made
			 * the engine warn "100% of it is painted over by the theme" about
			 * a backdrop that was working perfectly. */
			var r = cv.getBoundingClientRect();
			var x0 = mx2(r.left, 0), y0 = mx2(r.top, 0);
			var x1 = mn(r.right, W.innerWidth), y1 = mn(r.bottom, W.innerHeight);
			if (x1 - x0 < 8 || y1 - y0 < 8) { return out; }
			var els = [], counts = [], seen = 0, open = 0, i, j, k, p2, x, y;
			for (i = 1; i <= 6; i++) {
				for (j = 1; j <= 6; j++) {
					x = x0 + (x1 - x0) * i / 7;
					y = y0 + (y1 - y0) * j / 7;
					if (x < 0 || y < 0 || x >= W.innerWidth || y >= W.innerHeight) { continue; }
					p2 = painterAt(x, y);
					seen++;
					/* The question is what PAINTS here, not what is topmost:
					 * a working backdrop at z-index:-1 is by design never the
					 * topmost element anywhere content exists. painterAt walks
					 * up to the first element with an opaque background, and
					 * only a DESCENDANT of the host paints above the canvas. */
					if (!p2 || p2 === cv || p2 === host || !host.contains(p2)) { open++; continue; }
					k = els.indexOf(p2);
					if (k < 0) { els.push(p2); counts.push(1); } else { counts[k]++; }
				}
			}
			if (seen < 4) { return out; }
			var best = null, bestN = 0;
			for (i = 0; i < els.length; i++) { if (counts[i] > bestN) { bestN = counts[i]; best = els[i]; } }
			return { measurable: true, reach: open / seen, cover: best, coverN: bestN, total: seen, distinct: els.length };
		}

		/* When the covering element cannot hold the canvas, take its
		 * background colour OFF it and paint that colour on the canvas
		 * instead, over exactly that element's box, every frame. The page
		 * looks identical and the canvas is no longer covered. Only a plain,
		 * fully opaque colour can move this way — an image or a gradient
		 * cannot be faked, so those are left alone and reported. */
		var bgFills = [];
		/* An Elementor page stacks MANY opaque sections inside the host, and
		 * each one that scrolls into the canvas box hides the backdrop until
		 * its background moves onto the canvas. Three slots was sized for a
		 * theme page with one or two painted blocks; measured on the
		 * Elementor fixture, four sections cover 62% of the canvas and three
		 * slots cannot clear them. Each slot costs one getBoundingClientRect
		 * and one fillRect per frame, and drawBgFills skips the ones that
		 * are off screen, so the ceiling is what is VISIBLE, not what is
		 * registered. */
		var BGFILL_MAX = 10;
		/* Asked twice: once by the descend decision, which needs to know what
		 * STAYING would be worth, and once by the transfer itself. */
		function canTransfer(el) {
			if (!el || el === cv || bgFills.length >= BGFILL_MAX) { return false; }
			var cs2 = W.getComputedStyle(el);
			if (cs2.backgroundImage !== 'none' || alphaOf(cs2) < 0.95) { return false; }
			for (var i = 0; i < bgFills.length; i++) { if (bgFills[i].el === el) { return false; } }
			return true;
		}
		function transferBg(el) {
			if (!canTransfer(el)) { return false; }
			var cs2 = W.getComputedStyle(el);
			/* getComputedStyle returns a LIVE declaration, so read the colour
			 * out before clearing it — reading after gives 'transparent'. */
			var col = cs2.backgroundColor;
			bgFills.push({ el: el, color: col });
			el.style.backgroundColor = 'transparent';
			diag.notes.push('background ' + col + ' moved onto the canvas from ' + pathOf(el));
			return true;
		}
		function drawBgFills() {
			if (!bgFills.length) { return; }
			var cr = cv.getBoundingClientRect(), i, r2;
			for (i = 0; i < bgFills.length; i++) {
				r2 = bgFills[i].el.getBoundingClientRect();
				if (r2.width < 1 || r2.height < 1) { continue; }
				/* Off-screen fills cost a fillRect for nothing, and with a
				 * long Elementor page most registered fills are off screen
				 * at any moment. Skipping them is what lets the slot count
				 * grow without the per-frame cost growing with it. */
				if (r2.bottom < cr.top - 2 || r2.top > cr.bottom + 2) { continue; }
				cx.fillStyle = bgFills[i].color;
				cx.fillRect(r2.left - cr.left, r2.top - cr.top, r2.width, r2.height);
			}
		}
		function samplePainters() {
			var counts = [], els = [], i, j, x, y, p, best = null, bestN = 0, total = 0;
			for (i = 1; i <= 4; i++) {
				for (j = 1; j <= 4; j++) {
					x = W.innerWidth * i / 5;
					y = W.innerHeight * j / 5;
					p = painterAt(x, y);
					total++;
					if (!p) { continue; }
					var k = els.indexOf(p);
					if (k < 0) { els.push(p); counts.push(1); k = els.length - 1; } else { counts[k]++; }
					if (counts[k] > bestN) { bestN = counts[k]; best = p; }
				}
			}
			var hits = 0;
			for (i = 0; i < counts.length; i++) { hits += counts[i]; }
			return { el: best, n: bestN, total: total, hits: hits, distinct: els.length };
		}
		var host = null, hostMode = 'fixed', cand = [], diag = { tried: [], notes: [] };
		function desc(el) {
			if (!el || el.nodeType !== 1) { return String(el); }
			var cs = W.getComputedStyle(el), r = rectOf(el);
			return pathOf(el) +
				'  pos=' + cs.position + ' z=' + cs.zIndex + ' bg=' + cs.backgroundColor + (cs.backgroundImage !== 'none' ? ' bgimg' : '') +
				' ' + MT.round(r.width) + 'x' + MT.round(r.height) +
				(cs.transform !== 'none' ? ' TRANSFORM' : '') + (cs.filter && cs.filter !== 'none' ? ' FILTER' : '') + (cs.overflow !== 'visible' ? ' overflow=' + cs.overflow : '');
		}
		if (footMode) {
			cand = footerHosts();
			for (var fi2 = 0; fi2 < cand.length; fi2++) {
				var okf = mountIn(cand[fi2], 'footer');
				diag.tried.push((okf ? 'USED   ' : 'reject ') + desc(cand[fi2]) + '  (footer)');
				if (okf) { host = cand[fi2]; hostMode = 'footer'; break; }
			}
			if (!host) {
				diag.notes.push('no footer element found, and footer placement never falls back into the page content — nothing is rendered');
				if (W.console && W.console.warn) {
					W.console.warn('DCC Seasons: placement is "Site footer only" but no footer element was found, so nothing is rendered. Name one with the dcc_seasons_footer_host filter, or switch Placement to "Across the page content".');
				}
				printDiag();
				return;
			}
		} else if (CFG.layer) {
			cand = backdropHosts();
			for (var hi = 0; hi < cand.length; hi++) {
				var hm = trapped(cand[hi]) ? 'sticky' : 'fixed';
				var okh = mountIn(cand[hi], hm);
				diag.tried.push((okh ? 'USED   ' : 'reject ') + desc(cand[hi]) + '  (' + hm + ')');
				if (okh) { host = cand[hi]; hostMode = hm; break; }
			}
			/* Verify, then FIX — up to four passes, driven by the hit-test
			 * above rather than by a sample of what happens to paint.
			 *
			 * 3.6.1 through 3.9.0 did this once, from a 16-point sample
			 * guarded by four conditions that all had to hold at the same
			 * time. On the live site not one pass fired: the canvas stayed a
			 * child of the theme's column with the article inside it painting
			 * opaque white over the whole thing, and "behind" looked exactly
			 * as broken as it had for three releases. A measured
			 * post-condition cannot fail that way — if the canvas is covered,
			 * something happens, and if nothing can be done the panel says
			 * so in one line.
			 *
			 * Two fixes, in order of preference:
			 *   1. Move INTO the covering element. The canvas then paints
			 *      above that element's own background and below its content,
			 *      which is exactly what "behind" means. Preferred because it
			 *      changes nothing about the page.
			 *   2. Take the covering element's background colour and paint it
			 *      on the canvas instead. For an element that cannot hold the
			 *      canvas — too short, or a stacking context of its own.
			 */
			if (host) {
				fixCoverage(false);
			}
		}
		/* One corrective pass set. Runs at mount, and again once the page
		 * has settled, because the first run can land on a layout that does
		 * not exist a moment later — a column whose images have not loaded is
		 * a few pixels tall, and a canvas fitted to it has no measurable box
		 * at all. Only the settled run is allowed to complain. */
		/* WHAT A HOST IS WORTH: the page area the canvas can ever paint in
		 * it. A sticky canvas slides through its host as the visitor scrolls,
		 * so that is the host's own height times the fraction of the canvas
		 * nothing paints over.
		 *
		 * Reach alone is a trap, and it cost three rounds of reports: a 300px
		 * section that nothing paints over scores 100%, so the descend below
		 * moved into one and reported "behind is working" about a canvas that
		 * could only ever show sprites in a 300px band anchored to that
		 * section — measured on the live homepage, where sprites "begin after
		 * the hero image and stop above the text row" and nothing appears
		 * below it at any scroll position. Descending is only ever worth it
		 * if the new host can paint MORE of the page than the one we are in.
		 * A fixed canvas is viewport-sized wherever it lands, so this
		 * question is only about sticky hosts. */
		function worth(el, reach) {
			return el ? mx2(0, rectOf(el).height) * clamp(reach, 0, 1) : 0;
		}
		/* How much of the SCREEN the canvas can paint right now. The number
		 * "behind is working" should have been quoting all along. */
		function viewShare() {
			var r = cv.getBoundingClientRect();
			var vis = mn(r.bottom, W.innerHeight) - mx2(r.top, 0);
			return W.innerHeight > 0 ? clamp(vis / W.innerHeight, 0, 1) : 0;
		}
		function fixCoverage(settled) {
			var cov, pass, c2, moved, m2, prev2, prevMode;
			for (pass = 0; pass < 4; pass++) {
				cov = coverage();
				diag.notes.push((settled ? 'settled ' : '') + 'pass ' + (pass + 1) + ': ' +
					(cov.measurable
						? 'canvas reaches ' + MT.round(cov.reach * 100) + '% of its own box' +
							(cov.cover ? ' — covered by ' + pathOf(cov.cover) + ' (' + cov.coverN + '/' + cov.total + ' points)' : '')
						: 'not measurable yet — none of the canvas is on screen'));
				if (!cov.measurable || cov.reach >= 0.75 || !cov.cover) { break; }
				c2 = cov.cover; moved = false;
				m2 = trapped(c2) ? 'sticky' : 'fixed';
				/* Would moving there paint more of the page than staying? A
				 * sticky host can only ever paint its own height. */
				/* What staying is worth is not today's reach: if the covering
				 * element's background can be moved onto the canvas, staying
				 * ends at full reach over the whole host. Compare the two
				 * outcomes, not one outcome and one starting point. */
				var stay = canTransfer(c2) ? 1 : cov.reach;
				var keep = worth(host, stay), gain = worth(c2, 1);
				/* Two ways a descend is a bad deal, and only two — 3.10.0's
				 * ordinary descend into the opaque article is neither, and
				 * the mount suite holds that line. A host SHORTER THAN THE
				 * SCREEN can never fill it, whatever its reach; and a host
				 * that gives up most of the paintable page is a bad trade
				 * even when it is taller than the screen. */
				var tall = mn(svhPx(), mx2(W.innerHeight, 1));
				var short2 = rectOf(c2).height < tall;
				var worse = m2 === 'sticky' && (short2 || gain < keep * 0.6);
				if (worse) {
					diag.notes.push('NOT descending into ' + pathOf(c2) + ': it is ' +
						MT.round(rectOf(c2).height) + 'px tall' + (short2 ? ', shorter than the ' + MT.round(tall) +
						'px screen' : '') + ', so the canvas could paint ' + MT.round(gain) +
						'px of page there against ' + MT.round(keep) + 'px where it is' +
						(stay === 1 ? ' once its background moves onto the canvas' : '') +
						' — a taller host that is partly painted over beats a short one that is not');
				}
				/* Never descend in footer placement: the canvas belongs to the
				 * footer box, and a footer child is smaller by definition. The
				 * background transfer below is still allowed. */
				if (viable(c2) && !worse && !footMode) {
					prev2 = host; prevMode = hostMode;
					if (mountIn(c2, m2)) {
						diag.tried.push('USED   ' + desc(c2) + '  (descend, ' + m2 + ')');
						host = c2; hostMode = m2; moved = true;
					} else {
						diag.notes.push('cannot descend into ' + pathOf(c2) + ' — it will not hold the canvas');
						mountIn(prev2, prevMode);
					}
				}
				if (!moved && !transferBg(c2)) {
					diag.notes.push('nothing more can be done about ' + pathOf(c2) +
						(W.getComputedStyle(c2).backgroundImage !== 'none' ? ' (it paints an image, which cannot be moved)' : ''));
					break;
				}
			}
			var pad = stickyBalance();
			if (stickyPad) {
				diag.notes.push('sticky margin balanced by ' + stickyPad + 'px' + (pad ? ' (still ' + pad + 'px out)' : '') +
					' — inserting the canvas as the first child un-collapses the next element\'s top margin');
			}
			var fin = coverage();
			diag.reach = fin.measurable ? fin.reach : null;
			diag.covers = fin.cover ? pathOf(fin.cover) : '';
			diag.distinct = fin.distinct;
			diag.share = viewShare();
			diag.paint = MT.round(worth(host, fin.measurable ? fin.reach : 1));
			/* A canvas can be 100% unpainted-over and still be a letterbox
			 * nobody sees. Say so, in the same breath as the reach. */
			if (settled && diag.share < 0.5 && W.console && W.console.warn) {
				W.console.warn('DCC Seasons: the ambient canvas covers only ' + MT.round(diag.share * 100) +
					'% of the screen (' + MT.round(cv.getBoundingClientRect().height) + 'px of ' + W.innerHeight +
					'px), so sprites can only appear in that band. Run ?dcc_debug=1 as an administrator for the mount decision.');
			}
			if (settled && fin.measurable && fin.reach < 0.5 && W.console && W.console.warn) {
				W.console.warn('DCC Seasons: the ambient canvas is mounted but ' + MT.round((1 - fin.reach) * 100) +
					'% of it is painted over by ' + (fin.cover ? pathOf(fin.cover) : 'the theme') +
					'; "behind" will look like nothing is happening. Run ?dcc_debug=1 as an administrator for the full decision.');
			}
			return fin;
		}

		if (!host) {
			/* No usable host: back to the pre-3.6.1 body mount. On a theme
			 * that paints an opaque content column this cannot express
			 * "behind" and the canvas may be covered — say so rather than
			 * fail silently, and never render nothing. */
			mountOnBody(CFG.layer ? BODY_Z : FRONT_Z);
			/* Only worth saying when there WAS an opaque column and none of
			 * the candidates could hold the canvas. A theme with no opaque
			 * content column has nothing to hide the body-level canvas, so
			 * "behind" already works there and a warning would be noise. */
			if (CFG.layer && cand.length && W.console && W.console.warn) {
				W.console.warn('DCC Seasons: no backdrop host found for "behind" layering; the canvas is on the body at z-index 5 and may be covered by the theme. Set one with the dcc_seasons_backdrop_host filter.');
			}
		}
		/* --- Admin-only diagnostics panel (?dcc_debug=1). Everything the
		 * mount decision looked at, in a textarea the owner can copy and
		 * paste back. This exists because the live site cannot be reached
		 * from the build environment, so the DOM has to come to us. --- */
		/* Printed once the page has settled (see below), not at mount: the
		 * first measurement can describe a layout that no longer exists. */
		function printDiag() {
			if (!CFG.diag) {
				return;
			}
			(function () {
				var lines = [], anc = D.querySelector('main, [role="main"], #main, #content, .site-content, .site-main, article, .entry-content');
				var r = cv.getBoundingClientRect();
				lines.push('DCC Seasons ' + (CFG.version || '?') + '  engine=' + (CFG.engineSrc || '').replace(/^.*\//, ''));
				lines.push('layering=' + (CFG.layer ? 'behind' : 'front') + '  richness=' + rich + '  theme=' + (themeKey || 'none') + '  viewport=' + W.innerWidth + 'x' + W.innerHeight + '  dpr=' + (W.devicePixelRatio || 1));
				/* The headline, and the one number that answers "is behind
				 * working": how much of the canvas nothing paints over. */
				if (diag.reach != null) {
					lines.push('CANVAS REACH: ' + MT.round(diag.reach * 100) + '% of its own box is unpainted-over' +
						(diag.reach >= 0.75 ? '  — behind is working'
							: '  — STILL COVERED by ' + (diag.covers || '?') + (diag.distinct > 1 ? ' and ' + (diag.distinct - 1) + ' other element(s)' : '')));
				} else if (CFG.layer && host) {
					/* Never say "covered" about something that could not be
					 * measured: none of the canvas was on screen when this
					 * ran, which is a fact about the scroll position, not
					 * about the theme. Scroll to it and reload to measure. */
					lines.push('CANVAS REACH: not measurable — no part of the canvas box was on screen. Scroll to the content column and reload.');
				}
				/* Where a sprite can be SEEN, and what the two new guardrails
				 * cost — the numbers to quote when the field still looks
				 * wrong on a page this build has never seen. */
				/* The panel prints from the settled pass NORMALLY, but also from the
				 * one path that gives up before the scene exists — footer placement
				 * with no footer. Everything it reads must tolerate that: `var`
				 * hoists the declaration and not the value, so parts and textBoxes
				 * are undefined up there, and an unguarded .length made the panel
				 * throw in precisely the state the owner needs it. */
				var plist = parts || [], tb = textBoxes || [];
				var frn = 0;
				for (var fi = 0; fi < plist.length; fi++) { if (plist[fi].free) { frn++; } }
				lines.push('placement=' + (footMode ? 'footer only' : 'page content') +
					(footMode ? '  footer=' + (host ? pathOf(host) : 'NONE') + '  text boxes kept clear=' + tb.length +
						' (' + (textMs || 0).toFixed(2) + 'ms)' : ''));
				lines.push('open map: ' + (omList
					? omN + '/' + omTot + ' cells open (' + MT.round(omFrac * 100) + '%) in ' + omMs.toFixed(2) + 'ms, ' + omBuilds + ' build(s), cell ' + MAP_CELL + 'px' +
						(mapUsable() ? '' : ' — under 10% open, seeding falls back to even coverage')
					: 'not built (front layering or no host) — the canvas is above the page'));
				lines.push('anti-clump: ' + (repN ? repMs.toFixed(3) + 'ms/frame over ' + repN + ' frames' : 'no frames measured yet') +
					'  spacing target ' + MT.round(sepRun || 0) + 'px  free-air ' + frn + '/' + plist.length + ' particles');
				lines.push('SCREEN REACH: ' + MT.round((diag.share || 0) * 100) + '% of the viewport is canvas' +
					(diag.share >= 0.5 ? '' : '  — LETTERBOX: sprites can only appear in that band') +
					'  (canvas ' + MT.round(r.height) + 'px of ' + W.innerHeight + 'px; the host can hold ' +
					(diag.paint || 0) + 'px of page)');
				lines.push('backdropHost filter=' + (CFG.backdropHost || '(none)') + '  candidates=' + cand.length);
				for (var di = 0; di < diag.tried.length; di++) { lines.push('  ' + diag.tried[di]); }
				for (di = 0; di < diag.notes.length; di++) { lines.push('  ! ' + diag.notes[di]); }
				/* THE decisive line when "behind" still looks wrong: what is
				 * painting the page, and is it above or below the canvas. */
				var sp2 = samplePainters();
				if (sp2.el && sp2.n < sp2.hits / 2 && sp2.hits > 2) {
					/* One canvas can only sit behind ONE element. If the page
					 * is painted by several opaque boxes, say so — that is the
					 * case the mount cannot fully solve, and the fix is to
					 * name the outer one with dcc_seasons_backdrop_host. */
					lines.push('NOTE: ' + sp2.distinct + ' different elements paint the sampled points; a single canvas can only sit behind one of them.');
				}
				if (sp2.el) {
					var rel = sp2.el === host ? 'the host itself (below the canvas — good)'
						: (host && host.contains(sp2.el)) ? 'INSIDE the host — it paints ABOVE the canvas and is hiding it'
						: (host && sp2.el.contains(host)) ? 'an ancestor of the host (below the canvas — good)'
						: 'outside the host';
					lines.push('painting ' + sp2.n + '/' + sp2.total + ' sampled points: ' + desc(sp2.el));
					lines.push('  → that is ' + rel);
				} else {
					lines.push('painting: nothing opaque at the sampled points (the page background shows through)');
				}
				lines.push('canvas: parent=' + (host ? desc(host).split('  ')[0] : 'body (fallback)') + '  mode=' + (host ? hostMode : 'fixed') + '  z=' + cv.style.zIndex + '  rect=' + MT.round(r.left) + ',' + MT.round(r.top) + ' ' + MT.round(r.width) + 'x' + MT.round(r.height) + '  copies=' + D.querySelectorAll('.dcc-seasons-canvas').length);
				lines.push('anchor chain (' + (anc ? desc(anc).split('  ')[0] : 'NO ANCHOR MATCHED') + ' → body):');
				for (var el = anc; el && el.nodeType === 1 && el !== D.body; el = el.parentElement) { lines.push('  ' + desc(el)); }
				lines.push('  ' + desc(D.body));
				var box = D.createElement('div');
				box.setAttribute('aria-hidden', 'true');
				box.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147482000;max-width:min(96vw,720px);background:#0a3d62;color:#f4da62;border:2px solid #f4da62;border-radius:8px;padding:8px;font:11px/1.35 monospace;box-shadow:0 4px 14px rgba(0,0,0,.4);';
				var ta = D.createElement('textarea');
				ta.readOnly = true;
				ta.value = lines.join('\n');
				ta.style.cssText = 'display:block;width:100%;height:190px;box-sizing:border-box;background:#062a44;color:#fff;border:1px solid #f4da62;border-radius:4px;font:11px/1.35 monospace;padding:6px;white-space:pre;resize:vertical;';
				var cap = D.createElement('div');
				cap.textContent = 'DCC Seasons diagnostics — select all, copy, paste to the developer';
				cap.style.cssText = 'margin:0 0 6px;font-weight:700;';
				box.appendChild(cap); box.appendChild(ta);
				D.body.appendChild(box);
				ta.addEventListener('focus', function () { ta.select(); });
			})();
		}
		/* Re-verify when the layout has stopped moving. A column whose images
		 * have not loaded is a few pixels tall, and a canvas fitted to it has
		 * no measurable box — which is how a working backdrop got reported as
		 * 100% covered. Only this run may warn, and the panel is printed from
		 * it, so both describe the page as it finally is. */
		setTimeout(function () {
			/* Anything that rewrites the host's innerHTML — a slider, an
			 * accordion, a theme script re-rendering a container — takes the
			 * canvas with it. Found while building the fixture for the check
			 * above, and cheap to survive. */
			if (CFG.layer && !D.body.contains(cv)) {
				diag.notes.push('the canvas had been removed from the page (the host re-rendered its children); re-mounted');
				ensureMounted();
			}
			if (CFG.layer && host) { fixCoverage(true); }
			/* The map that seeded the first field was built against a layout
			 * whose images had not loaded. Rebuild it now that the page has
			 * settled — the field migrates into the open as it respawns,
			 * which is the only way to correct it without teleporting
			 * anything. */
			buildOpenMap();
			printDiag();
		}, 1200);

		/* Corner accents ride on the same decision as the canvas. */
		/* Corner accents are page-corner decoration by definition, so they
		 * have no place in a footer-only scene. */
		for (var ai = 0; !footMode && ai < accents.length; ai++) {
			accents[ai].style.zIndex = host ? '-1' : String(CFG.layer ? BODY_Z : FRONT_Z);
			/* position:fixed inside a transformed host resolves against that
			 * host, not the viewport: the accent lands in the column's corner
			 * and, being taller than a short column, lengthens the page.
			 * Absolute is what fixed already means in there — minus the
			 * overflow. */
			if (hostMode === 'sticky') { accents[ai].style.position = 'absolute'; }
			(host || D.body).appendChild(accents[ai]);
		}
		var cx = cv.getContext('2d');

		/* --- Sizing: one source (canvas rect × DPR), window + visualViewport
		 * resize, full re-seed on change. --- */
		var vw = 0, vh = 0, waterY = 0, ground = 0, sizeTimer = 0;
		/* Resizing the canvas is DESTRUCTIVE: writing cv.width clears it, and
		 * this used to re-seed every particle, drop every ripple and kill any
		 * hero or vignette in flight. That is fine once, at startup. It is not
		 * fine on every scroll — and on iOS every scroll is a resize, because
		 * the URL bar collapsing fires visualViewport 'resize'. One swipe, one
		 * restart: the reported "the graphics reset whenever I tap or scroll",
		 * and why a hero flyover could almost never finish on a phone.
		 *
		 * So: do nothing at all when nothing changed, and when something did
		 * change, SLIDE the scene into the new box rather than restart it.
		 * Only a real discontinuity — the first sizing, or a box that has more
		 * than doubled or halved — starts over.
		 */
		var lastDpr = 0;
		function applySize(force) {
			var r = cv.getBoundingClientRect();
			var dpr = mn(W.devicePixelRatio || 1, 2);
			var w = mx2(1, MT.round(r.width));
			var h = mx2(1, MT.round(r.height));
			if (!force && w === vw && h === vh && dpr === lastDpr) {
				return; /* the write to cv.width alone would clear the canvas */
			}
			var ow = vw, oh = vh;
			lastDpr = dpr;
			cv.width = MT.round(w * dpr);
			cv.height = MT.round(h * dpr);
			cx.setTransform(dpr, 0, 0, dpr, 0, 0);
			cx.textAlign = 'center';
			cx.textBaseline = 'middle';
			vw = w; vh = h;
			waterY = vh * 0.92;
			ground = vh - 16;
			var nowMobile = W.innerWidth < 768;
			if (nowMobile !== mobile) {
				mobile = nowMobile;
				FX.reflect = rich === 'full' && V.reflections !== false && !mobile && water && !shed;
			}
			var sx = ow > 0 ? w / ow : 1, sy = oh > 0 ? h / oh : 1;
			var restart = force || ow < 1 || oh < 1 || sx < 0.5 || sx > 2 || sy < 0.5 || sy > 2;
			var k;
			if (restart) {
				for (k = 0; k < parts.length; k++) { seed(parts[k], true); }
				ripples.length = 0;
				/* the sky's actors live in the header picture's box, which
				 * skyEnsure() follows on its own */
				if (hero && !hero.sky) { hero = null; }
				if (vig && !vig.sky) { endVig(); }
			} else {
				for (k = 0; k < parts.length; k++) { scaleXY(parts[k], sx, sy); }
				for (k = 0; k < ripples.length; k++) { scaleXY(ripples[k], sx, sy); }
				if (hero && !hero.sky) { scaleXY(hero, sx, sy); }
				if (vig && vig.st && !vig.sky) { scaleXY(vig.st, sx, sy); }
			}
			/* The subtle layer follows the same rule as the sprites: a
			 * resize RESCALES it, it does not restart it. Re-seeding here
			 * would make the calm layer twitch on every iOS URL-bar
			 * collapse, which is the exact complaint 3.13.0 fixed for the
			 * sprites. A real restart (or a first run) re-seeds, because the
			 * counts themselves scale with width. */
			if (restart || !subParts.length) { initSubtle(); }
			else { for (k = 0; k < subParts.length; k++) { scaleXY(subParts[k], sx, sy); } }
			/* A real resize changes both the box and what is under it. The
			 * map is rebuilt on the throttle, never inline: this path runs on
			 * the debounce and must stay cheap. */
			fitParts();
			sepTarget();
			queueMap(120);
		}
		/* A resize or rotation can change how many sprites the screen gets.
		 * Never mid-scene: the borrowed slots are dormant, and endVig() comes
		 * back here once they are returned. */
		function fitParts() {
			if (vig || !parts.length) { return; }
			var want = partTarget();
			if (want === maxParts) { return; }
			maxParts = want;
			while (parts.length < maxParts && pool.length) { parts.push(seed({}, true)); }
			while (parts.length > maxParts) { parts.pop(); }
		}
		/* Every coordinate an actor carries, moved into the new box. */
		function scaleXY(o, sx, sy) {
			if (!o) { return; }
			if (typeof o.x === 'number') { o.x *= sx; }
			if (typeof o.y === 'number') { o.y *= sy; }
			if (typeof o.lx === 'number') { o.lx *= sx; }
			if (typeof o.gy === 'number') { o.gy *= sy; }
			if (typeof o.y0 === 'number') { o.y0 *= sy; }
		}
		function queueSize() { clearTimeout(sizeTimer); sizeTimer = setTimeout(applySize, 150); }
		W.addEventListener('resize', queueSize);
		W.addEventListener('orientationchange', function () { svhCache = 0; stickyFit(); queueSize(); });
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
		var pool = [], specs = [], xaSp = null;
		/* "Ambient particles" switches the falling/drifting sprites ONLY
		 * (4.5.0, Rob). Off, the pool is empty: no sprites, boats or birds,
		 * no xa turns (the globe is a sprite, so the accent stays up), while
		 * the background layer, accents, scenes and heroes play on. An old
		 * cached config without the key keeps its sprites. */
		(CFG.ambient === false ? [] : (A.particles || [])).forEach(function (def) {
			/* xa: a sprite that never shares the screen with this theme's
			 * corner accent (Earth Day's globe: the hands accent already
			 * holds an Earth). While the accent is mounted it is kept OUT of
			 * the pool and the two take turns instead (stepTurns). */
			if (def.xa && accents.length) { xaSp = resolve(def); return; }
			var sp = resolve(def), n = def.w || 1;
			sp.wt = n;
			specs.push(sp);
			while (n--) { pool.push(sp); }
		});
		/* n: a sprite's most-on-screen-at-once at FULL width, scaled on a
		 * phone like the total (never below 1). Enforced when a particle
		 * picks what it becomes, so the other sprites take the space. */
		function specLimit(sp) { return specLimitAt(sp.def, W.innerWidth); }
		function liveOf(sp, self) {
			var c = 0;
			for (var k = 0; k < parts.length; k++) {
				var q = parts[k];
				if (q !== self && !q.dormant && q.sp === sp) { c++; }
			}
			return c;
		}
		/* What each sprite's share of the CURRENT total is: its weight's
		 * share, with any sprite over its limit held at the limit and the
		 * rest shared out again (water-filling). Recomputed only when the
		 * total changes. */
		var sharesFor = -1;
		function mixShares() {
			if (sharesFor === maxParts) { return; }
			sharesFor = maxParts;
			sharesAt(specs, maxParts, W.innerWidth);
		}
		/* A particle picks what it becomes from the sprites still BELOW their
		 * share (rounded up), weighted as before. Independent random picks
		 * only hit the mix on average — and since ornaments hang for good
		 * and palms stand where they grew, one page could draw five
		 * ornaments and no gifts. Picking against the quota keeps every
		 * page within one of Rob's counts while the choice stays random. */
		function pickSpec(self) {
			mixShares();
			/* Two tiers: first the sprites below their exact share, then those
			 * below it rounded up. Rounding every share up can over-book the
			 * total, and a single loose tier let one sprite starve (a page of
			 * Christmas with no pine at all); the strict tier fills the
			 * furthest-behind first, so every count lands on the floor or the
			 * ceiling of its share. */
			var tier, i, c, sp, cand, W2;
			for (tier = 0; tier < 3; tier++) {
				cand = []; W2 = 0;
				for (i = 0; i < specs.length; i++) {
					sp = specs[i]; c = liveOf(sp, self);
					if (sp.def.n && c >= specLimit(sp)) { continue; }
					if (tier === 0 && c >= sp.share - 1e-6) { continue; }
					if (tier === 1 && c >= MT.ceil(sp.share - 1e-6)) { continue; }
					/* In the strict tier the weight is HOW FAR BEHIND the sprite
					 * is, not its theme weight: at a phone's 7 sprites MLK's one
					 * dove, once it flew off, lost its slot to three sprites that
					 * were only a sliver under theirs, and a dove showed a third
					 * of the time. */
					sp.pw = tier === 0 ? sp.share - c : sp.wt;
					cand.push(sp); W2 += sp.pw;
				}
				if (cand.length) { break; }
			}
			if (!cand.length) { return pick(pool); }
			/* Strict tier: the sprite furthest behind its share, every time
			 * (the largest-remainder rule; a random pick among exact ties).
			 * A deficit-WEIGHTED draw could still, by chance, top one sprite
			 * up to its ceiling before another reached its floor — a page of
			 * Strawberry with four berries, two ladybugs and no blossom. */
			if (tier === 0) {
				var best = -1, ties = [];
				for (i = 0; i < cand.length; i++) {
					if (cand[i].pw > best + 1e-6) { best = cand[i].pw; ties = [cand[i]]; }
					else if (abs(cand[i].pw - best) <= 1e-6) { ties.push(cand[i]); }
				}
				return pick(ties);
			}
			var r = rand() * W2;
			for (i = 0; i < cand.length; i++) { r -= cand[i].pw; if (r < 0) { return cand[i]; } }
			return cand[cand.length - 1];
		}

		/* Evening variant: fishing adds a firefly slot. It used to take one
		 * of the falling-leaf slots, but the leaf sprites left Fall Fishing in
		 * 4.2.0 (the subtle layer already drifts leaves), so it joins the
		 * pool at the same single-slot share instead. */
		var firefly = null;
		if (evening && themeKey === 'fall_fishing') {
			firefly = { kind: 'c', c: 'firefly', b: 'firefly', def: { b: 'firefly' }, wt: 1 };
			pool.push(firefly);
			specs.push(firefly);
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

		/* ================= LAYER 1 — THE SUBTLE LAYER =====================
		 * The calm baseline: one quiet seasonal effect, always running,
		 * always UNDER the sprites. It is drawn on the same canvas rather
		 * than a second one, immediately after the background fills and
		 * before anything else, which is what "below the sprite layer"
		 * means in painting-order terms.
		 *
		 * A second canvas was the obvious alternative and is the wrong
		 * trade here: every layering bug this plugin has had lived in the
		 * mount (containing blocks under transform, z-index resolving in
		 * the wrong stacking context, replaced-element sizing), and a
		 * second mount doubles that surface to buy an ordering this
		 * already gives for free.
		 *
		 * SUBTLE IS THE POINT. Low counts, slow speeds, low alpha. If one
		 * of these reads as a second sprite show it is wrong, however
		 * pretty it is. Counts scale with viewport width so a phone does
		 * not get a desktop's worth of particles.
		 * ----------------------------------------------------------------- */
		/* The subtle layer's effects live in subtleKit() (outer scope) so the
		 * admin Theme guide draws its previews with the SAME code. The
		 * getters keep the canvas and its size live across resizes. */
		var SUBTLE = subtleKit({ get cx() { return cx; }, get vw() { return vw; }, get vh() { return vh; } });

		var SUBTLE_FALLBACK = {
			labor_day: 'dragonheat', patriot_day: 'leaves', fall_fishing: 'leaves',
			halloween: 'embers', thanksgiving: 'leaves', christmas: 'bokeh',
			new_years: 'confetti', snowbird: 'sunglow', mlk: 'goldlight',
			mardi_gras: 'mardiconfetti', valentines: 'hearts', presidents: 'orangeblossom',
			strawberry: 'blossom', st_patricks: 'blossom', easter: 'blossom',
			april_fools: 'blossom', spring_canal: 'blossom', four_twenty: 'blossom',
			july4: 'sparks', memorial_day: 'dragonheat', mothers_day: 'blossom',
			fathers_day: 'dragonheat', veterans_day: 'leaves',
			summer_canal: 'dragonheat', earth_day: 'blossom',
			florida_keys: 'dragonheat', classic: ''
		};

		var SUBC = CFG.subtle || {};
		var subIntensity = clamp(SUBC.intensity == null ? 0.6 : +SUBC.intensity, 0, 1);
		var subKey = '';
		if (SUBC.on !== false && themeKey) {
			var map = SUBC.map || {};
			subKey = map[themeKey] != null ? String(map[themeKey]) : (SUBTLE_FALLBACK[themeKey] || '');
			/* A cached page can still carry an effect that no longer exists
			 * ('snow' before 4.2.0): fall back to the plugin's own choice. */
			if (subKey && !SUBTLE[subKey]) { subKey = SUBTLE_FALLBACK[themeKey] || ''; }
		}
		/* A slider at 0 must mean OFF. The alpha curve deliberately has a
		 * floor (0.55x at intensity 0) so the layer stays visible across the
		 * useful range, and the particle count is floored at 3 so a sparse
		 * effect never reads as a glitch — but together those two floors meant
		 * intensity 0 still drew three particles at over half strength, which
		 * is not what anyone dragging a slider to zero is asking for. */
		var subEff = (subIntensity > 0 && subKey && SUBTLE[subKey]) ? SUBTLE[subKey] : null;
		var subParts = [], subShim = 0;

		function subSeed(p, first) {
			subEff.seed(p, first);
			p.al = rnd(0.65, 1);
		}
		function initSubtle() {
			subParts.length = 0;
			if (!subEff) { return; }
			/* Scale with width so a phone is not given a desktop's field,
			 * and with the owner's intensity. Never fewer than 3, or the
			 * effect reads as a glitch rather than a season. */
			var scale = clamp(vw / 1280, 0.45, 1);
			var n = MT.round(subEff.n * scale * (0.45 + subIntensity * 0.85));
			n = clamp(n, 3, subEff.n);
			for (var i = 0; i < n; i++) {
				var p = {};
				subSeed(p, true);
				subParts.push(p);
			}
		}
		function stepSubtle(dt) {
			if (!subEff) { return; }
			subShim += dt;
			for (var i = 0; i < subParts.length; i++) {
				var p = subParts[i];
				subEff.step(p, dt);
				/* Respawn on exit. The margin is generous because bokeh is
				 * large and popping in at the edge is the one thing that
				 * makes a slow effect look cheap. */
				if (p.y > vh + 90 || p.y < -90 || p.x < -90 || p.x > vw + 90) {
					subSeed(p, false);
				}
			}
		}
		/* The summer heat shimmer: a few translucent bands over the water,
		 * sliding at different rates. Cheap — four fillRects — and it has
		 * to stay that way, because it draws on every frame of the calmest
		 * layer on the page. */
		function drawShimmer() {
			var base = waterY || vh * 0.92, i, y, w2;
			cx.save();
			cx.globalAlpha = 0.05 * subIntensity;
			cx.fillStyle = '#FFFFFF';
			for (i = 0; i < 4; i++) {
				y = base - i * 9 + sin(subShim * (0.5 + i * 0.17)) * 3;
				w2 = vw * (0.5 + 0.2 * sin(subShim * 0.3 + i));
				cx.fillRect((vw - w2) / 2 + sin(subShim * 0.21 + i) * 40, y, w2, 2.4);
			}
			cx.restore();
		}
		function drawSubtle() {
			if (!subEff) { return; }
			if (subEff.shimmer) { drawShimmer(); }
			/* Intensity spans roughly half to full effect strength rather
			 * than scaling linearly from zero: at the 0.6 default the layer
			 * has to be SEEN to be judged, and a straight multiply put the
			 * leaves at 12% alpha over a white article, which is not subtle
			 * so much as absent. The sprite-opacity slider still moves it,
			 * but with a floor — Layer 1 is the baseline face of the site
			 * and should not vanish because the sprites were turned down. */
			var a = subEff.a * (0.55 + subIntensity * 0.75) * clamp(alphaBase / 0.35, 0.6, 1.4);
			for (var i = 0; i < subParts.length; i++) {
				var p = subParts[i];
				cx.save();
				cx.globalAlpha = clamp(a * p.al, 0, 1);
				subEff.draw(p);
				cx.restore();
			}
		}
		/* --- Particles. --- */
		var parts = [];
		function dirY() { return up ? -1 : 1; }

		/* --- Open-cell map: WHERE A SPRITE CAN ACTUALLY BE SEEN. ----------
		 * Reported from the live homepage: sprites "only show up in the area
		 * underneath the hero image and above the DCC Cottage Selector
		 * widget". Measured there at 375px: the band from the article top to
		 * the selector is 99-100% open, and below it the page is a wall of
		 * full-bleed cards (8 room cards, 270 painted calendar cells) whose
		 * only open pixels are gutters too narrow to show a whole sprite.
		 * 57% of that column is "open" by area and almost none of it is
		 * usable. Seeding evenly over the CANVAS therefore puts most of the
		 * field where nothing can be seen — which is what "they only show up
		 * in one band, and they still kinda cluster" describes.
		 *
		 * So ask the page, with the same question the mount already asks
		 * (painterAt: what is the first thing that paints here, and is it
		 * INSIDE the host and therefore above the canvas?), on a coarse grid
		 * of the canvas's on-screen box. Cells nothing paints over are open;
		 * seeding draws from those.
		 *
		 * Rebuilt on scroll-settle, on a real resize and after the settled
		 * mount pass, never per frame and never faster than MAP_MIN apart.
		 * getComputedStyle dominates the cost, and the same handful of
		 * ancestors answer for every cell, so each build stamps its verdict
		 * on the element and reuses it. --- */
		/* 48px: finer than a sprite (16-34px) and coarse enough that a phone
		 * viewport is ~8x17 = 136 hit tests. At 40px it was 210 and the build
		 * ran 1.8-3.4ms in the test container — over the 2ms ceiling. */
		/* --- Footer text: the boxes nothing may be drawn over. -----------
		 * Measured from RANGE rects over the text nodes themselves, not from
		 * the elements' block boxes: a footer link's block box is the width
		 * of its column, while the range rect is the width of the words. One
		 * rect per line box, so it is glyph-tight horizontally and line-tight
		 * vertically. Images and inline SVG count as content too.
		 * These become holes in the clip region, so no pixel of any sprite,
		 * ripple, trail or reflection can land on a word. --- */
		var TEXT_PAD = 3, textBoxes = [], textMs = 0;
		function collectRects(el, out, r0) {
			var rects = el.getClientRects ? el.getClientRects() : [], i, rr;
			for (i = 0; i < rects.length; i++) {
				rr = rects[i];
				if (rr.width < 2 || rr.height < 2) { continue; }
				out.push({ x: rr.left - r0.left - TEXT_PAD, y: rr.top - r0.top - TEXT_PAD,
					w: rr.width + TEXT_PAD * 2, h: rr.height + TEXT_PAD * 2 });
			}
		}
		function buildTextBoxes() {
			var t0 = nowMs();
			textBoxes.length = 0;
			if (!footMode || !host) { textMs = 0; return; }
			var r0 = cv.getBoundingClientRect();
			var walk = D.createTreeWalker(host, W.NodeFilter ? W.NodeFilter.SHOW_TEXT : 4, null, false);
			var n, pe, cs2, rg;
			while ((n = walk.nextNode())) {
				if (!n.nodeValue || !/\S/.test(n.nodeValue)) { continue; }
				pe = n.parentElement;
				if (!pe || pe === cv) { continue; }
				cs2 = W.getComputedStyle(pe);
				if (cs2.visibility === 'hidden' || cs2.display === 'none' || +cs2.opacity === 0) { continue; }
				rg = D.createRange();
				rg.selectNodeContents(n);
				collectRects(rg, textBoxes, r0);
			}
			var imgs = host.querySelectorAll('img, svg, picture, video');
			for (n = 0; n < imgs.length; n++) { collectRects(imgs[n], textBoxes, r0); }
			textMs = nowMs() - t0;
		}
		function onText(x, y) {
			for (var i = 0; i < textBoxes.length; i++) {
				var b = textBoxes[i];
				if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { return true; }
			}
			return false;
		}
		/* The guarantee, applied once a frame: everything drawn is clipped to
		 * the canvas MINUS the text boxes. Cheap — one path of a few dozen
		 * rects — and unlike a per-sprite test it also covers trails, ripples
		 * and reflections. */
		function clipText() {
			if (!textBoxes.length) { return false; }
			cx.save();
			cx.beginPath();
			cx.rect(0, 0, vw, vh);
			for (var i = 0; i < textBoxes.length; i++) {
				var b = textBoxes[i];
				cx.rect(b.x, b.y, b.w, b.h);
			}
			cx.clip('evenodd');
			return true;
		}

		var MAP_CELL = 48, MAP_MIN = 400;
		var omC = 0, omR = 0, omCell = null, omList = null, omN = 0, omTot = 0, omMeas = 0, omOpen = 0;
		var omNine = [0, 0, 0, 0, 0, 0, 0, 0, 0], omCol = [0, 0, 0];
		var omFrac = 1, omMs = 0, omBuilds = 0, omAt = -1e9, omStamp = 0, omTimer = 0;
		function nowMs() { return (W.performance && performance.now) ? performance.now() : +new Date(); }
		/* Usable = built, and enough of the page open that steering into it
		 * still leaves room to spread. Below that the honest thing is to seed
		 * as before rather than crowd every sprite into one gutter. */
		function mapUsable() { return !!omList && omN > 0 && omFrac >= 0.1; }
		function paintsStamped(el) {
			if (el._dccPb === omStamp) { return el._dccPo; }
			el._dccPb = omStamp;
			el._dccPo = paintsOpaque(el);
			return el._dccPo;
		}
		function openAt(x, y) {
			var el = D.elementFromPoint(x, y), p2 = null;
			for (; el && el.nodeType === 1 && el !== D.documentElement; el = el.parentElement) {
				if (paintsStamped(el)) { p2 = el; break; }
			}
			/* Same verdict as coverage(): only a DESCENDANT of the host paints
			 * above the canvas. */
			return !p2 || p2 === cv || p2 === host || !host.contains(p2);
		}
		function buildOpenMap() {
			var t0 = nowMs();
			omAt = t0; omBuilds++;
			/* In front mode the canvas is above the page: everything is open,
			 * and sampling would be a lie dressed as a measurement. */
			if ((!CFG.layer && !footMode) || !host || vw < 1 || vh < 1) {
				omList = null; omFrac = 1; omMs = 0; sepTarget(); return;
			}
			buildTextBoxes();
			var r = cv.getBoundingClientRect();
			var sx = vw > 0 ? r.width / vw : 1, sy = vh > 0 ? r.height / vh : 1;
			var c, rw, i, k, x, y, vx, vy, open;
			var iw = W.innerWidth, ih = W.innerHeight;
			omC = mx2(1, MT.ceil(vw / MAP_CELL));
			omR = mx2(1, MT.ceil(vh / MAP_CELL));
			var stepX = vw / omC, stepY = vh / omR;
			omTot = omC * omR;
			if (!omCell || omCell.length !== omTot) { omCell = new Uint8Array(omTot); omList = new Uint16Array(omTot); }
			omStamp++;
			omN = 0; omMeas = 0; omOpen = 0;
			for (i = 0; i < 9; i++) { omNine[i] = 0; }
			omCol[0] = omCol[1] = omCol[2] = 0;
			for (rw = 0; rw < omR; rw++) {
				for (c = 0; c < omC; c++) {
					k = rw * omC + c;
					x = (c + 0.5) * stepX;
					y = (rw + 0.5) * stepY;
					vx = r.left + x * sx;
					vy = r.top + y * sy;
					/* Off-screen is UNMEASURABLE, not covered — elementFromPoint
					 * outside the viewport returns null, which says nothing. The
					 * mount learned this the hard way in 3.11.0. */
					if (vx < 0 || vy < 0 || vx >= iw || vy >= ih) {
						open = 1;                       /* unmeasurable, so not covered */
					} else {
						open = openAt(vx, vy) ? 1 : 0;
						/* A cell over footer text is not somewhere to seed
						 * into: the clip would only make the sprite invisible
						 * there, which wastes it. */
						if (open && onText(x, y)) { open = 0; }
						omMeas++; omOpen += open;
					}
					omCell[k] = open;
					if (open) {
						omList[omN++] = k;
						omNine[mn(2, (y / vh * 3) | 0) * 3 + mn(2, (x / vw * 3) | 0)]++;
						omCol[mn(2, (x / vw * 3) | 0)]++;
					}
				}
			}
			/* The open FRACTION is of what could actually be sampled. Cells
			 * off the bottom of the viewport are unknown, and counting them
			 * as open would keep the map "usable" on a page whose visible
			 * part is solid — the same unmeasurable-is-not-covered trap the
			 * mount fell into in 3.11.0, in the other direction. They still
			 * belong in the candidate pool: nothing is known to paint there. */
			omFrac = omMeas ? omOpen / omMeas : 1;
			omMs = nowMs() - t0;
			sepTarget();
		}
		function queueMap(ms) {
			clearTimeout(omTimer);
			var wait = mx2(ms || 200, MAP_MIN - (nowMs() - omAt));
			omTimer = setTimeout(buildOpenMap, mx2(0, wait));
		}
		/* A sticky canvas rides the viewport, so scrolling changes what is
		 * under it. Settle first: a scroll is a stream of events. */
		W.addEventListener('scroll', function () { queueMap(220); queueCover(260); }, { passive: true });

		/* --- Coverage is not a load-time fact. --------------------------
		 * fixCoverage() ran at mount and again at the settled pass, and both
		 * of those happen at whatever scroll offset the page loads at —
		 * normally 0. At scroll 0 the only thing inside the canvas box is
		 * the host's own background, so reach measures 100%, the corrective
		 * loop concludes there is nothing to fix, and it is never asked
		 * again. Everything that actually covers the backdrop on this site
		 * is BELOW THE FOLD at that moment.
		 *
		 * Measured on the Elementor fixture at 1280x900, reach by scroll
		 * offset: 0 -> 100%, 400 -> 88%, 900 -> 63%, 1400 -> 38%. So by the
		 * time the visitor is reading, nearly two thirds of the backdrop is
		 * painted over, and the engine still believes its own load-time
		 * verdict of 100%.
		 *
		 * Note what the covering elements are NOT: their stacking contexts
		 * are irrelevant. A DESCENDANT of the host paints above a
		 * z-index:-1 child of that host whether or not it makes a context —
		 * negative-z children paint in step 3 of the painting order and
		 * in-flow descendants in step 4 and later. Transform, filter and
		 * opacity on those sections change nothing about this.
		 *
		 * So this pass only ever moves a covering background onto the
		 * canvas. It never re-hosts: a descend mid-scroll would move the
		 * backdrop under the reader and re-open every decision the settled
		 * pass made. */
		var covTimer = 0, covAt = 0, covRuns = 0;
		var COVER_MIN = 500;   /* ms between re-checks, at most */
		function refreshCover() {
			covTimer = 0;
			covAt = nowMs();
			if (!CFG.layer || !host || !D.body.contains(cv)) { return; }
			if (bgFills.length >= BGFILL_MAX) { return; }
			/* Up to three coverers per settle: the common case is one new
			 * section scrolling in, and an unbounded loop here would walk
			 * the whole page in one frame. */
			for (var pass = 0; pass < 3; pass++) {
				var cov = coverage();
				if (!cov.measurable || cov.reach >= 0.75 || !cov.cover) { break; }
				if (!transferBg(cov.cover)) { break; }
				covRuns++;
			}
		}
		function queueCover(ms) {
			if (!CFG.layer) { return; }
			clearTimeout(covTimer);
			var wait = mx2(ms || 260, COVER_MIN - (nowMs() - covAt));
			covTimer = setTimeout(refreshCover, mx2(0, wait));
		}

		/* One open cell whose centre lies in the wanted box, found by a
		 * bounded scan from a random start — no allocation, and it degrades
		 * to "no cell" rather than looping when the box has none open.
		 * col 0/1/2 restricts to a third of the width (an entry edge). */
		function pickCell(x0, x1, y0, y1, col) {
			if (!mapUsable()) { return -1; }
			var s = (rand() * omN) | 0, i, k, c, rw, x, y;
			for (i = 0; i < omN && i < 24; i++) {
				k = omList[(s + i) % omN];
				c = k % omC; rw = (k - c) / omC;
				x = (c + 0.5) * vw / omC;
				y = (rw + 0.5) * vh / omR;
				if (x < x0 || x > x1) { continue; }
				if (y1 > y0 && (y < y0 || y > y1)) { continue; }
				if (col >= 0 && mn(2, (x / vw * 3) | 0) !== col) { continue; }
				return k;
			}
			return -1;
		}
		function cellX(k) { var c = k % omC; return clamp(((c + 0.5) + rnd(-0.45, 0.45)) * vw / omC, 0, vw); }
		function cellY(k) { var rw = ((k - (k % omC)) / omC); return clamp(((rw + 0.5) + rnd(-0.45, 0.45)) * vh / omR, 0, vh); }
		/* An open x anywhere on the row a deliberate actor is entering on,
		 * and an open y for a crosser entering from `edge` (-1 either). */
		function openX(x0, x1, y) {
			var k = pickCell(x0, x1, y, y, -1);
			return k < 0 ? rnd(x0, x1) : clamp(cellX(k), x0, x1);
		}
		function openBandY(y0, y1, edge) {
			var k = pickCell(0, vw, y0, y1, edge);
			if (k < 0) { k = pickCell(0, vw, y0, y1, -1); }
			return k < 0 ? rnd(y0, y1) : clamp(cellY(k), y0, y1);
		}

		/* --- Seed-time spatial guardrail. --------------------------------
		 * A uniform random position is free to bunch: modelled offline, 16
		 * particles put six or more into the same ninth of the canvas in
		 * ~10% of fields, and up to nine. Placement now throws up to
		 * SPREAD_TRIES candidates and takes the first that lands in a ninth
		 * still under its even share AND no closer than the spacing target
		 * to a live particle; if none qualifies, the best candidate seen
		 * (fewest neighbours in its ninth, then furthest from anything).
		 * Same model: worst ninth 3 of 16, ~2.8 candidates per particle.
		 *
		 * It runs at SEED time only -- never per frame -- so it cannot fight
		 * the motion, and a resize still rescales rather than re-seeds.
		 * Behaviors that place themselves on purpose (water-line riders,
		 * growers, off-screen entrances) and the hero never come through
		 * here. Pass y1 <= y0 for a fixed y (an entrance): the field is then
		 * spread across x alone, against column totals. --- */
		/* A small field can afford to look harder, and wants more room
		 * between its members: at density 10 there are 90 candidate throws
		 * in a whole seeding pass, which costs nothing. */
		var SPREAD_TRIES = maxParts <= 12 ? 16 : 8;
		var SEP_K = maxParts <= 12 ? 0.6 : 0.45;
		var occ = [0, 0, 0, 0, 0, 0, 0, 0, 0];
		var qta = [0, 0, 0, 0, 0, 0, 0, 0, 0];
		var sepRun = 0;
		/* The pitch an even lattice of this field would have over the part of
		 * the page a sprite can be SEEN in. Seeding and the runtime
		 * anti-clump share it, so they cannot pull against each other. */
		function sepTarget() {
			sepRun = MT.sqrt(mx2(1, vw * vh * (mapUsable() ? omFrac : 1)) / mx2(1, maxParts)) * SEP_K;
		}
		function spreadPlace(p, x0, x1, y0, y1) {
			var flat = !(y1 > y0);
			var useMap = mapUsable();
			var i, j, q, c, r, ct, near, dx, dy, d2, x, y, sc, k, op;
			var live = 0;
			for (i = 0; i < 9; i++) { occ[i] = 0; }
			for (i = 0; i < parts.length; i++) {
				q = parts[i];
				if (q === p || q.dormant) { continue; }
				/* Off-screen particles hold no ninth, but they DO hold the
				 * column they are about to enter, which is the whole point
				 * of the flat pass. */
				if (!(q.x >= 0) || q.x > vw) { continue; }
				if (!flat && (!(q.y >= 0) || q.y > vh)) { continue; }
				c = mn(2, (q.x / vw * 3) | 0);
				r = flat ? 0 : mn(2, (q.y / vh * 3) | 0);
				occ[r * 3 + c]++;
				live++;
			}
			/* The even share is a share of the OPEN cells, not of the area.
			 * A third of a canvas that is 15% visible is not a third of what
			 * anyone can see — sharing by area is exactly what made the field
			 * look random below the fold while obeying the rule. A ninth with
			 * nothing open takes no one. */
			var cells = flat ? 3 : 9;
			for (i = 0; i < cells; i++) {
				op = useMap ? (flat ? omCol[i] : omNine[i]) : 0;
				qta[i] = useMap
					? (op === 0 ? 0 : mx2(1, MT.ceil((live + 1) * op / omN)))
					: mx2(1, MT.ceil((live + 1) / cells));
			}
			var vis = useMap ? omFrac : 1;
			var sep = flat
				? (x1 - x0) * vis / mx2(1, live + 1) * SEP_K
				: MT.sqrt(mx2(1, (x1 - x0) * (y1 - y0) * vis) / mx2(1, live + 1)) * SEP_K;
			var sep2 = sep * sep;
			var bx = x0, by = y0, best = -1e18;
			for (i = 0; i < SPREAD_TRIES; i++) {
				/* Draw the candidate from an OPEN cell when there is a map;
				 * fall back to the whole range when the wanted box has none
				 * (a narrow band can be entirely painted over). */
				k = useMap ? pickCell(x0, x1, flat ? 0 : y0, flat ? 0 : y1, -1) : -1;
				if (k >= 0) {
					x = clamp(cellX(k), x0, x1);
					y = flat ? y0 : clamp(cellY(k), y0, y1);
				} else {
					x = rnd(x0, x1);
					y = flat ? y0 : rnd(y0, y1);
				}
				c = mn(2, mx2(0, (x / vw * 3) | 0));
				r = flat ? 0 : mn(2, mx2(0, (y / vh * 3) | 0));
				ct = occ[r * 3 + c];
				near = 1e12;
				for (j = 0; j < parts.length; j++) {
					q = parts[j];
					if (q === p || q.dormant) { continue; }
					dx = q.x - x; dy = flat ? 0 : q.y - y;
					d2 = dx * dx + dy * dy;
					if (d2 < near) { near = d2; }
				}
				if (ct < qta[flat ? c : r * 3 + c] && near >= sep2) { bx = x; by = y; best = 1e18; break; }
				sc = (near > 1e6 ? 1e6 : near) - ct * 1e7;
				if (sc > best) { best = sc; bx = x; by = y; }
			}
			p.x = bx; p.y = by;
		}

		/* --- Runtime anti-clump. ------------------------------------------
		 * Seeding decides where a sprite STARTS; motion decides where the
		 * field actually is a minute later, and free-air motion re-bunches —
		 * "isn't as bad but still needs to be better" is what a seed-only
		 * rule feels like once it has been running a while. So: a soft
		 * pairwise separation, free-air behaviours only. Below the shared
		 * spacing target the push fades linearly to nothing AT it, so it
		 * never oscillates, never chases a sprite that is already far enough
		 * away, and never becomes the per-frame repulsion 3.14.0 warned
		 * against — it cannot pull a field apart faster than 14px a second.
		 * Sprites that are off the canvas are skipped and the result is
		 * clamped to the box, so a nudge can never push one over an edge and
		 * trigger the respawn 3.13.0 spent a release removing. At most 16
		 * particles is at most 120 pairs. Reduced motion never reaches here:
		 * the loop does not run at all. --- */
		var REPEL_V = 14, repMs = 0, repN = 0;
		function deClump(dt) {
			var s = sepRun;
			if (!(s > 0)) { return; }
			var t0 = CFG.diag ? nowMs() : 0;
			var n = parts.length, i, j, a, b2, dx, dy, d2, d, f, ux, uy, s2 = s * s;
			for (i = 0; i < n; i++) {
				a = parts[i];
				if (!a.free || a.dormant || a.x < 0 || a.x > vw || a.y < 0 || a.y > vh) { continue; }
				for (j = i + 1; j < n; j++) {
					b2 = parts[j];
					if (!b2.free || b2.dormant || b2.x < 0 || b2.x > vw || b2.y < 0 || b2.y > vh) { continue; }
					dx = b2.x - a.x; dy = b2.y - a.y;
					d2 = dx * dx + dy * dy;
					if (d2 >= s2 || d2 < 0.01) { continue; }
					d = MT.sqrt(d2);
					f = (1 - d / s) * REPEL_V * dt;
					ux = dx / d * f; uy = dy / d * f;
					a.x = clamp(a.x - ux, 0, vw); a.y = clamp(a.y - uy, 0, vh);
					b2.x = clamp(b2.x + ux, 0, vw); b2.y = clamp(b2.y + uy, 0, vh);
				}
			}
			if (t0) { repMs = repN ? repMs + (nowMs() - t0 - repMs) * 0.05 : nowMs() - t0; repN++; }
		}

		function seed(p, anywhere, force) {
			var sp = force || (pool.length ? pickSpec(p) : null);
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
			/* Which behaviours the guardrail owns: free air, nothing staged.
			 * Space-delimited on purpose — a bare indexOf would match 'fly'
			 * inside 'firefly' and hand the crossers to the anti-clump. */
			p.free = FREEAIR.indexOf(' ' + p.b + ' ') >= 0 ? 1 : 0;
			var slow = (def.slow ? 0.45 : 1) * (p.far ? 0.5 : 1);
			var b = p.b;
			var offY = up ? vh + 30 : -30;
			if (anywhere) { spreadPlace(p, 0, vw, 0, vh * 0.8); }
			else { spreadPlace(p, 0, vw, offY, offY); }
			p.vx = rnd(-8, 8) * (p.far ? 0.5 : 1);
			p.vy = rnd(14, 30) * slow * dirY();
			p.sw = 6;
			if (b === 'sway') { p.vy = rnd(8, 16) * slow * dirY(); p.sw = 22; p.vr = rnd(-0.6, 0.6); }
			if (b === 'tumble') { p.vr = rnd(-4, 4); p.sw = 10; }
			if (b === 'spin') { p.vy = rnd(4, 8) * dirY(); p.vr = rnd(0.5, 1); p.sw = 3; }
			if (b === 'wobble') { p.vy = rnd(6, 10); p.sw = 18; p.vr = 0; }
			if (b === 'flutter') {
				spreadPlace(p, 0, vw, vh * 0.05, vh * 0.7);
				p.vx = (sgn()) * rnd(25, 55) * (p.far ? 0.5 : 1);
				p.vy = 0; p.vr = 0;
			}
			if (b === 'float') {
				p.x = rnd(vw * 0.05, vw * 0.95);
				p.y = waterY;
				p.vx = rnd(-4, 4); p.vy = 0; p.vr = 0;
			}
			if (b === 'rise') {
				if (anywhere) { spreadPlace(p, 0, vw, vh * 0.3, vh); }
				else { spreadPlace(p, 0, vw, vh + 20, vh + 20); }
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
				/* A crosser is only worth watching on a row where something
				 * can be seen, and it enters from one edge — so weight the
				 * band toward open cells on THAT side. */
				p.y = def.low ? openBandY(vh * 0.72, vh * 0.88, p.dir > 0 ? 0 : 2)
					: openBandY(vh * 0.08, vh * 0.55, p.dir > 0 ? 0 : 2);
				p.vx = p.dir * rnd(30, 70) * slow;
				p.vy = 0; p.vr = 0;
				p.n = b === 'vee' ? 2 + ((rand() * 3) | 0) : 1;
				if (anywhere) { p.x = openX(0, vw, p.y); }
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
				if (anywhere) { spreadPlace(p, 0, vw, 0, vh); }
				else { spreadPlace(p, 0, vw, vh + 20, vh + 20); }
				p.vy = -rnd(6, 12) * (p.far ? 0.5 : 1); p.vr = 0; p.sw = 10;
			}
			if (b === 'orbit') {
				spreadPlace(p, vw * 0.15, vw * 0.85, vh * 0.15, vh * 0.6);
				p.vx = rnd(-5, 5); p.vy = rnd(-4, -1);
				p.orr = rnd(14, 22); p.vr = 0;
			}
			if (b === 'dangle') {
				spreadPlace(p, vw * 0.1, vw * 0.9, 0, 0);
				p.dy = water ? waterY - 40 : rnd(vh * 0.2, vh * 0.5);
				p.st = 1; p.t = 0; p.vr = 0;
			}
			if (b === 'hang') {
				spreadPlace(p, vw * 0.05, vw * 0.95, p.y, p.y);
				/* hl: a longer thread, as fractions of the screen height —
				 * Christmas's ornaments and holly hang down through the page
				 * instead of bunching in the header band (4.2.0). */
				p.len = p.sp.def.hl ? rnd(vh * p.sp.def.hl[0], vh * p.sp.def.hl[1]) : rnd(30, 80);
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
				p.x = anywhere ? openX(0, vw, p.y) : (p.dir > 0 ? -30 : vw + 30);
				p.vx = p.dir * (b === 'hop' ? rnd(40, 80) : b === 'chatter' ? rnd(50, 90) : rnd(15, 30));
				p.vy = 0; p.vr = 0;
				p.hopH = rnd(20, 40);
			}
			if (b === 'dart') {
				spreadPlace(p, vw * 0.1, vw * 0.9, vh * 0.1, vh * 0.66);
				p.hx = p.x; p.hy = p.y;
				p.st = 1; p.t = rnd(1, 2.5); p.darts = 4 + ((rand() * 3) | 0); p.vr = 0;
			}
			if (b === 'twinkle') {
				spreadPlace(p, 0, vw, 0, vh * 0.85);
				p.vx = 2; p.vy = 0; p.vr = 0;
				p.t = rnd(6, 10);
			}
			if (b === 'jump') {
				p.st = 1; p.t = rnd(3, 10); p.vr = 0;
			}
			if (b === 'firefly') {
				spreadPlace(p, 0, vw, vh * 0.4, vh * 0.85);
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
				var key = p.sKey;
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

		/* Water-line riders (boats, pads) YIELD to a scene's actors: within
		 * 90px of one they ease out and ease back once it has passed. A pontoon
		 * parked on the gator, or a jon boat inside the limpkin, read as a
		 * collision; borrowing them all instead would empty the screen, which
		 * a phone scene must not do. */
		var RIDERS = ' cruise float frogger ', actorX = null;
		function sceneActors() {
			if (!water || !vig || !vig.st || vig.sky) { return null; }
			var st = vig.st, out = [], k2, keys = ['x', 'sx', 'gx', 'tx'];
			for (k2 = 0; k2 < keys.length; k2++) { if (typeof st[keys[k2]] === 'number') { out.push(st[keys[k2]]); } }
			return out.length ? out : null;
		}
		function riderYield(p, dt) {
			if (RIDERS.indexOf(' ' + p.b + ' ') < 0) { return; }
			var want = 1;
			if (actorX) {
				for (var k2 = 0; k2 < actorX.length; k2++) { if (abs(p.x - actorX[k2]) < 90) { want = 0; break; } }
			}
			p.yl = (p.yl == null ? 1 : p.yl) + (want - (p.yl == null ? 1 : p.yl)) * mn(1, dt * 4);
		}
		function drawP(p, t) {
			if (p.dormant || p.alpha <= 0 || p.yl < 0.02) { return; }
			var b = p.b;
			var layerA = p.far ? 0.6 : 1;
			var layerS = p.far ? 0.6 : 1;
			cx.save();
			cx.globalAlpha = alphaBase * clamp(p.alpha, 0, 1) * layerA * (evening ? 0.9 : 1) * (p.yl == null ? 1 : p.yl);
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
			/* The rising year is New Year's only — Independence Day shares the
			 * burst machinery and must not announce "2027" in July. */
			if (themeKey === 'new_years') { yearFx = { x: bx, y: by, a: 1.4 }; }
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

		/* --- The sky belongs to the header picture (4.10.7, Rob: "The
		 * witch/moon appear whenever I scroll down the page, too, but I only
		 * wanted it in the hero area"). The sky scenes and the sky flyers are
		 * drawn on a second canvas INSIDE the page's header picture
		 * (CFG.skySel, the first match): laid out against its box, clipped by
		 * it, scrolling with it on the compositor (no scroll listener, no
		 * per-scroll work, nothing to lag behind the picture). They wait for
		 * the picture to be at least half in view; a page without one has no
		 * sky scene and no sky flyer. The falling sprites, the water-line
		 * scenes, the bass, the manatee and the rainbow stay on the page's
		 * canvas exactly as before; that canvas is above the header's
		 * stacking context (#masthead, z 999 on the site), so embers and
		 * falling bits drift in FRONT of the moon and the flyers (Rob's
		 * pick A). The same title and foreground cut-outs run on the sky
		 * canvas, which sits above everything else in the header.
		 * While a sky actor runs, inSky() points the drawing state (cv, cx,
		 * vw, vh, waterY, ground, lastDpr) at the sky canvas, so every scene
		 * and flyer works in the picture's own coordinates unchanged. --- */
		var SKY_VIG = { witchmoon: 1, sleighmoon: 1, doveflight: 1, flagfly: 1, corkpop: 1 };
		/* the flyers that cross the sky; the bass and the manatee are on the
		 * water, the rainbow in a corner */
		var SKY_HERO = { heron: 1, eagle: 1, witch: 1, sleigh: 1, osprey: 1 };
		var SKY_SEL = CFG.skySel == null ? '#header-image-main-inside' : CFG.skySel;
		var skyPic = null;
		try { skyPic = SKY_SEL ? D.querySelector(SKY_SEL) : null; } catch (e) { skyPic = null; }
		var sky = null, skyMode = false, cvOX = 0, cvOY = 0, cvUX = 0, cvUY = 0, skyRatio = -1, skyStat = { builds: 0, frames: 0 };
		if (skyPic && W.IntersectionObserver) {
			new W.IntersectionObserver(function (es) { skyRatio = es[es.length - 1].intersectionRatio; }, { threshold: [0, 0.25, 0.5, 0.75, 1] }).observe(skyPic);
		}
		/* in view: at least half the picture on screen */
		function skyInView() {
			if (!skyPic) { return false; }
			if (skyRatio >= 0) { return skyRatio >= 0.499; }
			var r = skyPic.getBoundingClientRect(), vis = mn(r.bottom, W.innerHeight) - mx2(r.top, 0);
			return r.height > 0 && vis >= r.height / 2;
		}
		/* the sky canvas: made on first use, sized to the picture's box (a
		 * ResizeObserver marks a change; nothing is read on scroll) */
		function skyEnsure() {
			if (!skyPic) { return null; }
			if (!sky) {
				var c = D.createElement('canvas');
				c.className = 'dcc-seasons-sky';
				c.setAttribute('aria-hidden', 'true');
				c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;display:block;z-index:' + FRONT_Z + ';';
				var g = c.getContext('2d');
				if (!g) { skyPic = null; return null; }
				if (W.getComputedStyle(skyPic).position === 'static') { skyPic.style.position = 'relative'; }
				sky = { c: c, g: g, w: 0, h: 0, dpr: 0, ox: 0, oy: 0, dirty: false, resized: true };
				if (W.ResizeObserver) { new W.ResizeObserver(function () { sky.resized = true; }).observe(skyPic); }
			}
			if (!sky.c.isConnected) { skyPic.appendChild(sky.c); sky.resized = true; }
			if (sky.resized) {
				sky.resized = false;
				var w = mx2(1, skyPic.clientWidth), h = mx2(1, skyPic.clientHeight), dpr = mn(W.devicePixelRatio || 1, 2);
				/* The canvas sits on WHOLE device pixels of the page, whatever
				 * fraction the picture lands on (on the site it is 115.19 px
				 * down at 1x), and the picture's own px are drawn offset by
				 * that fraction: the title's letters are cut on the page's
				 * pixel grid, and half a pixel off let the moon show through
				 * a serif's hairline (4.10.1). */
				var pr = skyPic.getBoundingClientRect(), pX = (pr.left + (W.pageXOffset || 0)) * dpr, pY = (pr.top + (W.pageYOffset || 0)) * dpr;
				var ox = (pX - MT.floor(pX + 0.001)) / dpr, oy = (pY - MT.floor(pY + 0.001)) / dpr;
				if (w !== sky.w || h !== sky.h || dpr !== sky.dpr || abs(ox - sky.ox) > 1e-3 || abs(oy - sky.oy) > 1e-3) {
					var sx = sky.w ? w / sky.w : 1, sy = sky.h ? h / sky.h : 1;
					var cw = MT.ceil((w + ox) * dpr), ch = MT.ceil((h + oy) * dpr);
					sky.c.width = cw; sky.c.height = ch;
					sky.c.style.left = (-ox) + 'px'; sky.c.style.top = (-oy) + 'px';
					sky.c.style.width = (cw / dpr) + 'px'; sky.c.style.height = (ch / dpr) + 'px';
					sky.g.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
					sky.g.textAlign = 'center'; sky.g.textBaseline = 'middle';
					sky.w = w; sky.h = h; sky.dpr = dpr; sky.ox = ox; sky.oy = oy; sky.dirty = false;
					skyStat.builds++;
					/* the actors in flight slide into the new box */
					if (sx !== 1 || sy !== 1) {
						if (hero && hero.sky) { scaleXY(hero, sx, sy); }
						if (vig && vig.sky && vig.st) { scaleXY(vig.st, sx, sy); }
					}
				}
			}
			return sky;
		}
		/* run fn with the drawing state on the sky canvas */
		function inSky(fn) {
			var S = skyEnsure();
			if (!S) { return; }
			var r = S.c.getBoundingClientRect();
			/* still on whole device pixels? (something above the picture
			 * moved it by a fraction: realign, a rare write, never per scroll) */
			var px = (r.left + (W.pageXOffset || 0)) * S.dpr, py = (r.top + (W.pageYOffset || 0)) * S.dpr;
			if (abs(px - MT.round(px)) > 0.02 || abs(py - MT.round(py)) > 0.02) { S.resized = true; S = skyEnsure(); r = S.c.getBoundingClientRect(); }
			var o = [cv, cx, vw, vh, waterY, ground, lastDpr, cvOX, cvOY, cvUX, cvUY];
			cv = S.c; cx = S.g; vw = S.w; vh = S.h; waterY = vh * 0.92; ground = vh - 16; lastDpr = S.dpr;
			/* the picture's origin: in the viewport, and inside the canvas */
			cvUX = S.ox; cvUY = S.oy; cvOX = r.left + S.ox; cvOY = r.top + S.oy;
			skyMode = true; S.dirty = true;
			try { return fn(); } finally {
				skyMode = false;
				cv = o[0]; cx = o[1]; vw = o[2]; vh = o[3]; waterY = o[4]; ground = o[5]; lastDpr = o[6]; cvOX = o[7]; cvOY = o[8]; cvUX = o[9]; cvUY = o[10];
			}
		}
		/* once a frame, before anything is drawn on it: a sky canvas that
		 * was drawn on last frame starts clean */
		function skyClear() {
			if (!sky || !sky.dirty) { return; }
			sky.g.save(); sky.g.setTransform(1, 0, 0, 1, 0, 0); sky.g.clearRect(0, 0, sky.c.width, sky.c.height); sky.g.restore();
			sky.dirty = false; skyStat.frames++;
		}

		/* --- Heroes: rare crossers. The heron (drawn in code, a continuous
		 * wingbeat, an occasional landing) is always in the rotation. --- */
		var hero = null, heroFrame = '', heroNext = '';
		var heroPool = ['heron'];
		if (A.hero) { heroPool.push(A.hero); }
		var heroForced = !!(DEBUG && CFG.heroOnly);
		if (heroForced) { heroPool = [CFG.heroOnly]; }   /* the suites force one hero */
		/* 4.12.0 (Rob): the Hero Effects mu-plugin carries its own copy of the
		 * 4.9.0 heron (3.16.2). Where its heron is on it says so with
		 * window.DCCHeroFx.heron === true, and ours stands down — read at
		 * every choice, never cached, because the flag can be set after we
		 * start. A preview or a debug knob that names the heron still gets
		 * it. On a theme with no other flyer this empties the pool, and a
		 * Seasons moment is then its scene alone: never another bird. */
		function heronOff() {
			var h = W.DCCHeroFx;
			return !heroForced && !!(h && h.heron === true);
		}
		function heroPoolNow() {
			if (!heronOff()) { return heroPool; }
			var out = [], k;
			for (k = 0; k < heroPool.length; k++) { if (heroPool[k] !== 'heron') { out.push(heroPool[k]); } }
			return out;
		}
		/* no header picture: no sky flyers */
		if (!skyPic) { heroPool = heroPool.filter(function (k) { return !SKY_HERO[k]; }); }
		/* the pre-draw is idle work for a bird we may never fly */
		/* The heron's poses, pre-drawn once after load in idle time (see
		 * HN_ above), at the bird's size and the screen's density (capped at
		 * 2). A pose the idle pass has not reached yet is drawn on first use,
		 * so nothing waits on it. Kept for the page's life: the heron comes
		 * back every other appearance. */
		var HN_W = 96, hnCache = {}, hnStats = { poses: 0, ms: 0, bytes: 0 };
		function hnBuild(key) {
			var t0 = nowMs(), b = hnBounds(key), u = HN_W / 100, s = u * mn(W.devicePixelRatio || 1, 2);
			var c = D.createElement('canvas');
			c.width = MT.ceil((b[2] - b[0]) * s);
			c.height = MT.ceil((b[3] - b[1]) * s);
			var g = c.getContext('2d');
			if (g) {
				g.setTransform(s, 0, 0, s, -b[0] * s, -b[1] * s);
				if (key === 's') { hnStand(g); } else { hnFly(g, hnPose(key)); }
			}
			hnStats.poses++; hnStats.bytes += c.width * c.height * 4; hnStats.ms += nowMs() - t0;
			return (hnCache[key] = { c: c, x: b[0] * u, y: b[1] * u, w: (b[2] - b[0]) * u, h: (b[3] - b[1]) * u, bob: key === 's' ? 0 : hnPose(key).bob * u });
		}
		function hnGet(key) { return hnCache[key] || hnBuild(key); }
		if (FX.heroes && heroPool.indexOf('heron') >= 0 && !heronOff()) {
			var hnTodo = ['s', 'f'], hnI;
			for (hnI = 0; hnI < HN_BEATS; hnI++) { hnTodo.push('b' + hnI); }
			for (hnI = 1; hnI <= HN_GLIDES; hnI++) { hnTodo.push('g' + hnI); }
			var hnIdle = function (dl) {
				var t0 = nowMs();
				if (heronOff()) { hnTodo.length = 0; return; }   /* the flag came late */
				do { var k = hnTodo.shift(); if (k && !hnCache[k]) { hnBuild(k); } }
				while (hnTodo.length && (dl && dl.timeRemaining ? dl.timeRemaining() > 4 : nowMs() - t0 < 6));
				if (hnTodo.length) { hnLater(hnIdle); }
			};
			var hnLater = function (f) { if (W.requestIdleCallback) { W.requestIdleCallback(f, { timeout: 2000 }); } else { setTimeout(f, 50); } };
			hnLater(hnIdle);
		}
		/* The flight: bouts of 4-6 beats, then a glide out of the downstroke
		 * with the wings held bowed. Returns this frame's pose key. */
		function hnStep(f, dt) {
			if (f.gl > 0) {
				f.gt += dt;
				if (f.gt >= f.gl) { f.gl = 0; f.ph = MT.floor(f.ph) + HN_GB / HN_BEATS; f.beats = 4 + ((rand() * 3) | 0); return 'b' + HN_GB; }
				var u = f.gt < 0.35 ? f.gt / 0.35 : (f.gl - f.gt < 0.3 ? (f.gl - f.gt) / 0.3 : 1);
				var gi = MT.round(hnEase(u) * HN_GLIDES);
				return gi ? 'g' + gi : 'b' + HN_GB;
			}
			var was = f.ph;
			f.ph += dt * f.bps;
			if (MT.floor(f.ph) > MT.floor(was)) { f.beats--; }
			var fr = f.ph - MT.floor(f.ph);
			if (f.beats <= 0 && f.glides && fr >= HN_GB / HN_BEATS) {
				f.ph = MT.floor(f.ph) + HN_GB / HN_BEATS;
				f.gl = f.hold ? 1e9 : rnd(0.9, 1.6); f.gt = 0;
				return 'b' + HN_GB;
			}
			return 'b' + (MT.round(fr * HN_BEATS) % HN_BEATS);
		}
		/* Drawn heroes with a two-frame wingbeat: [up, down, ms per frame].
		 * Every hero is a drawing (4.2.0) — device emoji looked different on
		 * iPhone, Android and Windows and matched nothing else on screen. The
		 * ONE exception is Rob's own: the rainbow keeps its ☘ clover strip. */

		/* --- Hero timing (4.2.0; the order is Rob's 4.9.0 pick) -------------
		 * The clock is VISIBLE time: rAF stops in a hidden tab, so vt only
		 * moves while someone can see the page.
		 *  - Every page opens with the season's scene at 6-10 s. On the
		 *    first page of a visit (sessionStorage, i.e. this tab) the hero
		 *    follows 2 s after that scene ends; on later pages, and in a
		 *    browser that refuses storage (null), the scene and hero simply
		 *    take turns. A theme with no scene sends its hero at 6-10 s.
		 *  - The home page's hero-image show (dcc-hero-life, 3.11.0+:
		 *    seaplane, then the fishing catch) publishes
		 *    window.DCCHeroFx.state = none | busy | done and fires
		 *    'dcc:herofx' on document. No hero STARTS while it is busy;
		 *    after busy -> done the first hero crosses 2s later. A show
		 *    that never reports done is ignored after 70s of visible time.
		 *  - A scene and a hero never share the screen (both directions). */
		var vt = 0, VT_X = (DEBUG && CFG.vtScale) || 1;
		/* Read LAZILY (4.12.0): under the moments queue our own first-page
		 * rule must not run at all, and reading this WRITES the visit key —
		 * which would spend the visitor's first page on a turn we never
		 * take. The queue may also appear after us, so the question is
		 * asked at the moment it is needed, not at start. */
		var firstPageAt = 0;
		function firstPage() {
			if (firstPageAt) { return firstPageAt > 0 ? (firstPageAt === 1) : null; }
			try {
				var ss = W.sessionStorage, visitKey = 'dcc_seasons_visit';
				if (ss.getItem(visitKey)) { firstPageAt = 2; return false; }
				ss.setItem(visitKey, '1');
				firstPageAt = 1;
				return true;
			} catch (e) { firstPageAt = -1; return null; }
		}
		/* One scheduler for heroes AND scenes (4.8.0). heroAt / vigAt are the
		 * visible times each is due; INF means "not its turn". The suites'
		 * debug knobs: heroFirst (s, any page), heroEvery (s, the gap after a
		 * hero), vigFirst / vigGap (ms). */
		function gapAfter(kind) {
			if (DEBUG && kind === 'hero' && CFG.heroEvery) { return rnd(CFG.heroEvery[0], CFG.heroEvery[1]); }
			if (DEBUG && kind === 'vig' && CFG.vigGap) { return CFG.vigGap / 1000; }
			return rnd(EVERY[0], EVERY[1]);
		}
		var heroFirst = (DEBUG && CFG.heroFirst) || null;
		var heroAt = heroFirst ? rnd(heroFirst[0], heroFirst[1]) : INF, heroCount = 0, heroLive = false;
		/* First page: the flyer's turn comes when the first scene ends. Under
		 * the moments queue there is no first-page rule and the question is
		 * never asked (reading it writes the visit key). */
		var heroAfterScene = false;
		var FX_CAP = 70, fxBusySeen = false, fxDoneAt = -1;
		function heroFxState() {
			var h = W.DCCHeroFx;
			return h && typeof h.state === 'string' ? h.state : 'none';
		}
		function watchHeroFx() {
			var st = heroFxState();
			if (st === 'busy') { fxBusySeen = true; }
			else if (st === 'done' && fxBusySeen && fxDoneAt < 0) { fxDoneAt = vt; }
		}
		D.addEventListener('dcc:herofx', watchHeroFx);

		/* --- Our turn in the queue (4.12.0, Rob) --------------------------
		 * While window.DCCMoments exists it OWNS the timing on this page:
		 * nothing of ours starts by itself, our clocks stay at INF, and the
		 * first-page rule is never consulted. The moment is this page's
		 * scene and then, a breath later, its flyer — the opening order of
		 * 4.9.0, now played on the queue's word instead of our own. Either
		 * may decline (nothing today, the header out of view); whatever is
		 * left still plays, and done() is called exactly once. A scroll
		 * never aborts it. When the queue is absent everything below is
		 * inert and 4.11.0's timing runs unchanged. */
		/* Our own net, in seconds of visible time. Rob's budget is "about 30 s
		 * or less". Measured (tools/measure-moment.js): a phone moment runs
		 * 14-24 s, and a 1280 px one 25-44 — the flyer crosses the header
		 * picture's whole width at the speed Rob chose, so a wide screen
		 * simply takes longer (Florida Keys, its longest scene and the
		 * osprey, is the 44). Cutting a flyer off mid-flight to hit 30
		 * exactly is the one thing a guest would see, so the net sits just
		 * inside the queue's own 60 s instead, and the measured lengths went
		 * to the Director rather than a silent trim. */
		var MOM_CAP = 50;
		var mom = null, momStat = { plays: 0, dones: 0, scenes: 0, flyers: 0, capped: 0, last: 0 };
		function momentsOn() { return !!W.DCCMoments; }
		function momReady() {
			/* cheap and without side effects: it is asked every turn */
			return !!(cv && !reduced() && (canVig() || canHero()));
		}
		function momPlay(done) {
			var fired = false;
			var fin = function () {
				if (fired) { return; }
				fired = true;
				momStat.last = mom ? mom.t : 0;
				mom = null;
				momStat.dones++;
				if (typeof done === 'function') { try { done(); } catch (e) { /* the queue's business */ } }
			};
			momStat.plays++;
			if (mom) { fin(); return; }          /* already playing: decline politely */
			/* Whether the header picture is there to be seen is asked ONCE,
			 * now: the queue only calls us while it is in view, and a
			 * visitor who scrolls away mid-moment must not cut it short
			 * (Rob, 4.12.0) — it plays on out of sight, exactly as a scene
			 * already does in 4.10.7. */
			mom = { fin: fin, stage: 0, wait: 0, t: 0, inView: skyInView() };
			momStep(0);
		}
		/* Stepped from the frame loop, on visible time, after vt advances. */
		function momStep(dt) {
			if (!mom) { return; }
			mom.t += dt;
			if (mom.t > MOM_CAP) { momStat.capped++; mom.fin(); return; }
			if (mom.stage === 0) {
				/* the scene; it may decline (no scene today, or the header
				 * is not in view for a sky one) */
				if (canVig()) {
					vigNext = vigNext || pick(vigList);
					if (!SKY_VIG[vigNext] || mom.inView) {
						startVig(vigNext);
						vigNext = '';
						if (vig) { momStat.scenes++; mom.stage = 1; return; }
					}
				}
				mom.stage = 2;
				momStep(0);
				return;
			}
			if (mom.stage === 1) {
				if (vig) { return; }
				mom.wait += dt;
				if (mom.wait < TIMING.breath) { return; }
				mom.stage = 2;
				momStep(0);
				return;
			}
			if (mom.stage === 2) {
				if (canHero() && !vig) {
					if (heroNext && heronOff() && heroNext === 'heron') { heroNext = ''; }
					heroNext = heroNext || pick(heroPoolNow());
					if (!SKY_HERO[heroNext] || mom.inView) {
						var kind = heroNext;
						heroNext = '';
						if (SKY_HERO[kind]) { inSky(function () { spawnHero(0, kind); }); } else { spawnHero(0, kind); }
						if (hero) {
							momStat.flyers++;
							heroLive = true; heroCount++;
							heroLog.push({ kind: hero.kind, start: vt, end: -1, fx: heroFxState() });
							mom.stage = 3;
							return;
						}
					}
				}
				mom.fin();
				return;
			}
			if (!hero) { mom.fin(); }            /* stage 3: the flyer has gone */
		}
		momentHooks = { ready: momReady, play: momPlay };

		var heroLog = [], vigLog = [];
		function spawnHero(t, kind) {
			var dir = sgn();
			hero = { kind: kind, dir: dir, t: 0, ph: 0, sky: !!SKY_HERO[kind] };
			if (kind === 'heron') {
				hero.x = dir > 0 ? -110 : vw + 110;
				hero.y = rnd(vh * 0.15, vh * 0.45);
				hero.vx = dir * rnd(60, 90);
				hero.w = HN_W;
				hero.fl = { ph: rand(), bps: 2, beats: 4 + ((rand() * 3) | 0), gl: 0, gt: 0, glides: true };
				hero.key = hnStep(hero.fl, 0); hero.legs = 0; hero.pitch = 0; hero.sa = 0;
				/* The only day the heron flies inverted: April Fool's, rarely. */
				hero.invert = themeKey === 'april_fools' && rand() < 0.25;
				/* The landing: glide in, flare, stand, take off. */
				hero.land = !hero.invert && water && rand() < (themeKey === 'classic' || themeKey === 'florida_keys' ? 0.5 : 0.15);
				if (DEBUG && CFG.heronLand != null) { hero.land = !!CFG.heronLand && water; }
				/* in the header picture it just flies across (Rob, 4.10.7) */
				if (hero.sky) { hero.land = false; }
				if (hero.land) { hero.lx = rnd(vw * 0.3, vw * 0.7); hero.st = 1; }
			} else if (kind === 'eagle' || kind === 'witch') {
				hero.w = kind === 'eagle' ? 104 : 92;
				hero.x = dir > 0 ? -hero.w : vw + hero.w;
				hero.y = rnd(vh * 0.1, vh * 0.4);
				hero.vx = dir * rnd(70, 110);
				if (kind === 'eagle') { sprite('eagleup'); sprite('eagledown'); } else { sprite('witchsil'); }
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
				sprite('bassleap');
				hero.x = rnd(vw * 0.15, vw * 0.85);
				hero.y = waterY + 8;
				hero.vy = -rnd(340, 400);
				hero.vxj = rnd(-50, 50);
				addRipple(hero.x, waterY, true);
			} else if (kind === 'osprey') {
				/* Florida Keys (4.2.0): an osprey carrying its fish, on a
				 * steady two-frame wingbeat, well above the water. */
				hero.w = 96;
				hero.x = dir > 0 ? -hero.w : vw + hero.w;
				hero.y = rnd(vh * 0.12, vh * 0.4);
				hero.vx = dir * rnd(60, 85);
				sprite('ospreyup'); sprite('ospreydown');
			} else if (kind === 'rainbow') {
				hero.corner = rand() < 0.5 ? 0 : 1;
				hero.t = 0;
				sprite('rainbow');
			}
		}
		/* A hero that has just left: the gap to the next one starts now, in
		 * the same frame, so the log (and anything reading it) never shows a
		 * departed hero overlapping the scene that follows it. */
		function heroGone() {
			if (hero || !heroLive) { return; }
			heroLive = false;
			if (heroLog.length) { heroLog[heroLog.length - 1].end = vt; }
			nextTurn('hero');
		}
		/* Something just left the screen: whose turn is next, and when. A
		 * first appearance still waiting (the first scene, or a first hero
		 * held back by the hero-image show) keeps its turn, just not sooner
		 * than a breath after this one left. Otherwise the OTHER kind goes
		 * next if this theme has it, else the same kind again, 60-90 s on. */
		function canHero() { return !!FX.heroes && heroPoolNow().length > 0; }
		function canVig() { return vigList.length > 0; }
		function nextTurn(kind) {
			/* The queue decides what comes next, and when (4.12.0). */
			if (momentsOn()) { heroAt = INF; vigAt = INF; heroAfterScene = false; return; }
			/* The first scene of a visit's first page hands straight over to
			 * the flyer, a breath after it leaves. */
			if (kind === 'vig' && heroAfterScene) {
				heroAfterScene = false;
				if (canHero()) { heroAt = vt + TIMING.breath; vigAt = INF; return; }
			}
			var other = kind === 'hero' ? 'vig' : 'hero';
			var otherAt = other === 'hero' ? heroAt : vigAt;
			var otherOk = other === 'hero' ? canHero() : canVig();
			if (otherOk && otherAt < INF) {
				if (other === 'hero') { heroAt = mx2(heroAt, vt + TIMING.breath); vigAt = INF; }
				else { vigAt = mx2(vigAt, vt + TIMING.breath); heroAt = INF; }
				return;
			}
			var at = vt + gapAfter(kind), nk = otherOk ? other : kind;
			heroAt = nk === 'hero' ? at : INF;
			vigAt = nk === 'vig' ? at : INF;
		}
		function stepHero(dt, t) {
			if (!hero) {
				heroGone();
				/* the queue starts flyers through play(), never this path */
				if (momentsOn()) { heroAt = INF; return; }
				watchHeroFx();
				if (heroFxState() === 'busy' && vt < FX_CAP) { return; }
				var at = heroAt;
				if (!heroCount && fxDoneAt >= 0) { at = mx2(at, fxDoneAt + 2); }
				if (vt < at) { return; }
				if (!canHero()) { heroAt = INF; if (vigList.length && vigAt >= INF) { vigAt = vt + gapAfter('hero'); } return; }
				if (vig) { heroAt = vt + 4; return; }
				/* chosen once; a sky flyer waits for the header picture */
				if (heroNext && heronOff() && heroNext === 'heron') { heroNext = ''; }
				heroNext = heroNext || pick(heroPoolNow());
				if (SKY_HERO[heroNext] && !skyInView()) { return; }
				var kind = heroNext;
				heroNext = '';
				if (SKY_HERO[kind]) { inSky(function () { spawnHero(t, kind); }); } else { spawnHero(t, kind); }
				if (hero) {
					heroAt = INF;
					heroLive = true; heroCount++;
					heroLog.push({ kind: hero.kind, start: vt, end: -1, fx: heroFxState() });
				}
				return;
			}
			if (hero.sky) { inSky(function () { stepHero1(dt); }); } else { stepHero1(dt); }
		}
		function stepHero1(dt) {
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
			if (h.kind === 'heron' && !h.land) { h.key = hnStep(h.fl, dt); }
			if (h.kind === 'heron' && h.land) {
				/* The landing (4.9.0): fly in, glide down with the legs
				 * lowering, flare (the wings swing up and fan, braking), touch
				 * down and stand 2.5 s, then take off on hard beats with the
				 * legs still hanging. (h.x, h.y) is the flying bird's body;
				 * standing, its feet are 44 units below that, in the water. */
				var u4 = HN_W / 100, yLand = waterY + 2 - 44 * u4, dxl = h.lx - h.x, ahead = dxl * h.dir;
				h.t2 = (h.t2 || 0) + dt;
				if (h.st === 1) { /* in on the ordinary flight, then into a held glide */
					h.key = hnStep(h.fl, dt);
					h.x += h.vx * dt;
					h.y += sin(h.ph) * 8 * dt;
					/* a long drop starts its glide further out */
					if (ahead < mx2(220, 1.2 * (yLand - h.y))) { h.fl.beats = mn(h.fl.beats, 0); h.fl.hold = true; }
					if (h.fl.gl > 0) { h.st = 2; h.t2 = 0; h.y0 = h.y; h.a0 = mx2(ahead, 60); }
				} else if (h.st === 2) { /* the glide down */
					h.key = hnStep(h.fl, dt);
					h.vx = lerp(h.vx, h.dir * clamp(ahead * 0.8, 24, 90), mn(1, dt * 1.5));
					h.x += h.vx * dt;
					/* down an eased slope from where the glide began to the
					 * landing spot, steepest mid-way, level at both ends */
					h.y = lerp(h.y0, yLand, hnEase(1 - (ahead - 26) / (h.a0 - 26)));
					h.legs = clamp((140 - ahead) / 100, 0, 1);
					h.pitch = 0.12 * h.legs;
					if (ahead < 26) { h.st = 3; h.t2 = 0; }
				} else if (h.st === 3) { /* the flare: out of the glide, wings up, braking */
					var ft = h.t2;
					h.key = ft < 0.2 ? (MT.round((1 - ft / 0.2) * HN_GLIDES) ? 'g' + MT.round((1 - ft / 0.2) * HN_GLIDES) : 'b' + HN_GB)
						: ft < 0.55 ? 'b' + mn(HN_BEATS - 1, HN_GB + MT.floor((ft - 0.2) / 0.35 * (HN_BEATS - HN_GB))) : 'f';
					h.vx *= 1 - mn(1, dt * 3.5);
					h.x += h.vx * dt;
					h.y += (yLand - h.y) * mn(1, dt * 6);
					h.legs = 1;
					h.pitch = lerp(h.pitch, 0.32, mn(1, dt * 5));
					if (ft >= 0.8) { h.st = 4; h.t2 = 0; h.y = yLand; addRipple(h.x, waterY); }
				} else if (h.st === 4) { /* stand: the flying bird fades into the standing one */
					h.sa = clamp(h.t2 / 0.3, 0, 1);
					h.pitch *= 1 - mn(1, dt * 6);
					if (h.t2 >= 2.8) {
						h.st = 5; h.t2 = 0; addRipple(h.x, waterY);
						h.fl = { ph: 0, bps: 2.6, beats: 99, gl: 0, gt: 0, glides: false };
						h.vx = h.dir * 20;
					}
				} else { /* take off: hard beats, legs hanging, then away */
					h.key = hnStep(h.fl, dt);
					h.sa = 1 - clamp(h.t2 / 0.25, 0, 1);
					h.legs = 1 - clamp((h.t2 - 0.5) / 1.1, 0, 1);
					h.pitch = 0.22 * (1 - clamp(h.t2 / 1.6, 0, 1));
					h.vx = h.dir * mn(95, abs(h.vx) + 55 * dt);
					h.x += h.vx * dt;
					h.y -= mn(70, 25 + 30 * h.t2) * dt;
					if (h.t2 > 2.2) { h.fl.bps = 2; h.fl.glides = true; }
					if ((h.dir > 0 && h.x > vw + 150) || (h.dir < 0 && h.x < -150) || h.y < -80) { hero = null; }
				}
				return;
			}
			h.x += h.vx * dt;
			if (h.kind !== 'manatee') { h.y += sin(h.ph) * 8 * dt; }
			/* A bird with a fish keeps well clear of the water it came from. */
			if (h.kind === 'osprey' && water) { h.y = mn(h.y, waterY - 80); }
			if (h.kind === 'manatee') {
				h.rip -= dt;
				if (h.rip <= 0) { addRipple(h.x + h.dir * 40, waterY + 2); h.rip = rnd(2, 4); }
			}
			if ((h.dir > 0 && h.x > vw + 150) || (h.dir < 0 && h.x < -150)) { hero = null; }
		}
		function heroBounds(h) {
			var w = (h.w || 100) * 1.3;
			return [[h.x - w, h.y - w, 2 * w, 2 * w]];
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
							cx.fillText(HERO_GLYPHS.rainbow, gx2, vh - 4 - gu * 4);
						}
					}
				}
				cx.restore();
				return;
			}
			cx.globalAlpha = mn(1, alphaBase * 2) * (h.kind === 'manatee' ? 0.55 : 1) * (evening ? 0.92 : 1);
			cx.translate(h.x, h.y);
			if (h.kind === 'heron') {
				/* One pre-drawn pose a frame (hnCache), the legs drawn live
				 * behind it; landing, it crossfades with the standing bird.
				 * heroFrame records the pose so a suite can prove the beat
				 * cycles. */
				var hA = cx.globalAlpha, hu = HN_W / 100;
				if (h.dir > 0) { cx.scale(-1, 1); }
				if (h.invert) { cx.scale(1, -1); }
				if (h.sa > 0) {
					var hs = hnGet('s');
					cx.globalAlpha = hA * h.sa;
					cx.drawImage(hs.c, hs.x, hs.y + 44 * hu, hs.w, hs.h);
				}
				if (h.sa < 1) {
					var hf = hnGet(h.key);
					cx.globalAlpha = hA * (1 - h.sa);
					cx.rotate(h.pitch);
					cx.translate(0, hf.bob);
					cx.save(); cx.scale(hu, hu); hnLegs(cx, h.legs); cx.restore();
					cx.drawImage(hf.c, hf.x, hf.y, hf.w, hf.h);
				}
				heroFrame = h.sa >= 1 ? 's' : h.key;
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
				/* The drawn largemouth faces left; flip it when it jumps to the
				 * right, then pitch the nose along its arc — up on the way out,
				 * down on the way back in. */
				var bim = sprite('bassleap');
				if (bim.ready) {
					if (h.vxj > 0) { cx.scale(-1, 1); }
					cx.rotate(-atan2(h.vy, abs(h.vxj) * 4 + 1) * 0.5);
					cx.drawImage(bim.img, -28, -28 * bim.ratio, 56, 56 * bim.ratio);
				}
			} else if (WINGS[h.kind] || h.kind === 'witch') {
				var wg = WINGS[h.kind];
				var key = wg ? wg[((t / wg[2]) | 0) % 2] : 'witchsil';
				heroFrame = key;
				if (h.kind === 'witch') { cx.rotate(h.dir * -0.15); }
				if (h.dir > 0) { cx.scale(-1, 1); }
				var aim = sprite(key);
				if (aim.ready) { cx.drawImage(aim.img, -h.w / 2, -h.w * aim.ratio / 2, h.w, h.w * aim.ratio); }
			}
			cx.restore();
		}

		/* --- Vignette director: rare 5–12s choreographed scenes. One at a
		 * time, ≥90s apart, first ≥20s in, never alongside a hero, actors
		 * borrow (dormant) pool slots so the cap holds. --- */
		var vig = null, vigAt = INF, countdownDone = false, vigNext = '';
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
		function moonDraw(mx, my, a, glow) {
			cx.save();
			cx.fillStyle = '#F4EFD8';
			if (glow > 0) { /* the witch's pass lights it up (4.8.0) */
				cx.globalAlpha = clamp(a * 0.16 * glow, 0, 1);
				cx.beginPath(); cx.arc(mx, my, 58 + 26 * glow, 0, TAU); cx.fill();
			}
			cx.globalAlpha = clamp(a * (0.5 + 0.2 * (glow || 0)), 0, 1);
			cx.beginPath(); cx.arc(mx, my, 46, 0, TAU); cx.fill();
			cx.globalAlpha = clamp(a * 0.18, 0, 1);
			cx.beginPath(); cx.arc(mx, my, 58, 0, TAU); cx.fill();
			cx.restore();
		}
		/* The witch's pass (Rob, 4.10.2 "One swoop, no loop"). Built in the
		 * left-to-right frame and mirrored:
		 *   - a level glide in from the side edge, high;
		 *   - the dive: down across the CENTRE of the moon, heading down and
		 *     forward — the one stretch where she is in front of it;
		 *   - the swoop out: ONE continuous curve that pulls out below the
		 *     moon, climbs and levels off as it leaves the FAR edge.
		 * The glide and the dive are 4.10.1's, unchanged. Every control
		 * point of the swoop out lies further along than the one before
		 * it, so x only ever grows: she never slows to a stop sideways,
		 * never reverses and never turns round (4.10.1's loop made her turn
		 * round twice, which Rob did not like). Her speed follows height
		 * (v² = vB² − 2g·climb, vB at one path scale below the moon), with
		 * a floor that rises smoothly far from the moon so long desktop
		 * glides do not crawl. All sizes come from ONE factor k of the
		 * 390px phone (moon 41, witch 84, path scale moon + 0.6 witch + 6),
		 * so a desktop is the phone's picture made bigger. */
		var WITCH_W = 84, WFR = 12;
		/* by width, as before; and never taller than the header picture
		 * leaves room for (the swoop needs about 277k + 28 px; the site's
		 * pictures are 420 px tall, so this only guards a shorter one) */
		function witchK() { return mn(clamp(vw / 390, 0.82, 1.3), mx2(0.4, (vh - 28) / 277)); }
		function witchW() { var w = MT.round(84 * witchK()); if (w !== WITCH_W) { WITCH_W = w; wcFrames = []; wcPts = null; } return w; }
		function sq(v) { return v * v; }
		function bezPts(out, p0, p1, p2, p3, n) {
			for (var i = 1; i <= n; i++) {
				var u = i / n, v = 1 - u;
				out.push([v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
					v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]);
			}
		}
		function witchPath(st) {
			var R = st.R, Wd = st.W, mx = st.dir > 0 ? st.mx : vw - st.mx, my = st.my, i;
			/* in and out high, but never so high her hat leaves the screen */
			var top = Wd * 0.6 + 6;
			var P0 = [-Wd, mx2(top, my - R * 1.1)], Q = [mx, my], d1 = [0.62, 0.78];
			var L1 = sqrt(sq(Q[0] - P0[0]) + sq(Q[1] - P0[1]));
			/* the entry's last handle along the dive heading, but never above
			 * the glide (so the curve never bulges up past where it started) */
			var h1 = mn(0.42 * L1, (Q[1] - P0[1]) / d1[1]);
			var pts = [P0];
			bezPts(pts, P0, [P0[0] + 0.5 * (Q[0] - P0[0]), P0[1]], [Q[0] - d1[0] * h1, Q[1] - d1[1] * h1], Q, 48);
			st.cross = pts.length - 1;
			/* the swoop out: from the moon's centre on the dive heading
			 * (handle 1.0 R) it pulls out about a third of R below the
			 * centre and climbs to a tenth of R above it, arriving LEVEL at
			 * the far edge (handle 0.3 of the way) — so her climb eases off
			 * on screen and she leaves flying level. Tuned so the heading
			 * never turns more than ~0.19 rad in a 30 fps frame, and so she
			 * clears the moon once she has left it. */
			var E = [vw, mx2(top, my - R * 0.1)], L3 = sqrt(sq(E[0] - Q[0]) + sq(E[1] - Q[1]));
			bezPts(pts, Q, [Q[0] + d1[0] * R, Q[1] + d1[1] * R], [E[0] - 0.3 * L3, E[1]], E, 96);
			for (i = 1; i <= 8; i++) { pts.push([vw + Wd * i / 8, E[1]]); }
			if (st.dir < 0) { for (i = 0; i < pts.length; i++) { pts[i][0] = vw - pts[i][0]; } }
			/* time along the path: speed from height (vB one path scale below
			 * the moon's centre, where 4.10.1 set it), a floor far from it */
			var yB = my + R, len = [0], tm = [0], gk = 0.1994 / R, vB = 3.3 * R, cxm = st.mx;
			for (i = 1; i < pts.length; i++) {
				var ds = sqrt(sq(pts[i][0] - pts[i - 1][0]) + sq(pts[i][1] - pts[i - 1][1]));
				var ym = (pts[i][1] + pts[i - 1][1]) / 2, xm = (pts[i][0] + pts[i - 1][0]) / 2;
				/* the floor eases in over 2-5.5 R from the moon: never more
				 * than ~5% slower from one frame to the next */
				var far = clamp((abs(xm - cxm) / R - 2) / 3.5, 0, 1), vf = 0.42 + 0.53 * far * far * (3 - 2 * far);
				var v = sqrt(mx2(vf * vf, 1 - 2 * gk * (yB - ym)));
				len.push(len[i - 1] + ds);
				tm.push(tm[i - 1] + ds / (v * vB));
			}
			st.pts = pts; st.len = len; st.L = len[len.length - 1]; st.tm = tm; st.TT = tm[tm.length - 1];
		}
		/* where she is at fraction f of her flight time */
		function witchAt(st, f) {
			var tm = st.tm, pts = st.pts, d = f * st.TT, lo = 0, hi = tm.length - 1;
			while (hi - lo > 1) { var m = (lo + hi) >> 1; if (tm[m] <= d) { lo = m; } else { hi = m; } }
			var k = tm[hi] > tm[lo] ? clamp((d - tm[lo]) / (tm[hi] - tm[lo]), 0, 1) : 0;
			return { x: lerp(pts[lo][0], pts[hi][0], k), y: lerp(pts[lo][1], pts[hi][1], k), dx: pts[hi][0] - pts[lo][0], dy: pts[hi][1] - pts[lo][1], i: lo };
		}
		/* The moon and the witch's 12 riding frames, pre-drawn (4.10.0): in
		 * idle time after load when this page has the scene, else on first
		 * use. The moon is drawn for this screen's size and redrawn only if
		 * a resize changes its radius. */
		var moonC = null, wcFrames = [], wcPts = null, wcScr = null, wcStats = { frames: 0, ms: 0, bytes: 0 };
		function moonR() { return MT.round(41 * witchK()); }
		function moonGet() {
			var r = moonR();
			if (moonC && moonC.r === r) { return moonC; }
			var t0 = nowMs(), dc = mn(W.devicePixelRatio || 1, 2), half = MT.ceil(r * 1.3), c = D.createElement('canvas');
			c.width = c.height = MT.ceil(2 * half * dc);
			var g = c.getContext('2d');
			if (g) { g.scale(dc, dc); g.translate(half, half); moonPaint(g, r); }
			wcStats.ms += nowMs() - t0; wcStats.bytes += c.width * c.height * 4;
			return (moonC = { c: c, r: r, half: half });
		}
		function wcGet(i) {
			if (wcFrames[i]) { return wcFrames[i]; }
			var t0 = nowMs(), b = WITCH_BOX, u = WITCH_W / 100, s = u * mn(W.devicePixelRatio || 1, 2), c = D.createElement('canvas');
			c.width = MT.ceil((b[2] - b[0]) * s); c.height = MT.ceil((b[3] - b[1]) * s);
			var g = c.getContext('2d');
			if (g) { g.setTransform(s, 0, 0, s, -b[0] * s, -b[1] * s); witchBody(g, i / WFR); }
			/* where she actually is: her painted pixels on a 3-unit grid, in her
			 * own units, sampled once (frame 0) for the in-front-of-the-moon test */
			if (!wcPts && g) {
				wcPts = [];
				try {
					var im = g.getImageData(0, 0, c.width, c.height).data, step = MT.max(1, MT.round(3 * s));
					for (var yy = 0; yy < c.height; yy += step) { for (var xx = 0; xx < c.width; xx += step) {
						if (im[(yy * c.width + xx) * 4 + 3] > 60) { wcPts.push([b[0] + xx / s, b[1] + yy / s]); }
					} }
				} catch (e) { wcPts = null; }
			}
			wcStats.frames++; wcStats.ms += nowMs() - t0; wcStats.bytes += c.width * c.height * 4;
			return (wcFrames[i] = { c: c, x: b[0] * u, y: b[1] * u, w: (b[2] - b[0]) * u, h: (b[3] - b[1]) * u });
		}
		/* Her cape and hair (Verlet, under gravity and air drag). The cape is
		 * a FAN of four strands pinned across her shoulders, held apart by
		 * SOFT spacing that widens toward the hem — no diagonals, so it folds
		 * and billows instead of moving as one rigid sheet (4.10.0's planks).
		 * The air is not still: a travelling flutter pushes each strand
		 * sideways, more toward the hem and the faster she flies. And cloth
		 * hangs from shoulders: each point is drawn toward a drape down her
		 * back (DRAPE), firmly near the shoulders and loosely at the hem, and
		 * none may rise above her hat — a hard limit at the shoulder line
		 * pressed the cape into a straight bar in the dive. */
		var WC_SEG = 4.9, WC_N = 7, HR_SEG = 2.8, HR_N = 5;
		/* the cape at rest, in her own units: down her back and a little
		 * behind, fanning out to the hem */
		var DRAPE = [];
		(function () {
			for (var j = 0; j < WITCH_CAPE_K; j++) {
				var q = j / (WITCH_CAPE_K - 1), a0 = [lerp(WITCH_CAPE[0][0], WITCH_CAPE[1][0], q), lerp(WITCH_CAPE[0][1], WITCH_CAPE[1][1], q)], c = [a0], x = a0[0], y = a0[1];
				for (var i = 1; i <= WC_N; i++) {
					var ang = (0.75 + 0.45 * (i / WC_N) - 0.25 * q);
					x += cos(ang) * WC_SEG * (1 + 0.15 * q); y += sin(ang) * WC_SEG;
					c.push([x, y]);
				}
				DRAPE.push(c);
			}
		})();
		function wcChain(n, x, y, bx, by, seg) {
			var c = [];
			for (var i = 0; i <= n; i++) { c.push({ x: x + bx * seg * i, y: y + by * seg * i, ox: x + bx * seg * i, oy: y + by * seg * i }); }
			return c;
		}
		function wcMove(c, x, y, dt, drag, fl) {
			var damp = MT.exp(-drag * dt), gy = 500 * dt * dt, n = c.length - 1;
			c[0].ox = c[0].x; c[0].oy = c[0].y; c[0].x = x; c[0].y = y;
			for (var i = 1; i <= n; i++) {
				var p = c[i], vx = (p.x - p.ox) * damp, vy = (p.y - p.oy) * damp, fx = 0, fy = 0;
				if (fl) {
					/* the flutter: sideways to the strand, a wave running to the hem */
					var q = c[i - 1], sx = p.x - q.x, sy = p.y - q.y, sl = sqrt(sx * sx + sy * sy) || 1;
					var f = fl[0] * (i / n) * sin(fl[1] - i * 1.25);
					fx = -sy / sl * f * dt * dt; fy = sx / sl * f * dt * dt;
				}
				p.ox = p.x; p.oy = p.y; p.x += vx + fx; p.y += vy + gy + fy;
			}
		}
		function wcLink(p, q, d, wq, k) {
			var dx = q.x - p.x, dy = q.y - p.y, l = sqrt(dx * dx + dy * dy) || 1e-6, c = (l - d) / l * (k || 1);
			p.x += dx * c * (1 - wq); p.y += dy * c * (1 - wq); q.x -= dx * c * wq; q.y -= dy * c * wq;
		}
		/* local units (facing left) -> page px, for her pose this frame */
		function wcWorld(st, ux, uy) {
			var u = WITCH_W / 100, lx = -st.fs * ux * u, ly = uy * u, c = cos(st.rot), s = sin(st.rot);
			return [st.wx + lx * c - ly * s, st.wy + lx * s + ly * c];
		}
		/* keep a point at or below her shoulder line, in her own frame */
		function wcBelow(st, p, lim) {
			var c = cos(st.rot), s = sin(st.rot), dx = p.x - st.wx, dy = p.y - st.wy;
			var ly = -dx * s + dy * c;
			if (ly < lim) { var e = lim - ly; p.x += -s * e; p.y += c * e; }
		}
		function witchStep(st, w, dt) {
			var u = WITCH_W / 100, i, j, K = WITCH_CAPE_K;
			/* velocity and a smoothed acceleration, from her path */
			if (st.vx == null) {
				var dl = sqrt(sq(w.dx) + sq(w.dy)) || 1;
				st.vx = w.dx / dl * 160; st.vy = w.dy / dl * 160; st.ax = 0; st.ay = 0; st.fs = st.dir; st.ph = 0; st.ft = 0;
			} else if (dt > 0) {
				var nvx = (w.x - st.wx) / dt, nvy = (w.y - st.wy) / dt, kk = mn(1, dt / 0.18);
				st.ax += ((nvx - st.vx) / dt - st.ax) * kk; st.ay += ((nvy - st.vy) / dt - st.ay) * kk;
				st.vx = nvx; st.vy = nvy;
			}
			st.wx = w.x; st.wy = w.y;
			var sp = sqrt(sq(st.vx) + sq(st.vy));
			/* upright (Rob, 4.9.0), facing the way she flies: her path only
			 * ever moves one way across (4.10.2), so st.fs is st.dir, fixed */
			/* she leans into the turn like a rider: along the felt gravity
			 * (the path's acceleration plus g), never more than about 34° */
			var lean = atan2(st.ax, -(st.ay - 900));
			var tilt = atan2(st.vy, st.vx) - (st.fs > 0 ? 0 : MT.PI);
			while (tilt > MT.PI) { tilt -= TAU; }
			while (tilt < -MT.PI) { tilt += TAU; }
			st.lean = lean;
			/* her tilt follows, but never snaps: at most 2.2 rad a second, so a
			 * hard pull-out is a lean she grows into, not a jerk (4.10.1) */
			var want = clamp(lean + clamp(tilt, -0.35, 0.35) * 0.6, -0.6, 0.6);
			st.rot = st.rot == null ? want : st.rot + clamp(want - st.rot, -2.2 * dt, 2.2 * dt);
			/* the riding cycle runs faster through the turn: the bristles flick */
			st.ph = (st.ph + dt * (1.4 + 3 * abs(lean))) % 1;
			st.ft += dt;
			/* cape and hair */
			var CA = [];
			for (j = 0; j < K; j++) { var q = j / (K - 1); CA.push(wcWorld(st, lerp(WITCH_CAPE[0][0], WITCH_CAPE[1][0], q), lerp(WITCH_CAPE[0][1], WITCH_CAPE[1][1], q))); }
			var H = WITCH_HAIR.map(function (h) { return wcWorld(st, h[0], h[1]); });
			if (!st.cape) {
				var bx = -st.vx / (sp || 1), by = -st.vy / (sp || 1);
				st.cape = CA.map(function (a) { return wcChain(WC_N, a[0], a[1], bx, by, WC_SEG * u); });
				st.hair = H.map(function (p) { return wcChain(HR_N, p[0], p[1], bx, by, HR_SEG * u); });
				st.pA = CA; st.pH = H;
			}
			var n = mx2(1, MT.ceil(dt / 0.017)), sd = dt / n, lim = (WITCH_CAPE[0][1] - 12) * u;
			for (var k = 1; k <= n; k++) {
				var f = k / n, tt = st.ft - dt + dt * f;
				for (j = 0; j < K; j++) {
					/* each strand its own drag and its own beat of the flutter */
					wcMove(st.cape[j], lerp(st.pA[j][0], CA[j][0], f), lerp(st.pA[j][1], CA[j][1], f), sd, 3 + 0.45 * j,
						[mn(sp, 420) * (1.1 + 0.25 * j), tt * (11 + j * 1.7) + j * 1.9]);
				}
				for (j = 0; j < st.hair.length; j++) { wcMove(st.hair[j], lerp(st.pH[j][0], H[j][0], f), lerp(st.pH[j][1], H[j][1], f), sd, 4, null); }
				for (var it = 0; it < 2; it++) {
					for (i = 1; i <= WC_N; i++) {
						for (j = 0; j < K; j++) { wcLink(st.cape[j][i - 1], st.cape[j][i], WC_SEG * u, i === 1 ? 1 : 0.5); }
						/* soft spacing: the fan widens to the hem, but may fold */
						var gap = lerp(1.9, 5.2, i / WC_N) * u;
						for (j = 1; j < K; j++) { wcLink(st.cape[j - 1][i], st.cape[j][i], gap, 0.5, 0.3); }
						/* the drape: pulled toward hanging down her back, firmly at
						 * the shoulders and loosely at the hem, so it curves from
						 * her back into the airflow instead of lying in a line */
						var kd = mn(1, sd * lerp(9, 1.2, i / WC_N));
						for (j = 0; j < K; j++) {
							var rp = wcWorld(st, DRAPE[j][i][0], DRAPE[j][i][1]), pp = st.cape[j][i];
							pp.x += (rp[0] - pp.x) * kd; pp.y += (rp[1] - pp.y) * kd;
							wcBelow(st, pp, lim);
						}
					}
					for (j = 0; j < st.hair.length; j++) { for (i = 1; i <= HR_N; i++) { wcLink(st.hair[j][i - 1], st.hair[j][i], HR_SEG * u, i === 1 ? 1 : 0.5); } }
				}
			}
			st.pA = CA; st.pH = H;
		}
		/* Draw her: this phase's pre-drawn frame, then the live cape and
		 * hair over her back, straight onto the page canvas. */
		function witchPaint(g, st, ox, oy, sc) {
			var u = WITCH_W / 100, fr = wcGet(MT.floor(st.ph * WFR) % WFR);
			g.save();
			g.translate((st.wx - ox) * sc, (st.wy - oy) * sc); g.rotate(st.rot);
			g.scale(-st.fs * sc, sc);
			g.drawImage(fr.c, fr.x, fr.y, fr.w, fr.h);
			g.restore();
			g.save();
			g.scale(sc * u, sc * u);
			var f = function (p) { return [(p.x - ox) / u, (p.y - oy) / u]; };
			witchCape(g, st.cape.map(function (c) { return c.map(f); }));
			witchHair(g, st.hair.map(function (c) { return c.map(f); }));
			g.restore();
		}
		/* Does any part of her overlap the moon? Her painted pixels (wcPts,
		 * in her own frame — her body BOX has empty corners that reach the
		 * moon from beside it when nothing of her does), or any point of her
		 * cape or hair. */
		function witchOnMoon(st) {
			var u = WITCH_W / 100, r = st.MR, c = cos(st.rot), s = sin(st.rot), i, j;
			wcGet(0);
			var dx = st.mx - st.wx, dy = st.my - st.wy, lx = (dx * c + dy * s) / u, ly = (-dx * s + dy * c) / u;
			var rr = sq(r / u), P = wcPts || [];
			for (i = 0; i < P.length; i++) { if (sq(lx - -st.fs * P[i][0]) + sq(ly - P[i][1]) < rr) { return true; } }
			var all = st.cape.concat(st.hair);
			for (j = 0; j < all.length; j++) { for (i = 1; i < all[j].length; i++) { if (sq(all[j][i].x - st.mx) + sq(all[j][i].y - st.my) < r * r) { return true; } } }
			return false;
		}
		/* While ANY part of her is in front of the moon, her WHOLE figure goes
		 * dark (4.10.1), fading over 150 ms: the same picture painted again on
		 * a scratch canvas sized to her and filled black with 'source-in', so
		 * the silhouette has exactly her outline — same handle, hat, straws. */
		function witchDraw(st, a, dt) {
			st.onMoon = witchOnMoon(st);
			st.sil = clamp((st.sil || 0) + (st.onMoon ? 1 : -1) * dt / 0.15, 0, 1);
			cx.save();
			cx.globalAlpha = clamp(a, 0, 1);
			witchPaint(cx, st, 0, 0, 1);
			if (st.sil > 0) {
				var dc = mn(W.devicePixelRatio || 1, 2), Sz = MT.ceil(220 * WITCH_W / 100), h2 = Sz / 2;
				if (!wcScr || wcScr.dc !== dc || wcScr.sz !== Sz) {
					wcScr = D.createElement('canvas'); wcScr.width = wcScr.height = MT.ceil(Sz * dc); wcScr.dc = dc; wcScr.sz = Sz;
				}
				var q = wcScr.getContext('2d');
				if (q) {
					/* on whole device pixels, so the copy lands exactly on her */
					var ox = MT.floor((st.wx - h2) * dc) / dc, oy = MT.floor((st.wy - h2) * dc) / dc;
					q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over';
					q.clearRect(0, 0, wcScr.width, wcScr.height);
					witchPaint(q, st, ox, oy, dc);
					q.globalCompositeOperation = 'source-in'; q.fillStyle = '#0B0910'; q.fillRect(0, 0, wcScr.width, wcScr.height);
					cx.globalAlpha = clamp(a * st.sil, 0, 1);
					cx.drawImage(wcScr, ox, oy, Sz, Sz);
				}
			}
			cx.restore();
		}
		/* --- Behind the header text (4.10.1, Rob: "Can the witch and moon
		 * appear behind it?") -------------------------------------------------
		 * In front layering the canvas is ONE fixed sheet over the whole page,
		 * so the moon and the witch covered the banner title. A second canvas
		 * inside the header would bring back every layering bug this plugin
		 * has had (they all lived in the mount). Instead the scene cuts the
		 * header's LETTERS out of what it has just drawn: each visible
		 * character, measured where the page put it (a Range per character),
		 * drawn in its own computed font and text-shadow on a small mask, and
		 * erased with 'destination-out' — so the page's own letters (and
		 * their shadow) show through as if the moon were behind them, while
		 * the header picture around them stays covered. Front layering only:
		 * behind it, the text is already on top; footer placement has no
		 * header. Built when the scene starts, again after a resize, and every
		 * 300 ms while a sticky header might be moving. The selector is the
		 * config's headerSel (Plugin::config, filter dcc_seasons_header_text). */
		var HDR_SEL = CFG.headerSel || '#masthead, header.site-header, header[role="banner"], .elementor-location-header';
		var hdr = null;
		function hdrShadow(v) {
			var m = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?/i.exec(v || '');
			return m ? { c: m[1], x: +m[2], y: +m[3], b: +(m[4] || 0) } : null;
		}
		function hdrCase(ch, tt, prev) {
			if (tt === 'uppercase') { return ch.toUpperCase(); }
			if (tt === 'lowercase') { return ch.toLowerCase(); }
			if (tt === 'capitalize' && (!prev || /\s/.test(prev))) { return ch.toUpperCase(); }
			return ch;
		}
		function hdrBuild() {
			hdr = null;
			if ((!skyMode && (CFG.layer || footMode)) || !D.createRange || !D.createTreeWalker) { return; }
			var list, roots = [], i, j;
			try { list = D.querySelectorAll(HDR_SEL); } catch (e) { list = []; }
			for (i = 0; i < list.length; i++) {
				var el = list[i], inside = false;
				for (j = 0; j < roots.length; j++) { if (roots[j].contains(el)) { inside = true; } }
				if (inside) { continue; }
				roots = roots.filter(function (r) { return !el.contains(r); });
				roots.push(el);
			}
			if (!roots.length) { return; }
			var sx = W.pageXOffset || 0, sy = W.pageYOffset || 0, glyphs = [], x0 = INF, y0 = INF, x1 = -INF, y1 = -INF, moving = false, fixed = false;
			roots.forEach(function (root) {
				for (var a = root; a && a.nodeType === 1; a = a.parentElement) {
					var p = W.getComputedStyle(a).position;
					if (p === 'fixed') { fixed = true; }
					if (p === 'sticky') { moving = true; }
				}
				var wk = D.createTreeWalker(root, 4, null), node, rg = D.createRange();
				while ((node = wk.nextNode())) {
					var par = node.parentElement, txt = node.data;
					if (!par || !/\S/.test(txt)) { continue; }
					var cs = W.getComputedStyle(par);
					if (cs.visibility !== 'visible' || +cs.opacity === 0) { continue; }
					var font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily, sh = hdrShadow(cs.textShadow), ls = parseFloat(cs.letterSpacing) || 0;
					for (var k = 0; k < txt.length; k++) {
						if (/\s/.test(txt[k])) { continue; }
						rg.setStart(node, k); rg.setEnd(node, k + 1);
						var rs = rg.getClientRects();
						if (!rs.length || rs[0].width <= 0) { continue; }
						var r = rs[0], gx = fixed ? r.left : r.left + sx, gy = fixed ? r.top : r.top + sy;
						glyphs.push({ ch: hdrCase(txt[k], cs.textTransform, txt[k - 1]), x: gx, y: gy, w: r.width - ls, h: r.height, f: font, sh: sh });
						x0 = mn(x0, gx); y0 = mn(y0, gy); x1 = mx2(x1, gx + r.width); y1 = mx2(y1, gy + r.height);
					}
				}
			});
			if (!glyphs.length) { return; }
			/* on whole device pixels and drawn 1:1: a mask stretched by a
			 * fraction of a pixel blurs a serif's one-pixel hairlines, and the
			 * moon showed through them */
			var dc = mn(W.devicePixelRatio || 1, 2), pad = 14, c = D.createElement('canvas');
			var ox = MT.floor((x0 - pad) * dc) / dc, oy = MT.floor((y0 - pad) * dc) / dc;
			c.width = MT.ceil((x1 + pad - ox) * dc); c.height = MT.ceil((y1 + pad - oy) * dc);
			var g = c.getContext('2d');
			if (!g) { return; }
			g.scale(dc, dc); g.translate(-ox, -oy);
			g.fillStyle = g.strokeStyle = '#000'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
			glyphs.forEach(function (q) {
				g.font = q.f;
				/* the rect holds the glyph's advance (letter-spacing taken off
				 * above); centre the canvas glyph in it */
				var m = g.measureText(q.ch), asc = m.fontBoundingBoxAscent || q.h * 0.8, px = q.x + (q.w - m.width) / 2, py = q.y + asc;
				if (q.sh) {
					/* canvas shadows are in bitmap pixels, untouched by the scale */
					g.shadowColor = q.sh.c; g.shadowOffsetX = q.sh.x * dc; g.shadowOffsetY = q.sh.y * dc; g.shadowBlur = q.sh.b * dc;
				}
				g.fillText(q.ch, px, py);
				g.shadowColor = 'rgba(0,0,0,0)';
				/* half a pixel all round, so no moon fringe sits on a letter's edge */
				g.lineWidth = 1; g.strokeText(q.ch, px, py);
			});
			hdr = { c: c, x: ox, y: oy, w: c.width / dc, h: c.height / dc, fixed: fixed, moving: moving, n: glyphs.length, vw: vw, vh: vh, at: 0 };
		}
		/* Erase the header's letters from the canvas inside these rects (where
		 * the scene drew this frame), if they meet the header at all. */
		function hdrCut(rects, t) {
			if (!skyMode && (CFG.layer || footMode)) { return; }
			if (!hdr || hdr.vw !== vw || hdr.vh !== vh || (hdr.moving && t - hdr.at > 0.3)) { hdrBuild(); if (hdr) { hdr.at = t; } }
			if (!hdr) { return; }
			/* viewport px, then the canvas's own px (the sky canvas is where
			 * the header picture is; the page's front canvas is at 0, 0) */
			var hx = hdr.x - (hdr.fixed ? 0 : (W.pageXOffset || 0)) - cvOX, hy = hdr.y - (hdr.fixed ? 0 : (W.pageYOffset || 0)) - cvOY, any = false;
			cx.save(); cx.beginPath();
			for (var i = 0; i < rects.length; i++) {
				var r = rects[i];
				if (r[0] < hx + hdr.w && r[0] + r[2] > hx && r[1] < hy + hdr.h && r[1] + r[3] > hy) { cx.rect(r[0], r[1], r[2], r[3]); any = true; }
			}
			if (any) {
				cx.clip();
				cx.globalCompositeOperation = 'destination-out'; cx.globalAlpha = 1; cx.imageSmoothingEnabled = false;
				cx.drawImage(hdr.c, hx, hy, hdr.w, hdr.h);
			}
			cx.restore();
			hdrCuts += any ? 1 : 0;
		}
		var hdrCuts = 0;
		/* --- Behind the hero picture's foreground (4.10.4, Rob: "Make the
		 * seaplane fly in front of the moon and witch since in real life the
		 * witch/moon would be higher in the sky than the seaplane") ---------
		 * The home page's header picture has a foreground of its own, drawn
		 * in the page by the site's mu-plugins: the seaplane and the fishing
		 * catch (dcc-hero-life, .dcc-hl-wrap) and the golden-hour reeds,
		 * gator and heron (dcc-sun-canal, .dcc-gh-fore). All of it is nearer
		 * than the sky, so a SCENE goes behind it: while the foreground can
		 * meet the scene, the scene draws on a scratch canvas, the
		 * foreground's painted shape is cut out of it, and the result goes
		 * onto the page's canvas. The sprites never pass through it, so they
		 * stay in front as before. Only the scene moves behind, and only in
		 * the foreground's exact painted shape, never a box. The shape is rebuilt every frame from
		 * the page: each SVG shape with its own getScreenCTM (so the plane's
		 * flight, bank, flip and propeller are followed), each img, canvas
		 * and video by its box, at its own fill and stroke and its whole
		 * chain of opacity, clipped wherever an ancestor clips (the picture's
		 * edges). Front layering only (behind it, the page is already on
		 * top); heroes are unchanged. The selector is the config's foreSel
		 * (Plugin::config, filter dcc_seasons_foreground). */
		var FG_SEL = CFG.foreSel || '';
		var FG_SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon, text, image';
		var FG_SKIP = 'defs, clipPath, mask, pattern, symbol, marker';
		var fgList = null, fgAt = -INF, fgPaths = typeof WeakMap === 'function' ? new WeakMap() : null, fgImgs = {};
		var fgStat = { frames: 0, cuts: 0, shapes: 0, ms: 0, builds: 0 };
		/* the foreground's painted parts, looked up again every half second */
		function fgCollect(t) {
			if (fgList && t - fgAt < 0.5) { return fgList; }
			fgAt = t; fgList = [];
			if (!FG_SEL || (!skyMode && (CFG.layer || footMode)) || typeof Path2D !== 'function') { return fgList; }
			var found, roots = [], i;
			try { found = D.querySelectorAll(FG_SEL); } catch (e) { found = []; }
			/* outermost matches only, so nothing is cut twice */
			for (i = 0; i < found.length; i++) {
				var fe = found[i];
				if (roots.some(function (r) { return r.contains(fe); })) { continue; }
				roots = roots.filter(function (r) { return !fe.contains(r); });
				roots.push(fe);
			}
			for (i = 0; i < roots.length; i++) {
				var root = roots[i], svgs = [], media = [], boxes = [];
				var ss = root.localName === 'svg' ? [root] : root.querySelectorAll('svg');
				for (var j = 0; j < ss.length; j++) {
					var sv = ss[j];
					/* the outermost svg holds every shape, nested ones included */
					if (sv !== root && sv.parentNode && sv.parentNode.closest && sv.parentNode.closest('svg') && root.contains(sv.parentNode.closest('svg'))) { continue; }
					var sh = [].slice.call(sv.querySelectorAll(FG_SHAPES)).filter(function (e) { return !e.closest(FG_SKIP); }).map(fgStyle);
					if (sh.length) { svgs.push({ svg: sv, shapes: sh }); }
				}
				var mm = /^(img|canvas|video)$/.test(root.localName) ? [root] : root.querySelectorAll('img, canvas, video');
				for (j = 0; j < mm.length; j++) { media.push(mm[j]); }
				/* CSS-painted parts, opted in one by one (4.10.5): cut by their
				 * transformed border box. Nothing CSS-painted is cut unless it
				 * carries the attribute, so the soft water glints never are. */
				var bm = [].slice.call(root.querySelectorAll('[data-dcc-fore-box]'));
				if (root.hasAttribute('data-dcc-fore-box')) { bm.unshift(root); }
				for (j = 0; j < bm.length; j++) { boxes.push(bm[j]); }
				if (svgs.length || media.length || boxes.length) { fgList.push({ root: root, svgs: svgs, media: media, boxes: boxes }); }
			}
			return fgList;
		}
		/* where the foreground can show at all: the viewport, cut down by
		 * every ancestor that clips (the header picture's edges) */
		function fgClip(el) {
			var mm = fgMm().clip, c = mm.get(el);
			if (c) { return c; }
			c = fgClip1(el);
			mm.set(el, c);
			return c;
		}
		function fgClip1(el) {
			var c = [0, 0, W.innerWidth, W.innerHeight];
			for (var a = el.parentElement; a && a !== D.documentElement; a = a.parentElement) {
				var cs = W.getComputedStyle(a);
				if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { c = rcut(c, rbox(a.getBoundingClientRect())); }
			}
			return c;
		}
		function rbox(r) { return [r.left, r.top, r.right, r.bottom]; }
		function rcut(a, b) { return [mx2(a[0], b[0]), mx2(a[1], b[1]), mn(a[2], b[2]), mn(a[3], b[3])]; }
		function rnone(a) { return a[2] <= a[0] || a[3] <= a[1]; }
		/* the opacity an element is painted at: its own times every ancestor's */
		function fgOp(el, memo) {
			if (!el || el.nodeType !== 1) { return 1; }
			var v = memo.get(el);
			if (v != null) { return v; }
			var cs = W.getComputedStyle(el);
			v = cs.display === 'none' ? 0 : (+cs.opacity) * fgOp(el.parentNode, memo);
			memo.set(el, v);
			return v;
		}
		/* a shape's paint, read when the list is built (every half second):
		 * only where it is and how opaque it is change frame to frame */
		function fgStyle(el) {
			var cs = W.getComputedStyle(el), sw = parseFloat(cs.strokeWidth) || 0;
			return { el: el, tag: el.localName, vis: cs.visibility === 'visible' && cs.display !== 'none',
				fill: cs.fill !== 'none', stroke: cs.stroke !== 'none' && sw > 0, sw: sw, fo: +cs.fillOpacity, so: +cs.strokeOpacity,
				rule: cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', cap: cs.strokeLinecap, join: cs.strokeLinejoin, miter: +cs.strokeMiterlimit || 4,
				font: cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily, anchor: cs.textAnchor,
				dash: cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter(function (v) { return v >= 0; }) : [], doff: parseFloat(cs.strokeDashoffset) || 0,
				/* all of the above in one word, for the cut's picture of still shapes */
				sig: [cs.visibility, cs.fill, cs.stroke, sw, cs.fillOpacity, cs.strokeOpacity, cs.fillRule, cs.strokeLinecap, cs.strokeLinejoin, cs.strokeMiterlimit, cs.font, cs.textAnchor, cs.strokeDasharray, cs.strokeDashoffset].join('/') };
		}
		function fgNum(el, k) { return parseFloat(el.getAttribute(k)) || 0; }
		function fgPath(el) {
			var tag = el.localName, P, i;
			if (tag === 'path') {
				var d = el.getAttribute('d') || '', c = fgPaths && fgPaths.get(el);
				if (c && c.d === d) { return c.p; }
				P = new Path2D(d);
				if (fgPaths) { fgPaths.set(el, { d: d, p: P }); }
				return P;
			}
			P = new Path2D();
			if (tag === 'rect') {
				var x = fgNum(el, 'x'), y = fgNum(el, 'y'), w = fgNum(el, 'width'), h = fgNum(el, 'height'), rx = fgNum(el, 'rx'), ry = fgNum(el, 'ry');
				rx = mn(rx || ry, w / 2); ry = mn(ry || rx, h / 2);
				if ((rx || ry) && P.roundRect) { P.roundRect(x, y, w, h, [{ x: rx, y: ry }]); } else { P.rect(x, y, w, h); }
			} else if (tag === 'circle') {
				P.arc(fgNum(el, 'cx'), fgNum(el, 'cy'), fgNum(el, 'r'), 0, TAU);
			} else if (tag === 'ellipse') {
				P.ellipse(fgNum(el, 'cx'), fgNum(el, 'cy'), fgNum(el, 'rx'), fgNum(el, 'ry'), 0, 0, TAU);
			} else if (tag === 'line') {
				P.moveTo(fgNum(el, 'x1'), fgNum(el, 'y1')); P.lineTo(fgNum(el, 'x2'), fgNum(el, 'y2'));
			} else if (tag === 'polyline' || tag === 'polygon') {
				var q = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat);
				for (i = 0; i + 1 < q.length; i += 2) { if (i) { P.lineTo(q[i], q[i + 1]); } else { P.moveTo(q[i], q[i + 1]); } }
				if (tag === 'polygon') { P.closePath(); }
			}
			return P;
		}
		function fgImg(src) {
			var im = fgImgs[src];
			if (!im) { im = fgImgs[src] = new Image(); im.src = src; }
			return im.complete && im.naturalWidth ? im : null;
		}
		/* same-origin pictures only: a foreign one would taint the canvas */
		function fgOwn(src) {
			try { return new URL(src, location.href).origin === location.origin || /^data:/.test(src); } catch (e) { return false; }
		}
		/* Where an element's own box lands on screen, as a matrix (box px ->
		 * viewport px). Not getScreenCTM: Safari's ignores CSS rotation, scale
		 * and flip on HTML ancestors ("FIXME: This doesn't work correctly
		 * with CSS transforms" in WebKit), and the plane is flipped and
		 * banked exactly that way. Instead: the LINEAR part is the product
		 * of every ancestor's computed transform (rotate/scale/transform),
		 * and the translation is solved from where the browser actually put
		 * the box (getBoundingClientRect, which every engine gets right). */
		function fgLin(e) {
			if (!e || e.nodeType !== 1) { return [1, 0, 0, 1]; }
			/* once per element per frame: the plane's svgs and its banner's
			 * parts share every ancestor (4.10.6) */
			var mm = fgMm().lin, L = mm.get(e);
			if (L) { return L; }
			var cs = W.getComputedStyle(e), m = [1, 0, 0, 1], v;
			if (cs.transform && cs.transform !== 'none') {
				v = cs.transform.match(/-?[\d.e+-]+/g).map(parseFloat);
				m = cs.transform.indexOf('matrix3d') === 0 ? [v[0], v[1], v[4], v[5]] : [v[0], v[1], v[2], v[3]];
			}
			if (cs.scale && cs.scale !== 'none') {
				v = cs.scale.split(/\s+/).map(parseFloat);
				m = fgMul([v[0], 0, 0, v.length > 1 ? v[1] : v[0]], m);
			}
			if (cs.rotate && cs.rotate !== 'none') {
				v = /(-?[\d.]+)(deg|rad|turn|grad)\s*$/.exec(cs.rotate);
				if (v) {
					var r = +v[1] * ({ deg: MT.PI / 180, rad: 1, turn: TAU, grad: MT.PI / 200 })[v[2]];
					m = fgMul([cos(r), sin(r), -sin(r), cos(r)], m);
				}
			}
			L = fgMul(fgLin(e.parentElement), m);
			mm.set(e, L);
			return L;
		}
		/* Everything read from the page for the cut, once per frame (4.10.6).
		 * Nothing on the page can move between two reads in one frame, so a
		 * second read of the same thing is the first one's answer. */
		var fgFrame = 0, fgMemo = null;
		function fgMm() {
			if (!fgMemo || fgMemo.n !== fgFrame) { fgMemo = { n: fgFrame, lin: new Map(), op: new Map(), svg: new Map(), clip: new Map(), plan: new Map() }; }
			return fgMemo;
		}
		/* 2x2 linear parts [a, b, c, d] (column-major, like DOMMatrix) */
		function fgMul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3]]; }
		function fgBox(el, w, h) {
			var L = fgLin(el), r = el.getBoundingClientRect();
			var xs = [0, L[0] * w, L[2] * h, L[0] * w + L[2] * h], ys = [0, L[1] * w, L[3] * h, L[1] * w + L[3] * h];
			return [L[0], L[1], L[2], L[3], r.left - MT.min.apply(MT, xs), r.top - MT.min.apply(MT, ys)];
		}
		/* full affine [a, b, c, d, e, f] product A * B */
		function fgAff(A, B) {
			return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
				A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
		}
		function fgInv(m) {
			var det = m[0] * m[3] - m[1] * m[2];
			if (!det) { return null; }
			return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
		}
		/* the outermost svg's user space -> its box px: viewBox and
		 * preserveAspectRatio, as the browser applies them */
		function fgViewBox(sv, w, h) {
			var vb = sv.viewBox && sv.viewBox.baseVal;
			if (!vb || !vb.width || !vb.height) { return [1, 0, 0, 1, 0, 0]; }
			var par = (sv.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim().split(/\s+/), al = par[0], sx = w / vb.width, sy = h / vb.height;
			if (al !== 'none') {
				var k = par[1] === 'slice' ? mx2(sx, sy) : mn(sx, sy);
				var fx = /xMid/.test(al) ? 0.5 : (/xMax/.test(al) ? 1 : 0), fy = /YMid/.test(al) ? 0.5 : (/YMax/.test(al) ? 1 : 0);
				return [k, 0, 0, k, (w - vb.width * k) * fx - vb.x * k, (h - vb.height * k) * fy - vb.y * k];
			}
			return [sx, 0, 0, sy, -vb.x * sx, -vb.y * sy];
		}
		/* the outermost svg's user space -> viewport px */
		function fgSvgM(sv) {
			var mm = fgMm().svg;
			if (!mm.has(sv)) { mm.set(sv, fgSvgM1(sv)); }
			return mm.get(sv);
		}
		function fgSvgM1(sv) {
			var w = sv.clientWidth || parseFloat(W.getComputedStyle(sv).width) || 0, h = sv.clientHeight || parseFloat(W.getComputedStyle(sv).height) || 0;
			if (!w || !h) { return null; }
			return fgAff(fgBox(sv, w, h), fgViewBox(sv, w, h));
		}
		function fgM6(m) { return [m.a, m.b, m.c, m.d, m.e, m.f]; }
		/* A CSS-painted foreground part (data-dcc-fore-box): its border box,
		 * transformed exactly as the page draws it (skew, scale, flip, from
		 * the element and every ancestor: fgBox), with its border-radius, and
		 * each outer box-shadow's offset and spread (its blur is not cut). */
		function fgShadows(el) {
			var v = W.getComputedStyle(el).boxShadow, out = [];
			if (!v || v === 'none') { return out; }
			v.split(/,(?![^(]*\))/).forEach(function (sh) {
				if (/inset/.test(sh)) { return; }
				var col = /rgba?\(([^)]*)\)/.exec(sh), al = 1;
				if (col) { var cp = col[1].split(/[\s,\/]+/).filter(Boolean); al = cp.length > 3 ? parseFloat(cp[3]) : 1; }
				var nums = sh.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || [];
				var q = nums.map(parseFloat);
				if (al > 0) { out.push({ x: q[0] || 0, y: q[1] || 0, s: q[3] || 0, a: al }); }
			});
			return out;
		}
		function fgShadowPad(el) {
			var p = 0;
			fgShadows(el).forEach(function (q) { p = mx2(p, abs(q.x) + q.s, abs(q.y) + q.s); });
			return p;
		}
		function fgRadii(cs, w, h) {
			return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(function (k) {
				var v = (cs[k] || '0').split(/\s+/), rx = parseFloat(v[0]) || 0, ry = parseFloat(v[1] == null ? v[0] : v[1]) || 0;
				if (/%/.test(v[0])) { rx = rx / 100 * w; }
				if (/%/.test(v[1] == null ? v[0] : v[1])) { ry = ry / 100 * h; }
				return { x: mn(rx, w / 2), y: mn(ry, h / 2) };
			});
		}
		function fgRound(P, x, y, w, h, R) {
			if (P.roundRect && R.some(function (r) { return r.x > 0 || r.y > 0; })) { P.roundRect(x, y, w, h, R); } else { P.rect(x, y, w, h); }
		}
		function fgBoxGeo(el, memo) {
			var cs = W.getComputedStyle(el), w = el.offsetWidth, h = el.offsetHeight, a = fgOp(el, memo);
			if (!w || !h || a <= 0 || cs.visibility !== 'visible') { return null; }
			return { w: w, h: h, a: a, B: fgBox(el, w, h), R: fgRadii(cs, w, h), sh: fgShadows(el) };
		}
		function fgBoxCut(g, b, dp, ox, oy) {
			if (!b) { return 0; }
			var w = b.w, h = b.h, a = b.a, B = b.B, R = b.R;
			g.setTransform(dp * B[0], dp * B[1], dp * B[2], dp * B[3], dp * B[4] - ox, dp * B[5] - oy);
			var P = new Path2D();
			fgRound(P, 0, 0, w, h, R);
			g.globalAlpha = a;
			g.fill(P);
			b.sh.forEach(function (q) {
				var Q = new Path2D();
				fgRound(Q, q.x - q.s, q.y - q.s, w + 2 * q.s, h + 2 * q.s, R.map(function (r) { return { x: r.x ? r.x + q.s : 0, y: r.y ? r.y + q.s : 0 }; }));
				g.globalAlpha = a * q.a;
				g.fill(Q);
			});
			return 1;
		}
		/* Before the scene draws: does the foreground meet it this frame?
		 * Where it can (O: each foreground part's box inside where the scene
		 * drew last frame, padded), the scene is drawn on a small scratch
		 * canvas instead; everywhere else it draws on the page's canvas as
		 * always. One draw feeds both (fgTee forwards every call), the page
		 * canvas clipped to everything but O, so the two halves fit exactly.
		 * Never READ the page canvas: a drawImage from it measured 3.7 ms a
		 * frame (it flushes); and keep the scratch small: drawing it back
		 * costs by its size. Only scenes that say where they draw (st.fgB)
		 * take part. */
		var fgC = null, fgG = null;
		function fgTee(a, b) {
			return new Proxy(a, {
				get: function (t, k) {
					var v = t[k];
					if (typeof v !== 'function') { return v; }
					return function () {
						var bv = b[k];
						if (typeof bv === 'function') { bv.apply(b, arguments); }
						return v.apply(a, arguments);
					};
				},
				set: function (t, k, v) { a[k] = v; b[k] = v; return true; }
			});
		}
		function foreBegin(bounds) {
			if (!FG_SEL || (!skyMode && (CFG.layer || footMode)) || !bounds || !bounds.length || typeof Proxy !== 'function') { return null; }
			var list = fgCollect(vt);
			if (!list.length) { return null; }
			var t0 = DEBUG ? performance.now() : 0, co = cv.getBoundingClientRect(), parts = [], i, j, u = null;
			/* last frame's region, with room for this frame's movement */
			var bb = [INF, INF, -INF, -INF], PAD = 60;
			for (i = 0; i < bounds.length; i++) { var b0 = bounds[i]; bb = [mn(bb[0], b0[0] - PAD), mn(bb[1], b0[1] - PAD), mx2(bb[2], b0[0] + b0[2] + PAD), mx2(bb[3], b0[1] + b0[3] + PAD)]; }
			/* to the viewport: the canvas's place, plus where its own px
			 * start inside it (the sky canvas, 4.10.7) */
			bb = [bb[0] + co.left + cvUX, bb[1] + co.top + cvUY, bb[2] + co.left + cvUX, bb[3] + co.top + cvUY];
			for (i = 0; i < list.length; i++) {
				var it = list[i], clip = null;
				var add = function (el, kind, sh) {
					var r = rbox(el.getBoundingClientRect());
					/* an svg may draw outside its own box (overflow: visible; the
					 * plane's towed banner): take its drawing's box too */
					if (kind === 'svg' && el.getBBox) {
						/* far from the scene by a clear margin, going by how far
						 * it drew outside its box when last measured (at most
						 * half a second ago): nothing more to read (4.10.6) */
						var ov = fgOv && fgOv.get(el);
						if (ov && vt - ov.at < 0.5 && rnone(rcut([r[0] - ov.e[0] - 40, r[1] - ov.e[1] - 40, r[2] + ov.e[2] + 40, r[3] + ov.e[3] + 40], bb))) { return; }
						var r0 = r.slice();
						try {
							var bx = el.getBBox(), M = fgSvgM(el);
							if (M && bx.width + bx.height > 0) {
								var cs4 = [[bx.x, bx.y], [bx.x + bx.width, bx.y], [bx.x, bx.y + bx.height], [bx.x + bx.width, bx.y + bx.height]].map(function (p) {
									return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
								});
								r = [mn(r[0], mn(cs4[0][0], cs4[1][0], cs4[2][0], cs4[3][0])), mn(r[1], mn(cs4[0][1], cs4[1][1], cs4[2][1], cs4[3][1])),
									mx2(r[2], mx2(cs4[0][0], cs4[1][0], cs4[2][0], cs4[3][0])), mx2(r[3], mx2(cs4[0][1], cs4[1][1], cs4[2][1], cs4[3][1]))];
							}
						} catch (e) { /* not rendered */ }
						if (fgOv) { fgOv.set(el, { at: vt, e: [r0[0] - r[0], r0[1] - r[1], r[2] - r0[2], r[3] - r0[3]] }); }
					}
					if (kind === 'box') { var sp = fgShadowPad(el); r = [r[0] - sp, r[1] - sp, r[2] + sp, r[3] + sp]; }
					if (rnone(r) || rnone(rcut(r, bb))) { return; }
					if (!clip) { clip = rcut(fgClip(it.root), rbox(co)); }
					var o = rcut(rcut(r, clip), bb);
					if (rnone(o)) { return; }
					parts.push({ el: el, kind: kind, sh: sh, clip: clip });
					u = u ? [mn(u[0], o[0]), mn(u[1], o[1]), mx2(u[2], o[2]), mx2(u[3], o[3])] : o;
				};
				for (j = 0; j < it.svgs.length; j++) { add(it.svgs[j].svg, 'svg', it.svgs[j].shapes); }
				for (j = 0; j < it.media.length; j++) { add(it.media[j], 'media'); }
				for (j = 0; j < it.boxes.length; j++) { add(it.boxes[j], 'box'); }
			}
			if (!u) { return null; }
			/* every read the cut needs, here, before anything is drawn this
			 * frame (4.10.6): foreEnd only draws */
			var memo = fgMm().op;
			for (i = 0; i < parts.length; i++) {
				var pt = parts[i], pe = pt.el;
				if (pt.kind === 'box') { pt.geo = fgBoxGeo(pe, memo); }
				else if (pt.kind === 'media') {
					var ma = fgOp(pe, memo), mw = pe.clientWidth || pe.width || 0, mh = pe.clientHeight || pe.height || 0;
					var mok = pe.localName !== 'img' || (pe.complete && pe.naturalWidth && fgOwn(pe.currentSrc || pe.src));
					pt.geo = ma > 0 && mok && mw && mh ? { a: ma, w: mw, h: mh, B: fgBox(pe, mw, mh) } : null;
				} else { pt.geo = fgSvgPlan(pe, pt.sh, memo); }
			}
			/* O on whole device pixels, so the page's clip and the scratch
			 * meet without a seam */
			var dp = lastDpr || 1;
			var rx = mx2(0, MT.floor((u[0] - co.left) * dp)), ry = mx2(0, MT.floor((u[1] - co.top) * dp));
			var rw = mn(cv.width, MT.ceil((u[2] - co.left) * dp)) - rx, rh = mn(cv.height, MT.ceil((u[3] - co.top) * dp)) - ry;
			if (rw <= 0 || rh <= 0) { return null; }
			if (!fgC) { fgC = D.createElement('canvas'); }
			/* exactly O's size: the browser uploads the WHOLE scratch when it
			 * is drawn back, so a larger one costs by its own size (measured:
			 * 0.26 ms at 273 px square, 3.3 ms at 600) */
			if (fgC.width !== rw || fgC.height !== rh) { fgC.width = rw; fgC.height = rh; fgG = null; }
			fgG = fgG || fgC.getContext('2d');
			if (!fgG) { return null; }
			fgG.setTransform(1, 0, 0, 1, 0, 0); fgG.globalCompositeOperation = 'source-over'; fgG.globalAlpha = 1;
			fgG.clearRect(0, 0, rw, rh);
			fgG.setTransform(dp, 0, 0, dp, cvUX * dp - rx, cvUY * dp - ry);
			fgG.save();
			var main = cx;
			main.save();
			main.beginPath(); main.rect(-cvUX, -cvUY, cv.width / dp, cv.height / dp); main.rect(rx / dp - cvUX, ry / dp - cvUY, rw / dp, rh / dp); main.clip('evenodd');
			cx = fgTee(main, fgG);
			return { main: main, parts: parts, co: co, dp: dp, t0: t0, R: [rx, ry, rw, rh] };
		}
		/* After the scene: back to the page's canvas; cut the foreground's
		 * painted shape out of the scratch (alpha: scene * (1 - a)); then draw
		 * O onto the page, where the scene was clipped out. */
		function foreEnd(f) {
			cx = f.main;
			cx.restore();
			fgG.restore();
			var dp = f.dp, g = fgG, n = 0, i;
			var R = f.R, rx = R[0], ry = R[1], rw = R[2], rh = R[3];
			var ox = f.co.left * dp + rx, oy = f.co.top * dp + ry;
			g.save();
			g.setTransform(1, 0, 0, 1, 0, 0);
			g.globalCompositeOperation = 'destination-out';
			g.fillStyle = g.strokeStyle = '#000';
			if (rw > 0 && rh > 0) {
				for (i = 0; i < f.parts.length; i++) {
					var pt = f.parts[i], c = pt.clip;
					g.save();
					g.setTransform(1, 0, 0, 1, 0, 0);
					g.beginPath(); g.rect(c[0] * dp - ox, c[1] * dp - oy, (c[2] - c[0]) * dp, (c[3] - c[1]) * dp); g.clip();
					var G = pt.geo;
					if (!G) { /* nothing painted */ }
					else if (pt.kind === 'box') {
						n += fgBoxCut(g, G, dp, ox, oy);
					} else if (pt.kind === 'media') {
						var B = G.B;
						g.setTransform(dp * B[0], dp * B[1], dp * B[2], dp * B[3], dp * B[4] - ox, dp * B[5] - oy);
						g.globalAlpha = G.a;
						try { g.drawImage(pt.el, 0, 0, G.w, G.h); n++; } catch (e) { /* not drawable yet */ }
					} else {
						n += fgSvgCut(g, G, dp, ox, oy);
					}
					g.restore();
				}
			}
			g.restore();
			if (rw > 0 && rh > 0) {
				cx.save();
				cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
				cx.drawImage(fgC, 0, 0, rw, rh, rx, ry, rw, rh);
				cx.restore();
			}
			if (n) { fgStat.cuts++; }
			fgStat.frames++; fgStat.shapes = n;
			if (DEBUG) { fgStat.ms += performance.now() - f.t0; }
		}
		/* An svg's shapes, read for this frame: each one's place relative to
		 * the svg's own user space (getScreenCTM's two halves cancel, so only
		 * the SVG-internal part is used, which every engine has right), and
		 * its opacity. The shapes that hold still are cut with ONE picture of
		 * them (4.10.6): drawn once, in the svg's own frame without its
		 * position, and moved with the svg, as the compositor moves the plane
		 * itself; it is drawn again only when one of them, or the svg's turn,
		 * scale or flip, changes. A shape that changed in the last half second
		 * (the propeller, a fluttering banner) is cut on its own every frame
		 * as before. Each shape filled and stroked separately cost the GPU
		 * more than the scene it was cut from. */
		var FG_LIVE = 30, fgOv = typeof WeakMap === 'function' ? new WeakMap() : null;
		var fgLive = fgOv ? new WeakMap() : null, fgCache = fgOv ? new WeakMap() : null;
		/* what a shape's own attributes draw (its place is in rel) */
		var FG_ATTRS = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points', 'href', 'xlink:href'];
		function fgGeo(el, tag) {
			var o = tag === 'text' ? el.textContent : '';
			for (var i = 0; i < FG_ATTRS.length; i++) { var v = el.getAttribute(FG_ATTRS[i]); if (v != null) { o += ' ' + FG_ATTRS[i] + '=' + v; } }
			return o;
		}
		function fgSvgPlan(sv, sh, memo) {
			var pm = fgMm().plan;
			if (pm.has(sv)) { return pm.get(sv); }
			var S = fgSvgM(sv), rc = sv.getScreenCTM && sv.getScreenCTM(), ri = rc && fgInv(fgM6(rc)), P = null;
			if (S && ri) {
				P = { sv: sv, S: S, live: [], stat: [], key: '', bb: null };
				for (var k = 0; k < sh.length; k++) {
					var q = sh[k], el = q.el;
					if (!q.vis) { continue; }
					var a = fgOp(el, memo), c = a > 0 && el.getScreenCTM && el.getScreenCTM();
					if (!c) { continue; }
					var rel = fgAff(ri, fgM6(c)), s = { q: q, a: a, rel: rel };
					s.k = q.sig + '|' + fgGeo(el, q.tag) + '|' + a.toFixed(3) + '|' + rel.map(function (v) { return v.toFixed(3); }).join(',');
					var lv = fgLive && fgLive.get(el);
					if (!lv) { lv = { k: s.k, n: 0 }; if (fgLive) { fgLive.set(el, lv); } }
					else if (lv.k !== s.k) { lv.k = s.k; lv.n = FG_LIVE; }
					else if (lv.n > 0) { lv.n--; }
					(lv.n > 0 || !fgCache ? P.live : P.stat).push(s);
				}
				if (P.stat.length < 2) { P.live = P.live.concat(P.stat); P.stat = []; }
				else {
					var dp = lastDpr || 1;
					P.T0 = [dp * S[0], dp * S[1], dp * S[2], dp * S[3], 0, 0];
					P.key = dp + ':' + S.slice(0, 4).map(function (v) { return v.toFixed(4); }).join(',') + ':' + P.stat.map(function (s) { return s.k; }).join(';');
					var C = fgCache.get(sv);
					if (!C || C.key !== P.key) {
						/* to be drawn again: where, read now with the rest */
						var bb = [INF, INF, -INF, -INF];
						P.stat.forEach(function (s) {
							var b; try { b = s.q.el.getBBox(); } catch (e) { b = null; }
							if (!b) { return; }
							var m = fgAff(P.T0, s.rel), q = s.q;
							var pad = (q.stroke ? q.sw * mx2(q.miter, 1) / 2 : 0) * mx2(MT.sqrt(m[0] * m[0] + m[1] * m[1]), MT.sqrt(m[2] * m[2] + m[3] * m[3])) + 2;
							[[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].forEach(function (p) {
								var x = m[0] * p[0] + m[2] * p[1] + m[4], y = m[1] * p[0] + m[3] * p[1] + m[5];
								bb = [mn(bb[0], x - pad), mn(bb[1], y - pad), mx2(bb[2], x + pad), mx2(bb[3], y + pad)];
							});
						});
						P.bb = bb;
					}
				}
			}
			pm.set(sv, P);
			return P;
		}
		function fgSvgCut(g, P, dp, ox, oy) {
			var n = 0, k, s, S = P.S, T = [dp * S[0], dp * S[1], dp * S[2], dp * S[3], dp * S[4], dp * S[5]], live = P.live;
			if (P.stat.length) {
				var C = fgCache.get(P.sv);
				if (!C || C.key !== P.key) {
					var bb = P.bb, x0 = MT.floor(bb[0]), y0 = MT.floor(bb[1]), cw = MT.ceil(bb[2]) - x0, ch = MT.ceil(bb[3]) - y0;
					if (!(cw > 0 && ch > 0 && cw * ch <= 4e6)) {
						C = null; fgCache.delete(P.sv);
					} else {
						C = C || { c: D.createElement('canvas') };
						if (C.c.width !== cw || C.c.height !== ch) { C.c.width = cw; C.c.height = ch; C.g = null; }
						C.g = C.g || C.c.getContext('2d');
						if (!C.g) { C = null; }
					}
					if (C) {
						var cg = C.g;
						cg.setTransform(1, 0, 0, 1, 0, 0); cg.globalCompositeOperation = 'source-over'; cg.globalAlpha = 1;
						cg.clearRect(0, 0, cw, ch);
						cg.fillStyle = cg.strokeStyle = '#000';
						C.n = 0; C.key = P.key; C.x0 = x0; C.y0 = y0;
						for (k = 0; k < P.stat.length; k++) {
							s = P.stat[k];
							var drew = fgShape(cg, s.q, s.a, fgAff(P.T0, s.rel), x0, y0);
							C.n += drew;
							/* a picture not loaded yet: draw them again next frame */
							if (!drew && s.q.tag === 'image') { C.key = ''; }
						}
						fgCache.set(P.sv, C);
						fgStat.builds++;
					} else {
						live = live.concat(P.stat);
					}
				}
				if (C) {
					g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.imageSmoothingEnabled = true;
					g.drawImage(C.c, T[4] - ox + C.x0, T[5] - oy + C.y0);
					n += C.n;
				}
			}
			for (k = 0; k < live.length; k++) { s = live[k]; n += fgShape(g, s.q, s.a, fgAff(T, s.rel), ox, oy); }
			return n;
		}
		/* one SVG shape into the mask, as the browser paints it: m is the
		 * shape's user space to device px, ox/oy the target's origin */
		function fgShape(g, q, a, m, ox, oy) {
			var el = q.el;
			g.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy);
			var tag = q.tag, fo = q.fo, so = q.so, sw = q.sw, fill = q.fill, stroke = q.stroke;
			if (tag === 'image') {
				var href = el.getAttribute('href') || el.getAttribute('xlink:href') || '', im = href && fgOwn(href) && fgImg(href);
				if (!im) { return 0; }
				g.globalAlpha = a;
				g.drawImage(im, fgNum(el, 'x'), fgNum(el, 'y'), fgNum(el, 'width'), fgNum(el, 'height'));
				return 1;
			}
			if (tag === 'text') {
				var anc = q.anchor;
				g.font = q.font;
				g.textAlign = anc === 'middle' ? 'center' : (anc === 'end' ? 'end' : 'start');
				g.textBaseline = 'alphabetic';
				if (fill) { g.globalAlpha = a * fo; g.fillText(el.textContent, fgNum(el, 'x'), fgNum(el, 'y')); }
				if (stroke) { g.globalAlpha = a * so; g.lineWidth = sw; g.strokeText(el.textContent, fgNum(el, 'x'), fgNum(el, 'y')); }
				return 1;
			}
			var P = fgPath(el);
			if (fill && tag !== 'line') { g.globalAlpha = a * fo; g.fill(P, q.rule); }
			if (stroke) {
				g.globalAlpha = a * so; g.lineWidth = sw; g.lineCap = q.cap; g.lineJoin = q.join;
				g.miterLimit = q.miter;
				if (g.setLineDash) { g.setLineDash(q.dash); g.lineDashOffset = q.doff; }
				g.stroke(P);
			}
			return fill || stroke ? 1 : 0;
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
			/* Halloween (Rob, 4.10.2 "One swoop, no loop"): the full moon comes
			 * up, the witch dives across it and swoops out off the far side,
			 * and the moon fades. 4.10.0-4.10.1 looped her round it; 4.8.0
			 * flew her edge to edge at an even speed; until 4.7.1 she
			 * vanished mid-screen by design. */
			witchmoon: { actors: 2, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.t2 = 0; st.dir = sgn();
					st.MR = moonR(); st.W = witchW();
					/* the path's scale: 4.10.1's, so the glide and the dive are
					 * unchanged (it was the radius of the loop) */
					st.R = st.MR + 0.6 * st.W + 6;
					var edge = st.R + 0.58 * st.W + 8;
					st.mx = clamp(vw * rnd(0.38, 0.62), edge, vw - edge);
					st.my = mx2(vh * 0.18, st.R + 0.56 * st.W + 8);
					witchPath(st);
					hdr = null;                                     /* the header's letters, measured afresh */
					st.T = st.TT;                                   /* her flight, entry to exit, at her own speed */
					st.in = 0.45;                                   /* the moon is up before she arrives */
				}
				st.t2 += dt;
				var tw = st.t2 - st.in, gone = st.in + st.T, a;
				/* the moon: up in 0.5 s, fading over 0.8 s once she has gone */
				a = st.t2 < 0.5 ? st.t2 / 0.5 : (st.t2 > gone ? clamp(1 - (st.t2 - gone) / 0.8, 0, 1) : 1);
				var mo = moonGet();
				cx.save();
				/* fully opaque once up: nothing but the witch crosses it (a
				 * spider's thread showed through at 96%) */
				cx.globalAlpha = clamp(a, 0, 1);
				/* on whole device pixels: a fractional position makes the
				 * browser resample every pixel of it, every frame */
				var mdp = mn(W.devicePixelRatio || 1, 2);
				cx.drawImage(mo.c, MT.round((st.mx - mo.half) * mdp) / mdp, MT.round((st.my - mo.half) * mdp) / mdp, mo.half * 2, mo.half * 2);
				cx.restore();
				if (tw > 0 && tw < st.T) {
					var wp = witchAt(st, tw / st.T);
					st.wi = wp.i;   /* where on the path: glide and dive up to st.cross, then the swoop out */
					witchStep(st, wp, dt);
					witchDraw(st, 1, dt);
				} else {
					st.wx = null;
				}
				/* behind the header text: cut its letters out of the moon and of her */
				var cut = [[st.mx - mo.half, st.my - mo.half, mo.half * 2, mo.half * 2]];
				if (st.wx != null) { var wb = 1.2 * st.W; cut.push([st.wx - wb, st.wy - wb, 2 * wb, 2 * wb]); }
				hdrCut(cut, st.t2);
				st.fgB = cut;   /* where it drew: the foreground cut looks only here (4.10.4) */
				st.moonA = a;
				return st.t2 > gone + 0.8;
			} },
			/* ---- 4.2.0: Summer on the Canal and Florida Keys scenes. Each
			 * picked by Rob from rendered frame strips; the approved art and
			 * story, at the sizes he saw. Everything on the water is clipped
			 * at the water line so it can rise out of it and sink back. ---- */
			/* Summer S1: a gator glides along the canal, stops, and sinks out of sight */
			gatorglide: { actors: 2, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -60 : vw + 60;
					st.stop = st.dir > 0 ? rnd(vw * 0.45, vw * 0.6) : rnd(vw * 0.4, vw * 0.55);
					st.p = 1; st.t2 = 0;
				}
				st.t2 += dt;
				var sink = 0;
				if (st.p === 1) {
					st.x += st.dir * 52 * dt;
					if ((st.dir > 0 && st.x >= st.stop) || (st.dir < 0 && st.x <= st.stop)) { st.p = 2; st.t2 = 0; }
					/* the V wake it pushes ahead of it */
					sBeg('#D0EBFF', 1, VA * 0.5);
					cx.moveTo(st.x + st.dir * 40, waterY + 1); cx.lineTo(st.x - st.dir * 30, waterY - 4);
					cx.moveTo(st.x + st.dir * 40, waterY + 1); cx.lineTo(st.x - st.dir * 30, waterY + 6);
					sEnd();
				} else if (st.p === 2) {
					if (st.t2 > 1.6) { st.p = 3; st.t2 = 0; }
				} else {
					sink = mn(1, st.t2 / 1.6);
					if (!st.b1 && st.t2 > 0.4) { st.b1 = 1; addRing(st.x, waterY); }
					if (!st.b2 && st.t2 > 1.1) { st.b2 = 1; addRing(st.x - st.dir * 12, waterY + 1); }
				}
				cx.save(); cx.beginPath(); cx.rect(0, 0, vw, waterY + 2); cx.clip();
				dspr('gator', st.x, waterY - 2 + sink * 12, 112, st.dir > 0);
				cx.restore();
				return st.p === 3 && st.t2 > 2;
			} },
			/* Summer S2: an inflatable flamingo pool float drifts by, a lost flip-flop in tow */
			floatdrift: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -50 : vw + 50; st.ph = 0; st.wk = 0; }
				st.x += st.dir * 26 * dt; st.ph += dt * 1.6; st.wk -= dt;
				if (st.wk <= 0) { addRipple(st.x - st.dir * 20, waterY + 2); st.wk = rnd(1.6, 2.6); }
				dspr('floatie', st.x, waterY - 16 + sin(st.ph) * 2, 66, st.dir > 0, sin(st.ph * 0.7) * 0.05);
				dspr('flipflop', st.x - st.dir * 56, waterY - 4 + sin(st.ph + 1) * 1.5, 18, st.dir > 0, 1.4);
				return (st.dir > 0 && st.x > vw + 110) || (st.dir < 0 && st.x < -110);
			} },
			/* Summer S3: a mullet skips three times, then another answers down the canal */
			mulletskip: { actors: 2, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.dir = sgn(); st.x = rnd(vw * 0.2, vw * 0.4);
					if (st.dir < 0) { st.x = vw - st.x; }
					st.j = 0; st.t2 = 0; st.fish = 0;
				}
				st.t2 += dt;
				var jt = 0.55, gap = 0.25, hop = 52;
				if (st.t2 > jt + gap) {
					st.t2 = 0; st.j++; st.x += st.dir * hop;
					if (st.j === 3) { /* the answer, further down the canal */
						st.fish++; st.j = 0; st.t2 = -0.9;
						if (st.fish === 1) { st.x = st.dir > 0 ? vw * 0.62 : vw * 0.38; }
					}
				}
				if (st.fish >= 2) { return st.t2 > 0.6; }
				if (st.t2 >= 0 && st.t2 <= jt) {
					var u = st.t2 / jt;
					if (!st.tk) { st.tk = 1; addRipple(st.x, waterY); }
					dspr('mullet', st.x + st.dir * u * hop, waterY - sin(u * MT.PI) * hop, 32, st.dir > 0, st.dir * (u - 0.5) * 1.6);
				} else if (st.t2 > jt && st.tk) { st.tk = 0; addRipple(st.x + st.dir * hop, waterY); }
				return false;
			} },
			/* Keys K3: a hibiscus bloom drops, floats, and a fish nibbles it from below */
			hibfloat: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.x = rnd(vw * 0.3, vw * 0.7); st.y = waterY - 230; st.t2 = 0; st.p = 1; st.rot = 0; st.ph = 0; }
				st.t2 += dt; st.ph += dt * 2;
				if (st.p === 1) {
					st.y += 70 * dt; st.rot += dt * 1.2; st.x += sin(st.ph) * 20 * dt;
					dspr('hibiscus', st.x, st.y, 30, false, st.rot);
					if (st.y >= waterY - 6) { st.p = 2; st.t2 = 0; addRipple(st.x, waterY); }
					return false;
				}
				st.x += 8 * dt;
				var nib = (st.t2 > 1.6 && st.t2 < 1.9) || (st.t2 > 2.6 && st.t2 < 2.9);
				if (nib && !st.n1 && st.t2 < 2) { st.n1 = 1; addRing(st.x + 4, waterY + 2); }
				if (nib && !st.n2 && st.t2 > 2.5) { st.n2 = 1; addRing(st.x - 3, waterY + 2); }
				if (nib) { /* the fish, a dark shape just under the surface */
					cx.save(); cx.globalAlpha = VA * 0.6; cx.fillStyle = '#495057';
					cx.beginPath(); cx.ellipse(st.x + 2, waterY + 4, 7, 3.4, 0, 0, TAU); cx.fill();
					cx.restore();
				}
				dspr('hibiscus', st.x, waterY - 7 + sin(st.ph) * 1.5 - (nib ? 3 : 0), 30, false, st.rot, VA * clamp(5 - st.t2, 0, 1));
				return st.t2 > 5;
			} },
			/* Keys KA: an anhinga swims in, climbs onto a snag and spreads its wings to dry */
			anhinga: { actors: 1, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.dir = sgn();
					st.sx = st.dir > 0 ? rnd(vw * 0.55, vw * 0.7) : rnd(vw * 0.3, vw * 0.45);
					st.x = st.dir > 0 ? -40 : vw + 40; st.p = 1; st.t2 = 0; st.ph = 0; st.wk = 0;
				}
				st.t2 += dt; st.ph += dt * 2;
				var W2 = 64, sy = waterY - W2 * 70 / 76 / 2 + 6, fade = st.p === 4 ? clamp(1 - st.t2 / 1.2, 0, 1) : 1;
				dspr('snag', st.sx, sy, W2, st.dir < 0, 0, VA * fade);
				if (st.p === 1) { /* only the snake-neck shows as it swims */
					st.x += st.dir * 62 * dt; st.wk -= dt;
					if (st.wk <= 0) { addRipple(st.x - st.dir * 14, waterY + 1); st.wk = 1.1; }
					cx.save(); cx.beginPath(); cx.rect(0, 0, vw, waterY + 2); cx.clip();
					dspr('anhingaswim', st.x, waterY - 9, 44, st.dir > 0);
					cx.restore();
					if (abs(st.x - st.sx) < 8) { st.p = 2; st.t2 = 0; addRipple(st.sx, waterY, true); }
				} else if (st.p === 2 || st.p === 3) {
					/* the wings open: a horizontal stretch from folded to spread,
					 * then a slow flutter while they dry */
					var open = st.p === 2 ? easeIO(mn(1, st.t2 / 1.1)) : 1;
					var flut = st.p === 3 ? 1 + sin(st.ph * 3) * 0.02 : 1;
					var im = sprite('anhingadry');
					if (im.ready) {
						cx.save(); cx.globalAlpha = VA; cx.translate(st.sx, sy);
						cx.scale((st.dir < 0 ? -1 : 1) * (0.3 + 0.7 * open) * flut, 1);
						cx.drawImage(im.img, -W2 / 2, -W2 * im.ratio / 2, W2, W2 * im.ratio);
						cx.restore();
					}
					if (st.p === 2 && st.t2 > 1.1) { st.p = 3; st.t2 = 0; }
					else if (st.p === 3 && st.t2 > 4) { st.p = 4; st.t2 = 0; }
				} else {
					dspr('anhingadry', st.sx, sy, W2, st.dir < 0, 0, VA * fade);
					return st.t2 > 1.2;
				}
				return false;
			} },
			/* Keys KB: an osprey circles high, stoops feet-first into the water and climbs away with a fish */
			ospreycatch: { actors: 1, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -60 : vw + 60; st.tx = rnd(vw * 0.4, vw * 0.6); st.p = 1; st.t2 = 0; st.ph = 0; }
				st.t2 += dt; st.ph += dt;
				var hy = waterY - 230, fr = ((st.ph / 0.28) | 0) % 2;
				if (st.p === 1) {
					st.x += st.dir * 70 * dt;
					dspr(fr ? 'ospreydownnf' : 'ospreyupnf', st.x, hy + sin(st.ph * 2) * 6, 70, st.dir > 0);
					if ((st.dir > 0 && st.x >= st.tx) || (st.dir < 0 && st.x <= st.tx)) { st.p = 2; st.t2 = 0; }
				} else if (st.p === 2) { /* the stoop */
					var u = mn(1, st.t2 / 0.8);
					dspr('ospreydownnf', st.x + st.dir * u * 20, lerp(hy, waterY - 10, u * u), 60, st.dir > 0, st.dir * (0.4 + u * 0.8));
					if (u >= 1) { st.p = 3; st.t2 = 0; st.x += st.dir * 20; addRipple(st.x, waterY, true); addRipple(st.x + 6, waterY, true); }
				} else if (st.p === 3) { /* the splash */
					cx.save(); cx.globalAlpha = VA * clamp(1 - st.t2 / 0.7, 0, 1); cx.fillStyle = '#D0EBFF';
					for (var k = 0; k < 7; k++) {
						var a = -MT.PI * (0.15 + k * 0.1), r = 10 + st.t2 * 70;
						cx.beginPath(); cx.arc(st.x + cos(a) * r, waterY + sin(a) * r * 0.9 + st.t2 * st.t2 * 90, 2, 0, TAU); cx.fill();
					}
					cx.restore();
					if (st.t2 > 0.9) { st.p = 4; st.t2 = 0; }
				} else { /* up and away with the fish, shaking off drops */
					st.x += st.dir * 60 * dt;
					var yy = waterY - 18 - st.t2 * 55;
					dspr(fr ? 'ospreydown' : 'ospreyup', st.x, yy, 70, st.dir > 0, st.dir * -0.15);
					if (st.t2 < 0.8) {
						cx.save(); cx.globalAlpha = VA * 0.6; cx.fillStyle = '#D0EBFF';
						for (var q = 0; q < 3; q++) { cx.beginPath(); cx.arc(st.x - st.dir * (4 + q * 5), yy + 16 + st.t2 * 30 + q * 4, 1.6, 0, TAU); cx.fill(); }
						cx.restore();
					}
					return yy < waterY - 260 || st.x < -80 || st.x > vw + 80;
				}
				return false;
			} },
			/* Keys KC: a sandhill crane pair walks in, bows, and dances */
			cranes: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -40 : vw + 40; st.tx = rnd(vw * 0.35, vw * 0.55); st.p = 1; st.t2 = 0; st.ph = 0; }
				st.t2 += dt; st.ph += dt;
				var W2 = 40, fy = waterY - W2 * 70 / 44 / 2 + 4, gap = 44, a = VA;
				function one(x, dance, hop, bow) {
					if (dance) { dspr('cranedance', x, fy - hop, W2 * 64 / 44, st.dir > 0, 0, a); }
					else { dspr('crane', x, fy - hop + abs(sin(st.ph * 5)) * (st.p === 1 ? 1.5 : 0), W2, st.dir > 0, st.dir * bow, a); }
				}
				if (st.p === 1) {
					st.x += st.dir * 58 * dt;
					if ((st.dir > 0 && st.x >= st.tx) || (st.dir < 0 && st.x <= st.tx)) { st.p = 2; st.t2 = 0; }
				}
				var bow = st.p === 2 ? sin(mn(1, st.t2 / 1.2) * MT.PI * 2) * 0.35 : 0;
				if (st.p === 2 && st.t2 > 1.2) { st.p = 3; st.t2 = 0; }
				/* the dance: wings up, leaping in turn */
				var d1 = st.p === 3 && ((st.t2 * 2.2) | 0) % 2 === 0, d2 = st.p === 3 && ((st.t2 * 2.2 + 1) | 0) % 2 === 0;
				var h1 = st.p === 3 ? abs(sin(st.t2 * MT.PI * 2.2)) * 16 : 0, h2 = st.p === 3 ? abs(sin(st.t2 * MT.PI * 2.2 + 1.5)) * 12 : 0;
				if (st.p === 3 && st.t2 > 3.6) { st.p = 4; st.t2 = 0; }
				if (st.p === 4) { a = VA * clamp(1 - st.t2 / 1.2, 0, 1); if (st.t2 > 1.2) { return true; } }
				one(st.x - st.dir * gap, d2, h2, -bow);
				one(st.x, d1, h1, bow);
				return false;
			} },
			/* Keys KD: a limpkin wades up to the reeds (pink apple-snail eggs on a stem),
			 * probes, pulls up an apple snail and walks off with it */
			limpkinsnail: { actors: 1, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -40 : vw + 40; st.tx = rnd(vw * 0.35, vw * 0.55); st.p = 1; st.t2 = 0; st.ph = 0; }
				st.t2 += dt; st.ph += dt;
				var W2 = 40, fy = waterY - W2 * 56 / 46 / 2 + 5, a = st.p === 5 ? VA * clamp(1 - st.t2 / 1.2, 0, 1) : VA;
				dspr('snaileggs', st.tx + st.dir * 34, waterY - 16, 10, false, 0, a);
				var rot = 0, snail = false;
				if (st.p === 1) {
					st.x += st.dir * 52 * dt;
					if ((st.dir > 0 && st.x >= st.tx) || (st.dir < 0 && st.x <= st.tx)) { st.p = 2; st.t2 = 0; }
				} else if (st.p === 2) { /* probing the shallows */
					rot = -st.dir * 0.55 * abs(sin(st.t2 * MT.PI / 0.9));
					if (!st.r1 && st.t2 > 0.9) { st.r1 = 1; addRing(st.x + st.dir * 18, waterY + 1); }
					if (st.t2 > 1.8) { st.p = 3; st.t2 = 0; addRing(st.x + st.dir * 18, waterY + 1); }
				} else if (st.p === 3) { /* up with the snail */
					rot = -st.dir * 0.55 * (1 - mn(1, st.t2 / 0.6)); snail = st.t2 > 0.3;
					if (st.t2 > 2.4) { st.p = 4; st.t2 = 0; }
				} else { /* walks off the way it came, carrying it */
					snail = true; st.x -= st.dir * 26 * dt;
					if (st.p === 4 && st.t2 > 2.2) { st.p = 5; st.t2 = 0; }
					else if (st.p === 5 && st.t2 > 1.2) { return true; }
				}
				var face = st.p >= 4 ? st.dir < 0 : st.dir > 0;
				dspr('limpkin', st.x, fy + (st.p === 1 || st.p >= 4 ? abs(sin(st.ph * 5)) * 1.5 : 0), W2, face, rot, a);
				if (snail) { dspr('applesnail', st.x + (face ? 1 : -1) * W2 * 0.49, fy - W2 * 56 / 46 * 0.24, 9, false, 0, a); }
				return false;
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
					/* It lands ON THE WATER LINE: there is no snow pile to land on
					 * since 4.2.0, and a ripple marks the touchdown. */
					var target = waterY - 8;
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
					if (st.gy >= target) { st.land = st.t2; st.gy = target; addRipple(st.gx, waterY, true); }
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
				/* the moon and the sleigh's track: the foreground cut looks only here */
				st.fgB = [[st.mx - 90, st.my - 90, 180, 180], [st.mx - 210, st.my - 60, 420, 120]];
				return st.t2 > 6;
			} },
			/* New Year's: the cork goes off in a corner. The cork sprite was
			 * retired in 3.15.0 (it read as a mushroom); what flies is the
			 * theme's own sparkle, on the same arc and trail. */
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
						dspr('sparkle', cxx, cyy, 14, false, u * 9);
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
					/* F-A (Rob, 4.3.0): two-frame wingbeat in flight; on the water it
					 * is Snowbird's own standing flamingo */
					if (b3.st2 === 2) { dspr('flamingo', b3.x, b3.y - 4, 24, true, 0); }
					else { dspr(((st.t2 * 1000 / 260 + b3.ph) | 0) % 2 ? 'flamup' : 'flamdown', b3.x, b3.y, 60, true, b3.st2 === 1 ? 0.14 : -0.3); }
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
			/* --- The four scenes that were NAMED but never existed. -------
			 * VIGS listed doveflight, flagfly, kayaker and stilts; SCENES
			 * had none of them. startVig() looks the name up, finds nothing
			 * and returns, so MLK and Patriot Day never played a vignette at
			 * all and Mardi Gras and Spring on the Canal silently lost a
			 * third to a half of theirs. The sprites were all sitting there
			 * already. validate-paths.js now fails the build on a scene name
			 * with no scene behind it, the same way it does for sprites. */

			/* MLK: doves cross in a slow line and release a peace glyph. */
			doveflight: { actors: 3, run: function (st, dt) {
				if (!st.on) {
					st.on = 1; st.t2 = 0; st.dir = sgn();
					st.y0 = vh * rnd(0.22, 0.38);
				}
				st.t2 += dt;
				var i, x, y;
				for (i = 0; i < 3; i++) {
					x = st.dir > 0
						? -70 + (st.t2 * 78) - i * 62
						: vw + 70 - (st.t2 * 78) + i * 62;
					y = st.y0 + sin(st.t2 * 1.6 + i) * 9 + i * 13;
					dspr('dove', x, y, 30, st.dir > 0);
				}
				if (st.t2 > 2.6 && st.t2 < 5.4) {
					dtxt('\u262E', vw / 2, vh * 0.3 - (st.t2 - 2.6) * 10, 20, '#F1F3F5',
						VA * clamp(1.4 - abs(st.t2 - 4) , 0, 1));
				}
				return st.t2 > 6.4;
			} },

			/* Patriot Day: one flag crosses slowly, alone. Sober by design —
			 * this is the theme the brief calls minimal. */
			flagfly: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.dir = sgn(); st.y0 = vh * rnd(0.2, 0.34); }
				st.t2 += dt;
				var x = st.dir > 0 ? -60 + st.t2 * 58 : vw + 60 - st.t2 * 58;
				dspr('flagcloth', x, st.y0 + sin(st.t2 * 1.1) * 5, 34, st.dir > 0);
				return st.t2 * 58 > vw + 130;
			} },

			/* Spring on the Canal: a kayak crosses the waterline, paddling. */
			kayaker: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.dir = sgn(); st.wake = 0; }
				st.t2 += dt;
				var x = st.dir > 0 ? -70 + st.t2 * 64 : vw + 70 - st.t2 * 64;
				var y = waterY - 10 + sin(st.t2 * 2.4) * 1.6;
				dspr('kayak', x, y, 46, st.dir > 0);
				st.wake += dt;
				if (st.wake > 0.5) {
					st.wake = 0;
					addRipple(x - st.dir * 22, waterY);
				}
				return st.t2 * 64 > vw + 150;
			} },

			/* Mardi Gras: a stilt walker crosses, and this is the one scene
			 * that makes the 'stilts' sprite real — it was the only sprite
			 * in the registry nothing drew. */
			stilts: { actors: 2, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.t2 = 0; st.dir = sgn(); }
				st.t2 += dt;
				var x = st.dir > 0 ? -50 + st.t2 * 42 : vw + 50 - st.t2 * 42;
				/* The gait: a slow rock, and a small rise on each stride. */
				var y = waterY - 46 + abs(sin(st.t2 * 2.1)) * -5;
				dspr('stilts', x, y, 58, st.dir > 0, sin(st.t2 * 2.1) * 0.06);
				if (rand() < dt * 1.6) {
					dspr('doubloon', x + rnd(-18, 18), y + rnd(20, 52), 12);
				}
				return st.t2 * 42 > vw + 120;
			} },

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
			/* Spring: mother duck parade on the water */
			duckparade: { actors: 3, run: function (st, dt) {
				if (!st.on) { st.on = 1; st.dir = sgn(); st.x = st.dir > 0 ? -140 : vw + 140; st.ph = 0; st.wk = 1; }
				st.ph += dt * 3;
				st.x += st.dir * 42 * dt;
				st.wk -= dt;
				if (st.wk <= 0) { addRipple(st.x - st.dir * 10, waterY + 2); st.wk = rnd(1.2, 2); }
/* D-A (Rob, 4.3.0): a mottled duck hen and four ducklings, facing
				 * the way they swim (the drawings face left) */
				var flip = st.dir > 0;
				dspr('duckhen', st.x, waterY - 8 + sin(st.ph) * 2, 40, flip, 0);
				for (var i4 = 1; i4 <= 4; i4++) {
					dspr('duckling', st.x - st.dir * (22 + i4 * 20), waterY - 5 + sin(st.ph + i4) * 2, 17, flip, 0);
				}
				return (st.dir > 0 && st.x > vw + 160) || (st.dir < 0 && st.x < -160);
			} },
			/* Spring: dragonfly lands on a lotus */
			dragonlotus: { actors: 2, run: function (st, dt) {
				if (!st.tgt) { st.tgt = 'lilypad'; }
				return SCENES.dragonlands.run.call(this, st, dt);
			} }
		};
		var vigList = (FX.vig && VIGS[themeKey]) ? VIGS[themeKey].slice() : [];
		if (DEBUG && CFG.vigOnly) { vigList = [CFG.vigOnly]; }   /* the suites force one scene */
		if (FX.vig && evening && EVENING_VIGS[themeKey]) { vigList = vigList.concat(EVENING_VIGS[themeKey]); }
		/* no header picture: no sky scene (4.10.7) */
		if (!skyPic) { vigList = vigList.filter(function (n) { return !SKY_VIG[n]; }); }
		/* The witch and her moon are pre-drawn in idle time after load (4.10.0). */
		if (vigList.indexOf('witchmoon') >= 0) {
			var wcTodo = [-1], wcI;
			for (wcI = 0; wcI < WFR; wcI++) { wcTodo.push(wcI); }
			var wcIdle = function (dl) {
				var t0 = nowMs();
				if (!skyPic) { return; }
				if (!vw) { wcLater(wcIdle); return; }   /* not sized yet */
				/* at the header picture's size, where she will fly */
				inSky(function () {
					witchW();
					do { var k = wcTodo.shift(); if (k === -1) { moonGet(); } else if (k != null) { wcGet(k); } }
					while (wcTodo.length && (dl && dl.timeRemaining ? dl.timeRemaining() > 4 : nowMs() - t0 < 6));
				});
				if (wcTodo.length) { wcLater(wcIdle); }
			};
			var wcLater = function (f) { if (W.requestIdleCallback) { W.requestIdleCallback(f, { timeout: 2000 }); } else { setTimeout(f, 50); } };
			wcLater(wcIdle);
		}
		/* The first scene: 6-10 s in, on every page. A theme with no scenes
		 * (or none at this hour) gives that slot to its hero on a later page,
		 * where the 3-5 s first-page flyer does not apply. None of this runs
		 * under the moments queue, which owns the timing (4.12.0) — including
		 * the first-page question, which is why it is asked here and not at
		 * start. */
		if (momentsOn()) { vigAt = INF; heroAt = INF; }
		else {
			heroAfterScene = !!firstPage() && !heroFirst;
			if (vigList.length) { vigAt = (DEBUG && CFG.vigFirst) ? CFG.vigFirst / 1000 : rnd(TIMING.vigFirst[0], TIMING.vigFirst[1]); }
			else { heroAfterScene = false; if (heroAt >= INF) { heroAt = rnd(TIMING.vigFirst[0], TIMING.vigFirst[1]); } }
		}

		function startVig(name) {
			var sc = SCENES[name];
			if (!sc) { return; }
			/* On a phone a scene borrows at most ONE sprite (Rob, 4.2.0): with
			 * 6-7 on screen, a three-actor scene used to empty half of it. */
			var need = sc.actors || 3, freed = 0;
			if (mobile) { need = mn(need, 1); }
			for (var k = 0; k < parts.length && freed < need; k++) {
				if (!parts[k].dormant) { parts[k].dormant = true; freed++; }
			}
			vig = { name: name, st: { t: 0 }, sc: sc, sky: !!SKY_VIG[name] };
			vigLog.push({ name: name, start: vt, end: -1, borrowed: freed });
		}
		function endVig(t) {
			if (!vig) { return; }
			vig = null;
			if (vigLog.length) { vigLog[vigLog.length - 1].end = vt; }
			for (var k = 0; k < parts.length; k++) {
				if (parts[k].dormant) { parts[k].dormant = false; seed(parts[k]); }
			}
			nextTurn('vig');
			fitParts();
		}
		/* xa turns (Rob's option A, 4.3.0): the corner accent and the xa
		 * sprite take 45 s turns of VISIBLE time, accent first, crossfading
		 * over 1.5 s; never both on screen. The sprite's turn borrows one
		 * live free-air particle, low on the screen so it drifts up through
		 * it; if it leaves or a scene borrows it, another takes over (never
		 * during a scene). Counts are untouched: it replaces, never adds. */
		var XA_TURN = TIMING.xaTurn, xaOn = false, xaP = null;
		function stepTurns(dt) {
			if (!xaSp) { return; }
			var on = ((vt / XA_TURN) | 0) % 2 === 1, k, q;
			if (on !== xaOn) {
				xaOn = on;
				for (k = 0; k < accents.length; k++) {
					/* restore the accent's OWN opacity (Earth Day's is .55), never '' */
					if (accents[k]._dccOp == null) { accents[k]._dccOp = accents[k].style.opacity; }
					accents[k].style.transition = 'opacity 1.5s'; accents[k].style.opacity = on ? '0' : accents[k]._dccOp;
				}
				if (!on && xaP) { xaP.xaOut = 1; }
			}
			if (xaP && (xaP.sp !== xaSp || xaP.dormant)) { xaP.xaOut = 0; xaP = null; }
			if (xaP) {
				if (xaP.xaOut) {
					xaP.alpha -= dt / 1.5;
					if (xaP.alpha <= 0) { q = xaP; q.xaOut = 0; xaP = null; seed(q); }
				} else if (xaP.alpha < 1) { xaP.alpha = mn(1, xaP.alpha + dt / 1.5); }
				return;
			}
			if (!on || vig) { return; }
			for (k = 0; k < parts.length; k++) { if (!parts[k].dormant && parts[k].free) { q = parts[k]; break; } }
			if (!q) { for (k = 0; k < parts.length; k++) { if (!parts[k].dormant) { q = parts[k]; break; } } }
			if (!q) { return; }
			seed(q, false, xaSp);
			q.far = false; q.free = 0; q.alpha = 0;
			q.x = rnd(0.3, 0.7) * vw; q.y = vh * 0.74;
			xaP = q;
		}

		function stepVig(dt, t) {
			/* THE showstopper: the real New Year's countdown, wall-clock. */
			if (themeKey === COUNTDOWN_THEME && FX.vig && !countdownDone) {
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
				var done;
				if (vig.sky) {
					/* in the header picture, behind its title and foreground */
					done = inSky(function () {
						var fgF = foreBegin(vig.st.fgB);
						try { return vig.sc.run(vig.st, dt, t); } finally { if (fgF) { foreEnd(fgF); } }
					});
				} else { done = vig.sc.run(vig.st, dt, t); }
				if (done) { endVig(t); }
				return;
			}
			/* the queue starts scenes through play(), never this path */
			if (momentsOn()) { vigAt = INF; return; }
			/* Scenes switched off mid-visit (the degrade ladder): a scene
			 * that was due hands its turn to the hero. */
			if (!vigList.length) { if (vigAt < INF || heroAfterScene) { heroAfterScene = false; if (canHero()) { heroAt = mn(heroAt, vigAt < INF ? vigAt : vt); } vigAt = INF; } return; }
			if (hero || vt < vigAt) { return; }
			/* startVig() returns without starting anything if the name has
			 * no scene. Until 4.1.0 nothing then moved the clock on, so a
			 * name with nothing behind it retried on EVERY FRAME for the life
			 * of the page (MLK and Patriot Day did). Push it on regardless. */
			/* a sky scene waits for the header picture (Rob, 4.10.7); the
			 * pick is kept, so the wait is for THIS scene */
			vigNext = vigNext || pick(vigList);
			if (SKY_VIG[vigNext] && !skyInView()) { return; }
			startVig(vigNext);
			vigNext = '';
			vigAt = vig ? INF : vt + 4;
		}

		/* --- Boot + main loop with the degrade ladder. --- */
		applySize();
		/* Before the first field, not after: seeding without a map would put
		 * this field where 3.14.0 put it, and it would stay there until every
		 * one of its members had respawned. */
		buildOpenMap();
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
		/* A slider, an accordion, a theme script rewriting the host's
		 * innerHTML takes the canvas with it, and 3.11.0 only noticed if that
		 * happened before the settled pass — a one-shot check cannot cover a
		 * re-render at an arbitrary later time, which is the whole risk. The
		 * frame loop is already running, so liveness costs one tree walk a
		 * frame and there is no observer to disconnect or leak. Re-mounts are
		 * rate-limited and capped: if something is determined to remove the
		 * canvas, lose gracefully rather than fight it every frame. */
		var remounts = 0, remountNext = 0;
		function ensureMounted() {
			/* Its own clock, so every caller rate-limits on the same scale —
			 * passing in a frame timestamp from one caller and something else
			 * from another would let one of them disable the other. */
			var now = (W.performance && performance.now) ? performance.now() : +new Date();
			if (!CFG.layer || D.body.contains(cv) || now < remountNext) { return; }
			/* Out of re-mounts: stop drawing into a canvas nobody can see.
			 * Set the flag directly — NEVER setRunning() here: this runs inside
			 * a frame, and where onScreen is stale or there is no
			 * IntersectionObserver, setRunning() calls play(), which requests a
			 * frame on top of the one this frame's next() requests. That
			 * doubled every frame: 786,432 requests a second within two
			 * seconds (4.6.1, measured). A later visibility or observer event
			 * may restart the loop; the next frame lands back here. */
			if (remounts >= 20) { running = false; return; }
			remountNext = now + 1000;
			remounts++;
			/* The old margin correction belongs to the old layout; carrying it
			 * into the re-mount distorts the acceptance check. */
			stickyPad = 0;
			if (!host || !D.body.contains(host) || !mountIn(host, hostMode)) {
				/* The host went with it, or will not take the canvas back. */
				host = null;
				stickyWatch(null);
				mountOnBody(CFG.layer ? BODY_Z : FRONT_Z);
			}
			if (hostMode === 'sticky' && host) { stickyFit(); stickyBalance(); }
			applySize(true); /* a re-mount IS a discontinuity */
			/* Whatever re-rendered the page may have changed what paints over
			 * the canvas, so re-run the corrective loop rather than assume the
			 * old decision still holds. Bounded, and at most once a second. */
			if (host) { fixCoverage(true); }
			buildOpenMap();
			if (remounts === 1 && W.console && W.console.info) {
				W.console.info('DCC Seasons: the ambient canvas was removed from the page (the host re-rendered its children) and has been re-mounted.');
			}
		}
		/* A MOCKED CLOCK for the suites (debug builds only): in manual mode the
		 * rAF loop stops and the test advances the engine tick by tick, so a
		 * scene plays through identically every run. */
		var manual = false, fakeT = 0;
		/* --- PACING (4.6.0, Rob: "make it lighter, keep the look"). The loop
		 * used to clear and repaint the whole canvas on every display frame
		 * whatever was on it. Now each frame picks how soon the NEXT repaint
		 * is due:
		 *   0       full rate — anything that must stay smooth is on screen:
		 *           a hero, a scene, any live sprite, ripples, fireworks,
		 *           the Earth Day turn, and the transferred background fills
		 *           and footer text clip, which track the page as it scrolls;
		 *   SLOW_MS the background layer is all that moves. Every effect was
		 *           measured stepping at most 1.54px and 4.5deg per frame at
		 *           30fps (embers 1.15px), so it looks the same as at 60;
		 *   IDLE_MS nothing is drawn at all: no clear, no paint, just a cheap
		 *           tick so the hero and scene clocks keep counting.
		 * Skipped display frames cost one early return. dt is measured from
		 * the last REPAINT, so motion speeds are unchanged. --- */
		var SLOW_MS = 1000 / 30, IDLE_MS = 250, lastDraw = 0, blank = false;
		/* Every repaint clears the WHOLE canvas (4.10.6). 4.6.0 cleared only
		 * the background particles' boxes on background-only frames, which
		 * saved work where the canvas is drawn on the CPU; but where the GPU
		 * draws it (every Mac, iPhone and current Android), a clear that
		 * leaves anything standing makes the browser keep last frame's
		 * whole canvas and copy it before drawing on it, while a full clear
		 * lets it start from nothing. Measured on a GPU-drawn canvas at
		 * 1280 px and 2x, the background layer at 30 fps with the plane
		 * flying: 23 page frames a second with box clears, 46 with full
		 * clears. */
		/* The PAGE canvas's pace. A sky scene or flyer (4.10.7) is on the
		 * header picture's own canvas and does not hurry this one: while only
		 * the sky moves, the page's background layer keeps its 30 fps and the
		 * page canvas is not redrawn in between. */
		function pace() {
			if ((hero && !hero.sky) || (vig && !vig.sky) || burstMode || ripples.length || bgFills.length || footMode || xaP) { return 0; }
			/* Rob's pick (4.12.2), from the 4.12.1 side-by-side: the falling
			 * and drifting SPRITES paint at 30 fps, like the background
			 * layer. Nothing else slows down, and the separation is the
			 * ORDER of these tests, not a new flag: every test above returns
			 * the full rate first, so a flyer or scene on the page canvas,
			 * a ripple, a firework burst, an Earth Day turn, a transferred
			 * background and the footer clip are all untouched — and a SKY
			 * flyer or scene (4.10.7) keeps the full rate through
			 * `skyBusy()`, which is read beside this and overrides it. Only
			 * a frame whose sole moving thing is the sprite field reaches
			 * here. The idle drop below is unchanged. */
			for (var k = 0; k < parts.length; k++) { if (!parts[k].dormant) { return SLOW_MS; } }
			return (subEff && subParts.length) ? SLOW_MS : IDLE_MS;
		}
		function skyBusy() { return !!((hero && hero.sky) || (vig && vig.sky) || (sky && sky.dirty)); }
		/* lastPage is the page canvas's SCHEDULE anchor; lastPageT is when it
		 * actually last painted. They are the same thing only when the
		 * display's interval divides the period exactly, and the motion step
		 * must use the real one (4.12.2). */
		var lastPage = 0, lastPageT = 0;
		function frame(t, tick) {
			raf = 0;
			if (manual && !tick) { return; }
			if (!running && !tick) { return; }
			var pp = pace(), pc = skyBusy() ? 0 : pp;
			/* Paced by ELAPSED TIME, never by counting frames (4.12.2): a
			 * 120 Hz iPhone Pro would get 60 from "every other frame", and a
			 * phone in Low Power Mode, whose rAF is already throttled to
			 * about 30, would get 15 — which the -1ms tolerance below is
			 * exactly what prevents (a 33.3ms frame clears a 32.3ms gate).
			 * -1ms also covers rAF jitter, so a 33.3ms target on a 16.7ms
			 * display lands on every second frame, not every third. */
			if (!tick && pc && lastDraw && t - lastDraw < pc - 1) { next(pc - (t - lastDraw)); return; }
			/* The REMAINDER IS CARRIED: the anchor advances by one period
			 * rather than jumping to this frame, so a display whose interval
			 * is not a factor of the period (75 Hz: 13.3ms against 33.3)
			 * still averages the target instead of settling on the next
			 * whole multiple. More than one period late — a tab waking, a
			 * long task — and the schedule is restarted from now, so the
			 * carry can never become a backlog of owed frames. */
			lastDraw = (pc && lastDraw && t - lastDraw < 2 * pc) ? lastDraw + pc : t;
			ensureMounted();
			var t0 = (W.performance && performance.now) ? performance.now() : 0;
			/* Motion steps stay capped as before; an idle tick may span 250ms,
			 * and the clocks must see all of it. */
			var dt = last ? mn((t - last) / 1000, pc === IDLE_MS ? 0.3 : 0.05) : 0.016;
			last = t;
			/* the page's canvas, when its own pace says so (always, unless
			 * only the sky is moving) */
			var pageDue = tick || !pp || !lastPage || t - lastPage >= pp - 1, clipped = false;
			if (pageDue) {
				/* Motion is stepped by REAL elapsed time, so every speed is
				 * exactly what it was at 60 fps — the pacing changes when a
				 * frame is drawn, never how far anything moves per second. */
				var pdt = lastPageT && !tick ? mn((t - lastPageT) / 1000, pp === IDLE_MS ? 0.3 : 0.05) : dt;
				lastPage = (pp && lastPage && t - lastPage < 2 * pp) ? lastPage + pp : t;
				lastPageT = t;
				/* Nothing was drawn last frame and nothing will be: leave the
				 * already-empty canvas alone. */
				if (!(pp === IDLE_MS && blank)) { cx.clearRect(0, 0, vw, vh); }
				clipped = footMode && clipText();
				drawBgFills();
				/* Layer 1 before everything else on the canvas: the subtle layer
				 * is the calm baseline and every sprite belongs on top of it. */
				stepSubtle(pdt);
				drawSubtle();
				if (burstMode) {
					if (!nextBurst) { nextBurst = t + 1500; }
					else if (t >= nextBurst) { fire(t); }
					stepBursts(pdt);
					drawFlash(pdt);
					if (yearFx) {
						yearFx.a -= pdt * 0.42;
						yearFx.y -= pdt * 12;
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
				deClump(pdt);
				actorX = sceneActors();
				for (k = 0; k < parts.length; k++) {
					p = parts[k];
					if (p.dormant) { continue; }
					repel(p, pdt);
					step(p, pdt, t);
					riderYield(p, pdt);
				}
				/* FAR layer first, then water, then NEAR */
				for (k = 0; k < parts.length; k++) { p = parts[k]; if (!p.dormant && p.far) { drawP(p, t); } }
				stepRipples(pdt);
				drawRipples();
				for (k = 0; k < parts.length; k++) {
					p = parts[k];
					if (p.dormant || p.far) { continue; }
					drawP(p, t);
				}
			}
			vt += dt * VT_X;   /* the heroes' visible-time clock, once per frame */
			stepTurns(dt);
			momStep(dt * VT_X);   /* our turn in the queue, if one is playing */
			/* a scene goes behind the header picture's foreground (4.10.4) */
			/* (debug: the foreground suite draws a stand-in sprite here) */
			if (DEBUG && DBG && W.DCCSeasonsEngine._state && W.DCCSeasonsEngine._state.preScene) { W.DCCSeasonsEngine._state.preScene(cx); }
			fgFrame++;
			skyClear();
			stepVig(dt, t);
			stepHero(dt, t);
			heroGone();
			/* a sky flyer crosses the header picture, behind its foreground
			 * (4.10.5, Rob: higher in the sky than the seaplane; 4.10.7: in
			 * the picture only) */
			if (hero && hero.sky) {
				inSky(function () {
					var fgH = hero.x != null && hero.y != null ? foreBegin(heroBounds(hero)) : null;
					try { drawHero(t); } finally { if (fgH) { foreEnd(fgH); } }
				});
			} else { drawHero(t); }
			if (pageDue) { drawReflections(t); }
			if (DEBUG && DBG && W.DCCSeasonsEngine._slow) {
				var until = performance.now() + W.DCCSeasonsEngine._slow;
				while (performance.now() < until) { /* synthetic load for tests */ }
			}
			if (clipped) { cx.restore(); }
			/* Whether this frame left the canvas empty: re-asked AFTER the
			 * step, because a hero or scene may have started in it. */
			var pn = pace();
			blank = pn === IDLE_MS;
			if (skyBusy()) { pn = 0; }
			if (t0 && !tick) { degrade(performance.now() - t0, t); }
			if (!tick) { next(pn); }
		}
		/* Ask for the next frame only when it is due. A requestAnimationFrame
		 * on every display frame keeps the browser producing 60 frames a
		 * second even when the callback returns at once, and that per-frame
		 * overhead was most of what remained. At a slow pace, sleep on a
		 * timer and then take the next display frame. */
		var sleep = 0;
		function next(pn) {
			if (!pn) { raf = W.requestAnimationFrame(frame); return; }
			sleep = W.setTimeout(function () {
				sleep = 0;
				if (running && !raf) { raf = W.requestAnimationFrame(frame); }
			}, mx2(0, pn - 10));
		}
		function play() {
			if (sleep) { W.clearTimeout(sleep); sleep = 0; }
			if (!raf && running) { last = 0; lastDraw = 0; lastPage = 0; lastPageT = 0; raf = W.requestAnimationFrame(frame); }
		}
		/* Draw only while someone can see it: the tab is showing AND the
		 * canvas is on screen (a footer or sticky canvas scrolls away). The
		 * hero and scene clocks run on visible time, so they pause with it
		 * and pick up where they left off. A canvas that has been REMOVED
		 * from the page also reports "not intersecting" — keep the loop
		 * running then, or ensureMounted() could never put it back. */
		var onScreen = true;
		function setRunning() {
			/* ...but only while a re-mount is still possible: in front mode
			 * (no CFG.layer) nothing re-mounts, and after the 20th attempt
			 * nothing will, so a removed canvas stops the loop for good. */
			running = !D.hidden && !reduced() && (onScreen || (!D.body.contains(cv) && !!CFG.layer && remounts < 20));
			if (running) { play(); }
		}
		D.addEventListener('visibilitychange', setRunning);
		if (W.IntersectionObserver) {
			try {
				new W.IntersectionObserver(function (es) {
					onScreen = es[es.length - 1].isIntersecting;
					setRunning();
				}).observe(cv);
			} catch (e) { /* no observer: draw as before */ }
		}
		if (mq && mq.addEventListener) {
			mq.addEventListener('change', function () {
				if (reduced()) {
					running = false;
					cv.style.display = 'none';
				} else {
					cv.style.display = '';
					setRunning();
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
				get heroXY() { return hero ? [hero.x, hero.y] : null; },
				/* where the sky is drawn (4.10.7): heroXY and vigSt of a sky
				 * actor are in the sky canvas's px; add left/top for the
				 * viewport */
				get sky() {
					var r = sky && sky.c.isConnected ? sky.c.getBoundingClientRect() : null;
					return { pic: !!skyPic, inView: skyInView(), ratio: skyRatio, canvas: !!sky, w: sky ? sky.w : 0, h: sky ? sky.h : 0,
						left: r ? r.left + sky.ox : 0, top: r ? r.top + sky.oy : 0, ox: sky ? sky.ox : 0, oy: sky ? sky.oy : 0, heroSky: !!(hero && hero.sky), vigSky: !!(vig && vig.sky), stats: skyStat,
						vigs: vigList.slice(), heroes: heroPool.slice() };
				},
				get vigSt() { return vig && vig.st; },
				get xa() { return { on: xaOn, live: !!xaP, alpha: xaP ? xaP.alpha : 0, globes: parts.filter(function (q) { return !q.dormant && q.sp === xaSp; }).length, accent: accents.length ? accents[0].style.opacity : null }; },
				get vt() { return vt; },
				get heroAt() { return heroAt; },
				get vigAt() { return vigAt; },
				get firstPage() { return firstPageAt ? (firstPageAt === 1 ? true : (firstPageAt === 2 ? false : null)) : 'unread'; },
				/* 4.12.0: our turn in Rob's queue */
				/* finish the moment twice over, for the done()-once check */
				momForce: function () { if (mom) { var f = mom.fin; f(); f(); } },
				get moments() {
					return { on: momentsOn(), playing: !!mom, stage: mom ? mom.stage : -1, t: mom ? mom.t : 0,
						stats: momStat, reg: momentReg, heronOff: heronOff(), pool: heroPoolNow().slice(0),
						heroAt: heroAt, vigAt: vigAt, ready: momReady() };
				},
				get heroLog() { return heroLog.slice(0); },
				get vigLog() { return vigLog.slice(0); },
				get maxParts() { return maxParts; },
				get mobile() { return mobile; },
				get sprites() {
					var out = {};
					for (var k = 0; k < parts.length; k++) {
						var q = parts[k];
						if (q.dormant) { continue; }
						var key = q.sKey || (q.sp && (q.sp.c || q.sp.g)) || '?';
						out[key] = (out[key] || 0) + 1;
					}
					return out;
				},
				get accents() { return accents.map(function (el) { return el.innerHTML.length; }).length; },
				get heroFrame() { return heroFrame; },
				get fore() { var L = fgList || [], c = function (k) { return L.reduce(function (n, it) { return n + it[k].length; }, 0); }; return { stats: fgStat, roots: L.length, sel: FG_SEL, svgs: c('svgs'), media: c('media'), boxes: c('boxes') }; },
				/* the matrix the cut uses for an SVG shape (debug: the suite checks
				 * it against Chromium's own getScreenCTM) */
				foreM: function (el) { fgMemo = null; var sv = el.ownerSVGElement; while (sv && sv.ownerSVGElement) { sv = sv.ownerSVGElement; } var b = fgSvgM(sv), r = fgInv(fgM6(sv.getScreenCTM())); return fgAff(fgAff(b, r), fgM6(el.getScreenCTM())); },
				get witch() { return { stats: wcStats, frames: wcFrames.filter(Boolean).length, moon: !!moonC, hdr: hdr ? { n: hdr.n, x: hdr.x, y: hdr.y, w: hdr.w, h: hdr.h, fixed: hdr.fixed, c: hdr.c } : null, cuts: hdrCuts, canvas: sky ? sky.c : cv }; },
				get heron() { return { stats: hnStats, cached: Object.keys(hnCache).length, st: hero && hero.kind === 'heron' ? (hero.land ? hero.st : 0) : -1, legs: hero && hero.legs, sa: hero && hero.sa }; },
				get evening() { return evening; },
				get frameAvg() { return frameAvg; },
				get shed() { return shed; },
				get vw() { return vw; },
				get vh() { return vh; },
				get waterY() { return waterY; },
				get sep() { return sepRun; },
				get share() { return viewShare(); },
				get placement() { return footMode ? 'footer' : 'content'; },
				/* which theme the loader handed us — the inline config carries
				 * only the reachable ones since 4.12.1, so a suite has to be
				 * able to see that the right one arrived */
				get theme() { return themeKey; },
				/* The frame loop's own flag, so a suite can prove the engine
				 * actually pauses on a hidden tab rather than inferring it. The
				 * first hidden-tab test read this before it existed, got
				 * undefined, and passed unconditionally. */
				get running() { return running; },
				get subtle() {
					/* Positions included so a suite can ask "did it move?"
					 * deterministically. Reading that from canvas pixels is
					 * a sampling question, and with a nine-particle field
					 * two strided reads coincide often enough to fail a
					 * correct build. */
					var pos = [], i;
					for (i = 0; i < subParts.length; i++) {
						pos.push({ x: MT.round(subParts[i].x * 10) / 10, y: MT.round(subParts[i].y * 10) / 10, r: subParts[i].r });
					}
					return { key: subKey, on: !!subEff, n: subParts.length,
						intensity: subIntensity, shimmer: !!(subEff && subEff.shimmer), pos: pos };
				},
				get hostPath() { return host ? pathOf(host) : ''; },
				get textBoxes() { return textBoxes.slice(0); },
				get textMs() { return textMs; },
				get paintable() { return worth(host, 1); },
				get openMap() {
					return { n: omN, total: omTot, frac: omFrac, ms: omMs, builds: omBuilds,
						cell: MAP_CELL, usable: mapUsable(), measured: omMeas, openMeasured: omOpen,
						nine: omNine.slice(0), col: omCol.slice(0) };
				},
				get repel() { return { ms: repMs, frames: repN }; },
				buildMap: function () { buildOpenMap(); return omFrac; },
				manual: function (on) { manual = !!on; if (!on) { last = 0; play(); } },
				tick: function (ms, n) {
					for (var k = 0; k < (n || 1); k++) { fakeT = (fakeT || last || 1000) + ms; frame(fakeT, true); }
				},
				/* Re-seeding the live array is exactly what a restart does. */
				reseed: function (anywhere) { for (var k = 0; k < parts.length; k++) { seed(parts[k], anywhere); } }
			};
		}
		play();
	}

	/* --- Rob's moments queue (4.12.0) ------------------------------------
	 * The Hero Effects mu-plugin (3.16.2) gives the visit ONE queue per tab:
	 * the Seasons moment, then the seaplane, the heron, the fish and rod,
	 * round again, a few seconds apart and then a minute apart, carried
	 * across pages in sessionStorage. Nobody stays on the header long enough
	 * to see all four otherwise.
	 *
	 * We register the moment HERE, as the script runs, before any image or
	 * idle work: Hero Effects drains window.DCCMomentsPending when it
	 * starts, so either load order works, and it waits up to 3 s for us
	 * before giving our slot away. The hooks are installed later by start();
	 * until then ready() is false and play() finishes at once, which is the
	 * honest answer for an engine that has not drawn anything yet. */
	var momentHooks = null;
	var momentReg = {
		kind: 'seasons',
		ready: function () { return !!(momentHooks && momentHooks.ready()); },
		play: function (done) {
			if (momentHooks) { momentHooks.play(done); }
			else if (typeof done === 'function') { done(); }
		}
	};
	(W.DCCMomentsPending = W.DCCMomentsPending || []).push(momentReg);
	if (W.DCCMoments && typeof W.DCCMoments.register === 'function') { W.DCCMoments.register(momentReg); }

	/* The admin Theme guide reads these, so it shows exactly what plays. */
	W.DCCSeasonsEngine = { start: start, guide: {
		svgs: SVGS, pal: PAL, svgDoc: svgDoc, accents: ACCENTS, vigs: VIGS, eveningVigs: EVENING_VIGS,
		countdown: COUNTDOWN_THEME, heroArt: HERO_ART, artDraw: ART_DRAW, heron: { pose: hnPose, fly: hnFly, stand: hnStand, legs: hnLegs, bounds: hnBounds }, witch: { body: witchBody, cape: witchCape, hair: witchHair, still: witchStill, box: WITCH_BOX, capeAt: WITCH_CAPE, hairAt: WITCH_HAIR }, moon: moonPaint, heroGlyphs: HERO_GLYPHS, prims: PRIMS, sceneArt: SCENE_ART, wings: WINGS, timing: TIMING,
		target: partTargetFor, limit: specLimitAt, shares: sharesAt, subtleKit: subtleKit
	} };
})();
