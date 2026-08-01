# Futurebase company-site integration brief

Use [futurebase.md](futurebase.md) as the canonical product narrative. This
brief adapts that source for the company site; it does not create a second set
of product claims.

## Page metadata

- **Page title:** Futurebase — an accessible, maintainable WordPress foundation
- **Meta description:** Futurebase is our futureproof Full Site Editing foundation for accessible, maintainable WordPress websites and evidence-driven delivery.
- **Primary CTA:** Talk to us about a WordPress project.

## Recommended page structure

### Hero

**Futurebase**

**A futureproof base for accessible, maintainable WordPress websites.**

Futurebase is the in-house WordPress foundation behind our client work: a
disciplined block-theme system, a reusable section library, and a delivery
workflow that verifies quality continuously.

CTA: **Talk to us about a WordPress project.**

### Why it matters

- **Accessible by default.** Automated accessibility checks are part of the
  build and release workflow, with manual review included in project delivery.
- **Built for performance.** A light native WordPress layer, system fonts,
  fluid typography, and explicit performance budgets keep the foundation
  honest without publishing local-only scores as marketing claims.
- **Maintainable for editors and developers.** Native blocks, curated editing,
  and design tokens reduce lock-in and keep design decisions consistent.
- **Designed for where WordPress is going.** Futurebase uses Full Site Editing,
  `theme.json`, patterns, and current WordPress APIs instead of a parallel page
  builder stack.

### How a project starts

Each awarded project receives its own private repository, theme identity, and
version history. Futurebase supplies the tested foundation and lifecycle
tooling; the delivered theme is branded for the client and carries only a
single “Built on Futurebase” provenance note.

### Evidence, not score theatre

Futurebase captures baselines, runs regression gates, and supports before/after
project reporting. Publish measurements only from an agreed public test target
with its methodology and date. Never present local wp-env or CI regression
numbers as public performance guarantees.

## Assets

- WordPress/theme screenshot: `screenshot.png` — 1200×900.
- OpenGraph/social image: `docs/assets/futurebase-social.png` — 1200×630.
- Both assets use the canonical tagline and a high-contrast charcoal, warm
  white, and lime treatment.

## Editorial boundaries

- Describe Futurebase as an in-house foundation, not a theme marketplace
  product or page builder.
- Do not imply that the source repository is public.
- Do not promise universal shared-hosting compatibility; the stated baseline
  is PHP 8.3+ and WordPress 6.9+.
- Keep detailed technical behavior and release notes in this repository; the
  company page should focus on client outcomes and the evidence model.
