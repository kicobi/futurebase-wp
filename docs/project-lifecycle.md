# Project lifecycle

How a client project moves from a prospective lead to an awarded, baselined,
measured, and closed-out project — and where its knowledge lives at each stage.

> **Status:** the tooling that automates this lives in
> [`tools/project-system/`](../tools/project-system/) and is **built** — the
> `futurebase lead|baseline|metrics|final|compare|project …` commands shipped
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
  `futurebase` repository.
- **`/planning/` inside the starter is reserved for starter-development scratch
  only** (it is gitignored). Do not put client planning there.

## 1. Lead workspace

Created when a conversation is serious enough to need feasibility review, scope,
an estimate, risk assessment, or `futurebase` knowledge:

```bash
futurebase lead init "Client Name" --type redesign --platform codeable
# → ~/Sites/leads/client-name/
```

Local by default; **git is not initialized.** Structure and reading order are in
[`tools/project-system/templates/lead/SKELETON.md`](../tools/project-system/templates/lead/SKELETON.md).
Lead-stage agent rules (assess/scope only, starter is read-only, no
implementation, label facts vs assumptions vs recommendations vs questions) are
in the lead `CLAUDE.md` / `AGENTS.md` templates.

### Starter knowledge, two ways
1. **Generated summary** — `references/futurebase-context.md`, the first thing an
   agent reads.
2. **Read-only inspection** — the real starter, only when verification is needed.
   Agents must never modify the starter from a lead workspace.

## 2. Promotion (lead → active)

When the project is awarded:

```bash
futurebase lead promote client-name --confirm
```

Promotion **wraps the existing project-creation workflow** — it does not
introduce a second one, and reuses the underlying implementations rather than
duplicating rename/scaffold logic.

### Parameters & pre-flight
- **slug** — validated against `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` (the rename rule).
- **remote** — `kicobi/<name>` by default; `--org` / `--name` override.
- **dest** — `~/Sites/<name>` by default; `--dest` overrides.
- **Collision checks** — abort if the remote already exists, the local dest
  exists and is non-empty, or the slug is invalid.
- **`--dry-run`** — print the resolved remote, dest, slug, the starter template
  ref to be recorded, and the dossier copy manifest; make no changes.
- **Confirmation** — promotion creates a real GitHub repo, so it **requires
  explicit confirmation**. In `--non-interactive` / agent-driven use it refuses
  unless `--confirm` is passed. Agents must not self-authorize.
- **Composer** — required for every real promotion, including the offline clone
  seam. Its preflight runs before any repository or destination is created.
- **npm** — required for every real promotion and checked at the same preflight
  boundary, before any repository or destination is created.

### Steps
1. **Validate** the lead workspace. Abort on error — lead untouched.
2. **Create the repo** via the existing GitHub-template path. Immediately after
   GitHub creation and before cloning, write a local recovery receipt beside
   the destination. The receipt binds the lead, destination, remote, template,
   intended template commit, repository ID/node ID, creation time, default
   branch, generated initial commit, and template repository identity.
   Clone only after that receipt is durable.
3. **Rename** via the existing implementation with the client name, `1.0.0`
   version, Theme URI, and repository identity. The same pass gives companion
   plugins client-facing identity while preserving neutral permanent stored
   keys and extension hooks.
4. **Reconcile Composer metadata** with `composer update --lock --no-install
   --no-interaction --quiet`, then require `composer validate
   --no-check-publish` to pass. The quiet update emits no untagged-package
   notice; non-quiet validation may emit the harmless notice twice.
5. **Install the nested lifecycle CLI** with `npm ci --prefix
   tools/project-system --ignore-scripts`. This lockfile-based step is named
   `project-system-deps` in recovery output and reruns safely with `--resume`.
6. **Scaffold `.project/`** and **copy the dossier** per the manifest below.
7. **Wire agent instructions** — write `.project/agent-context.md`; the repo's
   reusable root `CLAUDE.md` / `AGENTS.md` (from the template) reference it via a
   managed `<!-- project-system:active -->` section. **Root files are not
   replaced.**
8. **Stamp** `starter.template_commit` (from the *created repo's* template
   provenance, not merely local `futurebase` HEAD) and `promoted_at`; set
   `stage: active`.
9. **One promotion commit** in the new repo.
10. **On full success only**, update the lead's structured promotion metadata
   (`status: promoted`, `promoted_to: <remote>`). The lead workspace is **never
   deleted or moved automatically**, and is byte-for-byte unchanged until this
   step.

