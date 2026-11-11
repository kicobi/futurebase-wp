<?php
/**
 * Focused release regressions, included by test-seo-runtime.php in wp-env.
 *
 * @package bin
 */

call_user_func(
	static function () use ( $seo_class, $command, $load_state ) {
		$check               = static function ( bool $condition, string $message ): void {
			if ( ! $condition ) {
				throw new RuntimeException( esc_html( $message ) );
			}
		};
			$context_class   = $seo_class( 'Context' );
			$decision_class  = $seo_class( 'Decision' );
			$canonical_class = $seo_class( 'Canonical' );
			$cli_class       = $seo_class( 'CLI' );
			$url_class       = $seo_class( 'Url' );

		if ( str_starts_with( $command, 'assert-cleanup-error-' ) ) {
			global $wpdb;
			$wpdb->suppress_errors( true );
			$fail_at = 'assert-cleanup-error-initial' === $command ? 1 : 15;
			$count   = 0;
			add_filter(
				'query',
				static function ( $sql ) use ( &$count, $fail_at ) {
					if ( str_starts_with( $sql, 'SELECT COUNT(' ) && str_contains( $sql, 'compseo_' ) ) {
						++$count;
						// Empty counts avoid mutating any data in this failure-path fixture.
						return $count === $fail_at ? 'SELECT missing_column FROM missing_cleanup_fixture' : 'SELECT 0';
					}
						return $sql;
				}
			);
				( new $cli_class() )->purge(
					array(),
					array(
						'yes'    => true,
						'format' => 'json',
					)
				);
				throw new RuntimeException( 'Cleanup incorrectly reported success after a failed read.' );
		}

			$state = $load_state();
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local test fixture, never a remote URL.
		$cases = json_decode( file_get_contents( __DIR__ . '/fixtures/seo-canonical-urls.json' ), true, 512, JSON_THROW_ON_ERROR );
		foreach ( $cases as $case ) {
			$accepted = '' === trim( $case['value'] ) || '' !== $url_class::canonical( $case['value'] );
			$check( $case['valid'] === $accepted, 'PHP/editor URL acceptance differs for a shared fixture.' );
		}

			// Replay actual WP routing, using the same isolated path as the CLI inspector.
			$replay             = new ReflectionMethod( $cli_class, 'with_request' );
			$original_permalink = get_option( 'permalink_structure' );
			$original_page_size = get_option( 'posts_per_page' );
		$original_front         = array();
		foreach ( array( 'show_on_front', 'page_on_front', 'page_for_posts' ) as $option ) {
			$original_front[ $option ] = get_option( $option );
		}
		try {
			update_option( 'posts_per_page', 1 );
			update_option( 'show_on_front', 'page' );
			update_option( 'page_on_front', $state['ids']['front'] );
			update_option( 'page_for_posts', $state['ids']['posts_page'] );
			foreach ( array( '', '/%postname%/' ) as $permalink ) {
				update_option( 'permalink_structure', $permalink );
				$GLOBALS['wp_rewrite']->init();
				flush_rewrite_rules( false );
				$routes = array(
					get_category_link( $state['term_ids']['category'] ),
					get_tag_link( $state['term_ids']['tag'] ),
					get_term_link( $state['term_ids']['genre'], 'compseo_genre' ),
					get_post_type_archive_link( 'compseo_book' ),
					get_author_posts_url( $state['author_id'] ),
					get_permalink( $state['ids']['posts_page'] ),
				);
				foreach ( $routes as $route ) {
					$check( is_string( $route ), 'Could not construct a native archive route.' );
					$result = $replay->invoke(
						null,
						$route,
						static function () use ( $context_class, $decision_class ) {
							$context = $context_class::current();
							return array(
								'context'  => $context,
								'decision' => $decision_class::resolve( $context ),
							);
						}
					);
					$check( in_array( $result['context']['kind'], array( 'archive', 'home' ), true ), 'Native route was not an archive or posts page: ' . $route . ' ' . wp_json_encode( $result ) );
					$check( 'filtered_query' !== $result['decision']['reason'], 'Native routing keys were mistaken for filters: ' . $route . ' ' . wp_json_encode( $result ) );
					$check( $route === $result['decision']['canonical'], 'Native archive canonical lost its route.' );
				}
				$blog      = get_permalink( $state['ids']['posts_page'] );
				$paged     = '' === $permalink ? add_query_arg( 'paged', 2, $blog ) : trailingslashit( $blog ) . 'page/2/';
				$target    = $paged . ( str_contains( $paged, '?' ) ? '&' : '?' ) . 'FilterX=one&filterx=two&Filter.Color=red&Filter_Color=blue&UTM_Source=test';
				$result    = $replay->invoke(
					null,
					$target,
					static function () use ( $context_class, $decision_class ) {
						$context = $context_class::current();
						return array(
							'context'  => $context,
							'decision' => $decision_class::resolve( $context ),
						);
					}
				);
				$canonical = $result['decision']['canonical'];
				$check( 2 === $result['context']['paged'], 'Archive pagination was not recognized.' );
				foreach ( array( 'FilterX=one', 'filterx=two', 'Filter.Color=red', 'Filter_Color=blue' ) as $parameter ) {
					$check( str_contains( $canonical, $parameter ), 'Canonical changed a query-key identity.' );
				}
				$check( ! str_contains( strtolower( $canonical ), 'utm_' ), 'Tracking query survived normalization.' );
				$check( str_contains( $canonical, '' === $permalink ? 'paged=2' : '/page/2/' ), 'Canonical lost pagination.' );
			}

			update_option( 'permalink_structure', '' );
			$GLOBALS['wp_rewrite']->init();
			$replay->invoke(
				null,
				get_permalink( $state['ids']['public'] ),
				static function () use ( $state, $context_class, $canonical_class, $seo_class, $check ) {
					$document = $seo_class( 'Document' );
					$document::prepare();
					$other = $state['ids']['no_image'];
					$check( get_permalink( $other ) === wp_get_canonical_url( $other ), 'Unrelated-post canonical returned the prepared document URL.' );
					$context  = $context_class::current();
					$decision = array(
						'index'     => 'noindex',
						'canonical' => get_permalink( $other ),
					);
					$check( get_permalink( $state['ids']['public'] ) === $canonical_class::cohere( $decision['canonical'], $decision, $context ), 'Plain-permalink cross-document canonical passed noindex coherence.' );
					return array();
				}
			);
		} finally {
			update_option( 'permalink_structure', $original_permalink );
			update_option( 'posts_per_page', $original_page_size );
			foreach ( $original_front as $option => $value ) {
				update_option( $option, $value );
			}
			$GLOBALS['wp_rewrite']->init();
			flush_rewrite_rules( false );
		}

			// Exercise the core REST controller, not just the metadata auth callback.
			$original_user = get_current_user_id();
			$users         = array();
			$posts         = array();
		try {
			foreach ( array( 'subscriber', 'author', 'editor', 'administrator' ) as $role ) {
				$id = wp_insert_user(
					array(
						'user_login' => 'seo-' . $role . '-' . wp_generate_uuid4(),
						'user_pass'  => wp_generate_password(),
						'role'       => $role,
					)
				);
				$check( ! is_wp_error( $id ), 'Could not create REST role fixture.' );
				$users[] = $id;
				$own     = wp_insert_post(
					array(
						'post_type'   => 'post',
						'post_title'  => 'REST permissions fixture',
						'post_status' => 'publish',
						'post_author' => $id,
					)
				);
				$posts[] = $own;
				wp_set_current_user( $id );
				foreach ( array( $own, $state['ids']['public'] ) as $post_id ) {
					$request = new WP_REST_Request( 'POST', '/wp/v2/posts/' . $post_id );
					$request->set_body_params( array( 'meta' => array( '_compseo_title' => 'Role fixture title' ) ) );
					$response = rest_do_request( $request );
					$allowed  = 'subscriber' !== $role && ( 'author' !== $role || $own === $post_id );
					$check( ( 200 === $response->get_status() ) === $allowed, 'REST metadata permission mismatch for ' . $role );
				}
			}
		} finally {
			wp_set_current_user( $original_user );
			delete_post_meta( $state['ids']['public'], '_compseo_title' );
			foreach ( $posts as $post_id ) {
				wp_delete_post( $post_id, true );
			}
			require_once ABSPATH . 'wp-admin/includes/user.php';
			foreach ( $users as $id ) {
				wp_delete_user( $id );
			}
		}
			WP_CLI::success( 'SEO hardening regressions pass: routing, pagination, raw keys, URL acceptance, unrelated canonicals and REST roles.' );
	}
);
