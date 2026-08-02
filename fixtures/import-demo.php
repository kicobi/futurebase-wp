<?php
/**
 * Demo-content importer.
 *
 * Run via WP-CLI inside the WordPress environment:
 *   wp eval-file fixtures/import-demo.php
 *
 * bin/demo-content.sh performs a guarded `wp site empty --uploads --yes` reset
 * before calling this file, but the import does NOT depend on it: every object
 * is addressed by a deterministic slug and upserted, so running this against a
 * site that already holds the fixture converges to the same state rather than
 * duplicating it. Manual `wp eval-file` runs that skip the reset are supported.
 *
 * That property is load-bearing. Slugs here are the scorecard's URL contract —
 * bin/scorecard.sh builds its page list from them — and a plain wp_insert_post
 * does not fail on a slug collision, it silently appends `-2`. A re-run without
 * upserts would leave a site that looks imported but serves /home-2/.
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

		// Normalize the author archive URL: hosts name the admin user
		// differently (admin, siteadmin, ...), and the scorecard page set
		// needs a deterministic /author/demo-author/ everywhere. Also keeps
		// the public author archive from leaking the real login username.
		wp_update_user(
			array(
				'ID'            => $author_id,
				'user_nicename' => 'demo-author',
				'display_name'  => 'Demo Author',
			)
		);

		// ---------------------------------------------------------------------------
		// 0. Upsert helpers. Every seed below is addressed by its slug, which is
		// what lets a re-run converge instead of accumulating `-2` suffixes.
		// ---------------------------------------------------------------------------

		// Existing post of this type with this exact slug, or 0. Status is 'any'
		// so a draft left behind by a half-finished run is still found and
		// republished rather than shadowed by a second copy.
		$find_by_slug = function ( $slug, $post_type ) {
			$found = get_posts(
				array(
					'name'                   => $slug,
					'post_type'              => $post_type,
					'post_status'            => 'any',
					'numberposts'            => 1,
					'fields'                 => 'ids',
					'no_found_rows'          => true,
					'update_post_meta_cache' => false,
					'update_post_term_cache' => false,
				)
			);
			return $found ? (int) $found[0] : 0;
		};

		// Insert, or update in place when the slug already exists. wp_insert_post
		// would not error on a collision — it would coin a new slug — so the
		// lookup, not the error handling, is what keeps the URL set stable.
		$upsert_post = function ( array $args, $label ) use ( $find_by_slug ) {
			$existing = $find_by_slug( $args['post_name'], $args['post_type'] );
			if ( $existing ) {
				$args['ID'] = $existing;
				$post_id    = wp_update_post( $args, true );
			} else {
				$post_id = wp_insert_post( $args, true );
			}
			if ( is_wp_error( $post_id ) ) {
				WP_CLI::error( $label . ' failed (' . $args['post_name'] . '): ' . $post_id->get_error_message() );
			}
			return (int) $post_id;
		};

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
			'site-icon'            => 'Site icon',
		);

		foreach ( glob( $media_dir . '/*.png' ) as $media_file ) {
			$stem = pathinfo( $media_file, PATHINFO_FILENAME );

			// Reuse the attachment a previous run created. media_handle_sideload
			// always uploads, so without this a re-run leaves a second copy on
			// disk as placeholder-portrait-1.png and rewrites the patterns to
			// point at it — the original is then orphaned, not replaced.
			$attachment_id = $find_by_slug( sanitize_title( $stem ), 'attachment' );

			if ( ! $attachment_id ) {
				$tmp = wp_tempnam( basename( $media_file ) );
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
			}
			if ( isset( $media_alt[ $stem ] ) ) {
				update_post_meta( $attachment_id, '_wp_attachment_image_alt', $media_alt[ $stem ] );
			}
			if ( 'site-icon' === $stem ) {
				// Site icon: WordPress then answers /favicon.ico itself,
				// which keeps a 404 console error out of every page's
				// Lighthouse best-practices score.
				update_option( 'site_icon', (int) $attachment_id );
				continue;
			}
			$media_map[ $stem ] = (int) $attachment_id;
		}

		// ---------------------------------------------------------------------------
		// 2. Discover the theme's pattern namespace from the registry.
		// ---------------------------------------------------------------------------
		$registry = WP_Block_Patterns_Registry::get_instance();

		/*
		 * The namespace is the theme's TEXT DOMAIN, not its directory.
		 *
		 * Those were the same string until the two were allowed to differ:
		 * Futurebase WP lives in futurebase-wp/ but registers
		 * futurebase/section-*. get_stylesheet() returns the directory, so the
		 * loop below matched nothing, every composed page was built from zero
		 * sections, and About and Services rendered empty — while the scorecard
		 * measured them and still reported OK.
		 *
		 * bin/rename-theme.sh rewrites the text domain and the pattern slugs
		 * from one value, so a client cannot drift the two apart.
		 *
		 * It used to be found by probing for `<namespace>/section-hero` and
		 * erroring if that pattern was absent. That reads "is the theme
		 * active?" but actually asks "is this theme still shaped like the
		 * starter?" — and a promoted project that has replaced the starter's
		 * homepage has no section-hero, so the import died on a theme that was
		 * active, correct, and simply its own. The registry is still consulted
		 * below; it is no longer required to contain one specific pattern.
		 */
		$theme     = wp_get_theme();
		$namespace = $theme->get( 'TextDomain' );
		if ( ! $namespace ) {
			$namespace = $theme->get_stylesheet();
		}

		$available = array();
		foreach ( $registry->get_all_registered() as $registered ) {
			if ( preg_match( '#^' . preg_quote( $namespace, '#' ) . '/section-(.+)$#', $registered['name'], $m ) ) {
				$available[ $m[1] ] = $registered['name'];
			}
		}

		if ( empty( $available ) ) {
			WP_CLI::warning(
				sprintf(
					'No %s/section-* patterns are registered. Pages will be created without composed content.',
					$namespace
				)
			);
		}

		/*
		 * Sections the caller asks for that this theme does not have are
		 * skipped, not fatal. A fixture is scaffolding: it should furnish
		 * whatever the theme can furnish and say what it could not, rather
		 * than refuse to run because a project outgrew the starter's homepage.
		 */
		$expand_sections = function ( array $sections ) use ( $registry, $available, $namespace ) {
			$content = '';
			$missing = array();

			foreach ( $sections as $section ) {
				if ( ! isset( $available[ $section ] ) ) {
					$missing[] = $section;
					continue;
				}

				$pattern  = $registry->get_registered( $available[ $section ] );
				$content .= $pattern['content'] . "\n\n";
			}

			if ( $missing ) {
				WP_CLI::log(
					sprintf(
						'  skipped (not in this theme): %s',
						implode( ', ', array_map( static fn ( $s ) => $namespace . '/section-' . $s, $missing ) )
					)
				);
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

		// Serialized content must carry the site's canonical URL scheme. Under
		// WP-CLI some hosts (e.g. Kinsta) build WP_CONTENT_URL from request
		// scheme detection, so get_theme_file_uri() in pattern content comes
		// out http:// on an https site — mixed content once published.
		$home_scheme      = (string) wp_parse_url( home_url(), PHP_URL_SCHEME );
		$normalize_scheme = function ( $html ) use ( $home_scheme ) {
			$processor = new WP_HTML_Tag_Processor( $html );
			while ( $processor->next_tag( 'img' ) ) {
				$src = (string) $processor->get_attribute( 'src' );
				if ( '' !== $src && 0 === strpos( $src, 'http' ) ) {
					$processor->set_attribute( 'src', set_url_scheme( $src, $home_scheme ) );
				}
			}
			return $processor->get_updated_html();
		};

		$rewrite_blocks = function ( array $blocks ) use ( &$rewrite_blocks, $rewrite_html, $normalize_scheme, $media_map ) {
			foreach ( $blocks as &$block ) {
				$is_image      = 'core/image' === $block['blockName'];
				$is_media_text = 'core/media-text' === $block['blockName'];

				foreach ( $block['innerContent'] as $i => $piece ) {
					if ( is_string( $piece ) && false !== strpos( $piece, '<img' ) ) {
						$block['innerContent'][ $i ] = $normalize_scheme( $piece );
					}
				}
				if ( is_string( $block['innerHTML'] ) && false !== strpos( $block['innerHTML'], '<img' ) ) {
					$block['innerHTML'] = $normalize_scheme( $block['innerHTML'] );
				}

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
		$insert_page = function ( $title, $slug, $content = '', $template = '' ) use ( $author_id, $upsert_post ) {
			$page_id = $upsert_post(
				array(
					'post_type'    => 'page',
					'post_status'  => 'publish',
					'post_title'   => $title,
					'post_name'    => $slug,
					'post_content' => $content,
					'post_author'  => $author_id,
				),
				'Page insert'
			);
			if ( '' !== $template ) {
				update_post_meta( $page_id, '_wp_page_template', $template );
			} else {
				// Clear rather than skip: a page that carried a template under an
				// earlier fixture must not keep it after this one stops assigning
				// one, or the re-run converges everywhere except here.
				delete_post_meta( $page_id, '_wp_page_template' );
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
		$existing_notes = get_term_by( 'slug', 'notes', 'category' );
		if ( $existing_notes ) {
			$notes_id = (int) $existing_notes->term_id;
		} else {
			$notes = wp_insert_term( 'Notes', 'category', array( 'slug' => 'notes' ) );
			if ( is_wp_error( $notes ) ) {
				// A `term_exists` error means the term arrived between the lookup
				// above and this insert; its error data carries the term id.
				$existing_id = $notes->get_error_data( 'term_exists' );
				if ( ! $existing_id ) {
					WP_CLI::error( 'Category insert failed: ' . $notes->get_error_message() );
				}
				$notes_id = (int) $existing_id;
			} else {
				$notes_id = (int) $notes['term_id'];
			}
		}

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
			$post_id = $upsert_post(
				array(
					'post_type'    => 'post',
					'post_status'  => 'publish',
					'post_title'   => $seed['title'],
					'post_name'    => $seed['slug'],
					'post_content' => $seed['body'],
					'post_author'  => $author_id,
				),
				'Post insert'
			);
			// Assign unconditionally — wp_set_post_terms replaces rather than
			// appends, so the uncategorized seed must actively be emptied or a
			// re-run would leave whatever a previous fixture assigned to it.
			wp_set_post_terms( $post_id, $seed['category'] ? array( $seed['category'] ) : array(), 'category' );
			$post_ids[] = (int) $post_id;
		}

		// ---------------------------------------------------------------------------
		// 6. Navigation seeds — ONE wp_navigation post per region.
		//
		// The slugs are the contract: patterns/_nav-primary.php and
		// _nav-footer.php resolve `primary-navigation` and `footer-navigation`
		// by slug and emit the id as a `ref`. A single shared post (which is
		// what this used to create) meant both regions rendered the same menu
		// and editing either changed both — core picks the most recent
		// wp_navigation post when nothing is referenced, so it could not tell
		// the header from the footer.
		// ---------------------------------------------------------------------------
		$nav_link = function ( $label, $page_id ) {
			return '<!-- wp:navigation-link {"label":"' . $label . '","type":"page","id":' . (int) $page_id . ',"url":"' . esc_url( get_permalink( $page_id ) ) . '","kind":"post-type"} /-->';
		};

		$primary_nav  = $nav_link( 'About', $about_id ) . "\n";
		$primary_nav .= $nav_link( 'Services', $services_id ) . "\n";
		$primary_nav .= $nav_link( 'Blog', $blog_id );

		// Deliberately a subset, not a copy. Two landmarks listing identical
		// links are two landmarks a screen reader user cannot tell apart.
		$footer_nav = $nav_link( 'About', $about_id ) . "\n" . $nav_link( 'Blog', $blog_id );

		foreach (
			array(
				array( 'Primary navigation', 'primary-navigation', $primary_nav ),
				array( 'Footer navigation', 'footer-navigation', $footer_nav ),
			) as $seed
		) {
			list( $nav_title, $nav_slug, $nav_content ) = $seed;
			$upsert_post(
				array(
					'post_type'    => 'wp_navigation',
					'post_status'  => 'publish',
					'post_title'   => $nav_title,
					'post_name'    => $nav_slug,
					'post_content' => $nav_content,
					'post_author'  => $author_id,
				),
				'Navigation insert'
			);
		}

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
