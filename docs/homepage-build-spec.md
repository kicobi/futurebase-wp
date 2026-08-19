# Homepage build spec

Build specification for the homepage on a project based on `futurebase`. It captures the design intent (tokens, composition, a11y), the Technical Contract the build must satisfy, the delivery gates, and the failure modes to reject. <!-- futurebase-rename: keep-line -->

The block below is the canonical form handed to an AI coding agent (Claude Code, Codex, etc.) to execute the build — fill the `[UPPERCASE]` fields and paste. The same document doubles as human-readable documentation of how the homepage was architected: read it without pasting if you're onboarding onto the project.

This spec is opinionated on purpose: it steers the agent onto the nine-item Technical Contract in [CLAUDE.md](../CLAUDE.md), the three-layer composition model in [docs/pattern-composition.md](pattern-composition.md), the role-not-format media rule in [docs/media-conventions.md](media-conventions.md), and the slug/placeholder/TODO grammar in [docs/conventions.md](conventions.md). Do not loosen the rules — they are what make the output reusable.

> **One sentence for users:** Copy this spec, fill the `[…]` fields, and hand it to the agent.

---

````
Build the homepage for [PROJECT NAME] as a WordPress block theme, visually matched to the reference provided. Use only `theme.json` + core blocks + patterns + template parts. No custom blocks. No new CSS files — extend `assets/main.scss` only when `theme.json` genuinely cannot express something.

## Reference
- Reference: [REFERENCE — file path, live URL, or Figma link]
- Reference type: [image | live-url | figma]
  - For `figma`: use the Dev Mode MCP (`get_variable_defs`, `get_design_context`, `get_screenshot`) to extract tokens. Fonts are still supplied separately — see Assets policy.
- Copy: [verbatim text for each section, or "extract from reference and flag each extracted line as TODO(copy)"]
- Brand tokens: [authoritative hex values, type scale, spacing scale — or "derive from reference"]. Image eyedropping is for confirmation only; it never overrides a provided token.
- Style variations to ship: [e.g. `dark` / none]. Each must be shipped or explicitly deferred in Findings.
- Target environment: [studio | wp-env]

## Read first, before writing any code
- [CLAUDE.md](CLAUDE.md) — nine-item Technical Contract and behavioral rules.
- [docs/pattern-composition.md](docs/pattern-composition.md) — template → page-pattern → section-patterns.
- [docs/media-conventions.md](docs/media-conventions.md) — role-not-format (editorial imagery vs brand marks vs site logo).
- [docs/weight-vs-size-terminology.md](docs/weight-vs-size-terminology.md) — size/weight "medium" disambiguation.
- [docs/conventions.md](docs/conventions.md) — slug substitution, `[UPPERCASE]` placeholders, `TODO(kind)` grammar.

## Conventions
- `<slug>` — the project's theme slug. Also the text domain and the PHP function prefix (`<slug>_`). Read `style.css` Text Domain and `composer.json` `name` to confirm after rename.
- `[UPPERCASE]` in brackets is a placeholder you must fill. Never ship with one still visible — grep `\[[A-Z][A-Z-]+\]` before reporting done.
- `TODO(kind): reason` — inline marker for incomplete work. Kinds: `copy`, `design`, `content`, `a11y`, `perf`. **No bare `TODO`. No `FIXME` / `XXX` / `HACK`.** These are enforced by `bin/verify-theme.sh`.
- Shipped-but-non-final artifacts (stub image, placeholder copy, pending link target) are tracked as `TODO(content):` or `TODO(copy):` adjacent to the artifact. The verify grep `grep -rn 'TODO(' patterns templates parts assets` is your Findings inventory source.

## Assets policy

