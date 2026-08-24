/**
 * DCC Wildlife — front-end behavior. Vanilla JS, no jQuery.
 *
 * The month shown is chosen HERE from the visitor's local date (never baked
 * into cached HTML by PHP). All dynamic text is inserted via textContent —
 * nothing user-submitted is ever parsed as HTML.
 */
(function () {
	'use strict';

	var CFG = window.DCC_WL_CFG;
	if (!CFG || !Array.isArray(CFG.species)) {
		return;
	}

	var speciesById = {};
	CFG.species.forEach(function (s) {
		speciesById[s.id] = s;
	});

	function el(tag, cls, text) {
		var node = document.createElement(tag);
		if (cls) {
			node.className = cls;
		}
		if (text !== undefined && text !== null) {
			node.textContent = text;
		}
		return node;
	}

	function todayLocal() {
		// Local components, NOT toISOString() (that would be UTC).
		var d = new Date();
		var mm = String(d.getMonth() + 1).padStart(2, '0');
		var dd = String(d.getDate()).padStart(2, '0');
		return d.getFullYear() + '-' + mm + '-' + dd;
	}

	function post(action, fields) {
		var body = new FormData();
		body.append('action', action);
		Object.keys(fields || {}).forEach(function (k) {
			body.append(k, fields[k]);
		});
		return window.fetch(CFG.ajaxUrl, {
			method: 'POST',
			credentials: 'same-origin',
			body: body
		}).then(function (res) {
			return res.json();
		});
	}

	/* ------------------------------------------------------------------
	 * Spotlight + month browser
	 * ---------------------------------------------------------------- */

	function speciesForMonth(month) {
		return CFG.species
			.map(function (s, i) {
				return { s: s, v: (s.months && s.months[month]) || 0, i: i };
			})
			.filter(function (x) {
				return x.v >= 2;
			})
			.sort(function (a, b) {
				if (b.v !== a.v) {
					return b.v - a.v;
				}
				// The heron (our mascot) leads among ties.
				var am = a.s.mascot ? 1 : 0;
				var bm = b.s.mascot ? 1 : 0;
				if (bm !== am) {
					return bm - am;
				}
				return a.i - b.i;
			});
	}

	function buildCard(s, isPeak) {
		var li = el('li', 'dccwl-card');
		var head = el('div', 'dccwl-card-head');
		var emoji = el('span', 'dccwl-emoji', s.emoji);
		emoji.setAttribute('aria-hidden', 'true');
		head.appendChild(emoji);
		head.appendChild(el('span', 'dccwl-name', s.name));
		if (s.mascot) {
			head.appendChild(el('span', 'dccwl-badge dccwl-badge-mascot', CFG.i18n.mascot));
		}
		if (isPeak) {
			head.appendChild(el('span', 'dccwl-badge dccwl-badge-peak', CFG.i18n.peak));
		}
		li.appendChild(head);
		li.appendChild(el('p', 'dccwl-fact', s.fact));
		var meta = el('p', 'dccwl-cardmeta');
		meta.appendChild(el('span', 'dccwl-pill dccwl-pill-best', s.best));
		li.appendChild(meta);
		li.appendChild(el('p', 'dccwl-where', CFG.i18n.where + ' ' + s.where));
		return li;
	}

	function renderSpotlight(root, month) {
		var list = root.querySelector('.dccwl-spotlight-cards');
		if (!list) {
			return;
		}
		list.textContent = '';
		var entries = speciesForMonth(month);
		if (!entries.length) {
			var empty = el('li', 'dccwl-empty', CFG.i18n.noSpotlight);
			list.appendChild(empty);
			return;
		}
		entries.forEach(function (x) {
			list.appendChild(buildCard(x.s, x.v >= 3));
		});
	}

	function buildMonthBrowser(root, state) {
		var wrap = root.querySelector('.dccwl-months');
		if (!wrap) {
			return;
		}
		CFG.months.forEach(function (abbrev, m) {
			var btn = el('button', 'dccwl-month-btn', abbrev);
			btn.type = 'button';
			btn.setAttribute('aria-label', CFG.monthsFull[m] || abbrev);
			btn.setAttribute('aria-pressed', m === state.month ? 'true' : 'false');
			btn.addEventListener('click', function () {
				state.month = m;
				wrap.querySelectorAll('.dccwl-month-btn').forEach(function (b, i) {
					b.setAttribute('aria-pressed', i === m ? 'true' : 'false');
				});
				renderSpotlight(root, m);
			});
			wrap.appendChild(btn);
		});
		wrap.hidden = false;
	}

	/* ------------------------------------------------------------------
	 * Sightings
	 * ---------------------------------------------------------------- */

	function renderRecent(root, items) {
		var list = root.querySelector('.dccwl-sightings-list');
		if (!list) {
			return;
		}
		list.textContent = '';
		if (!items.length) {
			list.appendChild(el('li', 'dccwl-empty', CFG.i18n.noSightings));
			return;
		}
		items.forEach(function (it) {
			var s = speciesById[it.species];
			if (!s) {
				return;
			}
			var li = el('li', 'dccwl-sighting');
			var head = el('div', 'dccwl-sighting-head');
			var emoji = el('span', 'dccwl-emoji', s.emoji);
			emoji.setAttribute('aria-hidden', 'true');
			head.appendChild(emoji);
			head.appendChild(el('span', 'dccwl-name', s.name));
			head.appendChild(el('span', 'dccwl-sighting-date', String(it.date || '')));
			li.appendChild(head);
			if (it.note) {
				li.appendChild(el('p', 'dccwl-sighting-note', String(it.note)));
			}
			if (it.name) {
				li.appendChild(el('p', 'dccwl-sighting-name', '— ' + String(it.name)));
			}
			list.appendChild(li);
		});
	}

	function loadRecent(root) {
		post('dcc_wl_recent', {}).then(function (res) {
			if (res && res.success && res.data && Array.isArray(res.data.items)) {
				renderRecent(root, res.data.items);
			}
		}).catch(function () { /* leave the list as-is */ });
	}

	function field(labelText, control, id) {
		var p = el('p', 'dccwl-field');
		var label = el('label', 'dccwl-label', labelText);
		label.setAttribute('for', id);
		control.id = id;
		p.appendChild(label);
		p.appendChild(control);
		return p;
	}

	var formUid = 0;

	function buildForm(root, slot) {
		var openedAt = Date.now();
		var uid = 'dccwl-f' + (formUid += 1);
		var form = el('form', 'dccwl-form');

		var select = el('select', 'dccwl-input');
		select.name = 'dcc_wl_species';
		select.required = true;
		var placeholder = el('option', null, CFG.i18n.choose);
		placeholder.value = '';
		select.appendChild(placeholder);
		CFG.species.forEach(function (s) {
			var opt = el('option', null, s.emoji + ' ' + s.name);
			opt.value = s.id;
			select.appendChild(opt);
		});
		form.appendChild(field(CFG.i18n.species, select, uid + '-species'));

		var date = el('input', 'dccwl-input');
		date.type = 'date';
		date.name = 'dcc_wl_date';
		date.required = true;
		date.value = todayLocal();
		date.max = todayLocal();
		form.appendChild(field(CFG.i18n.date, date, uid + '-date'));

		var note = el('textarea', 'dccwl-input');
		note.name = 'dcc_wl_note';
		note.rows = 3;
		note.maxLength = CFG.maxNote || 200;
		note.placeholder = CFG.i18n.notePh;
		form.appendChild(field(CFG.i18n.note, note, uid + '-note'));

		var name = el('input', 'dccwl-input');
		name.type = 'text';
		name.name = 'dcc_wl_name';
		name.maxLength = CFG.maxName || 50;
		name.autocomplete = 'given-name';
		form.appendChild(field(CFG.i18n.firstName, name, uid + '-name'));

		// Honeypot — visually hidden, real guests never fill it.
		var hp = el('p', 'dccwl-hp');
		hp.setAttribute('aria-hidden', 'true');
		var hpInput = el('input');
		hpInput.type = 'text';
		hpInput.name = 'dccwl_website';
		hpInput.tabIndex = -1;
		hpInput.autocomplete = 'off';
		hp.appendChild(hpInput);
		form.appendChild(hp);

		var actions = el('p', 'dccwl-form-actions');
		var submit = el('button', 'dccwl-btn', CFG.i18n.submit);
		submit.type = 'submit';
		actions.appendChild(submit);
		var cancel = el('button', 'dccwl-btn dccwl-btn-quiet', CFG.i18n.cancel);
		cancel.type = 'button';
		cancel.addEventListener('click', function () {
			slot.textContent = '';
		});
		actions.appendChild(cancel);
		form.appendChild(actions);

		var msg = el('p', 'dccwl-form-msg');
		msg.setAttribute('role', 'alert');
		msg.hidden = true;
		form.appendChild(msg);

		form.addEventListener('submit', function (e) {
			e.preventDefault();
			msg.hidden = true;
			submit.disabled = true;
			submit.textContent = CFG.i18n.sending;

			post('dcc_wl_submit', {
				dcc_wl_species: select.value,
				dcc_wl_date: date.value,
				dcc_wl_note: note.value,
				dcc_wl_name: name.value,
				dccwl_website: hpInput.value,
				dcc_wl_t: String(Date.now() - openedAt)
			}).then(function (res) {
				if (res && res.success) {
					var thanks = el('p', 'dccwl-form-msg dccwl-form-msg-ok',
						(res.data && res.data.message) || '');
					thanks.setAttribute('role', 'status');
					slot.textContent = '';
					slot.appendChild(thanks);
					loadRecent(root);
				} else {
					msg.textContent = (res && res.data && res.data.message) || CFG.i18n.genericErr;
					msg.hidden = false;
					submit.disabled = false;
					submit.textContent = CFG.i18n.submit;
				}
			}).catch(function () {
				msg.textContent = CFG.i18n.genericErr;
				msg.hidden = false;
				submit.disabled = false;
				submit.textContent = CFG.i18n.submit;
			});
		});

		return form;
	}

	function initSightings(root) {
		var section = root.querySelector('.dccwl-sightings');
		if (!section || !CFG.sightings) {
			return;
		}
		section.hidden = false;
		loadRecent(root);

		var btn = section.querySelector('.dccwl-log-btn');
		var slot = section.querySelector('.dccwl-form-slot');
		if (btn && slot) {
			btn.addEventListener('click', function () {
				if (slot.querySelector('form')) {
					return;
				}
				slot.textContent = '';
				var form = buildForm(root, slot);
				slot.appendChild(form);
				var first = form.querySelector('select');
				if (first) {
					first.focus();
				}
			});
		}
	}

	/* ------------------------------------------------------------------
	 * Init
	 * ---------------------------------------------------------------- */

	function initRoot(root) {
		if (root.getAttribute('data-dccwl-init')) {
			return;
		}
		root.setAttribute('data-dccwl-init', '1');

		var instance = {};
		try {
			instance = JSON.parse(root.getAttribute('data-dccwl') || '{}');
		} catch (err) {
			instance = {};
		}

		var state = { month: new Date().getMonth() };
		renderSpotlight(root, state.month);
		if (instance.browser) {
			buildMonthBrowser(root, state);
		}
		if (instance.sightings) {
			initSightings(root);
		}
	}

	function initAll() {
		document.querySelectorAll('.dccwl-root').forEach(initRoot);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initAll);
	} else {
		initAll();
	}

	// Elementor editor/preview renders widgets after page load.
	window.addEventListener('elementor/frontend/init', function () {
		if (window.elementorFrontend && window.elementorFrontend.hooks) {
			window.elementorFrontend.hooks.addAction(
				'frontend/element_ready/dccwl_month.default',
				function ($scope) {
					var scope = $scope && $scope[0] ? $scope[0] : $scope;
					if (scope && scope.querySelectorAll) {
						scope.querySelectorAll('.dccwl-root').forEach(initRoot);
					}
				}
			);
		}
	});
})();
