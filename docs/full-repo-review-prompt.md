# Full-repo review prompt

Everything below the line is the prompt. Hand it to an external reviewer —
Codex, another model, a person — when you want the whole repo examined rather
than a diff. Keep the file-count and directory claims current when the shape of
the repo changes; a prompt that misdescribes the codebase wastes the reviewer's
first hour.

```bash
codex exec "$(cat docs/full-repo-review-prompt.md)"
```

Run once, 2026-07-30, against `4afba11`. Thirteen findings, all addressed in
PRs #65–#71; the ones worth knowing about as prior art are in those
descriptions. Do not paste that history into the next run — a reviewer told
what was previously found tends to find it again.

---

Do a complete, top-to-bottom review of this repository. Correctness, security,
accessibility, performance, architecture, and maintainability. Be adversarial:
your job is to find what is actually wrong, not to summarise what the code does.

## What this repo is

A WordPress **block theme starter** that doubles as a **project lifecycle
system**. Two distinct codebases share one checkout, with different threat
models and different standards:

1. **The theme** — a WordPress 6.9+ / PHP 8.3+ block theme.
   `functions.php`, `inc/` (21 PHP files), `theme.json`, `style.css`,
   18 patterns in `patterns/`, 9 templates in `templates/`, `parts/`,
   `src/`, `assets/`, `styles/`. Output is web-facing and renders untrusted
   content (post content, user input via search/comments).

2. **The project-system CLI** — 52 `.mjs` files under `tools/project-system/`
   (`commands/`, `lib/`). A local Node CLI that creates isolated "lead"
   workspaces, promotes them into real GitHub repos from a template, captures
   performance baselines, and syncs starter fixes into already-promoted client
   projects. It shells out to `git`, `gh`, `wp`, and a headless browser, reads
   and writes YAML records, and validates against JSON schemas.

3. **13 shell scripts in `bin/`** — rename, verify, package, scaffold, demo
   content, scorecard, smoke tests. Several are destructive (`wp site empty`),
   several rewrite the entire repo in place (`rename-theme.sh`).

Read `CLAUDE.md` first — it states the project's own rules — then
`docs/`, then `tools/project-system/README.md` and `ARCHITECTURE.md`.

## The theme's own contract

`CLAUDE.md` defines a nine-item "Technical Contract" for the homepage workflow
(tokens-only colour/spacing, no custom layout CSS, patterns compose while
templates wire, section patterns not page patterns, role-not-format media
references, one source of truth per block style, fluid typography, text domain
= theme slug, no ghost `customTemplates` entries). `bin/verify-theme.sh`
enforces six of the nine; items 2 and 6 rely on review discipline.

**Audit items 2 and 6 by hand — nothing checks them.** Also check whether the
six "enforced" items are genuinely enforced or merely spot-checked: a check
that passes for the wrong reason is worse than no check.

## Review areas

**Security.** Treat the two codebases separately.
- Theme: output escaping (`esc_html`/`esc_attr`/`esc_url`/`wp_kses`), input
  sanitisation, capability checks, nonces, SQL construction, any REST route's
  `permission_callback`, dynamic block `render.php` files, and anything
  interpolating post meta or user input into markup or attributes.
- CLI: command injection through `spawnSync`/`execFile` argument construction,
  path traversal in file writes (especially anything joining a path from a git
  tree, a YAML record, or a CLI flag onto a destination root), YAML and JSON
  deserialisation, symlink handling in directory walks, and `lib/secret-scan.mjs`
  — verify it actually catches what it claims before anything relies on it.
- Shell: quoting and word-splitting, `set -euo pipefail` discipline, `eval`,
  unquoted globs, and the guards on the destructive paths. `bin/demo-content.sh`
  gates `wp site empty` behind `--force`/`$CI` and a localhost allowlist —
  try to defeat that guard.
- Anything that writes into a *client project* directory is a privilege
  boundary: the starter is trusted, the project is the client's. Look hard at
  `tools/project-system/lib/sync.mjs`, whose path-classification table is the
  entire safety model for that boundary.

**Accessibility.** WCAG 2.2 AA, judged against rendered output, not intent.
Heading order across patterns and templates, landmark structure, focus
visibility and focus order, colour contrast for every `theme.json` colour pair
that can actually co-occur, `aria-*` correctness, keyboard operability of the
navigation block and any interactive pattern, reduced-motion handling, form
labelling, link text, and alt-text conventions (see `docs/media-conventions.md`
— decorative brand marks and editorial imagery are handled deliberately
differently; check the distinction actually holds in the markup). `pa11y-ci`
runs in CI — assume it catches only the easy third and look for what it misses.

**Correctness and robustness.** Error handling and partial-failure states in the
CLI (what does a half-finished `lead promote` leave behind, and is `--resume`
sound?), idempotency of anything runnable twice, the block registration and
CPT auto-loading in `functions.php`, `theme.json` schema validity, pattern
block-markup validity, and whether `bin/rename-theme.sh` can corrupt a repo on
an unusual slug.

**Performance.** Server-side: autoloaded options, N+1 queries, uncached
remote calls, work done on every request that could be deferred. Front end:
render-blocking assets, layout shift, image sizing and `loading`/`decoding`
attributes, font loading strategy, and whether the fluid-type implementation
does what item 7 of the contract claims.

**Architecture and maintainability.** Duplication, dead code, leaky
abstractions, and — specifically — **claims that nothing enforces**. This repo
leans on "X is true by contract"; several such claims are load-bearing for
correctness. Find every one and report whether an actual assertion backs it.

## Ground rules

- **Evidence, not vibes.** Every finding needs `file:line`, the concrete
  failure (inputs → wrong behaviour), and a fix. If you cannot state how it
  breaks, do not report it.
- **Verify before reporting.** Read the surrounding code and the callers. A
  finding that dissolves on inspection costs more than a missed one.
- **Rank by severity**, and be honest when severity is low. Do not pad.
- Distinguish *bug* (it is wrong now) from *risk* (it will bite later) from
  *taste* (you would do it differently). Keep taste to a short final section.
- Say plainly what you did **not** cover, and where you ran out of confidence.

## Out of scope — do not spend time here

- `.claude/skills/` — vendored from WordPress/agent-skills, overwritten by an
  installer, and explicitly not ours to edit.
- `node_modules/`, `vendor/`, `build/` — dependencies and compiled output.
- `planning/` — gitignored scratch.
- Dependency CVEs. Dependabot watches this repo and its advisories are triaged
  on their own cadence, so re-listing them costs your budget and tells us
  nothing. Do report any *use* of a dependency that is unsafe regardless of
  version — that is the part no scanner covers.

## Output

A single prioritised report. Lead with the findings that would change what
someone does today, then the rest by severity. Group by area. At the end, list
the areas you reviewed and found clean — that is as useful as the defects, and
it tells me where your confidence actually lies.
