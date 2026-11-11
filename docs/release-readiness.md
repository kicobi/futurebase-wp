# Public-release review evidence — 2026-11-11

This report describes the upstream starter, before client customization.
Reviewed implementation: `351d900b75620139e9016f3aa814ba3a6e6917f9`, based on
`main` at `35c030d425b97eb837f95ce998d0dcb82530f1f0`.
Branch: `codex/public-release-hardening`. Nothing has been pushed or published.
The existing README rewrite and both approved PNGs were retained.

The implementation is prepared for human review. Public release still requires
the manual and remote checks listed below; this report is not a claim of
perfection, formal accessibility conformance, or production performance.

## Resolved findings

| Area | Result and regression evidence |
| --- | --- |
| Secret scanning | Quoted JSON/YAML keys and every candidate on a line are examined. Placeholders or short first values cannot hide a later credential. Diagnostics withhold values. |
| Project privacy | Init, promotion, and validation share one path policy. Nested private/auth/credentials directories are scanned. Policy-private files are excluded only when Git actually ignores them; force-added files and missing ignore rules are tested. |
| Crawling | Exact parsed origins, secret-bearing targets, administrative paths, discovered links, and every redirect are checked before requests. Persisted URL evidence is sanitized without dropping public query parameters. Deadlines cover response bodies. |
| CLI and sync | Large piped JSON flushes before termination without trailing prose. Optional dependencies participate in lock reconciliation; unsupported workspace/local/bundled arrangements refuse lock adoption. |
| Comments and search | Native comment title, template, pagination, and form blocks render empty/populated/closed/protected discussions. Empty searches provide translated recovery content and a search form. The reply heading is H2 even when the empty comments title disappears. |
| Navigation | Repair covers relevant draft/scheduled/pending statuses, uses WordPress block serialization for translated attributes, and shares the published-menu resolver. Ownership conflicts stop without mutation. |
| Saved copyright | Native paragraph bindings resolve the WordPress-timezone year and site title after saving. The editor shows edited titles read-only. Existing customized footers remain intact; replacement of old unbound paragraphs is documented. |
| Theme presentation | Browser-confirmed editor/frontend gutter mismatch is fixed by sharing the stylesheet. Navigation closes through core when its mobile opener disappears, including the 590→650→783px transition. |
| SEO | Pretty/plain archive routing, pagination, raw query-key identity, tracking removal, unrelated-post canonicals, and failed purge verification are covered by real WordPress tests. Editor/PHP canonical acceptance fixtures agree on empty fragments and other supported forms. Invalid editor input displays a warning. |
| Promotion | Rename tests snapshot current source, including uncommitted changes, instead of testing only HEAD. The copyright editor source and compiled bundle follow client identity. A compiled-bundle test runs before and after renaming. |

Lifecycle regressions live in `tools/project-system/test/hardening.test.mjs`
and `test/sync.test.mjs`. Theme/navigation/SEO runtime fixtures live in `bin/`.
Permanent SEO keys/hooks, CLI JSON fields, and client identity rules remain
stable. The new binding and `env:reset` command are documented.

## Dependency and static checks

| Check | Observed result |
| --- | --- |
| Node 22.23.4, 24.22.2, 26.13.0; npm 11.16.0 | Clean installs and valid installed dependency graphs; identical theme and companion build bytes across all three Node versions |
| Root Node regression suite | 182 passing tests on each supported Node line |
| Lifecycle Node regression suite | 210 passing tests on each supported Node line; affected sync suite rechecked after verifier additions |
| Root npm audit | Four low affected entries from one unfixed upstream `deepmerge` advisory; zero moderate/high/critical entries |
| Lifecycle npm audit | Zero advisories |
| Composer | Clean isolated install, strict manifest validation, and zero advisories |
| PHP checks | PHPCS and PHPStan level 6 pass; PHPStan targets PHP 8.3 and WordPress 6.9 stubs |
| Minimum-version canaries | Actual PHPStan rejects a PHP 8.4-only function and a WordPress 7.0-only function |
| Full verifier | Passes in an isolated current-source snapshot, including block/CPT scaffolds, lint, contracts, identity, rename, packages, and static analysis |
| Generated output | Rebuild matches committed theme and companion assets |
| Workflow and shell configuration | YAML parses; changed shell scripts pass syntax checks |

The isolated full verifier explicitly skipped its optional live-site check;
separate clean-install runtime and accessibility runs supply that evidence.
There is no standalone PHPUnit suite or TypeScript typecheck configured here;
PHP behavior is exercised through real WordPress/WP-CLI fixtures.

See [dependency policy](dependency-policy.md) for exact tooling versions,
scoped overrides, the WordPress Prettier alias, optional-peer reconciliation,
and the low-severity advisory's build-time exposure. Minimum compatibility
remains WordPress 6.9/PHP 8.3; recommended new hosting is current WordPress/PHP
8.5. `Tested up to` is 7.1, reflecting WordPress 7.1.4 runs.

