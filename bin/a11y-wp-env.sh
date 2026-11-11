#!/usr/bin/env bash
#
# Run pa11y-ci against the active wp-env site at desktop and mobile widths.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

wp() {
	(cd "${WP_ENV_TEST_ROOT:-$ROOT}" && "$ROOT/node_modules/.bin/wp-env" run cli wp "$@")
}

if ! command -v npx > /dev/null 2>&1; then
	echo "error: npx not found on PATH" >&2
	exit 1
fi

if ! command -v curl > /dev/null 2>&1; then
	echo "error: curl not found on PATH" >&2
	exit 1
fi

WP_URL=$(
	wp option get home --skip-themes --skip-plugins 2>/dev/null \
		| grep -oE '^https?://[^[:space:]]+$' \
		| head -1 \
		|| true
)

if [ -z "$WP_URL" ]; then
	echo "error: wp-env is not reachable; start it with 'npm run env:start'" >&2
	exit 1
fi

WP_URL="${WP_URL%/}"
if ! curl -fsS --max-time 5 "$WP_URL/" > /dev/null 2>&1; then
	echo "error: wp-env URL is not responding: $WP_URL" >&2
	exit 1
fi

# wp-env MOUNTS this repo at wp-content/themes/<dir> but never ACTIVATES it, so
# a fresh environment boots on core's bundled default theme. Auditing that would
# produce a green gate for software this repo does not ship — worse than no gate,
# because it reads as proof. Assert the active stylesheet before measuring
# anything. bin/demo-content.sh performs the activation, and imports content so
# the archive and search templates have something to render.
theme_slug="${A11Y_THEME_SLUG:-$(basename "$ROOT")}"
active_theme=$(
	wp option get stylesheet --skip-themes --skip-plugins 2>/dev/null \
		| tr -d '\r' \
		| grep -v '^$' \
		| head -1 \
		|| true
)
if [ "$active_theme" != "$theme_slug" ]; then
	echo "error: active theme is '${active_theme:-<none>}', expected '$theme_slug'" >&2
	echo "       pa11y would audit the wrong theme. Run 'npm run demo:import -- --force' first." >&2
	exit 1
fi

pa11y_tmpdir=$(mktemp -d)
trap 'rm -rf "$pa11y_tmpdir"' EXIT

desktop_cfg="$pa11y_tmpdir/desktop.json"
mobile_cfg="$pa11y_tmpdir/mobile.json"

# HTML_CodeSniffer flags WordPress core's comment-form URL field as an
# autocomplete false positive; keep the gate focused on theme-owned markup.
cat > "$desktop_cfg" <<'JSON'
{
	"defaults": {
		"standard": "WCAG2AA",
		"timeout": 30000,
		"includeWarnings": false,
		"hideElements": "#url",
		"chromeLaunchConfig": { "args": [ "--no-sandbox", "--disable-dev-shm-usage" ] },
		"viewport": { "width": 1280, "height": 800 }
	}
}
JSON

cat > "$mobile_cfg" <<'JSON'
{
	"defaults": {
		"standard": "WCAG2AA",
		"timeout": 30000,
		"includeWarnings": false,
		"hideElements": "#url",
		"chromeLaunchConfig": { "args": [ "--no-sandbox", "--disable-dev-shm-usage" ] },
		"viewport": { "width": 375, "height": 667 }
	}
}
JSON

# The same page set the scorecard measures. This used to be the homepage and one
# post, so the gate never visited /about/ or /services/ — where most of the
# section patterns render, and where two WCAG failures sat behind a green job.
. "$ROOT/bin/_page-set.sh"
IFS=$'\n' read -r -d '' -a A11Y_URLS < <(page_set_with_404 "$WP_URL" && printf '\0')

# A valid 404 template must not masquerade as eight missing fixture pages.
for url in "${A11Y_URLS[@]}"; do
	expected=200
	[[ "$url" == */this-page-does-not-exist/ ]] && expected=404
	status=$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "$url")
	if [ "$status" != "$expected" ]; then
		echo "error: expected HTTP $expected for $url, got $status; load the disposable fixture or adapt the page set" >&2
		exit 1
	fi
done

# Pass URLs as configuration, not filesystem globs. Globby's transitive glob
# updates can otherwise silently drop non-matching HTTP paths from coverage.
for config in "$desktop_cfg" "$mobile_cfg"; do
	node - "$config" "${A11Y_URLS[@]}" <<'JS'
const fs = require('node:fs');
const [path, ...urls] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
config.urls = urls;
fs.writeFileSync(path, JSON.stringify(config));
JS
	npx --silent pa11y-ci --config "$config"
done
