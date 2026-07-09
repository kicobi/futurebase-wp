<?php
/**
 * Title: Section — Contact
 * Slug: wp-starter/section-contact
 * Categories: featured, contact
 * Description: Contact section — heading, invitation copy, email and phone as plain links. Swap in a form plugin per project if one is scoped.
 * Keywords: contact, email, phone, reach
 * Viewport Width: 1280
 *
 * TODO(content): replace the email address and phone number with the project's real contact details.
 * TODO(copy): replace the starter invitation copy with project copy.
 *
 * @package wp-starter
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section">
	<!-- wp:heading {"textAlign":"center","level":2} -->
	<h2 class="wp-block-heading has-text-align-center"><?php echo esc_html__( 'Get in touch', 'wp-starter' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:paragraph {"align":"center"} -->
	<p class="has-text-align-center"><?php echo esc_html__( 'Tell us where the project stands and where it needs to go. We reply within one business day.', 'wp-starter' ); ?></p>
	<!-- /wp:paragraph -->

	<!-- wp:paragraph {"align":"center","fontSize":"large"} -->
	<p class="has-text-align-center has-large-font-size"><a href="mailto:hello@example.com">hello@example.com</a></p>
	<!-- /wp:paragraph -->

	<!-- wp:paragraph {"align":"center"} -->
	<p class="has-text-align-center"><a href="tel:+10000000000"><?php echo esc_html__( '+1 000 000 0000', 'wp-starter' ); ?></a></p>
	<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
