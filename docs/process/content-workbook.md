# Content workbook

## How to use

Read this when a project reaches kickoff and launch content needs collecting —
or when changing the workbook system itself. The reusable masters live in
[`tools/project-system/templates/workbook/`](../../tools/project-system/templates/workbook/);
that directory's README covers instantiation step by step. This page holds the
reasoning and the rules that outlive any one project.

Content collection is the recurring failure mode of small-client projects. The
workbook replaces "send your content" with a structured surface the client
completes before implementation: one authoritative home for launch content,
with drafting, review and approval visible in the data. We populate the
websites from the completed workbook — we own launch readiness; the client
maintains future content after handover.

## What it is

A **structured content model with a client-facing skin**, implemented
deliberately as documents and spreadsheets — coherent enough to become
software later without redesign, but not software now. Concretely:

- **Prose surfaces** (`guide/`): introduction and rules, site overview, brand,
  a duplicable page module, legal, sign-off, and the version manifest. Every
  field carries fenced-YAML metadata (id, type, requirement, owner, phase,
  cms_target, guidance, client visibility).
- **Tabular surfaces** (`sheets/`): one CSV per tab — repeating content types,
  the asset register, integrations, and the two launch checklists — each
  paired with a `.md` column-definition file in the same metadata convention.
- **A mapping layer** (`mapping/project-mapping.md`, per project): semantic
  fields are CMS-free in the masters; each project supplies its WordPress
  destinations separately, with deterministic selector precedence.
- **Identity**: stable kebab-case IDs on sites, pages, rows, assets and
  page-local blocks. Pages reference assets by ID; filenames are attributes.
  Every tabular row names its site (`site_id`), from the project's declared
  set plus the reserved `shared` and `project`.

## The authority chain

Repository masters → generated project source files → the client
collaboration surface (authoritative during preparation) → the archived
implementation baseline (v1.0) → the archived launch record → **WordPress,
authoritative for live content after publication**. The workbook is never a
second CMS. Each sign-off checkpoint is frozen as a read-only archive
including a copy of the asset files themselves; unapproved edits made after
implementation sign-off are not implementation instructions.

## Validation

```bash
python3 tools/project-system/scripts/validate-workbook.py <workbook-dir>
```

Run against the masters, the sample
(`templates/workbook/client-surface/sample/` — a deliberately awkward minimal
project) and every instance. CSV integrity, ID discipline, declared-site
checks, controlled vocabularies, definition pairing, approval completeness,
and mapping coverage/conflicts for `mode: project` workbooks.

## Where it sits in the lifecycle

Proposal → discovery → **content workbook** → design → implementation → QA →
launch → handover → care. The workbook is issued at kickoff (typically when
the first milestone funds), prefilled from discovery, and — where the contract
requires it — its implementation sign-off is the gate before build work
begins. See [project-lifecycle.md](../project-lifecycle.md) and
[site-building-workflow.md](site-building-workflow.md) (Phase 0).

## Deliberate boundaries

- Per-project instantiation is manual (copy, trim, duplicate); a
  `workbook init` CLI verb is a later addition.
- Human-readable conditional requirements, no expression syntax; no parallel
  schema directory; no XLSX generation. The column definitions and field
  metadata lift mechanically into schemas if a web app is ever warranted —
  deferred until 5–10 projects prove the field model.
