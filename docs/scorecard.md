# Scorecard

Futurebase WP measures itself. Every scorecard run imports a deterministic demo <!-- futurebase-rename: keep-line -->
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
  aggregation. Search results and author archives are exempt from the SEO
  category because the companion correctly marks both `noindex` by default.
- **pa11y:** WCAG2AA, zero errors tolerated, desktop (default) and 375px
  viewports.
- **Raw reports:** every run writes `.artifacts/scorecard/<date>/`
  (Lighthouse JSON + HTML, pa11y JSON); CI uploads them as workflow
  artifacts. Nothing under `.artifacts/` is committed.

## Budgets (CI regression gate, wp-env)

| Category       | Mobile                | Desktop               |
| -------------- | --------------------- | --------------------- |
| Performance    | ≥ 93                  | ≥ 98                  |
| Accessibility  | ≥ 95                  | ≥ 95                  |
| Best practices | ≥ 90                  | ≥ 90                  |
| SEO            | 100 on indexable URLs | 100 on indexable URLs |
| pa11y WCAG2AA  | 0 errors              | 0 errors              |

First honest run (2026-07-09, wp-env, regression-gate environment — **not a
published claim**): performance 100 and accessibility 100 on every URL, both
form factors; best practices 100; SEO 91–92 (no meta descriptions — a
deliberate theme-level gap; see [seo.md](seo.md) for the decided three-layer
stance); pa11y 0 errors across all 9 URLs at both viewports.

Futurebase SEO 0.6.0 release-candidate smoke (2026-08-21, wp-env, one
Lighthouse run per URL rather than the CI median — **not a published claim**):
performance, accessibility, and best practices 100 on every measured URL;
SEO 100 on every indexable URL; pa11y 0 errors across all 9 URLs at both
viewports. Search and author archive scores are intentionally outside the SEO
budget because their default policy is `noindex`.

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
npm run scorecard -- --url=https://futurebase-wp.kicobi.com
```

Remote mode skips wp-env and the import — the fixture must already be
imported on the host (`wp site empty --uploads --yes && wp eval-file
<theme>/fixtures/import-demo.php` over SSH; `bin/demo-content.sh` refuses
non-localhost targets by design). The script verifies `/about/` exists before
spending ~50 Lighthouse runs. Artifacts land in
`.artifacts/scorecard/<date>-<host>/`.

## Sampling a production site

Scorecard measures the Futurebase demo fixture: locally as a regression gate,
or on the public demo for publishable fixture numbers. The production sampler
has a different job. It measures arbitrary public client content without
requiring or importing that fixture:

```sh
npm run lighthouse:sample -- --url=https://example.com/
# The portable form works after project-system sync, where package scripts do not merge:
node bin/lighthouse-sample.mjs --url=https://example.com/
```

The sampler runs five mobile slots and three desktop slots. It requires a
mobile median performance score of 95, every mobile score to be at least 90,
and every desktop score to be at least 98. Each evaluated slot must also have
LCP below 2500 ms, CLS below 0.02, TBT below 200 ms, and transfer below
921600 bytes (900 KiB), with no lazy-loaded LCP candidate and no WordPress
attachment downloaded at multiple responsive widths. A failed slot or a
Lighthouse runtime error gets one fresh-profile retry; an aggregate median
failure never retries. Every attempt remains in
`.artifacts/lighthouse/<timestamp>/` alongside `summary.json` and
`summary.md`.

Projects can create an optional, client-owned
`lighthouse-sample.config.json` at the repository root. The starter does not
ship this file, so project-system sync neither manages nor reports it. An
explicit `--config=<path>` selects another file. CLI options take precedence
over the selected JSON file, which takes precedence over built-in defaults.
Unknown or misspelled keys fail instead of silently weakening a gate.

The complete configuration shape is:

```json
{
  "mobileRuns": 5,
  "desktopRuns": 3,
  "retries": 1,
  "thresholds": {
    "mobileMedianPerformance": 95,
    "mobileMinimumPerformance": 90,
    "desktopMinimumPerformance": 98,
    "lcpMs": 2500,
    "cls": 0.02,
    "tbtMs": 200,
    "totalBytes": 921600
  }
}
```

Every key is optional. Run counts must be integers from 1–20; `retries` is
either `0` (strict, no retry) or `1`; performance thresholds are 0–100; and
metric/transfer limits must be positive. CLI overrides are
`--mobile-runs=<n>`, `--desktop-runs=<n>`, and `--retries=0|1`.

Only syntactically public HTTP(S) URLs are accepted. Credentials, loopback,
RFC1918 and link-local IP literals, and `.local`, `.test`, or `.internal`
hostnames are rejected without DNS resolution or an override flag.
