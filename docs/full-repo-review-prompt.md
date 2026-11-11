# Full-repository review guide

Give the prompt below to a reviewer together with the exact commit and the
[release evidence](release-readiness.md). Review the current source, not only a
prior audit or generated score. Use [fix-verification-prompt.md](fix-verification-prompt.md)
after remediation. Last refreshed: 2026-11-11.

---

Review this public GitHub developer starter for reproducible defects in
correctness, security, accessibility, performance, and maintainability. Read
`AGENTS.md`, `CLAUDE.md`, the README, and the relevant supporting docs first.
Use existing WordPress block-theme patterns and the npm/Webpack build chain.

## Scope and boundaries

1. **Theme:** `functions.php`, `inc/`, `theme.json`, `style.css`, `assets/`,
   `src/`, `patterns/`, `templates/`, `parts/`, and `styles/`. WordPress 6.9 /
   PHP 8.3 minimum. Review native blocks, translation/escaping, serialized
   markup, saved Site Editor overrides, copyright bindings, comment states,
   empty queries, and navigation ownership/keyboard behavior.
2. **Optional companion SEO plugin:** `plugins/*-seo/`, its README and
   permanent contract manifest. Review core REST permissions, revisions,
   media controls, canonical and indexing coherence, pretty/plain routing,
   pagination, exact query-key identity, premium-provider suppression,
   sitemaps, diagnostics, and database failure handling. Keep stored
   `compseo` keys/hooks and CLI JSON fields stable across promotion.
3. **Lifecycle CLI:** `tools/project-system/`, including its independent npm
   lockfile. Review path containment, symlinks, Git-ignore/secret boundaries,
   quoted and repeated credentials, promotion recovery, identity invariants,
   dependency synchronization including optional dependencies/workspaces,
   crawl origin/redirect validation, response-body deadlines, URL redaction,
   and complete piped JSON with correct exit status. Use synthetic secrets.
4. **Development/release tooling:** `bin/`, `fixtures/`, all workflows,
   Dependabot, package/Composer manifests and lockfiles, build/lint/static
   analysis configuration, and performance budgets. A green check that
   exercises HEAD instead of current source, the wrong theme, missing pages,
   or stale installed dependencies is a defect.

The starter homepage contract is enforced by parsed checks in
`bin/verify-contract.mjs` (items 1, 3, 4, 5, 7, 9), PHPCS (text-domain naming),
and human review (layout choices and one source of truth per block style).
Read the negative tests; do not assume a check proves what its name says.
Reusable cross-project functionality belongs in plugins. Theme-owned styling
and composition stay in core blocks, supports, patterns, and `theme.json`.

## Verification

Start from a clean install, keeping local/user changes safe:

```sh
npm ci
npm ci --prefix tools/project-system
composer install --prefer-dist
node --test bin/*.test.mjs
npm test --prefix tools/project-system
npm run lint:js
npm run lint:css
npm run lint:pkg
composer phpcs
composer phpstan
composer test:minimum-api
npm run build
npm run build:seo
npm run package:check
npm run package:seo:check
```

Use npm 11.16+ and the supported Node versions in `package.json`. Check both
npm audits and Composer audit, distinguish runtime exposure from tooling,
and investigate high/critical findings. The [dependency policy](dependency-policy.md)
explains scoped overrides and the known low-severity upstream advisory.

Run the navigation, theme, and SEO runtime suites in disposable WordPress.
`bin/test-release-install.sh` creates an empty separate instance, installs both
ZIPs, runs runtime checks, and checks all nine accessibility pages at desktop
and mobile sizes. Validate a renamed client too with
`bash bin/test-rename.sh --require-template --runtime`.
Never run a destructive fixture reset against an existing site without its
owner's explicit authorization. `npm run verify` skips runtime accessibility
when wp-env is unavailable; that skip is not a pass.

Check the WordPress 6.9/PHP 8.3 and current WordPress/PHP 8.5 corners, plus
scheduled/release PHP 8.3–8.5 coverage. Check editor and frontend, saved
customizations, comments, empty results, and navigation resizing through
590→650→783px. Verify Escape, focus restoration, and scroll lock. Inspect RTL,
contrast, reduced motion, zoom/reflow, and keyboard operation. Record actual
assistive technology and browser versions; an accessibility tree or automated
pass is not a screen-reader user test or WCAG 2.2 AA certification.

Preserve Lighthouse budgets. Confirm generated assets reproduce from source
and install without development dependencies. Record any unrun remote CI,
physical-device, browser, or manual accessibility gates explicitly.

## Exclusions and reporting

Do not edit vendored `.codex/skills/` or `.claude/skills/`, dependencies,
private reference books/skills, or gitignored planning/client records. Inspect
compiled output for consistency, but fix source files and rebuild. Do not
publish credentials or private dossier content in findings.

Report actionable findings with priority, file/line, trigger, impact, a minimal
reproduction, and a proportionate fix. Distinguish confirmed bugs from risks
and preferences. List reviewed areas and verification limits. Do not claim
perfection or certification from a tool score. Jev Review is a contextual
scalar feedback loop; diagnose its weak signals independently and pass the
previous evaluation when rescoring a meaningful fix.
