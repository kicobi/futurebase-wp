# Lead workspace layout

`lead init "<Client>" --type <new|redesign>` creates this structure under
`~/Sites/leads/<slug>/`. It is **local-only** and **not a git repo** by default.
It holds discovery and proposal work for a project that **has not been awarded**.

```text
<slug>/
├── CLAUDE.md                     # lead-stage agent instructions (do-not-implement)
├── AGENTS.md                     # Codex parallel
├── project.yml                   # stage: lead
├── brief/
│   ├── original-brief.md         # the client's brief, verbatim
│   ├── client-responses.md       # answers to your questions
│   └── attachments/              # supplied files (mark private/ for sensitive)
├── analysis/
│   ├── requirements.md           # confirmed requirements only
│   ├── technical-review.md       # feasibility, stack, reuse from futurebase
│   ├── risks.md
│   ├── assumptions.md
│   └── open-questions.md
├── proposal/
│   ├── scope.md
│   ├── estimate.md
│   └── milestones.md
├── metrics/
│   └── proposed-success-metrics.md   # draft metrics to agree with the client
├── references/
│   └── futurebase-context.md     # generated starter summary — READ THIS FIRST
└── notes/                        # scratch; may be excluded at promotion
```

## What promotes into the active project

On `lead promote`, the dossier is copied into the new project's `.project/`
per the copy manifest (see `docs/project-lifecycle.md`): `brief/` (minus
private attachments), `analysis/`, `proposal/`, `metrics/`, and
`references/futurebase-context.md` are versioned; anything private lands in
gitignored `.project/private/`; `notes/` scratch may be excluded. The original
lead workspace is left untouched.

## Reading order for agents

1. `brief/` — the actual client brief and responses.
2. `references/futurebase-context.md` — reusable starter capabilities.
3. The real starter, **read-only**, only when verification is needed.
