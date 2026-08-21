<?php
/**
 * Registered post metadata.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Registers revisioned, REST-visible SEO fields for public content types.
 */
final class Metadata {
	/**
	 * Register metadata after public post types are available.
	 */
	public static function register(): void {
		foreach ( self::post_types() as $post_type ) {
			add_post_type_support( $post_type, 'custom-fields' );
			add_post_type_support( $post_type, 'revisions' );

			self::register_string( $post_type, Identifiers::META_TITLE, __( 'SEO title', 'futurebase-seo' ), array( self::class, 'sanitize_title' ) );
			self::register_string( $post_type, Identifiers::META_DESCRIPTION, __( 'SEO description', 'futurebase-seo' ), array( self::class, 'sanitize_description' ) );
			self::register_string( $post_type, Identifiers::META_CANONICAL, __( 'Canonical URL', 'futurebase-seo' ), array( self::class, 'sanitize_canonical' ) );

			register_post_meta(
				$post_type,
				Identifiers::META_NOINDEX,
				array(
					'type'              => 'boolean',
					'label'             => __( 'Exclude from search engines', 'futurebase-seo' ),
					'description'       => __( 'Requests noindex while leaving the public URL accessible.', 'futurebase-seo' ),
					'single'            => true,
					'default'           => false,
					'show_in_rest'      => true,
					'revisions_enabled' => true,
					'sanitize_callback' => array( self::class, 'sanitize_noindex' ),
					'auth_callback'     => array( self::class, 'authorize' ),
				)
			);

			register_post_meta(
				$post_type,
				Identifiers::META_SOCIAL_IMAGE_ID,
				array(
					'type'              => 'integer',
					'label'             => __( 'Social image', 'futurebase-seo' ),
					'description'       => __( 'WordPress image attachment used for social sharing.', 'futurebase-seo' ),
					'single'            => true,
					'default'           => 0,
					'show_in_rest'      => true,
					'revisions_enabled' => true,
					'sanitize_callback' => array( self::class, 'sanitize_social_image_id' ),
					'auth_callback'     => array( self::class, 'authorize' ),
				)
			);
		}
	}

	/**
	 * Resolve the supported post types.
	 *
	 * @return list<string>
	 */
	public static function post_types(): array {
		$defaults = array( 'post', 'page' );
		$custom   = get_post_types(
			array(
				'public'   => true,
				'_builtin' => false,
			),
			'names'
		);

		$defaults = array_merge( $defaults, array_values( $custom ) );

		$defaults = array_values( array_filter( array_unique( $defaults ), 'post_type_exists' ) );
		return Contracts::supported_post_types( $defaults );
	}

	/**
	 * Authorize metadata changes.
	 *
	 * @param bool          $allowed Existing capability decision.
	 * @param string        $meta_key Meta key.
	 * @param int           $post_id  Post ID.
	 * @param int           $user_id  User ID.
	 * @param string        $cap      Requested capability.
	 * @param array<string> $caps     Primitive capabilities.
	 */
	public static function authorize( bool $allowed, string $meta_key, int $post_id, int $user_id, string $cap, array $caps ): bool {
		unset( $allowed, $meta_key, $user_id, $cap, $caps );
		return $post_id > 0 && current_user_can( 'edit_post', $post_id );
	}

	/**
	 * Sanitize a complete authored document title.
	 *
	 * @param mixed $value Raw value.
	 */
	public static function sanitize_title( mixed $value ): string {
		return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : '';
	}

	/**
	 * Sanitize an authored description without imposing an output length.
	 *
	 * @param mixed $value Raw value.
	 */
	public static function sanitize_description( mixed $value ): string {
		return is_scalar( $value ) ? sanitize_textarea_field( (string) $value ) : '';
	}

	/**
	 * Sanitize a canonical override.
	 *
	 * @param mixed $value Raw value.
	 */
	public static function sanitize_canonical( mixed $value ): string {
		return Url::canonical( $value );
	}

	/**
	 * Sanitize the noindex flag.
	 *
	 * @param mixed $value Raw value.
	 */
	public static function sanitize_noindex( mixed $value ): bool {
		if ( is_bool( $value ) ) {
			return $value;
		}
		if ( is_int( $value ) || is_float( $value ) ) {
			return 1 === (int) $value;
		}
		if ( is_string( $value ) ) {
			return in_array( strtolower( trim( $value ) ), array( '1', 'true' ), true );
		}

		return false;
	}

	/**
	 * Sanitize a social-image attachment ID.
	 *
	 * @param mixed $value Raw value.
	 */
	public static function sanitize_social_image_id( mixed $value ): int {
		if ( ! is_int( $value ) && ( ! is_string( $value ) || 1 !== preg_match( '/^[1-9][0-9]*$/D', $value ) ) ) {
			return 0;
		}

		$image_id = (int) $value;
		return $image_id > 0 && wp_attachment_is_image( $image_id ) ? $image_id : 0;
	}

	/**
	 * Register one string field.
	 *
	 * @param string   $post_type Post-type slug.
	 * @param string   $key       Meta key.
	 * @param string   $label     Human-readable label.
	 * @param callable $sanitize  Sanitization callback.
	 */
	private static function register_string( string $post_type, string $key, string $label, callable $sanitize ): void {
		register_post_meta(
			$post_type,
			$key,
			array(
				'type'              => 'string',
				'label'             => $label,
				'description'       => $label,
				'single'            => true,
				'default'           => '',
				'show_in_rest'      => true,
				'revisions_enabled' => true,
				'sanitize_callback' => $sanitize,
				'auth_callback'     => array( self::class, 'authorize' ),
			)
		);
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
