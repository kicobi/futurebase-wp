<?php
/**
 * Permanent extension-contract validation.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Applies frozen filters and rejects malformed adapter output safely.
 */
final class Contracts {
	/**
	 * Apply the suppression filter.
	 *
	 * @param bool        $fallback Internal decision.
	 * @param string|null $provider Detected provider.
	 */
	public static function suppression( bool $fallback, ?string $provider ): bool {
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.DynamicHooknameFound -- Frozen compseo-prefixed contract stored in a constant.
		$value = apply_filters( Identifiers::FILTER_IS_SUPPRESSED, $fallback, $provider );
		if ( ! is_bool( $value ) ) {
			self::invalid( Identifiers::FILTER_IS_SUPPRESSED, 'return a boolean' );
			return $fallback;
		}

		return $value;
	}

	/**
	 * Apply the supported-post-types filter.
	 *
	 * @param array $fallback Internal post types.
	 * @return array
	 * @phpstan-param list<string> $fallback
	 * @phpstan-return list<string>
	 */
	public static function supported_post_types( array $fallback ): array {
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.DynamicHooknameFound -- Frozen compseo-prefixed contract stored in a constant.
		$value = apply_filters( Identifiers::FILTER_SUPPORTED_POST_TYPES, $fallback );
		if ( ! is_array( $value ) ) {
			self::invalid( Identifiers::FILTER_SUPPORTED_POST_TYPES, 'return an array of public post-type slugs' );
			return $fallback;
		}

		$validated = array();
		foreach ( $value as $post_type ) {
			if ( ! is_string( $post_type ) || '' === $post_type || ! post_type_exists( $post_type ) ) {
				self::invalid( Identifiers::FILTER_SUPPORTED_POST_TYPES, 'return only registered public post-type slugs' );
				return $fallback;
			}

			$object = get_post_type_object( $post_type );
			if ( null === $object || ! $object->public ) {
				self::invalid( Identifiers::FILTER_SUPPORTED_POST_TYPES, 'return only registered public post-type slugs' );
				return $fallback;
			}
			$validated[] = $post_type;
		}

		return array_values( array_unique( $validated ) );
	}

	/**
	 * Apply and validate the document filter.
	 *
	 * @param array $fallback Internal document.
	 * @param array $context  Request context.
	 * @return array
	 * @phpstan-param array{title: string, description: string, canonical: string|null, social_image_id: int} $fallback
	 * @phpstan-param array<string, mixed> $context
	 * @phpstan-return array{title: string, description: string, canonical: string|null, social_image_id: int}
	 */
	public static function document( array $fallback, array $context ): array {
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.DynamicHooknameFound -- Frozen compseo-prefixed contract stored in a constant.
		$value = apply_filters( Identifiers::FILTER_DOCUMENT, $fallback, $context );
		if ( ! is_array( $value ) ) {
			self::invalid( Identifiers::FILTER_DOCUMENT, 'return the documented array payload' );
			return $fallback;
		}

		$required = array( 'title', 'description', 'canonical', 'social_image_id' );
		foreach ( $required as $key ) {
			if ( ! array_key_exists( $key, $value ) ) {
				self::invalid( Identifiers::FILTER_DOCUMENT, 'retain every required payload key' );
				return $fallback;
			}
		}

		if ( ! is_string( $value['title'] ) || ! is_string( $value['description'] ) || ! is_int( $value['social_image_id'] ) || $value['social_image_id'] < 0 ) {
			self::invalid( Identifiers::FILTER_DOCUMENT, 'return values with the documented types' );
			return $fallback;
		}
		if ( $value['social_image_id'] > 0 && ! wp_attachment_is_image( $value['social_image_id'] ) ) {
			self::invalid( Identifiers::FILTER_DOCUMENT, 'use zero or a WordPress image-attachment ID for social_image_id' );
			return $fallback;
		}

		$canonical = null;
		if ( null !== $value['canonical'] && ( ! is_string( $value['canonical'] ) || '' === Url::canonical( $value['canonical'] ) ) ) {
			self::invalid( Identifiers::FILTER_DOCUMENT, 'return null or an absolute HTTP(S) canonical without userinfo or fragments' );
			return $fallback;
		}
		if ( is_string( $value['canonical'] ) ) {
			$canonical = Url::canonical( $value['canonical'] );
		}

		return array(
			'title'           => $value['title'],
			'description'     => $value['description'],
			'canonical'       => $canonical,
			'social_image_id' => $value['social_image_id'],
		);
	}

	/**
	 * Apply and validate the schema graph filter.
	 *
	 * @param array $fallback Internal graph nodes.
	 * @param array $context  Request context.
	 * @param array $document Resolved document.
	 * @return array
	 * @phpstan-param list<array<string, mixed>> $fallback
	 * @phpstan-param array<string, mixed> $context
	 * @phpstan-param array{title: string, description: string, canonical: string|null, social_image_id: int} $document
	 * @phpstan-return list<array<string, mixed>>
	 */
	public static function schema_graph( array $fallback, array $context, array $document ): array {
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.DynamicHooknameFound -- Frozen compseo-prefixed contract stored in a constant.
		$value = apply_filters( Identifiers::FILTER_SCHEMA_GRAPH, $fallback, $context, $document );
		if ( ! is_array( $value ) || ! array_is_list( $value ) ) {
			self::invalid( Identifiers::FILTER_SCHEMA_GRAPH, 'return a list of schema node arrays' );
			return $fallback;
		}

		$validated = array();
		foreach ( $value as $node ) {
			if ( ! is_array( $node ) ) {
				self::invalid( Identifiers::FILTER_SCHEMA_GRAPH, 'return a list of schema node arrays' );
				return $fallback;
			}
			$validated[] = $node;
		}

		return $validated;
	}

	/**
	 * Report invalid adapter output without exposing the rejected value.
	 *
	 * @param string $hook   Hook name.
	 * @param string $reason Stable validation reason.
	 */
	private static function invalid( string $hook, string $reason ): void {
		_doing_it_wrong(
			__METHOD__,
			sprintf(
				/* translators: 1: filter name, 2: contract requirement. */
				esc_html__( 'The %1$s filter must %2$s. Its invalid value was discarded.', 'futurebase-seo' ),
				esc_html( $hook ),
				esc_html( $reason )
			),
			esc_html( FUTUREBASE_SEO_VERSION )
		);
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
