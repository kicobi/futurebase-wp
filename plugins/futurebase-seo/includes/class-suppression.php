<?php
/**
 * Blessed-provider suppression.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Detects whether another plugin owns SEO output.
 */
final class Suppression {
	/**
	 * Return the detected provider, if any.
	 */
	public static function provider(): ?string {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return 'yoast';
		}

		if ( defined( 'RANK_MATH_VERSION' ) ) {
			return 'rank_math';
		}

		return null;
	}

	/**
	 * Resolve the final suppression decision.
	 */
	public static function is_suppressed(): bool {
		$provider = self::provider();
		return Contracts::suppression( null !== $provider, $provider );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
