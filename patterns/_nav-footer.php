<?php
/**
 * Title: Footer navigation
 * Slug: wp-starter/_nav-footer
 * Inserter: no
 * Description: Footer navigation. Its own wp_navigation post, distinct from the header's, so the two regions are separately editable.
 *
 * @package wp-starter
 */

/**
 * The footer's menu is a different menu, not a second rendering of the header's.
 * See patterns/_nav-primary.php for why this resolution has to happen in PHP,
 * and why the landmark label comes from the referenced post's title rather than
 * an `ariaLabel` attribute. The only differences here are the region slug and a
 * shorter seed list — a footer that repeats the header verbatim gives screen
 * reader users two identical landmarks to tell apart.
 */

$wp_starter_nav = get_page_by_path( 'footer-navigation', OBJECT, 'wp_navigation' );

if ( $wp_starter_nav instanceof WP_Post ) :
	?>
	<!-- wp:navigation {"ref":<?php echo (int) $wp_starter_nav->ID; ?>,"overlayMenu":"never","layout":{"type":"flex","justifyContent":"right","orientation":"horizontal"}} /-->
	<?php
else :
	?>
	<!-- wp:navigation {"overlayMenu":"never","layout":{"type":"flex","justifyContent":"right","orientation":"horizontal"}} -->
		<!-- wp:navigation-link {"label":"<?php echo esc_attr__( 'About', 'wp-starter' ); ?>","url":"/about/"} /-->
		<!-- wp:navigation-link {"label":"<?php echo esc_attr__( 'Blog', 'wp-starter' ); ?>","url":"/blog/"} /-->
	<!-- /wp:navigation -->
	<?php
endif;
