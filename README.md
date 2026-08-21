<!-- project-intro:start -->
# Futurebase WP

**A futureproof base for accessible, maintainable WordPress websites.**

Futurebase is the product family. Futurebase WP is its WordPress foundation: a modern Full Site Editing base with AI agent guardrails baked in. See [docs/futurebase-wp.md](docs/futurebase-wp.md) for the canonical product narrative and [docs/scorecard.md](docs/scorecard.md) for the evidence model behind it.
<!-- project-intro:end -->

## What this is

A private WordPress foundation intended to be used as a [GitHub template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository) for spinning up WordPress client sites. Built on top of [them.es/starter-fse](https://github.com/them-es/starter-fse), with:

- **PHP 8.3+ / WordPress 6.9+ floor** — see "Hosting baseline" below
- `@wordpress/scripts` + SCSS build pipeline
- An intentionally light theme layer that leans on modern block-theme defaults
- `wp-env` for local development (Docker)
- PHPCS (WordPress Coding Standards) + PHPStan (`szepeviktor/phpstan-wordpress`)
- AI agent skills preinstalled in `.claude/skills/` and `.codex/skills/` from the official [WordPress/agent-skills](https://github.com/WordPress/agent-skills) pack
- Repo-level `AGENTS.md` (Codex) and `CLAUDE.md` (Claude Code) to keep agents on modern Gutenberg-era patterns
- A `PostToolUse` hook in `.claude/settings.json` that runs `npm run lint` after Claude edits

## Hosting baseline

**This starter targets modern managed/VPS WordPress hosting and current local dev stacks.** The PHP floor is **8.3**, the WordPress floor is **6.9**.

This is stricter than both WordPress core (which only requires PHP 7.4 in WP 7.0) and the upstream `WordPress/agent-skills` pack (PHP 7.2.24+). That is intentional — the target is Kinsta, WP Engine, Pressable, Pantheon, Rocket.net, Cloudways, and equivalent hosts, plus modern local dev (wp-env, Studio, LocalWP with PHP 8.3+).

**Do not use this template as a base for projects targeting legacy shared hosts.** Fork a different starter for those.

Dependency updates are reviewed as build-tooling changes, even when automated:
rebase the update, inspect its direct and transitive changes, and run the full
verification stack before merging. An alert in a development-only dependency
does not affect the shipped theme runtime, but it can still affect local builds
and CI.

### Tested against

| Package | Version |
| --- | --- |
| `@wordpress/scripts` | `34.0.0` |
| `@wordpress/env` | `11.12.0` |
| WordPress | 6.9 |
| PHP | 8.3 |

<!-- template-setup:start -->
## Quick start with GitHub CLI

Requires [`gh`](https://cli.github.com) authenticated (`gh auth login`). The template repo must have the **Template repository** setting enabled on GitHub.

```bash
gh repo create kicobi/<new-project-name> --template kicobi/futurebase-wp --private --clone
cd <new-project-name>
npm run rename -- <theme-slug> \
  --theme-name "<Theme Name>" \
  --theme-version 1.0.0 \
  --theme-uri https://kicobi.com \
  --repository kicobi/<new-project-name>
composer update --lock --no-install --no-interaction
npm install && npm ci --prefix tools/project-system --ignore-scripts && composer install
npm run env:start
```

`<theme-slug>` follows the rename rules below (lowercase, dashes only, no underscores). Typically matches `<new-project-name>`, but doesn't have to.

For the web-based flow, see the next section.

## Creating a new project from this template manually

Enabling and verifying GitHub's **Template repository** flag is a manual repository-settings step on GitHub. Confirm that setting before relying on the **Use this template** flow below.

1. On GitHub, confirm the repository has **Template repository** enabled, then click **"Use this template → Create a new repository"**.
2. Clone the new repo locally into `wp-content/themes/<your-slug>/` (or anywhere, if using `wp-env`).
3. Run the **rename checklist** below *before* writing any project code.
4. `npm install && npm ci --prefix tools/project-system --ignore-scripts && composer install`.
5. `npm run env:start` to boot a local WordPress at `http://localhost:8888` (admin at `/wp-admin`, user `admin` / password `password`).

## Rename checklist (mandatory on every new project)

The template ships with the slug `futurebase` everywhere. **Use the rename script** — doing this by hand is error-prone because the rename spans PHP, JSON, HTML, XML, shell scripts, and Markdown.

```bash
npm run rename -- acme-client \
	--theme-name "Acme Client" \
	--theme-version 1.0.0 \
	--repository acme/acme-client \
  --contributors "acme, jsmith" \
  --theme-uri    https://example.com
```

The positional `<slug>` is mandatory. Theme name defaults to the title-cased slug and version defaults to `1.0.0`; promotion supplies every identity field explicitly.

The script performs the following edits in one pass:

1. **Theme slug** — lowercase, dashes only, no underscores (e.g. `acme-client`, not `acme_client` or `AcmeClient`).
2. **Text domain** = theme slug. Replaces `'futurebase'` → `'<slug>'` in every PHP i18n call.
3. **Function prefix** — slug converted to `snake_case`. Replaces `futurebase_` → `<slug_snake>_`.
4. **Constant prefix** — the same prefix in caps. Replaces `FUTUREBASE_` → `<SLUG_SNAKE>_`, covering PHP global constants and the one env var (`FUTUREBASE_DIST_DIR`) spelled that way. They share the global namespace `phpcs` checks against the renamed `prefixes` property, so a constant left behind fails lint.
5. **Pattern slugs** — every `futurebase/…` pattern slug becomes `<slug>/…` in both pattern headers and template `wp:pattern` references.
6. **Display identity** — updates the theme name, WordPress readme title, PHP docblocks, and the managed client README introduction.
7. **Client version** — updates `style.css`, `readme.txt`, `package.json`, and both root-package version fields in `package-lock.json`.
8. **Repository identity** — updates Theme URI, npm repository/homepage/bugs fields, and the Composer vendor/package when `--repository` is supplied.
9. **`phpcs.xml.dist`** — updates the dashed text domain and snake-case prefix independently.
10. **Client readme history** — resets `readme.txt` to one initial client release and leaves exactly one Futurebase WP provenance sentence in `README.md`.
11. **Companion plugin identity** — renames `futurebase-seo` to `<slug>-seo`, including its bootstrap, display name, namespace, text domain, constants, asset handles, and configuration paths, while preserving every neutral `compseo` database key and hook.
12. **Base-only product material** — removes the Futurebase WP narrative, company-site brief, social image, and branded theme screenshot from the client checkout while rewriting client-owned identity in `docs/`, `src/`, and `inc/`.

Markdown lines that intentionally name the starter, product, or `futurebase` CLI carry the exact `<!-- futurebase-rename: keep-line -->` marker and remain unchanged. Client-specific technical examples continue to be renamed, so no starter-history prose needs manual repair. <!-- futurebase-rename: keep-line -->

Re-running the script with the same arguments is a no-op — the `Contributors:` line isn't duplicated, and already-renamed references don't match the search pattern.

After running, manually review:

- **Directory on disk** — the theme folder name must equal the slug.
- **Theme metadata** — review `Description` and `Tags` in `style.css`, plus `Contributors` in `readme.txt`. The Kicobi author fields intentionally carry into client themes. If you skipped `--theme-uri` or `--contributors`, review those values too.
- **`package.json`** — review the author after repository identity is set.
- **`screenshot.png`** — add a client-branded theme screenshot; the Futurebase WP product screenshot is removed automatically.
- **Translation files** — regenerate `.pot` / `.mo` in `languages/` if you carry them over.

The rename is offline and reconciles npm lockfile identity without package resolution. Because Composer derives its lock hash from the renamed package, finish with `composer update --lock --no-install --no-interaction` before committing.

Run `npm run verify` afterwards to confirm nothing drifted.
<!-- template-setup:end -->

## Troubleshooting

**`npm run env:start` fails with "port already allocated".**
A previous wp-env instance is still running on the same port. Run `docker ps` to find the lingering container, then `npm run env:stop` from the project directory that owns it. If the directory no longer exists, stop the container directly with `docker stop <container-id>` and `docker rm <container-id>`.

## Scripts

```bash
npm run start          # watch theme assets (assets/main.{js,scss})
npm run start:blocks   # watch theme-bound blocks (src/blocks/**)
npm run build          # production build — theme assets + blocks
npm run build:theme    # theme assets only
npm run build:blocks   # blocks only (skips cleanly if src/blocks/ is empty)
npm run build:seo      # separately compile the companion SEO plugin
npm run package:seo:check # validate its independent plugin ZIP
npm run block:new -- <slug> # scaffold a theme-bound block at src/blocks/<slug>/
npm run cpt:new -- <slug>   # scaffold a custom post type at inc/post-types/<slug>.php
npm run lint           # lint JS (same as lint:js; matches the PostToolUse hook)
npm run lint:js        # lint JS
npm run lint:css       # lint SCSS/CSS
npm run lint:pkg       # lint package.json against @wordpress/scripts rules
npm run format         # format source/docs (honours .prettierignore)
npm run verify         # block theme standards + lint + phpcs + phpstan + pa11y
npm run a11y           # pa11y-ci against the local wp-env (expects :8888 — verify probes the real port)
npm run test:navigation # destructive navigation-migration scenarios against disposable wp-env
npm run rename -- <slug> --theme-name "<name>" --theme-version <semver> \
  --theme-uri <url> --repository <owner/repository> [--contributors "foo, bar"]
                       # rename client identity and reconcile root npm-lock metadata offline
npm run env:start      # boot wp-env (latest stable WordPress, theme mounted)
npm run env:stop       # stop wp-env containers (data preserved)
npm run env:destroy    # stop and delete wp-env containers + volumes
npm run env:clean      # wipe the wp-env database (all environments)
npm run env:cli -- ... # run WP-CLI inside wp-env, e.g. `npm run env:cli -- plugin list`

composer phpcs         # PHPCS against WordPress Coding Standards
composer phpcbf        # auto-fix PHPCS issues where possible
composer phpstan       # PHPStan level 6 with WordPress stubs
```

Build scope: `npm run build` runs `build:theme` (compiles `assets/main.{js,scss}`
into `build/`) and then `build:blocks` (compiles `src/blocks/*/block.json` into
`build/blocks/` via `@wordpress/scripts`' standard block discovery). Blocks
auto-register through `futurebase_register_blocks()` in
[functions.php](functions.php) on `init`. A fresh repo with no blocks is fine
— `build:blocks` exits 0 when `src/blocks/` is empty. The companion plugin uses
its own `build:seo` command so theme builds and theme ZIPs never absorb plugin
code.

## AI agents

This repo is set up for two assistants in parallel:

- **Claude Code** reads [CLAUDE.md](CLAUDE.md) and the skills in `.claude/skills/`.
- **Codex** reads [AGENTS.md](AGENTS.md) and the skills in `.codex/skills/`.

### Block theme standards

The agent instructions define a nine-item [Technical Contract](CLAUDE.md#block-theme-standards) scoped to the homepage/front-page workflow — tokens, fluid type, template/pattern separation, role-based media, and others. See CLAUDE.md for the scope boundary (non-homepage templates and site chrome are exempt from specific items) and for which items are CI-enforced versus review-enforced. Supporting docs:

- [docs/pattern-composition.md](docs/pattern-composition.md) — how templates, page patterns, and section patterns fit together.
- [docs/media-conventions.md](docs/media-conventions.md) — the role-not-format rule for images, SVGs, and fonts.
- [docs/weight-vs-size-terminology.md](docs/weight-vs-size-terminology.md) — disambiguating "medium" across size, weight, and spacing.
- [docs/conventions.md](docs/conventions.md) — slug substitution, `[PLACEHOLDER]` grammar, and the `TODO(kind):` comment vocabulary.

### Project workflow

For building a site from a completed Figma design, see [docs/process/site-building-workflow.md](docs/process/site-building-workflow.md). The workflow targets 3-5 working days for a 10-page marketing site by leaning on this template's scaffolding and AI coding assistants. It depends on two supporting documents:

- [docs/process/design-intake-checklist.md](docs/process/design-intake-checklist.md) — defines what "a completed Figma design" means and gates Phase 0 of the build.
- [docs/process/design-system.md](docs/process/design-system.md) — pre-structured token contract between Figma and `theme.json`. Fill it in before Phase 2.

For homepage-only work — or as a build-spec input to an AI agent — see the homepage spec below.

### Using with an AI agent

The homepage build spec lives at [docs/homepage-build-spec.md](docs/homepage-build-spec.md). Fill the `[…]` fields in the paste-block and hand it to the agent. The spec enforces the Technical Contract and runs `npm run verify` (including the a11y gate) before handing back. It also doubles as human documentation of how the homepage was architected — read it without pasting if you're onboarding onto a project.

Both skill directories were installed from [WordPress/agent-skills](https://github.com/WordPress/agent-skills). To update when new skills ship upstream:

```bash
git clone https://github.com/WordPress/agent-skills.git /tmp/agent-skills
cd /tmp/agent-skills
node shared/scripts/skillpack-build.mjs --clean
node shared/scripts/skillpack-install.mjs \
  --dest=/path/to/this/repo \
  --targets=codex,claude \
  --skills=wordpress-router,wp-project-triage,wp-block-development,wp-block-themes,wp-plugin-development,wp-rest-api,wp-interactivity-api,wp-abilities-api,wp-wpcli-and-ops,wp-performance,wp-phpstan,wp-playground
rm -rf /tmp/agent-skills
```

The installer writes into `.claude/skills/` and `.codex/skills/` at the target's root. Review and commit the diff.

### The `PostToolUse` hook

`.claude/settings.json` runs `scripts/ai-after-edit.sh` after Claude's Edit/Write/MultiEdit tools. The script runs `npm run lint` (JS only — fast). Heavier checks (`build`, `phpcs`, `phpstan`) stay as manual scripts; `CLAUDE.md`'s validation order tells the agent when to run them.

## Custom blocks

Most "custom block" requests are better served by a pattern, a block style variation, or ACF block bindings. The full decision table and scaffolding flow live in [docs/block-authoring.md](docs/block-authoring.md).

When a project genuinely needs a theme-bound custom block:

```bash
npm run block:new -- author-card
npm run build
```

The scaffold generates `src/blocks/author-card/` with `block.json`, `index.js`, `edit.js`, and `render.php` (dynamic server render). `npm run build` compiles it to `build/blocks/author-card/`, and `futurebase_register_blocks()` in [functions.php](functions.php) auto-registers every compiled block on `init` — no per-block PHP wiring.

Reusable blocks that should outlive the theme belong in a **companion plugin**, not here. See [docs/block-authoring.md](docs/block-authoring.md#theme-bound-vs-plugin-block) for the rule, and [docs/plugin-strategy.md](docs/plugin-strategy.md) for which in-house plugins that means and how they reach client sites.

For the middle ground — a pattern with fixed shape but dynamic data (author card, pricing tier, meta display) — use **block bindings**. [docs/block-bindings.md](docs/block-bindings.md) covers `acf/field`, `core/post-meta`, and how to register custom binding sources.

## Custom post types

```bash
npm run cpt:new -- case-study
```

Generates `inc/post-types/case-study.php` with a full i18n-ready `register_post_type()` call; the file auto-loads via `futurebase_load_post_types()` in [functions.php](functions.php). Theme-coupled by default — move to a must-use plugin when the site needs CPTs to survive theme swaps. [docs/post-types.md](docs/post-types.md) walks through the ACF UI vs. code decision, taxonomies, post meta + block bindings, and common rewrite gotchas.

## Project shape

```
futurebase/
├── AGENTS.md / CLAUDE.md     # agent instructions
├── .claude/
│   ├── settings.json         # PostToolUse lint hook
│   └── skills/               # WordPress/agent-skills (Claude)
├── .codex/
│   └── skills/               # WordPress/agent-skills (Codex)
├── assets/                   # main.js, main.scss — theme bundle source
├── build/                    # compiled output (committed)
│   ├── main.js/.css/.asset.php
│   └── blocks/<slug>/        # compiled theme-bound blocks
├── parts/                    # template parts
├── patterns/                 # starter patterns and template-only content
├── plugins/
│   └── futurebase-seo/       # separately built and packaged companion plugin
├── src/
│   └── blocks/<slug>/        # theme-bound block source (scaffold via block:new)
├── templates/                # FSE templates
├── bin/
│   ├── build-blocks.sh       # compiles src/blocks/ → build/blocks/
│   ├── new-block.sh          # scaffolds a theme-bound block
│   ├── new-cpt.sh            # scaffolds a custom post type under inc/post-types/
│   ├── rename-theme.sh
│   └── verify-theme.sh
├── inc/
│   ├── navigation-migration.php # versioned navigation adoption/repair
│   └── post-types/<slug>.php    # CPT registrations (auto-loaded)
├── scripts/
│   └── ai-after-edit.sh      # lint hook
├── theme.json                # v3 — primary styling/config
├── functions.php
├── style.css
├── composer.json
├── phpcs.xml.dist
├── phpstan.neon.dist
├── .wp-env.json
└── package.json
```

Reusable blocks and non-theme-specific features belong in a **separately packaged companion plugin**, not in theme runtime. The in-house plugin sources share this repository's CI and promotion tooling under `plugins/`, while producing independent WordPress plugin ZIPs. Themes swap; plugin-registered blocks survive theme changes. That follows [WordPress's own guidance](https://developer.wordpress.org/block-editor/getting-started/fundamentals/registration-of-a-block/) on where custom blocks should live.

## Editor curation

The inserter is pre-trimmed to match a design-system-first workflow. [functions.php](functions.php) (`futurebase_curate_editor`) removes:

- **Block directory** — the "search a plugin block" UI. Admins still install plugins through `wp-admin` normally.
- **Core block patterns** — WordPress's built-in patterns.
- **Remote block patterns** — the WordPress.org pattern directory.
- **Openverse** — the external media category. Local media library is untouched.

[theme.json](theme.json) additionally disables the **custom color, gradient, font-size, and spacing pickers**, so editors can only pick from this theme's presets — no one-off hex values drifting the design system. Delete the relevant lines if a project needs any of them back.

## Deploying

Deployment specifics for the environments this template targets — host-by-host notes, env var conventions, the post-rename checklist, and a minimal CI workflow — live in [docs/deployment.md](docs/deployment.md).

## ACF Pro

Project work typically uses [Advanced Custom Fields Pro](https://www.advancedcustomfields.com/) for custom post types, field groups, and options pages. The template ships the integration scaffolding — a `.wp-env.override.json.example` for local installs and a full recipe at [docs/acf-pro-setup.md](docs/acf-pro-setup.md) covering:

- Local `wp-env` flow (copy the example override, paste your license, `env:start`)
- Production install options (project-level Composer via ACF's endpoint, or host-uploaded plugin)
- License activation via the `ACF_PRO_LICENSE` constant
- How to avoid the wp.org **Secure Custom Fields** (SCF) fork swap that was introduced in October 2024

The template does **not** bundle the plugin or commit your license. `auth.json` and `.wp-env.override.json` are both gitignored.

## Accessibility

- **Skip link** — WordPress 6.9 auto-injects a skip link into every block-theme render, pointing at `#wp--skip-link--target`. Every template's `<main>` carries that `id` so core's link lands correctly. Focus styling (`.skip-link`) is token-driven in [assets/main.scss](assets/main.scss) so the theme's palette and spacing apply to core's injected anchor.
- **Reduced motion** — [assets/main.scss](assets/main.scss) honours `prefers-reduced-motion: reduce` and neutralises animations/transitions for users who request it.
- **Focus styles** — button *and* link `:focus-visible` outlines are defined in [theme.json](theme.json) and inherited by every style variation (see [styles/dark.json](styles/dark.json) for the pattern).
- **Automated a11y gate** — [pa11y-ci](https://github.com/pa11y/pa11y-ci) runs against the live wp-env instance. Defaults in [.pa11yci.json](.pa11yci.json) set the standard (WCAG 2 AA) and Chromium launch args; the URL list is supplied at invocation time. `npm run verify` asks wp-env for its actual home URL (`wp option get home`) — wp-env shifts off the default port 8888 when another project already holds it, so a hardcoded 8888 would silently test the wrong site. When wp-env is reachable the gate is real (any violation fails verify); when it isn't, verify emits a yellow warning and continues so non-a11y workflows aren't blocked. Typical flow: `npm run env:start && npm run verify`. To exercise the gate directly against the default port, `npm run a11y` hits `http://localhost:8888/` and `/?p=1` — edit the script in [package.json](package.json) to add more URLs, or prefer a different tool (axe-core, lighthouse-ci) and swap it in; the script name is the only contract verify looks for.

## License

GPL-2.0-or-later. Original starter theme by [them.es](https://them.es/starter-fse/).
