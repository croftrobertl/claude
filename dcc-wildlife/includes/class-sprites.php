<?php
/**
 * Bespoke species sprite registry (v1.3.0) — flat two-tone silhouettes in
 * the site's deep-teal illustration language, replacing platform emoji.
 *
 * Every sprite is hand-drawn path data on a 48×48 canvas, shipped ONCE per
 * page as a hidden <symbol> sheet; chips and medallions reference sprites
 * with <use>, so the path payload is never duplicated. All markup here is
 * static, trusted plugin data — the same trust class as the medallion
 * scenes in widget.js.
 *
 * Palette: teals #17333c/#1c3a43/#20404a/#24464f + per-species accents
 * (white, yellow #e8b84b, greens, browns, pink). No strokes < 1.2. Each
 * sprite must read at ~22px (chip) and ~72–96px (medallion).
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Sprites {

	public const PREFIX = 'dccwl-sp-';

	/**
	 * id => symbol body (48×48 viewBox). Kept in registry order = registry().
	 *
	 * @return array<string,string>
	 */
	public static function registry(): array {
		return [
			// Low waterline pose: eye + nostril bumps above water, ridged back/tail behind.
			'alligator'  => '<rect x="1.5" y="29" width="45" height="2.4" rx="1.2" fill="#4d7d86"/><path d="M2 33.8q3-1.7 6 0" fill="none" stroke="#4d7d86" stroke-width="1.4" stroke-linecap="round"/><path d="M38 33.8q3-1.7 6 0" fill="none" stroke="#4d7d86" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 29.2 Q3 27.3 5.4 26.9 L6.1 24.7 7.9 26.5 10.4 26.2 11.1 23.8 13.2 26.1 15.8 25.9 16.6 23.9 18.4 26 Q20.4 26.2 21.2 27.3 L21.6 29.2 Z" fill="#17333c"/><path d="M22.5 29.2 23.2 26.6 Q23.8 23.6 26.4 23.3 Q29.2 23 30.1 24.9 L31 26.3 Q31.9 26.6 33 26.6 L41.6 26.7 Q43.6 26.6 44.3 25.2 Q45.6 24.4 46.3 26 Q47 27.6 46.4 29.2 Z" fill="#17333c"/><circle cx="27.2" cy="25.4" r="1.05" fill="#e8b84b"/>',
			// Rounded body, blunt snout left, paddle tail right, tiny flipper.
			'manatee'    => '<path d="M6.5 22.5 Q6.5 17.9 12 16.3 Q21.6 13.2 29.8 15.9 Q35.4 17.8 36.6 21.9 Q37 24.4 36.2 26.2 Q34.4 30.6 28.6 31.9 Q19 34 11.8 30.4 Q6.4 27.6 6.5 22.5 Z" fill="#64818b"/><path d="M35.4 20.9 Q39.4 18.6 42.6 20.1 Q45.9 21.7 45.9 24.4 Q45.9 27.1 42.6 28.4 Q39.2 29.6 35.6 26.9 Q36.9 23.9 35.4 20.9 Z" fill="#64818b"/><path d="M9.4 19.1 Q7.3 20.1 7.3 22.6 Q7.3 25.4 9.8 26.9 Q8.6 23 9.4 19.1 Z" fill="#8fa7ae"/><ellipse cx="19.4" cy="29.6" rx="3" ry="1.8" transform="rotate(24 19.4 29.6)" fill="#4d6b74"/><circle cx="12.6" cy="20.4" r="1.05" fill="#17333c"/><path d="M7.9 23.2q1.3.6 2.6.2" fill="none" stroke="#41616c" stroke-width="1.2" stroke-linecap="round"/>',
			// Sleek arched swimming pose, small ears, whisker hint, tapered tail.
			'otter'      => '<path d="M4.6 21.9 Q3.8 19.3 6.6 18.4 Q8.2 15.9 10.6 16.9 Q12.5 15.6 13.9 17.4 Q15.4 19.3 14.2 20.9 Q19.6 15.4 27 16.9 Q33.4 18.3 35.2 23.4 Q36.6 27.3 41 27.9 Q44.4 28.2 46 26.7 L46.4 28.9 Q44.4 31.3 40.2 30.7 Q33.6 29.8 31.4 24.9 Q29.2 27.9 23.6 28.2 Q15.4 28.6 11 25.4 Q6.4 24.6 4.6 21.9 Z" fill="#24464f"/><path d="M5.9 20.9 Q5.7 19.6 7.2 19.2 Q9 18.8 9.6 19.9 Q10 21.2 8.5 21.6 Q6.4 22 5.9 20.9 Z" fill="#cfdbd8"/><circle cx="10.9" cy="18.9" r="0.95" fill="#f4f7f2"/><path d="M4.4 20.2q-1.9-.3-3.2.3M4.6 21.6q-1.9.2-3 .9" fill="none" stroke="#9fb3ba" stroke-width="1.2" stroke-linecap="round"/>',
			// Domed shell with scutes, head + legs out, basking on a log.
			'turtle'     => '<rect x="4" y="33" width="40" height="3" rx="1.5" fill="#6e4a30"/><path d="M9.6 32.9 Q9.6 20.4 23 20.4 Q36.4 20.4 36.4 32.9 Z" fill="#17333c"/><path d="M17.6 21.9 Q17 27.4 17.6 32.9 M28.4 21.9 Q29 27.4 28.4 32.9 M10.9 27.4 Q23 25 35.1 27.4" fill="none" stroke="#4d7d86" stroke-width="1.5" stroke-linecap="round"/><path d="M36.2 30.4 Q40.6 30 42.4 26.4 Q44.6 26.6 44.2 29 Q43.6 32.4 39 33 L36.4 33 Z" fill="#3e7257"/><circle cx="42.9" cy="27.9" r="0.95" fill="#17333c"/><path d="M12.4 32.9 L12 35.4 Q13.4 36.4 15 35.6 L15.8 32.9 Z M29.8 32.9 L30.4 35.6 Q32 36.4 33.4 35.4 L33 32.9 Z" fill="#3e7257"/><path d="M9.8 31.4 Q7.6 31 7 32.9 L9.6 32.9 Z" fill="#3e7257"/>',
			// Gentle S-curve at the surface, banded body, head up.
			'snake'      => '<rect x="1.5" y="30" width="45" height="2.2" rx="1.1" fill="#4d7d86"/><path d="M4 30.4 Q10 26.6 16 29.8 Q22 33 28 30 Q33 27.6 37.4 28.6 Q40.4 27.9 41.4 25.2" fill="none" stroke="#17333c" stroke-width="4.6" stroke-linecap="round"/><path d="M4 30.4 Q10 26.6 16 29.8 Q22 33 28 30 Q33 27.6 37.4 28.6" fill="none" stroke="#6e8f97" stroke-width="4.6" stroke-linecap="butt" stroke-dasharray="1.9 6.4"/><path d="M39.4 25.1 Q39.4 22.3 42 22.1 Q44.7 21.9 45 23.9 Q45.2 25.7 42.7 26.1 Q40.2 26.5 39.4 25.1 Z" fill="#17333c"/><circle cx="42.9" cy="23.8" r="0.9" fill="#e8b84b"/>',
			// Largemouth bass: deep body, big jaw, dorsal spines, lateral stripe.
			'fish'       => '<path d="M16.4 18.4 18.4 14.4 20 17.6 22.2 13.9 23.8 17.2 26.2 14.4 27.4 17.6 29 16.4 30.2 19.4 16 19.9 Z" fill="#2e5d46"/><path d="M7.2 24.4 Q9.4 19.4 15.4 17.9 Q24 15.6 30.4 18.9 Q35.4 21.4 36.4 25.1 L43.4 20.4 Q44.9 23.4 43.6 26.1 Q44.9 28.7 43.4 31.4 L36.4 26.9 Q34.4 31.9 27 32.9 Q17.4 34.1 11.4 30.4 Q7.6 28.1 7.2 24.4 Z" fill="#3a6b52"/><path d="M7.2 24.4 Q8 27.9 11.4 30.1 L10.2 26.6 Q9.4 24.9 10.4 22.4 L11.4 20 Q8.4 21.9 7.2 24.4 Z" fill="#c9d8cf"/><path d="M11.4 24.9 Q24 23.4 36 25.6" fill="none" stroke="#17333c" stroke-width="2" stroke-linecap="round"/><path d="M20 32.4 22.4 35.4 24.8 32.6 Z" fill="#2e5d46"/><circle cx="12.9" cy="22.2" r="1.6" fill="#f4f7f2"/><circle cx="13.2" cy="22.2" r="0.85" fill="#17333c"/>',
			// Bald eagle perched: WHITE head + tail, dark body, yellow hooked beak.
			'eagle'      => '<rect x="8" y="41" width="32" height="2.6" rx="1.3" fill="#6e4a30"/><path d="M14.4 17.4 Q13.6 11.9 18.6 10.4 Q23.4 9 25.6 12.9 Q26.6 14.6 26.2 16.9 L27.4 24.4 Q28.2 30.4 26.4 35.4 L24.4 40.9 17.4 40.9 Q14.6 33.9 14.8 26.4 Z" fill="#17333c"/><path d="M20.9 19.9 Q26.1 23.4 26.4 30.4 Q26.5 35.4 24.2 39.4 L22.4 39.4 Q25.2 33.9 24.4 27.4 Q23.8 22.9 20.9 20.9 Z" fill="#20404a"/><path d="M15.2 16.4 Q13.9 11.4 18.8 10.2 Q23.6 9.2 25.2 13.1 Q26.2 15.6 24.6 17.4 Q22.4 19.4 19 18.9 Q16 18.4 15.2 16.4 Z" fill="#f4f7f2"/><path d="M16.2 12.9 Q13 12.9 12.2 14.7 Q11.9 15.5 12.7 15.7 Q12.2 16.9 13.5 17.3 Q15.6 17.9 16.8 16.7 Q15.4 14.9 16.2 12.9 Z" fill="#e8b84b"/><circle cx="19.4" cy="13.4" r="1.1" fill="#17333c"/><path d="M24.4 40.9 L31.2 36.2 32.6 40.9 Z" fill="#f4f7f2"/><path d="M17.9 40.9 17.9 43.4 M21.9 40.9 21.9 43.4" stroke="#e8b84b" stroke-width="1.7" stroke-linecap="round"/>',
			// Osprey hovering: wings up in an M, pale underside, dark eye-stripe.
			'osprey'     => '<path d="M23.9 26.4 Q18.4 19.4 12.4 16.6 Q6.4 13.9 2.4 16.4 Q7.4 17.2 9.9 21.2 Q12.9 26.2 18.9 27.4 Z" fill="#17333c"/><path d="M24.1 26.4 Q29.6 19.4 35.6 16.6 Q41.6 13.9 45.6 16.4 Q40.6 17.2 38.1 21.2 Q35.1 26.2 29.1 27.4 Z" fill="#17333c"/><path d="M21.4 24.9 Q20.9 20.6 24 20.4 Q27.1 20.6 26.6 24.9 Q26.2 28.4 26.9 31.4 L24 33.2 21.1 31.4 Q21.8 28.4 21.4 24.9 Z" fill="#f4f7f2"/><path d="M20.9 33.4 24 31.6 27.1 33.4 26.4 37.4 Q24 38.9 21.6 37.4 Z" fill="#e6ebe4"/><path d="M20.9 33.4 Q23.9 34.9 27.1 33.4 L27.6 35.4 Q24 37.1 20.4 35.4 Z" fill="#20404a"/><circle cx="24" cy="18.4" r="3.1" fill="#f4f7f2"/><path d="M20.9 18.3 Q24 17.4 27.1 18.3" fill="none" stroke="#17333c" stroke-width="1.8" stroke-linecap="round"/><path d="M24 20.9 23.1 22.2 24.9 22.2 Z" fill="#e8b84b"/>',
			// Anhinga: signature wings-spread drying pose on a snag, thin neck, pointed bill.
			'anhinga'    => '<path d="M23 34.4 24.9 34.4 25.4 43.4 Q24.1 44.1 22.6 43.4 Z" fill="#6e4a30"/><path d="M18.6 43 Q21.4 41.4 22.9 38.9" fill="none" stroke="#6e4a30" stroke-width="1.7" stroke-linecap="round"/><path d="M22.4 28.4 Q14.4 29.9 6.4 28.1 Q3.2 27.4 1.6 25.6 L4.9 25.9 3.4 24.4 6.9 24.6 5.6 22.9 Q13.9 23.4 22.4 25.4 Z" fill="#17333c"/><path d="M25.6 28.4 Q33.6 29.9 41.6 28.1 Q44.8 27.4 46.4 25.6 L43.1 25.9 44.6 24.4 41.1 24.6 42.4 22.9 Q34.1 23.4 25.6 25.4 Z" fill="#17333c"/><path d="M6.4 26.6 Q13 26 19 26.9 M42 26.6 Q35.4 26 29.4 26.9" fill="none" stroke="#9fb3ba" stroke-width="1.2" stroke-linecap="round"/><path d="M20.9 26.1 Q20.9 22.9 24 22.9 Q27.1 22.9 27.1 26.4 Q27.1 30.9 25.6 34.6 L22.4 34.6 Q20.9 30.4 20.9 26.1 Z" fill="#20404a"/><path d="M25.4 34.4 Q27.9 37.9 26.9 41.9" fill="none" stroke="#20404a" stroke-width="2" stroke-linecap="round"/><path d="M23.4 23.4 Q21.4 19.9 23.4 16.6 Q25.2 13.9 24.4 11.4" fill="none" stroke="#20404a" stroke-width="2.2" stroke-linecap="round"/><path d="M24.6 11.9 28.9 8.4 25.9 9.9 24.1 10.1 Z" fill="#e8b84b"/><circle cx="24.4" cy="10.9" r="0.8" fill="#17333c"/>',
			// Great Blue Heron: S-neck, black crown plume, dagger beak.
			'heron'      => '<path d="M6 43.6q4-1.9 8 0M30 43.6q4-1.9 8 0" fill="none" stroke="#4d7d86" stroke-width="1.4" stroke-linecap="round"/><path d="M20.4 28.4 20 41.9 M24.6 28.9 25.9 36.4 25.4 41.9" fill="none" stroke="#3d4f46" stroke-width="1.7" stroke-linecap="round"/><path d="M18 41.9 22.4 41.9 M23.4 41.9 27.6 41.9" stroke="#3d4f46" stroke-width="1.5" stroke-linecap="round"/><path d="M13.6 25.6 Q15.4 20.9 21.4 20.6 Q28.4 20.4 32.9 22.4 Q36.9 24.1 36.4 26.6 Q33.4 30.9 26.4 31.1 Q17.9 31.4 14.9 28.6 Q13.1 27.1 13.6 25.6 Z" fill="#5a7d8a"/><path d="M22.4 20.9 Q30.4 20.6 34.9 23.1 L37.4 24.9 Q39.4 25.4 38.9 23.9 Q37.9 21.4 33.9 20.1 Q27.9 18.1 22.4 20.9 Z" fill="#24464f"/><path d="M16.6 27.9 Q23.9 30.4 31.9 28.9" fill="none" stroke="#24464f" stroke-width="1.4" stroke-linecap="round"/><path d="M13.9 10.3 Q16.9 12.6 15.9 16.4 Q15 19.9 17.4 23.4" fill="none" stroke="#8fa7ae" stroke-width="2.6" stroke-linecap="round"/><path d="M16.9 20.9 15.4 23.4 M18.6 22.6 17.4 24.9" stroke="#8fa7ae" stroke-width="1.2" stroke-linecap="round"/><path d="M10.9 6.4 Q12.4 4.9 14.9 5.6 Q16.9 6.3 16.6 8.3 Q16.4 10.1 14.1 10.4 Q11.6 10.6 10.7 8.9 Z" fill="#f4f7f2"/><path d="M11.2 7.1 2.6 5.9 11 8.9 Q11.6 8.1 11.2 7.1 Z" fill="#e8b84b"/><path d="M11.6 5.7 Q14.6 4.2 16.9 5.7 Q19.1 7.1 21.6 6.6" fill="none" stroke="#17333c" stroke-width="1.6" stroke-linecap="round"/><circle cx="13.2" cy="7.4" r="0.9" fill="#17333c"/>',
			// Snowy egret: white bird, black legs, YELLOW feet, fine plumes.
			'egret'      => '<path d="M8 43.6q4-1.9 8 0M28 43.6q4-1.9 8 0" fill="none" stroke="#4d7d86" stroke-width="1.4" stroke-linecap="round"/><path d="M21.4 30.4 20.9 41.4 M25.4 30.9 26.6 36.4 26.1 41.4" fill="none" stroke="#17333c" stroke-width="1.6" stroke-linecap="round"/><path d="M18.9 41.6 Q20.9 40.6 23.1 41.6 M24.1 41.6 Q26.1 40.6 28.4 41.6" fill="none" stroke="#e8b84b" stroke-width="2" stroke-linecap="round"/><path d="M15.9 26.9 Q17.4 22.9 23 22.6 Q29.4 22.4 33.4 24.4 Q36.6 26.1 35.9 28.1 Q33.4 31.9 26.4 32.1 Q18.9 32.4 16.4 29.6 Q15.4 28.4 15.9 26.9 Z" fill="#eef2ee"/><path d="M32.4 23.9 Q36.4 22.4 38.9 23.4 Q36.9 24.9 35.4 26.9" fill="none" stroke="#cfdbd8" stroke-width="1.6" stroke-linecap="round"/><path d="M16.4 12.4 Q18.6 14.9 17.7 18.4 Q16.9 21.4 18.9 24.4" fill="none" stroke="#eef2ee" stroke-width="2.4" stroke-linecap="round"/><path d="M13.9 8.6 Q15.4 7.1 17.7 7.8 Q19.6 8.5 19.3 10.4 Q19.1 12.1 16.9 12.4 Q14.6 12.6 13.7 11.1 Z" fill="#eef2ee"/><path d="M14.2 9.2 5.9 8.2 14 10.9 Q14.6 10.1 14.2 9.2 Z" fill="#17333c"/><path d="M17.4 7.4 Q20.1 6.1 22.4 6.7 M17.9 9.1 20.9 8.9" fill="none" stroke="#cfdbd8" stroke-width="1.3" stroke-linecap="round"/><circle cx="16.2" cy="9.4" r="0.85" fill="#17333c"/>',
			// Belted kingfisher: big crested head, stout bill, banded chest, perched.
			'kingfisher' => '<rect x="10" y="39.4" width="28" height="2.6" rx="1.3" fill="#6e4a30"/><path d="M22.9 39.4 Q19.4 36.9 19.4 32.4 L19.9 25.9 28.9 25.9 29.4 32.4 Q29.4 36.9 25.9 39.4 Z" fill="#eef2ee"/><path d="M19.7 28.4 Q24.4 30.4 29.1 28.4 L29.3 31.4 Q24.4 33.4 19.6 31.4 Z" fill="#4a7386"/><path d="M27.4 27.4 Q31.9 29.9 31.4 35.4 Q30.9 38.4 28.4 39.6 Q30.9 34.4 27.9 28.9 Z" fill="#4a7386"/><path d="M18.9 26.4 Q17.4 20.6 21.9 17.9 L20.9 14.9 23.4 16.6 24.4 13.4 25.9 16.4 28.9 14.6 27.9 17.9 Q32.4 20.4 31.4 25.4 Q30.4 27.9 27.4 28.4 L21.4 28.4 Q19.4 27.9 18.9 26.4 Z" fill="#4a7386"/><path d="M20.4 21.4 12.4 23.9 20.6 24.6 Z" fill="#17333c"/><circle cx="23.4" cy="20.6" r="1.2" fill="#f4f7f2"/><circle cx="23.6" cy="20.6" r="0.7" fill="#17333c"/><path d="M20.4 39.4 20.4 41.4 M25.4 39.4 25.4 41.4" stroke="#17333c" stroke-width="1.4" stroke-linecap="round"/>',
			// Bald cypress: feathery conical crown, fluted trunk, knees at the waterline.
			'cypress'    => '<rect x="1.5" y="38.4" width="45" height="2.2" rx="1.1" fill="#4d7d86"/><path d="M22.4 38.6 Q23.1 26.4 22.6 14.4 L25.4 14.4 Q24.9 26.4 25.6 38.6 Q26.9 40.4 28.4 41.4 L19.6 41.4 Q21.1 40.4 22.4 38.6 Z" fill="#6e4a30"/><path d="M24 2.9 28.4 9.4 26.4 8.9 30.4 15.4 27.9 14.6 32.4 21.9 28.9 20.9 33.4 28.4 24 26.6 14.6 28.4 19.1 20.9 15.6 21.9 20.1 14.6 17.6 15.4 21.6 8.9 19.6 9.4 Z" fill="#2e5d46"/><path d="M24 6.4 26.9 11.4 24 10.4 21.1 11.4 Z M24 13.4 27.9 19.4 24 17.9 20.1 19.4 Z M24 20.9 28.4 26.1 24 24.6 19.6 26.1 Z" fill="#3e7257"/><path d="M12.4 35.4 Q13.4 33.4 14.4 35.4 L14.6 38.4 12.2 38.4 Z M33.4 34.9 Q34.6 32.6 35.8 34.9 L36 38.4 33.2 38.4 Z M16.9 36.4 Q17.7 34.9 18.5 36.4 L18.7 38.4 16.7 38.4 Z" fill="#6e4a30"/>',
			// Spanish moss: gray-green wisps draped from a branch fragment.
			'moss'       => '<path d="M4 11.4 44 7.4" fill="none" stroke="#6e4a30" stroke-width="3" stroke-linecap="round"/><path d="M31 8.9 40.4 15.4" fill="none" stroke="#6e4a30" stroke-width="2.2" stroke-linecap="round"/><path d="M10.4 11.1 Q8.6 15.9 10.6 20.4 Q12.4 24.4 10.6 28.9" fill="none" stroke="#7f9789" stroke-width="1.9" stroke-linecap="round"/><path d="M16.4 10.6 Q14.6 16.4 16.6 22.4 Q18.4 27.9 16.4 33.9 Q15.4 36.9 16.9 39.4" fill="none" stroke="#9db3a5" stroke-width="1.9" stroke-linecap="round"/><path d="M22.4 10.1 Q20.6 15.4 22.4 20.9 Q24.2 26.4 22.4 31.9" fill="none" stroke="#7f9789" stroke-width="1.9" stroke-linecap="round"/><path d="M28.4 9.4 Q26.6 15.9 28.6 22.9 Q30.4 29.4 28.4 36.4" fill="none" stroke="#9db3a5" stroke-width="1.9" stroke-linecap="round"/><path d="M35.4 12.6 Q33.9 17.4 35.6 22.4 Q37.2 26.9 35.6 31.4" fill="none" stroke="#7f9789" stroke-width="1.9" stroke-linecap="round"/><path d="M40.6 15.9 Q39.4 19.9 40.8 24.4" fill="none" stroke="#9db3a5" stroke-width="1.7" stroke-linecap="round"/>',
			// Resurrection fern: curled fronds carpeting a horizontal limb.
			'fern'       => '<path d="M3.4 35.9 Q24 31.4 44.6 33.4" fill="none" stroke="#6e4a30" stroke-width="3.4" stroke-linecap="round"/><path d="M13.4 33.9 Q11.4 26.4 15.9 20.9" fill="none" stroke="#3e7257" stroke-width="1.7" stroke-linecap="round"/><path d="M12.6 31.4 9.9 30.6 M12.2 28.9 9.7 27.7 M12.6 26.4 10.4 24.9 M13.6 23.9 11.9 22.2 M13.7 31.9 16.2 31.9 M13.2 29.4 15.9 28.9 M13.6 26.7 16.1 25.9 M14.6 24.2 16.6 23.1" stroke="#3e7257" stroke-width="1.4" stroke-linecap="round"/><path d="M23.4 32.9 Q23.4 24.4 29.4 19.9" fill="none" stroke="#2e7d5b" stroke-width="1.7" stroke-linecap="round"/><path d="M22.6 30.4 19.9 29.6 M22.7 27.7 20.2 26.4 M23.6 25.1 21.4 23.4 M25.1 22.6 23.4 20.9 M24.2 30.9 26.9 30.9 M24 28.2 26.7 27.7 M24.9 25.6 27.4 24.9 M26.4 22.9 28.6 22.1" stroke="#2e7d5b" stroke-width="1.4" stroke-linecap="round"/><path d="M34.4 32.4 Q36.4 26.4 41.4 24.9 Q44.6 24.1 44.9 26.4 Q45.1 28.4 43.1 28.3 Q41.6 28.2 41.9 26.7" fill="none" stroke="#3e7257" stroke-width="1.7" stroke-linecap="round"/><path d="M35.6 29.9 33.4 28.9 M37.1 27.6 35.4 26.2" stroke="#3e7257" stroke-width="1.4" stroke-linecap="round"/><path d="M7.4 34.9 Q6.4 30.9 8.9 27.9" fill="none" stroke="#2e7d5b" stroke-width="1.6" stroke-linecap="round"/><path d="M7.2 32.4 5.2 31.6 M7.2 30.2 5.4 28.9 M8 32.9 10 32.9 M7.7 30.4 9.9 29.9" stroke="#2e7d5b" stroke-width="1.3" stroke-linecap="round"/>',
			// Water lily: notched pad + pink bloom at the waterline.
			'lily'       => '<rect x="1.5" y="35.4" width="45" height="2.2" rx="1.1" fill="#4d7d86"/><path d="M18.9 35.2 30.4 32.4 A12.6 4.6 0 1 0 30.4 38.2 Z" fill="#2e7d5b"/><path d="M9.4 34.6 Q14.9 32.6 20.9 33.1 M10.4 36.6 Q15.4 35.8 19.4 36.2" fill="none" stroke="#3f9270" stroke-width="1.3" stroke-linecap="round"/><path d="M35.9 34.9 Q32.9 30.9 34.9 25.9 Q36.9 29.4 35.9 34.9 Z" fill="#f2b8c6"/><path d="M40.1 34.9 Q43.1 30.9 41.1 25.9 Q39.1 29.4 40.1 34.9 Z" fill="#f2b8c6"/><path d="M38 34.6 Q35.4 28.9 38 22.9 Q40.6 28.9 38 34.6 Z" fill="#fbe3ea"/><path d="M32.9 35.2 Q34.4 31.6 33.2 28.4 Q36.4 31.4 35.4 35.2 Z" fill="#fbe3ea"/><path d="M43.1 35.2 Q41.6 31.6 42.8 28.4 Q39.6 31.4 40.6 35.2 Z" fill="#fbe3ea"/><circle cx="38" cy="33.9" r="1.35" fill="#e8b84b"/>',
			// Saw palmetto: fan of pointed fronds from a low base.
			'palmetto'   => '<path d="M21.9 43.4 Q20.9 39.9 17.9 38.4 L30.1 38.4 Q27.1 39.9 26.1 43.4 Z" fill="#6e4a30"/><path d="M24 38.9 22.4 12.4 25.6 12.4 Z" fill="#2e7d5b"/><path d="M23.4 38.9 12.9 14.9 15.9 13.6 24.6 37.9 Z" fill="#3e7257"/><path d="M24.6 38.9 35.1 14.9 32.1 13.6 23.4 37.9 Z" fill="#3e7257"/><path d="M22.9 38.9 6.9 22.4 8.9 19.9 24 37.4 Z" fill="#2e7d5b"/><path d="M25.1 38.9 41.1 22.4 39.1 19.9 24 37.4 Z" fill="#2e7d5b"/><path d="M22.6 38.9 3.4 31.4 4.4 28.4 23.4 37.6 Z" fill="#3e7257"/><path d="M25.4 38.9 44.6 31.4 43.6 28.4 24.6 37.6 Z" fill="#3e7257"/>',
		];
	}

	public static function has( string $id ): bool {
		$registry = self::registry();
		return isset( $registry[ $id ] );
	}

	/**
	 * The hidden <symbol> sheet — printed once per page; every sprite path
	 * ships exactly once and all usages reference it via <use>.
	 *
	 * Bodies are minified on the way out: `fill="none"` and
	 * `stroke-linecap="round"` are stripped because the CSS sets both on
	 * the referencing .dccwl-*-sprite elements and they inherit into the
	 * <use> shadow content (explicit fill attributes still win). Keep the
	 * registry source readable; keep that CSS rule — it is load-bearing.
	 */
	public static function symbol_sheet(): string {
		// No xmlns: the sheet is emitted into an HTML document, where the
		// parser namespaces <svg> automatically.
		$out = '<svg class="dccwl-sprite-sheet" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;overflow:hidden">';
		foreach ( self::registry() as $id => $body ) {
			$body = str_replace( [ ' fill="none"', ' stroke-linecap="round"' ], '', $body );
			$body = (string) preg_replace( '/ ([A-Z])(?=[\d.])/', '$1', $body );
			// Snap decimals to the nearest 0.5 unit (0.25px at 96px render —
			// invisible) and shed the fraction where it lands on an integer.
			// Only numbers at a clean token boundary are touched: preceded by
			// a delimiter or an UPPERCASE command and not followed by another
			// number's leading dot. Compact lowercase segments like
			// `q1.3.6 2.6.2` (four numbers) are left verbatim — naive digit
			// matching would span across their boundaries and corrupt them.
			$body = (string) preg_replace_callback(
				'/(?<=[\s",(MLQACHVTSZ])\d+\.\d+(?![\d.])/',
				static function ( array $m ): string {
					$v = round( (float) $m[0] * 2 ) / 2;
					return rtrim( rtrim( number_format( $v, 1, '.', '' ), '0' ), '.' );
				},
				$body
			);
			$out .= '<symbol id="' . esc_attr( self::PREFIX . $id ) . '" viewBox="0 0 48 48">' . $body . '</symbol>';
		}
		return $out . '</svg>';
	}

	/**
	 * An inline <use> reference to one sprite. Decoration only — species
	 * names remain the accessible text.
	 */
	public static function use_svg( string $id, string $class ): string {
		$ref = '#' . self::PREFIX . $id;
		return '<svg class="' . esc_attr( $class ) . '" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="' . esc_attr( $ref ) . '" xlink:href="' . esc_attr( $ref ) . '"/></svg>';
	}
}
