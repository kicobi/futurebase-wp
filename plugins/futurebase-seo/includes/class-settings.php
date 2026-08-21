<?php
/**
 * Companion SEO settings schema and sanitization.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Owns the permanent, schema-versioned settings option.
 */
final class Settings {
	public const SCHEMA_VERSION = 1;

	/**
	 * Return the complete V1 settings shape.
	 *
	 * @return array<string, mixed>
	 */
	public static function defaults(): array {
		return array(
			'schema_version' => self::SCHEMA_VERSION,
			'entity'         => array(
				'type'    => '',
				'name'    => '',
				'url'     => '',
				'logo_id' => 0,
			),
			'social'         => array(
				'default_image_id' => 0,
				'profiles'         => array(),
				'x_handle'         => '',
			),
			'verification'   => array(
				'google' => '',
				'bing'   => '',
			),
		);
	}

	/**
	 * Read and normalize the settings option defensively.
	 *
	 * @return array<string, mixed>
	 */
	public static function all(): array {
		$stored = get_option( Identifiers::OPTION_SETTINGS, array() );
		$stored = is_array( $stored ) ? $stored : array();
		$entity = isset( $stored['entity'] ) && is_array( $stored['entity'] ) ? $stored['entity'] : array();
		$social = isset( $stored['social'] ) && is_array( $stored['social'] ) ? $stored['social'] : array();
		$verify = isset( $stored['verification'] ) && is_array( $stored['verification'] ) ? $stored['verification'] : array();

		$type = isset( $entity['type'] ) && is_string( $entity['type'] ) ? strtolower( $entity['type'] ) : '';
		if ( ! in_array( $type, array( 'person', 'organization' ), true ) ) {
			$type = '';
		}

		$profiles = array();
		if ( isset( $social['profiles'] ) && is_array( $social['profiles'] ) ) {
			foreach ( $social['profiles'] as $profile ) {
				$url = Url::canonical( $profile );
				if ( '' !== $url ) {
					$profiles[] = $url;
				}
			}
		}
		if ( isset( $entity['same_as'] ) && is_array( $entity['same_as'] ) ) {
			foreach ( $entity['same_as'] as $profile ) {
				$url = Url::canonical( $profile );
				if ( '' !== $url ) {
					$profiles[] = $url;
				}
			}
		}

		return array(
			'schema_version' => self::SCHEMA_VERSION,
			'entity'         => array(
				'type'    => $type,
				'name'    => isset( $entity['name'] ) && is_scalar( $entity['name'] ) ? sanitize_text_field( (string) $entity['name'] ) : '',
				'url'     => isset( $entity['url'] ) ? Url::canonical( $entity['url'] ) : '',
				'logo_id' => Metadata::sanitize_social_image_id( $entity['logo_id'] ?? 0 ),
			),
			'social'         => array(
				'default_image_id' => Metadata::sanitize_social_image_id( $social['default_image_id'] ?? 0 ),
				'profiles'         => array_values( array_unique( $profiles ) ),
				'x_handle'         => self::normalize_x_handle( $social['x_handle'] ?? '' ),
			),
			'verification'   => array(
				'google' => self::stored_token( $verify['google'] ?? '' ),
				'bing'   => self::stored_token( $verify['bing'] ?? '' ),
			),
		);
	}

