<?php
/**
 * Explicit companion SEO data cleanup.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Counts and removes only the plugin's permanent option and post metadata.
 */
final class Cleanup {
	/**
	 * Count the records owned by the current site.
	 *
	 * @return array<string, mixed>
	 */
	public static function report(): array {
		global $wpdb;

		$metadata_by_key = array();
		foreach ( self::meta_keys() as $meta_key ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Read-only maintenance count over a core table.
			$count = $wpdb->get_var(
				$wpdb->prepare(
					// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Core table name supplied by wpdb.
					"SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = %s",
					$meta_key
				)
			);
			$metadata_by_key[ $meta_key ] = (int) $count;
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Read-only maintenance count over a core table.
		$settings_options = (int) $wpdb->get_var(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Core table name supplied by wpdb.
				"SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name = %s",
				Identifiers::OPTION_SETTINGS
			)
		);

		$meta_keys = self::meta_keys();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared -- Fixed placeholders and core table name; all values pass through prepare().
		$posts_with_metadata = (int) $wpdb->get_var(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Core table name supplied by wpdb.
				"SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key IN (%s, %s, %s, %s, %s)",
				$meta_keys[0],
				$meta_keys[1],
				$meta_keys[2],
				$meta_keys[3],
				$meta_keys[4]
			)
		);

		return array(
			'settings_options'    => $settings_options,
			'metadata_rows'       => array_sum( $metadata_by_key ),
			'posts_with_metadata' => $posts_with_metadata,
			'metadata_by_key'     => $metadata_by_key,
		);
	}

	/**
	 * Remove every owned record from the current site and verify the result.
	 *
	 * @return array<string, array<string, mixed>> Before and after reports.
	 * @throws \RuntimeException When an owned record could not be removed.
	 */
	public static function purge(): array {
		$before = self::report();

		foreach ( self::meta_keys() as $meta_key ) {
			$count = (int) $before['metadata_by_key'][ $meta_key ];
			if ( $count > 0 ) {
				delete_metadata( 'post', 0, $meta_key, '', true );
			}
		}

		if ( (int) $before['settings_options'] > 0 ) {
			delete_option( Identifiers::OPTION_SETTINGS );
		}

		$after = self::report();
		if ( 0 !== (int) $after['settings_options'] || 0 !== (int) $after['metadata_rows'] ) {
			throw new \RuntimeException( 'Companion SEO cleanup left owned records behind.' );
		}

		return array(
			'before' => $before,
			'after'  => $after,
		);
	}

	/**
	 * Return the complete permanent post-meta ownership set.
	 *
	 * @return list<string>
	 */
	private static function meta_keys(): array {
		return array(
			Identifiers::META_TITLE,
			Identifiers::META_DESCRIPTION,
			Identifiers::META_NOINDEX,
			Identifiers::META_CANONICAL,
			Identifiers::META_SOCIAL_IMAGE_ID,
		);
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
