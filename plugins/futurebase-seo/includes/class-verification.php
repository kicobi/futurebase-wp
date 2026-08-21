<?php
/**
 * Search-engine ownership verification output.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Emits stored verification tokens on the canonical homepage only.
 */
final class Verification {
	/**
	 * Register frontend output.
	 */
	public static function register(): void {
		add_action( 'wp_head', array( self::class, 'render' ), 4 );
	}

	/**
	 * Render exact verification meta elements.
	 */
	public static function render(): void {
		if ( ! self::is_canonical_front_page() ) {
			return;
		}

		$tokens = array(
			'google-site-verification' => Settings::verification_token( 'google' ),
			'msvalidate.01'            => Settings::verification_token( 'bing' ),
		);

		foreach ( $tokens as $name => $content ) {
			if ( '' !== $content ) {
				printf( '<meta name="%s" content="%s">' . "\n", esc_attr( $name ), esc_attr( $content ) );
			}
		}
	}

	/**
	 * Require the unpaged front page without query parameters.
	 */
	private static function is_canonical_front_page(): bool {
		if ( ! is_front_page() || is_paged() || 1 < max( 1, (int) get_query_var( 'page' ), (int) get_query_var( 'paged' ) ) ) {
			return false;
		}

		$query_string = isset( $_SERVER['QUERY_STRING'] ) && is_string( $_SERVER['QUERY_STRING'] ) ? wp_unslash( $_SERVER['QUERY_STRING'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Presence alone disqualifies output.
		return '' === trim( $query_string );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
