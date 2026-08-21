<?php
/**
 * Companion SEO runtime fixture and assertions.
 *
 * Run through WP-CLI inside wp-env. The surrounding shell script owns HTTP
 * assertions and cleanup orchestration.
 *
 * @package bin
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	echo "test-seo-runtime.php must run via `wp eval-file`.\n";
	exit( 1 );
}

call_user_func(
	function () use ( $args ) {
		$command   = isset( $args[0] ) && is_string( $args[0] ) ? $args[0] : '';
		$state_key = 'compseo_runtime_test_state';

		$expect = static function ( bool $condition, string $message ): void {
			if ( ! $condition ) {
				WP_CLI::error( $message );
			}
		};

		$plugin_source = static function ( string $provider = '' ): string {
			if ( 'yoast' === $provider ) {
				return "<?php\n/**\n * Plugin Name: Companion SEO Yoast Fixture\n */\nif ( ! defined( 'WPSEO_VERSION' ) ) { define( 'WPSEO_VERSION', '99.0-test' ); }\n";
			}
			if ( 'rank-math' === $provider ) {
				return "<?php\n/**\n * Plugin Name: Companion SEO Rank Math Fixture\n */\nif ( ! defined( 'RANK_MATH_VERSION' ) ) { define( 'RANK_MATH_VERSION', '99.0-test' ); }\n";
			}

			return <<<'PHP'
<?php
/**
 * Plugin Name: Companion SEO Runtime Fixture
 */
add_action(
	'init',
	static function (): void {
		register_post_type(
			'compseo_book',
			array(
				'public'       => true,
				'show_in_rest' => true,
				'label'        => 'Runtime books',
				'supports'     => array( 'title', 'editor' ),
			)
		);
	},
	5
);

if ( get_option( 'compseo_runtime_invalid_contract' ) ) {
	add_filter(
		'compseo_document',
		static function () {
			return 'COMPSEO_REJECTED_VALUE';
		}
	);
}

