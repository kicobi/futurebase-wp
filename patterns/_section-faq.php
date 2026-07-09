<?php
/**
 * Title: Section — FAQ
 * Slug: wp-starter/section-faq
 * Categories: featured, text
 * Description: Frequently asked questions as expandable details blocks.
 * Keywords: faq, questions, answers, accordion
 * Viewport Width: 1280
 *
 * TODO(copy): replace starter questions and answers with project copy.
 *
 * @package wp-starter
 */

?>
<!-- wp:group {"align":"full","className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull is-style-section">
	<!-- wp:heading {"textAlign":"center","level":2} -->
	<h2 class="wp-block-heading has-text-align-center"><?php echo esc_html__( 'Frequently asked questions', 'wp-starter' ); ?></h2>
	<!-- /wp:heading -->

	<!-- wp:details -->
	<details class="wp-block-details"><summary><?php echo esc_html__( 'A question visitors actually ask?', 'wp-starter' ); ?></summary><!-- wp:paragraph -->
	<p><?php echo esc_html__( 'A direct answer in one or two sentences, written the way you would say it out loud.', 'wp-starter' ); ?></p>
	<!-- /wp:paragraph --></details>
	<!-- /wp:details -->

	<!-- wp:details -->
	<details class="wp-block-details"><summary><?php echo esc_html__( 'A second common question?', 'wp-starter' ); ?></summary><!-- wp:paragraph -->
	<p><?php echo esc_html__( 'Answer it plainly. Link to a longer page if the full answer needs more room.', 'wp-starter' ); ?></p>
	<!-- /wp:paragraph --></details>
	<!-- /wp:details -->

	<!-- wp:details -->
	<details class="wp-block-details"><summary><?php echo esc_html__( 'A third question about scope or price?', 'wp-starter' ); ?></summary><!-- wp:paragraph -->
	<p><?php echo esc_html__( 'Being specific here saves an email later. Numbers and timeframes read as honesty.', 'wp-starter' ); ?></p>
	<!-- /wp:paragraph --></details>
	<!-- /wp:details -->
</div>
<!-- /wp:group -->
