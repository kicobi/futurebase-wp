<?php
/**
 * Title: Copyright
 * Slug: futurebase/_copyright
 * Inserter: no
 * Description: Dynamic footer copyright line. Year is computed server-side; brand name comes from the site title.
 *
 * @package futurebase
 */

?>
<!-- wp:paragraph {"fontSize":"small","metadata":{"bindings":{"content":{"source":"futurebase/copyright"}}}} -->
<p class="has-small-font-size"><?php echo esc_html( futurebase_copyright_text() ); ?></p>
<!-- /wp:paragraph -->
