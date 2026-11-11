<!-- project-intro:start -->

# Futurebase WP

**A WordPress block-theme starter for accessible, maintainable client websites.**

Futurebase WP gives developers a starting point for custom WordPress sites:
native Site Editor templates, reusable section patterns, and a design system
defined in `theme.json`. It includes the build tools, checks, and project
workflow used to turn that foundation into a client-owned theme.

Built on [them.es/starter-fse](https://github.com/them-es/starter-fse), it includes:

-   **Block-theme foundations:** composable patterns, style variations, fluid
    typography, and a curated editor.
-   **Development tooling:** `@wordpress/scripts`, SCSS, Docker-based `wp-env`,
    block and post-type scaffolds, and installable ZIP packaging.
-   **Quality checks:** WordPress coding standards, PHPStan, automated
    accessibility checks, and Lighthouse regression budgets.
-   **An optional companion SEO plugin:** developed here, built and deployed separately.
-   **Optional delivery tools:** lead workspaces, baseline measurements,
    before/after reports, and project closeout.
-   **AI-assisted development support:** repository instructions and vendored
    WordPress skills for Codex and Claude Code.

This is a developer starter: expect to adapt its tokens, patterns, content,
and editor choices to each project. See the [product overview](docs/futurebase-wp.md)
for the wider context.

The [compatibility workflow](.github/workflows/wordpress-compatibility.yml)
checks the supported WordPress floor and latest stable release.

[Get started](#get-started) · [Development](#local-development) ·
[Validation](#validation-and-accessibility) · [Documentation](#documentation)

<!-- project-intro:end -->

## Hosting baseline

Sites built with this starter require **WordPress 6.9+ and PHP 8.3+**.
For new deployments, use current stable WordPress and PHP 8.5. Minimum
compatibility, recommended hosting, and verified versions are distinguished in
the [dependency policy](docs/dependency-policy.md) and
[release evidence](docs/release-readiness.md).

For local development:

| Tool                | Requirement                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| Node.js and npm     | Node 26 LTS by default (`.nvmrc`); Node 22/24 supported; npm 11.16+ |
| PHP and Composer    | PHP 8.3+ and Composer 2 for the local PHP checks                            |
| Docker              | A running Docker environment with Compose for `wp-env`                      |
| Git and shell tools | Git, Bash, Perl, and standard Unix utilities                                |
| Packaging tools     | `rsync`, `zip`, and `unzip` for release ZIPs and their checks               |

The shell scripts assume a Unix-like environment; use WSL on Windows.
Local WordPress and PHP versions are pinned in [`.wp-env.json`](.wp-env.json)
to 6.9 and 8.3. CI also gates current stable WordPress/PHP 8.5, with the full
PHP 8.3–8.5 matrix scheduled and run for releases.

<!-- template-setup:start -->

## Get started

### Try the starter locally

Clone the repository, then follow [Local development](#local-development):

```bash
git clone https://github.com/kicobi/futurebase-wp.git futurebase
cd futurebase
```

### Create a new project

Use GitHub's **Use this template → Create a new repository**, then clone your
new repository. This requires the source repository's **Template repository**
setting to be enabled.

Alternatively, with [GitHub CLI](https://cli.github.com) installed and
authenticated, replace `your-account` with your own user or organization:

```bash
gh repo create your-account/acme-client \
  --template kicobi/futurebase-wp --private --clone
cd acme-client
```

Rename the theme **before writing project code**. Replace the example identity
with your own:

```bash
npm run rename -- acme-client \
  --theme-name "Acme Client" \
  --theme-version 1.0.0 \
  --theme-uri https://example.com \
  --repository your-account/acme-client \
  --contributors "your-account"
composer update --lock --no-install --no-interaction
```

Slugs must start with a lowercase letter and contain lowercase letters, digits,
and single separating hyphens. They must not contain `futurebase`.
The rename script runs without installed npm dependencies; the Composer
command refreshes the lockfile hash after the package identity changes.

The script updates the theme name, version, text domain, PHP prefixes, pattern
namespaces, repository metadata, and companion plugin identity. It also
replaces this introduction, removes template-only setup and product assets,
and preserves the companion plugin's permanent data keys. Use the script
rather than a global search-and-replace.

Before continuing:

-   Match the checkout directory to your theme slug.
-   Review the description, tags, author, and author URI in `style.css`,
    contributors in `readme.txt`, and author in `package.json`. Kicobi author
    fields are preserved by the rename and need your review.
-   Add your own `screenshot.png`; the starter's branded screenshot is removed.
-   Regenerate translation files in `languages/` when preparing a release.

Continue with [Local development](#local-development), then run the checks
under [Validation](#validation-and-accessibility).

If you already have a lead workspace, use the
[lead promotion workflow](docs/project-lifecycle.md#2-promotion-lead--active)
instead of creating and renaming a second project by hand.

<!-- template-setup:end -->

## Local development

Run these commands from the repository root with Docker running:

```bash
npm install --global npm@11.16.0
npm ci
composer install
npm run build
npm run build:seo
npm run env:start
npm run env:cli -- theme activate "$(basename "$PWD")"
```

The theme activation command uses the checkout directory name, which is how
`wp-env` mounts the theme. Building the companion plugin is separate from
building the theme; both are mounted by the default local configuration.

Open the URL printed by `env:start`. It normally starts at
`http://localhost:8888`, but `--auto-port` selects another port if needed.
The local [wp-env](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/)
admin is at `/wp-admin/`, with username `admin` and password `password`.

### Load the demo content

On a disposable local instance, import the fixture to explore the patterns
and provide the pages used by the accessibility and performance checks:

```bash
npm run demo:import -- --force
```

**This deletes the local site's existing content and uploads before importing
the demo.** It also activates the theme. Use a separate instance if you need
to preserve your current work.

### Everyday commands

| Command                            | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `npm run start`                    | Watch the theme's `assets/main.js` and `assets/main.scss` |
| `npm run start:blocks`             | Watch custom blocks under `src/blocks/`                   |
| `npm run start:seo`                | Watch the companion plugin's assets                       |
| `npm run build`                    | Build the theme and its custom blocks into `build/`       |
| `npm run build:seo`                | Build the companion plugin's assets                       |
| `npm run block:new -- author-card` | Scaffold a theme-bound dynamic block                      |
| `npm run cpt:new -- case-study`    | Scaffold a theme-coupled custom post type                 |
| `npm run env:cli -- plugin list`   | Run WP-CLI inside the local environment                   |
| `npm run env:reset`               | Reset wp-env databases (destructive; `env:clean` remains an alias) |
| `npm run env:stop`                 | Stop the containers while preserving their data           |

Compiled theme and plugin assets are committed. Include the relevant build
output when changing source assets. Theme builds handle an empty
`src/blocks/` directory without error.

Prefer core blocks, patterns, variations, and block bindings before creating
a custom block. Reusable blocks and content types that must survive a theme
change belong in a plugin. See [block authoring](docs/block-authoring.md),
[block bindings](docs/block-bindings.md), and [post types](docs/post-types.md).

## Validation and accessibility

For the starter's runtime checks, first [load the demo](#load-the-demo-content)
in a disposable instance. For an existing client site, adapt the shared page
set in [bin/\_page-set.sh](bin/_page-set.sh) to real pages before auditing.

```bash
npm run verify
```

This runs the block-theme contract checks, identity/version and rename checks,
builds, JS/CSS/package linting, PHPCS, PHPStan, and companion plugin package
checks. It also runs accessibility checks when the local site is reachable.

**A passing `verify` does not mean accessibility was tested if wp-env is
unavailable.** In that case it prints a warning and skips that stage. After
loading the demo fixture, run the accessibility check directly:

```bash
npm run a11y
```

The runner discovers the actual local URL, confirms this theme is active,
and checks the shared fixture page set at desktop and mobile widths. It
fails if the site is unavailable, the wrong theme is active, or pa11y reports
WCAG2AA errors. The theme includes skip-link support, focus styles, and
reduced-motion handling; manual keyboard, screen-reader, and zoom checks
are still needed for each project's content and interactions.

For focused checks, use `npm run lint:js`, `npm run lint:css`,
`npm run lint:pkg`, `composer phpcs`, or `composer phpstan`.
PHPStan is configured at level 6 with the PHP 8.3 target.
`composer test:minimum-api` checks the PHP and WordPress version floors.
Run `npm run test:navigation`, `npm run test:seo`, and
`bin/test-theme-runtime.sh` in disposable WordPress for behavioral checks.
After building both assets, `bin/test-release-install.sh` installs both ZIPs
in its own empty WordPress and runs runtime/accessibility checks there.

Performance measurement and its limits are documented in the
[scorecard guide](docs/scorecard.md). Local `npm run scorecard -- --force`
resets the demo content before running Lighthouse and accessibility checks.
CI scores are regression evidence, not a promise of production performance.

## Package and deploy

```bash
npm run package:check
npm run package:seo:check
```

These commands build, create, and validate separate installable archives:

-   `.dist/<theme-slug>.zip` — install under **Appearance → Themes**.
-   `.dist/<theme-slug>-seo.zip` — install under **Plugins**, if using the companion.

The theme ZIP contains runtime files and compiled assets. Development tools
and companion plugin code are excluded. To package without the archive
checks, use `npm run package` or `npm run package:seo`.

See [deployment](docs/deployment.md) for the deployment checklist and
[SEO](docs/seo.md) for choosing the site's SEO provider.

## Repository structure

```text
assets/                  Theme JS, SCSS, images, and fonts
build/                   Compiled theme assets and theme-bound blocks
templates/               Site Editor templates
parts/                   Header, footer, and other template parts
patterns/                Page and section patterns
styles/                  Theme style variations
src/blocks/              Theme-bound custom block source
inc/                     Theme PHP, navigation migration, and post-type scaffolds
plugins/futurebase-seo/   Independently packaged SEO companion
fixtures/                Demo content importer
bin/                     Build, scaffold, validation, and packaging scripts
tools/project-system/    Optional project lifecycle CLI
docs/                    Architecture, workflows, and reference guides
theme.json               Design tokens and editor configuration
functions.php            Theme setup and registration
AGENTS.md / CLAUDE.md     Instructions for AI coding assistants
```

## Optional tools

### Project lifecycle

The CLI in [tools/project-system](tools/project-system/README.md) supports
isolated lead workspaces, promotion into client repositories, baseline and
final measurements, success metrics, and evidence-backed closeout.
It is separate from the theme runtime.

Install its dependencies when using the CLI or running its tests:

```bash
npm ci --prefix tools/project-system --ignore-scripts
```

Keep prospective client planning in isolated lead workspaces, outside this
starter. The repository's gitignored `planning/` directory is for
starter-development notes. Start with the [lifecycle guide](docs/project-lifecycle.md)
and [baseline guide](docs/baseline-system.md).

### ACF Pro

ACF Pro is optional and is not bundled. The theme works without it.
For projects that use it, [ACF Pro setup](docs/acf-pro-setup.md) covers local
installation, production setup, and license configuration.
Local `auth.json` and `.wp-env.override.json` files are gitignored.

### AI coding assistants

AI tools are optional. [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md)
describe the repository's WordPress conventions and validation expectations.
The vendored skills in `.codex/skills/` and `.claude/skills/` come from
[WordPress/agent-skills](https://github.com/WordPress/agent-skills).

The instructions also reference user-installed Every Layout and Inclusive
Components skills. Those private reference materials are not included in
this repository; the applicable house rules are summarized in the agent
instructions and still apply when the expanded references are unavailable.

Claude Code's `PostToolUse` hook runs `npm run lint` after edits.
That is a JS check; use the validation commands above for the wider checks.

<details>
<summary>Updating the vendored WordPress skills</summary>

Build and install the selected skill pack from a separate upstream checkout:

```bash
git clone https://github.com/WordPress/agent-skills.git /tmp/agent-skills
cd /tmp/agent-skills
node shared/scripts/skillpack-build.mjs --clean
node shared/scripts/skillpack-install.mjs \
  --dest=/absolute/path/to/your/repo \
  --targets=codex,claude \
  --skills=wordpress-router,wp-project-triage,wp-block-development,wp-block-themes,wp-plugin-development,wp-rest-api,wp-interactivity-api,wp-abilities-api,wp-wpcli-and-ops,wp-performance,wp-phpstan,wp-playground
```

Review the generated diff before committing. Keep repository-specific
overrides in the root agent instructions or `docs/`; the installer overwrites
vendored skill files.

</details>

## Documentation

| Topic                      | Start here                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Building from a design     | [Site-building workflow](docs/process/site-building-workflow.md), [design intake](docs/process/design-intake-checklist.md), [design-system tokens](docs/process/design-system.md) |
| Templates and patterns     | [Pattern composition](docs/pattern-composition.md), [homepage build spec](docs/homepage-build-spec.md)                                                                            |
| Blocks and dynamic content | [Block authoring](docs/block-authoring.md), [block bindings](docs/block-bindings.md), [post types](docs/post-types.md)                                                            |
| Naming and assets          | [Conventions](docs/conventions.md), [media conventions](docs/media-conventions.md), [weight vs. size](docs/weight-vs-size-terminology.md)                                         |
| SEO and plugins            | [SEO stance](docs/seo.md), [companion README](plugins/futurebase-seo/README.md), [plugin strategy](docs/plugin-strategy.md)                                                       |
| Project delivery           | [Lifecycle](docs/project-lifecycle.md), [baselines](docs/baseline-system.md), [content workbook](docs/process/content-workbook.md)                                                |
| Releases and measurements  | [Deployment](docs/deployment.md), [scorecard](docs/scorecard.md)                                                                                                                  |

The editor intentionally limits custom color, gradient, font-size, and spacing
choices through `theme.json`. Theme setup in `functions.php` also removes
core and remote pattern libraries, the block-directory inserter, and Openverse.
Review these choices when adapting the starter to your editors' needs.

## Troubleshooting

-   **The default WordPress theme appears:** run the activation command in
    [Local development](#local-development). Mounting the repository alone is
    not enough.
-   **The site is on a different port:** use the URL printed by `env:start`,
    or run `npm run env:cli -- option get home`.
-   **A port is still blocked:** inspect `docker ps` and stop the owning
    project's environment with `npm run env:stop` from that project directory.
-   **Accessibility checks lack demo pages:** load the demo fixture in a
    disposable environment. For client content, adapt the shared page set in
    [bin/\_page-set.sh](bin/_page-set.sh).
-   **You need to reset local data:** `npm run env:reset` wipes the wp-env
    databases; `npm run env:destroy` removes the environment and its volumes.
    Both are destructive.

## Contributing

Use the repository's issue tracker for reproducible bugs and proposed
changes. Include the affected command or page, WordPress
and PHP versions, and steps to reproduce.

Keep pull requests focused and follow the existing WordPress conventions.
Run the checks relevant to your change, describe what you verified, and
include regenerated assets when source assets change. For theme or plugin
changes, run `npm run verify` and the relevant package check; for lifecycle
changes, run `npm test --prefix tools/project-system`.
Review dependency updates as tooling changes, including their effect on
local builds and CI.

## License and credits

[GPL-2.0-or-later](LICENSE). Based on the original
[them.es starter-fse](https://github.com/them-es/starter-fse) theme.
Vendored WordPress agent skills retain their upstream
[license](https://github.com/WordPress/agent-skills/blob/trunk/LICENSE).

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities
privately using [SECURITY.md](SECURITY.md), not a public issue.
