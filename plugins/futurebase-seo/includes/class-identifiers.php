<?php
/**
 * Permanent companion SEO identifiers.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Database keys and extension hooks that survive project promotion unchanged.
 */
final class Identifiers {
	public const META_TITLE           = '_compseo_title';
	public const META_DESCRIPTION     = '_compseo_description';
	public const META_NOINDEX         = '_compseo_noindex';
	public const META_CANONICAL       = '_compseo_canonical';
	public const META_SOCIAL_IMAGE_ID = '_compseo_social_image_id';
	public const OPTION_SETTINGS      = 'compseo_settings';

	public const FILTER_IS_SUPPRESSED        = 'compseo_is_suppressed';
	public const FILTER_SUPPORTED_POST_TYPES = 'compseo_supported_post_types';
	public const FILTER_DOCUMENT             = 'compseo_document';
	public const FILTER_SCHEMA_GRAPH         = 'compseo_schema_graph';
	public const FILTER_INDEXABLE_QUERY_VARS = 'compseo_indexable_query_vars';
	public const FILTER_INDEXING_DECISION    = 'compseo_indexing_decision';

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
