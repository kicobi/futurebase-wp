# Site building workflow

Targeting 3-5 working days for a 10-page marketing site built from a completed Figma design, using this repo's scaffolding and AI coding assistants. The earlier draft treated site-building as solo-dev manual work; this one is an AI-assisted pipeline with explicit tool choices at each handoff.

**Time budget: 3-5 working days** for a 10-page marketing site with 1-2 CPTs and 0-1 custom blocks. First project with the template: +25-50%.

---

## Phase 0 — Design readiness (30 min, human)

Run the Figma file against [design-intake-checklist.md](design-intake-checklist.md). The checklist gates six dimensions (scope, token, component, page, responsive, content) and names specific incompleteness signatures Phase 0 rejects. Unchecked items mean the design isn't ready — don't start the build.

Design is locked at client sign-off. After Phase 2a, `docs/process/design-system.md` becomes the authoritative translation — no mid-build Figma updates expected.

Content readiness is gated the same way: the client's launch content is prepared and approved in the [Content Workbook](content-workbook.md) (masters in `tools/project-system/templates/workbook/`), and where the contract requires it, the workbook's implementation sign-off precedes the build. The checklist's content dimension checks against the workbook, not against loose documents.

**Output:** a go/no-go decision and a signed (or self-signed) checklist with a date. No code yet.

## Phase 1 — Project init (30 min, terminal)

```bash
cd ~/Sites
gh repo create kicobi/<slug> --template kicobi/futurebase-wp --private --clone
cd <slug>
npm run rename -- <slug>
npm install && composer install
npm run env:start
npm run env:cli -- plugin install create-block-theme --activate
```

Then install ACF Pro per [docs/acf-pro-setup.md](../acf-pro-setup.md) (license-gated, not bundled). Confirm both plugins are active before Phase 3 (Create Block Theme is needed for the visual-first pattern path) and Phase 4 (ACF Pro hosts editorial CPTs).

## Phase 2 — Design system extraction (~1-1.5 hours, split)

The bottleneck here isn't AI execution — it's the semantic mapping decisions (is this grey `contrast-3` or a new slot? is "brand primary" `accent` or `contrast-2`?). Making those calls in a human-owned document first, before any AI touches `theme.json`, beats reviewing AI-guessed mappings.

### Phase 2a — Fill `docs/process/design-system.md` (30-60 min, human)

The repo ships with a template at [design-system.md](design-system.md) pre-structured to match the fixed slot count in `theme.json` (9 colors, 7 font sizes, 6 spacing steps, 5 radii, 3 line-heights, 3 font families). Open Figma, work the template end-to-end, sign off the checklist at the bottom. Unfilled slots or unresolved conflicts here turn into rework downstream.

### Phase 2b — Generate `theme.json` (15-30 min — Claude Code / Codex)

Hand the completed `docs/process/design-system.md` to the assistant:

> Use `docs/process/design-system.md` as the source of truth for `theme.json` token mapping. Update `theme.json` and `styles/dark.json` to match it. Preserve the existing schema structure and slot names. Don't invent slots; don't add `settings.color.custom: true`. Preserve any existing values for slots the doc doesn't specify — the doc is the delta, not a full replacement. If a row can't be resolved to a preset (ambiguous mapping, unresolved conflict), stop and flag it — don't guess. Produce a single atomic change, not per-section commits.

Spot-check the diff — colors in palette, fluid min/max on every size preset above `small`, spacing values on the right slugs. Commit: `feat(design): apply <client> tokens from design system`.

## Phase 3 — Pattern building (1-2 days — two paths, pick per section)

- **Code-first (Claude Code / Codex).** Default for conventional sections: hero, feature grid, CTA, card row. Give the AI the Figma frame + extracted tokens; it outputs `patterns/_section-<name>.php` with PHPDoc header, token-aware block markup, and binding stubs.
- **Visual-first (FSE + Create Block Theme plugin).** For sections where composing in the editor is faster than describing it — layered marketing heroes, dense layouts, anything where AI has missed after 2 attempts. Compose in the site editor, then use **Create Block Theme → Create Pattern** to write the file to disk. AI cleans up the PHPDoc header and wires bindings afterward.

Rule of thumb: code-first by default; switch to visual-first the moment you're re-prompting a section three times.

Commit per pattern: `feat(patterns): add _section-<name>`.

## Phase 4 — CPTs + bindings (2-4 hours — Claude Code / Codex)

Editorial CPTs are content the client edits regularly (team members, case studies, blog posts). Structural CPTs exist for architecture but rarely change post-launch (landing-page wrappers, redirect stubs, menu-driven single-instance types).

