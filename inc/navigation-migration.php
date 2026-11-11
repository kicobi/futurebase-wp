<?php
/**
 * Versioned navigation-region migration and recovery.
 *
 * @package futurebase
 */

if ( ! defined( 'FUTUREBASE_NAVIGATION_MIGRATION_VERSION' ) ) {
	define( 'FUTUREBASE_NAVIGATION_MIGRATION_VERSION', 2 );
}

if ( ! function_exists( 'futurebase_navigation_seed_definition' ) ) {
	/**
	 * Return the starter navigation-region definition.
	 *
	 * @param string $region Region slug.
	 * @return array{title: string, links: array<int, array{0: string, 1: string}>}
	 */
	function futurebase_navigation_seed_definition( $region ) {
		$regions = array(
			'primary-navigation' => array(
				'title' => __( 'Primary navigation', 'futurebase' ),
				'links' => array(
					array( __( 'About', 'futurebase' ), '/about/' ),
					array( __( 'Services', 'futurebase' ), '/services/' ),
					array( __( 'Blog', 'futurebase' ), '/blog/' ),
				),
			),
			'footer-navigation'  => array(
				'title' => __( 'Footer navigation', 'futurebase' ),
				'links' => array(
					array( __( 'About', 'futurebase' ), '/about/' ),
					array( __( 'Blog', 'futurebase' ), '/blog/' ),
				),
			),
		);

		return $regions[ $region ];
	}
}

if ( ! function_exists( 'futurebase_navigation_seed_content' ) ) {
	/**
	 * Build the canonical starter links for a region.
	 *
	 * @param string $region Region slug.
	 * @return string
	 */
	function futurebase_navigation_seed_content( $region ) {
		$definition = futurebase_navigation_seed_definition( $region );
		$content    = '';

		foreach ( $definition['links'] as $link ) {
			$content .= get_comment_delimited_block_content(
				'core/navigation-link',
				array(
					'label' => $link[0],
					'url'   => home_url( $link[1] ),
				),
				''
			) . "\n";
		}

		return trim( $content );
	}
}

if ( ! function_exists( 'futurebase_navigation_region_post' ) ) {
	/**
	 * Resolve a published navigation-region post.
	 *
	 * @param string $slug Region slug.
	 * @return WP_Post|null
	 */
	function futurebase_navigation_region_post( $slug ) {
		$post = get_page_by_path( $slug, OBJECT, 'wp_navigation' );
		if ( ! $post instanceof WP_Post || 'publish' !== $post->post_status ) {
			return null;
		}

		return $post;
	}
}

if ( ! function_exists( 'futurebase_navigation_legacy_posts' ) ) {
	/**
	 * Find published non-region navigation posts in core fallback order.
	 *
	 * Core resolves the newest published wp_navigation post, so preserving this
	 * order adopts the same menu a site was already rendering before regions
	 * were introduced.
	 *
	 * @param WP_Post|null $older_than Optional post that candidates must predate.
	 * @return array<int, WP_Post>
	 */
	function futurebase_navigation_legacy_posts( $older_than = null ) {
		$posts = get_posts(
			array(
				'post_type'              => 'wp_navigation',
				'post_status'            => 'publish',
				'posts_per_page'         => -1,
				'orderby'                => 'date',
				'order'                  => 'DESC',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			)
		);

		return array_values(
			array_filter(
				$posts,
				static function ( $post ) use ( $older_than ) {
					if ( in_array( $post->post_name, array( 'primary-navigation', 'footer-navigation' ), true ) ) {
						return false;
					}
					return ! $older_than instanceof WP_Post || $post->post_date < $older_than->post_date;
				}
			)
		);
	}
}

