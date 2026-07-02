/**
 * Elementor EDITOR-only helper for the "text code" transfer between a Cottage
 * Selector and a Mini Entry (v0.12.0). The visual design is copied with Elementor's
 * native right-click Copy → Paste Style; this file only moves the content-tab TEXT
 * strings (the one thing Paste Style doesn't carry).
 *
 * Registers a custom control view (`dccs_design_io`) with two modes:
 *   - export: reads this widget's str_* settings and emits a portable base64 "code".
 *   - import: decodes a pasted code and writes the str_* values into THIS widget's
 *     own controls via Elementor's documented settings command, so they stay editable.
 *
 * Fails safe: the encode/decode helpers are pure and always available; the editor
 * glue only registers when Elementor's control base + command API are present, and
 * every action is wrapped so a future Elementor change can at worst no-op (never
 * corrupt a page). Not loaded on the front end.
 */
(function (w) {
  'use strict';

  // ---- pure, testable helpers (attached to window for the unit test) ----
  function pickStrings(obj) {
    var out = {};
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(function (k) {
        if (k.indexOf('str_') === 0 && (typeof obj[k] === 'string' || typeof obj[k] === 'number')) {
          out[k] = String(obj[k]);
        }
      });
    }
    return out;
  }
  function encodeText(settings) {
    var json = JSON.stringify(pickStrings(settings));
    return w.btoa(unescape(encodeURIComponent(json)));   // UTF-8 safe
  }
  function decodeText(code) {
    if (typeof code !== 'string' || !code.trim()) { return null; }
    try {
      var obj = JSON.parse(decodeURIComponent(escape(w.atob(code.trim()))));
      return pickStrings(obj);
    } catch (e) { return null; }
  }
  w.DCCS_IO = { pickStrings: pickStrings, encodeText: encodeText, decodeText: decodeText };

  // ---- editor glue (skipped outside the Elementor editor / in tests) ----
  var el = w.elementor;
  if (!el || !el.modules || !el.modules.controls || !el.modules.controls.BaseData || !el.addControlView) {
    return;
  }

  var View = el.modules.controls.BaseData.extend({
    onReady: function () {
      var self = this;
      var mode = (this.model && this.model.get('mode')) || 'export';
      var $code = this.$el.find('.dccs-io-code');
      var $btn = this.$el.find('.dccs-io-btn');
      var $status = this.$el.find('.dccs-io-status');
      function status(msg) { if ($status && $status.text) { $status.text(msg || ''); } }
      function container() { return self.container || (self.getOption && self.getOption('container')) || null; }

      $btn.off('click.dccsio').on('click.dccsio', function () {
        if (mode === 'export') {
          var c = container();
          var settings = c && c.settings
            ? (c.settings.toJSON ? c.settings.toJSON() : c.settings.attributes)
            : null;
          if (!settings) { status('Couldn’t read this widget’s settings.'); return; }
          $code.val(w.DCCS_IO.encodeText(settings));
          try {
            $code[0].select();
            w.document.execCommand('copy');
            status('Copied — paste it into a Mini Entry’s “Import text”.');
          } catch (e) {
            status('Select the code above and copy it (Ctrl/Cmd-C).');
          }
        } else {
          var map = w.DCCS_IO.decodeText($code.val());
          if (!map) { status('That code isn’t valid — re-copy it from the Selector.'); return; }
          var keys = Object.keys(map);
          if (!keys.length) { status('No text found in that code.'); return; }
          var c2 = container();
          if (!w.$e || !w.$e.run || !c2) { status('Editor API unavailable — update the plugin or Elementor.'); return; }
          try {
            w.$e.run('document/elements/settings', { container: c2, settings: map, options: { external: true } });
            status('Applied ' + keys.length + ' text field(s). Remember to Save.');
          } catch (e) {
            status('Couldn’t apply the text (editor API changed).');
          }
        }
      });
    }
  });

  el.addControlView('dccs_design_io', View);
})(window);
