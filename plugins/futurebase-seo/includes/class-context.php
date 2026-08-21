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
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only public request context; no state change occurs.
		$input = wp_unslash( $_GET );
		$clean = array();

		foreach ( $input as $key => $value ) {
			if ( ! is_string( $key ) ) {
				continue;
			}
			$key = sanitize_key( $key );
			if ( '' === $key ) {
				continue;
			}
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
				$clean[ is_string( $key ) ? sanitize_key( $key ) : $key ] = self::sanitize_query_value( $item );
			}
			return $clean;
		}

		return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : '';
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
		return empty( $query_args ) ? $url : add_query_arg( $query_args, $url );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
