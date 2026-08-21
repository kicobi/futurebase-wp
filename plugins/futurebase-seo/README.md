# Futurebase SEO

This directory is the source for the private SEO companion plugin. It lives in
the same repository as the theme so both products share promotion tooling and
quality gates, but it is built, packaged, installed, and deployed separately.

The plugin now supplies its privacy-safe metadata and output baseline when no
blessed premium SEO provider is active. Editor controls, site settings,
archive policy, sitemaps, and diagnostics arrive in later focused changes.

## Output baseline

The runtime registers revisioned REST metadata for posts, pages, and public
post types, then resolves document titles and descriptions at render time. It
emits canonical links where WordPress core does not, Open Graph and X/Twitter
metadata, and a minimal factual schema graph.

Password-protected posts are decided from their stored password, never from a
visitor cookie. Their excerpt, content, featured image, and Article schema are
not exposed through metadata. Deliberately authored SEO fields remain public,
because metadata in the document head is public by definition.

Yoast (`WPSEO_VERSION`) and Rank Math (`RANK_MATH_VERSION`) suppress the entire
runtime registrar. While suppressed, the companion registers no REST metadata,
frontend output, robots behavior, schema, or editor assets.

Authored SEO titles are complete document titles. They are emitted verbatim
without a separator or automatic site-name suffix. The 70-character title and
180-character description targets are editor guidance only; values are never
truncated at storage or output.

## Permanent identity

`compseo` means “companion SEO.” It is a neutral, permanent owner prefix for
database keys and PHP extension hooks. Promotion changes visible and structural
identity—directory, bootstrap filename, plugin name, namespace, text domain,
constants, and asset handles—but never changes:

-   `_compseo_title`
-   `_compseo_description`
-   `_compseo_noindex`
-   `_compseo_canonical`
-   `_compseo_social_image_id`
-   `compseo_settings`
-   `compseo_is_suppressed`
-   `compseo_supported_post_types`
-   `compseo_document`
-   `compseo_schema_graph`
-   `compseo_indexable_query_vars`
-   `compseo_indexing_decision`

Those identifiers are a compatibility contract. Keeping them independent of a
client slug prevents migrations during promotion and makes carefully reviewed
project adapters portable between the starter and a promoted project.

### Filter signatures

-   `compseo_is_suppressed(bool $suppressed, ?string $provider): bool`
-   `compseo_supported_post_types(array $post_types): array`
-   `compseo_document(array $document, array $context): array`
-   `compseo_schema_graph(array $graph, array $context, array $document): array`

The suppression provider is `yoast`, `rank_math`, or `null`. Supported post
types must be registered public post-type slugs. The shared context contains
`url`, `kind`, `object_id`, `post_type`, `taxonomy`, `paged`, `query_args`, and
`password_protected`.

The document payload contains `title`, `description`, `canonical`, and
`social_image_id`. Its title is the complete document title, canonical is
`null` or an absolute HTTP(S) URL without userinfo or a fragment, and social
images are WordPress image-attachment IDs only. The schema graph is a list of
schema node arrays. Document changes control the real title and canonical tags
as well as social and schema output.

Malformed filter output is discarded, the last valid internal value is kept,
and development environments receive `_doing_it_wrong()` without the rejected
value appearing in the message. Changing a filter name, argument order,
required payload key, or payload meaning is a breaking change.

## Distribution

From the repository root:

```sh
npm run build:seo
npm run package:seo:check
```

The resulting ZIP is written to `.dist/<plugin-slug>.zip`. The theme ZIP never
contains `plugins/`, and the plugin ZIP contains no theme runtime or development
tooling.
