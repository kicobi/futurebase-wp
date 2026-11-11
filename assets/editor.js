import { registerBlockBindingsSource } from '@wordpress/blocks';
import { store as coreDataStore } from '@wordpress/core-data';
import { escapeHTML } from '@wordpress/escape-html';
import { __, sprintf } from '@wordpress/i18n';

const copyright = window.futurebase_copyright;

registerBlockBindingsSource( {
	name: 'futurebase/copyright',
	label: __( 'Copyright', 'futurebase' ),
	getValues: ( { select } ) => ( {
		content: escapeHTML(
			// The translated PHP format is shared with the frontend binding.
			// eslint-disable-next-line @wordpress/valid-sprintf
			sprintf(
				copyright.format,
				copyright.year,
				select( coreDataStore ).getEditedEntityRecord( 'root', 'site' )
					?.title ?? copyright.title
			)
		),
	} ),
	// No setValues callback: core renders this binding as read-only.
} );
