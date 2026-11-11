<?php
/**
 * Native block rendering and saved-binding regressions in disposable WordPress.
 *
 * @package bin
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	exit( 1 );
}

call_user_func(
	static function () {
		$check   = static function ( bool $condition, string $message ): void {
			if ( ! $condition ) {
				throw new RuntimeException( esc_html( $message ) );
			}
		};
		$pattern = static function ( string $name ): string {
			ob_start();
			include get_theme_file_path( 'patterns/_' . $name . '.php' );
			return (string) ob_get_clean();
		};
		$query   = static function ( array $args ): void {
			// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Isolated disposable CLI rendering fixture.
			$GLOBALS['wp_query'] = new WP_Query( $args );
			// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Match the main query for native block rendering.
			$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];
			if ( $GLOBALS['wp_query']->have_posts() ) {
				$GLOBALS['wp_query']->the_post();
			}
		};
		$options = array();
		foreach ( array( 'blogname', 'timezone_string', 'page_comments', 'comments_per_page', 'default_comments_page', 'comment_registration' ) as $key ) {
			$options[ $key ] = get_option( $key );
		}
		$owned = array();
		try {
			update_option( 'comment_registration', 0 );
			$post_id = wp_insert_post(
				array(
					'post_type'      => 'post',
					'post_status'    => 'publish',
					'post_title'     => 'Theme regression',
					'comment_status' => 'open',
					'post_content'   => 'Public fixture',
				)
			);
			$owned[] = $post_id;
			$query( array( 'p' => $post_id ) );
			$markup = $pattern( 'comments' );
			$empty  = do_blocks( $markup );
			$check( str_contains( $empty, 'id="commentform"' ), 'Empty open comments have no form.' );
			foreach ( array( 'First visible comment', 'Second visible comment' ) as $content ) {
				wp_insert_comment(
					array(
						'comment_post_ID'  => $post_id,
						'comment_content'  => $content,
						'comment_author'   => 'Reader',
						'comment_approved' => 1,
					)
				);
			}
			update_option( 'page_comments', '1' );
			update_option( 'comments_per_page', 1 );
			update_option( 'default_comments_page', 'oldest' );
			$query(
				array(
					'p'     => $post_id,
					'cpage' => 1,
				)
			);
			$populated = do_blocks( $markup );
			$check( str_contains( $populated, 'First visible comment' ), 'Approved comments do not render.' );
			$check( str_contains( $populated, 'wp-block-comments-pagination-next' ), 'Comment pagination is missing.' );
			wp_update_post(
				array(
					'ID'             => $post_id,
					'comment_status' => 'closed',
				)
			);
			$query( array( 'p' => $post_id ) );
			$closed = do_blocks( $markup );
			$check( ! str_contains( $closed, 'id="commentform"' ) && str_contains( $closed, 'visible comment' ), 'Closed comments must retain discussion without a form.' );
			wp_update_post(
				array(
					'ID'             => $post_id,
					'post_password'  => 'fixture-password',
					'comment_status' => 'open',
				)
			);
			$query( array( 'p' => $post_id ) );
			$protected = do_blocks( $markup );
			$check( ! str_contains( $protected, 'visible comment' ) && ! str_contains( $protected, 'id="commentform"' ), 'Protected comments or form leaked.' );

			// Persist the actual paragraph block, then change its dynamic inputs.
			$copyright = $pattern( 'copyright' );
			$footer_id = wp_insert_post(
				wp_slash(
					array(
						'post_type'    => 'wp_template_part',
						'post_status'  => 'publish',
						'post_name'    => 'runtime-copyright',
						'post_title'   => 'Runtime copyright',
						'post_content' => $copyright,
					)
				)
			);
			$owned[]   = $footer_id;
			wp_set_object_terms( $footer_id, get_stylesheet(), 'wp_theme' );
			update_option( 'blogname', 'A "quoted" & <new> title' );
			update_option( 'timezone_string', 'Pacific/Kiritimati' );
			$saved    = get_post_field( 'post_content', $footer_id );
			$rendered = do_blocks( $saved );
			$check( str_contains( $rendered, esc_html( get_bloginfo( 'name' ) ) ) && str_contains( $rendered, wp_date( 'Y' ) ), 'Saved copyright binding is stale or unescaped.' );
			$future_year = static fn( $date, $format ) => 'Y' === $format ? '2099' : $date;
			add_filter( 'wp_date', $future_year, 10, 2 );
			try {
				$check( str_contains( do_blocks( $saved ), '2099' ), 'Saved copyright did not update after the WordPress year changed.' );
			} finally {
				remove_filter( 'wp_date', $future_year, 10 );
			}
			$check( get_post_field( 'post_content', $footer_id ) === $saved, 'Rendering mutated the saved footer.' );

			$query( array( 's' => 'no-match-' . wp_generate_uuid4() ) );
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local theme fixture.
			$empty_search = do_blocks( file_get_contents( get_theme_file_path( 'parts/query.html' ) ) );
			$check( str_contains( $empty_search, 'No results found.' ) && str_contains( $empty_search, 'role="search"' ), 'Empty search lacks recovery text or a search form.' );
			WP_CLI::success( 'Theme runtime: empty, populated, paginated, closed and protected comments; saved copyright title/year; empty-search recovery.' );
		} finally {
			foreach ( $options as $key => $value ) {
				update_option( $key, $value );
			}
			foreach ( $owned as $id ) {
				wp_delete_post( $id, true );
			}
			wp_reset_postdata();
		}
	}
);
