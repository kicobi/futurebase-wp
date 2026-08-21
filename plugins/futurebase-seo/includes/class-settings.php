<?php
/**
 * Read-only access to companion SEO settings.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Reads settings that receive a managed UI and schema in PR 3.
 */
final class Settings {
	/**
	 * Read the settings option defensively.
	 *
	 * @return array<string, mixed>
	 */
	public static function all(): array {
		$value = get_option( Identifiers::OPTION_SETTINGS, array() );
		return is_array( $value ) ? $value : array();
	}

	/**
	 * Resolve a configured public default social-image attachment.
	 */
	public static function default_social_image_id(): int {
		$settings = self::all();
		$social   = isset( $settings['social'] ) && is_array( $settings['social'] ) ? $settings['social'] : array();
		return Metadata::sanitize_social_image_id( $social['default_image_id'] ?? 0 );
	}

	/**
	 * Resolve a minimally complete Person or Organization.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function entity(): ?array {
		$settings = self::all();
		$entity   = isset( $settings['entity'] ) && is_array( $settings['entity'] ) ? $settings['entity'] : array();
		$type     = isset( $entity['type'] ) && is_string( $entity['type'] ) ? strtolower( $entity['type'] ) : '';
		$name     = isset( $entity['name'] ) && is_string( $entity['name'] ) ? sanitize_text_field( $entity['name'] ) : '';

		if ( ! in_array( $type, array( 'person', 'organization' ), true ) || '' === $name ) {
			return null;
		}

		$url = isset( $entity['url'] ) ? Url::canonical( $entity['url'] ) : '';
		if ( '' === $url ) {
			$url = home_url( '/' );
		}

		$social   = isset( $settings['social'] ) && is_array( $settings['social'] ) ? $settings['social'] : array();
		$profiles = isset( $social['profiles'] ) && is_array( $social['profiles'] ) ? $social['profiles'] : array();
		if ( isset( $entity['same_as'] ) && is_array( $entity['same_as'] ) ) {
			$profiles = array_merge( $profiles, $entity['same_as'] );
		}

		$same_as = array();
		foreach ( $profiles as $profile ) {
				$profile_url = Url::canonical( $profile );
			if ( '' !== $profile_url ) {
				$same_as[] = $profile_url;
			}
		}

		return array(
			'type'    => $type,
			'name'    => $name,
			'url'     => $url,
			'logo_id' => Metadata::sanitize_social_image_id( $entity['logo_id'] ?? 0 ),
			'same_as' => array_values( array_unique( $same_as ) ),
		);
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
