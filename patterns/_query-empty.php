<?php
/**
 * Title: No results
 * Slug: futurebase/_query-empty
 * Inserter: no
 * Description: Recovery content for an empty search, blog, or archive.
 *
 * @package futurebase
 */

?>
	<!-- wp:paragraph -->
	<p><?php esc_html_e( 'No results found. Try a different search.', 'futurebase' ); ?></p>
	<!-- /wp:paragraph -->
	<?php
	// WordPress serializes translated labels safely as block attributes.
	// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo get_comment_delimited_block_content(
		'core/search',
		array(
			'label'      => __( 'Search', 'futurebase' ),
			'buttonText' => __( 'Search', 'futurebase' ),
		),
		''
	);
	?>
