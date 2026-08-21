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
		if ( null !== $document ) {
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
		$kind      = isset( $context['kind'] ) && is_string( $context['kind'] ) ? $context['kind'] : 'unknown';
		$object_id = isset( $context['object_id'] ) ? absint( $context['object_id'] ) : 0;
		$paged     = isset( $context['paged'] ) ? max( 1, absint( $context['paged'] ) ) : 1;
		$query     = isset( $context['query_args'] ) && is_array( $context['query_args'] ) ? $context['query_args'] : array();

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

		if ( ! in_array( $kind, array( 'home', 'archive' ), true ) || ! empty( $query ) ) {
			return null;
		}

		$url = Url::canonical( get_pagenum_link( $paged ) );
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
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
