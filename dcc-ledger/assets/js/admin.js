/**
 * DCC Ledger admin. Vanilla JS, no dependencies.
 *
 * It only does two things: it keeps the period control's fields relevant to
 * the period type chosen, and it asks before an undo. Every figure on the page
 * is rendered server-side.
 */
(function () {
    'use strict';

    function syncPeriodFields() {
        var kind = document.getElementById('dccl-period-kind');
        if (!kind) {
            return;
        }
        var form = kind.closest('form');
        if (!form) {
            return;
        }
        var value = form.querySelector('select[name="value"]');
        var dates = form.querySelectorAll('input[type="date"]');

        function apply() {
            var custom = kind.value === 'custom';
            if (value) {
                value.disabled = custom;
                value.closest('fieldset').classList.toggle('is-dim', custom);
            }
            dates.forEach(function (input) {
                input.disabled = !custom;
            });
        }

        kind.addEventListener('change', apply);
        apply();
    }

    function confirmUndo() {
        document.querySelectorAll('form input[value="dccl_undo"]').forEach(function (field) {
            var form = field.closest('form');
            if (!form) {
                return;
            }
            form.addEventListener('submit', function (event) {
                var message = 'Undo this import? It removes exactly the rows that batch added. Rows that were already there are left alone.';
                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            syncPeriodFields();
            confirmUndo();
        });
    } else {
        syncPeriodFields();
        confirmUndo();
    }
})();
