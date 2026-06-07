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
			}
		};
	}

	getDefaultElements() {
		const sel = this.getSettings('selectors');
		return {
			$container:    this.$element.find(sel.container),
			$headers:      this.$element.find(sel.header),
			$readMores:    this.$element.find(sel.readMore),
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

		const sel             = this.getSettings('selectors');
		const reduceMotionMql = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
		const prefersReduced  = () => !!(reduceMotionMql && reduceMotionMql.matches);

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
		};
		const openSection = ($s) => {
			const $c = $s.find(sel.content).stop(true, false).hide();
			$s.addClass('is-open');
			if (prefersReduced()) {
				$c.show();
			} else {
				$c.slideDown(300);
			}
		};

		this.elements.$headers.on('click', (e) => {
			const isDesktop = this.elements.$container.hasClass('desktop-accordion-enabled');
			if (!(window.innerWidth < 768 || isDesktop)) return;

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

		// Read More
		this.elements.$readMores.on('click', (e) => {
			const btn  = e.currentTarget;
			const wrap = btn.previousElementSibling;
			wrap.classList.toggle('is-expanded');
			btn.innerText = wrap.classList.contains('is-expanded') ? 'Read Less' : 'Read More';
		});

		// Search
		if (this.elements.$searchInputs.length) {
			const input    = this.elements.$searchInputs[0];
			const clear    = this.elements.$searchClears[0];
			const items    = this.elements.$amenities.toArray();
			const sections = this.elements.$container.find(sel.section).toArray();

			// Track sections the Enter handler opened so we can close exactly
			// those (and not anything the user manually opened) on clear.
			const sectionsOpenedBySearch = new Set();

			const doSearch = () => {
				const q = input.value.toLowerCase().trim();
				if (clear) clear.hidden = q.length === 0;

				// Clear previous marks
				items.forEach(item => {
					const html = item.innerHTML;
					item.innerHTML = html.replace(/<mark class="fal-hit">|<\/mark>/gi, '');
				});

				if (!q) {
					items.forEach(i => i.style.display = '');
					sections.forEach(sec => { sec.style.display = ''; });
					sectionsOpenedBySearch.forEach(sec => closeSection(jQuery(sec)));
					sectionsOpenedBySearch.clear();
					return;
				}

				const escaped = q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
				const regex   = new RegExp(`(${escaped})`, 'gi');

				items.forEach(item => {
					const text = item.innerText.toLowerCase();
					if (text.includes(q)) {
						item.style.display = '';
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
						item.style.display = 'none';
					}
				});

				// Hide sections with zero matches. Do NOT auto-open matched
				// sections during typing — that's the Enter key's job.
				sections.forEach(sec => {
					const visibleItems = sec.querySelectorAll(sel.amenity + ':not([style*="display: none"])');
					sec.style.display = visibleItems.length ? '' : 'none';
				});
			};

			const openMatchedSectionsAndScroll = () => {
				if (!input.value.trim()) return;
				const visibleAmenities = items.filter(it => it.style.display !== 'none');
				if (!visibleAmenities.length) return;

				sections.forEach(sec => {
					if (sec.style.display === 'none') return;
					if (sec.classList.contains('is-open')) return;
					const hasMatch = sec.querySelector(sel.amenity + ':not([style*="display: none"])');
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
				}
			});
			if (clear) {
				clear.addEventListener('click', () => { input.value = ''; doSearch(); input.focus(); });
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
