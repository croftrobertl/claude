/* DCC Seasons — settings page helpers: schedule rows + live slider values. */
(function () {
	'use strict';
	var D = document;

	/* Live <output> next to the range sliders. */
	var sliders = D.querySelectorAll('input[type="range"][data-dcc-output]');
	Array.prototype.forEach.call(sliders, function (el) {
		var out = D.getElementById(el.getAttribute('data-dcc-output'));
		if (!out) { return; }
		el.addEventListener('input', function () { out.textContent = el.value; });
	});

	/* Schedule table: add / remove rows. */
	var table = D.getElementById('dcc-seasons-schedule');
	var addBtn = D.getElementById('dcc-seasons-add-row');
	var tpl = D.getElementById('dcc-seasons-row-template');
	if (!table || !addBtn || !tpl) { return; }

	addBtn.addEventListener('click', function () {
		var key = 'n' + Date.now() + '_' + table.tBodies[0].rows.length;
		var holder = D.createElement('tbody');
		holder.innerHTML = tpl.innerHTML.replace(/__i__/g, key);
		while (holder.firstElementChild) {
			table.tBodies[0].appendChild(holder.firstElementChild);
		}
	});

	table.addEventListener('click', function (e) {
		var btn = e.target && e.target.closest ? e.target.closest('.dcc-seasons-remove-row') : null;
		if (!btn) { return; }
		var tr = btn.closest('tr');
		if (tr) { tr.parentNode.removeChild(tr); }
	});
})();