| Asset kind | Source |
|---|---|
| Fonts | **Non-system fonts must be `provided`** — if the design uses custom web fonts, they must be checked into `assets/fonts/` before the build starts. Cannot be agent-generated or stubbed. System font stacks (the default `sans-serif`, `serif`, `monospace` families in `theme.json`) require no assets. |
| Content imagery (hero, cards) | `provided` preferred. Otherwise ship a flat color-on-color PNG at correct aspect ratio, tagged `TODO(content): final [section] image`. |
| Decorative chrome (backgrounds, dividers, shapes) | `theme.json` tokens or SVG in `assets/` referenced via `get_theme_file_uri()`. Never the media library. |
| Brand/interface marks (social icons, decorative SVGs) | `get_theme_file_uri()` — see docs/media-conventions.md. |
| Site logo | `core/site-logo`, uploaded via media library. |

## Non-goals
- Custom blocks, custom JS, Interactivity API additions.
- New CSS files. `assets/main.scss` exists for type ramps, motion, and a11y edge cases — extend it only when `theme.json` cannot express the thing.
- Plugin territory: forms, analytics, SEO. Flag required integrations as `TODO(content): [service] wiring`.
- Broad refactors outside the files listed in Deliverables.
- Backwards-compat shims, feature flags, unused scaffolding.

## Technical contract

Nine items from CLAUDE.md — enforced by `bin/verify-theme.sh`. Do not relax.

1. **Tokens first.** Every color, spacing, font-size, font-family, and radius resolves to a `theme.json` preset (`var(--wp--preset--*)`) or a `settings.custom.*` value. No raw hex, rgb, px, or rem in patterns/templates/parts.
2. **No custom CSS for layout.** Spacing, alignment, flex/grid via block supports (`spacing`, `layout`, `align`) and `theme.json`. `assets/main.scss` is for type ramps, motion, and a11y edge cases only.
3. **Patterns compose; templates wire.** `templates/front-page.html` is a thin wiring file: header part, `<main>`, one `wp:pattern` reference, footer part. Content lives in patterns. Never hardcode content into a template.
4. **Section patterns, not page patterns.** Each reusable section is its own pattern prefixed `_section-` (`patterns/_section-hero.php`, `_section-cards.php`, etc.). A page-level pattern (`patterns/home.php`) composes them via `wp:pattern` references. Templates reference the page-level pattern.
5. **Role, not format.** Editorial imagery → attachment ID. Brand/interface marks → `get_theme_file_uri()`. Site logo → `core/site-logo`.
6. **One source of truth per block style.** Per-block presentation lives in `theme.json` `styles.blocks.*`, not sprinkled across patterns. If three patterns share the same group styling, hoist it.
7. **Fluid typography on.** `settings.typography.fluid: true`. Every heading-sized font-size preset (size > 1rem) uses `{ min, max }` form; body-scale presets (≤1rem) can be fixed. No raw `clamp()` in patterns/templates/parts.
8. **Text domain = theme slug.** Every `__()`, `_e()`, `esc_html__()`, `esc_attr__()`, `_x()`, `_n()` call uses the slug verbatim.
9. **Custom templates must exist on disk.** Every entry in `theme.json`'s `customTemplates` array has a matching `templates/<name>.html` file.

Build-specific additions for this prompt (non-negotiable, but not in the verify grep):

