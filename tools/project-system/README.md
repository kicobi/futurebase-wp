# Project lifecycle system

Structured lifecycle for WordPress projects originating through Codeable and
direct client work: isolated lead workspaces → promotion → baseline capture →
success metrics → launch comparison → follow-up → case study.

> **Status: Phase 4.** Implemented: the full lead lifecycle
> (`lead init/inspect/promote/archive`), the baseline MVP
> (`baseline init/run/inspect/report`), and the success-metrics engine
> (`metrics suggest/review/validate/baseline/client-message`). The baseline runs
> `crawl` (fetch), `screenshots` (Playwright), `lighthouse`, `axe` (axe-core),
> and `manual` into dated, immutable runs with an HTML report; browser tooling is
> resolved from the host project's `node_modules` and degrades gracefully.
> Metrics are preset-driven, launch/post-launch aware, and generate a
> client-facing success message. Later commands (`final`, `compare`,
> `case-study`, `metrics survey`) are designed but not yet built — see
> `ARCHITECTURE.md` → Roadmap. Canonical narrative:
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

**Project (per-project — run inside an active project):**
```
wp-starter project init | inspect | status | validate
```

**Baseline (per-project — run inside an active project):**
```
✓ wp-starter baseline init [--type new|redesign] [--url <base>] [--page name=url] [--force]
✓ wp-starter baseline inspect
✓ wp-starter baseline run [--module crawl|screenshots|lighthouse|axe|manual] [--url <base>] [--dry-run]
✓ wp-starter baseline report [--run-id <id>]
   flags: --project-root <path> --json
```
Runs write dated, immutable evidence under `.project/baseline/<run-id>/`
(`summary.json` + per-module evidence) plus an HTML report in `.project/reports/`.
`crawl` uses built-in `fetch`; `screenshots`/`axe` use Playwright + axe-core;
`lighthouse` spawns the Lighthouse CLI pointed at Playwright's Chromium. Any
module whose tooling is absent reports `unavailable` without failing the run.

**Metrics (per-project):**
```
✓ wp-starter metrics suggest [--preset <name>] [--dry-run]   # merge preset metric drafts
✓ wp-starter metrics review                                  # launch vs post-launch table
✓ wp-starter metrics validate                                # schema + semantic checks
✓ wp-starter metrics baseline --id <id> --value <v> [--unit <u>] [--at <when>]
✓ wp-starter metrics client-message [--write]                # spec §11.1 client wording
  wp-starter metrics survey --period 30-days                 # Phase 7
```
Metrics live in `.project/metrics/metrics.yml` (versioned document). Suggestions
expand preset entries into schema-valid drafts with category-driven defaults for
evidence type, owner, target, and timing; `suggest` is idempotent (matched by id).

**Final / comparison:**
```
wp-starter final run | report
wp-starter compare
wp-starter project case-study
```

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
