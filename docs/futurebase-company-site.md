# Futurebase family and product-page integration brief

Futurebase is the house brand. Futurebase WP is its WordPress product, alongside
Futurebase Statamic and later products such as Futurebase Blocks and Futurebase
AI. Use [futurebase-wp.md](futurebase-wp.md) as the canonical narrative for the
WordPress product; this brief defines how that narrative fits into the broader
company-site architecture.

## Recommended information architecture

### Family page: Futurebase

- **Purpose:** Explain the shared product philosophy and route visitors to the
  platform or capability that fits their project.
- **Page title:** Futurebase — foundations for better digital products
- **Positioning:** A family of in-house foundations, tools, and delivery systems
  for accessible, maintainable digital work.
- **Product navigation:** Futurebase WP, Futurebase Statamic, and clearly marked
  future product slots for Blocks and AI. Do not present an unreleased product
  as available.
- **Primary CTA:** Talk to us about a project.

The family page should stay platform-neutral. Accessibility, maintainability,
performance discipline, and evidence-driven delivery are the common story;
WordPress-specific architecture belongs on the Futurebase WP page.

### Product page: Futurebase WP

- **Page title:** Futurebase WP — an accessible, maintainable WordPress foundation
- **Meta description:** Futurebase WP is our futureproof Full Site Editing foundation for accessible, maintainable WordPress websites and evidence-driven delivery.
- **Primary CTA:** Talk to us about a WordPress project.

#### Hero

**Futurebase WP**

**A futureproof base for accessible, maintainable WordPress websites.**

Futurebase WP is the in-house WordPress foundation behind our client work: a
disciplined block-theme system, a reusable section library, and a delivery
workflow that verifies quality continuously.

CTA: **Talk to us about a WordPress project.**

#### Why it matters

- **Accessible by default.** Automated accessibility checks are part of the
  build and release workflow, with manual review included in project delivery.
- **Built for performance.** A light native WordPress layer, system fonts,
  fluid typography, and explicit performance budgets keep the foundation
  honest without publishing local-only scores as marketing claims.
- **Maintainable for editors and developers.** Native blocks, curated editing,
  and design tokens reduce lock-in and keep design decisions consistent.
- **Designed for where WordPress is going.** Futurebase WP uses Full Site
  Editing, `theme.json`, patterns, and current WordPress APIs instead of a
  parallel page-builder stack.

#### How a project starts

Each awarded project receives its own private repository, theme identity, and
version history. Futurebase WP supplies the tested WordPress foundation;
Futurebase lifecycle tooling supplies the platform-neutral lead, promotion,
baseline, metrics, and synchronization workflow. The delivered theme carries
only one “Built on Futurebase WP” provenance note.

#### Evidence, not score theatre

Futurebase WP captures baselines, runs regression gates, and supports
before/after project reporting. Publish measurements only from an agreed public
test target with its methodology and date. Never present local wp-env or CI
regression numbers as public performance guarantees.

### Product page: Futurebase Statamic

Give Futurebase Statamic its own canonical product narrative and
platform-specific proof. Reuse the family principles and page architecture,
not the WordPress copy or evidence.

### Future product pages: Blocks and AI

Reserve navigation and URL structure only when useful. Publish Futurebase
Blocks and Futurebase AI pages when each offer has a concrete scope and
evidence base.

## Assets

- WordPress/theme screenshot: `screenshot.png` — 1200×900.
- OpenGraph/social image: `docs/assets/futurebase-wp-social.png` — 1200×630.
- Both assets use the Futurebase WP wordmark, canonical tagline, and a
  high-contrast charcoal, warm-white, and lime treatment.

## Editorial boundaries

- Use **Futurebase** for the family and shared lifecycle system.
- Use **Futurebase WP** for the WordPress foundation and its evidence.
- Describe Futurebase WP as an in-house foundation, not a theme-marketplace
  product or page builder.
- Do not imply that any source repository is public.
- Do not promise universal shared-hosting compatibility; the stated WordPress
  baseline is PHP 8.3+ and WordPress 6.9+.
- Keep detailed technical behavior and release notes in this repository; the
  company site should focus on client outcomes and the evidence model.
