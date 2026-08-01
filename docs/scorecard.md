# Scorecard

Futurebase WP measures itself. Every scorecard run imports a deterministic demo
fixture, then audits one URL per shipped template family with Lighthouse
(mobile + desktop) and pa11y (WCAG 2.1 AA, desktop + mobile viewports).

## The honesty rules

1. **No published number without an enforced budget.** The thresholds below
   live in `lighthouserc-mobile.json` / `lighthouserc-desktop.json` and fail
   CI when breached.
2. **Environment is always stated.** Numbers from CI run against wp-env on a
   runner — no real network or hosting — and are a **regression gate only**.
   Published marketing numbers must come from the public demo site, measured
   with this same harness and page set.
3. **Automated checks are not certification.** Automated tooling covers
   roughly 40% of WCAG success criteria. Manual review (keyboard, screen
   reader, zoom) is part of per-project delivery, not this badge.

## Methodology

- **Fixture:** `npm run demo:import -- --force` resets the site
  (`wp site empty`) and rebuilds it from the section patterns
  (`fixtures/import-demo.php`), so every run measures the same content.
- **Page set (one per template family):** front page, `/about/` (page),
  `/services/` (page-notitle), `/blog/` (index), one single post, one
  category archive, one author archive, `/?s=demo` (search), and a 404 URL
  (pa11y only — Lighthouse is unreliable on non-200 responses).
- **Lighthouse:** `@lhci/cli`, 3 runs per URL per form factor, median
  aggregation. Search results are exempt from the SEO category — WordPress
  correctly marks them `noindex`.
- **pa11y:** WCAG2AA, zero errors tolerated, desktop (default) and 375px
  viewports.
- **Raw reports:** every run writes `.artifacts/scorecard/<date>/`
  (Lighthouse JSON + HTML, pa11y JSON); CI uploads them as workflow
  artifacts. Nothing under `.artifacts/` is committed.

## Budgets (CI regression gate, wp-env)

| Category       | Mobile | Desktop |
| -------------- | ------ | ------- |
| Performance    | ≥ 93   | ≥ 98    |
| Accessibility  | ≥ 95   | ≥ 95    |
| Best practices | ≥ 90   | ≥ 90    |
| SEO            | ≥ 90   | ≥ 90    |
| pa11y WCAG2AA  | 0 errors | 0 errors |

First honest run (2026-07-09, wp-env, regression-gate environment — **not a
published claim**): performance 100 and accessibility 100 on every URL, both
form factors; best practices 100; SEO 91–92 (no meta descriptions — a
deliberate theme-level gap; see [seo.md](seo.md) for the decided three-layer
stance); pa11y 0 errors across all 9 URLs at both viewports.

## Running it

```sh
npm run env:start
npm run scorecard -- --force   # imports demo content (destructive), then audits
```

`LHCI_RUNS=1 npm run scorecard -- --force` is a faster local smoke run.
CI runs `.github/workflows/scorecard.yml` on pushes to main, nightly, release
tags, and PRs labeled `scorecard`.

**Measuring the public demo site (the publishable numbers):**

```sh
npm run scorecard -- --url=https://<demo-host>
```

Remote mode skips wp-env and the import — the fixture must already be
imported on the host (`wp site empty --uploads --yes && wp eval-file
<theme>/fixtures/import-demo.php` over SSH; `bin/demo-content.sh` refuses
non-localhost targets by design). The script verifies `/about/` exists before
spending ~50 Lighthouse runs. Artifacts land in
`.artifacts/scorecard/<date>-<host>/`.
