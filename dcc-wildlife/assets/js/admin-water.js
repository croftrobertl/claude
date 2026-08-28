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

	/* ---- Water Atlas probe ----
	 * Calls both reports from the live server and lists every reading the
	 * parser recognised, so the integration is confirmed against the real
	 * API rather than taken on trust. */
	function renderAtlas(found) {
		var wrap = document.getElementById('dccwl-clarity-results');
		if (!wrap) { return; }
		wrap.textContent = '';
		if (!found.length) { return; }

		var table = document.createElement('table');
		table.className = 'widefat striped';
		table.style.marginTop = '8px';
		var tbody = document.createElement('tbody');

		found.forEach(function (f) {
			var tr = document.createElement('tr');
			[f.label, f.value, f.date].forEach(function (text, i) {
				var td = document.createElement('td');
				td.textContent = String(text || '');
				if (i === 2) { td.style.width = '130px'; }
				tr.appendChild(td);
			});
			tbody.appendChild(tr);
		});

		table.appendChild(tbody);
		wrap.appendChild(table);
	}

	var clarityBtn = document.getElementById('dccwl-test-clarity');
	if (clarityBtn && CFG.clarity) {
		clarityBtn.addEventListener('click', function () {
			var status = document.getElementById('dccwl-clarity-status');
			if (status) { status.textContent = I18N.testing || ''; status.style.color = ''; }

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
						renderAtlas([]);
						return;
					}
					var found = Array.isArray(d.found) ? d.found : [];
					var reports = [];
					if (d.waterQuality) { reports.push('WaterQuality'); }
					if (d.levelsFlows) { reports.push('LevelsFlows'); }
					status.textContent = reports.join(' + ') + ' reachable — ' +
						found.length + ' reading' + (found.length === 1 ? '' : 's') + ' recognised.';
					status.style.color = found.length ? '#1d6b47' : '#a4332a';
					renderAtlas(found);
				})
				.catch(function () {
					if (status) {
						status.textContent = I18N.failed || '';
						status.style.color = '#a4332a';
					}
				});
		});
	}

	/* ---- chain-water discovery ----
	 * Sweeps the Atlas from the property and from each configured water, then
	 * lists what is not already in the table. Nothing is added automatically:
	 * `closest` returns whatever is nearest, ponds included, so the owner
	 * picks which belong to the chain. */
	function addWaterRow(w) {
		var table = document.getElementById('dccwl-chain');
		if (!table) { return false; }
		var tbody = table.querySelector('tbody');
		var last = tbody && tbody.lastElementChild;
		if (!tbody || !last) { return false; }

		// Reuse the blank trailing row if it is empty, else clone a new one.
		var target = last;
		var isBlank = Array.prototype.every.call(last.querySelectorAll('input'), function (i) { return !i.value; });
		if (!isBlank) {
			addRow('dccwl-chain');
			target = tbody.lastElementChild;
		}
		var vals = { id: w.id, name: w.name, lat: w.lat, lon: w.lon };
		target.querySelectorAll('[name]').forEach(function (input) {
			var m = /\[(id|name|lat|lon)\]$/.exec(input.getAttribute('name') || '');
			if (m && vals[m[1]] !== undefined && vals[m[1]] !== null) {
				input.value = String(vals[m[1]]);
			}
		});
		return true;
	}

	function renderWaters(list) {
		var wrap = document.getElementById('dccwl-waters-results');
		if (!wrap) { return; }
		wrap.textContent = '';
		if (!list.length) { return; }

		var table = document.createElement('table');
		table.className = 'widefat striped';
		table.style.marginTop = '8px';
		var tbody = document.createElement('tbody');

		list.forEach(function (w) {
			var tr = document.createElement('tr');

			var tdName = document.createElement('td');
			tdName.textContent = w.name || '';
			tr.appendChild(tdName);

			var tdId = document.createElement('td');
			tdId.style.width = '90px';
			var code = document.createElement('code');
			code.textContent = String(w.id || '');
            tdId.appendChild(code);
			tr.appendChild(tdId);

			var tdDist = document.createElement('td');
			tdDist.style.width = '110px';
			tdDist.textContent = (typeof w.miles === 'number') ? (w.miles + ' mi') : '';
			tr.appendChild(tdDist);

			var tdBtn = document.createElement('td');
			tdBtn.style.width = '130px';
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'button button-small';
			b.textContent = I18N.addWater || 'Add';
			b.addEventListener('click', function () {
				if (addWaterRow(w)) {
					b.disabled = true;
					b.textContent = I18N.added || 'Added';
				}
			});
			tdBtn.appendChild(b);
			tr.appendChild(tdBtn);

			tbody.appendChild(tr);
		});

		table.appendChild(tbody);
		wrap.appendChild(table);
	}

	var findBtn = document.getElementById('dccwl-find-waters');
	if (findBtn && CFG.waters) {
		findBtn.addEventListener('click', function () {
			var status = document.getElementById('dccwl-waters-status');
			if (status) { status.textContent = I18N.sweeping || ''; status.style.color = ''; }
			findBtn.disabled = true;

			window.fetch(CFG.waters, {
				credentials: 'same-origin',
				headers: { 'X-WP-Nonce': CFG.nonce || '' }
			})
				.then(function (r) { return r.json(); })
				.then(function (d) {
					findBtn.disabled = false;
					var list = (d && Array.isArray(d.waters)) ? d.waters : [];
					if (!status) { return; }
					if (!list.length) {
						status.textContent = I18N.noWaters || '';
						renderWaters([]);
						return;
					}
					status.textContent = list.length + ' ' + (I18N.foundWaters || 'candidates found.');
					renderWaters(list);
				})
				.catch(function () {
					findBtn.disabled = false;
					if (status) { status.textContent = I18N.failed || ''; status.style.color = '#a4332a'; }
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
