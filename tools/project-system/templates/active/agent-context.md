# Active-project agent context

This file is the agent brief for an active client project. It is referenced by
a managed section in the repo's root `CLAUDE.md` / `AGENTS.md` — those root
files are the reusable starter contract and are **not** replaced on promotion.

## Behavior on every project task

1. Read `.project/project.yml` (config, stage, type, preset).
2. Read the confirmed brief and scope: `.project/brief/`, `.project/proposal/`.
3. Read `.project/decisions/` and any open questions.
4. Inspect baseline status under `.project/baseline/` — **never overwrite** a run.
5. Propose missing success metrics; do not invent targets without evidence.
6. Run only approved baseline/final modules.
7. Record assumptions; keep them out of measured metric values.
8. **Distinguish measured facts from observations** (`.project/observations.yml`).
9. Preserve privacy — never commit secrets; redact sensitive values in reports.
10. Update project status in `.project/project.yml` after meaningful work.
11. Re-run relevant final checks before launch.

## Confirmation gate

Outward-facing or hard-to-reverse actions (creating repos, sending client
material, promotion-like steps) require **explicit** confirmation. In
non-interactive / agent-driven runs, refuse unless an explicit confirm flag is
passed. Do not self-authorize.

## Source of truth

See `.project/PROJECT-RECORD.md` for the canonical location of config, metrics,
journeys, decisions, briefs, observations, and generated reports. Reports are
**derived** — never hand-edit them.
