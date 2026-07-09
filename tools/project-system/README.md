# Project lifecycle system

Structured lifecycle for WordPress projects originating through Codeable and
direct client work: isolated lead workspaces → promotion → baseline capture →
success metrics → launch comparison → follow-up → case study.

> **Status: Phases 1–7 complete (MVP).** The full lifecycle is implemented:
> lead workspaces (`lead init/inspect/promote/archive`), baseline + final capture
> (`baseline …`, `final …`) with `crawl`, `screenshots`, `lighthouse`, `axe`,
> `wordpress` (WP-CLI), and `manual` modules, the success-metrics engine
> (`metrics …`), before/after `compare`, `project case-study`, and surveys +
> follow-up (`metrics survey/follow-up`). Baseline and final share one capture
> engine so their runs diff like-for-like; browser + WP-CLI tooling is resolved
> from the host project and degrades gracefully. Remaining (out of MVP):
> Phase 8 integrations (Workledger, analytics APIs). Canonical narrative:
> [`docs/project-lifecycle.md`](../../docs/project-lifecycle.md) and
> [`docs/baseline-system.md`](../../docs/baseline-system.md).

## What's here

```text
bin/wp-starter.mjs      # CLI entry point
cli/dispatch.mjs        # command router
commands/lead/          # init, inspect (implemented)
lib/                    # yaml, slug, paths, output, validate, starter-context
schemas/                # JSON Schemas — single source of truth ($id + schema_version)
presets/                # meaningful presets only (others listed below as planned)
templates/lead/         # lead workspace skeleton + lead-stage agent instructions
templates/active/       # active-project overlay (managed section — does NOT replace root files)
examples/sample-redesign/  # anonymized worked example; validates against every schema
validate-design.mjs     # deterministic schema + fixture validator
package.json            # deps: ajv, ajv-formats, js-yaml
```

## Install & use (Phase 1)

```bash
cd tools/project-system
npm install

# create an isolated lead workspace under ~/Sites/leads/<slug>/
node bin/wp-starter.mjs lead init "Acme Client" --type redesign

# report on it (or list all leads with a bare `lead`)
node bin/wp-starter.mjs lead inspect acme-client

# optional: link it so `wp-starter …` works from anywhere
npm link   # then: wp-starter lead init "Acme Client" --type redesign
```

`lead init` creates the dossier skeleton, copies the lead-stage agent
instructions, writes a schema-valid `project.yml`, and generates
`references/wp-starter-context.md` from a **read-only** inspection of the
starter. It does **not** initialize git unless `--git` is passed, and never
touches the shared starter.

## Validate the design

```bash
node validate-design.mjs      # compiles every schema, validates fixtures + templates
```

Exit `0` = all valid.

## Design principle

> The project record (`.project/`) is the primary product. Audit tools,
> reports, screenshots, surveys, and agent workflows all read from and write to
> that record.

## CLI command surface

Every command supports interactive and non-interactive use, `--json` structured
output, and clear exit codes. **✓ = implemented; the rest are designed.**

**Lead (meta layer — operates across projects):**
```
✓ wp-starter lead init "Client Name" --type new|redesign [--platform codeable|direct|other]
                                    [--slug <slug>] [--workspace-root <path>]
                                    [--starter-path <path>] [--git|--no-git]
                                    [--json] [--non-interactive]
✓ wp-starter lead inspect  [<slug>]   # bare `lead` lists all workspaces
✓ wp-starter lead promote  <slug> [--org <o>] [--name <n>] [--dest <path>]
                                [--template <owner/repo>] [--dry-run] [--confirm]
                                [--resume] [--skip-secret-scan] [--json] [--non-interactive]
✓ wp-starter lead archive  <slug> [--reason lost|abandoned] [--dry-run]
```

**Project record (per-project):**
```
✓ wp-starter project init [--name <n>] [--slug <s>] [--type new|redesign] [--force]
✓ wp-starter project inspect     # record dashboard
✓ wp-starter project status      # lifecycle checklist + next step
✓ wp-starter project validate    # schema + structural + secret scan (exit 6 on a leak)
```
`init` retrofits a `.project/` record onto a repo not created via `lead promote`
(infers name/slug/type from package.json / style.css). `validate` schema-checks
every structured doc, enforces `privacy.allow_credentials_in_project: false`, and
secret-scans the committed record (private/credentials/auth are excluded).

