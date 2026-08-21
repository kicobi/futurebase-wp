<?php
/**
 * Native WordPress sitemap integration.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Applies companion indexing policy to core sitemap providers and queries.
 */
final class Sitemaps {
	/**
	 * Register native sitemap filters through the shared runtime boundary.
	 */
	public static function register(): void {
		add_filter( 'wp_sitemaps_posts_query_args', array( self::class, 'posts_query_args' ), 10, 2 );
		add_filter( 'wp_sitemaps_taxonomies', array( self::class, 'taxonomies' ) );
		add_filter( 'wp_sitemaps_add_provider', array( self::class, 'provider' ), 10, 2 );
	}

	/**
	 * Exclude singular content that must not appear in a native sitemap.
	 *
	 * The two nested metadata conditions are folded into the sitemap's existing
	 * WP_Query. No per-entry metadata lookups are performed. Password exclusion
	 * uses WP_Query's posts-table condition.
	 *
	 * @param array<string, mixed> $args      Core sitemap query arguments.
	 * @param string               $post_type Post-type slug.
	 * @return array<string, mixed>
	 */
	public static function posts_query_args( array $args, string $post_type ): array {
		unset( $post_type );

		$companion_query = array(
			'relation' => 'AND',
			array(
				'relation' => 'OR',
				array(
					'key'     => Identifiers::META_NOINDEX,
					'compare' => 'NOT EXISTS',
				),
				array(
					'key'     => Identifiers::META_NOINDEX,
					'value'   => '1',
					'compare' => '!=',
				),
			),
			array(
				'relation' => 'OR',
				array(
					'key'     => Identifiers::META_CANONICAL,
					'compare' => 'NOT EXISTS',
				),
				array(
					'key'     => Identifiers::META_CANONICAL,
					'value'   => '',
					'compare' => '=',
				),
				array(
					'key'     => Identifiers::META_CANONICAL,
					'value'   => self::same_origin_pattern(),
					'compare' => 'REGEXP',
				),
			),
		);

		$existing = $args['meta_query'] ?? array();
		if ( is_array( $existing ) && ! empty( $existing ) ) {
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- The documented two-condition sitemap cost avoids per-entry queries and composes with existing constraints.
			$args['meta_query'] = array(
				'relation' => 'AND',
				$existing,
				$companion_query,
			);
		} else {
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- The documented two-condition sitemap cost avoids per-entry queries.
			$args['meta_query'] = $companion_query;
		}

		$args['has_password'] = false;
		return $args;
	}

	/**
	 * Remove taxonomy sitemap subtypes configured as noindex.
	 *
	 * @param array<string, \WP_Taxonomy> $taxonomies Registered public taxonomies.
	 * @return array<string, \WP_Taxonomy>
	 */
	public static function taxonomies( array $taxonomies ): array {
		foreach ( array_keys( $taxonomies ) as $taxonomy ) {
			if ( Policy::NOINDEX === Policy::value( 'taxonomy', (string) $taxonomy ) ) {
				unset( $taxonomies[ $taxonomy ] );
			}
		}

		return $taxonomies;
	}

	/**
	 * Remove the native users provider when author archives are noindex.
	 *
	 * @param mixed  $provider Core sitemap provider.
	 * @param string $name     Provider name.
	 */
	public static function provider( mixed $provider, string $name ): mixed {
		if ( 'users' === $name && Policy::NOINDEX === Policy::value( 'author' ) ) {
			return false;
		}

		return $provider;
	}

	/**
	 * Build a MySQL-compatible regular expression for the site's HTTP origin.
	 *
	 * Default ports are optional because their explicit and implicit forms share
	 * an origin. Non-default ports must match exactly.
	 */
	private static function same_origin_pattern(): string {
		$parts        = wp_parse_url( home_url( '/' ) );
		$scheme       = is_array( $parts ) && isset( $parts['scheme'] ) ? strtolower( (string) $parts['scheme'] ) : 'https';
		$host         = is_array( $parts ) && isset( $parts['host'] ) ? strtolower( (string) $parts['host'] ) : '';
		$port         = is_array( $parts ) && isset( $parts['port'] ) ? (int) $parts['port'] : 0;
		$default_port = 'https' === $scheme ? 443 : 80;
		$port_pattern = 0 === $port || $default_port === $port ? '(:' . $default_port . ')?' : ':' . $port;

		return '^' . preg_quote( $scheme, '~' ) . '://' . preg_quote( $host, '~' ) . $port_pattern . '(/|$)';
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
