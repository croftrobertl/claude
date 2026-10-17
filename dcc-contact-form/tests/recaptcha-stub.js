/* Stands in for Google's api.js in tests/browser-test.js. Records that it was
   loaded and hands back a token, so "loads on first focus" and "a fast submit
   still gets a token" are both observable without calling Google. */
window.__recaptchaLoadedAt = Date.now();
window.grecaptcha = {
    ready: function (cb) { cb(); },
    execute: function () { return Promise.resolve('STUB_TOKEN'); }
};
