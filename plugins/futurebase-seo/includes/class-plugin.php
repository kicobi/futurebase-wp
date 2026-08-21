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
 * Every runtime feature passes through this boundary so third-party
 * suppression is enforced once. Management and diagnostics may register
 * outside register_runtime() in later releases; frontend output, REST meta,
 * editor assets, robots, schema, and sitemaps must stay inside it.
 */
final class Plugin {
	/**
	 * Whether runtime hooks have already been registered.
	 *
	 * @var bool
	 */
	private static bool $runtime_registered = false;

	/**
	 * Register the plugin.
	 */
	public static function register(): void {
		Admin::register();
		Cli::register();
		add_action( 'plugins_loaded', array( self::class, 'register_runtime' ), 100 );
	}

	/**
	 * Register all public runtime behavior when no blessed provider owns SEO.
	 */
	public static function register_runtime(): void {
		if ( self::$runtime_registered || Suppression::is_suppressed() ) {
			return;
		}

		self::$runtime_registered = true;

		add_action( 'init', array( Metadata::class, 'register' ), 20 );
		add_action( 'wp', array( Document::class, 'prepare' ), 10, 0 );
		add_filter( 'get_canonical_url', array( Canonical::class, 'filter_singular' ), 10, 2 );
		add_filter( 'wp_robots', array( Robots::class, 'filter' ) );
		Sitemaps::register();
		Editor::register();
		Verification::register();
		add_action( 'wp_head', array( Output::class, 'render' ), 5 );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
