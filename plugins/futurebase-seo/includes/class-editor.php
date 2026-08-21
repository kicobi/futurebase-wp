<?php
/**
 * Block-editor integration.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Enqueues the document sidebar only through the runtime registrar.
 */
final class Editor {
	/**
	 * Register editor hooks.
	 */
	public static function register(): void {
		add_action( 'enqueue_block_editor_assets', array( self::class, 'enqueue_assets' ) );
	}

	/**
	 * Enqueue the compiled editor bundle for supported content types.
	 */
	public static function enqueue_assets(): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || '' === $screen->post_type || ! in_array( $screen->post_type, Metadata::post_types(), true ) ) {
			return;
		}

		$asset_file = dirname( FUTUREBASE_SEO_FILE ) . '/build/index.asset.php';
		if ( ! is_readable( $asset_file ) ) {
			return;
		}

		$asset = require $asset_file;
		if ( ! is_array( $asset ) ) {
			return;
		}

		wp_enqueue_script(
			FUTUREBASE_SEO_BUILD_HANDLE,
			plugins_url( 'build/index.js', FUTUREBASE_SEO_FILE ),
			isset( $asset['dependencies'] ) && is_array( $asset['dependencies'] ) ? $asset['dependencies'] : array(),
			isset( $asset['version'] ) && is_string( $asset['version'] ) ? $asset['version'] : FUTUREBASE_SEO_VERSION,
			true
		);
		wp_set_script_translations( FUTUREBASE_SEO_BUILD_HANDLE, 'futurebase-seo' );

		$style_path = dirname( FUTUREBASE_SEO_FILE ) . '/build/index.css';
		if ( is_readable( $style_path ) ) {
			wp_enqueue_style(
				FUTUREBASE_SEO_BUILD_HANDLE,
				plugins_url( 'build/index.css', FUTUREBASE_SEO_FILE ),
				array( 'wp-edit-blocks' ),
				(string) filemtime( $style_path )
			);
		}
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
