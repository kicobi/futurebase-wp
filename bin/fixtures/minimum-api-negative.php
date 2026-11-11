<?php
/**
 * Intentionally invalid at our supported floors. Never execute this fixture.
 *
 * PHP 8.4: https://www.php.net/manual/en/function.bcround.php
 * WordPress 7.0: https://developer.wordpress.org/reference/functions/wp_get_view_transitions_admin_css/
 */
bcround( '1.25', 1 );
wp_get_view_transitions_admin_css();
