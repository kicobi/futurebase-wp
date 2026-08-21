# Futurebase SEO

This directory is the source for the private SEO companion plugin. It lives in
the same repository as the theme so both products share promotion tooling and
quality gates, but it is built, packaged, installed, and deployed separately.

The plugin supplies its privacy-safe metadata and output baseline when no
blessed premium SEO provider is active. It includes a block-editor document
sidebar, schema-versioned site settings, per-object archive policy, and
scriptable diagnostics, and native WordPress sitemap integration.

## Editor and site settings

The editor sidebar exposes the complete document title, meta description,
noindex request, canonical override, and an attachment-based social image.
Title and description counters are advisory; authored values are never
truncated. The noindex control does not make content private.

Settings → SEO stores a site Person or Organization, a default social image,
public profiles, an X handle, and Google/Bing verification tokens in
`compseo_settings` schema version 2. Full recognized verification meta tags
may be pasted for convenience, but only their content token is stored. Google
output supports URL-prefix properties; domain properties should use DNS
verification. Verification tags appear only on the canonical, unpaged
homepage with no query string.

Images below 1200 × 630 pixels or without alternative text receive advisory
warnings in the editor and settings screen. Images are not resized or rejected.

Archive policy is stored separately for the blog, every public post-type
archive, every public taxonomy, author archives, date archives, and meaningful
filtered states. Blog, post-type, and taxonomy archives default to index;
author, date, and filtered states default to noindex. Saved entries survive a
temporarily unregistered post type or taxonomy, appear as “not currently
registered,” and take effect again if that object returns.

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

The settings screen remains visible but read-only during suppression so saved
values can be migrated deliberately. Saved verification values are not emitted
while another provider owns SEO output.

Authored SEO titles are complete document titles. They are emitted verbatim
without a separator or automatic site-name suffix. The 70-character title and
180-character description targets are editor guidance only; values are never
truncated at storage or output.

Archive canonicals are self-referential, including page two and later.
Tracking-only parameters are removed from the canonical. Meaningful query
states default to `noindex, follow` with a normalized self-canonical unless a
project adapter explicitly declares their query variables indexable. Search,
404, and live attachment pages are always noindex; attachment pages already
redirected by core are left untouched. Core’s `max-image-preview:large` remains
intact, `max-snippet` remains unset, and feeds receive no companion
`X-Robots-Tag` header.

## Native sitemaps

The plugin augments WordPress core sitemaps instead of registering a competing
sitemap system. Singular items are omitted when they are explicitly noindex,
carry a canonical on another origin, or have a stored post password. Same-origin
canonical overrides remain eligible. Taxonomy sitemap subtypes are omitted when
their individual archive policy is noindex, and the users provider is omitted
while author archives are noindex.

Post exclusions are applied to the provider's existing `WP_Query` as two
metadata conditions plus the posts-table password condition. The integration
does not load metadata once per sitemap entry, so query counts do not grow with
the page size. The additional metadata joins are an accepted cost at normal
client-site volumes. Projects approaching five-figure public-content counts
must benchmark sitemap generation before rollout or use the premium SEO layer.

Yoast or Rank Math suppression removes every companion sitemap filter along
with the rest of the runtime. Core or the active premium provider then owns the
complete sitemap response.

## Diagnostics

The diagnostics are registered even while frontend output is suppressed:

```sh
wp compseo status [--format=table|json]
wp compseo decision <url-or-path> [--format=table|json]
```

`decision` accepts a same-origin HTTP(S) URL or relative path, replays supported
WordPress routing in memory without a network request or writes, and reports
the request context, index/follow directives, canonical, reason code, and
suppression state. Supported URL classes are home, singular, blog/post-type/
taxonomy/author/date archives, pagination, attachments, search, filtered
queries, and 404s. Status reports only whether verification is configured; it
never exposes saved verification values. V1 is single-site only.

## Cleanup and offboarding

Deactivation, theme switching, and plugin-file removal retain all settings and
authored metadata. Data removal is an explicit maintenance operation rather
than an uninstall side effect:

```sh
wp compseo purge --format=json
wp db export before-compseo-purge.sql
wp compseo purge --yes --format=json
```