10. **Global settings baseline.** `settings.color.defaultPalette: false`, `settings.spacing.defaultSpacingSizes: false`, `settings.appearanceTools: true`, `settings.useRootPaddingAwareAlignments: true`. All four already ship in the starter — don't regress.
11. **Border radii are tokens.** Use `var(--wp--custom--radius--none|sm|md|lg|pill)`. Add or adjust slugs under `settings.custom.radius` in `theme.json` if the design needs them. No raw `px` radii in patterns.
12. **Parts are static HTML — no PHP.** Dynamic content rendered from a part must go through a pattern reference: `<!-- wp:pattern {"slug":"<slug>/_name"} /-->`. `patterns/_copyright.php` is the worked example; `parts/footer.html` shows the include.
13. **Navigation.** Use `core/navigation` — never custom menu markup. Inline `<!-- wp:navigation /-->` in a part (as `parts/header.html` ships today) is acceptable seed markup; when no `ref` is supplied, WordPress may create and render a fallback `wp_navigation` post so the nav renders at all. The file-based inline block is not automatically rewritten — to make a menu the single editable source of truth, add `"ref":<id>` to the block pointing at the desired `wp_navigation` post. One menu per nav region.
14. **Do not repurpose `core/search` as a subscribe CTA.** Its `backgroundColor` applies to the input AND the button, which almost never matches the design. Build the subscribe row as a flex `group` → styled input-shaped `group` + `core/button`. Flag the wiring as `TODO(content): email service provider`.
15. **Structural accessibility (from the starter, already in place — don't regress).**
    - WordPress 6.9 auto-injects the block-theme skip link; every template's `<main>` already has `id="wp--skip-link--target"` so the injected anchor lands there. Do not add a second skip-link pattern.
    - `.skip-link` focus styling lives in `assets/main.scss` — token-driven so the theme palette applies to core's injected link.
    - `:focus-visible` on buttons AND links, non-transparent color, ≥2px outline. Defined in `theme.json` `styles.elements` so every style variation inherits.
    - Contrast: ≥4.5:1 body, ≥3:1 large text (WCAG AA).
16. **Style variations.** `styles/*.json` must be rewritten against the new palette, or explicitly deferred in Findings.
17. **i18n.** All user-facing strings go through `esc_html__()` / `esc_attr__()` with `'<slug>'`. No bare strings.

## Exceptions

If the design legitimately requires something the Technical Contract forbids (a custom block, a new CSS file, raw `clamp()` in markup, inline `<style>`, custom JS, a `wp:html` block, a repurposed `core/search`, anything else flagged "reject" under Common Failure Modes) — **STOP. Do not code the violation silently.**

In Findings, log:

1. The rule you would violate, by number or name.
2. What the design requires and why the contracted alternative does not satisfy it.
3. Your proposed exemption — scope (this build only vs. every future build) and the smallest deviation that works.

Wait for an explicit spec amendment before proceeding. A logged exception is a healthy finding; an unlogged deviation is a regression.

## Terminology disambiguation

Weight words and size words collide. Always qualify:

- `font-weight: Medium` (500) — the weight.
- `font-size: medium` (slug) — the size preset.
- Applies to `Thin / Light / Regular / Medium / Bold` whenever ambiguous with a size slug.

See [docs/weight-vs-size-terminology.md](docs/weight-vs-size-terminology.md).

## Calibration (do this BEFORE writing any pattern)

Produce a calibration document first. For each section:

| # | Section | Alignment | Container | Key blocks | Tokens |
|---|---|---|---|---|---|
| 1 | Hero | `full` / `wide` / `default` | `constrained` / `flex` / `wide-left` | … | palette + size + spacing slugs |
| … | … | … | … | … | … |

Container meanings:
- `constrained` — centered, width capped by `contentSize` / `wideSize`.
- `flex` — row layout, gap-controlled.
- `wide-left` — pinned to the wide edge, NOT centered.

Also capture:
- Color token table (slug → value). ΔE measured against the reference where possible.
- Type scale, with fluid min/max per slug.
- Spacing scale.
- Custom radii (`none`/`sm`/`md`/`lg`/`pill`).
- Layout sizes (`contentSize`, `wideSize`) and root padding.

## Files you may edit

- `patterns/_section-hero.php`, `_section-cards.php`, `_section-writing.php`, `_section-cta.php` — fill in the existing section stubs.
- `theme.json` — palette, typography, radius, spacing overrides.
- `patterns/home.php` — only to reorder or add sections.
- `parts/header.html`, `parts/footer.html` — only if the reference demands structural change; log the reason in the summary.
- `assets/main.scss` — only when `theme.json` cannot express the thing.
- `styles/dark.json` (or any other declared variation) — mandatory if a variation is in scope.

## Files you may NOT edit

- `templates/*.html` — `<main id="wp--skip-link--target">` is already correct; core's auto-injected skip link lands there. Leave the templates untouched.
- `functions.php`, `composer.json`, `package.json`, `phpcs.xml.dist`, `bin/verify-theme.sh`, `.github/workflows/*`.

## Verification — two-stage delivery gates

**Preview delivery** (structural, agent-verifiable):

- `npm run verify` passes. Verify includes a `pa11y-ci` WCAG2AA gate that runs against the live wp-env instance when it's reachable; when wp-env isn't up, the gate degrades to a yellow warning so non-a11y workflows aren't blocked.
  - The verify script wraps: contract greps (hex/rgb/px/clamp/fluid:true/customTemplates-on-disk/front-page-is-thin), comment grammar (`TODO(kind)` only), `lint`, `lint:css`, `phpcs`, `phpstan`, and finally `pa11y-ci`.
- `preview_inspect` assertions pass for every section at 1440 and 390.
- `preview_console_logs` clean; `preview_network` no 404s (fonts especially).
- Fresh-checkout render shows core's auto-injected skip link on first Tab press and reaches `#wp--skip-link--target` on activation.
- Every `TODO(kind)` enumerated in Findings, grouped by kind.

**Project delivery** (adds real a11y audit):

- `npm run a11y` passes (`pa11y-ci`, WCAG2AA). Zero violations.
- Manual keyboard tour: skip link, focus rings visible, tab order sensible.
- Manual viewport tour at 1440, 1024, 768, 390 — no overflow, no broken stacks.

### Run order

1. `npm run verify` — single entry point. Do not substitute ad-hoc greps for the verify script.
2. `preview_start` → for each viewport in `{1440, 390}`: `preview_resize` → `preview_inspect` asserts against calibration → `preview_screenshot`.
3. `npm run a11y` — convenience alias for the `pa11y-ci` check that `verify` already runs; rerun it directly when iterating on a11y fixes.

### Tolerances

- Color: ΔE ≤ 3 vs reference token.
- Spacing: ±4 px at 1440, ±2 px at 390.
- Typography: computed size within fluid range; weight exact.

### Inspect assertions (per section)

Computed `color`, `background-color`, `font-family`, `font-size`, `font-weight`, `padding`, `border-radius` match the calibration token — NOT the reference pixel. Screenshots are lossy; `preview_inspect` is authoritative.

### A11y preflight (structural, before Project delivery)

- Skip link is the first focusable element; visible on focus.
- Every `<img>` has `alt` (empty string only if genuinely decorative).
- Heading order: exactly one `h1`, then monotonic.
- Buttons and links render a `:focus-visible` outline — verify via `preview_inspect` on the focused element.

## Deliverables

Return one message at end of build. Tag each item by delivery gate.

1. **[Preview]** Auto-login preview URL (`/studio-auto-login?redirect_to=…`) with default credentials (`admin` / `password`).
2. **[Preview]** Calibration document, verbatim from the pre-build phase.
3. **[Preview]** Files touched + tokens registered (new palette slugs, font-size slugs, radius slugs, etc.).
4. **[Preview]** Per-section visual diff notes — measured deviations at 1440 and 390 against the tolerance budget.
5. **[Preview + Project]** Findings list:
   - Every `TODO(kind)` grouped by kind (`grep -rn 'TODO(' patterns templates parts assets`).
   - Every deferred style variation.
   - Every known gap or follow-up.
   - On Project delivery, append a11y audit results.
````

---

## Using the spec

Fill these inputs in the paste-block above before running the spec:

- **`[PROJECT NAME]`** — project display name.
- **`[REFERENCE]`** — path to image, live URL, or Figma file.
- **Reference type** — `image`, `live-url`, or `figma`. `figma` requires Dev Mode MCP access.
- **Copy** — verbatim text per section. Omit a section and the agent ships placeholder copy marked `TODO(copy): …`.
- **Brand tokens** — authoritative hex values, type scale, spacing scale. These override any eyedropping from the reference.
- **Fonts** — must be checked into `assets/fonts/` *before* you run the spec. The build will not start without them.
- **Style variations** — list each (e.g. `dark`) or mark deferred.
- **Target environment** — `studio` for solo/short, `wp-env` for team/CI.

Fill every `[UPPERCASE]` placeholder before pasting — `grep '\[[A-Z][A-Z-]+\]' prompt.md` must return nothing. The agent is told to refuse and ask for values rather than guess.

The `<slug>` token you'll see in the spec body is not an input. It's the theme slug set by `npm run rename -- <your-slug>` during project setup, and the agent reads it from `style.css` Text Domain and `composer.json`.

### The result

One message at the end of the build with five numbered items, each tagged `[Preview]` or `[Preview + Project]`:

1. Auto-login URL
2. Calibration document
3. Files + tokens summary
4. Per-section visual diff notes
5. Findings list (`TODO(kind)` inventory + deferred variations)

### Two delivery gates

- **Preview delivery** — default handoff. Agent ships when `npm run verify` passes (`pa11y-ci` is a hard gate when wp-env is reachable; otherwise it degrades to a warning), `preview_inspect` assertions pass at 1440 and 390, and the structural a11y baseline (skip link, `<main id="wp--skip-link--target">`, `:focus-visible` outlines) is intact.
- **Project delivery** — adds explicit a11y sign-off: boot wp-env (`npm run env:start`) so `pa11y-ci` runs as a hard gate, plus manual keyboard and viewport tours at 1440, 1024, 768, 390. Request this explicitly when you want sign-off, not just a preview.

### How to read Findings

Every open item is a `TODO(kind):` comment. Kinds, per [docs/conventions.md](conventions.md):

- `TODO(copy): …` — placeholder copy; you owe the final editorial text.
- `TODO(design): …` — a design decision is still open (color, spacing, imagery).
- `TODO(content): …` — structural content pending (a stub image, a missing link target, an unresolved card, email-service wiring).
- `TODO(a11y): …` — a11y work beyond what `npm run verify` catches.
- `TODO(perf): …` — performance follow-up.

Regenerate the list any time with `grep -rn 'TODO(' patterns templates parts assets`. A bare `TODO` or a `FIXME` / `XXX` / `HACK` is a verify failure — if you see one in the output, that's a bug in the build, not a finding.

If Findings is empty, nothing is pending. If it's long, triage by kind before approving Project delivery — especially anything under `TODO(a11y)` or `TODO(copy)`.

### When to edit the spec vs. the inputs

- **Edit inputs** for: this specific build's copy, tokens, reference, variations.
- **Edit the spec** for: new structural rules that should apply to *every* build (a new guardrail, a new contract item). Spec edits belong in version control alongside the foundation, and should move together with [CLAUDE.md](../CLAUDE.md) and [bin/verify-theme.sh](../bin/verify-theme.sh) — the three stay in sync or the agent drifts.

### Common failure modes

- **Missing fonts** — the build blocks. Add files to `assets/fonts/` and re-run.
- **Figma without Dev Mode access** — downgrade reference type to `image`, or get a Dev Mode seat.
- **`core/search` used as a subscribe CTA** — reject. Rule 14 forbids it (`backgroundColor` bleeds onto the button). Ask for a flex `group` → styled input-shaped `group` + `core/button`.
- **Parts contain PHP** — reject. Rule 12 requires parts stay static HTML; dynamic content goes through a pattern include (`patterns/_copyright.php` is the worked example).
- **Raw `clamp()` in a pattern or in `settings.custom.*`** — reject. Rule 7 requires fluid sizing via `settings.typography.fontSizes` with `{ min, max }`. Verify catches `clamp()` in patterns/templates/parts.
- **Bare `TODO` / `FIXME` / `XXX` / `HACK`** — verify fails. Rewrite as `TODO(kind):` with one of the five kinds.
