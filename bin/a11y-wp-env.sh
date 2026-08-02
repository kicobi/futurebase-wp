#!/usr/bin/env bash
#
# Run pa11y-ci against the active wp-env site at desktop and mobile widths.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v npx > /dev/null 2>&1; then
	echo "error: npx not found on PATH" >&2
	exit 1
fi

if ! command -v curl > /dev/null 2>&1; then
	echo "error: curl not found on PATH" >&2
	exit 1
fi

WP_URL=$(
	npx --silent wp-env run cli wp option get home --skip-themes --skip-plugins 2>/dev/null \
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
theme_slug="$(basename "$ROOT")"
active_theme=$(
	npx --silent wp-env run cli wp option get stylesheet --skip-themes --skip-plugins 2>/dev/null \
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

npx --silent pa11y-ci --config "$desktop_cfg" "${A11Y_URLS[@]}"
npx --silent pa11y-ci --config "$mobile_cfg" "${A11Y_URLS[@]}"