if ( ! function_exists( 'futurebase_navigation_primary_title' ) ) {
	/**
	 * Preserve a client title unless it is unsuitable as the landmark label.
	 *
	 * The core fallback title is translated, but its `navigation` slug is
	 * stable across locales. Comparing the slug keeps this migration
	 * locale-independent.
	 *
	 * @param WP_Post      $post   Navigation post being adopted.
	 * @param WP_Post|null $footer Existing footer navigation.
	 * @return string
	 */
	function futurebase_navigation_primary_title( $post, $footer ) {
		$title        = trim( $post->post_title );
		$footer_title = $footer instanceof WP_Post ? trim( $footer->post_title ) : '';

		if ( '' === $title || 'navigation' === $post->post_name || ( '' !== $footer_title && 0 === strcasecmp( $title, $footer_title ) ) ) {
			return __( 'Primary navigation', 'futurebase' );
		}

		return $title;
	}
}

if ( ! function_exists( 'futurebase_navigation_insert_region' ) ) {
	/**
	 * Insert a starter-owned navigation region.
	 *
	 * @param string $region Region slug.
	 * @return int|WP_Error
	 */
	function futurebase_navigation_insert_region( $region ) {
		$definition = futurebase_navigation_seed_definition( $region );

		return wp_insert_post(
			array(
				'post_type'    => 'wp_navigation',
				'post_status'  => 'publish',
				'post_title'   => wp_slash( $definition['title'] ),
				'post_name'    => $region,
				'post_content' => wp_slash( futurebase_navigation_seed_content( $region ) ),
			),
			true
		);
	}
}

if ( ! function_exists( 'futurebase_navigation_collect_references' ) ) {
	/**
	 * Recursively collect numeric core/navigation ref attributes.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @param array<int, bool>                 $references Reference set.
	 * @return void
	 */
	function futurebase_navigation_collect_references( $blocks, &$references ) {
		foreach ( $blocks as $block ) {
			if ( 'core/navigation' === ( $block['blockName'] ?? null ) ) {
				$ref = $block['attrs']['ref'] ?? null;
				if ( is_int( $ref ) || ( is_string( $ref ) && ctype_digit( $ref ) ) ) {
					$references[ (int) $ref ] = true;
				}
			}

			if ( ! empty( $block['innerBlocks'] ) && is_array( $block['innerBlocks'] ) ) {
				futurebase_navigation_collect_references( $block['innerBlocks'], $references );
			}
		}
	}
}

if ( ! function_exists( 'futurebase_navigation_references' ) ) {
	/**
	 * Find stored numeric navigation references in database-backed content.
	 *
	 * File-based theme templates are deliberately excluded: their patterns
	 * resolve region posts by slug at render time and therefore store no
	 * numeric ID. The scan covers customized templates and template parts,
	 * reusable blocks/patterns, and non-trash editor-supporting post types,
	 * including draft, scheduled, and custom statuses. Historical revisions are
	 * excluded because they do not render as current content.
	 *
	 * @param array<int, int> $candidate_ids Navigation IDs relevant to repair.
	 * @return array<int, bool>
	 */
	function futurebase_navigation_references( $candidate_ids ) {
		$references = array();
		$special    = array( 'wp_template', 'wp_template_part', 'wp_block' );
		$post_types = $special;

		foreach ( get_post_types( array(), 'names' ) as $post_type ) {
			if ( post_type_supports( $post_type, 'editor' ) && ! in_array( $post_type, $post_types, true ) && ! in_array( $post_type, array( 'wp_navigation', 'revision' ), true ) ) {
				$post_types[] = $post_type;
			}
		}

		foreach ( $post_types as $post_type ) {
			$statuses = array_values( array_diff( get_post_stati(), array( 'trash', 'auto-draft' ) ) );
			$query    = new WP_Query(
				array(
					'post_type'              => $post_type,
					'post_status'            => $statuses,
					'posts_per_page'         => -1,
					'fields'                 => 'ids',
					'no_found_rows'          => true,
					'update_post_meta_cache' => false,
					'update_post_term_cache' => false,
				)
			);

			foreach ( $query->posts as $post_id ) {
				futurebase_navigation_collect_references( parse_blocks( (string) get_post_field( 'post_content', $post_id ) ), $references );
			}
		}

		$candidates = array_fill_keys( array_map( 'intval', $candidate_ids ), true );
		return array_intersect_key( $references, $candidates );
	}
}

