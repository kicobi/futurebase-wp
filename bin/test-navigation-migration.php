<?php
/**
 * Disposable WordPress integration tests for the navigation migration.
 *
 * Run with: bin/test-navigation-migration.sh
 *
 * @package wp-starter
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	echo "test-navigation-migration.php must run via `wp eval-file`.\n";
	exit( 1 );
}

/**
 * Fail a navigation migration assertion.
 *
 * @param bool   $condition Assertion result.
 * @param string $message   Failure message.
 * @return void
 * @throws RuntimeException When the assertion fails.
 */
function wp_starter_navigation_test_assert( $condition, $message ) {
	if ( ! $condition ) {
		throw new RuntimeException( esc_html( $message ) );
	}
}

/**
 * Track non-navigation fixtures created during this process.
 *
 * @param int|null $post_id Post ID to add.
 * @param bool     $clear   Return and clear the tracked IDs.
 * @return array<int, int>
 */
function wp_starter_navigation_test_owned_ids( $post_id = null, $clear = false ) {
	static $ids = array();
	if ( null !== $post_id ) {
		$ids[] = $post_id;
	}
	if ( $clear ) {
		$owned = $ids;
		$ids   = array();
		return $owned;
	}

	return $ids;
}

/**
 * Insert a test post and return its ID.
 *
 * @param array<string, mixed> $post Post fields.
 * @return int
 * @throws RuntimeException When WordPress refuses the insert.
 */
function wp_starter_navigation_test_insert( $post ) {
	$result = wp_insert_post( $post, true );
	if ( is_wp_error( $result ) ) {
		throw new RuntimeException( esc_html( $result->get_error_message() ) );
	}
	if ( 'wp_navigation' !== ( $post['post_type'] ?? '' ) ) {
		wp_starter_navigation_test_owned_ids( $result );
	}

	return $result;
}

/**
 * Remove navigation and test-owned content between scenarios.
 *
 * @return void
 */
function wp_starter_navigation_test_reset() {
	foreach ( wp_starter_navigation_test_owned_ids( null, true ) as $post_id ) {
		wp_delete_post( $post_id, true );
	}

	$navigation_ids = get_posts(
		array(
			'post_type'      => 'wp_navigation',
			'post_status'    => 'any',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		)
	);
	foreach ( $navigation_ids as $post_id ) {
		wp_delete_post( $post_id, true );
	}

	delete_option( 'wp_starter_navigation_seeded' );
	delete_option( 'wp_starter_navigation_migration' );
	wp_cache_flush();
}

/**
 * Insert a navigation post.
 *
 * @param string $title   Post title.
 * @param string $slug    Post slug.
 * @param string $content Block content.
 * @param string $date    Post date.
 * @return int
 */
function wp_starter_navigation_test_insert_menu( $title, $slug, $content, $date ) {
	return wp_starter_navigation_test_insert(
		array(
			'post_type'    => 'wp_navigation',
			'post_status'  => 'publish',
			'post_title'   => $title,
			'post_name'    => $slug,
			'post_content' => $content,
			'post_date'    => $date,
		)
	);
}

/**
 * Create the state produced by the obsolete seeder.
 *
 * @param string $legacy_title Legacy menu title.
 * @return array{legacy: int, primary: int, footer: int}
 */
function wp_starter_navigation_test_damaged_state( $legacy_title = 'Main Menu' ) {
	wp_starter_navigation_test_reset();
	$legacy  = wp_starter_navigation_test_insert_menu(
		$legacy_title,
		'legacy-menu',
		'<!-- wp:navigation-link {"label":"Client link","url":"https://example.test/client/"} /-->',
		'2026-01-01 10:00:00'
	);
	$primary = wp_starter_navigation_test_insert_menu(
		'Primary navigation',
		'primary-navigation',
		wp_starter_navigation_seed_content( 'primary-navigation' ),
		'2026-01-02 10:00:00'
	);
	$footer  = wp_starter_navigation_test_insert_menu(
		'Footer navigation',
		'footer-navigation',
		wp_starter_navigation_seed_content( 'footer-navigation' ),
		'2026-01-03 10:00:00'
	);
	update_option( 'wp_starter_navigation_seeded', 1, false );

	return array(
		'legacy'  => $legacy,
		'primary' => $primary,
		'footer'  => $footer,
	);
}