### Dossier copy manifest
Three classes:
- **Versioned (committed):** `brief/` (minus private attachments), `analysis/`,
  `proposal/`, `metrics/`, `references/futurebase-context.md`, and `project.yml`
  (rewritten to `stage: active`).
- **Private (copied but gitignored):** `brief/attachments/private/**`, anything
  under `raw-private/`, credential/auth material → `.project/private/`,
  `.project/credentials/`, `.project/auth/`.
- **Excluded (not copied):** `notes/` scratch the lead marks ephemeral, OS
  cruft, `.env*`.

### Partial failure & recovery
Each step is checkpointed; the lead is unchanged until step 10.
- *Remote creation fails* → stop; nothing else runs.
- *Remote identity/receipt creation fails* → stop; delete the incomplete remote
  before retrying. Without a complete receipt it cannot be adopted safely.
- *Clone fails* → exactly two supported choices:
  1. delete the incomplete remote and run promotion again; or
  2. retain the remote and local receipt, empty the destination, and re-run
     with `--reuse-remote`.

  `--reuse-remote` is mutually exclusive with `--resume`. It verifies the
  receipt against the live GitHub repository ID/node ID, creation data,
  template identity, default branch, initial commit, and one-commit state
  before cloning. A missing, incomplete, changed, or recreated remote is
  refused. After cloning, promotion writes the normal checkpoint inside the
  destination before removing the recovery receipt.
- *Rename fails* → local project left for inspection; re-run `npm run rename` or
  discard; lead untouched.
- *Composer reconciliation fails* → the destination checkpoint remains, the
  lead stays unchanged, and `--resume` reruns update and validation.
- *Project-system dependency installation fails* → the destination checkpoint
  remains, the lead stays unchanged, and `--resume` reruns the deterministic
  `project-system-deps` step.
- *Dossier copy fails* → partial `.project/` flagged; copy is idempotent, safe to
  re-run, or discard the project dir.
- *Commit fails* → project on disk, uncommitted; re-run the commit step. Lead
  metadata is still not updated (step 9 gates on commit success).

`lead promote --resume` is designed to resume idempotently after a destination
checkpoint exists. The distinct `--reuse-remote` path covers only the
pre-destination clone-failure window.

New checkpoints and recovery receipts use Futurebase filenames. Futurebase 2.x
also reads their legacy `.wp-starter-promotion…json` names and treats the old
and renamed template repository names as equivalent only where a recorded
pre-cutover identity is compared with its current name.

## 3. Archive (lead → lost/abandoned)

```bash
futurebase lead archive client-name
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

## 5. Staying in sync with the starter

Promotion is a **one-way copy**. `gh repo create --template` squashes to a fresh
initial commit, so an active project shares no git history with `futurebase`:
`git merge`, `rebase`, and `cherry-pick` across the two are unavailable, and a
wholesale copy would drag the starter's slug back through every renamed file.
Fixes made in the starter after promotion therefore never arrive on their own —
including dependency and vulnerability work.

Run `sync` from inside the project to close that gap:

```bash
# from the project root — read-only; prints what has drifted
node tools/project-system/bin/futurebase.mjs sync --fetch

# apply the slug-free classes once the plan looks right
node tools/project-system/bin/futurebase.mjs sync --apply --confirm
```

It writes only what the rename contract proves is slug-free (`tools/`,
`.github/workflows/`, `fixtures/`, and a bounded portable script set) plus the
dependency layer. `bin/`, `docs/`, and `plugins/` are **reported, never
written**. Plugin comparisons map the starter path onto the promoted plugin
path and remove bounded structural identity noise; genuine code drift remains
a hand-porting decision. Locally edited files are skipped rather than
clobbered.

> **Provenance caveat.** `starter.template_commit` records what promotion
> *believed* it copied. Promotions before the fix recorded the local starter
> HEAD, which could sit on an unmerged branch and so name a commit the project
> never contained. `sync` decides staleness from file content and is unaffected;
> `--repair-provenance` corrects the recorded value, and every `--apply` stamps
> an accurate `starter.synced_commit`.

If an existing project still records the checkout's old local path, repair the
metadata before planning files:

```bash
node tools/project-system/bin/wp-starter.mjs sync \
  --starter-path /Users/colin/Sites/futurebase \
  --repair-source-path
```

The old entrypoint and path flag warn but remain compatible throughout 2.x.
New work should use `futurebase.mjs` and `--futurebase-path`. Source-path repair
runs before Git ref resolution, so a missing `origin/main` cannot block it.
