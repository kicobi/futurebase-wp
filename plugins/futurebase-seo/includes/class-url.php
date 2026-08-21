<?php
/**
 * URL validation helpers.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Validates URLs used in public SEO output.
 */
final class Url {
	/**
	 * Sanitize an absolute HTTP(S) canonical URL.
	 *
	 * Userinfo and fragments are rejected. Paths, queries, non-default ports,
	 * and cross-origin URLs are intentional parts of the V1 contract.
	 *
	 * @param mixed $value Candidate value.
	 */
	public static function canonical( mixed $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$value = trim( $value );
		if ( '' === $value || preg_match( '/[\x00-\x1F\x7F]/', $value ) ) {
			return '';
		}

		$parts = wp_parse_url( $value );
		if ( false === $parts ) {
			return '';
		}

		$scheme = strtolower( $parts['scheme'] ?? '' );
		$host   = $parts['host'] ?? '';
		if ( ! in_array( $scheme, array( 'http', 'https' ), true ) || '' === $host ) {
			return '';
		}

		if ( isset( $parts['user'] ) || isset( $parts['pass'] ) || array_key_exists( 'fragment', $parts ) ) {
			return '';
		}

		$sanitized = esc_url_raw( $value, array( 'http', 'https' ) );
		if ( '' === $sanitized ) {
			return '';
		}

		$sanitized_parts = wp_parse_url( $sanitized );
		if ( false === $sanitized_parts || isset( $sanitized_parts['user'] ) || isset( $sanitized_parts['pass'] ) || array_key_exists( 'fragment', $sanitized_parts ) ) {
			return '';
		}

		return $sanitized;
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
