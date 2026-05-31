/* Guest Guide — frontend behavior (vanilla JS, no jQuery).
 * Drives menu↔detail navigation, search filtering, and copy-to-clipboard.
 * All content is server-rendered; this script only toggles state classes
 * (transitions are pure CSS) and handles interaction.
 */
(function () {
    'use strict';

    function parseConfig(root) {
        try {
            return JSON.parse(root.getAttribute('data-config') || '{}');
        } catch (e) {
            return {};
        }
    }

    function announce(root, msg) {
        var live = root.querySelector('.gguide-sr-only');
        if (live) {
            live.textContent = '';
            // Re-set on next frame so screen readers re-announce identical text.
            window.requestAnimationFrame(function () { live.textContent = msg; });
        }
    }

    function initRoot(root) {
        if (root.gguideInit) { return; }
        root.gguideInit = true;

        var config   = parseConfig(root);
        var strings  = config.strings || {};
        var tiles    = Array.prototype.slice.call(root.querySelectorAll('.gguide-tile'));
        var details  = Array.prototype.slice.call(root.querySelectorAll('.gguide-detail'));
        var emptyEl  = root.querySelector('.gguide-empty');
        var searchEl = root.querySelector('.gguide-search-input');
        var items    = Array.prototype.slice.call(root.querySelectorAll('.gguide-item'));
        var lastTile = null;

        // Cache lowercased searchable text from server-rendered data-search
        // attributes (section/item content only — never button chrome).
        tiles.forEach(function (el) {
            el.gguideSearch = (el.getAttribute('data-search') || el.textContent || '').toLowerCase();
        });
        items.forEach(function (el) {
            el.gguideSearch = (el.getAttribute('data-search') || el.textContent || '').toLowerCase();
        });

        function detailFor(key) {
            for (var i = 0; i < details.length; i++) {
                if (details[i].getAttribute('data-key') === key) { return details[i]; }
            }
            return null;
        }

        function openSection(key, sourceTile) {
            var target = detailFor(key);
            if (!target) { return; }
            details.forEach(function (d) {
                var active = (d === target);
                d.hidden = !active;
                d.classList.toggle('is-active', active);
            });
            lastTile = sourceTile || null;
            root.classList.add('is-detail');
            var back = target.querySelector('.gguide-back');
            if (back) { back.focus(); }
        }

        function closeSection() {
            root.classList.remove('is-detail');
            details.forEach(function (d) {
                d.hidden = true;
                d.classList.remove('is-active');
            });
            if (lastTile) { lastTile.focus(); }
            lastTile = null;
        }

        tiles.forEach(function (tile) {
            tile.addEventListener('click', function () {
                openSection(tile.getAttribute('data-key'), tile);
            });
        });

        details.forEach(function (d) {
            var back = d.querySelector('.gguide-back');
            if (back) {
                back.addEventListener('click', closeSection);
            }
        });

        root.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && root.classList.contains('is-detail')) {
                closeSection();
            }
        });

        // ---------- Search ----------
        function applySearch(q) {
            q = (q || '').trim().toLowerCase();
            var anyVisible = false;

            tiles.forEach(function (tile) {
                var match = q === '' || tile.gguideSearch.indexOf(q) !== -1;
                tile.hidden = !match;
                if (match) { anyVisible = true; }
            });

            // Filter items in every section up front, so opening a matched tile
            // already shows just the matching items. Empty query restores all.
            items.forEach(function (item) {
                item.hidden = !(q === '' || item.gguideSearch.indexOf(q) !== -1);
            });

            if (emptyEl) {
                emptyEl.hidden = !(q !== '' && !anyVisible && !root.classList.contains('is-detail'));
            }
        }

        if (searchEl) {
            var t;
            searchEl.addEventListener('input', function () {
                window.clearTimeout(t);
                t = window.setTimeout(function () { applySearch(searchEl.value); }, 120);
            });
        }

        // ---------- Copy to clipboard ----------
        function copyText(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
            return new Promise(function (resolve, reject) {
                try {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    ta.setAttribute('readonly', '');
                    ta.style.position = 'absolute';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        }

        root.querySelectorAll('.gguide-copy').forEach(function (btn) {
            var original = btn.textContent;
            btn.addEventListener('click', function () {
                var value = btn.getAttribute('data-copy') || '';
                copyText(value).then(function () {
                    var copied = strings.copied || 'Copied!';
                    btn.textContent = copied;
                    btn.classList.add('is-copied');
                    announce(root, copied);
                    window.clearTimeout(btn.gguideTimer);
                    btn.gguideTimer = window.setTimeout(function () {
                        btn.textContent = strings.copy || original;
                        btn.classList.remove('is-copied');
                    }, 1500);
                }).catch(function () {
                    /* Clipboard unavailable — leave the value visible for manual copy. */
                });
            });
        });
    }

    function initAll(scope) {
        (scope || document).querySelectorAll('.gguide-root').forEach(initRoot);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initAll(document); });
    } else {
        initAll(document);
    }

    // Re-init inside the Elementor editor preview when widgets are (re)rendered.
    if (window.jQuery) {
        window.jQuery(window).on('elementor/frontend/init', function () {
            if (window.elementorFrontend && window.elementorFrontend.hooks) {
                window.elementorFrontend.hooks.addAction('frontend/element_ready/guest_guide.default', function ($scope) {
                    initAll($scope && $scope[0] ? $scope[0] : document);
                });
            }
        });
    }
})();
