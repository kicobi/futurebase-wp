<?php
/**
 * Title: Section — Call to Action
 * Slug: futurebase/section-cta
 * Categories: featured, call-to-action
 * Description: Homepage closing CTA. Centered heading, supporting line, single button.
 * Keywords: cta, call to action, conversion
 * Viewport Width: 1280
 *
 * TODO(content): replace CTA URL (currently href="#") before launch.
 * TODO(copy): replace starter CTA copy ("Contact us") with project copy.
 *
 * @package futurebase
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","backgroundColor":"contrast-2","textColor":"base","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section has-base-color has-contrast-2-background-color has-text-color has-background">
	<!-- wp:heading {"textAlign":"center","level":2} -->
	<h2 class="wp-block-heading has-text-align-center"><?php echo esc_html__( 'Ready when you are', 'futurebase' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:paragraph {"align":"center"} -->
	<p class="has-text-align-center"><?php echo esc_html__( 'Short line explaining the next step.', 'futurebase' ); ?></p>
	<!-- /wp:paragraph -->

	<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
	<div class="wp-block-buttons">
		<!-- wp:button -->
		<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#"><?php echo esc_html__( 'Contact us', 'futurebase' ); ?></a></div>
		<!-- /wp:button -->
	</div>
	<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
