# Architecture

## Principle

Separate **orchestration** from **modules**. The orchestrator owns the
lifecycle, config, run-safety, and reporting; modules are independent audit
units that read/write the project record and can fail in isolation.

## Intended layout (built in later phases)

```text
tools/project-system/
├── cli/        # arg parsing, interactive prompts, JSON output, exit codes, confirmation gate
├── commands/   # lead/ project/ baseline/ metrics/ final/ reports/
├── modules/    # screenshots/ lighthouse/ axe/ crawl/ wordpress/ hosting/ analytics/ journeys/ surveys/
├── schemas/    # single source of truth   (present now)
├── presets/    #                          (present now)
├── templates/  #                          (present now)
└── lib/        # yaml io (js-yaml), provenance stamping, redaction, run-id, latest-pointer, secret-scan
```

## Language & dependencies

- **Node 22** (repo toolchain; `.nvmrc`). ES modules.
- **YAML: `js-yaml`** — a real parser, never hand-rolled. (Note: js-yaml parses
  unquoted ISO dates as `Date`; date-typed fields are quoted strings in fixtures.)
- **Validation: `ajv` + `ajv-formats`** (draft-07).
- Later phases add Playwright (present transitively via `@wordpress/scripts`),
  Lighthouse, and axe-core. Keep additions deliberate — the repo rule is "no
  casual dependencies."

## Meta vs per-project split

- **Meta layer:** `lead init | inspect | promote | archive`. Operates across
  projects from the starter / `~/Sites/leads`.
- **Per-project layer:** `project | baseline | metrics | final | compare |
  case-study`. Runs inside an active project, which carries this tooling via the
  template.

## Versioning policy

- `VERSION` holds the design's `system_version` (semver).
- Every schema has a stable `$id` and a `schema_version` const; instance
  documents declare the `schema_version` they target, so migrations are
  detectable. `metrics`, `observations`, and `journeys` are **versioned
  document objects** (`{schema_version, kind, items[]}`), never bare arrays.

## Run safety (idempotency)

- Dated run ids: `YYYY-MM-DDTHHMMSSZ`. **Never overwrite** an existing run.
- `latest.json` pointer per run directory (not a symlink — portable).
- Partial runs are valid and marked; failed-module logs are preserved.
- Modules run independently; a baseline never requires all modules to succeed.

## Exit codes

`0` success · `1` completed with warnings · `2` invalid configuration ·
`3` missing dependency · `4` permission/access failure · `5` module execution
failure · `6` privacy/safety violation.

## Privacy (design)

- Local-only by default; leads are not git repos until promotion.
- Credentials never in `project.yml` or reports. The strict schema helps, **but
  schema alone cannot guarantee no secrets** — a `lib/secret-scan` key/value
  scanner (Phase 2+) gates commit/report emission as the real defense.
- Gitignored classes in a project: `.project/private/`, `.project/credentials/`,
  `.project/auth/`, `.project/**/raw-private/`.
- Authenticated captures are excluded from client-facing reports by default.

## Roadmap

- **M0 (done):** schemas + templates + presets + example + validator + rename
  exclusion. No lifecycle CLI.
- **Phase 1 (done):** `lead init`, templates, `wp-starter-context.md` generator,
  `lead inspect` — the CLI (`bin/`, `cli/`, `commands/lead/`, `lib/`).
- **Phase 2 (done):** `lead promote` (wrap gh + rename, confirmation gate,
  checkpointed recovery, `--resume`), `lead archive`, `.project/` scaffold,
  secret scanner (`lib/secret-scan`, `lib/proc`).
- **Phase 3 (done):** baseline MVP — `crawl` (fetch), `screenshots` (Playwright),
  `lighthouse`, `axe` (axe-core), `manual`; dated immutable runs, schema-valid
  `summary.json`, HTML/MD report; new + redesign modes. Browser tooling resolved
  from the host project (`lib/browser`) with graceful degradation.
- **Phase 4 (done):** metrics engine (`suggest`/`review`/`validate`/`baseline`/
  `client-message`) — preset-driven drafts, launch/post-launch split, semantic
  checks (`lib/metrics`).
- **Phase 5 (done):** `wordpress` WP-CLI inventory module (configurable
  invocation, graceful degradation). Timed editorial tasks / journey automation
  deferred.
- **Phase 6 (done):** shared capture engine (`commands/capture.mjs`) for
  `baseline` + `final`, before/after `compare` (`lib/compare`) with internal +
  client-safe reports, and `project case-study` export.
- **Phase 7 (done):** surveys (`metrics survey`) + follow-up report
  (`metrics follow-up`) — baseline/30/90-day scale deltas, metric checklist
  (`lib/survey`, `survey-results` schema).
- **Phase 8:** optional integrations (Workledger, analytics APIs) — out of MVP.