if ( ! function_exists( 'futurebase_navigation_matches_seed' ) ) {
	/**
	 * Check whether a post still contains the canonical untouched primary seed.
	 *
	 * @param WP_Post $post Navigation post.
	 * @return bool
	 */
	function futurebase_navigation_matches_seed( $post ) {
		return serialize_blocks( parse_blocks( $post->post_content ) )
			=== serialize_blocks( parse_blocks( futurebase_navigation_seed_content( 'primary-navigation' ) ) );
	}
}

if ( ! function_exists( 'futurebase_navigation_snapshot' ) ) {
	/**
	 * Snapshot fields changed by the repair routine.
	 *
	 * @param WP_Post $post Navigation post.
	 * @return array{ID: int, post_status: string, post_title: string, post_name: string, post_content: string, migration_meta_exists: bool, migration_meta: mixed}
	 */
	function futurebase_navigation_snapshot( $post ) {
		$meta_key = '_futurebase_navigation_migration';

		return array(
			'ID'                    => $post->ID,
			'post_status'           => $post->post_status,
			'post_title'            => $post->post_title,
			'post_name'             => $post->post_name,
			'post_content'          => $post->post_content,
			'migration_meta_exists' => metadata_exists( 'post', $post->ID, $meta_key ),
			'migration_meta'        => get_post_meta( $post->ID, $meta_key, true ),
		);
	}
}

if ( ! function_exists( 'futurebase_navigation_restore' ) ) {
	/**
	 * Best-effort restore of a navigation post after a multi-step failure.
	 *
	 * @param array{ID: int, post_status: string, post_title: string, post_name: string, post_content: string, migration_meta_exists: bool, migration_meta: mixed} $snapshot Post snapshot.
	 * @return void
	 */
	function futurebase_navigation_restore( $snapshot ) {
		$post = array_intersect_key(
			$snapshot,
			array_flip( array( 'ID', 'post_status', 'post_title', 'post_name', 'post_content' ) )
		);
		wp_update_post( wp_slash( $post ), true );

		if ( $snapshot['migration_meta_exists'] ) {
			update_post_meta( $snapshot['ID'], '_futurebase_navigation_migration', $snapshot['migration_meta'] );
		} else {
			delete_post_meta( $snapshot['ID'], '_futurebase_navigation_migration' );
		}
	}
}

if ( ! function_exists( 'futurebase_navigation_retire' ) ) {
	/**
	 * Retain an unused navigation post as a recoverable draft.
	 *
	 * @param WP_Post $post        Navigation post.
	 * @param int     $survivor_id ID preserved by the migration.
	 * @return int|WP_Error
	 */
	function futurebase_navigation_retire( $post, $survivor_id ) {
		$result = wp_update_post(
			array(
				'ID'          => $post->ID,
				'post_status' => 'draft',
				'post_name'   => 'retired-navigation-' . $post->ID,
			),
			true
		);

		if ( ! is_wp_error( $result ) ) {
			$metadata_value = array(
				'version'     => FUTUREBASE_NAVIGATION_MIGRATION_VERSION,
				'retired_at'  => gmdate( 'c' ),
				'survivor_id' => $survivor_id,
			);
			$metadata       = update_post_meta(
				$post->ID,
				'_futurebase_navigation_migration',
				$metadata_value
			);
			if ( false === $metadata && get_post_meta( $post->ID, '_futurebase_navigation_migration', true ) !== $metadata_value ) {
				return new WP_Error(
					'navigation_retirement_metadata_failed',
					__( 'The unused navigation post was drafted, but its recovery metadata could not be saved.', 'futurebase' )
				);
			}
		}

		return $result;
	}
}

