<?php
/**
 * Title: Post comments
 * Slug: futurebase/_comments
 * Inserter: no
 * Description: Native comments, replies, pagination, and submission form.
 *
 * @package futurebase
 */

?>
<!-- wp:comments {"layout":{"type":"constrained"}} -->
<div class="wp-block-comments">
	<!-- wp:comments-title {"level":2} /-->
	<!-- wp:comment-template -->
		<!-- wp:group {"style":{"spacing":{"blockGap":"var:preset|spacing|30"}}} -->
		<div class="wp-block-group">
			<!-- wp:comment-author-name /-->
			<!-- wp:comment-date /-->
			<!-- wp:comment-content /-->
			<!-- wp:comment-reply-link /-->
		</div>
		<!-- /wp:group -->
	<!-- /wp:comment-template -->
	<!-- wp:comments-pagination {"layout":{"type":"flex","justifyContent":"space-between"}} -->
		<!-- wp:comments-pagination-previous /-->
		<!-- wp:comments-pagination-numbers /-->
		<!-- wp:comments-pagination-next /-->
	<!-- /wp:comments-pagination -->
	<!-- wp:post-comments-form /-->
</div>
<!-- /wp:comments -->
