<?php
/**
 * Demo-content importer.
 *
 * Run via WP-CLI inside the WordPress environment:
 *   wp eval-file fixtures/import-demo.php
 *
 * Assumes a freshly emptied site — bin/demo-content.sh performs the guarded
 * `wp site empty --uploads --yes` reset before calling this file, so every
 * import converges to the same deterministic state.
 *
 * Pattern slugs are discovered from the block-pattern registry at runtime
 * (never hardcoded), so this file survives bin/rename-theme.sh untouched.
 *
 * @package fixtures
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	echo "import-demo.php must run via `wp eval-file`.\n";
	exit( 1 );
}

require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

// Everything runs inside a closure so no variable leaks into the global
// scope (WPCS PrefixAllGlobals — this file is CLI tooling, not theme code).
call_user_func(
	function () {

		$admins = get_users(
			array(
				'role'    => 'administrator',
				'orderby' => 'ID',
				'order'   => 'ASC',
				'number'  => 1,
			)
		);
		if ( empty( $admins ) ) {
			WP_CLI::error( 'No administrator user found.' );
		}
		$author_id = (int) $admins[0]->ID;
		wp_set_current_user( $author_id );

		// ---------------------------------------------------------------------------
		// 1. Import editorial demo media (raster files replace the neutral theme
		// placeholders — see docs/media-conventions.md: editorial imagery is
		// attachment-backed; brand/interface marks like the logo strip stay
		// theme-served and are deliberately NOT rewritten).
		// ---------------------------------------------------------------------------
		$media_dir = get_stylesheet_directory() . '/fixtures/media';
		$media_map = array(); // placeholder stem => attachment ID.
		$media_alt = array(
			'placeholder-portrait' => 'Demo portrait photograph',
			'placeholder-wide'     => 'Demo studio photograph',
		);

		foreach ( glob( $media_dir . '/*.png' ) as $media_file ) {
			$stem = pathinfo( $media_file, PATHINFO_FILENAME );
			$tmp  = wp_tempnam( basename( $media_file ) );
			if ( ! $tmp || ! copy( $media_file, $tmp ) ) {
				WP_CLI::error( 'Could not stage media file: ' . basename( $media_file ) );
			}
			$attachment_id = media_handle_sideload(
				array(
					'name'     => basename( $media_file ),
					'tmp_name' => $tmp,
				)
			);
			if ( is_wp_error( $attachment_id ) ) {
				WP_CLI::error( 'Media import failed for ' . basename( $media_file ) . ': ' . $attachment_id->get_error_message() );
			}
			if ( isset( $media_alt[ $stem ] ) ) {
				update_post_meta( $attachment_id, '_wp_attachment_image_alt', $media_alt[ $stem ] );
			}
			$media_map[ $stem ] = (int) $attachment_id;
		}

		// ---------------------------------------------------------------------------
		// 2. Discover the theme's pattern namespace from the registry.
		// ---------------------------------------------------------------------------
		$registry  = WP_Block_Patterns_Registry::get_instance();
		$namespace = '';
		foreach ( $registry->get_all_registered() as $registered ) {
			if ( preg_match( '#^(.+)/section-hero$#', $registered['name'], $m ) ) {
				$namespace = $m[1];
				break;
			}
		}
		if ( '' === $namespace ) {
			WP_CLI::error( 'No <namespace>/section-hero pattern registered — is the theme active?' );
		}

		$expand_sections = function ( array $sections ) use ( $registry, $namespace ) {
			$content = '';
			foreach ( $sections as $section ) {
				$name = $namespace . '/section-' . $section;
				if ( ! $registry->is_registered( $name ) ) {
					WP_CLI::error( 'Pattern not registered: ' . $name );
				}
				$pattern  = $registry->get_registered( $name );
				$content .= $pattern['content'] . "\n\n";
			}
			return $content;
		};

		// ---------------------------------------------------------------------------
		// 3. Rewrite theme-placeholder images to imported attachments.
		// parse_blocks() -> mutate attrs + innerContent (WP_HTML_Tag_Processor)
		// -> serialize_blocks(). Never string-replace serialized markup.
		// ---------------------------------------------------------------------------
		$rewrite_html = function ( $html, $stem, $attachment_id, $add_image_class ) {
			$url       = wp_get_attachment_url( $attachment_id );
			$alt       = (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true );
			$processor = new WP_HTML_Tag_Processor( $html );
			while ( $processor->next_tag( 'img' ) ) {
				$src = (string) $processor->get_attribute( 'src' );
				if ( false === strpos( $src, 'assets/images/' . $stem . '.' ) ) {
					continue;
				}
				$processor->set_attribute( 'src', $url );
				if ( '' !== $alt ) {
					$processor->set_attribute( 'alt', $alt );
				}
				if ( $add_image_class ) {
					$processor->add_class( 'wp-image-' . $attachment_id );
				}
			}
			return $processor->get_updated_html();
		};

		$rewrite_blocks = function ( array $blocks ) use ( &$rewrite_blocks, $rewrite_html, $media_map ) {
			foreach ( $blocks as &$block ) {
				$is_image      = 'core/image' === $block['blockName'];
				$is_media_text = 'core/media-text' === $block['blockName'];

				foreach ( $media_map as $stem => $attachment_id ) {
					$needle = 'assets/images/' . $stem . '.';
					$found  = false;
					foreach ( $block['innerContent'] as $i => $piece ) {
						if ( ! is_string( $piece ) || false === strpos( $piece, $needle ) ) {
							continue;
						}
						$block['innerContent'][ $i ] = $rewrite_html( $piece, $stem, $attachment_id, $is_image );
						$found                       = true;
					}
					if ( ! $found ) {
						continue;
					}
					if ( is_string( $block['innerHTML'] ) && false !== strpos( $block['innerHTML'], $needle ) ) {
						$block['innerHTML'] = $rewrite_html( $block['innerHTML'], $stem, $attachment_id, $is_image );
					}
					if ( $is_image ) {
						$block['attrs']['id'] = $attachment_id;
					}
					if ( $is_media_text ) {
						$block['attrs']['mediaId']   = $attachment_id;
						$block['attrs']['mediaLink'] = wp_get_attachment_url( $attachment_id );
						$block['attrs']['mediaType'] = 'image';
					}
				}

				if ( ! empty( $block['innerBlocks'] ) ) {
					$block['innerBlocks'] = $rewrite_blocks( $block['innerBlocks'] );
				}
			}
			return $blocks;
		};

		$build_page_content = function ( array $sections ) use ( $expand_sections, $rewrite_blocks ) {
			$content = $expand_sections( $sections );
			$blocks  = $rewrite_blocks( parse_blocks( $content ) );
			return serialize_blocks( $blocks );
		};

		// ---------------------------------------------------------------------------
		// 4. Pages. Deterministic slugs — bin/scorecard.sh builds its URL list from
		// these. Home stays empty: templates/front-page.html wires the home pattern.
		// ---------------------------------------------------------------------------
		$insert_page = function ( $title, $slug, $content = '', $template = '' ) use ( $author_id ) {
			$page_id = wp_insert_post(
				array(
					'post_type'    => 'page',
					'post_status'  => 'publish',
					'post_title'   => $title,
					'post_name'    => $slug,
					'post_content' => $content,
					'post_author'  => $author_id,
				),
				true
			);
			if ( is_wp_error( $page_id ) ) {
				WP_CLI::error( 'Page insert failed (' . $slug . '): ' . $page_id->get_error_message() );
			}
			if ( '' !== $template ) {
				update_post_meta( $page_id, '_wp_page_template', $template );
			}
			return (int) $page_id;
		};

		$home_id     = $insert_page( 'Home', 'home' );
		$blog_id     = $insert_page( 'Blog', 'blog' );
		$about_id    = $insert_page(
			'About',
			'about',
			$build_page_content( array( 'split-hero', 'stats', 'team', 'timeline', 'cta' ) )
		);
		$services_id = $insert_page(
			'Services',
			'services',
			$build_page_content( array( 'features', 'pricing', 'testimonials', 'logos', 'faq', 'contact' ) ),
			'page-notitle'
		);

		// ---------------------------------------------------------------------------
		// 5. Posts. Guarantees for the scorecard URL set: the "Notes" category
		// archive, the admin author archive, and the ?s=demo search are all
		// provably non-empty.
		// ---------------------------------------------------------------------------
		$notes = wp_insert_term( 'Notes', 'category', array( 'slug' => 'notes' ) );
		if ( is_wp_error( $notes ) ) {
			WP_CLI::error( 'Category insert failed: ' . $notes->get_error_message() );
		}
		$notes_id = (int) $notes['term_id'];

		$posts = array(
			array(
				'title'    => 'Designing with demo content',
				'slug'     => 'designing-with-demo-content',
				'category' => $notes_id,
				'body'     => "<!-- wp:paragraph -->\n<p>This demo post exists so every template renders against real content. It seeds the search index with the word demo, fills the Notes category archive, and gives the author archive something to list.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>Replace it with real writing before launch. Its only job is to make the starting state honest.</p>\n<!-- /wp:paragraph -->",
			),
			array(
				'title'    => 'A second field note',
				'slug'     => 'a-second-field-note',
				'category' => $notes_id,
				'body'     => "<!-- wp:paragraph -->\n<p>A second demo entry so archives paginate naturally and list views show more than a single row.</p>\n<!-- /wp:paragraph -->",
			),
			array(
				'title'    => 'Notes on the build',
				'slug'     => 'notes-on-the-build',
				'category' => 0,
				'body'     => "<!-- wp:paragraph -->\n<p>A third demo entry, uncategorized on purpose, so the blog index and the category archive differ.</p>\n<!-- /wp:paragraph -->",
			),
		);

		$post_ids = array();
		foreach ( $posts as $seed ) {
			$post_id = wp_insert_post(
				array(
					'post_type'    => 'post',
					'post_status'  => 'publish',
					'post_title'   => $seed['title'],
					'post_name'    => $seed['slug'],
					'post_content' => $seed['body'],
					'post_author'  => $author_id,
				),
				true
			);
			if ( is_wp_error( $post_id ) ) {
				WP_CLI::error( 'Post insert failed (' . $seed['slug'] . '): ' . $post_id->get_error_message() );
			}
			if ( $seed['category'] ) {
				wp_set_post_terms( $post_id, array( $seed['category'] ), 'category' );
			}
			$post_ids[] = (int) $post_id;
		}

		// ---------------------------------------------------------------------------
		// 6. Navigation seed — a wp_navigation post so the header menu lists real
		// pages (core's fallback picks the most recent wp_navigation post).
		// ---------------------------------------------------------------------------
		$nav_content  = '<!-- wp:navigation-link {"label":"About","type":"page","id":' . $about_id . ',"url":"' . esc_url( get_permalink( $about_id ) ) . '","kind":"post-type"} /-->' . "\n";
		$nav_content .= '<!-- wp:navigation-link {"label":"Services","type":"page","id":' . $services_id . ',"url":"' . esc_url( get_permalink( $services_id ) ) . '","kind":"post-type"} /-->' . "\n";
		$nav_content .= '<!-- wp:navigation-link {"label":"Blog","type":"page","id":' . $blog_id . ',"url":"' . esc_url( get_permalink( $blog_id ) ) . '","kind":"post-type"} /-->';
		wp_insert_post(
			array(
				'post_type'    => 'wp_navigation',
				'post_status'  => 'publish',
				'post_title'   => 'Demo navigation',
				'post_name'    => 'demo-navigation',
				'post_content' => $nav_content,
				'post_author'  => $author_id,
			)
		);

		// ---------------------------------------------------------------------------
		// 7. Site state: static front page + posts page, pretty permalinks.
		// ---------------------------------------------------------------------------
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $home_id );
		update_option( 'page_for_posts', $blog_id );
		// set_permalink_structure() updates both the option and the loaded
		// $wp_rewrite — update_option() alone leaves the object stale, so the
		// flush below would regenerate rules for the OLD structure (single posts 404).
		$GLOBALS['wp_rewrite']->set_permalink_structure( '/%postname%/' );
		flush_rewrite_rules();

		// ---------------------------------------------------------------------------
		// 8. Summary — bin/demo-content.sh captures this for idempotency checks.
		// ---------------------------------------------------------------------------
		WP_CLI::log(
			wp_json_encode(
				array(
					'namespace'   => $namespace,
					'pages'       => array(
						'home'     => get_post_field( 'post_name', $home_id ),
						'blog'     => get_post_field( 'post_name', $blog_id ),
						'about'    => get_post_field( 'post_name', $about_id ),
						'services' => get_post_field( 'post_name', $services_id ),
					),
					'template'    => get_post_meta( $services_id, '_wp_page_template', true ),
					'posts'       => array_map(
						function ( $id ) {
							return get_post_field( 'post_name', $id );
						},
						$post_ids
					),
					'category'    => 'notes',
					'author'      => get_the_author_meta( 'user_nicename', $author_id ),
					'attachments' => count( $media_map ),
				)
			)
		);
	}
);
