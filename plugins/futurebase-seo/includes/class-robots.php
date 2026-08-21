<?php
/**
 * Singular robots directives.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Applies the central indexing decision without disturbing core directives.
 */
final class Robots {
	/**
	 * Apply explicit index/follow values while preserving inherited directives.
	 *
	 * @param array<string, bool|string> $robots Existing directives.
	 * @return array<string, bool|string>
	 */
	public static function filter( array $robots ): array {
		$decision = Decision::resolve();

		if ( 'index' === $decision['index'] ) {
			unset( $robots['noindex'] );
			$robots['index'] = true;
		} elseif ( 'noindex' === $decision['index'] ) {
			unset( $robots['index'] );
			$robots['noindex'] = true;
		}

		if ( 'follow' === $decision['follow'] ) {
			unset( $robots['nofollow'] );
			$robots['follow'] = true;
		} elseif ( 'nofollow' === $decision['follow'] ) {
			unset( $robots['follow'] );
			$robots['nofollow'] = true;
		}

		return $robots;
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