	/**
	 * Sanitize a submitted settings document.
	 *
	 * Invalid fields retain their previous safe value. Error messages never
	 * include submitted values.
	 *
	 * @param mixed $input Submitted option value.
	 * @return array<string, mixed>
	 */
	public static function sanitize( mixed $input ): array {
		$old = self::all();

		if ( Suppression::is_suppressed() ) {
			self::error( 'read_only', __( 'SEO settings are read-only while another supported SEO provider is active.', 'futurebase-seo' ) );
			return $old;
		}

		if ( ! is_array( $input ) ) {
			self::error( 'invalid_document', __( 'The SEO settings were not saved because the submitted document was invalid.', 'futurebase-seo' ) );
			return $old;
		}

		$next       = self::defaults();
		$entity     = isset( $input['entity'] ) && is_array( $input['entity'] ) ? $input['entity'] : array();
		$social     = isset( $input['social'] ) && is_array( $input['social'] ) ? $input['social'] : array();
		$verify     = isset( $input['verification'] ) && is_array( $input['verification'] ) ? $input['verification'] : array();
		$old_entity = $old['entity'];
		$old_social = $old['social'];
		$old_verify = $old['verification'];

		$type = isset( $entity['type'] ) && is_scalar( $entity['type'] ) ? strtolower( trim( (string) $entity['type'] ) ) : '';
		if ( ! in_array( $type, array( '', 'person', 'organization' ), true ) ) {
			self::error( 'entity_type', __( 'Choose a valid site entity type.', 'futurebase-seo' ) );
			$type = (string) $old_entity['type'];
		}
		$next['entity']['type'] = $type;
		$next['entity']['name'] = isset( $entity['name'] ) && is_scalar( $entity['name'] ) ? sanitize_text_field( (string) $entity['name'] ) : '';

		$entity_url = isset( $entity['url'] ) && is_scalar( $entity['url'] ) ? trim( (string) $entity['url'] ) : '';
		if ( '' !== $entity_url ) {
			$entity_url = Url::canonical( $entity_url );
			if ( '' === $entity_url ) {
				self::error( 'entity_url', __( 'Enter an absolute HTTP or HTTPS entity URL without credentials or a fragment.', 'futurebase-seo' ) );
				$entity_url = (string) $old_entity['url'];
			}
		}
		$next['entity']['url']     = $entity_url;
		$next['entity']['logo_id'] = Metadata::sanitize_social_image_id( $entity['logo_id'] ?? 0 );

		$next['social']['default_image_id'] = Metadata::sanitize_social_image_id( $social['default_image_id'] ?? 0 );
		$next['social']['profiles']         = self::sanitize_profiles( $social['profiles'] ?? array(), $old_social['profiles'] );

		$raw_x    = $social['x_handle'] ?? '';
		$x_handle = self::normalize_x_handle( $raw_x );
		if ( ! is_scalar( $raw_x ) || ( '' !== trim( (string) $raw_x ) && '' === $x_handle ) ) {
			self::error( 'x_handle', __( 'Enter an X handle using 1–15 letters, numbers, or underscores.', 'futurebase-seo' ) );
			$x_handle = (string) $old_social['x_handle'];
		}
		$next['social']['x_handle'] = $x_handle;

		$next['verification']['google'] = self::sanitize_verification(
			$verify['google'] ?? '',
			'google-site-verification',
			(string) $old_verify['google'],
			'google'
		);
		$next['verification']['bing']   = self::sanitize_verification(
			$verify['bing'] ?? '',
			'msvalidate.01',
			(string) $old_verify['bing'],
			'bing'
		);

		return $next;
	}

	/**
	 * Resolve a configured public default social-image attachment.
	 */
	public static function default_social_image_id(): int {
		$settings = self::all();
		return (int) $settings['social']['default_image_id'];
	}

	/**
	 * Return one stored verification token.
	 *
	 * @param string $provider Provider key.
	 */
	public static function verification_token( string $provider ): string {
		$settings = self::all();
		return isset( $settings['verification'][ $provider ] ) && is_string( $settings['verification'][ $provider ] ) ? $settings['verification'][ $provider ] : '';
	}

