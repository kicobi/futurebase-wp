#!/usr/bin/env bash
# Build an installable companion SEO plugin ZIP from runtime files only.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./_seo-plugin.sh
. "$ROOT/bin/_seo-plugin.sh"

if ! command -v rsync > /dev/null 2>&1; then
	echo "error: rsync not found on PATH" >&2
	exit 1
fi
if ! command -v zip > /dev/null 2>&1; then
	echo "error: zip not found on PATH" >&2
	exit 1
fi

if ! plugin_dir="$(seo_plugin_dir)"; then
	echo "error: companion SEO plugin not found" >&2
	exit 1
fi
slug="$(basename "$plugin_dir")"
main_file="$plugin_dir/$slug.php"

required_paths=(
	"$main_file"
	"$plugin_dir/includes/class-admin.php"
	"$plugin_dir/includes/class-canonical.php"
	"$plugin_dir/includes/class-cli.php"
	"$plugin_dir/includes/class-context.php"
	"$plugin_dir/includes/class-contracts.php"
	"$plugin_dir/includes/class-decision.php"
	"$plugin_dir/includes/class-document.php"
	"$plugin_dir/includes/class-editor.php"
	"$plugin_dir/includes/class-identifiers.php"
	"$plugin_dir/includes/class-metadata.php"
	"$plugin_dir/includes/class-output.php"
	"$plugin_dir/includes/class-plugin.php"
	"$plugin_dir/includes/class-policy.php"
	"$plugin_dir/includes/class-robots.php"
	"$plugin_dir/includes/class-sitemaps.php"
	"$plugin_dir/includes/class-schema.php"
	"$plugin_dir/includes/class-settings.php"
	"$plugin_dir/includes/class-suppression.php"
	"$plugin_dir/includes/class-url.php"
	"$plugin_dir/includes/class-verification.php"
	"$plugin_dir/build/index.asset.php"
	"$plugin_dir/build/index.css"
	"$plugin_dir/build/index.js"
	"$plugin_dir/build/settings.asset.php"
	"$plugin_dir/build/settings.css"
	"$plugin_dir/build/settings.js"
	"$plugin_dir/readme.txt"
	"LICENSE"
)
for path in "${required_paths[@]}"; do
	if [ ! -f "$path" ]; then
		echo "error: required plugin package path is missing: $path" >&2
		echo "       Run 'npm run build:seo' before packaging." >&2
		exit 1
	fi
done

dist_dir="${SEO_PLUGIN_DIST_DIR:-.dist}"
case "$dist_dir" in
	/*) dist_abs="$dist_dir" ;;
	*) dist_abs="$ROOT/$dist_dir" ;;
esac

mkdir -p "$dist_abs"
output="$dist_abs/$slug.zip"
rm -f "$output"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
package_dir="$tmpdir/$slug"
mkdir -p "$package_dir"

# Copy from inside the plugin so its source directory is not embedded in the ZIP.
for path in "$(basename "$main_file")" includes build readme.txt; do
	rsync -a --exclude='.DS_Store' "$plugin_dir/$path" "$package_dir/"
done
rsync -a LICENSE "$package_dir/LICENSE"

(
	cd "$tmpdir"
	zip -qr "$output" "$slug"
)

printf '%s\n' "$output"
