/* DCC Contact Form — front-end behaviour. Vanilla JS, no dependencies. */
(function () {
    'use strict';

    /* Translatable strings injected via wp_localize_script; English fallback. */
    var I18N = window.dccContactI18n || {};
    var MSG_REQUIRED = I18N.required || 'This field is required.';
    var MSG_EMAIL = I18N.email || 'Please enter a valid email address.';
    var MSG_PHONE = I18N.phone || 'Please enter a valid phone number.';
    var MSG_NUMBER = I18N.number || 'Please enter a valid number.';
    var MSG_GENERIC = I18N.generic || 'Something went wrong. Please try again.';

    function isEmail(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }
    function isPhone(v) {
        if (!/^[0-9+()\-.\s]{7,32}$/.test(v)) { return false; }
        var digits = v.replace(/[^0-9]/g, '');
        return digits.length >= 7;
    }

    function setFieldError(field, message) {
        field.classList.add('dcc-has-error');
        var err = field.querySelector('.dcc-error');
        if (err) { err.textContent = message; }
        var inputs = field.querySelectorAll('input, textarea, select');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].setAttribute('aria-invalid', 'true');
        }
    }
    function clearFieldError(field) {
        field.classList.remove('dcc-has-error');
        var err = field.querySelector('.dcc-error');
        if (err) { err.textContent = ''; }
        var inputs = field.querySelectorAll('input, textarea, select');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].removeAttribute('aria-invalid');
        }
    }

    /* Client-side pre-validation for instant feedback. Returns the first
       invalid field element, or null when the form passes. Server-side
       validation remains authoritative. */
    function validate(form) {
        var firstInvalid = null;
        var fields = form.querySelectorAll('.dcc-field');
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            clearFieldError(field);

            var controls = field.querySelectorAll('input, textarea, select');
            var required = false;
            var k;
            for (k = 0; k < controls.length; k++) {
                if (controls[k].getAttribute('aria-required') === 'true') { required = true; break; }
            }

            var textVal = '';
            var checkbox = null;
            for (k = 0; k < controls.length; k++) {
                var c = controls[k];
                if (c.type === 'checkbox') { checkbox = c; continue; }
                if (c.value) { textVal += (textVal ? ' ' : '') + c.value.trim(); }
            }

            var msg = '';
            if (checkbox) {
                if (required && !checkbox.checked) { msg = MSG_REQUIRED; }
            } else if (required && textVal.trim() === '') {
                msg = MSG_REQUIRED;
            } else if (textVal.trim() !== '') {
                var emailInput = field.querySelector('input[type="email"]');
                var telInput = field.querySelector('input[type="tel"]');
                var numInput = field.querySelector('input[type="number"]');
                if (emailInput && !isEmail(emailInput.value.trim())) { msg = MSG_EMAIL; }
                else if (telInput && !isPhone(telInput.value.trim())) { msg = MSG_PHONE; }
                else if (numInput && numInput.value.trim() !== '' && isNaN(Number(numInput.value.trim()))) { msg = MSG_NUMBER; }
            }

            if (msg) {
                setFieldError(field, msg);
                if (!firstInvalid) { firstInvalid = field; }
            }
        }
        return firstInvalid;
    }

    function showFormError(form, message) {
        var box = form.querySelector('.dcc-form-error');
        if (box) {
            box.textContent = message;
            box.classList.add('dcc-visible');
        }
    }
    function clearFormError(form) {
        var box = form.querySelector('.dcc-form-error');
        if (box) {
            box.textContent = '';
            box.classList.remove('dcc-visible');
        }
    }

    /* reCAPTCHA v3: resolve with a token, or '' when unavailable. */
    function getRecaptchaToken(siteKey) {
        return new Promise(function (resolve) {
            if (!siteKey || typeof grecaptcha === 'undefined' || !grecaptcha.ready) {
                resolve('');
                return;
            }
            try {
                grecaptcha.ready(function () {
                    grecaptcha.execute(siteKey, { action: 'dcc_contact' }).then(
                        function (token) { resolve(token || ''); },
                        function () { resolve(''); }
                    );
                });
            } catch (e) {
                resolve('');
            }
        });
    }

    function init(form) {
        if (form.dataset.dccBound) { return; }
        form.dataset.dccBound = '1';

        var startTime = (window.performance && performance.now) ? performance.now() : Date.now();
        var wrap = form.closest('.dcc-contact-wrap');
        var button = form.querySelector('.dcc-submit');
        var ajaxUrl = form.getAttribute('data-ajax-url');
        var siteKey = form.getAttribute('data-recaptcha') || '';

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            clearFormError(form);

            var invalid = validate(form);
            if (invalid) {
                var focusable = invalid.querySelector('input, textarea, select');
                if (focusable) { focusable.focus(); }
                return;
            }

            // Elapsed time for the server-side time-trap.
            var now = (window.performance && performance.now) ? performance.now() : Date.now();
            var tsField = form.querySelector('input[name="dcc_ts"]');
            if (tsField) { tsField.value = String(Math.round(now - startTime)); }

            var origLabel = button ? button.getAttribute('data-label') : '';
            var processing = button ? button.getAttribute('data-processing') : '';
            if (button) {
                button.disabled = true;
                button.textContent = processing || origLabel;
            }

            getRecaptchaToken(siteKey).then(function (token) {
                var rcField = form.querySelector('input[name="dcc_recaptcha"]');
                if (rcField) { rcField.value = token; }

                var data = new FormData(form);

                fetch(ajaxUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    body: data
                }).then(function (r) {
                    return r.json();
                }).then(function (res) {
                    if (res && res.success && res.data && res.data.confirmation) {
                        var conf = wrap ? wrap.querySelector('.dcc-form-confirmation') : null;
                        if (conf) {
                            conf.innerHTML = res.data.confirmation;
                            conf.hidden = false;
                        }
                        form.style.display = 'none';
                        if (conf && conf.focus) {
                            conf.setAttribute('tabindex', '-1');
                            conf.focus();
                        }
                    } else {
                        handleErrors(form, res);
                        resetButton(button, origLabel);
                    }
                }).catch(function () {
                    showFormError(form, MSG_GENERIC);
                    resetButton(button, origLabel);
                });
            });
        });
    }

    function resetButton(button, origLabel) {
        if (button) {
            button.disabled = false;
            button.textContent = origLabel;
        }
    }

    function handleErrors(form, res) {
        var data = (res && res.data) ? res.data : {};
        var errors = data.errors || {};
        var firstField = null;
        for (var fid in errors) {
            if (!Object.prototype.hasOwnProperty.call(errors, fid)) { continue; }
            var field = form.querySelector('.dcc-field[data-field="' + cssEscape(fid) + '"]');
            if (field) {
                setFieldError(field, errors[fid]);
                if (!firstField) { firstField = field; }
            }
        }
        if (data.message) {
            showFormError(form, data.message);
        } else if (!firstField) {
            showFormError(form, MSG_GENERIC);
        }
        if (firstField) {
            var f = firstField.querySelector('input, textarea, select');
            if (f) { f.focus(); }
        }
    }

    function cssEscape(s) {
        return String(s).replace(/["\\\]]/g, '\\$&');
    }

    function boot() {
        var forms = document.querySelectorAll('.dcc-contact-form');
        for (var i = 0; i < forms.length; i++) { init(forms[i]); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    /* Re-init inside the Elementor editor preview when a widget is (re)rendered. */
    if (window.elementorFrontend && window.elementorFrontend.hooks) {
        window.elementorFrontend.hooks.addAction('frontend/element_ready/dcc_contact_form.default', function ($scope) {
            var node = $scope && $scope[0] ? $scope[0] : null;
            if (!node) { return; }
            var form = node.querySelector('.dcc-contact-form');
            if (form) { init(form); }
        });
    }
})();
