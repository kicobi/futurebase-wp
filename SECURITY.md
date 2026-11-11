# Security reporting

Please report vulnerabilities privately through
[GitHub's Report a vulnerability form](https://github.com/kicobi/futurebase-wp/security/advisories/new).
Include the affected commit/version, minimal reproduction, impact, and whether
the issue affects the theme, companion SEO plugin, or lifecycle tooling. Use
synthetic credentials and anonymized fixtures.

If the private form is unavailable, open an issue asking only for a private
reporting channel. Do not include exploit details, credentials, or client data
in public issues. Maintainers should enable private vulnerability reporting
before making the repository public.

Security fixes target the current starter branch and its documented minimum
WordPress/PHP versions. Promoted client projects own their update process;
starter updates do not automatically modify their runtime theme or plugin.

Development dependency findings are tracked separately from deployed PHP and
browser assets. See [dependency policy](docs/dependency-policy.md) for the
current audit scope and any accepted upstream limitations.