Per CLAUDE.md decision tree:

- **ACF Pro UI** for editorial CPTs unless you specifically need everything-in-git.
- **`npm run cpt:new -- <slug>`** for structural/non-editorial CPTs.

AI scaffolds, configures labels/supports/taxonomies, and wires block bindings in relevant patterns.

## Phase 5 — Custom blocks (skip unless needed — Claude Code / Codex)

Only if pattern + style variation + ACF binding can't cover it. `npm run block:new -- <slug>` scaffolds; AI implements `edit.js`, `render.php`, `block.json` per [docs/block-authoring.md](../block-authoring.md). Expect 0-2 blocks. More than that is a signal your pattern layer is leaking.

## Phase 6 — Page composition (2-4 hours — WP admin)

Create pages, insert section patterns, configure per-page bindings. Homepage → `patterns/home.php`. Other pages stay in the database unless multi-instance (e.g. a case-studies template).

## Phase 7 — Header / footer / navigation (2-4 hours — FSE + Create Block Theme)

Build chrome in the site editor. **Before exporting, ensure a clean working tree (`git status` clean)** — Create Block Theme can write more than just template parts (templates, patterns, `theme.json`), and the diff is your only gate. Use **Create Block Theme → Save Changes to Theme** to sync `parts/header.html` / `parts/footer.html` back to disk. Run `git diff`, stage only the intended file changes, and commit. Discard incidental writes — especially to `theme.json`, since `docs/process/design-system.md` is the canonical token source.

**The trap.** Once the client starts editing the header or footer in the admin, the database version wins over the theme-file version. Don't re-export after that point without an explicit reason — you'll overwrite the client's work. Phase 7 sets the base state; post-launch edits live in the admin.

## Phase 8 — Content load (half to full day — shared)

Real copy, real images, real nav, real footer. Sweep all `TODO(kind):` markers per [docs/conventions.md](../conventions.md):

```bash
rg -n 'TODO\((copy|content|design|a11y|perf)\):' patterns templates parts assets inc functions.php
```

Decide per-kind which markers block launch — `copy` and `content` usually do; `design`, `a11y`, `perf` are deferable with an owner and a tracking issue. Every marker either resolved or explicitly deferred.

## Phase 9 — Verification (1-2 hours)

```bash
npm run env:start    # confirm wp-env is up — pa11y degrades to a warning otherwise
npm run verify
```

`bin/verify-theme.sh` enforces the **scripted subset** of the 9-item Technical Contract: items 1, 3, 4, 5, 7, 8, 9. Items 2 (no custom layout CSS) and 6 (one source of truth per block style) are review-only — walk the diff with that lens before sign-off.

Final gate, all required:

- `npm run verify` clean — no failures **and** no warnings. A yellow pa11y warning means wp-env wasn't reachable; rerun with the env up.
- Manual review for contract items 2 and 6.
- Editor / frontend / responsive spot-check on representative pages.

Any open item is a blocker. Claude Code / Codex fixes — most violations are tokens-not-wired or layout-CSS-leaking, both mechanical.

## Phase 10 — Handoff (half day — Claude Code / Codex drafts)

AI drafts a project-specific `docs/authoring-guide.md` per pattern and custom block. You record one Loom of client workflows and edit the draft. The template's existing docs reduce site-specific writing to deltas.

## Phase 11 — Deploy

Stage → verify against staging → client review → production. Per-project specifics in [docs/deployment.md](../deployment.md).

---

## Where the compression comes from

- **Template bootstrap.** This starter template replaces ~half a day of per-project setup: renaming, CI, lint/verify wiring, theme-level scaffolding.
- **Fixed-slot design-system doc.** `docs/process/design-system.md` pre-structured to the repo's slot counts replaces "sit with Figma and write a design spec from scratch" (~1 day).
- **AI-authored patterns** with Create Block Theme as visual-first escape hatch (~2 days vs. hand-authoring).
- **`npm run verify`** replaces manual QA sweeps.
- **Pattern → style variation → binding → custom block hierarchy** (enforced in CLAUDE.md) prevents custom-block sprawl, which is what usually blows up small-site timelines.

## Where it still breaks down

- *Unsystematic Figma.* Phase 0 catches it; ignoring Phase 0 means garbage tokens and AI can't recover.
- *AI pattern output needing 5+ iterations.* Switch to visual-first and move on — don't burn a morning on prompts.
- *Client copy breaking layouts.* Same as before, budget buffer in Phase 8.
- *Designer expectations about pixel-parity.* The token-first approach produces brand-parity, not pixel-parity. Set that expectation before Phase 2.
