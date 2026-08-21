<?php
/**
 * Archive indexing-policy discovery.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Discovers configurable archive surfaces and resolves their saved choices.
 */
final class Policy {
	public const INDEX   = 'index';
	public const NOINDEX = 'noindex';

	/**
	 * Return public, queryable post types that expose an archive.
	 *
	 * @return array<string, \WP_Post_Type>
	 */
	public static function post_types(): array {
		$objects = get_post_types(
			array(
				'publicly_queryable' => true,
			),
			'objects'
		);

		$archives = array();
		foreach ( $objects as $slug => $object ) {
			if ( false !== $object->has_archive ) {
				$archives[ $slug ] = $object;
			}
		}

		uasort(
			$archives,
			static fn( \WP_Post_Type $left, \WP_Post_Type $right ): int => strnatcasecmp( $left->labels->name, $right->labels->name )
		);
		return $archives;
	}

	/**
	 * Return registered public taxonomies.
	 *
	 * @return array<string, \WP_Taxonomy>
	 */
	public static function taxonomies(): array {
		$objects = get_taxonomies(
			array(
				'public' => true,
			),
			'objects'
		);

		$taxonomies = array();
		foreach ( $objects as $taxonomy ) {
			$taxonomies[ $taxonomy->name ] = $taxonomy;
		}
		uasort(
			$taxonomies,
			static fn( \WP_Taxonomy $left, \WP_Taxonomy $right ): int => strnatcasecmp( $left->labels->name, $right->labels->name )
		);
		return $taxonomies;
	}

	/**
	 * Resolve an effective policy without writing inherited defaults.
	 *
	 * @param string $surface Surface key.
	 * @param string $slug    Optional post-type or taxonomy slug.
	 */
	public static function value( string $surface, string $slug = '' ): string {
		$settings = Settings::all();
		$indexing = $settings['indexing'];

		if ( 'post_type' === $surface ) {
			$stored = $indexing['post_types'];
			return isset( $stored[ $slug ] ) && self::is_value( $stored[ $slug ] ) ? $stored[ $slug ] : self::INDEX;
		}

		if ( 'taxonomy' === $surface ) {
			$stored = $indexing['taxonomies'];
			return isset( $stored[ $slug ] ) && self::is_value( $stored[ $slug ] ) ? $stored[ $slug ] : self::INDEX;
		}

		$default = in_array( $surface, array( 'author', 'date', 'filtered' ), true ) ? self::NOINDEX : self::INDEX;
		return isset( $indexing[ $surface ] ) && self::is_value( $indexing[ $surface ] ) ? $indexing[ $surface ] : $default;
	}

	/**
	 * Whether a value belongs to the stored two-state policy contract.
	 *
	 * @param mixed $value Candidate value.
	 */
	public static function is_value( mixed $value ): bool {
		return is_string( $value ) && in_array( $value, array( self::INDEX, self::NOINDEX ), true );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