if ( get_option( 'compseo_runtime_valid_contract' ) ) {
	add_filter(
		'compseo_document',
		static function ( array $document ): array {
			$document['title']       = 'Adapter-owned document title';
			$document['description'] = 'Adapter-owned public description.';
			$document['canonical']   = 'https://adapter.example/canonical?lang=sv';
			return $document;
		}
	);
}
PHP;
		};

		$install_plugin = static function ( string $slug, string $source ) use ( $expect ): void {
			$directory = WP_PLUGIN_DIR . '/' . $slug;
			$expect( wp_mkdir_p( $directory ), 'Could not create runtime fixture plugin directory.' );
			$written = file_put_contents( $directory . '/' . $slug . '.php', $source ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Disposable wp-env fixture setup.
			$expect( false !== $written, 'Could not write runtime fixture plugin.' );
		};

		if ( 'install-plugins' === $command ) {
			$install_plugin( 'compseo-runtime-fixture', $plugin_source() );
			$install_plugin( 'compseo-fixture-yoast', $plugin_source( 'yoast' ) );
			$install_plugin( 'compseo-fixture-rank-math', $plugin_source( 'rank-math' ) );
			WP_CLI::success( 'Companion SEO fixture plugins installed.' );
			return;
		}

		$load_state = static function () use ( $state_key, $expect ): array {
			$state = get_option( $state_key, array() );
			$expect( is_array( $state ) && ! empty( $state['ids'] ), 'Companion SEO runtime state is missing.' );
			return $state;
		};

		if ( 'setup' === $command ) {
			$existing = get_option( $state_key, array() );
			$expect( empty( $existing ), 'Companion SEO runtime state already exists; run cleanup first.' );

			$administrator = get_users(
				array(
					'role'   => 'administrator',
					'number' => 1,
				)
			);
			$expect( isset( $administrator[0] ) && $administrator[0] instanceof WP_User, 'An administrator fixture user is required.' );
			$author_id = (int) $administrator[0]->ID;
			wp_set_current_user( $author_id );

			$original = array();
			foreach ( array( 'show_on_front', 'page_on_front', 'page_for_posts', 'blogdescription', 'permalink_structure', 'posts_per_page', 'compseo_settings' ) as $option ) {
				$original[ $option ] = get_option( $option );
			}

			$insert_post = static function ( array $data ) use ( $expect, $author_id ): int {
				$data['post_author'] = $author_id;
				$post_id             = wp_insert_post( $data, true );
				$expect( ! is_wp_error( $post_id ) && is_int( $post_id ) && $post_id > 0, 'Could not create a runtime content fixture.' );
				return $post_id;
			};

			$insert_image = static function ( string $source_name, string $alt ) use ( $expect, $author_id ): int {
				$source = get_stylesheet_directory() . '/fixtures/media/' . $source_name;
				$expect( is_file( $source ), 'Fixture image is missing: ' . $source_name );
				$contents = file_get_contents( $source ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local disposable fixture image.
				$expect( false !== $contents, 'Could not read fixture image: ' . $source_name );
				$upload = wp_upload_bits( 'compseo-' . wp_generate_uuid4() . '-' . $source_name, null, $contents );
				$expect( empty( $upload['error'] ) && isset( $upload['file'], $upload['url'], $upload['type'] ), 'Could not upload fixture image.' );

				$attachment_id = wp_insert_attachment(
					array(
						'post_author'    => $author_id,
						'post_mime_type' => $upload['type'],
						'post_status'    => 'inherit',
						'post_title'     => $alt,
					),
					$upload['file'],
					0,
					true
				);
				$expect( ! is_wp_error( $attachment_id ) && is_int( $attachment_id ) && $attachment_id > 0, 'Could not create fixture attachment.' );

				require_once ABSPATH . 'wp-admin/includes/image.php';
				wp_update_attachment_metadata( $attachment_id, wp_generate_attachment_metadata( $attachment_id, $upload['file'] ) );
				update_post_meta( $attachment_id, '_wp_attachment_image_alt', $alt );
				return $attachment_id;
			};

			$featured_id = $insert_image( 'placeholder-wide.png', 'Protected featured artwork' );
			$default_id  = $insert_image( 'placeholder-portrait.png', 'Public default artwork' );

			$term = wp_insert_term( 'Companion runtime', 'category', array( 'slug' => 'compseo-runtime' ) );
			$expect( ! is_wp_error( $term ) && isset( $term['term_id'] ), 'Could not create runtime category.' );
			$term_id = (int) $term['term_id'];

			$public_id = $insert_post(
				array(
					'post_type'     => 'post',
					'post_status'   => 'publish',
					'post_name'     => 'compseo-runtime-public',
					'post_title'    => 'Visible runtime story',
					'post_content'  => '<!-- wp:group --><div class="wp-block-group"><!-- wp:paragraph --><p>Första meningen med café. Second sentence stays public. Third sentence must not appear in metadata.</p><!-- /wp:paragraph --></div><!-- /wp:group -->',
					'post_category' => array( $term_id ),
				)
			);
			set_post_thumbnail( $public_id, $featured_id );

			$no_image_id = $insert_post(
				array(
					'post_type'    => 'post',
					'post_status'  => 'publish',
					'post_name'    => 'compseo-runtime-no-image',
					'post_title'   => 'Runtime story without an image',
					'post_excerpt' => 'Explicit excerpt wins over the content fallback.',
					'post_content' => '<!-- wp:paragraph --><p>This content fallback must not win.</p><!-- /wp:paragraph -->',
				)
			);

			$authored_id      = $insert_post(
				array(
					'post_type'     => 'post',
					'post_status'   => 'publish',
					'post_name'     => 'compseo-runtime-authored',
					'post_title'    => 'Source authored story',
					'post_content'  => '<!-- wp:paragraph --><p>Ordinary public body.</p><!-- /wp:paragraph -->',
					'post_category' => array( $term_id ),
				)
			);
			$long_description = str_repeat( 'Authored descriptions remain complete. ', 8 );
			update_post_meta( $authored_id, '_compseo_title', 'Authored Full Title' );
			update_post_meta( $authored_id, '_compseo_description', trim( $long_description ) );
			update_post_meta( $authored_id, '_compseo_canonical', 'https://example.net/reference?lang=sv' );
			update_post_meta( $authored_id, '_compseo_social_image_id', $default_id );
			update_post_meta( $authored_id, '_compseo_noindex', true );

			$protected_id = $insert_post(
				array(
					'post_type'     => 'post',
					'post_status'   => 'publish',
					'post_name'     => 'compseo-runtime-protected',
					'post_title'    => 'Protected runtime story',
					'post_excerpt'  => 'HIDDEN EXCERPT MUST NOT LEAK.',
					'post_content'  => '<!-- wp:paragraph --><p>TOP SECRET CONTENT MUST NOT LEAK.</p><!-- /wp:paragraph -->',
					'post_password' => 'opensesame',
				)
			);
			set_post_thumbnail( $protected_id, $featured_id );

			$protected_authored_id = $insert_post(
				array(
					'post_type'     => 'post',
					'post_status'   => 'publish',
					'post_name'     => 'compseo-runtime-protected-authored',
					'post_title'    => 'Protected authored runtime story',
					'post_content'  => '<!-- wp:paragraph --><p>SECOND PRIVATE BODY MUST NOT LEAK.</p><!-- /wp:paragraph -->',
					'post_password' => 'opensesame',
				)
			);
			update_post_meta( $protected_authored_id, '_compseo_title', 'Public protected title' );
			update_post_meta( $protected_authored_id, '_compseo_description', 'Deliberately public protected description.' );
			update_post_meta( $protected_authored_id, '_compseo_social_image_id', $featured_id );

			$front_id      = $insert_post(
				array(
					'post_type'    => 'page',
					'post_status'  => 'publish',
					'post_name'    => 'compseo-runtime-front',
					'post_title'   => 'Runtime front page',
					'post_content' => '<!-- wp:paragraph --><p>Static front sentence one. Static front sentence two. Static front sentence three.</p><!-- /wp:paragraph -->',
				)
			);
			$posts_page_id = $insert_post(
				array(
					'post_type'   => 'page',
					'post_status' => 'publish',
					'post_name'   => 'compseo-runtime-news',
					'post_title'  => 'Runtime news',
				)
			);
			update_post_meta( $posts_page_id, '_compseo_description', 'Assigned posts page description.' );

			$book_id = $insert_post(
				array(
					'post_type'    => 'compseo_book',
					'post_status'  => 'publish',
					'post_name'    => 'compseo-runtime-book',
					'post_title'   => 'Runtime book',
					'post_content' => '<!-- wp:paragraph --><p>Book sentence one. Book sentence two.</p><!-- /wp:paragraph -->',
				)
			);

			update_option( 'permalink_structure', '/%postname%/' );
			update_option( 'posts_per_page', 1 );
			update_option( 'blogdescription', 'Public site tagline' );
			update_option( 'show_on_front', 'posts' );
			update_option(
				'compseo_settings',
				array(
					'social' => array( 'default_image_id' => $default_id ),
					'entity' => array(
						'type' => 'organization',
						'name' => 'Runtime Studio',
						'url'  => home_url( '/' ),
					),
				)
			);
			flush_rewrite_rules();

			update_option(
				$state_key,
				array(
					'original' => $original,
					'term_id'  => $term_id,
					'ids'      => array(
						'public'             => $public_id,
						'no_image'           => $no_image_id,
						'authored'           => $authored_id,
						'protected'          => $protected_id,
						'protected_authored' => $protected_authored_id,
						'front'              => $front_id,
						'posts_page'         => $posts_page_id,
						'book'               => $book_id,
						'featured'           => $featured_id,
						'default'            => $default_id,
					),
				)
			);

			WP_CLI::success( 'Companion SEO runtime content created.' );
			return;
		}

		if ( 'assert-contracts' === $command ) {
			$state = $load_state();
			$ids   = $state['ids'];

			foreach ( array( 'post', 'page', 'compseo_book' ) as $post_type ) {
				$registered = get_registered_meta_keys( 'post', $post_type );
				foreach ( array( '_compseo_title', '_compseo_description', '_compseo_noindex', '_compseo_canonical', '_compseo_social_image_id' ) as $key ) {
					$expect( isset( $registered[ $key ] ), $post_type . ' is missing registered metadata ' . $key );
					$expect( true === $registered[ $key ]['show_in_rest'], $key . ' must be REST-visible.' );
					$expect( true === $registered[ $key ]['revisions_enabled'], $key . ' must be revisioned.' );
					$expect( is_callable( $registered[ $key ]['auth_callback'] ), $key . ' must carry an auth callback.' );
				}
				$expect( post_type_supports( $post_type, 'custom-fields' ), $post_type . ' must support custom fields.' );
				$expect( post_type_supports( $post_type, 'revisions' ), $post_type . ' must support revisions.' );
			}

			$canonical_key = '_compseo_canonical';
			update_post_meta( $ids['public'], $canonical_key, 'https://outside.example/path?lang=sv' );
			$expect( 'https://outside.example/path?lang=sv' === get_post_meta( $ids['public'], $canonical_key, true ), 'Valid cross-origin canonical was not retained.' );
			update_post_meta( $ids['public'], $canonical_key, 'https://user:secret@example.com/path' );
			$expect( '' === get_post_meta( $ids['public'], $canonical_key, true ), 'Canonical userinfo must be rejected.' );
			update_post_meta( $ids['public'], $canonical_key, 'https://example.com/path#fragment' );
			$expect( '' === get_post_meta( $ids['public'], $canonical_key, true ), 'Canonical fragments must be rejected.' );
			foreach ( array( '//example.com/path', '/relative-path', 'ftp://example.com/path', 'javascript:alert(1)' ) as $invalid_canonical ) {
				update_post_meta( $ids['public'], $canonical_key, $invalid_canonical );
				$expect( '' === get_post_meta( $ids['public'], $canonical_key, true ), 'Malformed or non-HTTP canonical must be rejected.' );
			}
			delete_post_meta( $ids['public'], $canonical_key );
			update_post_meta( $ids['public'], '_compseo_social_image_id', array( 'not', 'an', 'id' ) );
			$sanitized_image = get_post_meta( $ids['public'], '_compseo_social_image_id', true );
			$expect( 0 === $sanitized_image || '0' === $sanitized_image, 'Structured social-image input must be rejected.' );
			delete_post_meta( $ids['public'], '_compseo_social_image_id' );

			$long_title = trim( str_repeat( 'Unicode Å title remains complete ', 4 ) );
			update_post_meta( $ids['public'], '_compseo_title', $long_title );
			$expect( get_post_meta( $ids['public'], '_compseo_title', true ) === $long_title, 'Authored titles must not be truncated.' );
			$revision_id = wp_save_post_revision( $ids['public'] );
			$expect( is_int( $revision_id ) && $revision_id > 0, 'Could not create a metadata revision fixture.' );
			$expect( get_post_meta( $revision_id, '_compseo_title', true ) === $long_title, 'Revisioned SEO metadata was not copied to the revision.' );
			delete_post_meta( $ids['public'], '_compseo_title' );

			$registered = get_registered_meta_keys( 'post', 'post' );
			$auth       = $registered['_compseo_title']['auth_callback'];
			wp_set_current_user( 0 );
			$expect( false === call_user_func( $auth, false, '_compseo_title', $ids['public'], 0, 'edit_post_meta', array() ), 'Anonymous metadata updates must be denied.' );
			$administrator = get_users(
				array(
					'role'   => 'administrator',
					'number' => 1,
				)
			);
			wp_set_current_user( (int) $administrator[0]->ID );
			$expect( true === call_user_func( $auth, false, '_compseo_title', $ids['public'], (int) $administrator[0]->ID, 'edit_post_meta', array() ), 'Editors with edit_post must be authorized.' );

			WP_CLI::success( 'Companion SEO metadata contracts pass.' );
			return;
		}

		if ( 'assert-suppressed' === $command ) {
			$registered = get_registered_meta_keys( 'post', 'post' );
			$expect( ! isset( $registered['_compseo_title'] ), 'Suppressed runtime must not register REST metadata.' );
			WP_CLI::success( 'Companion SEO registrar is suppressed.' );
			return;
		}

		if ( 'default-image-off' === $command || 'default-image-on' === $command ) {
			$state    = $load_state();
			$settings = get_option( 'compseo_settings', array() );
			$expect( is_array( $settings ), 'Companion SEO settings fixture is malformed.' );
			$settings['social']                     = isset( $settings['social'] ) && is_array( $settings['social'] ) ? $settings['social'] : array();
			$settings['social']['default_image_id'] = 'default-image-on' === $command ? (int) $state['ids']['default'] : 0;
			update_option( 'compseo_settings', $settings );
			WP_CLI::success( 'Companion SEO default image fixture updated.' );
			return;
		}

		if ( 'assert-invalid-contract' === $command ) {
			$state = $load_state();
			$query = new WP_Query( array( 'p' => $state['ids']['public'] ) );
			$expect( $query->is_singular() && $query->have_posts(), 'Could not prepare singular query for invalid-contract assertion.' );

			$GLOBALS['wp_query']    = $query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Disposable CLI request fixture.
			$GLOBALS['post']        = $query->post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Disposable CLI request fixture.
			$_SERVER['SERVER_NAME'] = 'localhost';
			setup_postdata( $query->post );

			$wrong = array();
			add_action(
				'doing_it_wrong_run',
				static function ( string $function_name, string $message, string $version ) use ( &$wrong ): void {
					$wrong[] = array( $function_name, $message, $version );
				},
				10,
				3
			);

			ob_start();
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Intentionally exercising core's wp_head lifecycle.
			do_action( 'wp_head' );
			$output = (string) ob_get_clean();
			wp_reset_postdata();

			$messages = wp_json_encode( $wrong );
			$expect( false !== strpos( $output, 'Första meningen med café. Second sentence stays public.' ), 'Invalid document filter did not retain the internal fallback.' );
			$expect( false === strpos( $output, 'COMPSEO_REJECTED_VALUE' ), 'Rejected filter values must never be emitted.' );
			$expect( is_string( $messages ) && false !== strpos( $messages, 'compseo_document' ), 'Invalid filter output must trigger a named development warning.' );
			$expect( false === strpos( (string) $messages, 'COMPSEO_REJECTED_VALUE' ), 'Development warnings must not echo rejected values.' );

			WP_CLI::success( 'Companion SEO invalid-filter fallback passes.' );
			return;
		}

		if ( 'cleanup' === $command ) {
			$state = get_option( $state_key, array() );
			if ( is_array( $state ) && isset( $state['ids'] ) && is_array( $state['ids'] ) ) {
				foreach ( $state['ids'] as $post_id ) {
					if ( is_numeric( $post_id ) ) {
						wp_delete_post( (int) $post_id, true );
					}
				}
				if ( isset( $state['term_id'] ) ) {
					wp_delete_term( (int) $state['term_id'], 'category' );
				}
				if ( isset( $state['original'] ) && is_array( $state['original'] ) ) {
					foreach ( $state['original'] as $option => $value ) {
						update_option( (string) $option, $value );
					}
				}
			}

			delete_option( $state_key );
			delete_option( 'compseo_runtime_invalid_contract' );
			delete_option( 'compseo_runtime_valid_contract' );
			flush_rewrite_rules();
			WP_CLI::success( 'Companion SEO runtime fixtures removed.' );
			return;
		}

		WP_CLI::error( 'Unknown companion SEO runtime command.' );
	}
);