The first command is always a dry run. It reports the current site ID and URL,
the settings-option count, total metadata rows, affected-post count, and a
per-key breakdown without printing any stored values. `--yes` deletes only
`compseo_settings` and the five `_compseo_*` post-meta keys. It never deletes
posts, media, referenced attachments, or unrelated attachment metadata.

The command advises a database backup and verifies that no owned records remain
after deletion. It refuses `--network`; on multisite, target one site explicitly
with WP-CLI's global `--url` parameter. Network-wide cleanup is unsupported.

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
The WP-CLI subcommand names `status`, `decision`, and `purge` are operational
compatibility contracts as well.

### Filter signatures

-   `compseo_is_suppressed(bool $suppressed, ?string $provider): bool`
-   `compseo_supported_post_types(array $post_types): array`
-   `compseo_document(array $document, array $context): array`
-   `compseo_schema_graph(array $graph, array $context, array $document): array`
-   `compseo_indexable_query_vars(array $names): array`
-   `compseo_indexing_decision(array $decision, array $context): array`

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

Indexable query variables are safe query-variable names. The indexing decision
contains `index`, `follow`, `canonical`, and `reason`. `index` accepts `index`,
`noindex`, or `inherit`; `follow` accepts `follow`, `nofollow`, or `inherit`.
`inherit` means the plugin emits no directive and leaves core’s existing
`wp_robots` value unchanged. Canonical is `null` or a safe absolute HTTP(S)
URL. Stable reason codes are:

-   `site_private`
-   `singular_default`
-   `singular_noindex`
-   `password_protected`
-   `content_archive`
-   `author_archive`
-   `date_archive`
-   `search`
-   `not_found`
-   `attachment_live`
-   `attachment_redirected`
-   `tracking_only`
-   `filtered_query`
-   `declared_indexable_query`
-   `unknown_route`
-   `core_owned_feed`
-   `core_owned_embed`

Malformed filter output is discarded, the last valid internal value is kept,
and development environments receive `_doing_it_wrong()` without the rejected
value appearing in the message. Changing a filter name, argument order,
required payload key, or payload meaning is a breaking change.

## Project extensions and deliberate exclusions

Project-specific schema, document fallbacks, and query-state policy belong in a
small project adapter using the permanent filters above. A post type whose
singular URLs should never exist should be registered accordingly by the
content-model layer; a global per-post-type noindex switch is not a substitute
for correct registration.

V1 deliberately excludes redirects, breadcrumbs, snippet previews, content
analysis, hreflang and multilingual workflows, token templates, per-term and
per-user metadata, feed `X-Robots-Tag` handling, multisite-wide operations,
telemetry, and automatic updates. Redirects and richer editorial SEO workflows
belong to Yoast or Rank Math. Per-term metadata is the only identified
structural V2 candidate and remains deferred until repeated client evidence
creates a real requirement. External or dynamically generated social-image
URLs are also outside the attachment-ID-only document contract.

## Distribution

From the repository root:

```sh
npm run build:seo
npm run package:seo:check
```

The resulting ZIP is written to `.dist/<plugin-slug>.zip`. The theme ZIP never
contains `plugins/`, and the plugin ZIP contains no theme runtime or development
tooling.

Promotion renames the package before content exists. Install and deploy the
renamed ZIP separately from the theme, activate it, and confirm ownership with
`wp compseo status`. Activation and deactivation perform no content migrations;
theme switching leaves the active plugin and its data intact. Updates are
manual, reviewed deployments through the project repository—there is no update
server or phone-home endpoint.

When replacing the companion with Yoast or Rank Math, configure and verify the
new provider first. Suppression then makes companion settings read-only and
removes all runtime ownership. Retain the saved data for rollback until the
migration is accepted; use the explicit purge command only after a backup.

## Evidence standard

The deterministic demo scorecard activates the companion and requires a
Lighthouse SEO score of 100 on every indexable template-family URL. Search and
author archives are excluded from the SEO category because their correct
default result is `noindex`. Local wp-env and CI results are regression
evidence, not public marketing claims.

Publishable before/after claims must be captured separately on the promoted
public demo with the same page set and tooling. Record the target, date,
starter and project commits, plugin version, tool versions, and methodology;
retain raw artifacts outside git and publish only a sanitized summary.
