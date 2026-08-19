class FeaturesAmenitiesHandler extends elementorModules.frontend.handlers.Base {
	getDefaultSettings() {
		return {
			selectors: {
				container:   '.fal-container',
				header:      '.fal-section-header',
				content:     '.fal-section-content',
				section:     '.fal-section',
				readMore:    '.fal-read-more',
				searchInput: '.fal-search-input',
				searchClear: '.fal-search-clear',
				amenity:     '.fal-amenity'
			},
			hiddenClass: 'fal-search-hidden'
		};
	}

	getDefaultElements() {
		const sel = this.getSettings('selectors');
		return {
			$container:    this.$element.find(sel.container),
			$headers:      this.$element.find(sel.header),
			$searchInputs: this.$element.find(sel.searchInput),
			$searchClears: this.$element.find(sel.searchClear),
			$amenities:    this.$element.find(sel.amenity)
		};
	}

	bindEvents() {
		// Guard against double-binding. Elementor's element_ready can fire
		// more than once for the same widget (cache plugins deferring JS,
		// re-firing of elementor/frontend/init, etc.), which would attach
		// two click handlers and cause the accordion to expand-then-collapse
		// on a single tap.
		const root = this.$element && this.$element[0];
		if (root) {
			if (root.dataset.falBound === '1') {
				return;
			}
			root.dataset.falBound = '1';
		}

		const sel              = this.getSettings('selectors');
		const HIDDEN           = this.getSettings('hiddenClass');
		const reduceMotionMql  = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
		const prefersReduced   = () => !!(reduceMotionMql && reduceMotionMql.matches);
		const mobileMql        = window.matchMedia('(max-width: 767px)');
		const desktopAccordion = this.elements.$container.hasClass('desktop-accordion-enabled');
		const accordionActive  = () => mobileMql.matches || desktopAccordion;

		// Accordion
		//
		// The CSS rules below the @media query and under
		// .desktop-accordion-enabled hide .fal-section-content by default
		// and reveal it when .is-open is present. If we toggle the class
		// FIRST and then call slideToggle, jQuery sees the element as
		// already visible (computed display: block from the CSS) and
		// slides it back closed — producing the "expands then immediately
		// collapses" symptom on mobile and in desktop-accordion mode.
		//
		// Fix: pick the direction explicitly from the pre-click state and
		// force inline display before/during the animation so the CSS
		// can't fight us. .stop(true, false) clears any in-flight
		// animation so rapid taps don't queue.
		const closeSection = ($s) => {
			const $c = $s.find(sel.content).stop(true, false);
			if (prefersReduced()) {
				$c.hide();
				$s.removeClass('is-open');
			} else {
				$c.slideUp(300, () => $s.removeClass('is-open'));
			}
			$s.find(sel.header).attr('aria-expanded', 'false');
		};
		const openSection = ($s) => {
			const $c = $s.find(sel.content).stop(true, false).hide();
			$s.addClass('is-open');
			if (prefersReduced()) {
				$c.show();
			} else {
				$c.slideDown(300);
			}
			$s.find(sel.header).attr('aria-expanded', 'true');
		};

		this.elements.$headers.on('click', (e) => {
			if (!accordionActive()) return;

			const $section  = jQuery(e.currentTarget).closest(sel.section);
			const isOpening = !$section.hasClass('is-open');
			const exclusive = this.elements.$container.hasClass('exclusive-accordion-enabled');

			if (isOpening && exclusive) {
				this.elements.$container
					.find(sel.section + '.is-open')
					.not($section)
					.each((i, sec) => closeSection(jQuery(sec)));
			}

			if (isOpening) {
				openSection($section);
			} else {
				closeSection($section);
			}
		});

		// Keyboard support for the accordion: headers act like buttons
		// (Enter or Space toggles) while the accordion is active.
		this.elements.$headers.on('keydown', (e) => {
			if (!accordionActive()) return;
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
				e.preventDefault();
				jQuery(e.currentTarget).trigger('click');
			}
		});

		// Give headers button semantics (role, tabindex, aria-expanded,
		// aria-controls) while the accordion is active, and strip them in
		// the plain desktop view where clicking does nothing. Synced live
		// when the viewport crosses the mobile breakpoint.
		const widgetId = this.$element.attr('data-id') || 'fal';
		const syncHeaderA11y = () => {
			const active = accordionActive();
			this.elements.$headers.each((i, h) => {
				const $section = jQuery(h).closest(sel.section);
				const content  = $section.find(sel.content)[0];
				if (active) {
					if (content && !content.id) {
						content.id = 'fal-sec-' + widgetId + '-' + i;
					}
					h.setAttribute('role', 'button');
					h.setAttribute('tabindex', '0');
					h.setAttribute('aria-expanded', $section.hasClass('is-open') ? 'true' : 'false');
					if (content) {
						h.setAttribute('aria-controls', content.id);
					}
				} else {
					h.removeAttribute('role');
					h.removeAttribute('tabindex');
					h.removeAttribute('aria-expanded');
					h.removeAttribute('aria-controls');
				}
			});
		};
		syncHeaderA11y();
		if (mobileMql.addEventListener) {
			mobileMql.addEventListener('change', syncHeaderA11y);
		} else if (mobileMql.addListener) {
			mobileMql.addListener(syncHeaderA11y);
		}

		// Read More — delegated from the container so the buttons keep
		// working after search highlighting rewrites card innerHTML. The
		// inline max-height lets descriptions taller than the CSS fallback
		// cap expand fully while still animating.
		this.elements.$container.on('click', sel.readMore, (e) => {
			const btn      = e.currentTarget;
			const wrap     = btn.previousElementSibling;
			const expanded = wrap.classList.toggle('is-expanded');
			wrap.style.maxHeight = expanded ? wrap.scrollHeight + 'px' : '';
			btn.innerText = expanded ? 'Read Less' : 'Read More';
		});

		// Search
		if (this.elements.$searchInputs.length) {
			const input    = this.elements.$searchInputs[0];
			const clear    = this.elements.$searchClears[0];
			const status   = this.$element.find('.fal-search-status')[0];
			const items    = this.elements.$amenities.toArray();
			const sections = this.elements.$container.find(sel.section).toArray();

			// Translatable status strings (localized by wp_localize_script in
			// class-plugin.php). Fall back to English if absent.
			const i18n = (window.falI18n) || {};
			const labelNo  = i18n.noMatches || 'No matches';
			const labelOne = i18n.oneMatch  || '1 match';
			const labelN   = i18n.nMatches  || '%d matches';
			const formatCount = (n) => {
				if (n === 0) return labelNo;
				if (n === 1) return labelOne;
				return labelN.replace('%d', n);
			};

			// Track sections the Enter handler opened so we can close exactly
			// those (and not anything the user manually opened) on clear.
			const sectionsOpenedBySearch = new Set();

			const doSearch = () => {
				const q = input.value.toLowerCase().trim();
				if (clear) clear.classList.toggle('is-active', q.length > 0);

				// Clear previous marks. Only touch innerHTML on cards that
				// actually contain highlights — reassigning it recreates
				// every child node, which is wasteful and loses DOM state.
				items.forEach(item => {
					if (item.querySelector('mark.fal-hit')) {
						item.innerHTML = item.innerHTML.replace(/<mark class="fal-hit">|<\/mark>/gi, '');
					}
				});

				if (!q) {
					items.forEach(i => i.classList.remove(HIDDEN));
					sections.forEach(sec => sec.classList.remove(HIDDEN));
					sectionsOpenedBySearch.forEach(sec => closeSection(jQuery(sec)));
					sectionsOpenedBySearch.clear();
					if (status) status.textContent = '';
					return;
				}

				const escaped = q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
				const regex   = new RegExp(`(${escaped})`, 'gi');

				items.forEach(item => {
					const text = item.innerText.toLowerCase();
					if (text.includes(q)) {
						item.classList.remove(HIDDEN);
						// Highlight text nodes safely
						const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, null, false);
						const nodes  = [];
						let n;
						while ((n = walker.nextNode())) nodes.push(n);
						nodes.forEach(node => {
							if (node.nodeValue.toLowerCase().includes(q)) {
								const frag  = document.createDocumentFragment();
								const parts = node.nodeValue.split(regex);
								parts.forEach(p => {
									if (p.toLowerCase() === q) {
										const m = document.createElement('mark');
										m.className   = 'fal-hit';
										m.textContent = p;
										frag.appendChild(m);
									} else if (p) {
										frag.appendChild(document.createTextNode(p));
									}
								});
								node.parentNode.replaceChild(frag, node);
							}
						});
					} else {
						item.classList.add(HIDDEN);
					}
				});

				// Hide sections with zero matches. Do NOT auto-open matched
				// sections during typing — that's the Enter key's job.
				sections.forEach(sec => {
					const hasVisible = sec.querySelector(sel.amenity + ':not(.' + HIDDEN + ')');
					sec.classList.toggle(HIDDEN, !hasVisible);
				});

				if (status) {
					const count = items.filter(it => !it.classList.contains(HIDDEN)).length;
					status.textContent = formatCount(count);
				}
			};

			const clearSearch = () => {
				input.value = '';
				doSearch();
				input.focus();
			};

			const openMatchedSectionsAndScroll = () => {
				if (!input.value.trim()) return;
				const visibleAmenities = items.filter(it => !it.classList.contains(HIDDEN));
				if (!visibleAmenities.length) return;

				sections.forEach(sec => {
					if (sec.classList.contains(HIDDEN)) return;
					if (sec.classList.contains('is-open')) return;
					const hasMatch = sec.querySelector(sel.amenity + ':not(.' + HIDDEN + ')');
					if (hasMatch) {
						openSection(jQuery(sec));
						sectionsOpenedBySearch.add(sec);
					}
				});

				const first = visibleAmenities[0];
				if (first && typeof first.scrollIntoView === 'function') {
					first.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			};

			input.addEventListener('input', doSearch);
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					openMatchedSectionsAndScroll();
				} else if (e.key === 'Escape' && input.value) {
					e.preventDefault();
					clearSearch();
				}
			});
			if (clear) {
				clear.addEventListener('click', clearSearch);
			}
		}

		// Export and Import buttons live in the Elementor editor panel
		// (outer frame), not inside the widget. They're wired up by
		// assets/js/editor.js, which is enqueued only in the editor.
	}
}

// Second layer of double-binding defense: guard against this whole script
// being loaded twice (some cache/optimizer plugins do this when concatenating).
if (!window.__falRegistered) {
	window.__falRegistered = true;
	jQuery(window).on('elementor/frontend/init', () => {
		elementorFrontend.hooks.addAction('frontend/element_ready/features_and_amenities.default', ($element) => {
			elementorFrontend.elementsHandler.addHandler(FeaturesAmenitiesHandler, { $element });
		});
	});
}
