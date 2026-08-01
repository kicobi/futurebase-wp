<?php
/**
 * Futurebase theme functions.
 *
 * @package futurebase
 */

if ( ! function_exists( 'futurebase_theme_support' ) ) {
	/**
	 * General Theme Settings.
	 *
	 * @since v1.0
	 *
	 * @return void
	 */
	function futurebase_theme_support() {
		// Make theme available for translation: Translations can be filed in the /languages/ directory.
		load_theme_textdomain( 'futurebase', __DIR__ . '/languages' );

		// Add support for Post thumbnails.
		add_theme_support( 'post-thumbnails' );
		// Add support for responsive embedded content.
		add_theme_support( 'responsive-embeds' );
		// Add support for Block Styles.
		add_theme_support( 'wp-block-styles' );
		// Opt into HTML5 markup for core form/gallery output surfaced outside block contexts.
		add_theme_support(
			'html5',
			array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
		);
	}
	add_action( 'after_setup_theme', 'futurebase_theme_support' );
}

if ( ! function_exists( 'futurebase_curate_editor' ) ) {
	/**
	 * Curate the block editor to match the theme's design system.
	 *
	 * The inserter only shows what this theme ships — no block directory
	 * plugin search, no core block patterns, no WordPress.org pattern
	 * directory. Each removal is one self-contained line; delete any
	 * that don't fit a given project.
	 *
	 * See https://github.com/WordPress/gutenberg/blob/trunk/docs/reference-guides/filters/editor-filters.md#block-directory.
	 *
	 * @return void
	 */
	function futurebase_curate_editor() {
		// Block directory — the "search for a plugin block" UI in the inserter.
		remove_action( 'enqueue_block_editor_assets', 'wp_enqueue_editor_block_directory_assets' );
		remove_action( 'enqueue_block_editor_assets', 'gutenberg_enqueue_block_editor_assets_block_directory' );

		// Core block patterns — WordPress's built-in patterns. Keeps the
		// inserter focused on this theme's own _section-* patterns.
		remove_theme_support( 'core-block-patterns' );

		// WordPress.org pattern directory — paired with remove_theme_support()
		// above; both gates must be closed to hide every remote pattern surface.
		add_filter( 'should_load_remote_block_patterns', '__return_false' );
	}
	add_action( 'after_setup_theme', 'futurebase_curate_editor' );
}

if ( ! function_exists( 'futurebase_disable_openverse' ) ) {
	/**
	 * Remove the Openverse media category from the block inserter.
	 *
	 * Local media library insert/upload/manage flows are untouched.
	 *
	 * @param array<string, mixed> $settings Block editor settings passed to the editor.
	 * @return array<string, mixed>
	 */
	function futurebase_disable_openverse( $settings ) {
		$settings['enableOpenverseMediaCategory'] = false;
		return $settings;
	}
	add_filter( 'block_editor_settings_all', 'futurebase_disable_openverse' );
}

if ( ! function_exists( 'futurebase_register_blocks' ) ) {
	/**
	 * Auto-register theme-bound blocks compiled to build/blocks/.
	 *
	 * Each `src/blocks/<slug>/block.json` becomes
	 * `build/blocks/<slug>/block.json` after `npm run build`.
	 * register_block_type reads the metadata and the render.php reference
	 * directly — no per-block PHP wiring needed. Scaffold new blocks with
	 * `npm run block:new -- <slug>`.
	 *
	 * @return void
	 */
	function futurebase_register_blocks() {
		$blocks_dir = __DIR__ . '/build/blocks';
		if ( ! is_dir( $blocks_dir ) ) {
			return;
		}
		$block_dirs = glob( $blocks_dir . '/*', GLOB_ONLYDIR );
		if ( false === $block_dirs ) {
			return;
		}
		foreach ( $block_dirs as $block_dir ) {
			if ( is_file( $block_dir . '/block.json' ) ) {
				register_block_type( $block_dir );
			}
		}
	}
	add_action( 'init', 'futurebase_register_blocks' );
}