**Baseline (per-project — run inside an active project):**
```
✓ wp-starter baseline init [--type new|redesign] [--url <base>] [--page name=url] [--force]
✓ wp-starter baseline inspect
✓ wp-starter baseline run [--module crawl|screenshots|lighthouse|axe|wordpress|manual] [--url <base>] [--dry-run]
✓ wp-starter baseline report [--run-id <id>]
   flags: --project-root <path> --json
```
Runs write dated, immutable evidence under `.project/baseline/<run-id>/`
(`summary.json` + per-module evidence) plus an HTML report in `.project/reports/`.
`crawl` uses built-in `fetch`; `screenshots`/`axe` use Playwright + axe-core;
`lighthouse` spawns the Lighthouse CLI pointed at Playwright's Chromium;
`wordpress` shells out to WP-CLI (`config.wordpress.cli`, e.g. `npx wp-env run
cli wp`). Any module whose tooling is absent reports `unavailable` without
failing the run.

**Metrics (per-project):**
```
✓ wp-starter metrics suggest [--preset <name>] [--dry-run]   # merge preset metric drafts
✓ wp-starter metrics review                                  # launch vs post-launch table
✓ wp-starter metrics validate                                # schema + semantic checks
✓ wp-starter metrics baseline --id <id> --value <v> [--unit <u>] [--at <when>]
✓ wp-starter metrics client-message [--write]                # spec §11.1 client wording
✓ wp-starter metrics survey --period baseline|30-days|90-days [--write]
✓ wp-starter metrics follow-up                               # survey deltas + metric checklist
```
Surveys write a human form (`survey-<p>.md`) + a results template (`survey-<p>.yml`)
into `.project/follow-up/`; fill the `.yml`, then `follow-up` computes
baseline→30/90-day satisfaction deltas, a success-metric status checklist, and
links the automated before/after comparison.
Metrics live in `.project/metrics/metrics.yml` (versioned document). Suggestions
expand preset entries into schema-valid drafts with category-driven defaults for
evidence type, owner, target, and timing; `suggest` is idempotent (matched by id).

**Final / comparison (per-project):**
```
✓ wp-starter final run [--module <m>] [--dry-run]     # same engine as baseline, → .project/final/
✓ wp-starter final report [--run-id <id>]
✓ wp-starter compare [--baseline-run <id>] [--final-run <id>]   # before/after, internal + client-safe
✓ wp-starter project case-study                       # editable Markdown draft
```
`compare` diffs the latest baseline against the latest final run (crawl,
Lighthouse, axe, WordPress) and writes `comparison-<id>.html` (internal),
`comparison-<id>.md`, and `comparison-<id>-client.md` (plain-language, shows only
improvements + agreed measures + what's left to measure). Metrics missing on
either side are reported as "not comparable", never invented.

### Exit codes
`0` success · `1` completed with warnings · `2` invalid configuration ·
`3` missing dependency · `4` permission/access failure · `5` module execution
failure · `6` privacy/safety violation.

## Presets

Shipped (meaningful content): `redesign`, `new-marketing-site`,
`catalogue-directory`.

Planned (listed here, not stubbed): `wordpress-rebuild`, `performance-rescue`,
`accessibility-remediation`, `content-migration`, `resource-library`,
`membership-site`, `catalogue`, `internal-workflow`, `maintenance-rescue`.

## Relationship to the starter

This tooling lives **in** `wp-starter` deliberately: the per-project commands
(`baseline`, `metrics`, `final`, `compare`) ride into each promoted project via
the GitHub template, which is exactly where they're needed. The `lead *`
commands are the cross-project meta layer. Lead **data** always lives outside
the starter, under `~/Sites/leads/<slug>/`.

`bin/rename-theme.sh` deliberately does **not** scan `tools/` — the templates
here carry literal `wp-starter` / `studiokicobi/wp-starter` references that are
the starter's identity, not client slugs to rewrite.
