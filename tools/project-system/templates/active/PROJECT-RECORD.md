# The `.project/` record

`.project/` is the durable, versioned context for an active project. It is the
**primary product** of the lifecycle system — audits, reports, screenshots, and
agent workflows all read from and write to it.

```text
.project/
├── project.yml           # config (stage: active) — canonical
├── agent-context.md      # active-project agent brief
├── PROJECT-RECORD.md     # this file
├── brief/                # historical brief + client responses (immutable)
├── analysis/             # discovery analysis promoted from the lead
├── proposal/             # scope, estimate, milestones (confirmed)
├── decisions/            # append-only ADR-style decisions
├── metrics/
│   ├── metrics.yml       # agreed success metrics (versioned document)
│   └── journeys.yml      # critical user journeys (versioned document)
├── observations.yml      # interpretations — separate from measured values
├── baseline/<run-id>/    # dated, immutable baseline runs (summary.json + evidence)
├── final/<run-id>/       # dated, immutable final runs
├── reports/              # DERIVED reports (never hand-edited)
├── follow-up/            # 30/90-day survey + review results
├── private/              # gitignored: private material
├── credentials/          # gitignored: never committed
└── auth/                 # gitignored: authenticated captures
```

## Canonical source of truth

| Concern | Canonical location |
|---|---|
| Project config | `.project/project.yml` |
| Success metrics | `.project/metrics/metrics.yml` |
| Critical journeys | `.project/metrics/journeys.yml` |
| Decisions | `.project/decisions/` (append-only) |
| Historical briefs / client responses | `.project/brief/` (immutable once promoted) |
| Observations | `.project/observations.yml` |
| Generated reports | `.project/reports/` (derived; never hand-edited) |
| Raw evidence (dated, immutable) | `.project/baseline/<run-id>/`, `.project/final/<run-id>/` |

Reports and comparisons are **derived** from the ledger above; the ledger is
authoritative. Never hand-edit a generated report or an evidence run — re-run
the module instead.

## Privacy

`private/`, `credentials/`, `auth/`, and any `**/raw-private/` path are
gitignored. Credentials never appear in `project.yml` or in generated reports;
they load from environment variables or gitignored local files only.
