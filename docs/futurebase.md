# Futurebase

**A futureproof base for accessible, maintainable WordPress websites.**

Futurebase is the in-house WordPress system every project here starts from. It
is not a page builder and not a theme marketplace product — it is a disciplined
block-theme foundation plus the delivery system around it, refined across real
client work and measured on every commit.

## The promise

- **Accessible.** WCAG 2.1 AA automated checks run in CI on every commit, over
  every template — desktop and mobile. Zero tolerated errors. Manual review
  (keyboard, screen reader, zoom) is part of every project's delivery.
- **Fast.** Lighthouse budgets are enforced in CI, not claimed in a slide.
  System font stacks, fluid typography, deferred scripts, no framework bloat.
- **Maintainable.** Everything an editor changes lives in WordPress itself —
  native block editing, curated to the project's own design system. No
  proprietary builder, no lock-in: when core WordPress updates, Futurebase
  sites update with it.
- **Futureproof.** Built on WordPress's own Full Site Editing architecture
  (PHP 8.3+, WordPress 6.9+), the direction core is actively investing in —
  not a parallel stack that has to chase it.

## What's inside

- **A section library, not a blank page.** 14 composable sections — hero,
  split hero, cards, features, stats, testimonials, pricing, team, logos,
  timeline, FAQ, contact, writing, CTA — each locked to the design-token
  system, so every project starts at "assemble and restyle," not "build from
  scratch."
- **One design system, any design.** Every color, size, and spacing decision
  resolves to a token. Restyling a site is a configuration change, not a
  rewrite — enforced by an automated standards verifier.
- **A demo you can poke.** One command rebuilds a complete demo site from the
  section library — the same fixture the CI scores are measured against.
- **Evidence-driven delivery.** Baseline capture before work starts,
  before/after comparison reports at the end, success metrics and
  satisfaction surveys after launch. Claims come with receipts.
- **Curated editing.** Editors see the project's own patterns and blocks —
  not the firehose of everything WordPress can insert. Fewer ways to break
  the design, faster publishing.

## The numbers

The current scorecard, its methodology, and its honesty rules (including why
CI numbers are a regression gate and published numbers come only from the
public demo site) live in [scorecard.md](scorecard.md). Raw Lighthouse and
pa11y reports are retained for every run.

## SEO stance

The theme is an SEO-ready foundation — semantic markup, clean performance —
and deliberately outputs no SEO meta itself. A first-party companion plugin
provides the fallback baseline (meta descriptions, OpenGraph, schema.org)
when no dedicated SEO plugin is installed, and steps aside for a blessed
premium SEO plugin when a project scopes one. See [seo.md](seo.md).

## How a project runs

1. **Lead** — scoping and discovery happen in an isolated workspace, never in
   the shared base.
2. **Promotion** — a won project gets its own repository from the template;
   the theme is renamed to the client's identity in one pass.
3. **Baseline** — the existing site is captured (screenshots, accessibility,
   performance, WordPress inventory) before anything changes.
4. **Build** — patterns, tokens, and templates; verified continuously by the
   same CI gates as the base.
5. **Launch and prove** — final capture, before/after comparison report,
   success metrics, post-launch surveys.

---

*Futurebase is developed by Colin Lewis. The template repository's technical
slug is `wp-starter`; client projects carry their own identity from day one.*