if ( ! function_exists( 'futurebase_register_block_styles' ) ) {
	/**
	 * Register block style variations.
	 *
	 * The `section` variation on core/group hoists the shared
	 * top/bottom/horizontal padding used by every homepage section
	 * (cards, writing, cta). Patterns opt in with
	 * `"className":"is-style-section"`.
	 *
	 * @return void
	 */
	function futurebase_register_block_styles() {
		register_block_style(
			'core/group',
			array(
				'name'  => 'section',
				'label' => __( 'Section', 'futurebase' ),
			)
		);
	}
	add_action( 'init', 'futurebase_register_block_styles' );
}

require_once __DIR__ . '/inc/navigation-migration.php';

if ( ! function_exists( 'futurebase_load_post_types' ) ) {
	/**
	 * Auto-load custom post type registrations from inc/post-types/.
	 *
	 * Each `inc/post-types/<slug>.php` is required once on functions.php
	 * load; the files themselves register their `init` hook. Scaffold new
	 * post types with `npm run cpt:new -- <slug>`.
	 *
	 * Theme-coupled by design: if a project needs CPTs to survive theme
	 * swaps, move the generated file to a must-use plugin — the code is
	 * portable. See docs/post-types.md.
	 *
	 * @return void
	 */
	function futurebase_load_post_types() {
		$dir = __DIR__ . '/inc/post-types';
		if ( ! is_dir( $dir ) ) {
			return;
		}
		$files = glob( $dir . '/*.php' );
		if ( false === $files ) {
			return;
		}
		foreach ( $files as $file ) {
			require_once $file;
		}
	}
	futurebase_load_post_types();
}

if ( ! function_exists( 'futurebase_get_main_asset_data' ) ) {
	/**
	 * Get the dependency and version metadata for the compiled main bundle.
	 *
	 * @return array{dependencies: array<int, string>, version: string}
	 */
	function futurebase_get_main_asset_data() {
		$theme_version = wp_get_theme()->get( 'Version' );
		$asset_file    = get_theme_file_path( 'build/main.asset.php' );

		if ( ! file_exists( $asset_file ) ) {
			return array(
				'dependencies' => array(),
				'version'      => $theme_version,
			);
		}

		$asset_data = require $asset_file;

		if ( ! is_array( $asset_data ) ) {
			return array(
				'dependencies' => array(),
				'version'      => $theme_version,
			);
		}

		return array(
			'dependencies' => isset( $asset_data['dependencies'] ) && is_array( $asset_data['dependencies'] ) ? $asset_data['dependencies'] : array(),
			'version'      => isset( $asset_data['version'] ) && is_string( $asset_data['version'] ) ? $asset_data['version'] : $theme_version,
		);
	}
}

if ( ! function_exists( 'futurebase_load_scripts' ) ) {
	/**
	 * Enqueue CSS Stylesheets and Javascript files.
	 *
	 * @return void
	 */
	function futurebase_load_scripts() {
		$theme_version = wp_get_theme()->get( 'Version' );
		$asset_data    = futurebase_get_main_asset_data();
		$style_handle  = 'futurebase-style';
		$main_handle   = 'futurebase-main';
		$script_handle = 'futurebase-script';

		// 1. Styles.
		wp_enqueue_style( $style_handle, get_stylesheet_uri(), array(), $theme_version );
		wp_enqueue_style( $main_handle, get_theme_file_uri( 'build/main.css' ), array( $style_handle ), $asset_data['version'], 'all' ); // main.scss: Compiled custom styles.
		wp_style_add_data( $main_handle, 'rtl', 'replace' );

		// 2. Scripts.
		wp_enqueue_script(
			$script_handle,
			get_theme_file_uri( 'build/main.js' ),
			$asset_data['dependencies'],
			$asset_data['version'],
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
	}
	add_action( 'wp_enqueue_scripts', 'futurebase_load_scripts' );
}
