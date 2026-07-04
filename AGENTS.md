# AGENTS.md

## Scope

This is a modern WordPress codebase. Default to Gutenberg-era and block-theme-era patterns.
Treat pre-block-editor patterns as legacy unless the task explicitly targets legacy code.

## First move on every WordPress task

1. Classify the task before editing:
   - block
   - theme / FSE
   - plugin architecture
   - REST / admin / permissions
   - interactivity
   - performance
   - WP-CLI / ops / local environment

2. Use the matching project skill:
   - `wordpress-router`
   - `wp-project-triage`
   - `wp-block-development`
   - `wp-block-themes`
   - `wp-plugin-development`
   - `wp-rest-api`
   - `wp-interactivity-api`
   - `wp-abilities-api`
   - `wp-wpcli-and-ops`
   - `wp-performance`
   - `wp-phpstan`
   - `wp-playground`

3. Detect and preserve existing repo conventions before changing code:
   - package manager from lockfile
   - build tooling
   - coding standards
   - PHP autoloading structure
   - theme vs plugin boundaries
   - test and lint commands

## Project lifecycle & lead workspaces

This repo carries the **project lifecycle system** in `tools/project-system/` —
isolated lead workspaces, promotion into active projects, baselines, and success
metrics. See `docs/project-lifecycle.md` and `docs/baseline-system.md`.

- Prospective client work does **not** happen in this repo. New client planning
  lives in a local, isolated lead workspace under `~/Sites/leads/<slug>/`
  (`wp-starter lead init`). Keep client-specific analysis there.
- `/planning/` (gitignored) is for starter-development scratch only.
- An awarded lead is **promoted** (`wp-starter lead promote <slug>`), which wraps
  the existing template + `npm run rename` flow and copies the dossier into
  `.project/`. Do not convert a lead by hand.
- `bin/rename-theme.sh` does not scan `tools/` — templates there carry literal
  starter-identity references, not client slugs.

## WordPress defaults

- Reusable custom blocks belong in a plugin unless the task is explicitly theme-only.
- Define blocks with `block.json`.
- Register blocks on both server and client.
- Prefer block supports, variations, patterns, and metadata over one-off custom implementations.
- Use `theme.json` as the source of truth for tokens, spacing, typography, colors, and editor/frontend styling when the repo is a block theme.
- Prefer templates, template parts, patterns, and style variations over duplicated hardcoded markup.
- For interactive frontend block behavior, prefer the Interactivity API and `viewScriptModule`.
- Use namespaces, autoloading, and clear separation of PHP / JS / CSS / render logic in larger plugins.
- Sanitize input, escape output, verify capabilities, and use permission callbacks / nonces where relevant.

## Tooling rules

- Keep the existing build chain unless explicitly asked to migrate it.
- Do not switch package manager.
- Do not add a JS framework or external dependency unless the repo already uses it or the user asked for it.
- If the repo uses `@wordpress/scripts`, keep it.
- If the repo uses `@wordpress/build`, keep it.
- Only recommend migration when there is a concrete project benefit and the user asked for that decision.

## Change policy

- Make the smallest viable change first.
- Preserve backward compatibility where practical.
- When changing block attributes or saved markup, check whether a deprecation is required.
- Do not rewrite large areas of code to “modernize” them unless that is the task.
- Avoid regex-based manipulation of serialized block markup when block APIs or parser-based approaches are available.

## Validation

Run the narrowest relevant existing checks after changes.

JS / TS:
- build
- lint
- typecheck
- targeted tests

PHP:
- phpcs
- phpstan
- phpunit

WordPress-specific:
- block registration / build validation
- wp-env / Playground / local WP checks when configured
- relevant WP-CLI checks if available

If a command is missing, say so clearly and use the next-best validation.

## Review checklist

For any WordPress UI change, verify:
- editor behavior
- frontend behavior
- responsive behavior
- accessibility basics
- i18n readiness

For any block change, verify:
- attributes
- serialization safety
- deprecations
- supports / styles / variations
- PHP render behavior if dynamic

For any plugin or API change, verify:
- permissions
- sanitization / escaping
- backward compatibility
- error handling

## Output style

Be concise.
Explain why a change follows WordPress conventions when it is not obvious.
When there are tradeoffs, prefer the option closest to WordPress core patterns and the existing repo structure.

## Skill pack caveats

The skills in `.codex/skills/` are vendored from [WordPress/agent-skills](https://github.com/WordPress/agent-skills) and are ecosystem-wide. A few upstream defaults are superseded by this repo:

- **PHP floor.** Skill guidance cites a PHP 7.2.24+ floor. This repo requires **PHP 8.3+** (see README *Hosting baseline*). Write for 8.3 — typed properties, constructor promotion, first-class callable syntax are fine.
- **WordPress floor.** Skills target broad compatibility. This repo requires **WordPress 6.9+**, which means per-block-style variations in `theme.json`, focus-state styling under `styles.elements`, fluid typography, and the block-theme skip-link auto-injection all work natively — prefer them over older polyfill patterns. Inline `core/navigation` in parts is acceptable seed markup and core will create a fallback `wp_navigation` post when none is referenced; to make a menu the single editable source, add `"ref":<id>` to the block.
- **Don't edit the vendored files.** `.codex/skills/*` is overwritten by the installer documented in the README. Repo-specific overrides, tightened rules, or local conventions belong in this `AGENTS.md` or `docs/*.md` — never inside `.codex/skills/`.