if ( ! function_exists( 'futurebase_navigation_repair_seeded_state' ) ) {
	/**
	 * Repair the old seeder's orphaned-client-menu state.
	 *
	 * @param WP_Post      $primary Seeded primary region.
	 * @param WP_Post      $legacy  Older client navigation post.
	 * @param WP_Post|null $footer  Footer region, when one already exists.
	 * @return true|WP_Error
	 */
	function futurebase_navigation_repair_seeded_state( $primary, $legacy, $footer ) {
		$references       = futurebase_navigation_references( array( $primary->ID, $legacy->ID ) );
		$primary_referred = isset( $references[ $primary->ID ] );
		$legacy_referred  = isset( $references[ $legacy->ID ] );

		if ( $primary_referred && $legacy_referred ) {
			return new WP_Error(
				'navigation_needs_attention',
				__( 'Both the seeded and legacy navigation posts are referenced. Choose the intended primary menu manually; no content was changed.', 'futurebase' )
			);
		}

		$primary_snapshot = futurebase_navigation_snapshot( $primary );
		$legacy_snapshot  = futurebase_navigation_snapshot( $legacy );
		$title            = futurebase_navigation_primary_title( $legacy, $footer );

		if ( $primary_referred ) {
			$updated = wp_update_post(
				array(
					'ID'           => $primary->ID,
					'post_status'  => 'publish',
					'post_name'    => 'primary-navigation',
					'post_title'   => wp_slash( $title ),
					'post_content' => wp_slash( $legacy->post_content ),
				),
				true
			);
			if ( is_wp_error( $updated ) ) {
				return $updated;
			}

			$retired = futurebase_navigation_retire( $legacy, $primary->ID );
			if ( is_wp_error( $retired ) ) {
				futurebase_navigation_restore( $primary_snapshot );
				futurebase_navigation_restore( $legacy_snapshot );
				return $retired;
			}

			return true;
		}

		$retired = futurebase_navigation_retire( $primary, $legacy->ID );
		if ( is_wp_error( $retired ) ) {
			futurebase_navigation_restore( $primary_snapshot );
			futurebase_navigation_restore( $legacy_snapshot );
			return $retired;
		}

		$updated = wp_update_post(
			array(
				'ID'          => $legacy->ID,
				'post_status' => 'publish',
				'post_name'   => 'primary-navigation',
				'post_title'  => wp_slash( $title ),
			),
			true
		);
		if ( is_wp_error( $updated ) ) {
			futurebase_navigation_restore( $primary_snapshot );
			futurebase_navigation_restore( $legacy_snapshot );
			return $updated;
		}

		return true;
	}
}

