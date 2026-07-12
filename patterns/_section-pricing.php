<?php
/**
 * Title: Section — Pricing
 * Slug: wp-starter/section-pricing
 * Categories: featured, call-to-action, columns
 * Description: Three-tier pricing table built from columns; each tier has a name, price, feature list, and button.
 * Keywords: pricing, plans, tiers, packages
 * Viewport Width: 1280
 *
 * TODO(content): replace tier URLs (currently href="#") before launch.
 * TODO(copy): replace starter tier names, prices, and feature lists with project copy.
 *
 * @package wp-starter
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section">
	<!-- wp:heading {"textAlign":"center","level":2} -->
	<h2 class="wp-block-heading has-text-align-center"><?php echo esc_html__( 'Pricing', 'wp-starter' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:columns {"align":"wide","style":{"spacing":{"blockGap":{"top":"var:preset|spacing|50","left":"var:preset|spacing|50"}}}} -->
	<div class="wp-block-columns alignwide">
		<!-- wp:column {"style":{"spacing":{"padding":{"top":"var:preset|spacing|50","right":"var:preset|spacing|50","bottom":"var:preset|spacing|50","left":"var:preset|spacing|50"}}},"backgroundColor":"contrast-3"} -->
		<div class="wp-block-column has-contrast-3-background-color has-background" style="padding-top:var(--wp--preset--spacing--50);padding-right:var(--wp--preset--spacing--50);padding-bottom:var(--wp--preset--spacing--50);padding-left:var(--wp--preset--spacing--50)">
			<!-- wp:heading {"level":3} -->
			<h3 class="wp-block-heading"><?php echo esc_html__( 'Starter', 'wp-starter' ); ?></h3>
			<!-- /wp:heading -->
			<!-- wp:paragraph {"fontSize":"x-large"} -->
			<p class="has-x-large-font-size"><?php echo esc_html__( '$1,900', 'wp-starter' ); ?></p>
			<!-- /wp:paragraph -->
			<!-- wp:list -->
			<ul class="wp-block-list"><!-- wp:list-item -->
			<li><?php echo esc_html__( 'What this tier includes', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --><!-- wp:list-item -->
			<li><?php echo esc_html__( 'A second included thing', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --><!-- wp:list-item -->
			<li><?php echo esc_html__( 'A third included thing', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --></ul>
			<!-- /wp:list -->
			<!-- wp:buttons -->
			<div class="wp-block-buttons">
				<!-- wp:button -->
				<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#"><?php echo esc_html__( 'Choose Starter', 'wp-starter' ); ?></a></div>
				<!-- /wp:button -->
			</div>
			<!-- /wp:buttons -->
		</div>
		<!-- /wp:column -->

		<!-- wp:column {"style":{"spacing":{"padding":{"top":"var:preset|spacing|50","right":"var:preset|spacing|50","bottom":"var:preset|spacing|50","left":"var:preset|spacing|50"}}},"backgroundColor":"contrast-2","textColor":"base"} -->
		<div class="wp-block-column has-base-color has-contrast-2-background-color has-text-color has-background" style="padding-top:var(--wp--preset--spacing--50);padding-right:var(--wp--preset--spacing--50);padding-bottom:var(--wp--preset--spacing--50);padding-left:var(--wp--preset--spacing--50)">
			<!-- wp:heading {"level":3,"textColor":"base"} -->
			<h3 class="wp-block-heading has-base-color has-text-color"><?php echo esc_html__( 'Standard', 'wp-starter' ); ?></h3>
			<!-- /wp:heading -->
			<!-- wp:paragraph {"fontSize":"x-large"} -->
			<p class="has-x-large-font-size"><?php echo esc_html__( '$4,900', 'wp-starter' ); ?></p>
			<!-- /wp:paragraph -->
			<!-- wp:list -->
			<ul class="wp-block-list"><!-- wp:list-item -->
			<li><?php echo esc_html__( 'Everything in Starter', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --><!-- wp:list-item -->
			<li><?php echo esc_html__( 'The thing most clients want', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --><!-- wp:list-item -->
			<li><?php echo esc_html__( 'Another meaningful upgrade', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --></ul>
			<!-- /wp:list -->
			<!-- wp:buttons -->
			<div class="wp-block-buttons">
				<!-- wp:button {"backgroundColor":"base","textColor":"contrast-2"} -->
				<div class="wp-block-button"><a class="wp-block-button__link has-contrast-2-color has-base-background-color has-text-color has-background wp-element-button" href="#"><?php echo esc_html__( 'Choose Standard', 'wp-starter' ); ?></a></div>
				<!-- /wp:button -->
			</div>
			<!-- /wp:buttons -->
		</div>
		<!-- /wp:column -->

		<!-- wp:column {"style":{"spacing":{"padding":{"top":"var:preset|spacing|50","right":"var:preset|spacing|50","bottom":"var:preset|spacing|50","left":"var:preset|spacing|50"}}},"backgroundColor":"contrast-3"} -->
		<div class="wp-block-column has-contrast-3-background-color has-background" style="padding-top:var(--wp--preset--spacing--50);padding-right:var(--wp--preset--spacing--50);padding-bottom:var(--wp--preset--spacing--50);padding-left:var(--wp--preset--spacing--50)">
			<!-- wp:heading {"level":3} -->
			<h3 class="wp-block-heading"><?php echo esc_html__( 'Custom', 'wp-starter' ); ?></h3>
			<!-- /wp:heading -->
			<!-- wp:paragraph {"fontSize":"x-large"} -->
			<p class="has-x-large-font-size"><?php echo esc_html__( 'Let’s talk', 'wp-starter' ); ?></p>
			<!-- /wp:paragraph -->
			<!-- wp:list -->
			<ul class="wp-block-list"><!-- wp:list-item -->
			<li><?php echo esc_html__( 'Everything in Standard', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --><!-- wp:list-item -->
			<li><?php echo esc_html__( 'Scoped to the project', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --><!-- wp:list-item -->
			<li><?php echo esc_html__( 'Ongoing care available', 'wp-starter' ); ?></li>
			<!-- /wp:list-item --></ul>
			<!-- /wp:list -->
			<!-- wp:buttons -->
			<div class="wp-block-buttons">
				<!-- wp:button -->
				<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#"><?php echo esc_html__( 'Get a quote', 'wp-starter' ); ?></a></div>
				<!-- /wp:button -->
			</div>
			<!-- /wp:buttons -->
		</div>
		<!-- /wp:column -->
	</div>
	<!-- /wp:columns -->
</div>
<!-- /wp:group -->
