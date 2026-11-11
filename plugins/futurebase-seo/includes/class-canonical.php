<?php
/**
 * Canonical URL resolution.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Preserves core singular canonicals and fills the contexts core omits.
 */
final class Canonical {
	/**
	 * Replace core's singular canonical only when an override is authored.
	 *
	 * @param string|false $canonical Core canonical.
	 * @param \WP_Post     $post      Current post.
	 * @return string|false
	 */
	public static function filter_singular( string|false $canonical, \WP_Post $post ): string|false {
		if ( 'attachment' === $post->post_type ) {
			return $canonical;
		}

		$document = Document::prepared();
		if ( null !== $document && is_singular() && get_queried_object_id() === $post->ID ) {
			return $document['canonical'] ?? false;
		}

		$override = Url::canonical( get_post_meta( $post->ID, Identifiers::META_CANONICAL, true ) );
		return '' !== $override ? $override : $canonical;
	}

	/**
	 * Resolve the canonical used by social and schema output.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	public static function resolve( array $context ): ?string {
		$decision = Decision::resolve( $context );
		return $decision['canonical'];
	}

	/**
	 * Enforce one coherent canonical after indexing and document adapters run.
	 *
	 * Indexable documents retain the document adapter contract. Noindex state is
	 * owned by the indexing decision: a null stays null, same-document query
	 * state is retained, and a cross-document signal falls back to self.
	 *
	 * @param string|null          $document_canonical Filtered document canonical.
	 * @param array<string, mixed> $decision           Validated indexing decision.
	 * @param array<string, mixed> $context            Request context.
	 */
	public static function cohere( ?string $document_canonical, array $decision, array $context ): ?string {
		if ( ! get_option( 'blog_public' ) ) {
			return null;
		}

		if ( 'noindex' !== ( $decision['index'] ?? '' ) ) {
			return $document_canonical;
		}

		$decision_canonical = isset( $decision['canonical'] ) && is_string( $decision['canonical'] ) ? Url::canonical( $decision['canonical'] ) : '';
		if ( '' === $decision_canonical ) {
			return null;
		}

		$self = self::current_document_url( $context );
		if ( null === $self ) {
			return null;
		}

		return self::same_document( $decision_canonical, $self, $context ) ? $decision_canonical : $self;
	}

	/**
	 * Resolve the unfiltered canonical for singular and self-owned contexts.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	public static function base( array $context ): ?string {
		$kind      = isset( $context['kind'] ) && is_string( $context['kind'] ) ? $context['kind'] : 'unknown';
		$object_id = isset( $context['object_id'] ) ? absint( $context['object_id'] ) : 0;

		if ( 'singular' === $kind && $object_id > 0 ) {
			$override = Url::canonical( get_post_meta( $object_id, Identifiers::META_CANONICAL, true ) );
			if ( '' !== $override ) {
				return $override;
			}

			$core = wp_get_canonical_url( $object_id );
			return is_string( $core ) && '' !== Url::canonical( $core ) ? Url::canonical( $core ) : null;
		}

		if ( 'home' === $kind && is_singular() && $object_id > 0 ) {
			$override = Url::canonical( get_post_meta( $object_id, Identifiers::META_CANONICAL, true ) );
			if ( '' !== $override ) {
				return $override;
			}

			$core = wp_get_canonical_url( $object_id );
			return is_string( $core ) && '' !== Url::canonical( $core ) ? Url::canonical( $core ) : null;
		}
		if ( 'attachment' === $kind && $object_id > 0 ) {
			$url = get_attachment_link( $object_id );
			return '' !== Url::canonical( $url ) ? Url::canonical( $url ) : null;
		}

		if ( ! in_array( $kind, array( 'home', 'archive', 'unknown' ), true ) ) {
			return null;
		}

		return self::self_url( $context );
	}

	/**
	 * Build a normalized same-page canonical with selected query arguments.
	 *
	 * @param array<string, mixed> $context    Request context.
	 * @param array<string, mixed> $query_args Query arguments to retain.
	 */
	public static function self_url( array $context, array $query_args = array() ): ?string {
		$kind  = isset( $context['kind'] ) && is_string( $context['kind'] ) ? $context['kind'] : 'unknown';
		$paged = isset( $context['paged'] ) ? max( 1, absint( $context['paged'] ) ) : 1;
		$url   = in_array( $kind, array( 'home', 'archive' ), true ) ? get_pagenum_link( $paged, false ) : (string) ( $context['url'] ?? '' );
		// Replace the entire query: WordPress's query mutation helpers normalize
		// dotted keys through parse_str(), which changes document identity.
		$url     = explode( '?', $url, 2 )[0];
		$routing = Context::routing_query_args( $context );
		if ( in_array( $kind, array( 'home', 'archive' ), true ) && empty( get_option( 'permalink_structure' ) ) && $paged > 1 ) {
			$routing['paged'] = $paged;
		}
		$query_args = array_merge( $routing, $query_args );
		if ( ! empty( $query_args ) ) {
			ksort( $query_args );
			$url .= '?' . http_build_query( $query_args, '', '&', PHP_QUERY_RFC3986 );
		}

		$url = Url::canonical( $url );
		return '' !== $url ? $url : null;
	}