if ( ! function_exists( 'futurebase_navigation_apply_migration' ) ) {
	/**
	 * Apply normal adoption/seeding or the narrowly identified damage repair.
	 *
	 * @return true|WP_Error
	 */
	function futurebase_navigation_apply_migration() {
		$primary = futurebase_navigation_region_post( 'primary-navigation' );
		$footer  = futurebase_navigation_region_post( 'footer-navigation' );

		if ( $primary instanceof WP_Post && get_option( 'futurebase_navigation_seeded' ) ) {
			$legacy_posts = futurebase_navigation_legacy_posts( $primary );
			if ( ! empty( $legacy_posts ) ) {
				$legacy = $legacy_posts[0];
				if ( ! futurebase_navigation_matches_seed( $primary ) || $primary->post_modified !== $primary->post_date ) {
					return new WP_Error(
						'navigation_needs_attention',
						__( 'An older navigation menu exists, but the seeded primary menu has been edited or cannot be identified safely. No content was changed.', 'futurebase' )
					);
				}

				// Resolve the only ambiguous survivor case before creating a
				// missing footer. "Needs attention" must be a read-only result.
				$references = futurebase_navigation_references( array( $primary->ID, $legacy->ID ) );
				if ( isset( $references[ $primary->ID ], $references[ $legacy->ID ] ) ) {
					return new WP_Error(
						'navigation_needs_attention',
						__( 'Both the seeded and legacy navigation posts are referenced. Choose the intended primary menu manually; no content was changed.', 'futurebase' )
					);
				}

				$created_footer_id = 0;
				if ( ! $footer instanceof WP_Post ) {
					$footer_id = futurebase_navigation_insert_region( 'footer-navigation' );
					if ( is_wp_error( $footer_id ) ) {
						return $footer_id;
					}
					$created_footer_id = $footer_id;
					$footer            = get_post( $footer_id );
				}

				$repair = futurebase_navigation_repair_seeded_state( $primary, $legacy, $footer );
				if ( is_wp_error( $repair ) && $created_footer_id ) {
					wp_delete_post( $created_footer_id, true );
				}

				return $repair;
			}
		}

		if ( ! $primary instanceof WP_Post ) {
			$legacy_posts = futurebase_navigation_legacy_posts();
			if ( ! empty( $legacy_posts ) ) {
				$legacy  = $legacy_posts[0];
				$updated = wp_update_post(
					array(
						'ID'          => $legacy->ID,
						'post_status' => 'publish',
						'post_name'   => 'primary-navigation',
						'post_title'  => wp_slash( futurebase_navigation_primary_title( $legacy, $footer ) ),
					),
					true
				);
				if ( is_wp_error( $updated ) ) {
					return $updated;
				}
			} else {
				$primary_id = futurebase_navigation_insert_region( 'primary-navigation' );
				if ( is_wp_error( $primary_id ) ) {
					return $primary_id;
				}
			}
		}

		if ( ! $footer instanceof WP_Post ) {
			$footer_id = futurebase_navigation_insert_region( 'footer-navigation' );
			if ( is_wp_error( $footer_id ) ) {
				return $footer_id;
			}
		}

		return true;
	}
}

if ( ! function_exists( 'futurebase_navigation_regions_complete' ) ) {
	/**
	 * Read-only completion check used after retry writes stop.
	 *
	 * An unresolved old-seeder state includes a published non-region menu.
	 * Once an operator has selected the survivor and drafted the unused post,
	 * this check can complete the migration without another content mutation.
	 *
	 * @return bool
	 */
	function futurebase_navigation_regions_complete() {
		$primary = futurebase_navigation_region_post( 'primary-navigation' );
		$footer  = futurebase_navigation_region_post( 'footer-navigation' );
		if ( ! $primary instanceof WP_Post || ! $footer instanceof WP_Post || $primary->ID === $footer->ID ) {
			return false;
		}

		if ( get_option( 'futurebase_navigation_seeded' ) && ! empty( futurebase_navigation_legacy_posts( $primary ) ) ) {
			return false;
		}

		return true;
	}
}

if ( ! function_exists( 'futurebase_navigation_migration_state' ) ) {
	/**
	 * Normalize migration state from the option table.
	 *
	 * @return array{version: int, status: string, attempts: int, last_error: string}
	 */
	function futurebase_navigation_migration_state() {
		$state = get_option( 'futurebase_navigation_migration', array() );
		if ( ! is_array( $state ) ) {
			$state = array();
		}

		return array(
			'version'    => isset( $state['version'] ) ? (int) $state['version'] : FUTUREBASE_NAVIGATION_MIGRATION_VERSION,
			'status'     => isset( $state['status'] ) ? (string) $state['status'] : 'pending',
			'attempts'   => isset( $state['attempts'] ) ? (int) $state['attempts'] : 0,
			'last_error' => isset( $state['last_error'] ) ? (string) $state['last_error'] : '',
		);
	}
}

