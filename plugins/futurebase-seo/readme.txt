=== Futurebase SEO ===
Contributors: kicobi
Requires at least: 6.9
Tested up to: 6.9
Requires PHP: 8.3
Stable tag: 0.6.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A private, client-owned SEO companion for promoted projects.

== Description ==

Provides privacy-safe metadata, social previews, canonicals, robots directives,
native sitemap policy, and factual schema when Yoast or Rank Math is not active.
Settings → SEO owns site entity, social-default, search-verification, and
per-object archive-policy settings, while the block editor document sidebar
exposes revisioned per-page controls. Non-secret WP-CLI diagnostics explain each
URL's indexing decision. Dry-run-first `wp compseo purge` removes only the
current site's owned option and metadata after explicit confirmation.

== Changelog ==

= 0.6.1 =
* Prevent noindex documents from emitting external or different-path canonicals.
* Make promotion/runtime fixtures identity-independent and harden review-only sync classification.
* Freeze the permanent extension contract and prove sitemap query work stays flat as page size grows.

= 0.6.0 =
* Add dry-run-first, site-scoped `wp compseo purge` cleanup with explicit backup guidance.
* Prove activation cycles, theme switching, promotion, packaging, suppression, and deterministic SEO evidence.

= 0.5.0 =
* Exclude noindex, externally canonicalized, and password-protected content from native sitemaps.
* Remove noindexed taxonomy sitemaps and the users sitemap when author archives are noindex.
* Keep sitemap filtering query-based so URL lists do not perform per-entry metadata lookups.

= 0.4.0 =
* Add per-object blog, post-type, taxonomy, author, date, and filtered archive policies.
* Add centralized canonical and robots decisions with stable reason codes.
* Add secret-free `wp compseo status` and same-origin `wp compseo decision` diagnostics.
* Retain inactive object policies so temporary plugin changes cannot reset indexing choices.

= 0.3.0 =
* Add block-editor controls and schema-versioned site SEO settings.
* Add Google and Bing verification output on the canonical homepage.
* Keep settings visible but read-only while Yoast or Rank Math owns output.

= 0.2.0 =
* Add metadata, social, canonical, robots, schema, privacy, and suppression runtime.

= 0.1.0 =
* Add the inert companion plugin foundation.