	/**
	 * Whether the plugin must print a canonical rather than leaving core's
	 * singular rel_canonical() callback to do so.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	public static function should_render( array $context ): bool {
		$kind = $context['kind'] ?? '';
		return in_array( $kind, array( 'home', 'archive' ), true ) && ! is_singular();
	}

	/**
	 * Compare path and native routing state, allowing same-document filters.
	 *
	 * @param string               $left  Candidate canonical.
	 * @param string               $right Normalized current-document URL.
	 * @param array<string, mixed> $context Current request.
	 */
	private static function same_document( string $left, string $right, array $context ): bool {
		$left_parts  = wp_parse_url( $left );
		$right_parts = wp_parse_url( $right );
		if ( ! is_array( $left_parts ) || ! is_array( $right_parts ) ) {
			return false;
		}

		$routing_keys = array_merge(
			array( 'p', 'page_id', 'pagename', 'name', 'attachment', 'attachment_id', 'cat', 'category_name', 'tag', 'tag_id', 'taxonomy', 'term', 'post_type', 'author', 'author_name', 'm', 'year', 'monthnum', 'day', 'hour', 'minute', 'second', 'w', 'page', 'paged' ),
			array_keys( Context::routing_query_args( $context ) )
		);
		$identity     = static function ( array $parts ) use ( $routing_keys ): array {
			$scheme = strtolower( (string) ( $parts['scheme'] ?? '' ) );
			$port   = isset( $parts['port'] ) ? (int) $parts['port'] : ( 'https' === $scheme ? 443 : 80 );
			$path   = '/' . ltrim( (string) ( $parts['path'] ?? '' ), '/' );
			if ( '/' !== $path ) {
				$path = untrailingslashit( $path );
			}
			$query = array();
			wp_parse_str( (string) ( $parts['query'] ?? '' ), $query );
			$routing = array_intersect_key( $query, array_fill_keys( $routing_keys, true ) );
			ksort( $routing );

			return array(
				$scheme,
				strtolower( (string) ( $parts['host'] ?? '' ) ),
				$port,
				$path,
				$routing,
			);
		};

		return $identity( $left_parts ) === $identity( $right_parts );
	}

	/**
	 * Resolve the normalized current document without consulting authored or
	 * filtered canonical overrides.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	private static function current_document_url( array $context ): ?string {
		$kind      = isset( $context['kind'] ) && is_string( $context['kind'] ) ? $context['kind'] : 'unknown';
		$object_id = absint( $context['object_id'] ?? 0 );
		$paged     = max( 1, absint( $context['paged'] ?? 1 ) );
		if ( 'home' === $kind && is_home() ) {
			return self::self_url( $context );
		}
		if ( $object_id > 0 && in_array( $kind, array( 'home', 'singular' ), true ) ) {
			$url = get_permalink( $object_id );
			if ( $paged > 1 ) {
				$url = empty( get_option( 'permalink_structure' ) )
					? add_query_arg( 'page', $paged, $url )
					: trailingslashit( $url ) . user_trailingslashit( (string) $paged, 'single_paged' );
			}
			$url = Url::canonical( $url );
			return '' !== $url ? $url : null;
		}
		if ( $object_id > 0 && 'attachment' === $kind ) {
			$url = Url::canonical( get_attachment_link( $object_id ) );
			return '' !== $url ? $url : null;
		}

		return self::self_url( $context );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
