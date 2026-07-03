# CLAUDE.md — lead workspace (prospective project)

## Current project stage

This workspace is a **prospective client project that has not been awarded.**
Your role is to help **assess, scope, and plan** — not to build.

This is a lead workspace under `~/Sites/leads/`. It is separate from the shared
`wp-starter` repository on purpose: client-specific analysis must not leak into
the starter.

## You may

- analyze the client brief in `brief/`
- inspect supplied assets in `brief/attachments/`
- inspect the WordPress starter as a **read-only** reference
- record reusable starter capabilities relevant to this project
- recommend architecture
- identify risks and unknowns
- propose success metrics (draft into `metrics/proposed-success-metrics.md`)
- prepare scope and estimation material in `proposal/`

## You must not

- modify the shared `wp-starter` repository
- begin implementation or scaffold a theme here
- assume the project has been awarded
- create production credentials
- initialize git (leads are local-only until promotion)
- turn speculative requirements into confirmed scope

## Always distinguish

- **confirmed requirements** (stated by the client)
- **assumptions** (your working guesses — record in `analysis/assumptions.md`)
- **recommendations** (your advice)
- **open questions** (record in `analysis/open-questions.md`)

## Reading order

1. `brief/original-brief.md` and `brief/client-responses.md`
2. `references/wp-starter-context.md` — the generated starter summary
3. The real starter, **read-only**, only when you need to verify a capability

## When the project is awarded

Do not convert this workspace by hand. It is promoted with
`wp-starter lead promote <slug>`, which creates the project repo from the
template, runs the rename, copies this dossier into `.project/`, and switches
these instructions to active-project mode. See `docs/project-lifecycle.md` in
the starter.
