# Contributing

Open an issue before a large architectural change. For a focused fix, send a
small pull request with the reproduced behavior, the change, and validation.
Follow [AGENTS.md](AGENTS.md) and the existing npm / WordPress build chain.

Use Node 26 LTS, npm 11.16+, PHP 8.3+, and Composer 2. Install from the lockfiles:

```sh
npm ci
npm ci --prefix tools/project-system
composer install --prefer-dist
```

Run checks relevant to the change, then `npm run verify`. Lifecycle changes
also require `npm test --prefix tools/project-system`. Runtime changes require
Docker and the navigation, theme, and SEO suites described in the README.
`bin/test-release-install.sh` creates its own disposable WordPress for ZIP
installation checks. Do not reset an existing site to run a test.

Commit rebuilt `build/` output and the companion plugin's own build output
when their sources change. Keep the WordPress/PHP minimums and permanent SEO
metadata/hooks compatible; add a regression test for behavioral defects.
A passing automated accessibility check does not replace keyboard and assistive
technology review.

Do not commit client dossiers, credentials, local environment files, or the
private Every Layout / Inclusive Components reference skills. Keep upstream
attribution and the existing GPL licensing. Report security issues through
[SECURITY.md](SECURITY.md).
