<?php
/**
 * Title: Section — Timeline
 * Slug: wp-starter/section-timeline
 * Categories: featured, text
 * Description: Numbered process timeline — step label, step name, and one line of detail per step, separated by rules.
 * Keywords: timeline, process, steps, how it works
 * Viewport Width: 1280
 *
 * TODO(copy): replace starter step names and descriptions with the project's real process.
 *
 * @package wp-starter
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section">
	<!-- wp:heading {"textAlign":"center","level":2} -->
	<h2 class="wp-block-heading has-text-align-center"><?php echo esc_html__( 'How it works', 'wp-starter' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:group {"layout":{"type":"constrained"}} -->
	<div class="wp-block-group">
		<!-- wp:heading {"level":3,"fontSize":"small"} -->
		<h3 class="wp-block-heading has-small-font-size"><?php echo esc_html__( 'Step 1', 'wp-starter' ); ?></h3>
		<!-- /wp:heading -->
		<!-- wp:heading {"level":4} -->
		<h4 class="wp-block-heading"><?php echo esc_html__( 'Discovery', 'wp-starter' ); ?></h4>
		<!-- /wp:heading -->
		<!-- wp:paragraph -->
		<p><?php echo esc_html__( 'One line on what happens first and what the client gets out of it.', 'wp-starter' ); ?></p>
		<!-- /wp:paragraph -->

		<!-- wp:separator -->
		<hr class="wp-block-separator has-alpha-channel-opacity"/>
		<!-- /wp:separator -->

		<!-- wp:heading {"level":3,"fontSize":"small"} -->
		<h3 class="wp-block-heading has-small-font-size"><?php echo esc_html__( 'Step 2', 'wp-starter' ); ?></h3>
		<!-- /wp:heading -->
		<!-- wp:heading {"level":4} -->
		<h4 class="wp-block-heading"><?php echo esc_html__( 'Build', 'wp-starter' ); ?></h4>
		<!-- /wp:heading -->
		<!-- wp:paragraph -->
		<p><?php echo esc_html__( 'One line on the middle of the process — where the visible work happens.', 'wp-starter' ); ?></p>
		<!-- /wp:paragraph -->

		<!-- wp:separator -->
		<hr class="wp-block-separator has-alpha-channel-opacity"/>
		<!-- /wp:separator -->

		<!-- wp:heading {"level":3,"fontSize":"small"} -->
		<h3 class="wp-block-heading has-small-font-size"><?php echo esc_html__( 'Step 3', 'wp-starter' ); ?></h3>
		<!-- /wp:heading -->
		<!-- wp:heading {"level":4} -->
		<h4 class="wp-block-heading"><?php echo esc_html__( 'Launch', 'wp-starter' ); ?></h4>
		<!-- /wp:heading -->
		<!-- wp:paragraph -->
		<p><?php echo esc_html__( 'One line on hand-off — what is verified, delivered, and supported after go-live.', 'wp-starter' ); ?></p>
		<!-- /wp:paragraph -->
	</div>
	<!-- /wp:group -->
</div>
<!-- /wp:group -->
