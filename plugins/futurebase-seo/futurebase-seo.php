<?php
/**
 * Plugin Name:       Futurebase SEO
 * Description:       A private, client-owned SEO companion for promoted projects.
 * Version:           0.5.0
 * Requires at least: 6.9
 * Requires PHP:      8.3
 * Author:            Kicobi
 * Author URI:        https://kicobi.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       futurebase-seo
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FUTUREBASE_SEO_VERSION', '0.5.0' );
define( 'FUTUREBASE_SEO_FILE', __FILE__ );
define( 'FUTUREBASE_SEO_BUILD_HANDLE', 'futurebase-seo-editor' );

require_once __DIR__ . '/includes/class-identifiers.php';
require_once __DIR__ . '/includes/class-url.php';
require_once __DIR__ . '/includes/class-contracts.php';
require_once __DIR__ . '/includes/class-suppression.php';
require_once __DIR__ . '/includes/class-policy.php';
require_once __DIR__ . '/includes/class-settings.php';
require_once __DIR__ . '/includes/class-admin.php';
require_once __DIR__ . '/includes/class-editor.php';
require_once __DIR__ . '/includes/class-verification.php';
require_once __DIR__ . '/includes/class-context.php';
require_once __DIR__ . '/includes/class-metadata.php';
require_once __DIR__ . '/includes/class-canonical.php';
require_once __DIR__ . '/includes/class-decision.php';
require_once __DIR__ . '/includes/class-document.php';
require_once __DIR__ . '/includes/class-robots.php';
require_once __DIR__ . '/includes/class-sitemaps.php';
require_once __DIR__ . '/includes/class-schema.php';
require_once __DIR__ . '/includes/class-output.php';
require_once __DIR__ . '/includes/class-cli.php';
require_once __DIR__ . '/includes/class-plugin.php';

Plugin::register();
