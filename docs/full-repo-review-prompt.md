# Full-repo review prompt

Everything below the line is the prompt. Hand it to an external reviewer —
Codex, another model, a person — when you want the whole repo examined rather
than a diff. Keep the scope and directory claims current when the shape of the
repo changes; a prompt that misdescribes the codebase wastes the reviewer's
first hour. Avoid source counts here — they become stale without changing the
review boundary.

```bash
codex exec "$(cat docs/full-repo-review-prompt.md)"
```

Run once, 2026-07-30, against `4afba11`. Thirteen findings, all addressed in
PRs #65–#71; the ones worth knowing about as prior art are in those
descriptions. Do not paste that history into the next run — a reviewer told
what was previously found tends to find it again.

Prompt last refreshed 2026-08-03 against `79e22b3` (CI/release surface added as
a fourth codebase, contract-enforcement split stated precisely, `.codex/skills`
and run-artefact directories put out of scope).

When the findings from a run have been fixed, review the fixes with
[fix-verification-prompt.md](fix-verification-prompt.md) before considering the
round closed. The first time that was done it found nine defects in the fixes,
four of them P1 — so the step is not ceremonial.

---

Do a complete, top-to-bottom review of this repository. Correctness, security,
accessibility, performance, architecture, and maintainability. Be adversarial:
your job is to find what is actually wrong, not to summarise what the code does.

## What this repo is

A WordPress **block theme starter** that doubles as a **project lifecycle
system**. Two distinct codebases share one checkout, with different threat
models and different standards:

1. **The theme** — a WordPress 6.9+ / PHP 8.3+ block theme.
   `functions.php`, `inc/`, `theme.json`, `style.css`, `patterns/`,
   `templates/`, `parts/`, `src/`, `assets/`, and `styles/`. Output is
   web-facing and renders untrusted
   content (post content, user input via search/comments).

2. **The project-system CLI** — the Node code under `tools/project-system/`
   (`commands/`, `lib/`, schemas, templates, and tests). It creates isolated "lead"
   workspaces, promotes them into real GitHub repos from a template, captures
   performance baselines, and syncs starter fixes into already-promoted client
   projects. It shells out to `git`, `gh`, `wp`, and a headless browser, reads
   and writes YAML records, and validates against JSON schemas.

3. **The scripts in `bin/`** — rename, verify, package, scaffold, demo content,
   migration tests, scorecard, and smoke tests. Several are destructive (`wp site empty`),
   several rewrite the entire repo in place (`rename-theme.sh`). Two are Node,
   not shell: `verify-contract.mjs` (with its own test file) and
   `verify-version-surfaces.mjs`.

4. **The CI and release surface** — `.github/workflows/ci.yml` and
   `scorecard.yml`, `.github/dependabot.yml`, the packaging path
   (`package-theme.sh` → `test-package.sh` → `.dist/`), and the lint/analysis
   configs at the root (`phpcs.xml.dist`, `phpstan.neon.dist`,
   `.pa11yci.json`, `lighthouserc-*.json`, `eslint.config.js`,
   `.stylelintrc.json`). A check that runs but asserts nothing is a finding.

Read `CLAUDE.md` first — it states the project's own rules — then `AGENTS.md`,
then `docs/`, then `tools/project-system/README.md` and `ARCHITECTURE.md`.

## The theme's own contract

`CLAUDE.md` defines a nine-item "Technical Contract" for the homepage workflow
(tokens-only colour/spacing, no custom layout CSS, patterns compose while
templates wire, section patterns not page patterns, role-not-format media
references, one source of truth per block style, fluid typography, text domain
= theme slug, no ghost `customTemplates` entries). `bin/verify-theme.sh`
enforces six of the nine — items 3, 4, 5, 7 and 9 by parsing block markup and
`theme.json` in `bin/verify-contract.mjs`, item 1 in the shell script, item 8
via `composer phpcs`. Items 2 and 6 rely on review discipline.

`bin/verify-contract.test.mjs` is supposed to feed every check markup that must
fail it, so a check cannot quietly stop checking. Audit that claim: a check
whose negative test does not actually exercise it is the failure mode this
whole arrangement exists to prevent.

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

- `.claude/skills/` and `.codex/skills/` — vendored from
  WordPress/agent-skills, overwritten by an installer, and explicitly not ours
  to edit.
- `node_modules/`, `vendor/`, `build/`, `.dist/`, `.artifacts/`,
  `.lighthouseci/` — dependencies, compiled output, and run artefacts.
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
