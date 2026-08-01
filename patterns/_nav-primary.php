<?php
/**
 * Title: Primary navigation
 * Slug: futurebase/_nav-primary
 * Inserter: no
 * Description: Header navigation. Resolves the region's own wp_navigation post when one exists, and seeds explicit links when it does not.
 *
 * @package futurebase
 */

/**
 * Why this is a pattern and not markup in parts/header.html.
 *
 * Two things needed server-side logic, and template parts are static HTML.
 *
 * 1. One menu per region. A bare `wp:navigation` with no `ref` makes core pick
 *    the most recent wp_navigation post, so the header and the footer resolved
 *    to the SAME menu — editing one silently changed the other. Resolving a
 *    region-specific post by slug and emitting its id is the only way to bind
 *    a region to its own menu from a theme that cannot know the id in advance.
 *
 * 2. No `core/page-list`. When nothing is referenced, core falls back to a page
 *    list, which renders `<ul class="wp-block-page-list">` DIRECTLY inside the
 *    navigation's own `<ul>` — a list containing a list with no `<li>` between
 *    them, which axe reports as a serious violation. Every fresh install hit
 *    it, because a fresh install is exactly the state with no menu yet. Seeding
 *    explicit navigation-links keeps core off that path.
 *
 * Note what is NOT set here: `ariaLabel`. On WP 6.9 that attribute is applied
 * twice — once through the block support and once through the wrapper
 * attributes — so the landmark renders `aria-label="Primary Primary"`. With a
 * `ref`, core labels the landmark from the referenced post's TITLE instead, and
 * says it once. That is why the menus are seeded with real titles in
 * functions.php rather than labelled here.
 */

$futurebase_nav = get_page_by_path( 'primary-navigation', OBJECT, 'wp_navigation' );

if ( $futurebase_nav instanceof WP_Post ) :
	?>
	<!-- wp:navigation {"ref":<?php echo (int) $futurebase_nav->ID; ?>,"overlayMenu":"mobile","layout":{"type":"flex","justifyContent":"right","orientation":"horizontal","flexWrap":"wrap"}} /-->
	<?php
else :
	?>
	<!-- wp:navigation {"overlayMenu":"mobile","layout":{"type":"flex","justifyContent":"right","orientation":"horizontal","flexWrap":"wrap"}} -->
		<?php // home_url(), not a bare path: "/about/" is relative to the domain, so a subdirectory install linked outside itself. ?>
		<!-- wp:navigation-link {"label":"<?php echo esc_attr__( 'About', 'futurebase' ); ?>","url":"<?php echo esc_url( home_url( '/about/' ) ); ?>"} /-->
		<!-- wp:navigation-link {"label":"<?php echo esc_attr__( 'Services', 'futurebase' ); ?>","url":"<?php echo esc_url( home_url( '/services/' ) ); ?>"} /-->
		<!-- wp:navigation-link {"label":"<?php echo esc_attr__( 'Blog', 'futurebase' ); ?>","url":"<?php echo esc_url( home_url( '/blog/' ) ); ?>"} /-->
	<!-- /wp:navigation -->
	<?php
endif;
