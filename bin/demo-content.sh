#!/usr/bin/env bash
#
# bin/demo-content.sh — reset the active wp-env site and import demo content.
#
# DESTRUCTIVE: runs `wp site empty --uploads --yes` before importing, so every
# run converges to the same deterministic state (what makes the scorecard
# reproducible). Guards:
#   - requires --force unless $CI is set
#   - refuses any resolved URL that is not localhost (wp-env only)
#
# Usage:  npm run demo:import -- --force
#         bin/demo-content.sh --force

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE=0
for arg in "$@"; do
	case "$arg" in
		--force) FORCE=1 ;;
		*) echo "error: unknown argument: $arg" >&2; exit 2 ;;
	esac
done

if ! command -v npx > /dev/null 2>&1; then
	echo "error: npx not found on PATH" >&2
	exit 1
fi

wp() {
	npx --silent wp-env run cli wp "$@"
}

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

host=$(printf "%s" "$WP_URL" | sed -E 's#^https?://##; s#[:/].*$##')
case "$host" in
	localhost|127.0.0.1|::1) ;;
	*)
		echo "error: refusing to wipe non-localhost site: $WP_URL" >&2
		exit 3
		;;
esac

site_title=$(wp option get blogname 2>/dev/null | head -1 || true)
echo "target: $WP_URL ($site_title)"

if [ "$FORCE" -ne 1 ] && [ -z "${CI:-}" ]; then
	echo "error: this wipes all content on the site above. Re-run with --force." >&2
	exit 4
fi

theme_dir=$(
	wp eval 'echo get_stylesheet_directory();' 2>/dev/null \
		| grep -E '^/' \
		| head -1 \
		|| true
)
if [ -z "$theme_dir" ]; then
	echo "error: could not resolve the container-side theme directory" >&2
	exit 1
fi
helper="$theme_dir/fixtures/import-demo.php"

echo "emptying site ..."
wp site empty --uploads --yes

echo "importing demo content ..."
wp eval-file "$helper"

echo "demo content: OK ($WP_URL)"
