#!/usr/bin/env bash
#
# Verify the release zip contains runtime theme files and excludes dev tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v unzip > /dev/null 2>&1; then
	echo "error: unzip not found on PATH" >&2
	exit 1
fi

zip_path="$(./bin/package-theme.sh)"
slug="$(basename "$zip_path" .zip)"
entries="$(unzip -Z1 "$zip_path")"

fail() {
	echo "package check failed: $1" >&2
	exit 1
}

if [ -z "$entries" ]; then
	fail "zip is empty"
fi

outside_prefix=$(printf "%s\n" "$entries" | grep -vE "^${slug}(/|$)" || true)
if [ -n "$outside_prefix" ]; then
	printf "%s\n" "$outside_prefix" >&2
	fail "zip contains entries outside the theme directory"
fi

require_entry() {
	local entry="$slug/$1"
	if ! printf "%s\n" "$entries" | grep -Fxq "$entry"; then
		fail "missing required entry: $entry"
	fi
}

require_entry "style.css"
require_entry "functions.php"
require_entry "theme.json"
require_entry "build/main.asset.php"
require_entry "build/main.css"
require_entry "build/main.js"
require_entry "templates/index.html"
require_entry "parts/header.html"
require_entry "patterns/home.php"

for forbidden in \
	"$slug/.git/" \
	"$slug/.github/" \
	"$slug/.claude/" \
	"$slug/.codex/" \
	"$slug/.wp-env.json" \
	"$slug/.wp-env.override.json" \
	"$slug/node_modules/" \
	"$slug/vendor/" \
	"$slug/docs/" \
	"$slug/src/" \
	"$slug/fixtures/" \
	"$slug/.artifacts/" \
	"$slug/bin/" \
	"$slug/scripts/" \
	"$slug/package.json" \
	"$slug/package-lock.json" \
	"$slug/composer.json" \
	"$slug/composer.lock" \
	"$slug/phpcs.xml.dist" \
	"$slug/phpstan.neon.dist" \
	"$slug/AGENTS.md" \
	"$slug/CLAUDE.md"; do
	if printf "%s\n" "$entries" | grep -Fq "$forbidden"; then
		fail "zip contains dev-only entry: $forbidden"
	fi
done

# assets/ is dev source (SCSS/JS) and must not ship — except assets/images/,
# which carries runtime pattern placeholders referenced via get_theme_file_uri().
dev_assets=$(printf "%s\n" "$entries" | grep -E "^$slug/assets/" | grep -vE "^$slug/assets/(images/|images$|$)" || true)
if [ -n "$dev_assets" ]; then
	printf "%s\n" "$dev_assets" >&2
	fail "zip contains dev-only asset sources (only assets/images/ may ship)"
fi

# Every assets/images/ file a shipped pattern references must be in the zip —
# a packaged pattern pointing at a missing placeholder 404s on install.
pattern_entries=$(printf "%s\n" "$entries" | grep -E "^$slug/patterns/.+\.php$" || true)
for pattern_entry in $pattern_entries; do
	refs=$(unzip -p "$zip_path" "$pattern_entry" | grep -oE "assets/images/[A-Za-z0-9._-]+" | sort -u || true)
	for ref in $refs; do
		if ! printf "%s\n" "$entries" | grep -Fxq "$slug/$ref"; then
			fail "$pattern_entry references $ref but the zip does not contain it"
		fi
	done
done

if ! unzip -p "$zip_path" "$slug/style.css" | grep -qE "^Text Domain:[[:space:]]+$slug$"; then
	fail "style.css Text Domain does not match package directory"
fi

echo "package check: OK ($zip_path)"
