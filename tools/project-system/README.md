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
> from the host project and degrades gracefully. Phase 8 has begun with
> `project tasks` (lifecycle task generation for Workledger / GitHub); the
> remaining Phase 8 items (analytics-API connectors, automated survey delivery,
> scheduled reminders, anonymized benchmarking) are future work. Canonical
> narrative:
> [`docs/project-lifecycle.md`](../../docs/project-lifecycle.md) and
> [`docs/baseline-system.md`](../../docs/baseline-system.md).

## What's here

```text
bin/futurebase.mjs      # CLI entry point
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
node bin/futurebase.mjs lead init "Acme Client" --type redesign

# report on it (or list all leads with a bare `lead`)
node bin/futurebase.mjs lead inspect acme-client

# optional: link it so `futurebase …` works from anywhere
npm link   # then: futurebase lead init "Acme Client" --type redesign
```

`lead init` creates the dossier skeleton, copies the lead-stage agent
instructions, writes a schema-valid `project.yml`, and generates
`references/futurebase-context.md` from a **read-only** inspection of the
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
✓ futurebase lead init "Client Name" --type new|redesign [--platform codeable|direct|other]
                                    [--slug <slug>] [--workspace-root <path>]
                                    [--starter-path <path>] [--git|--no-git]
                                    [--json] [--non-interactive]
✓ futurebase lead inspect  [<slug>]   # bare `lead` lists all workspaces
✓ futurebase lead promote  <slug> [--org <o>] [--name <n>] [--dest <path>]
                                [--template <owner/repo>] [--dry-run] [--confirm]
                                [--resume|--reuse-remote] [--skip-secret-scan]
                                [--json] [--non-interactive]
✓ futurebase lead archive  <slug> [--reason lost|abandoned] [--dry-run]
```

**Project record (per-project):**
```
✓ futurebase project init [--name <n>] [--slug <s>] [--type new|redesign] [--force]
✓ futurebase project inspect     # record dashboard
✓ futurebase project status      # lifecycle checklist + next step
✓ futurebase project validate    # schema + structural + secret scan (exit 6 on a leak)
✓ futurebase project tasks [--format markdown|json|github] [--launch-date <date>]
```
`tasks` generates the state-aware lifecycle task tree (spec §24) — Markdown
checklist, a JSON sync payload (project/task id, milestone, owner, due date,
measurement status — ready for Workledger or another tracker), or ready-to-run
`gh issue create` commands for the pending tasks. It never creates issues or
calls a tracker itself.
`init` retrofits a `.project/` record onto a repo not created via `lead promote`
(infers name/slug/type from package.json / style.css). `validate` schema-checks
every structured doc, enforces `privacy.allow_credentials_in_project: false`, and
secret-scans the committed record (private/credentials/auth are excluded).

**Baseline (per-project — run inside an active project):**
```
✓ futurebase baseline init [--type new|redesign] [--url <base>] [--page name=url] [--force]
✓ futurebase baseline inspect
✓ futurebase baseline run [--module crawl|screenshots|lighthouse|axe|wordpress|manual] [--url <base>] [--dry-run]
✓ futurebase baseline report [--run-id <id>]
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
✓ futurebase metrics suggest [--preset <name>] [--dry-run]   # merge preset metric drafts
✓ futurebase metrics review                                  # launch vs post-launch table
✓ futurebase metrics validate                                # schema + semantic checks
✓ futurebase metrics baseline --id <id> --value <v> [--unit <u>] [--at <when>]
✓ futurebase metrics client-message [--write]                # spec §11.1 client wording
✓ futurebase metrics survey --period baseline|30-days|90-days [--write]
✓ futurebase metrics follow-up                               # survey deltas + metric checklist
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
✓ futurebase final run [--module <m>] [--dry-run]     # same engine as baseline, → .project/final/
✓ futurebase final report [--run-id <id>]
✓ futurebase compare [--baseline-run <id>] [--final-run <id>]   # before/after, internal + client-safe
✓ futurebase project case-study                       # editable Markdown draft
```
`compare` diffs the latest baseline against the latest final run (crawl,
Lighthouse, axe, WordPress) and writes `comparison-<id>.html` (internal),
`comparison-<id>.md`, and `comparison-<id>-client.md` (plain-language, shows only
improvements + agreed measures + what's left to measure). Metrics missing on
either side are reported as "not comparable", never invented.

**Sync (per-project — reconcile with the starter):**
```
✓ futurebase sync [--ref <ref>] [--starter-path <p>] [--fetch]
                  [--only safe|deps|review] [--apply] [--confirm]
                  [--repair-provenance] [--json]
