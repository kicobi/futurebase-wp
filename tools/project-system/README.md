# Project lifecycle system (design)

Structured lifecycle for WordPress projects originating through Codeable and
direct client work: isolated lead workspaces → promotion → baseline capture →
success metrics → launch comparison → follow-up → case study.

> **Status: M0 — design only.** This directory currently ships the *design*:
> versioned schemas, workspace/agent templates, presets, an anonymized worked
> example, and a deterministic validator. **No lifecycle CLI is implemented
> yet.** The command surface below is the agreed design; commands are built in
> later phases (see `ARCHITECTURE.md` → Roadmap). The canonical narrative lives
> in [`docs/project-lifecycle.md`](../../docs/project-lifecycle.md) and
> [`docs/baseline-system.md`](../../docs/baseline-system.md).

## What's here now

```text
VERSION                 # system_version (semver) for the whole design
schemas/                # JSON Schemas — single source of truth (each carries $id + schema_version)
presets/                # meaningful presets only (others listed below as planned)
templates/lead/         # lead workspace skeleton + lead-stage agent instructions
templates/active/       # active-project overlay (managed section — does NOT replace root files)
examples/sample-redesign/  # anonymized worked example; validates against every schema
validate-design.mjs     # deterministic schema + fixture validator (the M0 check)
package.json            # devDeps for the validator only (ajv, ajv-formats, js-yaml)
```

## Validate the design

```bash
cd tools/project-system
npm install
npm run validate      # or: node validate-design.mjs
```

The validator compiles every schema and validates the worked example and every
template `project.yml`. Exit `0` = all valid.

## Design principle

> The project record (`.project/`) is the primary product. Audit tools,
> reports, screenshots, surveys, and agent workflows all read from and write to
> that record.

## CLI command surface (design — not yet implemented)

Every command supports interactive and non-interactive use, `--json` structured
output, and clear exit codes.

**Lead (meta layer — operates across projects):**
```
wp-starter lead init "Client Name" --type new|redesign [--platform codeable|direct|other]
                                    [--workspace-root <path>] [--git|--no-git]
                                    [--json] [--non-interactive]
wp-starter lead inspect  <slug>
wp-starter lead promote  <slug> [--org <o>] [--name <n>] [--dest <path>]
                                [--template <owner/repo>] [--dry-run] [--confirm]
                                [--json] [--non-interactive]
wp-starter lead archive  <slug>
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