	/**
	 * Resolve a minimally complete Person or Organization.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function entity(): ?array {
		$settings = self::all();
		$entity   = $settings['entity'];
		$type     = (string) $entity['type'];
		$name     = (string) $entity['name'];

		if ( '' === $type || '' === $name ) {
			return null;
		}

		$url = (string) $entity['url'];
		if ( '' === $url ) {
			$url = home_url( '/' );
		}

		$same_as = $settings['social']['profiles'];
		$handle  = (string) $settings['social']['x_handle'];
		if ( '' !== $handle ) {
			$same_as[] = 'https://x.com/' . rawurlencode( $handle );
		}

		return array(
			'type'    => $type,
			'name'    => $name,
			'url'     => $url,
			'logo_id' => (int) $entity['logo_id'],
			'same_as' => array_values( array_unique( $same_as ) ),
		);
	}

	/**
	 * Parse a bare verification token or one recognized full meta tag.
	 *
	 * @param mixed  $value         Submitted token or tag.
	 * @param string $expected_name Required meta name.
	 * @param string $old           Previous safe token.
	 * @param string $field         Provider field key.
	 */
	private static function sanitize_verification( mixed $value, string $expected_name, string $old, string $field ): string {
		if ( ! is_scalar( $value ) ) {
			self::verification_error( $field );
			return $old;
		}

		$value = trim( (string) $value );
		if ( '' === $value ) {
			return '';
		}

		$token = $value;
		if ( str_contains( $value, '<' ) || str_contains( $value, '>' ) ) {
			$processor = new \WP_HTML_Tag_Processor( $value );
			if ( ! $processor->next_tag() || 'META' !== $processor->get_tag() ) {
				self::verification_error( $field );
				return $old;
			}

			$name          = $processor->get_attribute( 'name' );
			$content       = $processor->get_attribute( 'content' );
			$has_extra_tag = call_user_func( array( $processor, 'next_tag' ) );
			if ( ! is_string( $name ) || 0 !== strcasecmp( $expected_name, $name ) || ! is_string( $content ) || true === $has_extra_tag || '' !== trim( wp_strip_all_tags( $value ) ) ) {
				self::verification_error( $field );
				return $old;
			}
			$token = trim( $content );
		}

		$token = self::stored_token( $token );
		if ( '' === $token ) {
			self::verification_error( $field );
			return $old;
		}

		return $token;
	}

	/**
	 * Sanitize a URL list, preserving the old list if any row is invalid.
	 *
	 * @param mixed        $value Submitted value.
	 * @param array<mixed> $old   Previous values.
	 * @return list<string>
	 */
	private static function sanitize_profiles( mixed $value, array $old ): array {
		$rows = is_array( $value ) ? $value : preg_split( '/\R/u', is_scalar( $value ) ? (string) $value : '' );
		if ( false === $rows ) {
			$rows = array();
		}

		$profiles = array();
		foreach ( $rows as $row ) {
			$row = is_scalar( $row ) ? trim( (string) $row ) : '';
			if ( '' === $row ) {
				continue;
			}

			$url = Url::canonical( $row );
			if ( '' === $url ) {
				self::error( 'social_profiles', __( 'Enter one absolute HTTP or HTTPS social profile URL per line.', 'futurebase-seo' ) );
				return array_values( array_filter( $old, 'is_string' ) );
			}
			$profiles[] = $url;
		}

		return array_values( array_unique( $profiles ) );
	}

	/**
	 * Normalize an optional X handle without its leading at sign.
	 *
	 * @param mixed $value Submitted handle.
	 */
	private static function normalize_x_handle( mixed $value ): string {
		if ( ! is_scalar( $value ) ) {
			return '';
		}

		$value = ltrim( trim( (string) $value ), '@' );
		return 1 === preg_match( '/^[A-Za-z0-9_]{1,15}$/D', $value ) ? $value : '';
	}

	/**
	 * Validate a token already in persistent storage.
	 *
	 * @param mixed $value Stored token.
	 */
	private static function stored_token( mixed $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$value = trim( $value );
		return 1 === preg_match( '/^[A-Za-z0-9._~:+\/=\-]+$/D', $value ) ? $value : '';
	}

	/**
	 * Add a provider-specific but value-free verification error.
	 *
	 * @param string $field Provider field key.
	 */
	private static function verification_error( string $field ): void {
		$provider = 'google' === $field ? __( 'Google', 'futurebase-seo' ) : __( 'Bing', 'futurebase-seo' );
		self::error(
			'verification_' . $field,
			sprintf(
				/* translators: %s: verification provider name. */
				__( 'Enter a valid %s verification token or its single verification meta tag.', 'futurebase-seo' ),
				$provider
			)
		);
	}

	/**
	 * Register one settings error without including submitted data.
	 *
	 * @param string $code    Stable error code.
	 * @param string $message User-facing message.
	 */
	private static function error( string $code, string $message ): void {
		add_settings_error( Identifiers::OPTION_SETTINGS, 'compseo_' . $code, $message, 'error' );
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
