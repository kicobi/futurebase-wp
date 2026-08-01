<?php
/**
 * Title: Copyright
 * Slug: futurebase/_copyright
 * Inserter: no
 * Description: Dynamic footer copyright line. Year is computed server-side; brand name comes from the site title.
 *
 * @package futurebase
 */

?>
<!-- wp:paragraph {"fontSize":"small"} -->
<p class="has-small-font-size">
	<?php
	echo esc_html(
		sprintf(
			/* translators: 1: current year, 2: site title */
			__( '© %1$s %2$s. All rights reserved.', 'futurebase' ),
			wp_date( 'Y' ),
			get_bloginfo( 'name' )
		)
	);
	?>
</p>
<!-- /wp:paragraph -->
