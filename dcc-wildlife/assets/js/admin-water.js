/**
 * DCC Wildlife — admin helpers for Settings → DCC Water.
 *
 * Two jobs: clone repeatable rows, and run USGS gauge discovery so the
 * owner picks site IDs from live results instead of typing a remembered
 * number. Discovery runs against the real USGS site service from the live
 * server; if it cannot be reached, nothing is changed and the owner is told.
 */
(function () {
	'use strict';

	var CFG = window.DCC_WL_WATER_ADMIN || {};
	var I18N = CFG.i18n || {};

	/* ---- repeatable rows ---- */
	function nextIndex(tbody) {
		var max = -1;
		tbody.querySelectorAll('[name]').forEach(function (input) {
			var m = /\[(\d+)\]/.exec(input.getAttribute('name') || '');
			if (m) { max = Math.max(max, parseInt(m[1], 10)); }
		});
		return max + 1;
	}

	function addRow(tableId) {
		var table = document.getElementById(tableId);
		if (!table) { return; }
		var tbody = table.querySelector('tbody');
		var last = tbody && tbody.lastElementChild;
		if (!tbody || !last) { return; }

		var clone = last.cloneNode(true);
		var idx = nextIndex(tbody);
		clone.querySelectorAll('[name]').forEach(function (input) {
			input.setAttribute('name', input.getAttribute('name').replace(/\[\d+\]/, '[' + idx + ']'));
			if (input.tagName === 'SELECT') { input.selectedIndex = 0; } else { input.value = ''; }
		});
		tbody.appendChild(clone);
	}

	document.addEventListener('click', function (e) {
		var btn = e.target.closest ? e.target.closest('.dccwl-add-row') : null;
		if (btn) {
			e.preventDefault();
			addRow(btn.getAttribute('data-target'));
		}
	});

	/* ---- USGS gauge discovery ---- */
	function appendSite(siteNo) {
		var box = document.getElementById('dccwl-sites');
		if (!box) { return; }
		var have = box.value.split(/[\s,]+/).filter(Boolean);
		if (have.indexOf(siteNo) === -1) {
			have.push(siteNo);
			box.value = have.join('\n');
		}
	}

	function renderResults(sites) {
		var wrap = document.getElementById('dccwl-discover-results');
		if (!wrap) { return; }
		wrap.textContent = '';

		var table = document.createElement('table');
		table.className = 'widefat striped';
		table.style.marginTop = '8px';
		var tbody = document.createElement('tbody');

		sites.forEach(function (s) {
			var tr = document.createElement('tr');

			var tdName = document.createElement('td');
			tdName.textContent = s.station_nm || '';
			tr.appendChild(tdName);

			var tdNo = document.createElement('td');
			tdNo.style.width = '120px';
			var code = document.createElement('code');
			code.textContent = s.site_no || '';
			tdNo.appendChild(code);
			tr.appendChild(tdNo);

			var tdBtn = document.createElement('td');
			tdBtn.style.width = '130px';
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'button button-small';
			b.textContent = I18N.add || 'Use this gauge';
			b.addEventListener('click', function () { appendSite(s.site_no || ''); });
			tdBtn.appendChild(b);
			tr.appendChild(tdBtn);

			tbody.appendChild(tr);
		});

		table.appendChild(tbody);
		wrap.appendChild(table);
	}

	/* ---- Water Atlas clarity probe ----
	 * The endpoint path was never verified at build time, so rather than
	 * guessing a URL in code the owner pastes one and this reports exactly
	 * what came back from the live API. */
	var clarityBtn = document.getElementById('dccwl-test-clarity');
	if (clarityBtn && CFG.clarity) {
		clarityBtn.addEventListener('click', function () {
			var status = document.getElementById('dccwl-clarity-status');
			if (status) { status.textContent = I18N.testing || ''; }

			window.fetch(CFG.clarity, {
				credentials: 'same-origin',
				headers: { 'X-WP-Nonce': CFG.nonce || '' }
			})
				.then(function (r) { return r.json(); })
				.then(function (d) {
					if (!status) { return; }
					if (!d || !d.ok) {
						status.textContent = (d && d.reason) ? d.reason : (I18N.clarityBad || '');
						status.style.color = '#a4332a';
						return;
					}
					var age = (typeof d.ageDays === 'number') ? d.ageDays : '?';
					var how = d.asCurrent ? 'shown as a current condition'
						: (d.wouldShow ? 'shown as "most recent known reading"' : 'too old — would be dropped');
					status.textContent = 'Found ' + d.value + ' ft dated ' + d.date +
						' (' + age + ' days old) — ' + how + '.';
					status.style.color = d.wouldShow ? '#1d6b47' : '#a4332a';
				})
				.catch(function () {
					if (status) {
						status.textContent = I18N.failed || '';
						status.style.color = '#a4332a';
					}
				});
		});
	}

	var btn = document.getElementById('dccwl-discover');
	if (btn && CFG.discover) {
		btn.addEventListener('click', function () {
			var status = document.getElementById('dccwl-discover-status');
			var lat = document.getElementById('dccwl-lat');
			var lon = document.getElementById('dccwl-lon');

			// Discovery needs SAVED coordinates: the lookup happens server-side.
			if (!lat || !lon || !lat.value.trim() || !lon.value.trim()) {
				if (status) { status.textContent = I18N.noCoords || ''; }
				return;
			}
			if (status) { status.textContent = I18N.searching || ''; }

			window.fetch(CFG.discover, {
				credentials: 'same-origin',
				headers: { 'X-WP-Nonce': CFG.nonce || '' }
			})
				.then(function (r) { return r.json(); })
				.then(function (data) {
					var sites = (data && Array.isArray(data.sites)) ? data.sites : [];
					if (!sites.length) {
						if (status) { status.textContent = I18N.none || ''; }
						return;
					}
					if (status) { status.textContent = ''; }
					renderResults(sites);
				})
				.catch(function () {
					if (status) { status.textContent = I18N.failed || ''; }
				});
		});
	}
})();
