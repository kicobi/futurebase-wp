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

		$find_class_callback = static function ( string $hook_name, string $class_suffix, string $method ): ?callable {
			$hook = $GLOBALS['wp_filter'][ $hook_name ] ?? null;
			if ( ! $hook instanceof WP_Hook ) {
				return null;
			}

			foreach ( $hook->callbacks as $callbacks ) {
				foreach ( $callbacks as $registration ) {
					$callback = $registration['function'] ?? null;
					if ( is_array( $callback ) && isset( $callback[0], $callback[1] ) && is_string( $callback[0] ) && str_ends_with( $callback[0], $class_suffix ) && $method === $callback[1] ) {
						return $callback;
					}
				}
			}

			return null;
		};

		$seo_namespace = static function () use ( $expect, $find_class_callback ): string {
			static $namespace = '';
			if ( '' !== $namespace ) {
				return $namespace;
			}

			// Management remains registered even while a premium provider suppresses
			// the runtime, so this callback is the stable identity seam for every
			// fixture command.
			$callback = $find_class_callback( 'admin_menu', '\\SEO\\Admin', 'register_page' );
			$class    = is_array( $callback ) && isset( $callback[0] ) && is_string( $callback[0] ) ? $callback[0] : '';
			$suffix   = '\\Admin';
			$expect( '' !== $class && str_ends_with( $class, $suffix ), 'Could not discover the promoted companion SEO namespace.' );

			$namespace = substr( $class, 0, -strlen( $suffix ) );
			return $namespace;
		};

		$seo_class = static function ( string $short_name ) use ( $expect, $seo_namespace ): string {
			$class = $seo_namespace() . '\\' . $short_name;
			$expect( class_exists( $class ), sprintf( 'Companion SEO class is unavailable: %s.', $short_name ) );
			return $class;
		};

		$seo_plugin_dir = static function () use ( $expect, $seo_class ): string {
			$reflection = new ReflectionClass( $seo_class( 'Plugin' ) );
			$file       = $reflection->getFileName();
			$expect( is_string( $file ) && '' !== $file, 'Could not resolve the promoted companion SEO plugin directory.' );
			return dirname( (string) $file, 2 );
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
				'has_archive'  => true,
				'rewrite'      => array( 'slug' => 'runtime-books' ),
				'show_in_rest' => true,
				'label'        => 'Runtime books',
				'supports'     => array( 'title', 'editor' ),
			)
		);
		register_taxonomy(
			'compseo_genre',
			array( 'compseo_book' ),
			array(
				'public'       => true,
				'rewrite'      => array( 'slug' => 'runtime-genre' ),
				'show_in_rest' => true,
				'label'        => 'Runtime genres',
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

if ( get_option( 'compseo_runtime_indexable_lang' ) ) {
	add_filter(
		'compseo_indexable_query_vars',
		static function ( array $names ): array {
			$names[] = 'lang';
			return array_values( array_unique( $names ) );
		}
	);
}

if ( get_option( 'compseo_runtime_invalid_indexing_contract' ) ) {
	add_filter(
		'compseo_indexing_decision',
		static function (): array {
			return array(
				'index'     => 'COMPSEO_REJECTED_INDEX_SECRET',
				'follow'    => 'follow',
				'canonical' => null,
				'reason'    => 'fixture',
			);
		}
	);
}

if ( get_option( 'compseo_runtime_invalid_query_contract' ) ) {
	add_filter(
		'compseo_indexable_query_vars',
		static function (): array {
			return array( 'lang', 'COMPSEO_REJECTED_QUERY_SECRET' );
		}
	);
}

if ( get_option( 'compseo_runtime_force_index' ) ) {
	add_filter(
		'compseo_indexing_decision',
		static function ( array $decision ): array {
			$decision['index']  = 'index';
			$decision['follow'] = 'follow';
			$decision['reason'] = 'fixture_override';
			return $decision;
		}
	);
}

if ( get_option( 'compseo_runtime_force_noindex' ) ) {
	add_filter(
		'compseo_indexing_decision',
		static function ( array $decision ): array {
			$decision['index']  = 'noindex';
			$decision['follow'] = 'follow';
			$decision['reason'] = 'fixture_noindex';
			return $decision;
		}
	);
}

if ( get_option( 'compseo_runtime_force_cross_noindex' ) ) {
	add_filter(
		'compseo_indexing_decision',
		static function ( array $decision ): array {
			$decision['index']     = 'noindex';
			$decision['follow']    = 'follow';
			$decision['canonical'] = 'https://adapter.example/cross-document';
			$decision['reason']    = 'fixture_cross_noindex';
			return $decision;
		}
	);
}

if ( get_option( 'compseo_runtime_sitemap_page_size' ) ) {
	add_filter(
		'wp_sitemaps_max_urls',
		static function (): int {
			return max( 1, (int) get_option( 'compseo_runtime_sitemap_page_size' ) );
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

		if ( 'assert-permanent-contract' === $command ) {
			$manifest_json = file_get_contents( dirname( __DIR__ ) . '/fixtures/seo-permanent-contract.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read-only committed test fixture.
			$manifest      = is_string( $manifest_json ) ? json_decode( $manifest_json, true ) : null;
			$expect( is_array( $manifest ) && isset( $manifest['filters'] ) && is_array( $manifest['filters'] ), 'Permanent SEO contract manifest is unreadable.' );

			$contracts_class = $seo_class( 'Contracts' );
			$context         = array(
				'url'                => home_url( '/runtime-contract/' ),
				'kind'               => 'singular',
				'object_id'          => 0,
				'post_type'          => 'post',
				'taxonomy'           => '',
				'paged'              => 1,
				'query_args'         => array(),
				'password_protected' => false,
			);
			$document        = array(
				'title'           => 'Internal title',
				'description'     => 'Internal description.',
				'canonical'       => home_url( '/runtime-contract/' ),
				'social_image_id' => 0,
			);
			$decision        = array(
				'index'     => 'inherit',
				'follow'    => 'inherit',
				'canonical' => home_url( '/runtime-contract/' ),
				'reason'    => 'runtime_contract',
			);
			$graph           = array( array( '@type' => 'WebSite' ) );

			$cases = array(
				'compseo_is_suppressed'        => array(
					'arguments' => array( false, null ),
					'invoke'    => static fn(): bool => $contracts_class::suppression( false, null ),
					'adapt'     => static fn( array $arguments ): bool => ! $arguments[0],
					'expected'  => true,
					'invalid'   => 'COMPSEO_REJECTED_SUPPRESSION_SECRET',
					'fallback'  => false,
				),
				'compseo_supported_post_types' => array(
					'arguments' => array( array( 'post' ) ),
					'invoke'    => static fn(): array => $contracts_class::supported_post_types( array( 'post' ) ),
					'adapt'     => static fn( array $arguments ): array => array_merge( $arguments[0], array( 'compseo_book' ) ),
					'expected'  => array( 'post', 'compseo_book' ),
					'invalid'   => array( 'COMPSEO_REJECTED_POST_TYPE_SECRET' ),
					'fallback'  => array( 'post' ),
				),
				'compseo_document'             => array(
					'arguments' => array( $document, $context ),
					'invoke'    => static fn(): array => $contracts_class::document( $document, $context ),
					'adapt'     => static function ( array $arguments ): array {
						$arguments[0]['title'] = 'Adapter title';
						return $arguments[0];
					},
					'expected'  => array_merge( $document, array( 'title' => 'Adapter title' ) ),
					'invalid'   => 'COMPSEO_REJECTED_DOCUMENT_SECRET',
					'fallback'  => $document,
				),
				'compseo_schema_graph'         => array(
					'arguments' => array( $graph, $context, $document ),
					'invoke'    => static fn(): array => $contracts_class::schema_graph( $graph, $context, $document ),
					'adapt'     => static function ( array $arguments ): array {
						$arguments[0][] = array( '@type' => 'Thing' );
						return $arguments[0];
					},
					'expected'  => array( array( '@type' => 'WebSite' ), array( '@type' => 'Thing' ) ),
					'invalid'   => 'COMPSEO_REJECTED_SCHEMA_SECRET',
					'fallback'  => $graph,
				),
				'compseo_indexable_query_vars' => array(
					'arguments' => array( array() ),
					'invoke'    => static fn(): array => $contracts_class::indexable_query_vars( array() ),
					'adapt'     => static fn( array $arguments ): array => array_merge( $arguments[0], array( 'lang' ) ),
					'expected'  => array( 'lang' ),
					'invalid'   => array( 'COMPSEO_REJECTED_QUERY_SECRET' ),
					'fallback'  => array(),
				),
				'compseo_indexing_decision'    => array(
					'arguments' => array( $decision, $context ),
					'invoke'    => static fn(): array => $contracts_class::indexing_decision( $decision, $context ),
					'adapt'     => static function ( array $arguments ): array {
						$arguments[0]['index']  = 'noindex';
						$arguments[0]['follow'] = 'follow';
						return $arguments[0];
					},
					'expected'  => array_merge(
						$decision,
						array(
							'index'  => 'noindex',
							'follow' => 'follow',
						)
					),
					'invalid'   => array_merge( $decision, array( 'index' => 'COMPSEO_REJECTED_DECISION_SECRET' ) ),
					'fallback'  => $decision,
				),
			);

			$manifest_filters = array();
			foreach ( $manifest['filters'] as $filter ) {
				if ( is_array( $filter ) && isset( $filter['name'], $filter['arguments'] ) && is_string( $filter['name'] ) && is_array( $filter['arguments'] ) ) {
					$manifest_filters[ $filter['name'] ] = count( $filter['arguments'] );
				}
			}
			$expect( array_keys( $cases ) === array_keys( $manifest_filters ), 'Runtime filter cases drifted from the permanent manifest.' );

			$wrong                   = array();
			$suppress_doing_it_wrong = static fn(): bool => false;
			add_filter( 'doing_it_wrong_trigger_error', $suppress_doing_it_wrong );
			add_action(
				'doing_it_wrong_run',
				static function ( string $function_name, string $message, string $version ) use ( &$wrong ): void {
					$wrong[] = array( $function_name, $message, $version );
				},
				10,
				3
			);

			foreach ( $cases as $hook => $case ) {
				$seen    = array();
				$adapter = static function ( mixed ...$arguments ) use ( &$seen, $case ): mixed {
					$seen = $arguments;
					return $case['adapt']( $arguments );
				};
				add_filter( $hook, $adapter, PHP_INT_MAX, $manifest_filters[ $hook ] );
				$result = $case['invoke']();
				remove_filter( $hook, $adapter, PHP_INT_MAX );
				$expect( $case['arguments'] === $seen, $hook . ' changed argument count or order.' );
				$expect( $case['expected'] === $result, $hook . ' rejected valid adapter output.' );

				$invalid_adapter = static fn(): mixed => $case['invalid'];
				$before_count    = count( $wrong );
				add_filter( $hook, $invalid_adapter, PHP_INT_MAX, $manifest_filters[ $hook ] );
				$result = $case['invoke']();
				remove_filter( $hook, $invalid_adapter, PHP_INT_MAX );
				$expect( $case['fallback'] === $result, $hook . ' did not retain its fallback after invalid output.' );
				$messages = wp_json_encode( array_slice( $wrong, $before_count ) );
				$expect( is_string( $messages ) && str_contains( $messages, $hook ), $hook . ' did not raise a named development warning.' );
				$expect( ! str_contains( (string) $messages, 'COMPSEO_REJECTED_' ), $hook . ' echoed rejected adapter data.' );
			}
			remove_filter( 'doing_it_wrong_trigger_error', $suppress_doing_it_wrong );

			foreach ( array( 'index', 'noindex', 'inherit' ) as $index ) {
				$adapter = static function ( array $value ) use ( $index ): array {
					$value['index'] = $index;
					return $value;
				};
				add_filter( 'compseo_indexing_decision', $adapter, PHP_INT_MAX, 2 );
				$result = $contracts_class::indexing_decision( $decision, $context );
				remove_filter( 'compseo_indexing_decision', $adapter, PHP_INT_MAX );
				$expect( $index === $result['index'], 'Documented index tri-state value was rejected: ' . $index );
			}
			foreach ( array( 'follow', 'nofollow', 'inherit' ) as $follow ) {
				$adapter = static function ( array $value ) use ( $follow ): array {
					$value['follow'] = $follow;
					return $value;
				};
				add_filter( 'compseo_indexing_decision', $adapter, PHP_INT_MAX, 2 );
				$result = $contracts_class::indexing_decision( $decision, $context );
				remove_filter( 'compseo_indexing_decision', $adapter, PHP_INT_MAX );
				$expect( $follow === $result['follow'], 'Documented follow tri-state value was rejected: ' . $follow );
			}

			$decision_class = $seo_class( 'Decision' );
			foreach (
				array(
					'feed'    => 'core_owned_feed',
					'embed'   => 'core_owned_embed',
					'unknown' => 'unknown_route',
				) as $kind => $reason
			) {
				$reason_context         = $context;
				$reason_context['kind'] = $kind;
				$result                 = $decision_class::resolve( $reason_context );
				$expect( $reason === $result['reason'], 'Stable resolver reason was not exercised: ' . $reason );
			}

			$previous_public = get_option( 'blog_public' );
			update_option( 'blog_public', 0 );
			$result = $decision_class::resolve( $context );
			update_option( 'blog_public', $previous_public );
			$expect( 'site_private' === $result['reason'], 'Stable resolver reason was not exercised: site_private' );

			WP_CLI::success( 'Companion SEO permanent filter contracts pass.' );
			return;
		}

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
			foreach ( array( 'show_on_front', 'page_on_front', 'page_for_posts', 'blogdescription', 'permalink_structure', 'posts_per_page', 'blog_public', 'wp_attachment_pages_enabled', 'compseo_settings' ) as $option ) {
				$original[ $option ] = get_option( $option );
			}
			$original_author_description = get_user_meta( $author_id, 'description', true );

			$insert_post = static function ( array $data ) use ( $expect, $author_id ): int {
				$data['post_author'] = $author_id;
				$post_id             = wp_insert_post( $data, true );
				$expect( ! is_wp_error( $post_id ) && is_int( $post_id ) && $post_id > 0, 'Could not create a runtime content fixture.' );
				return $post_id;
			};

			$insert_image = static function ( string $source_name, string $alt ) use ( $expect, $author_id ): int {
				$source = dirname( __DIR__ ) . '/fixtures/media/' . $source_name;
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
			wp_update_term( $term_id, 'category', array( 'description' => 'Native category archive description.' ) );

			$tag = wp_insert_term( 'Companion tag', 'post_tag', array( 'slug' => 'compseo-runtime-tag' ) );
			$expect( ! is_wp_error( $tag ) && isset( $tag['term_id'] ), 'Could not create runtime tag.' );
			$tag_id = (int) $tag['term_id'];

			$genre = wp_insert_term( 'Companion genre', 'compseo_genre', array( 'slug' => 'compseo-runtime-genre' ) );
			$expect( ! is_wp_error( $genre ) && isset( $genre['term_id'] ), 'Could not create runtime genre.' );
			$genre_id = (int) $genre['term_id'];
			update_user_meta( $author_id, 'description', 'Native author archive biography.' );

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
			wp_set_post_terms( $public_id, array( $tag_id ), 'post_tag' );

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

			$paged_noindex_id = $insert_post(
				array(
					'post_type'    => 'post',
					'post_status'  => 'publish',
					'post_name'    => 'compseo-runtime-paged-noindex',
					'post_title'   => 'Paged noindex runtime story',
					'post_content' => '<!-- wp:paragraph --><p>First document page.</p><!-- /wp:paragraph --><!--nextpage--><!-- wp:paragraph --><p>Second document page.</p><!-- /wp:paragraph -->',
				)
			);
			update_post_meta( $paged_noindex_id, '_compseo_noindex', true );

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
			update_post_meta( $protected_authored_id, '_compseo_canonical', 'https://example.net/protected-reference' );
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
			wp_set_post_terms( $book_id, array( $genre_id ), 'compseo_genre' );

			$book_local_id = $insert_post(
				array(
					'post_type'   => 'compseo_book',
					'post_status' => 'publish',
					'post_name'   => 'compseo-sitemap-local',
					'post_title'  => 'Local canonical sitemap book',
				)
			);
			update_post_meta( $book_local_id, '_compseo_canonical', home_url( '/local-canonical-reference/' ) );

			$book_noindex_id = $insert_post(
				array(
					'post_type'   => 'compseo_book',
					'post_status' => 'publish',
					'post_name'   => 'compseo-sitemap-noindex',
					'post_title'  => 'Noindex sitemap book',
				)
			);
			update_post_meta( $book_noindex_id, '_compseo_noindex', true );

			$book_external_id = $insert_post(
				array(
					'post_type'   => 'compseo_book',
					'post_status' => 'publish',
					'post_name'   => 'compseo-sitemap-external',
					'post_title'  => 'External canonical sitemap book',
				)
			);
			update_post_meta( $book_external_id, '_compseo_canonical', 'https://canonical.example/external-book' );

			$book_protected_id = $insert_post(
				array(
					'post_type'     => 'compseo_book',
					'post_status'   => 'publish',
					'post_name'     => 'compseo-sitemap-protected',
					'post_title'    => 'Protected sitemap book',
					'post_password' => 'sitemap-secret',
				)
			);

			$book_scale_ids = array();
			for ( $index = 1; $index <= 10; ++$index ) {
				$book_scale_ids[] = $insert_post(
					array(
						'post_type'   => 'compseo_book',
						'post_status' => 'publish',
						'post_name'   => sprintf( 'compseo-sitemap-scale-%02d', $index ),
						'post_title'  => sprintf( 'Sitemap scale book %02d', $index ),
					)
				);
			}

			update_option( 'permalink_structure', '/%postname%/' );
			update_option( 'posts_per_page', 1 );
			update_option( 'blogdescription', 'Public site tagline' );
			update_option( 'show_on_front', 'posts' );
			update_option( 'blog_public', 1 );
			update_option( 'wp_attachment_pages_enabled', 1 );
			update_option(
				'compseo_settings',
				array(
					'schema_version' => 2,
					'social'         => array(
						'default_image_id' => $default_id,
						'profiles'         => array(),
						'x_handle'         => '',
					),
					'entity'         => array(
						'type' => 'organization',
						'name' => 'Runtime Studio',
						'url'  => home_url( '/' ),
					),
					'verification'   => array(
						'google' => 'runtime-google-token',
						'bing'   => 'runtime-bing-token',
					),
					'indexing'       => array(
						'blog'       => 'index',
						'post_types' => array( 'compseo_book' => 'noindex' ),
						'taxonomies' => array(
							'category'      => 'noindex',
							'post_tag'      => 'index',
							'compseo_genre' => 'noindex',
						),
						'author'     => 'noindex',
						'date'       => 'noindex',
						'filtered'   => 'noindex',
					),
				)
			);
			flush_rewrite_rules();

			update_option(
				$state_key,
				array(
					'original'                    => $original,
					'term_ids'                    => array(
						'category' => $term_id,
						'tag'      => $tag_id,
						'genre'    => $genre_id,
					),
					'author_id'                   => $author_id,
					'original_author_description' => $original_author_description,
					'ids'                         => array(
						'public'             => $public_id,
						'no_image'           => $no_image_id,
						'authored'           => $authored_id,
						'paged_noindex'      => $paged_noindex_id,
						'protected'          => $protected_id,
						'protected_authored' => $protected_authored_id,
						'front'              => $front_id,
						'posts_page'         => $posts_page_id,
						'book'               => $book_id,
						'book_local'         => $book_local_id,
						'book_noindex'       => $book_noindex_id,
						'book_external'      => $book_external_id,
						'book_protected'     => $book_protected_id,
						'book_scale'         => $book_scale_ids,
						'featured'           => $featured_id,
						'default'            => $default_id,
					),
				)
			);

			WP_CLI::success( 'Companion SEO runtime content created.' );
			return;
		}

		if ( 'assert-hardening' === $command || str_starts_with( $command, 'assert-cleanup-error-' ) ) {
			require __DIR__ . '/test-seo-hardening.php';
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

		if ( 'assert-settings' === $command ) {
			$state          = $load_state();
			$before         = get_option( 'compseo_settings', array() );
			$admin_register = $find_class_callback( 'admin_init', '\\SEO\\Admin', 'register_setting' );
			$expect( is_callable( $admin_register ), 'SEO settings registration callback is missing.' );
			call_user_func( $admin_register );
			$registered = get_registered_settings();
			$expect( isset( $registered['compseo_settings']['sanitize_callback'] ), 'Schema-versioned SEO settings were not registered.' );
			$sanitize = $registered['compseo_settings']['sanitize_callback'];
			$expect( is_callable( $sanitize ), 'SEO settings sanitizer is not callable.' );
			register_taxonomy(
				'compseo_retired',
				array( 'post' ),
				array(
					'public' => true,
					'label'  => 'Retired fixture taxonomy',
				)
			);

			$valid = call_user_func(
				$sanitize,
				array(
					'schema_version' => 999,
					'entity'         => array(
						'type'    => 'organization',
						'name'    => 'Runtime Studio',
						'url'     => home_url( '/' ),
						'logo_id' => $state['ids']['default'],
					),
					'social'         => array(
						'default_image_id' => $state['ids']['default'],
						'profiles'         => "https://example.com/studio\nhttps://social.example/runtime",
						'x_handle'         => '@runtime_studio',
					),
					'verification'   => array(
						'google' => '<meta name="google-site-verification" content="google-token_123">',
						'bing'   => '<meta content="bing-token_456" name="msvalidate.01">',
					),
					'indexing'       => array(
						'blog'       => 'index',
						'post_types' => array( 'compseo_book' => 'noindex' ),
						'taxonomies' => array(
							'category'        => 'noindex',
							'post_tag'        => 'index',
							'compseo_genre'   => 'noindex',
							'compseo_retired' => 'noindex',
						),
						'author'     => 'noindex',
						'date'       => 'noindex',
						'filtered'   => 'noindex',
					),
				)
			);
			$expect( is_array( $valid ) && 2 === $valid['schema_version'], 'Settings schema version must be server-owned.' );
			$expect( 'google-token_123' === $valid['verification']['google'], 'Google verification tag was not reduced to its token.' );
			$expect( 'bing-token_456' === $valid['verification']['bing'], 'Bing verification tag was not reduced to its token.' );
			$expect( 'runtime_studio' === $valid['social']['x_handle'], 'X handle was not normalized.' );
			$expect( 2 === count( $valid['social']['profiles'] ), 'Social profile list was not normalized.' );
			$expect( 'noindex' === $valid['indexing']['post_types']['compseo_book'], 'Per-post-type archive policy was not retained.' );
			$expect( 'noindex' === $valid['indexing']['taxonomies']['category'], 'Category policy was not retained independently.' );
			$expect( 'index' === $valid['indexing']['taxonomies']['post_tag'], 'Tag policy was not retained independently.' );
			update_option( 'compseo_settings', $valid );

			$bare                           = $valid;
			$bare['verification']['google'] = 'bare-google_token';
			$bare['verification']['bing']   = 'bare-bing_token';
			$bare                           = call_user_func( $sanitize, $bare );
			$expect( 'bare-google_token' === $bare['verification']['google'], 'Bare Google verification token was not retained.' );
			$expect( 'bare-bing_token' === $bare['verification']['bing'], 'Bare Bing verification token was not retained.' );

			$secret_google                     = 'REJECTED_GOOGLE_SECRET';
			$secret_bing                       = 'REJECTED_BING_SECRET';
			$invalid                           = $valid;
			$invalid['verification']['google'] = '<meta name="unrelated" content="' . $secret_google . '">';
			$invalid['verification']['bing']   = '<meta name="msvalidate.01" content="safe"><meta name="extra" content="' . $secret_bing . '">';
			$after_invalid                     = call_user_func( $sanitize, $invalid );
			$expect( 'google-token_123' === $after_invalid['verification']['google'], 'Invalid Google verification input did not retain the previous token.' );
			$expect( 'bing-token_456' === $after_invalid['verification']['bing'], 'Invalid Bing verification input did not retain the previous token.' );

			$errors = wp_json_encode( get_settings_errors( 'compseo_settings' ) );
			$expect( is_string( $errors ) && false === strpos( $errors, $secret_google ) && false === strpos( $errors, $secret_bing ), 'Settings errors exposed rejected verification values.' );

			unregister_taxonomy( 'compseo_genre' );
			unregister_taxonomy( 'compseo_retired' );
			$unrelated = $valid;
			unset( $unrelated['indexing']['taxonomies']['compseo_genre'] );
			$unrelated['social']['x_handle'] = '@saved_during_plugin_pause';
			$preserved                       = call_user_func( $sanitize, $unrelated );
			$expect( 'noindex' === $preserved['indexing']['taxonomies']['compseo_genre'], 'A temporarily unregistered taxonomy policy was pruned on an unrelated save.' );
			$expect( 'noindex' === $preserved['indexing']['taxonomies']['compseo_retired'], 'An inert stale taxonomy policy was pruned on save.' );
			update_option( 'compseo_settings', $preserved );

			$administrator = get_users(
				array(
					'role'   => 'administrator',
					'number' => 1,
				)
			);
			wp_set_current_user( (int) $administrator[0]->ID );
			$admin_menu = $find_class_callback( 'admin_menu', '\\SEO\\Admin', 'register_page' );
			$expect( is_array( $admin_menu ) && isset( $admin_menu[0] ) && is_string( $admin_menu[0] ), 'SEO settings page callback is missing.' );
			$render = array( $admin_menu[0], 'render' );
			$expect( is_callable( $render ), 'SEO settings page renderer is not callable.' );
			ob_start();
			call_user_func( $render );
			$page = (string) ob_get_clean();
			$expect( false !== strpos( $page, 'name="compseo_settings[entity][type]"' ), 'Entity controls do not use the nested settings schema.' );
			$expect( false !== strpos( $page, 'name="compseo_settings[social][default_image_id]"' ), 'Social-image control does not use the nested settings schema.' );
			$expect( false !== strpos( $page, 'name="compseo_settings[verification][google]"' ), 'Verification controls do not use the nested settings schema.' );
			$expect( false !== strpos( $page, 'name="compseo_settings[indexing][taxonomies][category]"' ), 'Category archive policy control is missing.' );
			$expect( false !== strpos( $page, 'name="compseo_settings[indexing][taxonomies][post_tag]"' ), 'Tag archive policy control is missing.' );
			$expect( false !== strpos( $page, 'Effective indexing policy' ), 'Effective policy table is missing its visible caption.' );
			$expect( false !== strpos( $page, '<th scope="row">' ), 'Effective policy rows are missing row headers.' );
			$expect( false !== strpos( $page, '<code>compseo_genre</code>' ) && false !== strpos( $page, 'Not currently registered' ), 'Temporarily unregistered taxonomy policy is not visible as stale.' );
			$expect( false !== strpos( $page, '<code>search</code>' ) && false !== strpos( $page, '<code>not_found</code>' ), 'Fixed noindex routes are missing from the effective policy table.' );

			register_taxonomy(
				'compseo_genre',
				array( 'compseo_book' ),
				array(
					'public'       => true,
					'rewrite'      => array( 'slug' => 'runtime-genre' ),
					'show_in_rest' => true,
					'label'        => 'Runtime genres',
				)
			);
			$policy_class = $seo_class( 'Policy' );
			$expect( 'noindex' === $policy_class::value( 'taxonomy', 'compseo_genre' ), 'A returning taxonomy did not recover its saved policy.' );
			remove_filter( 'sanitize_option_compseo_settings', $sanitize );
			update_option( 'compseo_settings', $before );

			WP_CLI::success( 'Companion SEO settings schema and sanitization pass.' );
			return;
		}

		if ( 'assert-editor' === $command ) {
			if ( ! function_exists( 'set_current_screen' ) ) {
				require_once ABSPATH . 'wp-admin/includes/screen.php';
			}
			set_current_screen( 'post' );
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Intentionally exercising core's editor asset lifecycle.
			do_action( 'enqueue_block_editor_assets' );

			$editor_script = null;
			foreach ( wp_scripts()->registered as $script ) {
				if ( isset( $script->src ) && is_string( $script->src ) && str_ends_with( $script->src, '/build/index.js' ) ) {
					$editor_script = $script;
					break;
				}
			}

			$expect( null !== $editor_script, 'The SEO editor script was not enqueued for posts.' );
			foreach ( array( 'wp-block-editor', 'wp-components', 'wp-data', 'wp-editor', 'wp-plugins' ) as $dependency ) {
				$expect( in_array( $dependency, $editor_script->deps, true ), 'Editor asset dependency is missing: ' . $dependency );
			}
			$editor_build = file_get_contents( $seo_plugin_dir() . '/build/index.js' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read-only assertion against the mounted plugin build.
			$expect( is_string( $editor_build ) && false !== strpos( $editor_build, 'native WordPress sitemap' ), 'Noindex consequence copy does not disclose native sitemap exclusion.' );

			WP_CLI::success( 'Companion SEO editor asset registration passes.' );
			return;
		}

		if ( 'assert-sitemaps' === $command ) {
			$state     = $load_state();
			$providers = wp_get_sitemap_providers();
			$expect( isset( $providers['posts'] ) && $providers['posts'] instanceof WP_Sitemaps_Posts, 'Native posts sitemap provider is missing.' );
			$expect( isset( $providers['taxonomies'] ) && $providers['taxonomies'] instanceof WP_Sitemaps_Taxonomies, 'Native taxonomy sitemap provider is missing.' );
			$expect( ! isset( $providers['users'] ), 'Users sitemap provider must be removed while author archives are noindex.' );

			$taxonomies = $providers['taxonomies']->get_object_subtypes();
			$expect( isset( $taxonomies['post_tag'] ), 'Indexable tag taxonomy is missing from native sitemaps.' );
			$expect( ! isset( $taxonomies['category'] ), 'Noindex category taxonomy remained in native sitemaps.' );
			$expect( ! isset( $taxonomies['compseo_genre'] ), 'Noindex custom taxonomy remained in native sitemaps.' );

			update_option( 'compseo_runtime_sitemap_page_size', 1 );
			$providers['posts']->get_url_list( 1, 'compseo_book' );
			update_option( 'compseo_runtime_sitemap_page_size', 10 );
			$providers['posts']->get_url_list( 1, 'compseo_book' );

			$meta_reads = 0;
			$meta_probe = static function ( mixed $value, int $object_id, string $meta_key ) use ( &$meta_reads ): mixed {
				unset( $object_id );
				if ( in_array( $meta_key, array( '_compseo_noindex', '_compseo_canonical' ), true ) ) {
					++$meta_reads;
				}
				return $value;
			};
			add_filter( 'get_post_metadata', $meta_probe, 10, 3 );

			global $wpdb;
			update_option( 'compseo_runtime_sitemap_page_size', 1 );
			$before_queries = (int) $wpdb->num_queries;
			$small_page     = $providers['posts']->get_url_list( 1, 'compseo_book' );
			$small_queries  = (int) $wpdb->num_queries - $before_queries;

			update_option( 'compseo_runtime_sitemap_page_size', 10 );
			$before_queries = (int) $wpdb->num_queries;
			$large_page     = $providers['posts']->get_url_list( 1, 'compseo_book' );
			$large_queries  = (int) $wpdb->num_queries - $before_queries;
			$page_two       = $providers['posts']->get_url_list( 2, 'compseo_book' );
			remove_filter( 'get_post_metadata', $meta_probe, 10 );

			$locations = array_merge( wp_list_pluck( $large_page, 'loc' ), wp_list_pluck( $page_two, 'loc' ) );
			$expected  = array(
				get_permalink( (int) $state['ids']['book'] ),
				get_permalink( (int) $state['ids']['book_local'] ),
			);
			foreach ( $state['ids']['book_scale'] as $post_id ) {
				$expected[] = get_permalink( (int) $post_id );
			}
			sort( $locations );
			sort( $expected );

			$expect( 2 === $providers['posts']->get_max_num_pages( 'compseo_book' ), 'Filtered post sitemap did not retain correct pagination.' );
			$expect( 1 === count( $small_page ) && 10 === count( $large_page ) && 2 === count( $page_two ), 'Sitemap page sizes did not expose the intended scaling fixture.' );
			$expect( $expected === $locations, 'Native post sitemap did not keep exactly the twelve eligible fixtures.' );
			$expect( 0 === $meta_reads, 'Sitemap generation performed per-entry companion metadata reads.' );
			$expect( $small_queries <= 4 && $large_queries <= 4, 'Sitemap query count exceeded the fixed provider-query budget.' );
			$expect( $large_queries <= $small_queries + 1, 'Sitemap query count grew with the number of returned entries.' );

			$existing_query = array(
				array(
					'key'   => '_fixture_existing_sitemap_rule',
					'value' => 'yes',
				),
			);
			$existing_args  = array();
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- Fixture input verifies safe composition with an existing sitemap constraint.
			$existing_args['meta_query'] = $existing_query;
			$sitemaps_class              = $seo_class( 'Sitemaps' );
			$filtered_args               = $sitemaps_class::posts_query_args( $existing_args, 'post' );
			$expect( false === $filtered_args['has_password'], 'Password exclusion must use the posts-table query condition.' );
			$expect( 'AND' === $filtered_args['meta_query']['relation'] && $existing_query === $filtered_args['meta_query'][0], 'Existing sitemap metadata constraints were not composed safely.' );

			WP_CLI::success( 'Companion SEO native sitemap integration passes.' );
			return;
		}

		if ( 'set-author-index' === $command || 'set-author-noindex' === $command ) {
			$settings = get_option( 'compseo_settings', array() );
			$expect( is_array( $settings ), 'Companion SEO settings fixture is malformed.' );
			$settings['indexing']           = isset( $settings['indexing'] ) && is_array( $settings['indexing'] ) ? $settings['indexing'] : array();
			$settings['indexing']['author'] = 'set-author-index' === $command ? 'index' : 'noindex';
			update_option( 'compseo_settings', $settings );
			WP_CLI::success( 'Companion SEO author sitemap policy updated.' );
			return;
		}

		if ( 'assert-author-sitemap' === $command ) {
			$providers = wp_get_sitemap_providers();
			$expect( isset( $providers['users'] ) && $providers['users'] instanceof WP_Sitemaps_Users, 'Users sitemap provider is missing while author archives are indexable.' );
			WP_CLI::success( 'Companion SEO author sitemap provider passes.' );
			return;
		}

		if ( 'assert-suppressed' === $command ) {
			$registered = get_registered_meta_keys( 'post', 'post' );
			$expect( ! isset( $registered['_compseo_title'] ), 'Suppressed runtime must not register REST metadata.' );
			$expect( null === $find_class_callback( 'enqueue_block_editor_assets', '\\SEO\\Editor', 'enqueue_assets' ), 'Suppressed runtime must not register editor assets.' );
			$expect( null === $find_class_callback( 'wp_sitemaps_posts_query_args', '\\SEO\\Sitemaps', 'posts_query_args' ), 'Suppressed runtime must not filter post sitemaps.' );
			$expect( null === $find_class_callback( 'wp_sitemaps_taxonomies', '\\SEO\\Sitemaps', 'taxonomies' ), 'Suppressed runtime must not filter taxonomy sitemaps.' );
			$expect( null === $find_class_callback( 'wp_sitemaps_add_provider', '\\SEO\\Sitemaps', 'provider' ), 'Suppressed runtime must not filter sitemap providers.' );
			$expect( null !== $find_class_callback( 'admin_menu', '\\SEO\\Admin', 'register_page' ), 'Suppression must not hide management registration.' );
			$providers = wp_get_sitemap_providers();
			$expect( isset( $providers['users'] ), 'Suppression did not return the users sitemap to WordPress core.' );
			$taxonomies = isset( $providers['taxonomies'] ) && $providers['taxonomies'] instanceof WP_Sitemaps_Taxonomies ? $providers['taxonomies']->get_object_subtypes() : array();
			$expect( isset( $taxonomies['category'], $taxonomies['compseo_genre'] ), 'Suppression did not return taxonomy sitemaps to WordPress core.' );
			$admin_register = $find_class_callback( 'admin_init', '\\SEO\\Admin', 'register_setting' );
			$expect( is_callable( $admin_register ), 'Suppressed settings registration callback is missing.' );
			call_user_func( $admin_register );
			$registered_settings = get_registered_settings();
			$expect( isset( $registered_settings['compseo_settings'] ), 'Suppression must retain schema-backed settings registration.' );
			$settings_class = $seo_class( 'Settings' );
			$before         = $settings_class::all();
			$sanitize       = $registered_settings['compseo_settings']['sanitize_callback'];
			$after          = call_user_func( $sanitize, array( 'verification' => array( 'google' => 'changed' ) ) );
			$expect( $before === $after, 'Suppressed settings must remain read-only.' );
			WP_CLI::success( 'Companion SEO registrar is suppressed while management remains available.' );
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

			$contracts_class = $seo_class( 'Contracts' );
			$query_vars      = $contracts_class::indexable_query_vars( array() );
			$expect( array() === $query_vars, 'Invalid indexable-query output did not retain the internal fallback.' );

			ob_start();
			// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Intentionally exercising core's wp_head lifecycle.
			do_action( 'wp_head' );
			$output = (string) ob_get_clean();
			wp_reset_postdata();

			$messages = wp_json_encode( $wrong );
			$expect( false !== strpos( $output, 'Första meningen med café. Second sentence stays public.' ), 'Invalid document filter did not retain the internal fallback.' );
			$expect( false === strpos( $output, 'COMPSEO_REJECTED_VALUE' ), 'Rejected filter values must never be emitted.' );
			$expect( is_string( $messages ) && false !== strpos( $messages, 'compseo_document' ), 'Invalid filter output must trigger a named development warning.' );
			$expect( false !== strpos( (string) $messages, 'compseo_indexing_decision' ), 'Invalid indexing-decision output must trigger a named development warning.' );
			$expect( false !== strpos( (string) $messages, 'compseo_indexable_query_vars' ), 'Invalid indexable-query output must trigger a named development warning.' );
			$expect( false === strpos( (string) $messages, 'COMPSEO_REJECTED_VALUE' ), 'Development warnings must not echo rejected values.' );
			$expect( false === strpos( (string) $messages, 'COMPSEO_REJECTED_INDEX_SECRET' ), 'Indexing warnings must not echo rejected values.' );
			$expect( false === strpos( (string) $messages, 'COMPSEO_REJECTED_QUERY_SECRET' ), 'Query-variable warnings must not echo rejected values.' );

			WP_CLI::success( 'Companion SEO invalid-filter fallback passes.' );
			return;
		}

		if ( 'cleanup' === $command ) {
			$state = get_option( $state_key, array() );
			if ( is_array( $state ) && isset( $state['ids'] ) && is_array( $state['ids'] ) ) {
				foreach ( $state['ids'] as $post_id ) {
					$post_ids = is_array( $post_id ) ? $post_id : array( $post_id );
					foreach ( $post_ids as $candidate ) {
						if ( is_numeric( $candidate ) ) {
							wp_delete_post( (int) $candidate, true );
						}
					}
				}
				if ( isset( $state['term_ids'] ) && is_array( $state['term_ids'] ) ) {
					wp_delete_term( (int) ( $state['term_ids']['category'] ?? 0 ), 'category' );
					wp_delete_term( (int) ( $state['term_ids']['tag'] ?? 0 ), 'post_tag' );
					wp_delete_term( (int) ( $state['term_ids']['genre'] ?? 0 ), 'compseo_genre' );
				}
				if ( isset( $state['author_id'], $state['original_author_description'] ) ) {
					update_user_meta( (int) $state['author_id'], 'description', $state['original_author_description'] );
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
			delete_option( 'compseo_runtime_invalid_indexing_contract' );
			delete_option( 'compseo_runtime_invalid_query_contract' );
			delete_option( 'compseo_runtime_indexable_lang' );
			delete_option( 'compseo_runtime_force_index' );
			delete_option( 'compseo_runtime_force_noindex' );
			delete_option( 'compseo_runtime_force_cross_noindex' );
			delete_option( 'compseo_runtime_sitemap_page_size' );
			flush_rewrite_rules();
			WP_CLI::success( 'Companion SEO runtime fixtures removed.' );
			return;
		}

		WP_CLI::error( 'Unknown companion SEO runtime command.' );
	}
);
