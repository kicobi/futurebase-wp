<?php
/**
 * Companion SEO plugin registrar.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Owns plugin registration.
 *
 * PR 1 deliberately registers no WordPress hooks. Later feature modules will
 * pass through this boundary so third-party suppression is enforced once.
 */
final class Plugin {
	/**
	 * Register the plugin.
	 */
	public static function register(): void {
		// Intentionally inert until the metadata/output implementation lands.
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
