# CLAUDE.md

This repo is a modern WordPress project. Use the project skills in `.claude/skills/` whenever the task touches WordPress.

## How to work in this repo

Start with classification, then use the matching skill:

- repo detection / setup: `wordpress-router`, `wp-project-triage`
- custom blocks: `wp-block-development`
- block themes / FSE: `wp-block-themes`
- plugin structure / settings / security: `wp-plugin-development`
- REST routes / endpoints: `wp-rest-api`
- permissions / auth / capabilities: `wp-abilities-api`
- interactive frontend behavior in blocks: `wp-interactivity-api`
- WP-CLI / environment / automation: `wp-wpcli-and-ops`
- performance work: `wp-performance`
- PHP static analysis: `wp-phpstan`
- disposable local environments / repros: `wp-playground`

## Project lifecycle & lead workspaces

This repo also carries the **project lifecycle system** in [tools/project-system/](tools/project-system/) — isolated lead workspaces, promotion into active projects, baselines, and success metrics. See [docs/project-lifecycle.md](docs/project-lifecycle.md) and [docs/baseline-system.md](docs/baseline-system.md).

- **Prospective client work does not happen in this repo.** New client planning (briefs, discovery, scope, estimates) lives in a local, isolated lead workspace under `~/Sites/leads/<slug>/`, created by `futurebase lead init`. Keep client-specific analysis there — never mix it into the shared starter.
- **`/planning/` (gitignored) is for starter-development scratch only**, not client planning.
- When a lead is awarded, it is **promoted** (`futurebase lead promote <slug>`), which wraps the existing template + `npm run rename` flow, copies the lead dossier into `.project/`, and switches agent instructions to active-project mode. Do not convert a lead by hand.
- **Phrase → command routing.** The CLI is not on PATH — run `node tools/project-system/bin/futurebase.mjs …` from the repo root. When a request matches one of these, use the CLI instead of hand-rolling:
  - "create a lead for `<client>`" → `lead init "<Client>" --type new|redesign --platform codeable`
  - "list leads" / "inspect the `<slug>` lead" → `lead` / `lead inspect <slug>`
  - "we won `<client>`" / "promote the lead" → `lead promote <slug> --confirm` (creates a real GitHub repo — needs that explicit ask; on a failed run, fix the cause and `--resume --confirm`; an empty clone means the `gh` template race — `git pull origin main` first)
  - "archive the lead as lost/abandoned" → `lead archive <slug> --reason lost|abandoned`
  - "pull the starter's fixes into this project" / "this project is behind the starter" / "sync from the starter" → `sync` (run from **inside the project**; read-only until `--apply --confirm`). A promoted project shares no git history with the starter, so this is the only route — never merge, rebase, or cherry-pick across them. It writes only slug-free paths (`tools/`, `.github/workflows/`, `fixtures/`) plus the dependency layer; `bin/` and `docs/` are reported for a hand port because they carry the theme slug.
  - "capture the baseline" → `baseline init` / `baseline run` (against the live site, before cutover)
  - "suggest success metrics" → `metrics suggest`
  - "create a project / make a repo for `<client>` from the starter template" → **not a hand task**: route through `lead init` → dossier → `lead promote`. Promotion before a formal award needs an explicit go-ahead ("pre-stage it / promote it anyway").
  - "new Codeable gig" / "draft a workroom reply" → **not this repo**: gig intake, research, and response drafting live in `~/Documents/Codeable` (its `CLAUDE.md` carries the gig workflow). A gig arrives here via "Promote `<slug>` to a lead" from that repo.
- `bin/rename-theme.sh` deliberately does not scan `tools/` — templates there carry literal starter-identity references, not client slugs.

## Repo assumptions

Unless the task says otherwise:

- prefer **pattern → block style variation → ACF binding → custom block** in that order (see [docs/block-authoring.md](docs/block-authoring.md)) — most "custom block" asks are better served upstream
- if a custom block is warranted: reusable / cross-project blocks live in a companion plugin; theme-bound blocks (coupled to this theme's tokens, patterns, or templates) live in `src/blocks/<slug>/` and are scaffolded with `npm run block:new -- <slug>`
- use `block.json`
- default to dynamic blocks (server render via `render.php`) over static blocks with a `save()` — no deprecation treadmill
- use `theme.json` as the primary configuration layer for block themes
- prefer patterns / template parts / supports / style variations over bespoke duplicate code
- prefer the Interactivity API for block-level frontend interactions

## Frontend house style: Every Layout & Inclusive Components

Two skills cover how we build UI here:

- **`every-layout`** — intrinsic, media-query-free CSS layout primitives: Stack, Box, Center, Cluster, Sidebar, Switcher, Cover, Grid, Frame, plus the underlying rudiments (units, modular scale, axioms, global vs. local styling).
- **`inclusive-components`** — accessible component patterns: linked cards, toggle buttons, menus & menu buttons, tooltips & toggletips, theme switchers, tabbed interfaces, collapsible sections, content sliders, notifications & live regions, data tables, add/remove lists, and modal dialogs.

Both are distilled from the Heydon Pickering books of the same names. Each reference file carries the recommended pattern *and* the approaches the books reject, with the reasoning — which is the part that matters, because the rejected version is usually the one you'd write by default.

**Use them.** When a task involves arranging anything on a page, or building/modifying any interactive component, consult the relevant skill and read the specific reference file before writing code. Prefer these patterns over ad-hoc flexbox/grid one-offs, breakpoint-driven layout CSS, and hand-rolled ARIA. If you deviate, say why.

A couple of standing preferences that follow from them:

- Clickable cards use a heading-wrapped anchor as the only link, with the whole card made clickable via the pseudo-content trick or a redundant click handler — never an `<a>` wrapping the entire card.
- Layout adapts to its container, not the viewport. Reach for Sidebar, Switcher, or Grid before writing a `@media` breakpoint.

**Precedence against the Technical Contract.** Inside the homepage/front-page workflow, contract item 2 still wins: express spacing, alignment, and flex/grid behavior with block supports and `theme.json` before reaching for a layout primitive. Every Layout applies where custom CSS is already the right answer — `src/` block styles, site chrome, and anything outside that scope — and its values still resolve to `theme.json` tokens (contract item 1). The two agree on the substance; they disagree only on which layer expresses it, and in pattern markup the block layer goes first.

**Availability.** These two are installed at *user* level (`~/.claude/skills/`, symlinked from `~/Sites/inclusive-skill` — private, derived from purchased books, not for redistribution). Unlike the vendored WordPress skills in `.claude/skills/`, they do **not** travel with a clone of this repo, and must not be committed into one. If they aren't loadable in the current session, the rules stated above are still in force: follow them from this file, and say the expanded reference wasn't available.

## Behavioral rules

- preserve the current package manager and build tooling
- preserve existing architecture unless the task is explicitly architectural
- do not introduce new dependencies casually
- avoid broad refactors
- make small, reviewable edits
- run the most relevant existing validation after edits

## Block-specific rules

When changing a block:
- inspect `block.json` first
- inspect save vs render behavior before editing
- consider attribute compatibility
- consider whether a deprecation is needed
- consider editor and frontend behavior separately
- prefer supports and metadata to custom controls where possible

When creating a theme-bound block:
- scaffold with `npm run block:new -- <slug>` — do not hand-create the four files
- slug is lowercase, dashes only (`author-card`, not `AuthorCard` or `author_card`)
- never hand-edit files under `build/blocks/` — they're compiled output; edit `src/blocks/<slug>/` and run `npm run build`
- no manual `register_block_type()` call is needed — `futurebase_register_blocks()` in [functions.php](functions.php) auto-registers every `build/blocks/*/block.json` on `init`
- the scaffold generates a dynamic block (`render.php`, no `save.js`) — only add `save.js` if the block genuinely outputs static HTML, and accept the deprecation-maintenance burden that comes with it

## Theme-specific rules

When changing a block theme:
- inspect `theme.json` first
- keep design decisions in tokens/settings/styles where practical
- prefer templates, template parts, patterns, and style variations over hardcoded repetition
- avoid scattering styling across many files if `theme.json` or per-block styles are the cleaner home

## Custom post type rules

When a project needs a custom post type:
- consider the ACF Pro UI path first (see [docs/post-types.md](docs/post-types.md)) — code scaffolding is for structural/non-editorial CPTs or projects that value everything-in-git
- scaffold code-registered CPTs with `npm run cpt:new -- <slug>` — do not hand-write the registration
- slug is the singular form, lowercase, dashes only (`case-study`, not `CaseStudy` or `case_study`)
- scaffolded files land in `inc/post-types/<slug>.php` and auto-load via `futurebase_load_post_types()` in [functions.php](functions.php) — no manual require
- always set `show_in_rest: true` so the block editor and block bindings can see the post type
- after adding or changing a rewrite slug, flush permalinks (`wp rewrite flush` or re-save Settings → Permalinks) — stale rewrites surface as 404s on archive pages
- if a project needs CPTs to survive theme switches, move the generated file to a must-use plugin — the registration code is portable unchanged

## Block theme standards

The nine-item Technical Contract.

> **Scope.** The Technical Contract applies to the homepage/front-page workflow — `templates/front-page.html`, `patterns/home.php`, and any `_section-*` pattern it composes. Project-specific landing pages built on the same pattern-driven composition follow the same rules. Non-homepage templates (`page.html`, `single.html`, `archive.html`, etc.) are free to wire blocks directly without pattern composition. Site chrome (the `parts/header.html` and `parts/footer.html` parts and their associated SCSS) is exempt from item 2 regarding layout CSS.

1. **Tokens first.** Every color, spacing, font-size, font-family, and radius must resolve to a `theme.json` preset (`var(--wp--preset--*)`) or a value declared in `settings.custom.*`. No raw hex, rgb, px, or rem in pattern/template/part markup.
2. **No custom CSS for layout.** Spacing, alignment, and flex/grid behavior must be expressed with block supports (`spacing`, `layout`, `align`) and `theme.json`. Custom stylesheets are for type ramps, motion, and edge cases only.
3. **Patterns compose; templates wire.** A template (`templates/*.html`) is a thin wiring file: header part, `main`, one `wp:pattern` reference, footer part. Content lives in patterns. Never hardcode content into a template.
4. **Section patterns, not page patterns.** Each reusable section (hero, cards, writing, cta) is its own pattern prefixed `_section-*`. A page-level pattern (e.g. `home`) composes section patterns via `wp:pattern` references. Templates reference the page-level pattern.
5. **Role, not format.** Decide what an asset *is* before deciding how to reference it. Editorial imagery → attachment ID. Brand/interface marks (logos, icons, decorative SVGs) → `get_theme_file_uri()`. Site logo → `core/site-logo`. See [docs/media-conventions.md](docs/media-conventions.md).
6. **One source of truth per block style.** Per-block presentation (padding, typography, default colors) lives in `theme.json` `styles.blocks.*`, not sprinkled across patterns. If three patterns share the same group styling, hoist it.
7. **Fluid typography on.** `settings.typography.fluid: true` is required. Every heading-sized font-size preset (size > 1rem) uses `{ min, max }` form; body-scale presets (≤1rem) can be fixed — fluid body text is a pessimization. No raw `clamp()` in markup. Size presets and font-weight presets share slugs like `medium` — see [docs/weight-vs-size-terminology.md](docs/weight-vs-size-terminology.md) before referring to either in prose.
8. **Text domain = theme slug.** Every `__()`, `_e()`, `esc_html__()`, `esc_attr__()`, `_x()`, `_n()` call uses the theme slug verbatim. Enforced by phpcs.
9. **Custom templates must exist on disk.** Every entry in `theme.json`'s `customTemplates` array has a matching `templates/<name>.html` file. No ghost entries.

`bin/verify-theme.sh` enforces items 1, 3, 4, 5, 7, and 9, plus item 8 via the `composer phpcs` invocation. Items 2 and 6 rely on review discipline; any exception belongs in this document, not in the code.

**How, and how far.** Items 3, 4, 5, 7 and 9 are checked by [bin/verify-contract.mjs](bin/verify-contract.mjs), which parses block markup and `theme.json` rather than grepping them — the grep versions passed for the wrong reason (a blacklist that omitted `core/list`, a `"fluid": true` match a nested preset satisfied, an AWK parser that read compact JSON as an empty list). [bin/verify-contract.test.mjs](bin/verify-contract.test.mjs) feeds every check markup that must fail it, so a check cannot quietly stop checking; `npm run test:contract` runs it, and `verify-theme.sh` gates on it.

One limit is worth stating rather than papering over. Item 5's *role* judgement — whether a given image is editorial (attachment-backed) or a brand mark (theme-served) — is a fact about the asset, not a property of the markup, so no parser decides it. What is enforced is that no markup hardcodes a path into the theme directory in any form. The role call itself stays with review and [docs/media-conventions.md](docs/media-conventions.md).

### Verification

Run `npm run verify` (or `bin/verify-theme.sh` directly) before handing work back. CI runs the same script.

## Plugin / API rules

The in-house plugin layer — which plugins exist, what belongs in each, how
they are delivered, and the test for adding a fourth — is decided in
[docs/plugin-strategy.md](docs/plugin-strategy.md). Nothing is built yet;
read it before proposing that functionality move out of the theme.

When changing plugin code:
- preserve namespace and autoloading patterns already used in the repo
- sanitize input
- escape output
- check capabilities
- include permission callbacks for REST routes
- keep public APIs stable unless the task says otherwise

## Validation order

After edits, run what exists and is relevant:

1. formatting / lint
2. build or typecheck
3. PHP static analysis if present
4. tests if present
5. local WordPress verification if available

If commands are missing or failing because the repo is not configured, state that plainly.

## Communication style

- be direct
- show what changed and why
- mention WordPress-specific consequences such as deprecations, serialization, permissions, or theme.json impact when relevant
- do not over-explain basic code changes

## Comment conventions

See [docs/conventions.md](docs/conventions.md) for the full grammar. Summary:

- `TODO(kind):` is the only TODO form. Kinds are `copy`, `design`, `content`, `a11y`, `perf`. `FIXME`, `XXX`, `HACK` are not accepted — rewrite them as `TODO(kind):` with the appropriate kind.
- `[UPPERCASE]` in brackets inside docs/prompts is a placeholder for substitution. Never ship content with a placeholder still visible.
- `<theme-slug>/…` (with angle brackets) is a generic placeholder for the theme's pattern-slug prefix in prose. Literal slug references in docs, patterns, and code are rewritten in one pass by `bin/rename-theme.sh`, so using the actual project slug is fine; reserve `<theme-slug>/…` for prose that should describe the shape without committing to a specific value.

## Skill pack caveats

The skills in `.claude/skills/` are vendored from [WordPress/agent-skills](https://github.com/WordPress/agent-skills) and are ecosystem-wide. A few upstream defaults are superseded by this repo:

- **PHP floor.** Skill guidance cites a PHP 7.2.24+ floor. This repo requires **PHP 8.3+** (see README *Hosting baseline*). Write for 8.3 — typed properties, constructor promotion, first-class callable syntax are fine.
- **WordPress floor.** Skills target broad compatibility. This repo requires **WordPress 6.9+**, which means per-block-style variations in `theme.json`, focus-state styling under `styles.elements`, fluid typography, and the block-theme skip-link auto-injection all work natively — prefer them over older polyfill patterns. Inline `core/navigation` in parts is acceptable seed markup and core will create a fallback `wp_navigation` post when none is referenced; to make a menu the single editable source, add `"ref":<id>` to the block.
- **Don't edit the vendored files.** `.claude/skills/*` is overwritten by the installer documented in the README. Repo-specific overrides, tightened rules, or local conventions belong in this `CLAUDE.md` or `docs/*.md` — never inside `.claude/skills/`.