```
A promoted project shares **no git history** with the starter — the GitHub
template flow squashes to a fresh initial commit — so starter fixes cannot reach
it through merge, rebase, or cherry-pick. `sync` is that path.

Read-only until `--apply --confirm`, and it writes only by path class:

| class | paths | behaviour |
| --- | --- | --- |
| `safe` | `tools/`, `.github/workflows/`, `fixtures/`, and four scripts in `bin/` | copied verbatim — slug-free *by contract*: rename never scans `tools/`, and `bin/test-rename.sh` asserts `fixtures/` and those four scripts carry no slug literal |
| `deps` | `package.json`, `package-lock.json`, `composer.json`, `composer.lock` | dependency blocks merged (starter wins on shared entries, project additions preserved); lockfiles adopted with the project's own package name restored |
| `review` | `bin/`, `docs/`, `CLAUDE.md`, anything unclassified | reported only — these carry the theme slug, so copying them would undo the rename |
| `never` | `patterns/`, `templates/`, `parts/`, `theme.json`, `style.css`, `functions.php`, `inc/`, `src/`, `assets/`, `.project/`, `.github/workflows/scorecard.yml` | untouched and unreported — the client's work, plus workflows that test the starter itself |

> **Portability is a per-file property, not a per-directory one.** Both
> directions of this bit us:
>
> - `scorecard.yml` contains no slug, but renders the starter's demo fixture and
>   so depends on the section-library patterns in `patterns/` — never-class
>   content a client project replaces with its own. Syncing it produced a
>   workflow that failed on the next push. Starter-only workflows belong in
>   `STARTER_ONLY`.
> - `bin/demo-content.sh`, `scorecard.sh`, `smoke-render.sh` and
>   `smoke-render.php` *are* portable — they resolve the theme slug at runtime —
>   but sat in `review` with the rest of `bin/`, so starter fixes never reached
>   projects. One ran a stale `demo-content.sh` for weeks and its Scorecard had
>   never once passed. They are listed in `PORTABLE_BIN`, which `bin/test-rename.sh`
>   imports and probes directly — that assertion, not the intent behind the list,
>   is what makes the slug-free claim true. Add a file there and the rename test
>   holds it to the same standard or fails.

Staleness is decided by **content**, never by recorded provenance. A file whose
content matches some point in upstream history is merely behind and is updated;
one that matches no upstream version was edited locally and is skipped as a
conflict.

The **executable bit is part of the file**, so it is carried across with the
content: git records only `100644` or `100755`, and `sync` applies whichever the
starter has. A copy whose content already matches but whose mode does not is
reported as an `update` — three of the four `bin/` scripts are executable, and a
project that received them before mode was honoured has them present, current,
and unrunnable, which content comparison alone would call in sync forever. Lockfile adoption is refused outright when the project declares a
dependency upstream lacks, because the starter's lock cannot describe this
project and a clean install would drop that package.

`--repair-provenance` corrects a wrong `starter.template_commit` by finding the
newest upstream commit whose entire slug-free tree matches this project — it
returns nothing rather than guess. A successful `--apply` always stamps
`starter.synced_commit`, which unlike `template_commit` is written by the
command that did the work.

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

This tooling lives **in** `futurebase` deliberately: the per-project commands
(`baseline`, `metrics`, `final`, `compare`) ride into each promoted project via
the GitHub template, which is exactly where they're needed. The `lead *`
commands are the cross-project meta layer. Lead **data** always lives outside
the starter, under `~/Sites/leads/<slug>/`.

`bin/rename-theme.sh` deliberately does **not** scan `tools/` — the templates
here carry literal `futurebase` / `studiokicobi/futurebase-wp` references that are
the starter's identity, not client slugs to rewrite.
