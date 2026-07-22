# Project lifecycle

How a client project moves from a prospective lead to an awarded, baselined,
measured, and closed-out project — and where its knowledge lives at each stage.

> **Status:** the tooling that automates this lives in
> [`tools/project-system/`](../tools/project-system/) and is **built** — the
> `wp-starter lead|baseline|metrics|final|compare|project …` commands shipped
> through Phase 8 (PRs #33–#39); see `ARCHITECTURE.md` there for the remaining
> Phase 8 backlog (analytics connectors, survey delivery, reminders).
> This document is the canonical narrative; agent instruction files link here.
>
> **Upstream of this lifecycle:** Codeable gig intake, research, and workroom
> response drafting happen in `~/Documents/Codeable` (its `CLAUDE.md` carries
> that workflow). A gig enters this system when it needs proposal-grade scoping
> — "Promote `<slug>` to a lead" over there runs `lead init` here.

## The shape

```text
Prospective lead
  → Isolated lead workspace (~/Sites/leads/<slug>/, local-only, no git)
  → Discovery, technical review, scope, proposed success metrics
  → Won  → promote into an active project (repo from template + rename + .project/)
    Lost → archive a lightweight lead dossier
  → Capture kickoff baseline
  → Implementation
  → Launch measurements and comparison
  → 30-day and optional 90-day follow-up
  → Project evidence, lessons, case-study material
```

## Where work happens (important)

- **New client planning lives in `~/Sites/leads/<slug>/`** — a structured,
  local-only lead workspace, **outside** the starter. This is the required home
  for lead-stage analysis so client-specific work never contaminates the shared
  `wp-starter` repository.
- **`/planning/` inside the starter is reserved for starter-development scratch
  only** (it is gitignored). Do not put client planning there.

## 1. Lead workspace

Created when a conversation is serious enough to need feasibility review, scope,
an estimate, risk assessment, or `wp-starter` knowledge:

```bash
wp-starter lead init "Client Name" --type redesign --platform codeable
# → ~/Sites/leads/client-name/
```

Local by default; **git is not initialized.** Structure and reading order are in
[`tools/project-system/templates/lead/SKELETON.md`](../tools/project-system/templates/lead/SKELETON.md).
Lead-stage agent rules (assess/scope only, starter is read-only, no
implementation, label facts vs assumptions vs recommendations vs questions) are
in the lead `CLAUDE.md` / `AGENTS.md` templates.

### Starter knowledge, two ways
1. **Generated summary** — `references/wp-starter-context.md`, the first thing an
   agent reads.
2. **Read-only inspection** — the real starter, only when verification is needed.
   Agents must never modify the starter from a lead workspace.

## 2. Promotion (lead → active)

When the project is awarded:

```bash
wp-starter lead promote client-name --confirm
```

Promotion **wraps the existing project-creation workflow** — it does not
introduce a second one, and reuses the underlying implementations rather than
duplicating rename/scaffold logic.

### Parameters & pre-flight
- **slug** — validated against `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` (the rename rule).
- **remote** — `studiokicobi/<name>` by default; `--org` / `--name` override.
- **dest** — `~/Sites/<name>` by default; `--dest` overrides.
- **Collision checks** — abort if the remote already exists, the local dest
  exists and is non-empty, or the slug is invalid.
- **`--dry-run`** — print the resolved remote, dest, slug, the starter template
  ref to be recorded, and the dossier copy manifest; make no changes.
- **Confirmation** — promotion creates a real GitHub repo, so it **requires
  explicit confirmation**. In `--non-interactive` / agent-driven use it refuses
  unless `--confirm` is passed. Agents must not self-authorize.

### Steps
1. **Validate** the lead workspace. Abort on error — lead untouched.
2. **Create the repo** via the existing path:
   `gh repo create studiokicobi/<name> --template studiokicobi/wp-starter --private --clone` into dest.
3. **Rename** via the existing implementation: `npm run rename -- <slug>`
   (reuses `bin/rename-theme.sh`; no reimplementation).
4. **Scaffold `.project/`** and **copy the dossier** per the manifest below.
5. **Wire agent instructions** — write `.project/agent-context.md`; the repo's
   reusable root `CLAUDE.md` / `AGENTS.md` (from the template) reference it via a
   managed `<!-- project-system:active -->` section. **Root files are not
   replaced.**
6. **Stamp** `starter.template_commit` (from the *created repo's* template
   provenance, not merely local `wp-starter` HEAD) and `promoted_at`; set
   `stage: active`.
7. **One promotion commit** in the new repo.
8. **On full success only**, update the lead's structured promotion metadata
   (`status: promoted`, `promoted_to: <remote>`). The lead workspace is **never
   deleted or moved automatically**, and is byte-for-byte unchanged until this
   step.

### Dossier copy manifest
Three classes:
- **Versioned (committed):** `brief/` (minus private attachments), `analysis/`,
  `proposal/`, `metrics/`, `references/wp-starter-context.md`, and `project.yml`
  (rewritten to `stage: active`).
- **Private (copied but gitignored):** `brief/attachments/private/**`, anything
  under `raw-private/`, credential/auth material → `.project/private/`,
  `.project/credentials/`, `.project/auth/`.
- **Excluded (not copied):** `notes/` scratch the lead marks ephemeral, OS
  cruft, `.env*`.

### Partial failure & recovery
Each step is checkpointed; the lead is unchanged until step 8.
- *Remote creation fails* → stop; nothing else runs.
- *Clone fails* → offer to delete the just-created remote or leave for manual
  retry; do not proceed.
- *Rename fails* → local project left for inspection; re-run `npm run rename` or
  discard; lead untouched.
- *Dossier copy fails* → partial `.project/` flagged; copy is idempotent, safe to
  re-run, or discard the project dir.
- *Commit fails* → project on disk, uncommitted; re-run the commit step. Lead
  metadata is still not updated (step 8 gates on commit success).

`lead promote` is designed to resume idempotently from the last good checkpoint.

## 3. Archive (lead → lost/abandoned)

```bash
wp-starter lead archive client-name
```

Preserves useful knowledge (brief, responses, analysis, estimate, scope, metric
suggestions, lessons) without dependencies or an implementation scaffold.

## 4. Active project

An active project's durable context is `.project/`. Its layout and the canonical
source-of-truth map are documented in
[`tools/project-system/templates/active/PROJECT-RECORD.md`](../tools/project-system/templates/active/PROJECT-RECORD.md).
Baseline, metrics, reports, and follow-up are covered in
[`docs/baseline-system.md`](baseline-system.md).

At kickoff the client receives a **Content Workbook** — the structured surface
where all launch content is prepared, reviewed and approved before
implementation. Masters live in
[`tools/project-system/templates/workbook/`](../tools/project-system/templates/workbook/);
process and rationale in [`docs/process/content-workbook.md`](process/content-workbook.md).

Reports and comparisons are **derived** from the project record; the record is
authoritative. Baseline and final runs are dated and immutable — never overwrite
a run.
