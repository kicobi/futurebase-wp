<?php
/**
 * Current-request context.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Produces the shared context passed to permanent extension filters.
 */
final class Context {
	/**
	 * Resolve the current request.
	 *
	 * @return array{url: string, kind: string, object_id: int, post_type: string, taxonomy: string, paged: int, query_args: array<string, mixed>, password_protected: bool}
	 */
	public static function current(): array {
		$kind      = self::kind();
		$object_id = self::object_id( $kind );
		$post_type = '';
		$taxonomy  = '';

		if ( $object_id > 0 && in_array( $kind, array( 'singular', 'attachment', 'home' ), true ) ) {
			$post_type = (string) get_post_type( $object_id );
		} elseif ( is_post_type_archive() ) {
			$query_post_type = get_query_var( 'post_type' );
			if ( is_array( $query_post_type ) ) {
				$query_post_type = reset( $query_post_type );
			}
			$post_type = is_string( $query_post_type ) ? $query_post_type : '';
		}

		if ( is_category() ) {
			$taxonomy = 'category';
		} elseif ( is_tag() ) {
			$taxonomy = 'post_tag';
		} elseif ( is_tax() ) {
			$queried  = get_queried_object();
			$taxonomy = $queried instanceof \WP_Term ? $queried->taxonomy : '';
		}

		$password_protected = false;
		if ( $object_id > 0 && in_array( $kind, array( 'home', 'singular', 'attachment' ), true ) ) {
			$post               = get_post( $object_id );
			$password_protected = $post instanceof \WP_Post && '' !== $post->post_password;
		}

		$query_args = self::query_args();

		return array(
			'url'                => self::current_url( $query_args ),
			'kind'               => $kind,
			'object_id'          => $object_id,
			'post_type'          => $post_type,
			'taxonomy'           => $taxonomy,
			'paged'              => max( 1, absint( get_query_var( 'paged' ) ), absint( get_query_var( 'page' ) ) ),
			'query_args'         => $query_args,
			'password_protected' => $password_protected,
		);
	}

	/**
	 * Whether PR 2 emits general document metadata for this context.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	public static function supports_output( array $context ): bool {
		return in_array( $context['kind'] ?? '', array( 'home', 'singular', 'archive' ), true );
	}

	/**
	 * Classify the current request.
	 */
	private static function kind(): string {
		if ( is_feed() ) {
			return 'feed';
		}
		if ( is_embed() ) {
			return 'embed';
		}
		if ( is_404() ) {
			return 'not_found';
		}
		if ( is_search() ) {
			return 'search';
		}
		if ( is_front_page() || is_home() ) {
			return 'home';
		}
		if ( is_attachment() ) {
			return 'attachment';
		}
		if ( is_singular() ) {
			return 'singular';
		}
		if ( is_archive() ) {
			return 'archive';
		}

		return 'unknown';
	}

	/**
	 * Resolve the context's content object.
	 *
	 * @param string $kind Request kind.
	 */
	private static function object_id( string $kind ): int {
		if ( 'home' === $kind ) {
			if ( 'page' !== get_option( 'show_on_front' ) ) {
				return 0;
			}
			if ( is_front_page() ) {
				return absint( get_option( 'page_on_front' ) );
			}
			if ( is_home() ) {
				return absint( get_option( 'page_for_posts' ) );
			}
			return 0;
		}

		return absint( get_queried_object_id() );
	}

	/**
	 * Read and sanitize external query arguments.
	 *
	 * @return array<string, mixed>
	 */
	private static function query_args(): array {
		// PHP changes dots and spaces in top-level $_GET keys. Parse the wire
		// query with temporary keys so canonicals retain their actual identity.
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Parsed and recursively sanitized below; never emitted raw.
		$request = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$query   = (string) wp_parse_url( $request, PHP_URL_QUERY );
		$names   = array();
		$pairs   = array();
		foreach ( explode( '&', $query ) as $pair ) {
			$pieces = explode( '=', $pair, 2 );
			$key    = urldecode( $pieces[0] );
			$base   = explode( '[', $key, 2 )[0];
			if ( '' === $base ) {
				continue;
			}
			$alias = array_search( $base, $names, true );
			if ( false === $alias ) {
				$alias           = 'key' . count( $names );
				$names[ $alias ] = $base;
			}
			$pairs[] = rawurlencode( $alias . substr( $key, strlen( $base ) ) ) . '=' . ( $pieces[1] ?? '' );
		}
		$parsed = array();
		wp_parse_str( implode( '&', $pairs ), $parsed );
		$input = array();
		foreach ( $parsed as $alias => $value ) {
			$input[ $names[ $alias ] ] = $value;
		}
		$clean = array();

		foreach ( $input as $key => $value ) {
			$clean[ $key ] = self::sanitize_query_value( $value );
		}

		return $clean;
	}

	/**
	 * Sanitize a query value recursively.
	 *
	 * @param mixed $value Raw value.
	 * @return mixed
	 */
	private static function sanitize_query_value( mixed $value ): mixed {
		if ( is_array( $value ) ) {
			$clean = array();
			foreach ( $value as $key => $item ) {
				$clean[ $key ] = self::sanitize_query_value( $item );
			}
			return $clean;
		}

		return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : '';
	}

	/**
	 * Query arguments that identify the native archive rather than filter it.
	 *
	 * Preserve original keys; normalization belongs only in classification.
	 *
	 * @param array<string, mixed> $context Request context.
	 * @return array<string, mixed>
	 */
	public static function routing_query_args( array $context ): array {
		$names = array();
		if ( 'home' === ( $context['kind'] ?? '' ) && is_home() ) {
			$names = array( 'page_id', 'pagename' );
		} elseif ( 'archive' === ( $context['kind'] ?? '' ) ) {
			if ( is_category() ) {
				$names = array( 'cat', 'category_name' );
			} elseif ( is_tag() ) {
				$names = array( 'tag', 'tag_id' );
			} elseif ( is_tax() ) {
				$names    = array( 'taxonomy', 'term' );
				$taxonomy = get_taxonomy( (string) ( $context['taxonomy'] ?? '' ) );
				if ( $taxonomy && is_string( $taxonomy->query_var ) ) {
					$names[] = $taxonomy->query_var;
				}
			} elseif ( is_post_type_archive() ) {
				$names = array( 'post_type' );
			} elseif ( is_author() ) {
				$names = array( 'author', 'author_name' );
			} elseif ( is_date() ) {
				$names = array( 'm', 'year', 'monthnum', 'day', 'hour', 'minute', 'second', 'w' );
			}
		}
		$query = isset( $context['query_args'] ) && is_array( $context['query_args'] ) ? $context['query_args'] : array();
		return array_intersect_key( $query, array_fill_keys( $names, true ) );
	}

	/**
	 * Build a safe current URL for filter context and social fallbacks.
	 *
	 * @param array<string, mixed> $query_args External query arguments.
	 */
	private static function current_url( array $query_args ): string {
		global $wp;

		$request = $wp instanceof \WP ? $wp->request : '';
		$url     = home_url( '/' . ltrim( $request, '/' ) );
		return empty( $query_args ) ? $url : $url . '?' . http_build_query( $query_args, '', '&', PHP_QUERY_RFC3986 );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
