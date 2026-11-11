<?php
/**
 * Central indexing-decision resolver.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Produces the validated robots and canonical decision for one request.
 */
final class Decision {
	/**
	 * Resolve and filter one request decision.
	 *
	 * @param array<string, mixed>|null $context Optional request context.
	 * @return array{index: string, follow: string, canonical: string|null, reason: string}
	 */
	public static function resolve( ?array $context = null ): array {
		$context ??= Context::current();
		$internal = self::internal( $context );
		$filtered = Contracts::indexing_decision( $internal, $context );

		return ! get_option( 'blog_public' ) ? $internal : $filtered;
	}

	/**
	 * Resolve the internal policy before project adapters run.
	 *
	 * @param array<string, mixed> $context Request context.
	 * @return array{index: string, follow: string, canonical: string|null, reason: string}
	 */
	private static function internal( array $context ): array {
		$kind      = isset( $context['kind'] ) && is_string( $context['kind'] ) ? $context['kind'] : 'unknown';
		$object_id = absint( $context['object_id'] ?? 0 );

		if ( ! get_option( 'blog_public' ) ) {
			return self::decision( 'noindex', 'nofollow', null, 'site_private' );
		}

		if ( 'feed' === $kind ) {
			return self::decision( 'inherit', 'inherit', null, 'core_owned_feed' );
		}
		if ( 'embed' === $kind ) {
			return self::decision( 'inherit', 'inherit', null, 'core_owned_embed' );
		}
		if ( 'search' === $kind ) {
			return self::decision( 'noindex', 'follow', null, 'search' );
		}
		if ( 'not_found' === $kind ) {
			return self::decision( 'noindex', 'follow', null, 'not_found' );
		}

		if ( 'attachment' === $kind ) {
			if ( ! (bool) get_option( 'wp_attachment_pages_enabled', true ) ) {
				return self::decision( 'inherit', 'inherit', null, 'attachment_redirected' );
			}

			return self::decision( 'noindex', 'follow', Canonical::base( $context ), 'attachment_live' );
		}

		if ( 'singular' === $kind || ( 'home' === $kind && ! is_home() ) ) {
			return self::singular( $context, $object_id );
		}

		if ( 'home' === $kind && is_home() ) {
			return self::archive( $context, Policy::value( 'blog' ), 'content_archive' );
		}

		if ( 'archive' === $kind ) {
			if ( is_author() ) {
				return self::archive( $context, Policy::value( 'author' ), 'author_archive' );
			}
			if ( is_date() ) {
				return self::archive( $context, Policy::value( 'date' ), 'date_archive' );
			}

			$taxonomy = isset( $context['taxonomy'] ) && is_string( $context['taxonomy'] ) ? $context['taxonomy'] : '';
			if ( '' !== $taxonomy && isset( Policy::taxonomies()[ $taxonomy ] ) ) {
				return self::archive( $context, Policy::value( 'taxonomy', $taxonomy ), 'content_archive' );
			}

			$post_type = isset( $context['post_type'] ) && is_string( $context['post_type'] ) ? $context['post_type'] : '';
			if ( '' !== $post_type && isset( Policy::post_types()[ $post_type ] ) ) {
				return self::archive( $context, Policy::value( 'post_type', $post_type ), 'content_archive' );
			}
		}

		return self::decision( 'noindex', 'follow', Canonical::self_url( $context, self::meaningful_query_args( $context ) ), 'unknown_route' );
	}

	/**
	 * Resolve one singular or static-front-page decision.
	 *
	 * @param array<string, mixed> $context   Request context.
	 * @param int                  $object_id Post ID.
	 * @return array{index: string, follow: string, canonical: string|null, reason: string}
	 */
	private static function singular( array $context, int $object_id ): array {
		if ( ! empty( $context['password_protected'] ) ) {
			return self::decision( 'noindex', 'follow', Canonical::base( $context ), 'password_protected' );
		}

		$noindex = $object_id > 0 && Metadata::sanitize_noindex( get_post_meta( $object_id, Identifiers::META_NOINDEX, true ) );
		return self::decision(
			$noindex ? 'noindex' : 'inherit',
			$noindex ? 'follow' : 'inherit',
			Canonical::base( $context ),
			$noindex ? 'singular_noindex' : 'singular_default'
		);
	}