## Local compatibility and artifacts

Each cell below installed both ZIPs into a separate empty WordPress database
and passed navigation, native theme rendering, the complete SEO runtime suite,
and all nine accessibility pages at desktop and mobile widths.

| WordPress | PHP 8.3.36 | PHP 8.4.27 | PHP 8.5.12 |
| --- | --- | --- | --- |
| 6.9 minimum | Pass | Pass | Pass |
| 7.1.4 current stable | Pass | Pass | Pass |

The renamed `acme-client` theme and companion ZIPs also pass installation and
runtime/accessibility checks on the minimum environment. Rename collision,
standalone identity, idempotency, and compiled editor identity checks pass.
The final reply-heading correction was rechecked on both WordPress endpoints.

The installable artifacts are `.dist/futurebase.zip` and
`.dist/futurebase-seo.zip`. Package checks exclude development code and keep
the companion outside the theme ZIP. The preserved images are valid PNGs:
`screenshot.png` at 1200×900 and the social image at 1200×630.

PHP 8.5's wp-env WP-CLI dependency emits a `cli/Colors.php` null-offset
deprecation. This is an upstream CLI warning, not a theme/frontend failure.
The fresh current-version debug log otherwise contained only the deliberate
invalid-contract notices asserted by the SEO tests.

## Browser, accessibility, and performance

Chromium 157 checks cover editor block validity, read-only copyright preview,
saved footer binding metadata, edited site titles, matching 24px editor/frontend
gutters, mobile navigation resize, Escape, focus restoration, scroll unlocking,
visible keyboard skip links, and the next focus target inside main content.
The WordPress 7.1.4 editor also confirmed the read-only copyright paragraph
and a visible, live-announced canonical warning that disappears after correcting
the input. No post was saved during that input check.
Widths from 320px through 1280px showed no horizontal overflow in the checked
views. RTL direction and reduced-motion behavior received browser smoke checks.

Pa11y checks the actual fixture URLs and expected HTTP statuses before auditing
all nine pages at 1280px and 375px. Lighthouse used three runs per page on eight
pages for both mobile and desktop. Existing performance/accessibility/best-
practice/SEO budgets passed without changes. The per-audit inspection found and
fixed the empty-discussion heading issue even though its overall score passed.
After the correction, three mobile and three desktop runs of the affected
post each scored 100 for performance, accessibility, best practices, and SEO.
The full eight-page runs had median performance 100 on every page; all other
page medians were already accessibility 100.

Search and author archives intentionally remain noindex and retain their
existing SEO-budget exception. These are local regression measurements, not
published hosting-performance claims. Raw logs, audit JSON, and Jev evaluations
are retained locally under `.artifacts/public-release/`; Lighthouse reports are
under `.artifacts/scorecard/`.

## Jev Review

Focused reviews were repeated after substantive fixes, with previous structured
evaluations supplied for comparison. Scores are contextual signals, not an
overall certification. The weakest early signals led to actual runtime,
privacy, editor, and packaging investigation rather than cosmetic score work.

| Slice | Correctness | Reliability | Test quality | Compatibility |
| --- | --- | --- | --- | --- |
| Lifecycle | 7.7 | 8.2 | 8.4 | 8.2 |
| Theme | 8 | 8 | 8.7 | 8 |
| SEO | 8.1 | 8.2 | 8.3 | 8.2 |
| Release tooling | 8.4 | 8.5 | 8.9 | 8.8 |

Release correctness moved from 7.1 to 8.4 and compatibility from 6.8 to 8.8;
theme correctness moved from 6.2 to 8.0 and lifecycle security from 7.8 to 8.2.
No meaningful regressions remained in the repeated lifecycle, theme, or release
reviews. Generic low-priority rubric signals did not justify further code changes
after inspection and runtime validation. The SEO slice's final implementation
review found no additional justified change after its runtime regressions passed.

## Before making the repository public

- Run the committed GitHub workflows on the pushed branch. The new remote
  matrix has not run for these local commits. PR gates cover both corners;
  scheduled/release/manual gates cover all six WordPress/PHP cells.
- Complete human code review and real assistive-technology checks: screen
  reader operation, browser zoom/reflow, real devices, Firefox/Safari, and a
  full RTL-language/editor pass. Automated results and direction emulation do
  not establish WCAG 2.2 AA conformance.
- Validate hosting-specific configuration and performance on the eventual demo
  host. No deployment, visibility change, push, or release was performed here.

Enabling GitHub's private vulnerability reporting when the repository becomes
public is recommended housekeeping, not a release gate. Its API returned 404
while this repository was private, so availability is not established.
[SECURITY.md](../SECURITY.md) includes a safe fallback.

Use the [review guide](full-repo-review-prompt.md) with the implementation commit
above. Client projects must repeat their own acceptance checks after changing
content, patterns, plugins, or hosting.
