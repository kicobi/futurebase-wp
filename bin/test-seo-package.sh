#!/usr/bin/env bash
# Verify the companion SEO ZIP contains only plugin runtime files.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v unzip > /dev/null 2>&1; then
	echo "error: unzip not found on PATH" >&2
	exit 1
fi

zip_path="$(./bin/package-seo-plugin.sh)"
slug="$(basename "$zip_path" .zip)"
entries="$(unzip -Z1 "$zip_path")"

fail() {
	echo "plugin package check failed: $1" >&2
	exit 1
}

[ -n "$entries" ] || fail "zip is empty"
outside_prefix="$(printf '%s\n' "$entries" | grep -vE "^${slug}(/|$)" || true)"
[ -z "$outside_prefix" ] || fail "zip contains entries outside the plugin directory"

for required in \
	"$slug/$slug.php" \
	"$slug/includes/class-identifiers.php" \
	"$slug/includes/class-plugin.php" \
	"$slug/build/index.asset.php" \
	"$slug/build/index.js" \
	"$slug/readme.txt" \
	"$slug/LICENSE"; do
	printf '%s\n' "$entries" | grep -Fxq "$required" || fail "missing required entry: $required"
done

for forbidden in \
	"$slug/plugins/" \
	"$slug/style.css" \
	"$slug/functions.php" \
	"$slug/theme.json" \
	"$slug/templates/" \
	"$slug/patterns/" \
	"$slug/src/" \
	"$slug/node_modules/" \
	"$slug/vendor/" \
	"$slug/docs/" \
	"$slug/bin/" \
	"$slug/package.json" \
	"$slug/composer.json" \
	"$slug/phpcs.xml.dist"; do
	if printf '%s\n' "$entries" | grep -Fq "$forbidden"; then
		fail "zip contains forbidden entry: $forbidden"
	fi
done

main="$slug/$slug.php"
unzip -p "$zip_path" "$main" | grep -qE "^ \* Plugin Name:[[:space:]]+.+" || fail "bootstrap is missing Plugin Name"
unzip -p "$zip_path" "$main" | grep -qE "^ \* Text Domain:[[:space:]]+$slug$" || fail "Text Domain does not match package directory"

echo "plugin package check: OK ($zip_path)"
