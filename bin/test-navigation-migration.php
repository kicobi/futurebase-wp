<?php
/**
 * Disposable WordPress integration tests for the navigation migration.
 *
 * Run with: bin/test-navigation-migration.sh
 *
 * @package futurebase
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
function futurebase_navigation_test_assert( $condition, $message ) {
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
function futurebase_navigation_test_owned_ids( $post_id = null, $clear = false ) {
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
function futurebase_navigation_test_insert( $post ) {
	$result = wp_insert_post( wp_slash( $post ), true );
	if ( is_wp_error( $result ) ) {
		throw new RuntimeException( esc_html( $result->get_error_message() ) );
	}
	if ( 'wp_navigation' !== ( $post['post_type'] ?? '' ) ) {
		futurebase_navigation_test_owned_ids( $result );
	}

	return $result;
}

/**
 * Remove navigation and test-owned content between scenarios.
 *
 * @return void
 */
function futurebase_navigation_test_reset() {
	foreach ( futurebase_navigation_test_owned_ids( null, true ) as $post_id ) {
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

	delete_option( 'futurebase_navigation_seeded' );
	delete_option( 'futurebase_navigation_migration' );
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
function futurebase_navigation_test_insert_menu( $title, $slug, $content, $date ) {
	return futurebase_navigation_test_insert(
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
function futurebase_navigation_test_damaged_state( $legacy_title = 'Main Menu' ) {
	futurebase_navigation_test_reset();
	$legacy  = futurebase_navigation_test_insert_menu(
		$legacy_title,
		'legacy-menu',
		'<!-- wp:navigation-link {"label":"Client link","url":"https://example.test/client/"} /-->',
		'2026-01-01 10:00:00'
	);
	$primary = futurebase_navigation_test_insert_menu(
		'Primary navigation',
		'primary-navigation',
		futurebase_navigation_seed_content( 'primary-navigation' ),
		'2026-01-02 10:00:00'
	);
	$footer  = futurebase_navigation_test_insert_menu(
		'Footer navigation',
		'footer-navigation',
		futurebase_navigation_seed_content( 'footer-navigation' ),
		'2026-01-03 10:00:00'
	);
	update_option( 'futurebase_navigation_seeded', 1, false );

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
function futurebase_navigation_test_reference_post( $refs, $post_type = 'wp_block', $status = 'publish' ) {
	$content = '';
	foreach ( $refs as $ref ) {
		$content .= '<!-- wp:group --><div class="wp-block-group">';
		$content .= '<!-- wp:navigation {"ref":' . $ref . '} /-->';
		$content .= '</div><!-- /wp:group -->';
	}

	return futurebase_navigation_test_insert(
		array(
			'post_type'    => $post_type,
			'post_status'  => $status,
			'post_date'    => 'future' === $status ? '2099-01-01 12:00:00' : current_time( 'mysql' ),
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
function futurebase_navigation_test_state_is( $status ) {
	$state = futurebase_navigation_migration_state();
	futurebase_navigation_test_assert( $status === $state['status'], "Expected migration status {$status}; got {$state['status']}." );
	return $state;
}

/**
 * Run every disposable navigation migration scenario.
 *
 * @return void
 */
function futurebase_navigation_test_run() {
	try {
		// Fresh install: seed two distinct regions.
		futurebase_navigation_test_reset();
		futurebase_migrate_navigation_regions();
		$fresh_primary = futurebase_navigation_region_post( 'primary-navigation' );
		$fresh_footer  = futurebase_navigation_region_post( 'footer-navigation' );
		futurebase_navigation_test_assert( $fresh_primary instanceof WP_Post, 'Fresh migration did not create primary navigation.' );
		futurebase_navigation_test_assert( $fresh_footer instanceof WP_Post, 'Fresh migration did not create footer navigation.' );
		futurebase_navigation_test_assert( $fresh_primary->ID !== $fresh_footer->ID, 'Fresh regions share an ID.' );
		futurebase_navigation_test_state_is( 'complete' );

		// A translated label can contain JSON delimiters and literal slashes.
		futurebase_navigation_test_reset();
		$translated = 'About "quoted" \\ café -->';
		$translate  = static function ( $translation, $text, $domain ) use ( $translated ) {
			return 'futurebase' === $domain && 'About' === $text ? $translated : $translation;
		};
		add_filter( 'gettext', $translate, 10, 3 );
		try {
			futurebase_migrate_navigation_regions();
			$translated_menu   = futurebase_navigation_region_post( 'primary-navigation' );
			$translated_blocks = parse_blocks( $translated_menu->post_content );
			futurebase_navigation_test_assert( $translated === $translated_blocks[0]['attrs']['label'], 'Translated navigation label did not round-trip through storage and block JSON.' );
		} finally {
			remove_filter( 'gettext', $translate, 10 );
		}

		// Draft, scheduled, and pending content owns referenced menu IDs too.
		foreach ( array( 'draft', 'future', 'pending' ) as $status ) {
			$damaged   = futurebase_navigation_test_damaged_state();
			$reference = futurebase_navigation_test_reference_post( array( $damaged['primary'] ), 'page', $status );
			// Core normalizes a past scheduled date; set a real future date.
			if ( 'future' === $status ) {
				wp_update_post(
					array(
						'ID'          => $reference,
						'post_status' => 'future',
						'post_date'   => '2099-01-01 12:00:00',
					)
				);
			}
			futurebase_migrate_navigation_regions();
			futurebase_navigation_test_assert( futurebase_navigation_region_post( 'primary-navigation' )->ID === $damaged['primary'], $status . ' reference lost its menu ID.' );
			futurebase_navigation_test_assert( false !== strpos( get_post_field( 'post_content', $damaged['primary'] ), 'Client link' ), $status . ' reference lost client content.' );

			$damaged = futurebase_navigation_test_damaged_state();
			futurebase_navigation_test_reference_post( array( $damaged['primary'] ), 'page', $status );
			futurebase_navigation_test_reference_post( array( $damaged['legacy'] ) );
			$snapshot = static fn( $id ) => get_post( $id, ARRAY_A );
			$before   = array_map( $snapshot, array_values( $damaged ) );
			futurebase_migrate_navigation_regions();
			futurebase_navigation_test_state_is( 'needs_attention' );
			futurebase_navigation_test_assert( array_map( $snapshot, array_values( $damaged ) ) === $before, 'Conflicting references mutated navigation records.' );
		}

		// Unpublished records never become the fallback menu in either region.
		foreach ( array( 'primary', 'footer' ) as $region ) {
			futurebase_navigation_test_reset();
			$draft = futurebase_navigation_test_insert_menu( 'Draft', $region . '-navigation', '<!-- wp:navigation-link {"label":"Private draft","url":"/draft/"} /-->', '2026-01-01 10:00:00' );
			wp_update_post(
				array(
					'ID'          => $draft,
					'post_status' => 'draft',
				)
			);
			ob_start();
			include get_theme_file_path( 'patterns/_nav-' . $region . '.php' );
			$markup = ob_get_clean();
			futurebase_navigation_test_assert( false === strpos( $markup, '"ref":' . $draft ) && false === strpos( $markup, 'Private draft' ), 'Unpublished menu leaked into pattern output.' );
			futurebase_navigation_test_assert( false !== strpos( $markup, 'wp:navigation-link' ), 'Unpublished menu suppressed inline fallback links.' );
		}

		// Normal adoption: preserve the client ID/content and a custom footer.
		futurebase_navigation_test_reset();
		$legacy_content = '<!-- wp:navigation-link {"label":"Work","url":"https://example.test/work/"} /-->';
		$legacy_id      = futurebase_navigation_test_insert_menu( 'Main Menu', 'client-menu', $legacy_content, '2026-01-01 10:00:00' );
		$footer_id      = futurebase_navigation_test_insert_menu( 'Legal links', 'footer-navigation', '<!-- wp:navigation-link {"label":"Privacy","url":"/privacy/"} /-->', '2026-01-02 10:00:00' );
		futurebase_migrate_navigation_regions();
		$adopted = futurebase_navigation_region_post( 'primary-navigation' );
		futurebase_navigation_test_assert( $adopted instanceof WP_Post && $legacy_id === $adopted->ID, 'Legacy adoption did not preserve the client post ID.' );
		futurebase_navigation_test_assert( 'Main Menu' === $adopted->post_title && $legacy_content === $adopted->post_content, 'Legacy adoption changed client title/content.' );
		futurebase_navigation_test_assert( futurebase_navigation_region_post( 'footer-navigation' )->ID === $footer_id, 'Existing footer was replaced.' );

		// Core's locale-independent default slug is retitled even when localized.
		futurebase_navigation_test_reset();
		$localized_id = futurebase_navigation_test_insert_menu( 'Navegación', 'navigation', $legacy_content, '2026-01-01 10:00:00' );
		futurebase_migrate_navigation_regions();
		$localized = futurebase_navigation_region_post( 'primary-navigation' );
		futurebase_navigation_test_assert( $localized_id === $localized->ID, 'Localized core default did not preserve its ID.' );
		futurebase_navigation_test_assert( 'Primary navigation' === $localized->post_title, 'Core default slug was not given a distinct primary label.' );

		// Neither candidate referenced: preserve the legacy ID and draft the seed.
		$damaged = futurebase_navigation_test_damaged_state();
		futurebase_migrate_navigation_regions();
		$repaired = futurebase_navigation_region_post( 'primary-navigation' );
		futurebase_navigation_test_assert( $damaged['legacy'] === $repaired->ID, 'Unreferenced repair did not preserve the legacy ID.' );
		futurebase_navigation_test_assert( 'draft' === get_post_status( $damaged['primary'] ), 'Unused seed was not retained as a draft.' );
		futurebase_navigation_test_assert( 2 === (int) get_post_meta( $damaged['primary'], '_futurebase_navigation_migration', true )['version'], 'Retired seed lacks migration metadata.' );

		// Only the seed referenced: preserve that ID but move client content/title.
		$damaged = futurebase_navigation_test_damaged_state();
		futurebase_navigation_test_reference_post( array( $damaged['primary'] ) );
		futurebase_migrate_navigation_regions();
		$repaired = futurebase_navigation_region_post( 'primary-navigation' );
		futurebase_navigation_test_assert( $damaged['primary'] === $repaired->ID, 'Referenced seed ID was not preserved.' );
		futurebase_navigation_test_assert( false !== strpos( $repaired->post_content, 'Client link' ), 'Client content was not moved into the referenced survivor.' );
		futurebase_navigation_test_assert( 'draft' === get_post_status( $damaged['legacy'] ), 'Unused legacy post was not retained as a draft.' );

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
		$damaged = futurebase_navigation_test_damaged_state();
		futurebase_navigation_test_reference_post( array( $damaged['legacy'] ), 'nav_test_item', 'private' );
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_assert( futurebase_navigation_region_post( 'primary-navigation' )->ID === $damaged['legacy'], 'Private custom-post reference was not detected.' );

		// Both candidates referenced: do not mutate either.
		$damaged           = futurebase_navigation_test_damaged_state();
		$primary_before    = get_post( $damaged['primary'] );
		$legacy_before     = get_post( $damaged['legacy'] );
		$reference_post_id = futurebase_navigation_test_reference_post( array( $damaged['primary'], $damaged['legacy'] ), 'wp_template' );
		futurebase_navigation_test_assert( $reference_post_id > 0, 'Template reference fixture was not inserted.' );
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_state_is( 'needs_attention' );
		futurebase_navigation_test_assert( get_post( $damaged['primary'] )->post_content === $primary_before->post_content, 'Ambiguous repair changed the seed.' );
		futurebase_navigation_test_assert( get_post( $damaged['legacy'] )->post_content === $legacy_before->post_content, 'Ambiguous repair changed the legacy menu.' );

		// Ambiguity is read-only even when the damaged state lacks a footer.
		$damaged = futurebase_navigation_test_damaged_state();
		wp_delete_post( $damaged['footer'], true );
		futurebase_navigation_test_reference_post( array( $damaged['primary'], $damaged['legacy'] ), 'wp_template_part' );
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_state_is( 'needs_attention' );
		futurebase_navigation_test_assert( null === futurebase_navigation_region_post( 'footer-navigation' ), 'Ambiguous repair created a missing footer.' );

		// Edited seed: safely refuse rather than overwriting either menu.
		$damaged = futurebase_navigation_test_damaged_state();
		wp_update_post(
			array(
				'ID'           => $damaged['primary'],
				'post_content' => get_post( $damaged['primary'] )->post_content . "\n<!-- wp:navigation-link {\"label\":\"Edited\",\"url\":\"/edited/\"} /-->",
			)
		);
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_state_is( 'needs_attention' );
		futurebase_navigation_test_assert( 'publish' === get_post_status( $damaged['legacy'] ), 'Edited-seed refusal changed the legacy menu.' );

		// A title collision is replaced with the distinct primary-region label.
		$damaged = futurebase_navigation_test_damaged_state( 'Footer navigation' );
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_assert( 'Primary navigation' === futurebase_navigation_region_post( 'primary-navigation' )->post_title, 'Footer title collision was preserved.' );

		// Failure in the second repair write rolls the first write back.
		$damaged        = futurebase_navigation_test_damaged_state();
		$primary_before = futurebase_navigation_snapshot( get_post( $damaged['primary'] ) );
		futurebase_navigation_test_reference_post( array( $damaged['primary'] ) );
		$fail_retire = static function ( $maybe_empty, $postarr ) use ( $damaged ) {
			if ( (int) ( $postarr['ID'] ?? 0 ) === $damaged['legacy'] && 'draft' === ( $postarr['post_status'] ?? '' ) ) {
				return true;
			}
			return $maybe_empty;
		};
		add_filter( 'wp_insert_post_empty_content', $fail_retire, 10, 2 );
		futurebase_migrate_navigation_regions();
		remove_filter( 'wp_insert_post_empty_content', $fail_retire, 10 );
		futurebase_navigation_test_state_is( 'failed' );
		futurebase_navigation_test_assert( futurebase_navigation_snapshot( get_post( $damaged['primary'] ) ) === $primary_before, 'Failed repair did not roll back the first write.' );
		futurebase_navigation_test_assert( 'publish' === get_post_status( $damaged['legacy'] ), 'Failed repair changed the legacy status.' );

		// Technical failures stop after three writes and stay read-only thereafter.
		futurebase_navigation_test_reset();
		$insert_attempts = 0;
		$fail_inserts    = static function ( $maybe_empty, $postarr ) use ( &$insert_attempts ) {
			if ( 'wp_navigation' === ( $postarr['post_type'] ?? '' ) ) {
				++$insert_attempts;
				return true;
			}
			return $maybe_empty;
		};
		add_filter( 'wp_insert_post_empty_content', $fail_inserts, 10, 2 );
		futurebase_migrate_navigation_regions();
		futurebase_migrate_navigation_regions();
		futurebase_migrate_navigation_regions();
		$failed_state = futurebase_navigation_test_state_is( 'needs_attention' );
		futurebase_navigation_test_assert( 3 === $failed_state['attempts'], 'Technical failures did not stop at three attempts.' );
		$attempts_at_cap = $insert_attempts;
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_assert( $attempts_at_cap === $insert_attempts, 'Capped migration attempted another write.' );
		remove_filter( 'wp_insert_post_empty_content', $fail_inserts, 10 );

		// A manual resolution is detected without further content writes.
		$damaged = futurebase_navigation_test_damaged_state();
		futurebase_navigation_test_reference_post( array( $damaged['primary'], $damaged['legacy'] ) );
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_state_is( 'needs_attention' );
		wp_update_post(
			array(
				'ID'          => $damaged['legacy'],
				'post_status' => 'draft',
				'post_name'   => 'retired-navigation-manual',
			)
		);
		futurebase_migrate_navigation_regions();
		futurebase_navigation_test_state_is( 'complete' );
		futurebase_navigation_test_assert( false === get_option( 'futurebase_navigation_seeded', false ), 'Manual completion retained the obsolete option.' );

		futurebase_navigation_test_reset();
		futurebase_migrate_navigation_regions();
		echo "Success: Navigation migration scenarios passed.\n";
	} catch ( Throwable $error ) {
		futurebase_navigation_test_reset();
		echo 'Error: ' . esc_html( $error->getMessage() ) . "\n";
		exit( 1 );
	}
}

futurebase_navigation_test_run();
