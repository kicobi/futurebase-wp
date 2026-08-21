/**
 * Companion SEO document sidebar.
 */

import { MediaUpload, MediaUploadCheck } from '@wordpress/block-editor';
import {
	Button,
	Notice,
	TextControl,
	TextareaControl,
	ToggleControl,
} from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { registerPlugin } from '@wordpress/plugins';

import './index.scss';

const META = {
	title: '_compseo_title',
	description: '_compseo_description',
	noindex: '_compseo_noindex',
	canonical: '_compseo_canonical',
	socialImage: '_compseo_social_image_id',
};

const characterCount = ( value ) => Array.from( value || '' ).length;

const counterHelp = ( value, recommendation, label ) => {
	const count = characterCount( value );
	const countText = sprintf(
		/* translators: 1: field label, 2: character count, 3: recommendation. */
		__(
			'%1$s: %2$d characters. Recommended maximum: %3$d.',
			'__compseo_text_domain__'
		),
		label,
		count,
		recommendation
	);

	return count > recommendation
		? sprintf(
				/* translators: %s: character-count summary. */
				__(
					'%s Search engines may shorten this value.',
					'__compseo_text_domain__'
				),
				countText
		  )
		: countText;
};

const isValidCanonical = ( value ) => {
	if ( ! value ) {
		return true;
	}

	try {
		const parsed = new URL( value );
		return (
			[ 'http:', 'https:' ].includes( parsed.protocol ) &&
			! parsed.username &&
			! parsed.password &&
			! parsed.hash
		);
	} catch {
		return false;
	}
};

const SocialImageControl = ( { imageId, onChange } ) => {
	const selectButton = useRef();
	const media = useSelect(
		( select ) => ( imageId ? select( 'core' ).getMedia( imageId ) : null ),
		[ imageId ]
	);
	const details = media?.media_details || {};
	const warnings = [];

	if (
		media &&
		( ( details.width && details.width < 1200 ) ||
			( details.height && details.height < 630 ) )
	) {
		warnings.push(
			__(
				'This image is smaller than the recommended 1200 × 630 pixels.',
				'__compseo_text_domain__'
			)
		);
	}
	if ( media && ! media.alt_text?.trim() ) {
		warnings.push(
			__(
				'This image has no alternative text.',
				'__compseo_text_domain__'
			)
		);
	}

	return (
		<fieldset className="compseo-editor__stack compseo-editor__media">
			<legend>{ __( 'Social image', '__compseo_text_domain__' ) }</legend>
			{ media?.source_url && (
				<img
					className="compseo-editor__image"
					src={ media.source_url }
					alt=""
				/>
			) }
			<MediaUploadCheck>
				<MediaUpload
					onSelect={ ( selection ) => onChange( selection.id || 0 ) }
					allowedTypes={ [ 'image' ] }
					value={ imageId || undefined }
					render={ ( { open } ) => (
						<div className="compseo-editor__cluster">
							<Button
								variant="secondary"
								onClick={ open }
								ref={ selectButton }
							>
								{ imageId
									? __(
											'Replace image',
											'__compseo_text_domain__'
									  )
									: __(
											'Select image',
											'__compseo_text_domain__'
									  ) }
							</Button>
							{ imageId > 0 && (
								<Button
									variant="tertiary"
									isDestructive
									onClick={ () => {
										onChange( 0 );
										window.setTimeout(
											() => selectButton.current?.focus(),
											0
										);
									} }
								>
									{ __(
										'Remove image',
										'__compseo_text_domain__'
									) }
								</Button>
							) }
						</div>
					) }
				/>
			</MediaUploadCheck>
			{ warnings.length > 0 && (
				<Notice status="warning" isDismissible={ false }>
					{ warnings.join( ' ' ) }
				</Notice>
			) }
		</fieldset>
	);
};

const SeoPanel = () => {
	const { editPost } = useDispatch( 'core/editor' );
	const { meta, password } = useSelect(
		( select ) => ( {
			meta:
				select( 'core/editor' ).getEditedPostAttribute( 'meta' ) || {},
			password:
				select( 'core/editor' ).getEditedPostAttribute( 'password' ) ||
				'',
		} ),
		[]
	);

	const updateMeta = ( key, value ) =>
		editPost( { meta: { ...meta, [ key ]: value } } );

	const title = meta[ META.title ] || '';
	const description = meta[ META.description ] || '';
	const canonical = meta[ META.canonical ] || '';

	return (
		<PluginDocumentSettingPanel
			name="companion-seo"
			title={ __( 'SEO', '__compseo_text_domain__' ) }
			className="compseo-editor"
		>
			<div className="compseo-editor__stack">
				{ password && (
					<Notice status="warning" isDismissible={ false }>
						{ __(
							'This post is password protected. Only deliberately authored SEO fields can appear publicly; content, excerpts, featured images, and Article schema remain excluded.',
							'__compseo_text_domain__'
						) }
					</Notice>
				) }

				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Document title', '__compseo_text_domain__' ) }
					value={ title }
					onChange={ ( value ) => updateMeta( META.title, value ) }
					help={ counterHelp(
						title,
						70,
						__( 'Title length', '__compseo_text_domain__' )
					) }
				/>
				<p className="compseo-editor__help">
					{ __(
						'This is the complete title. No separator or site-name suffix is added.',
						'__compseo_text_domain__'
					) }
				</p>

				<TextareaControl
					__nextHasNoMarginBottom
					label={ __(
						'Meta description',
						'__compseo_text_domain__'
					) }
					value={ description }
					onChange={ ( value ) =>
						updateMeta( META.description, value )
					}
					help={ counterHelp(
						description,
						180,
						__( 'Description length', '__compseo_text_domain__' )
					) }
				/>

				<ToggleControl
					__nextHasNoMarginBottom
					label={ __(
						'Ask search engines not to index this page',
						'__compseo_text_domain__'
					) }
					checked={ Boolean( meta[ META.noindex ] ) }
					onChange={ ( value ) => updateMeta( META.noindex, value ) }
					help={ __(
						'This requests noindex but does not make the page private. Anyone with its URL can still visit it.',
						'__compseo_text_domain__'
					) }
				/>

				<TextControl
					__next40pxDefaultSize
					__nextHasNoMarginBottom
					label={ __( 'Canonical URL', '__compseo_text_domain__' ) }
					type="url"
					value={ canonical }
					onChange={ ( value ) =>
						updateMeta( META.canonical, value )
					}
					help={ __(
						'Optional absolute HTTP or HTTPS URL. Credentials and fragments are not allowed.',
						'__compseo_text_domain__'
					) }
				/>
				{ ! isValidCanonical( canonical ) && (
					<Notice status="warning" isDismissible={ false }>
						{ __(
							'Enter a valid absolute HTTP or HTTPS canonical URL without credentials or a fragment.',
							'__compseo_text_domain__'
						) }
					</Notice>
				) }

				<SocialImageControl
					imageId={ Number( meta[ META.socialImage ] ) || 0 }
					onChange={ ( value ) =>
						updateMeta( META.socialImage, value )
					}
				/>
			</div>
		</PluginDocumentSettingPanel>
	);
};

registerPlugin( 'companion-seo', { render: SeoPanel } );
