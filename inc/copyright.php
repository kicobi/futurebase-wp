<?php
/**
 * Copyright binding shared by saved footer blocks and the editor.
 *
 * @package futurebase
 */

/**
 * Return the translated format for the complete bound paragraph.
 *
 * @return string
 */
function futurebase_copyright_format() {
	/* translators: 1: current year, 2: site title. */
	return __( '© %1$s %2$s. All rights reserved.', 'futurebase' );
}

/**
 * Return plain text using WordPress's timezone and current site title.
 *
 * @return string
 */
function futurebase_copyright_text() {
	return sprintf( futurebase_copyright_format(), wp_date( 'Y' ), get_bloginfo( 'name' ) );
}

/**
 * Register a source whose metadata survives Site Editor saves.
 *
 * @return void
 */
function futurebase_register_copyright_binding() {
	register_block_bindings_source(
		'futurebase/copyright',
		array(
			'label'              => __( 'Copyright', 'futurebase' ),
			'get_value_callback' => static function () {
				return esc_html( futurebase_copyright_text() );
			},
		)
	);
}
add_action( 'init', 'futurebase_register_copyright_binding' );

/**
 * Supply the same format and timezone year to the editor preview.
 *
 * @return void
 */
function futurebase_enqueue_copyright_editor() {
	$asset_path = get_theme_file_path( 'build/editor.asset.php' );
	if ( ! file_exists( $asset_path ) ) {
		return;
	}
	$asset = require $asset_path;
	wp_enqueue_script( 'futurebase-editor', get_theme_file_uri( 'build/editor.js' ), $asset['dependencies'], $asset['version'], true );
	wp_add_inline_script(
		'futurebase-editor',
		'window.futurebase_copyright = ' . wp_json_encode(
			array(
				'format' => futurebase_copyright_format(),
				'year'   => wp_date( 'Y' ),
				'title'  => get_bloginfo( 'name' ),
			),
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
		) . ';',
		'before'
	);
}
add_action( 'enqueue_block_editor_assets', 'futurebase_enqueue_copyright_editor' );
