#!/usr/bin/env bash
#
# bin/scorecard.sh — run the full scorecard against the active wp-env site:
#   1. import demo content (deterministic fixture — see fixtures/import-demo.php)
#   2. Lighthouse CI, mobile + desktop (separate configs; budgets asserted)
#   3. pa11y-ci WCAG2AA, desktop + mobile viewports, JSON reports
#
# Raw reports land under .artifacts/scorecard/<run-date>/. CI uploads that
# directory as a workflow artifact; nothing under .artifacts/ is committed.
#
# NOTE: numbers produced against wp-env are a regression gate, not the
# published claim — publish only numbers measured on the public demo site.
#
# Usage:  npm run scorecard -- --force     (local; --force forwarded to the
#                                           destructive demo import)
#         bin/scorecard.sh                 (CI; $CI skips the guard)
#
# Env: LHCI_RUNS=1 overrides numberOfRuns for a quick local smoke run.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE_ARGS=()
for arg in "$@"; do
	case "$arg" in
		--force) FORCE_ARGS+=( "--force" ) ;;
		*) echo "error: unknown argument: $arg" >&2; exit 2 ;;
	esac
done

if ! command -v npx > /dev/null 2>&1; then
	echo "error: npx not found on PATH" >&2
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

./bin/demo-content.sh ${FORCE_ARGS[@]+"${FORCE_ARGS[@]}"}

# Page set: one URL per shipped template family. Slugs are the deterministic
# fixture slugs created by fixtures/import-demo.php — keep the two in sync.
LHCI_URLS=(
	"$WP_URL/"
	"$WP_URL/about/"
	"$WP_URL/services/"
	"$WP_URL/blog/"
	"$WP_URL/designing-with-demo-content/"
	"$WP_URL/category/notes/"
	"$WP_URL/author/admin/"
	"$WP_URL/?s=demo"
)
# The 404 page is pa11y-only: LHCI on non-200 responses is unreliable.
PA11Y_URLS=( "${LHCI_URLS[@]}" "$WP_URL/this-page-does-not-exist/" )

ART_DIR="$ROOT/.artifacts/scorecard/$(date +%Y-%m-%d)"
mkdir -p "$ART_DIR"

lhci_url_flags=()
for url in "${LHCI_URLS[@]}"; do
	lhci_url_flags+=( "--collect.url=$url" )
done
lhci_extra=()
if [ -n "${LHCI_RUNS:-}" ]; then
	lhci_extra+=( "--collect.numberOfRuns=$LHCI_RUNS" )
fi

echo "lighthouse (mobile) ..."
npx --silent lhci autorun \
	--config=lighthouserc-mobile.json \
	"${lhci_url_flags[@]}" \
	--upload.outputDir="$ART_DIR/lighthouse-mobile" \
	${lhci_extra[@]+"${lhci_extra[@]}"}

echo "lighthouse (desktop) ..."
npx --silent lhci autorun \
	--config=lighthouserc-desktop.json \
	"${lhci_url_flags[@]}" \
	--upload.outputDir="$ART_DIR/lighthouse-desktop" \
	${lhci_extra[@]+"${lhci_extra[@]}"}

pa11y_tmpdir=$(mktemp -d)
trap 'rm -rf "$pa11y_tmpdir"' EXIT

pa11y_urls_json=$(printf '"%s",' "${PA11Y_URLS[@]}")
pa11y_urls_json="[${pa11y_urls_json%,}]"

# Same defaults as bin/a11y-wp-env.sh (WCAG2AA; #url hidden for the
# comment-form autocomplete false positive), plus the URL list baked in.
cat > "$pa11y_tmpdir/desktop.json" <<JSON
{
	"defaults": {
		"standard": "WCAG2AA",
		"timeout": 30000,
		"includeWarnings": false,
		"hideElements": "#url",
		"chromeLaunchConfig": { "args": [ "--no-sandbox", "--disable-dev-shm-usage" ] }
	},
	"urls": $pa11y_urls_json
}
JSON

cat > "$pa11y_tmpdir/mobile.json" <<JSON
{
	"defaults": {
		"standard": "WCAG2AA",
		"timeout": 30000,
		"includeWarnings": false,
		"hideElements": "#url",
		"chromeLaunchConfig": { "args": [ "--no-sandbox", "--disable-dev-shm-usage" ] },
		"viewport": { "width": 375, "height": 667 }
	},
	"urls": $pa11y_urls_json
}
JSON

echo "pa11y (desktop) ..."
npx --silent pa11y-ci --config "$pa11y_tmpdir/desktop.json" --json > "$ART_DIR/pa11y-desktop.json"

echo "pa11y (mobile) ..."
npx --silent pa11y-ci --config "$pa11y_tmpdir/mobile.json" --json > "$ART_DIR/pa11y-mobile.json"

echo "scorecard: OK ($ART_DIR)"
