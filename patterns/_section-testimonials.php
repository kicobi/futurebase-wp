<?php
/**
 * Title: Section — Testimonials
 * Slug: futurebase/section-testimonials
 * Categories: featured, testimonials
 * Description: Two-column testimonial section using pullquotes with citations.
 * Keywords: testimonials, quotes, social proof
 * Viewport Width: 1280
 *
 * TODO(copy): replace starter quotes and citations with real client words.
 *
 * @package futurebase
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section">
	<!-- wp:heading {"textAlign":"center","level":2} -->
	<h2 class="wp-block-heading has-text-align-center"><?php echo esc_html__( 'What clients say', 'futurebase' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:columns {"align":"wide","style":{"spacing":{"blockGap":{"top":"var:preset|spacing|50","left":"var:preset|spacing|50"}}}} -->
	<div class="wp-block-columns alignwide">
		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:pullquote -->
			<figure class="wp-block-pullquote"><blockquote><p><?php echo esc_html__( 'A sentence or two of praise that speaks to the outcome, not the process.', 'futurebase' ); ?></p><cite><?php echo esc_html__( 'First Client, Company', 'futurebase' ); ?></cite></blockquote></figure>
			<!-- /wp:pullquote -->
		</div>
		<!-- /wp:column -->

		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:pullquote -->
			<figure class="wp-block-pullquote"><blockquote><p><?php echo esc_html__( 'Another short quote that makes the decision feel safe for the next client.', 'futurebase' ); ?></p><cite><?php echo esc_html__( 'Second Client, Company', 'futurebase' ); ?></cite></blockquote></figure>
			<!-- /wp:pullquote -->
		</div>
		<!-- /wp:column -->
	</div>
	<!-- /wp:columns -->
</div>
<!-- /wp:group -->
