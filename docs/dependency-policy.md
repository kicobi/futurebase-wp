# Dependency and platform policy

Futurebase is a public GitHub developer starter. `private: true` prevents
accidental npm publication; it does not restrict GitHub visibility.

## Supported and recommended platforms

- **Runtime minimum:** WordPress 6.9 and PHP 8.3. The theme and optional SEO
  plugin share these minimums. The `~6.9.0` WordPress stub constraint and
  PHPStan `phpVersion: 80300` check the floor even on a newer developer machine.
- **New deployments:** current stable WordPress and PHP 8.5. On 2026-11-11 the
  current WordPress release is 7.1.4. PHP 8.3 receives security fixes through
  December 2027; minimum compatibility is not a recommendation to postpone
  supported security updates.
- **Development default:** Node 26 LTS, with Node 22 and 24 also tested. Exact
  supported ranges are in `package.json`; use npm 11.16 or newer and the
  committed lockfile. npm 10 produced an inconsistent lockfile with the current
  dependency graph, so it is no longer supported for dependency resolution.
- **PR gates:** WordPress 6.9/PHP 8.3 and latest stable WordPress/PHP 8.5.
  Scheduled, release, and manual compatibility runs cover both WordPress
  versions on PHP 8.3, 8.4, and 8.5. Node CI covers 22, 24, and 26.

See the [release evidence](release-readiness.md) for versions actually exercised;
a configured matrix is not evidence that its remote jobs have run.

Sources: [WordPress releases](https://wordpress.org/download/),
[PHP support schedule](https://www.php.net/supported-versions.php),
[Node release schedule](https://github.com/nodejs/Release).

## Lockfiles and updates

Run `npm ci`, `npm ci --prefix tools/project-system`, and
`composer install --prefer-dist`. Keep both npm lockfiles and `composer.lock`
committed. Dependabot checks the root, lifecycle tool, Composer, and Actions.
The explicit `prettier` → `wp-prettier` alias keeps the formatter and ESLint
on the WordPress fork required by `wp-scripts`; without it npm selected standard
Prettier and block scaffolding failed before its completion message.
The explicit `proxy-agent` 8.x development dependency satisfies Puppeteer's
optional peer. LHCI retains its own compatible 6.x copy. `npm ls --all` gates
the installed graph: `npm ci` alone did not catch that peer mismatch.

An update needs build, lint, regression, rename, package, and WordPress checks;
passing against an old installed tree does not establish lockfile correctness.

PHP tooling remains WPCS 3.4.1 / PHPCS 3.13.6. WPCS excludes PHPCS 4. Stable
PHPCompatibility releases remain in use; runtime tests and PHPStan complement
that older compatibility scanner. `composer test:minimum-api` proves that an
8.4-only PHP function and a 7.0-only WordPress function are rejected.

## npm overrides

Every override is development-only. Review/remove it when the owning package
accepts the patched version; do not run `npm audit fix --force` blindly.

| Override | Reason and verification boundary |
| --- | --- |
| `@wordpress/env` → `@wp-playground/cli` 3.1.54 | Last compatible release for the supported Node 22 line. Newer Playground pulls PHP-WASM requiring Node 24.18+. Scoped to wp-env; Docker is the supported test runtime. |
| `basic-ftp` ^6.2.6 | Patched FTP helper in development tooling; installed dependency audit and clean build. FTP deployment is not a theme feature. |
| `isomorphic-git` ^1.44.12 | Patched Git implementation in development tooling; clean install and wp-env startup. |
| `serialize-javascript` ^7.1.4 | Patched serialization used by build tooling; theme, plugin, and renamed-project builds. |
| `markdownlint-cli` → `js-yaml` ^5.5.0 | Patched YAML parser in that CLI only; keep lifecycle YAML on its independently locked compatible 4.x line. |
| `qs` ^6.17.1 | Patched query parser in development tooling; clean install and runtime HTTP suites. |
| `smol-toml` ^1.9.1 | Patched configuration parser in the development graph; clean install and builds. |
| vulnerable `minimatch` 7–11.0.0 → ^11.0.7 | Patched glob matching; lint, build, scaffold, and rename checks. |
| vulnerable `glob` 9–14.0.1 → ^14.0.4 | Patched glob implementation; lint/build checks. Pa11y URLs are passed in configuration because legacy positional glob expansion dropped HTTP paths. |
| `katex` ^0.19.1 | Patched renderer in the tooling graph; clean install and build. No theme runtime dependency. |

The 2026-11-11 audit leaves **one low-severity upstream advisory**,
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), in
`deepmerge` 4.3.1. npm reports four affected entries because it propagates through
SVGR to `@wordpress/scripts`. No fixed compatible version is available in this
lockfile. Exposure is build-time merging of repository-controlled SVG
configuration; it is not shipped PHP or browser runtime code. Keep build inputs
trusted and track the upstream fix. High/critical findings block handoff.

The npm 11.16 install-script notices are advisory; scripts still run by default.
CI pins that npm release. Review install scripts when updating npm or changing
the lockfile rather than approving future package versions indiscriminately.
