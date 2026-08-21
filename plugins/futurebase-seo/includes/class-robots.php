<?php
/**
 * Singular robots directives.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Makes per-post noindex and password protection effective immediately.
 */
final class Robots {
	/**
	 * Add noindex, follow for opted-out or password-protected singulars.
	 *
	 * @param array<string, bool|string> $robots Existing directives.
	 * @return array<string, bool|string>
	 */
	public static function filter( array $robots ): array {
		if ( ! get_option( 'blog_public' ) ) {
			return $robots;
		}

		$context = Context::current();
		if ( 'singular' !== $context['kind'] || $context['object_id'] < 1 ) {
			return $robots;
		}

		$noindex = ! empty( $context['password_protected'] ) || Metadata::sanitize_noindex( get_post_meta( $context['object_id'], Identifiers::META_NOINDEX, true ) );
		if ( ! $noindex ) {
			return $robots;
		}

		unset( $robots['index'], $robots['nofollow'] );
		$robots['noindex'] = true;
		$robots['follow']  = true;

		return $robots;
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
