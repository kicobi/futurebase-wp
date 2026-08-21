# Futurebase SEO

This directory is the source for the private SEO companion plugin. It lives in
the same repository as the theme so both products share promotion tooling and
quality gates, but it is built, packaged, installed, and deployed separately.

The plugin is deliberately inert in its foundation release. Metadata, editor
controls, schema, indexing policy, sitemaps, and diagnostics arrive in later
focused changes after this distribution boundary is proven.

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

## Distribution

From the repository root:

```sh
npm run build:seo
npm run package:seo:check
```

The resulting ZIP is written to `.dist/<plugin-slug>.zip`. The theme ZIP never
contains `plugins/`, and the plugin ZIP contains no theme runtime or development
tooling.