if ( ! function_exists( 'futurebase_migrate_navigation_regions' ) ) {
	/**
	 * Run the version-2 navigation migration with bounded technical retries.
	 *
	 * @return void
	 */
	function futurebase_migrate_navigation_regions() {
		$state = futurebase_navigation_migration_state();
		if ( FUTUREBASE_NAVIGATION_MIGRATION_VERSION === $state['version'] && 'complete' === $state['status'] ) {
			return;
		}

		if ( 'needs_attention' === $state['status'] || $state['attempts'] >= 3 ) {
			if ( futurebase_navigation_regions_complete() ) {
				update_option(
					'futurebase_navigation_migration',
					array(
						'version'    => FUTUREBASE_NAVIGATION_MIGRATION_VERSION,
						'status'     => 'complete',
						'attempts'   => $state['attempts'],
						'last_error' => '',
					),
					false
				);
				delete_option( 'futurebase_navigation_seeded' );
			}
			return;
		}

		$result = futurebase_navigation_apply_migration();
		if ( is_wp_error( $result ) ) {
			$is_attention = 'navigation_needs_attention' === $result->get_error_code();
			$attempts     = $is_attention ? $state['attempts'] : $state['attempts'] + 1;
			update_option(
				'futurebase_navigation_migration',
				array(
					'version'    => FUTUREBASE_NAVIGATION_MIGRATION_VERSION,
					'status'     => $is_attention || $attempts >= 3 ? 'needs_attention' : 'failed',
					'attempts'   => $attempts,
					'last_error' => $result->get_error_message(),
				),
				false
			);
			return;
		}

		if ( ! futurebase_navigation_regions_complete() ) {
			$attempts = $state['attempts'] + 1;
			update_option(
				'futurebase_navigation_migration',
				array(
					'version'    => FUTUREBASE_NAVIGATION_MIGRATION_VERSION,
					'status'     => $attempts >= 3 ? 'needs_attention' : 'failed',
					'attempts'   => $attempts,
					'last_error' => __( 'The migration returned without two valid, distinct navigation regions.', 'futurebase' ),
				),
				false
			);
			return;
		}

		update_option(
			'futurebase_navigation_migration',
			array(
				'version'    => FUTUREBASE_NAVIGATION_MIGRATION_VERSION,
				'status'     => 'complete',
				'attempts'   => $state['attempts'],
				'last_error' => '',
			),
			false
		);
		delete_option( 'futurebase_navigation_seeded' );
	}
}

if ( ! function_exists( 'futurebase_seed_navigation_menus' ) ) {
	/**
	 * Backward-compatible entry point for the former one-shot seeder.
	 *
	 * @return void
	 */
	function futurebase_seed_navigation_menus() {
		futurebase_migrate_navigation_regions();
	}
}

if ( ! function_exists( 'futurebase_navigation_migration_notice' ) ) {
	/**
	 * Show migration failures only to users who can manage the theme.
	 *
	 * @return void
	 */
	function futurebase_navigation_migration_notice() {
		if ( ! current_user_can( 'edit_theme_options' ) ) {
			return;
		}

		$state = futurebase_navigation_migration_state();
		if ( 'needs_attention' !== $state['status'] ) {
			return;
		}
		?>
		<div class="notice notice-warning">
			<p>
				<strong><?php esc_html_e( 'Navigation migration needs attention.', 'futurebase' ); ?></strong>
				<?php echo esc_html( $state['last_error'] ); ?>
				<?php
				printf(
					' <a href="%s">%s</a>',
					esc_url( admin_url( 'site-editor.php?path=/navigation' ) ),
					esc_html__( 'Review navigation menus', 'futurebase' )
				);
				?>
			</p>
		</div>
		<?php
	}
}

add_action( 'after_switch_theme', 'futurebase_migrate_navigation_regions' );
add_action( 'admin_init', 'futurebase_migrate_navigation_regions' );
add_action( 'admin_notices', 'futurebase_navigation_migration_notice' );
