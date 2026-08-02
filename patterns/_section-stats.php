<?php
/**
 * Title: Section — Stats
 * Slug: futurebase/section-stats
 * Categories: featured, columns
 * Description: Row of headline numbers with labels — proof points at a glance.
 * Keywords: stats, numbers, metrics, proof
 * Viewport Width: 1280
 *
 * TODO(copy): replace starter numbers and labels with real, defensible figures.
 *
 * @package futurebase
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","backgroundColor":"contrast-2","textColor":"base","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section has-base-color has-contrast-2-background-color has-text-color has-background">
	<!-- wp:columns {"align":"wide"} -->
	<div class="wp-block-columns alignwide">
		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:paragraph {"align":"center","fontSize":"gigantic"} -->
			<p class="has-text-align-center has-gigantic-font-size"><?php echo esc_html__( '12', 'futurebase' ); ?></p>
			<!-- /wp:paragraph -->
			<!-- wp:paragraph {"align":"center"} -->
			<p class="has-text-align-center"><?php echo esc_html__( 'Years doing this work', 'futurebase' ); ?></p>
			<!-- /wp:paragraph -->
		</div>
		<!-- /wp:column -->

		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:paragraph {"align":"center","fontSize":"gigantic"} -->
			<p class="has-text-align-center has-gigantic-font-size"><?php echo esc_html__( '90+', 'futurebase' ); ?></p>
			<!-- /wp:paragraph -->
			<!-- wp:paragraph {"align":"center"} -->
			<p class="has-text-align-center"><?php echo esc_html__( 'Projects shipped', 'futurebase' ); ?></p>
			<!-- /wp:paragraph -->
		</div>
		<!-- /wp:column -->

		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:paragraph {"align":"center","fontSize":"gigantic"} -->
			<p class="has-text-align-center has-gigantic-font-size"><?php echo esc_html__( '100%', 'futurebase' ); ?></p>
			<!-- /wp:paragraph -->
			<!-- wp:paragraph {"align":"center"} -->
			<p class="has-text-align-center"><?php echo esc_html__( 'A metric worth bragging about', 'futurebase' ); ?></p>
			<!-- /wp:paragraph -->
		</div>
		<!-- /wp:column -->
	</div>
	<!-- /wp:columns -->
</div>
<!-- /wp:group -->
