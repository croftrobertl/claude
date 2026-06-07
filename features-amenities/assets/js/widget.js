class FeaturesAmenitiesHandler extends elementorModules.frontend.handlers.Base {
	getDefaultSettings() {
		return {
			selectors: {
				container:    '.fal-container',
				header:       '.fal-section-header',
				content:      '.fal-section-content',
				section:      '.fal-section',
				readMore:     '.fal-read-more',
				searchInput:  '.fal-search-input',
				searchClear: '.fal-search-clear',
				amenity:      '.fal-amenity',
				exportBtn:    '[data-fal-export]',
				importBtn:    '[data-fal-import]'
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
			$amenities:    this.$element.find(sel.amenity),
			$exportBtns:   this.$element.find(sel.exportBtn),
			$importBtns:   this.$element.find(sel.importBtn)
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
		this.elements.$headers.on('click', (e) => {
			const isDesktop = this.elements.$container.hasClass('desktop-accordion-enabled');
			if (window.innerWidth < 768 || isDesktop) {
				const $section  = jQuery(e.currentTarget).closest(sel.section);
				const isOpening = !$section.hasClass('is-open');
				const exclusive = this.elements.$container.hasClass('exclusive-accordion-enabled');
				const reduced   = prefersReduced();

				if (isOpening && exclusive) {
					const $others = this.elements.$container
						.find(sel.section + '.is-open')
						.not($section);
					$others.removeClass('is-open');
					if (reduced) {
						$others.find(sel.content).hide();
					} else {
						$others.find(sel.content).slideUp(300);
					}
				}

				$section.toggleClass('is-open');
				if (reduced) {
					$section.find(sel.content).toggle();
				} else {
					$section.find(sel.content).slideToggle(300);
				}
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
			const input = this.elements.$searchInputs[0];
			const clear = this.elements.$searchClears[0];
			const items = this.elements.$amenities.toArray();

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
					this.elements.$headers.parent().show();
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

				// Hide empty sections
				this.elements.$headers.parent().each((i, sec) => {
					const visibleItems = sec.querySelectorAll(sel.amenity + ':not([style*="display: none"])');
					sec.style.display = visibleItems.length ? '' : 'none';
					if (visibleItems.length) {
						sec.classList.add('is-open');
						const c = sec.querySelector(sel.content);
						if (c) c.style.display = 'block';
					}
				});
			};

			input.addEventListener('input', doSearch);
			if (clear) {
				clear.addEventListener('click', () => { input.value = ''; doSearch(); input.focus(); });
			}
		}

		// Export
		if (this.elements.$exportBtns.length) {
			const configStr = this.elements.$container[0]?.getAttribute('data-config');
			let config = {};
			try { config = JSON.parse(configStr || '{}'); } catch (e) {}

			this.elements.$exportBtns.on('click', (e) => {
				const btn = e.currentTarget;
				if (!config.raw_items) return;
				const text = JSON.stringify(config.raw_items, null, 2);
				const fb   = document.createElement('textarea');
				fb.value   = text;
				document.body.appendChild(fb);
				fb.select();
				try { document.execCommand('copy'); } catch (err) {}
				document.body.removeChild(fb);
				const orig = btn.innerText;
				btn.innerText = 'Copied!';
				setTimeout(() => btn.innerText = orig, 2000);
			});
		}

		// Import
		if (this.elements.$importBtns.length) {
			this.elements.$importBtns.on('click', () => {
				const jsonStr = prompt('Paste your JSON configuration here:');
				if (!jsonStr) return;
				try {
					const data = JSON.parse(jsonStr);
					if (Array.isArray(data) && window.elementor) {
						const widgetModel = window.elementor.elements.findWhere({ id: this.$element.data('id') });
						if (widgetModel) {
							widgetModel.settings.set('list_items', data);
							alert('Imported! Panel will refresh.');
						}
					}
				} catch (err) {
					alert('Error parsing JSON.');
				}
			});
		}
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