/**
 * Insert stored content that references one or more navigation IDs.
 *
 * @param array<int, int> $refs      Referenced navigation IDs.
 * @param string          $post_type Post type.
 * @param string          $status    Post status.
 * @return int
 */
function wp_starter_navigation_test_reference_post( $refs, $post_type = 'wp_block', $status = 'publish' ) {
	$content = '';
	foreach ( $refs as $ref ) {
		$content .= '<!-- wp:group --><div class="wp-block-group">';
		$content .= '<!-- wp:navigation {"ref":' . $ref . '} /-->';
		$content .= '</div><!-- /wp:group -->';
	}

	return wp_starter_navigation_test_insert(
		array(
			'post_type'    => $post_type,
			'post_status'  => $status,
			'post_title'   => 'Navigation migration reference',
			'post_content' => $content,
		)
	);
}

/**
 * Assert the migration option status.
 *
 * @param string $status Expected status.
 * @return array{version: int, status: string, attempts: int, last_error: string}
 */
function wp_starter_navigation_test_state_is( $status ) {
	$state = wp_starter_navigation_migration_state();
	wp_starter_navigation_test_assert( $status === $state['status'], "Expected migration status {$status}; got {$state['status']}." );
	return $state;
}

/**
 * Run every disposable navigation migration scenario.
 *
 * @return void
 */
