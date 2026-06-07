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

	const PROMPT_MSG = 'Paste your JSON configuration here (must be a JSON array of items):';

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

		const jsonStr = window.prompt( PROMPT_MSG );
		if ( ! jsonStr ) return;

		let data;
		try {
			data = JSON.parse( jsonStr );
		} catch ( err ) {
			window.alert( 'Error parsing JSON: ' + err.message );
			return;
		}

		if ( ! Array.isArray( data ) ) {
			window.alert( 'Error: JSON must be an array of items.' );
			return;
		}

		const collection = getCurrentRepeaterCollection();
		if ( ! collection ) {
			window.alert( 'Could not access the list items. Make sure the Features & Amenities widget is selected in the editor.' );
			return;
		}

		// Repeater values are Backbone collections; .reset() replaces all
		// items in place and triggers the panel + preview re-render.
		if ( typeof collection.reset === 'function' ) {
			try {
				collection.reset( data );
				window.alert( 'Imported ' + data.length + ' item(s).' );
			} catch ( err ) {
				console.error( 'Features & Amenities import error:', err );
				window.alert( 'Import failed: ' + err.message );
			}
		} else {
			window.alert( 'Could not write to the list collection — unexpected control type.' );
		}
	} );
} )( jQuery );
