<?php
/**
 * Title: Section — Logos
 * Slug: futurebase/section-logos
 * Categories: featured, gallery
 * Description: Logo strip — a row of client or partner marks. Ships with neutral theme placeholders; swap in real logo files per project.
 * Keywords: logos, clients, partners, trust
 * Viewport Width: 1280
 *
 * TODO(content): replace placeholder logos with real client/partner marks (brand marks stay theme/interface assets per docs/media-conventions.md).
 *
 * @package futurebase
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section">
	<!-- wp:heading {"textAlign":"center","level":2,"fontSize":"medium"} -->
	<h2 class="wp-block-heading has-text-align-center has-medium-font-size"><?php echo esc_html__( 'Trusted by', 'futurebase' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:group {"align":"wide","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"space-between"},"style":{"spacing":{"blockGap":"var:preset|spacing|50"}}} -->
	<div class="wp-block-group alignwide">
		<!-- wp:image {"sizeSlug":"full"} -->
		<figure class="wp-block-image size-full"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/placeholder-logo.svg' ) ); ?>" alt="<?php echo esc_attr__( 'Placeholder logo', 'futurebase' ); ?>"/></figure>
		<!-- /wp:image -->

		<!-- wp:image {"sizeSlug":"full"} -->
		<figure class="wp-block-image size-full"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/placeholder-logo.svg' ) ); ?>" alt="<?php echo esc_attr__( 'Placeholder logo', 'futurebase' ); ?>"/></figure>
		<!-- /wp:image -->

		<!-- wp:image {"sizeSlug":"full"} -->
		<figure class="wp-block-image size-full"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/placeholder-logo.svg' ) ); ?>" alt="<?php echo esc_attr__( 'Placeholder logo', 'futurebase' ); ?>"/></figure>
		<!-- /wp:image -->

		<!-- wp:image {"sizeSlug":"full"} -->
		<figure class="wp-block-image size-full"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/placeholder-logo.svg' ) ); ?>" alt="<?php echo esc_attr__( 'Placeholder logo', 'futurebase' ); ?>"/></figure>
		<!-- /wp:image -->
	</div>
	<!-- /wp:group -->
</div>
<!-- /wp:group -->
