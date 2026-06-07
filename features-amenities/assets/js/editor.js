/**
 * Editor-only script for Features & Amenities.
 *
 * Wires up the Export List to Clipboard and Import List from JSON buttons
 * inside the Elementor panel. These buttons live in the outer editor frame
 * (the panel), not in the preview iframe where widget.js runs, so they need
 * their own handler bound at the document level.
 */
( function ( $ ) {
	'use strict';

	function getCurrentRepeaterCollection() {
		if ( typeof elementor === 'undefined' || ! elementor.getPanelView ) {
			return null;
		}
		try {
			const pageView = elementor.getPanelView().getCurrentPageView();
			if ( ! pageView || ! pageView.model ) return null;
			const settings = pageView.model.get( 'settings' );
			if ( ! settings ) return null;
			const items = settings.get( 'list_items' );
			return items || null;
		} catch ( err ) {
			console.error( 'Features & Amenities: could not read panel model', err );
			return null;
		}
	}

	function copyToClipboard( text ) {
		const ta = document.createElement( 'textarea' );
		ta.value      = text;
		ta.style.position = 'fixed';
		ta.style.left = '-9999px';
		document.body.appendChild( ta );
		ta.select();
		let ok = false;
		try {
			ok = document.execCommand( 'copy' );
		} catch ( err ) {
			ok = false;
		}
		document.body.removeChild( ta );
		return ok;
	}

	// Strip HTML tags and leading anchor characters (U+2693 with optional
	// variation selector U+FE0E) from a chunk of Elementor icon-list text.
	function stripText( raw ) {
		if ( typeof raw !== 'string' ) return '';
		const tmp = document.createElement( 'div' );
		tmp.innerHTML = raw;
		let text = tmp.textContent || tmp.innerText || '';
		text = text.replace( /^[⚓︎\s]+/, '' );
		return text.trim();
	}

	// Walk any Elementor structure and collect every icon-list widget in
	// document order. Handles nested containers and section/column trees.
	function findIconListWidgets( root ) {
		const widgets = [];
		( function walk( node ) {
			if ( ! node || typeof node !== 'object' ) return;
			if ( Array.isArray( node ) ) {
				node.forEach( walk );
				return;
			}
			if ( node.elType === 'widget' && node.widgetType === 'icon-list' ) {
				widgets.push( node );
			}
			if ( Array.isArray( node.elements ) ) walk( node.elements );
			if ( Array.isArray( node.content ) )  walk( node.content );
		} )( root );
		return widgets;
	}

	// Transform an Elementor template JSON into the widget's list_items
	// array. Convention from the user's exports: each icon-list widget is
	// one section; first item in the list = section header (carries the
	// section icon), remaining items = amenities under that header.
	function transformElementorTemplate( json ) {
		const result   = [];
		const widgets  = findIconListWidgets( json );
		widgets.forEach( function ( widget ) {
			const items = ( widget.settings && Array.isArray( widget.settings.icon_list ) )
				? widget.settings.icon_list
				: [];
			if ( ! items.length ) return;

			// First item = section header
			result.push( {
				item_type: 'section',
				item_text: stripText( items[ 0 ].text || '' ),
				item_icon: items[ 0 ].selected_icon || { value: '', library: '' },
			} );

			// Remaining items = amenities
			for ( let i = 1; i < items.length; i++ ) {
				result.push( {
					item_type:        'amenity',
					item_text:        stripText( items[ i ].text || '' ),
					item_description: '',
					item_icon:        items[ i ].selected_icon || { value: '', library: '' },
				} );
			}
		} );
		return result;
	}

	$( document ).on( 'click', '[data-fal-export]', function ( e ) {
		e.preventDefault();
		const btn = this;

		const collection = getCurrentRepeaterCollection();
		if ( ! collection ) {
			window.alert( 'Could not access the list items. Make sure the Features & Amenities widget is selected in the editor.' );
			return;
		}

		const raw = ( typeof collection.toJSON === 'function' )
			? collection.toJSON()
			: ( Array.isArray( collection ) ? collection : [] );

		if ( ! raw.length ) {
			window.alert( 'The list is empty — nothing to export.' );
			return;
		}

		const cleaned = raw.map( function ( item ) {
			const c = Object.assign( {}, item );
			delete c._id;
			return c;
		} );

		const text = JSON.stringify( cleaned, null, 2 );
		const ok   = copyToClipboard( text );

		const original = btn.textContent;
		btn.textContent = ok ? 'Copied!' : 'Copy failed';
		setTimeout( function () { btn.textContent = original; }, 2000 );
	} );

	$( document ).on( 'click', '[data-fal-import]', function ( e ) {
		e.preventDefault();

		// Bail early if there's no panel context to write into.
		if ( ! getCurrentRepeaterCollection() ) {
			window.alert( 'Could not access the list items. Make sure the Features & Amenities widget is selected in the editor.' );
			return;
		}

		// Open a transient <input type="file"> picker. Hidden and removed
		// after a selection (or cancellation) so it doesn't accumulate.
		const fileInput  = document.createElement( 'input' );
		fileInput.type   = 'file';
		fileInput.accept = '.json,application/json';
		fileInput.style.display = 'none';
		document.body.appendChild( fileInput );

		fileInput.onchange = function () {
			const file = fileInput.files && fileInput.files[ 0 ];
			document.body.removeChild( fileInput );
			if ( ! file ) return;

			const reader = new FileReader();
			reader.onload = function ( evt ) {
				let json;
				try {
					json = JSON.parse( evt.target.result );
				} catch ( err ) {
					window.alert( 'Could not parse "' + file.name + '" as JSON: ' + err.message );
					return;
				}

				const listItems = transformElementorTemplate( json );
				if ( ! listItems.length ) {
					window.alert( 'No Icon List widgets were found in "' + file.name + '". This importer expects an Elementor container template containing one or more Icon List widgets.' );
					return;
				}

				const collection = getCurrentRepeaterCollection();
				if ( ! collection || typeof collection.reset !== 'function' ) {
					window.alert( 'Could not write to the list collection — unexpected control type.' );
					return;
				}

				try {
					collection.reset( listItems );
					const sectionCount = listItems.filter( function ( i ) { return i.item_type === 'section'; } ).length;
					const amenityCount = listItems.length - sectionCount;
					window.alert(
						'Imported ' + sectionCount + ' section(s) and ' + amenityCount + ' amenity item(s) from "' + file.name + '".'
					);
				} catch ( err ) {
					console.error( 'Features & Amenities import error:', err );
					window.alert( 'Import failed: ' + err.message );
				}
			};
			reader.onerror = function () {
				window.alert( 'Could not read "' + file.name + '".' );
			};
			reader.readAsText( file );
		};

		fileInput.click();
	} );
} )( jQuery );

