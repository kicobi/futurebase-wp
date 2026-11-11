<?php
/**
 * Title: Footer navigation
 * Slug: futurebase/_nav-footer
 * Inserter: no
 * Description: Footer navigation. Its own wp_navigation post, distinct from the header's, so the two regions are separately editable.
 *
 * @package futurebase
 */

/**
 * The footer's menu is a different menu, not a second rendering of the header's.
 * See patterns/_nav-primary.php for why this resolution has to happen in PHP,
 * and why the landmark label comes from the referenced post's title rather than
 * an `ariaLabel` attribute. The only differences here are the region slug and a
 * shorter seed list — a footer that repeats the header verbatim gives screen
 * reader users two identical landmarks to tell apart.
 */

$futurebase_nav = futurebase_navigation_region_post( 'footer-navigation' );

if ( $futurebase_nav instanceof WP_Post ) :
	?>
	<!-- wp:navigation {"ref":<?php echo (int) $futurebase_nav->ID; ?>,"overlayMenu":"never","layout":{"type":"flex","justifyContent":"right","orientation":"horizontal"}} /-->
	<?php
else :
	?>
	<!-- wp:navigation {"overlayMenu":"never","layout":{"type":"flex","justifyContent":"right","orientation":"horizontal"}} -->
		<?php
		// Serialized block attributes are escaped by WordPress's block serializer.
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo futurebase_navigation_seed_content( 'footer-navigation' );
		?>
	<!-- /wp:navigation -->
	<?php
endif;