	/**
	 * Apply query-state rules to one configured archive policy.
	 *
	 * @param array<string, mixed> $context Request context.
	 * @param string               $policy  Configured index/noindex value.
	 * @param string               $reason  Base reason code.
	 * @return array{index: string, follow: string, canonical: string|null, reason: string}
	 */
	private static function archive( array $context, string $policy, string $reason ): array {
		$query_args = isset( $context['query_args'] ) && is_array( $context['query_args'] ) ? $context['query_args'] : array();
		$meaningful = self::meaningful_query_args( $context );

		if ( ! empty( $query_args ) && empty( $meaningful ) ) {
			$tracking = array_filter( array_keys( $query_args ), static fn( string|int $name ): bool => self::is_tracking_argument( (string) $name ) );
			return self::policy_decision( $policy, Canonical::self_url( $context ), empty( $tracking ) ? $reason : 'tracking_only' );
		}

		if ( ! empty( $meaningful ) ) {
			$indexable = Contracts::indexable_query_vars( array() );
			if ( empty( array_diff( array_keys( $meaningful ), $indexable ) ) ) {
				return self::policy_decision( $policy, Canonical::self_url( $context, $meaningful ), 'declared_indexable_query' );
			}

			return self::policy_decision( Policy::value( 'filtered' ), Canonical::self_url( $context, $meaningful ), 'filtered_query' );
		}

		return self::policy_decision( $policy, Canonical::self_url( $context ), $reason );
	}

	/**
	 * Remove known tracking arguments and retain meaningful query state.
	 *
	 * @param array<string, mixed> $context Request context.
	 * @return array<string, mixed>
	 */
	private static function meaningful_query_args( array $context ): array {
		$query_args = isset( $context['query_args'] ) && is_array( $context['query_args'] ) ? $context['query_args'] : array();
		$query_args = array_diff_key( $query_args, Context::routing_query_args( $context ) );
		foreach ( array_keys( $query_args ) as $name ) {
			if ( in_array( $name, array( 'page', 'paged' ), true ) || self::is_tracking_argument( (string) $name ) ) {
				unset( $query_args[ $name ] );
			}
		}
		ksort( $query_args );
		return $query_args;
	}

	/**
	 * Whether a query argument is attribution-only tracking state.
	 *
	 * @param string $name Query-variable name.
	 */
	private static function is_tracking_argument( string $name ): bool {
		$name = strtolower( $name );
		return str_starts_with( $name, 'utm_' ) || in_array( $name, array( 'gclid', 'fbclid', 'msclkid' ), true );
	}

	/**
	 * Convert a two-state saved policy into the decision tri-state.
	 *
	 * @param string      $policy    Saved index/noindex policy.
	 * @param string|null $canonical Canonical URL or null.
	 * @param string      $reason    Stable reason code.
	 * @return array{index: string, follow: string, canonical: string|null, reason: string}
	 */
	private static function policy_decision( string $policy, ?string $canonical, string $reason ): array {
		return self::decision( Policy::NOINDEX === $policy ? 'noindex' : 'index', 'follow', $canonical, $reason );
	}

	/**
	 * Build a typed decision payload.
	 *
	 * @param string      $index     Index directive or inherit.
	 * @param string      $follow    Follow directive or inherit.
	 * @param string|null $canonical Canonical URL or null.
	 * @param string      $reason    Stable reason code.
	 * @return array{index: string, follow: string, canonical: string|null, reason: string}
	 */
	private static function decision( string $index, string $follow, ?string $canonical, string $reason ): array {
		return array(
			'index'     => $index,
			'follow'    => $follow,
			'canonical' => $canonical,
			'reason'    => $reason,
		);
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
