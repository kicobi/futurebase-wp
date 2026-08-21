/**
 * Media controls for Settings → SEO.
 */

import { __ } from '@wordpress/i18n';

import './settings.scss';

const mediaWarning = ( attachment, shouldWarn ) => {
	if ( ! shouldWarn || ! attachment?.id ) {
		return '';
	}

	const warnings = [];
	if (
		( attachment.width && attachment.width < 1200 ) ||
		( attachment.height && attachment.height < 630 )
	) {
		warnings.push(
			__(
				'This image is smaller than the recommended 1200 × 630 pixels.',
				'__compseo_text_domain__'
			)
		);
	}
	if ( ! attachment.alt?.trim() ) {
		warnings.push(
			__(
				'This image has no alternative text.',
				'__compseo_text_domain__'
			)
		);
	}

	return warnings.join( ' ' );
};

document.querySelectorAll( '[data-compseo-media]' ).forEach( ( field ) => {
	const input = field.querySelector( '[data-compseo-media-id]' );
	const preview = field.querySelector( '[data-compseo-media-preview]' );
	const selectButton = field.querySelector( '[data-compseo-media-select]' );
	const removeButton = field.querySelector( '[data-compseo-media-remove]' );
	const status = field.querySelector( '[data-compseo-media-status]' );

	if (
		! input ||
		! preview ||
		! selectButton ||
		! removeButton ||
		! status
	) {
		return;
	}

	selectButton.addEventListener( 'click', () => {
		const frame = window.wp.media( {
			title: __( 'Choose an image', '__compseo_text_domain__' ),
			button: {
				text: __( 'Use this image', '__compseo_text_domain__' ),
			},
			library: { type: 'image' },
			multiple: false,
		} );

		frame.on( 'select', () => {
			const attachment = frame
				.state()
				.get( 'selection' )
				.first()
				.toJSON();
			const image = document.createElement( 'img' );
			image.src = attachment.sizes?.medium?.url || attachment.url;
			image.alt = '';
			image.setAttribute( 'data-compseo-media-image', '' );
			preview.replaceChildren( image );
			input.value = String( attachment.id );
			selectButton.textContent = __(
				'Replace image',
				'__compseo_text_domain__'
			);
			removeButton.disabled = false;
			status.textContent = mediaWarning(
				attachment,
				field.dataset.warn === '1'
			);
		} );

		frame.open();
	} );

	removeButton.addEventListener( 'click', () => {
		selectButton.focus();
		input.value = '0';
		preview.replaceChildren();
		selectButton.textContent = __(
			'Select image',
			'__compseo_text_domain__'
		);
		removeButton.disabled = true;
		status.textContent = '';
	} );
} );
