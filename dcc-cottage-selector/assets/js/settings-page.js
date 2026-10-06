/*
 * DCC > Cottage Selector settings page (admin only; enqueued on this page alone).
 *
 * Two jobs, both about the round trip through admin-post.php:
 *
 * 1. Put the user back where they were after Save. On submit the offset of the
 *    viewport from the top of the FORM (not the document) and whether Advanced is
 *    open go into two hidden fields; the save handler echoes them back as
 *    data-dccs-scroll / data-dccs-adv on the reloaded form. Measuring from the form
 *    means the "Settings saved." notice that now sits above it, and any other
 *    plugin's notice WordPress moves under the heading, do not shift what is shown.
 *    The restore waits for `load`, after WordPress's common.js has moved notices.
 *
 * 2. The browser's own "Leave site? Changes you made may not be saved." prompt,
 *    only when a field really differs from how the page loaded. The comparison is
 *    against a snapshot of every field, so changing a value and changing it back
 *    does not warn, and an untouched page never does. Submitting the form never
 *    warns. No text of our own: browsers ignore custom beforeunload messages.
 */
(function () {
  'use strict';
  var form = document.getElementById('dccs-settings-form');
  if (!form) {
    return;
  }
  var adv = form.querySelector('details.dccs-advanced');

  function formTop() {
    return form.getBoundingClientRect().top + (window.pageYOffset || 0);
  }

  // Every user-editable field, in document order. Hidden inputs (action, nonce,
  // referer, and the two view-state fields) are not the user's changes.
  function snapshot() {
    var parts = [];
    var els = form.elements;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.name || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') {
        continue;
      }
      var v = (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.value;
      parts.push(el.name + '=' + v);
    }
    return parts.join('&');
  }

  var initial = snapshot();
  var submitting = false;

  form.addEventListener('submit', function () {
    submitting = true;
    if (form.elements.dccs_scroll) {
      form.elements.dccs_scroll.value = String(Math.round((window.pageYOffset || 0) - formTop()));
    }
    if (form.elements.dccs_adv) {
      form.elements.dccs_adv.value = adv && adv.open ? '1' : '';
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (submitting || snapshot() === initial) {
      return;
    }
    e.preventDefault();
    e.returnValue = ''; // still required by some browsers to show the prompt
  });

  // Reopen Advanced first so the restored offset measures the same layout.
  if (adv && form.getAttribute('data-dccs-adv') === '1') {
    adv.open = true;
  }
  var offset = form.getAttribute('data-dccs-scroll');
  if (offset !== null && /^-?\d+$/.test(offset)) {
    var restore = function () {
      window.scrollTo(0, Math.max(0, formTop() + parseInt(offset, 10)));
    };
    if (document.readyState === 'complete') {
      restore();
    } else {
      window.addEventListener('load', restore);
    }
  }
})();
