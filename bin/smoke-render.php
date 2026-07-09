<?php
/**
 * Render smoke test — every registered <namespace>/section-* pattern must
 * produce non-empty, error-free output through do_blocks().
 *
 * Run via WP-CLI inside the WordPress environment:
 *   wp eval-file bin/smoke-render.php
 *
 * URL-level assertions (page-notitle, non-empty archives) live in
 * bin/smoke-render.sh — this file only exercises pattern rendering.
 *
 * @package bin
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	echo "smoke-render.php must run via `wp eval-file`.\n";
	exit( 1 );
}

// Closure scope keeps WPCS PrefixAllGlobals quiet — CLI tooling, not theme code.
call_user_func(
	function () {

		$registry = WP_Block_Patterns_Registry::get_instance();
		$sections = array();
		foreach ( $registry->get_all_registered() as $registered ) {
			if ( preg_match( '#/section-[a-z0-9-]+$#', $registered['name'] ) ) {
				$sections[] = $registered;
			}
		}

		if ( count( $sections ) < 4 ) {
			WP_CLI::error( 'Expected at least the four baseline section patterns, found ' . count( $sections ) . '.' );
		}

		$failures = array();
		foreach ( $sections as $pattern ) {
			$rendered = do_blocks( $pattern['content'] );
			if ( '' === trim( $rendered ) ) {
				$failures[] = $pattern['name'] . ': rendered empty';
				continue;
			}
			if ( false !== strpos( $rendered, '<b>Warning</b>' ) || false !== strpos( $rendered, '<b>Fatal error</b>' ) ) {
				$failures[] = $pattern['name'] . ': PHP error in rendered output';
			}
		}

		if ( ! empty( $failures ) ) {
			WP_CLI::error( implode( "\n", $failures ) );
		}

		WP_CLI::log( 'smoke-render: ' . count( $sections ) . ' section patterns render OK' );
	}
);
