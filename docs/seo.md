# SEO stance

Decided 2026-07-09: **SEO-ready theme foundation + first-party companion SEO
fallback plugin, with blessed premium SEO plugin integration when needed.**

Three layers, strictly separated:

## 1. The theme: SEO-ready, never SEO-emitting

The theme's contribution is structural — semantic block markup, correct
heading order, clean `<title>` handling via core, performance (Core Web
Vitals are a ranking input), and WordPress's native sitemaps and robots
handling left intact.

**No persistent SEO meta output ships in the theme.** No meta descriptions,
no OpenGraph tags, no schema.org emitters in `functions.php` or templates.
SEO output must survive a theme switch, so by this repo's own architecture
rule it belongs in a plugin. This is deliberate and enforced by review — a
PR adding meta emitters to the theme is wrong by definition.

## 2. First-party fallback: the companion plugin (planned)

A small companion plugin provides the baseline every site deserves when no
dedicated SEO plugin is installed:

- meta description (from excerpt/content, editable per post)
- OpenGraph / Twitter card tags
- `schema.org` essentials (WebSite, Organization/Person, Article on posts)

It activates its output **only when no known SEO plugin is active** — it is
a fallback, not a competitor. This closes the current scorecard gap (SEO
91–92, all of it missing meta descriptions) without coupling the theme to a
third-party product.

## 3. Blessed premium integration: when a project scopes it

When a project needs editorial SEO workflows (per-page previews, redirects,
content analysis), install the blessed premium plugin (Yoast or RankMath —
documented setup + settings export per project). The companion plugin
detects it and yields entirely. The theme neither knows nor cares which
layer is emitting.

## Status

Layer 1 is the current state of the theme. Layers 2–3 are Tier 2 roadmap
work — the companion plugin does not exist yet; this document records the
decided architecture so nobody "fixes" the missing meta descriptions in the
theme in the meantime.
