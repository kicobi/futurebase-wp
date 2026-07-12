<?php
/**
 * Title: Section — Split Hero
 * Slug: wp-starter/section-split-hero
 * Categories: featured, banner
 * Description: Media-and-text hero — image on one side, heading, copy, and CTA on the other. Image ships as a neutral theme placeholder.
 * Keywords: hero, split, media, text, intro
 * Viewport Width: 1280
 *
 * TODO(content): replace the placeholder image with a real Media Library image, and the CTA URL (currently href="#").
 * TODO(copy): replace starter heading and copy with project copy.
 *
 * @package wp-starter
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section">
	<!-- wp:media-text {"align":"wide","mediaType":"image"} -->
	<div class="wp-block-media-text alignwide is-stacked-on-mobile">
		<figure class="wp-block-media-text__media"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/placeholder-wide.svg' ) ); ?>" alt="<?php echo esc_attr__( 'Placeholder image', 'wp-starter' ); ?>"/></figure>
		<div class="wp-block-media-text__content">
			<!-- wp:heading {"level":2} -->
			<h2 class="wp-block-heading"><?php echo esc_html__( 'A heading beside the picture', 'wp-starter' ); ?></h2>
			<!-- /wp:heading -->

			<!-- wp:paragraph -->
			<p><?php echo esc_html__( 'Two or three sentences that carry the story the image starts. Keep it concrete.', 'wp-starter' ); ?></p>
			<!-- /wp:paragraph -->

			<!-- wp:buttons -->
			<div class="wp-block-buttons">
				<!-- wp:button -->
				<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#"><?php echo esc_html__( 'Learn more', 'wp-starter' ); ?></a></div>
				<!-- /wp:button -->
			</div>
			<!-- /wp:buttons -->
		</div>
	</div>
	<!-- /wp:media-text -->
</div>
<!-- /wp:group -->
