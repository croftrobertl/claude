'use strict';
/**
 * A DOM small enough to run the template/estimate composers in node.
 *
 * IT IS NOT MORE FORGIVING THAN A BROWSER in the way that matters here:
 * textContent concatenates descendants, innerHTML is stored verbatim and is
 * NOT parsed, and setting textContent clears children. That last pair is the
 * point — the estimate line is the one place the plugin injects HTML, so a
 * test must be able to see the difference between text and markup rather than
 * flattening both into a string.
 */
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = t => String(t)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

class TextNode {
  constructor(t) { this.nodeType = 3; this.data = String(t); this.children = []; }
  get textContent() { return this.data; }
}

class El {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.className = '';
    this.attrs = {};
    this._html = null;
  }
  appendChild(n) { this.children.push(n); return n; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() {
    if (this._html !== null) return this._html;
    // A browser ESCAPES text when serialising, so a text node containing
    // "<script>" appears as "&lt;script&gt;" — which is exactly how you tell
    // "this was injected as markup" from "this was inserted as text". A stub
    // that echoed it raw makes the two indistinguishable and reports a safe
    // insertion as an injection.
    return this.children.map(c => c.nodeType === 3 ? esc(c.data) : c.outerHTML).join('');
  }
  get outerHTML() {
    const cls = this.className ? ' class="' + this.className + '"' : '';
    return '<' + this.tagName.toLowerCase() + cls + '>' + this.innerHTML
      + '</' + this.tagName.toLowerCase() + '>';
  }
  set textContent(v) { this.children = []; this._html = null; if (v !== '') this.children.push(new TextNode(v)); }
  get textContent() {
    // Content set via innerHTML was PARSED by a browser, so its entities are
    // decoded by the time textContent reads them: mphb_format_price emits
    // "&#036;" and the visitor sees "$". Leaving it encoded here would make a
    // correct price line look wrong.
    if (this._html !== null) return decode(this._html.replace(/<[^>]*>/g, ''));
    return this.children.map(c => c.textContent).join('');
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  querySelector() { return null; }
}

const document = {
  createElement: t => new El(t),
  createTextNode: t => new TextNode(t),
};

module.exports = { document, El, TextNode };
