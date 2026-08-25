# SEO stance

Decided 2026-07-09 and updated 2026-08-21: **SEO-ready theme foundation +
first-party companion SEO fallback plugin, with blessed premium SEO plugin
integration when needed.**

The three layers stay strictly separated.

## 1. The theme: SEO-ready, never SEO-emitting

The theme's contribution is structural: semantic block markup, correct heading
order, clean `<title>` handling through WordPress core, and performance. It
does not emit persistent SEO metadata or own indexing policy.

**No SEO meta output ships in the theme.** No meta descriptions, Open Graph
tags, schema.org emitters, canonical policy, or robots policy belong in
`functions.php` or theme templates. SEO output must survive a theme switch, so
it belongs in a plugin. A pull request adding those emitters to the theme is
wrong by definition.

WordPress's native sitemap system remains the base. A plugin may augment its
providers and queries, but the theme does not replace or configure it.

## 2. First-party fallback: Futurebase SEO

The separately packaged companion plugin is implemented through version
0.6.1. It provides a dependable baseline when no dedicated SEO provider is
active:

- document titles, descriptions, canonical overrides, noindex requests, and
  social images in an accessible editor sidebar;
- site identity, social defaults, and Google/Bing verification settings;
- canonical, robots, Open Graph, X/Twitter, and minimal factual schema output;
- per-object archive indexing policy with conservative handling of filtered,
  unknown, search, 404, attachment, and password-protected requests;
- native WordPress sitemap augmentation for noindex, external-canonical,
  password-protected, taxonomy-policy, and author-policy exclusions; and
- scriptable `wp compseo status` and `wp compseo decision` diagnostics with
  stable reason codes; and
- dry-run-first, site-scoped `wp compseo purge` cleanup that requires an
  explicit confirmation and never deletes content or media.

The plugin is a fallback, not a competitor. Yoast or Rank Math suppresses its
entire runtime registrar: no companion frontend output, REST metadata, editor
assets, robots behavior, schema, or sitemap filters register. Management and
diagnostics remain available so a migration can be inspected deliberately.

Promotion renames client-visible and structural identity while permanent
stored keys and extension hooks retain the neutral `compseo` prefix. The
complete behavior and compatibility contract live in the
[plugin README](../plugins/futurebase-seo/README.md).

## 3. Blessed premium integration: when a project scopes it

When a project needs editorial SEO workflows such as redirects, breadcrumbs,
snippet previews, content analysis, or multilingual/hreflang management,
install and configure Yoast or Rank Math for that project. The companion
plugin yields runtime ownership. The theme neither knows nor cares which
plugin emits the result.

## Product boundary

Version 1 is single-site only. It deliberately excludes redirects,
breadcrumbs, content analysis, snippet previews, hreflang/multilingual
support, token templates, per-term and per-user metadata, feed
`X-Robots-Tag` handling, telemetry, automatic updates, and network-wide
multisite operations.

Project-specific schema, fallbacks, and query states use the documented
`compseo_*` filters. Post types whose singular URLs should not exist are a
content-model registration decision, not SEO-plugin policy. Per-term metadata
is the only identified structural version 2 candidate, and it remains deferred
until repeated client evidence creates a real requirement. There is no
speculative feature roadmap.

## Status and evidence

The shared foundation and focused runtime phases are merged in the starter:
separate packaging and promotion, metadata output and privacy, editor and site
settings, archive policy and diagnostics, and native sitemap integration.

The 91–92 Lighthouse SEO result recorded in [scorecard.md](scorecard.md) is a
historical local regression-gate baseline from 2026-07-09, not a current
product score or public guarantee. Version 0.6.0 completed the starter release
round; version 0.6.1 hardens promotion portability, canonical coherence,
permanent contracts, and sitemap scaling evidence. The release line includes
explicit data cleanup, lifecycle acceptance fixtures, deterministic local
SEO-100 enforcement for indexable routes, and permanent documentation.
The remaining evidence action belongs downstream: capture the promoted public
demo before and after activation. A Lighthouse SEO 100 result may be published
only after that public evidence is recorded with its targets, versions, dates,
and methodology.

See [plugin-strategy.md](plugin-strategy.md) for ownership, promotion,
packaging, sync, and maintenance policy.
