# Baseline, metrics & reports

The evidence layer of the [project lifecycle](project-lifecycle.md): what state a
project starts in, how success is defined and agreed, and how before/after is
compared honestly.

> **Status:** implemented. This began as the M0 schema-level design and the
> runners it anticipated now exist — see
> [`tools/project-system/modules/`](../tools/project-system/modules/) for the
> Lighthouse, axe, crawl, screenshot and WP-CLI modules, and `baseline run` /
> `final run` / `compare` for the commands that drive them. Schemas remain the
> contract, under
> [`tools/project-system/schemas/`](../tools/project-system/schemas/).
>
> This document describes the *design* — data shapes, module statuses, and the
> phasing rules below. For what is actually built and shipping, the
> [project-system README](../tools/project-system/README.md) is the single
> authority; do not restate implementation status here or the two will drift
> apart again.

## Baseline is phased and incremental

Access arrives gradually, so baseline collection never requires all modules to
succeed. Phases: **public → wordpress → hosting → analytics → manual → client
confirmation.** Each module reports one of: `complete`, `complete_with_warnings`,
`pending`, `skipped`, `unavailable`, `failed`. A partial run still produces a
useful report.

Two modes (from `project.type` / `baseline.mode`):
- **Redesign** — capture a reproducible snapshot of the existing system
  (screenshots, Lighthouse, axe, crawl, WordPress inventory, manual notes).
- **New site** — capture the starting *business* state: existing presence,
  current operational process, content readiness, audience/objectives, and what
  will become measurable after launch.

### Public baseline (no credentials)
Performance (Lighthouse + concrete values: page weight, requests, JS/CSS/image
weight, LCP/CLS/INP/TTFB, cache/compression/HTTP version), accessibility (axe by
severity + manual keyboard/focus/zoom/reflow checks — never presented as
certification), systematic screenshots with metadata + gallery, crawl/content
structure, SEO/discoverability inventory, non-invasive security/infra signals,
and functional checks for project-critical journeys.

### WordPress baseline (requires access)
Core/PHP/DB versions, theme + plugins (active/inactive/mu), pending updates,
CPTs/taxonomies/content counts, blocks/patterns/ACF groups, shortcodes and
page-builder markers, cron/scheduled actions, custom tables/roles, caching,
SMTP, backups, debug config, sizes. Redact sensitive values. Reuse the
`perf_inspect.mjs` pattern from `.claude/skills/wp-performance/scripts/`.

### Hosting / analytics / manual baselines
Hosting and analytics are captured where access permits, each as an explicitly
dated, sourced snapshot. The **manual baseline** records what automation can't:
frustrations, fragile workflows, ownership gaps, and the editorial-workflow
timing of real tasks (add a team member, publish an event, update a catalogue
entry) — task, person, start/finish, steps, assistance, errors, difficulty.

## Success metrics

Every project explicitly asks: **"How will we know this project has been
successful?"** The system then *suggests* metrics by preset rather than leaving
the client to define them alone. Metrics are stored as a versioned document
(`schemas/metrics.schema.json`).

Each metric declares:
- **category** — `delivery` (built correctly), `outcome` (situation improved),
  or `satisfaction` (what analytics can't capture).
- **evidence_type** — `automated`, `analytics`, `timed_task`, `survey`,
  `client_reported`, `manual_observation`, `business_data`, `system_log`. This
  stops subjective findings being shown as precise measurements.
- **owner** — `developer`, `client`, `shared`, `automated`, `third_party`
  (without ownership, post-launch measurement is forgotten).
- **baseline.status** — `measured`, `estimated_by_client`, `inferred`,
  `unavailable`, `not_applicable`, or `establish_after_launch`.
- **target** — `numeric` / `pass_fail` / `directional` / `comparative` /
  `qualitative`, or `establish_baseline` when no credible target exists.
  **Targets are never invented without evidence.**
- **measure_at** — kickoff, before_development, pre_launch, launch, handoff,
  7/30/90 days, or custom. A metric may be measured more than once.

Launch metrics and post-launch metrics are kept separate. When no analytics
existed before the project, the first post-launch period may *become* the
baseline.

## Observations vs facts

Interpretations live in a separate versioned document
(`schemas/observations.schema.json`) with provenance (`created_by`,
`created_at`, `confidence`, `evidence[]`). They are **never** mixed into measured
metric values.

## Critical user journeys

A small number of meaningful, rerunnable journeys
(`schemas/journeys.schema.json`) feed baseline and final reports — e.g. submit an
enquiry, or update a catalogue entry (completion / time / assistance / errors).

## Reports

- **Internal report** — full detail: metadata, URLs, tool versions, module
  status, headline metrics, risks, technical debt, observations, assumptions,
  unavailable data, metrics, journeys, follow-up.
- **Client-safe report** — plain language, no secrets, agreed measures, what was
  captured / completed / improved / still to be measured, and anything that
  could not be compared. Authenticated pages are excluded by default.
- **Comparison** — reproducible: consistent URLs, viewports, tools, versions,
  methodology; notes changed/unmapped pages and measurement limits.
- **Case-study export** — an editable Markdown starting point, not auto-published.

Every dated run writes a `summary.json` (`schemas/baseline-run.schema.json`)
beside its raw evidence. **Runs are immutable; never overwrite one.**

New captures use baseline-run schema version 2. A module claiming `complete` or
`complete_with_warnings` must name a relative `evidence_path`; the path must
stay inside the run, contain no symlink, exist, and contain at least one regular
artifact. An invalid claimed success is converted to `failed` before overall
status is calculated. Version-1 summaries remain readable: their declared path
or historical conventional module directory is verified when present, and
missing unverifiable evidence leaves the legacy run incomplete rather than
making its old schema invalid.

Overall run status is derived from module results:

- all clean completions → `completed` (exit 0);
- any warning-bearing completion, or a mix of evidence and unavailable/skipped
  modules → `completed_with_warnings` (exit 1);
- no evidence with only pending/skipped/unavailable modules → `partial`
  (exit 1);
- all failures → `failed` (exit 5).

Any failed module prevents that run from closing the lifecycle evidence gate.
Before/after page identity uses normalized pathname plus the exact query
string; fragments are ignored. A same-host path or query change blocks
comparison unless the operator explicitly records the exception with
`--allow-mismatch`.

## Privacy

Local-only by default; leads are not git repos until promotion. Credentials
never appear in `project.yml` or reports — the strict schema helps but **cannot
alone guarantee** secret-free content, so a key/value secret scanner (Phase 2+)
gates commit/report emission. Secrets load from env or gitignored files only.
Gitignored classes: `.project/private/`, `.project/credentials/`,
`.project/auth/`, `.project/**/raw-private/`.

Capture targets are public and unauthenticated in this round. `base_url` is an
HTTP(S) origin only; page URLs may be relative and may carry ordinary public
queries such as `?lang=sv`, but userinfo and recognized credential parameters
in query, path, or fragment form are rejected. Do not put login URLs, tokens,
passwords, or session identifiers in capture configuration.
Authenticated/private capture remains out of scope; store any future
authentication material only in the gitignored credential or auth directories
above.