function wp_starter_navigation_test_run() {
	try {
		// Fresh install: seed two distinct regions.
		wp_starter_navigation_test_reset();
		wp_starter_migrate_navigation_regions();
		$fresh_primary = wp_starter_navigation_region_post( 'primary-navigation' );
		$fresh_footer  = wp_starter_navigation_region_post( 'footer-navigation' );
		wp_starter_navigation_test_assert( $fresh_primary instanceof WP_Post, 'Fresh migration did not create primary navigation.' );
		wp_starter_navigation_test_assert( $fresh_footer instanceof WP_Post, 'Fresh migration did not create footer navigation.' );
		wp_starter_navigation_test_assert( $fresh_primary->ID !== $fresh_footer->ID, 'Fresh regions share an ID.' );
		wp_starter_navigation_test_state_is( 'complete' );

		// Normal adoption: preserve the client ID/content and a custom footer.
		wp_starter_navigation_test_reset();
		$legacy_content = '<!-- wp:navigation-link {"label":"Work","url":"https://example.test/work/"} /-->';
		$legacy_id      = wp_starter_navigation_test_insert_menu( 'Main Menu', 'client-menu', $legacy_content, '2026-01-01 10:00:00' );
		$footer_id      = wp_starter_navigation_test_insert_menu( 'Legal links', 'footer-navigation', '<!-- wp:navigation-link {"label":"Privacy","url":"/privacy/"} /-->', '2026-01-02 10:00:00' );
		wp_starter_migrate_navigation_regions();
		$adopted = wp_starter_navigation_region_post( 'primary-navigation' );
		wp_starter_navigation_test_assert( $adopted instanceof WP_Post && $legacy_id === $adopted->ID, 'Legacy adoption did not preserve the client post ID.' );
		wp_starter_navigation_test_assert( 'Main Menu' === $adopted->post_title && $legacy_content === $adopted->post_content, 'Legacy adoption changed client title/content.' );
		wp_starter_navigation_test_assert( wp_starter_navigation_region_post( 'footer-navigation' )->ID === $footer_id, 'Existing footer was replaced.' );

		// Core's locale-independent default slug is retitled even when localized.
		wp_starter_navigation_test_reset();
		$localized_id = wp_starter_navigation_test_insert_menu( 'Navegación', 'navigation', $legacy_content, '2026-01-01 10:00:00' );
		wp_starter_migrate_navigation_regions();
		$localized = wp_starter_navigation_region_post( 'primary-navigation' );
		wp_starter_navigation_test_assert( $localized_id === $localized->ID, 'Localized core default did not preserve its ID.' );
		wp_starter_navigation_test_assert( 'Primary navigation' === $localized->post_title, 'Core default slug was not given a distinct primary label.' );

		// Neither candidate referenced: preserve the legacy ID and draft the seed.
		$damaged = wp_starter_navigation_test_damaged_state();
		wp_starter_migrate_navigation_regions();
		$repaired = wp_starter_navigation_region_post( 'primary-navigation' );
		wp_starter_navigation_test_assert( $damaged['legacy'] === $repaired->ID, 'Unreferenced repair did not preserve the legacy ID.' );
		wp_starter_navigation_test_assert( 'draft' === get_post_status( $damaged['primary'] ), 'Unused seed was not retained as a draft.' );
		wp_starter_navigation_test_assert( 2 === (int) get_post_meta( $damaged['primary'], '_wp_starter_navigation_migration', true )['version'], 'Retired seed lacks migration metadata.' );

		// Only the seed referenced: preserve that ID but move client content/title.
		$damaged = wp_starter_navigation_test_damaged_state();
		wp_starter_navigation_test_reference_post( array( $damaged['primary'] ) );
		wp_starter_migrate_navigation_regions();
		$repaired = wp_starter_navigation_region_post( 'primary-navigation' );
		wp_starter_navigation_test_assert( $damaged['primary'] === $repaired->ID, 'Referenced seed ID was not preserved.' );
		wp_starter_navigation_test_assert( false !== strpos( $repaired->post_content, 'Client link' ), 'Client content was not moved into the referenced survivor.' );
		wp_starter_navigation_test_assert( 'draft' === get_post_status( $damaged['legacy'] ), 'Unused legacy post was not retained as a draft.' );

		// Only the legacy ID referenced from a private custom editor post.
		if ( ! post_type_exists( 'nav_test_item' ) ) {
			register_post_type(
				'nav_test_item',
				array(
					'public'       => false,
					'show_in_rest' => true,
					'supports'     => array( 'editor' ),
				)
			);
		}
		$damaged = wp_starter_navigation_test_damaged_state();
		wp_starter_navigation_test_reference_post( array( $damaged['legacy'] ), 'nav_test_item', 'private' );
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_assert( wp_starter_navigation_region_post( 'primary-navigation' )->ID === $damaged['legacy'], 'Private custom-post reference was not detected.' );

		// Both candidates referenced: do not mutate either.
		$damaged           = wp_starter_navigation_test_damaged_state();
		$primary_before    = get_post( $damaged['primary'] );
		$legacy_before     = get_post( $damaged['legacy'] );
		$reference_post_id = wp_starter_navigation_test_reference_post( array( $damaged['primary'], $damaged['legacy'] ), 'wp_template' );
		wp_starter_navigation_test_assert( $reference_post_id > 0, 'Template reference fixture was not inserted.' );
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_state_is( 'needs_attention' );
		wp_starter_navigation_test_assert( get_post( $damaged['primary'] )->post_content === $primary_before->post_content, 'Ambiguous repair changed the seed.' );
		wp_starter_navigation_test_assert( get_post( $damaged['legacy'] )->post_content === $legacy_before->post_content, 'Ambiguous repair changed the legacy menu.' );

		// Ambiguity is read-only even when the damaged state lacks a footer.
		$damaged = wp_starter_navigation_test_damaged_state();
		wp_delete_post( $damaged['footer'], true );
		wp_starter_navigation_test_reference_post( array( $damaged['primary'], $damaged['legacy'] ), 'wp_template_part' );
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_state_is( 'needs_attention' );
		wp_starter_navigation_test_assert( null === wp_starter_navigation_region_post( 'footer-navigation' ), 'Ambiguous repair created a missing footer.' );

		// Edited seed: safely refuse rather than overwriting either menu.
		$damaged = wp_starter_navigation_test_damaged_state();
		wp_update_post(
			array(
				'ID'           => $damaged['primary'],
				'post_content' => get_post( $damaged['primary'] )->post_content . "\n<!-- wp:navigation-link {\"label\":\"Edited\",\"url\":\"/edited/\"} /-->",
			)
		);
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_state_is( 'needs_attention' );
		wp_starter_navigation_test_assert( 'publish' === get_post_status( $damaged['legacy'] ), 'Edited-seed refusal changed the legacy menu.' );

		// A title collision is replaced with the distinct primary-region label.
		$damaged = wp_starter_navigation_test_damaged_state( 'Footer navigation' );
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_assert( 'Primary navigation' === wp_starter_navigation_region_post( 'primary-navigation' )->post_title, 'Footer title collision was preserved.' );

		// Failure in the second repair write rolls the first write back.
		$damaged        = wp_starter_navigation_test_damaged_state();
		$primary_before = wp_starter_navigation_snapshot( get_post( $damaged['primary'] ) );
		wp_starter_navigation_test_reference_post( array( $damaged['primary'] ) );
		$fail_retire = static function ( $maybe_empty, $postarr ) use ( $damaged ) {
			if ( (int) ( $postarr['ID'] ?? 0 ) === $damaged['legacy'] && 'draft' === ( $postarr['post_status'] ?? '' ) ) {
				return true;
			}
			return $maybe_empty;
		};
		add_filter( 'wp_insert_post_empty_content', $fail_retire, 10, 2 );
		wp_starter_migrate_navigation_regions();
		remove_filter( 'wp_insert_post_empty_content', $fail_retire, 10 );
		wp_starter_navigation_test_state_is( 'failed' );
		wp_starter_navigation_test_assert( wp_starter_navigation_snapshot( get_post( $damaged['primary'] ) ) === $primary_before, 'Failed repair did not roll back the first write.' );
		wp_starter_navigation_test_assert( 'publish' === get_post_status( $damaged['legacy'] ), 'Failed repair changed the legacy status.' );

		// Technical failures stop after three writes and stay read-only thereafter.
		wp_starter_navigation_test_reset();
		$insert_attempts = 0;
		$fail_inserts    = static function ( $maybe_empty, $postarr ) use ( &$insert_attempts ) {
			if ( 'wp_navigation' === ( $postarr['post_type'] ?? '' ) ) {
				++$insert_attempts;
				return true;
			}
			return $maybe_empty;
		};
		add_filter( 'wp_insert_post_empty_content', $fail_inserts, 10, 2 );
		wp_starter_migrate_navigation_regions();
		wp_starter_migrate_navigation_regions();
		wp_starter_migrate_navigation_regions();
		$failed_state = wp_starter_navigation_test_state_is( 'needs_attention' );
		wp_starter_navigation_test_assert( 3 === $failed_state['attempts'], 'Technical failures did not stop at three attempts.' );
		$attempts_at_cap = $insert_attempts;
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_assert( $attempts_at_cap === $insert_attempts, 'Capped migration attempted another write.' );
		remove_filter( 'wp_insert_post_empty_content', $fail_inserts, 10 );

		// A manual resolution is detected without further content writes.
		$damaged = wp_starter_navigation_test_damaged_state();
		wp_starter_navigation_test_reference_post( array( $damaged['primary'], $damaged['legacy'] ) );
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_state_is( 'needs_attention' );
		wp_update_post(
			array(
				'ID'          => $damaged['legacy'],
				'post_status' => 'draft',
				'post_name'   => 'retired-navigation-manual',
			)
		);
		wp_starter_migrate_navigation_regions();
		wp_starter_navigation_test_state_is( 'complete' );
		wp_starter_navigation_test_assert( false === get_option( 'wp_starter_navigation_seeded', false ), 'Manual completion retained the obsolete option.' );

		wp_starter_navigation_test_reset();
		wp_starter_migrate_navigation_regions();
		echo "Success: Navigation migration scenarios passed.\n";
	} catch ( Throwable $error ) {
		wp_starter_navigation_test_reset();
		echo 'Error: ' . esc_html( $error->getMessage() ) . "\n";
		exit( 1 );
	}
}

wp_starter_navigation_test_run();
