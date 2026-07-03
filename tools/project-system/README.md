# Project lifecycle system

Structured lifecycle for WordPress projects originating through Codeable and
direct client work: isolated lead workspaces → promotion → baseline capture →
success metrics → launch comparison → follow-up → case study.

> **Status: Phase 2.** The full lead lifecycle is **implemented**:
> `wp-starter lead init`, `lead inspect`, `lead promote`, and `lead archive`
> (with a confirmation gate, secret scanner, and checkpointed recovery). Later
> commands (`baseline`, `metrics`, `final`, `compare`, `case-study`) are
> designed but not yet built — see `ARCHITECTURE.md` → Roadmap. Canonical
> narrative: [`docs/project-lifecycle.md`](../../docs/project-lifecycle.md) and
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

**Baseline:**
```
wp-starter baseline init --type new|redesign
wp-starter baseline inspect
wp-starter baseline run [--module public|screenshots|lighthouse|axe|crawl|wordpress|hosting|analytics|journeys]
wp-starter baseline report
   flags: --config <path> --json --dry-run --non-interactive --force --run-id <id> --url <url> --page <name=url>
```

**Metrics:**
```
wp-starter metrics suggest | review | validate | baseline | client-message
wp-starter metrics survey --period 30-days
wp-starter metrics report
```

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
