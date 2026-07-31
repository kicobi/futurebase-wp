#!/usr/bin/env bash
#
# Build an installable theme zip from runtime files only.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v rsync > /dev/null 2>&1; then
	echo "error: rsync not found on PATH" >&2
	exit 1
fi

if ! command -v zip > /dev/null 2>&1; then
	echo "error: zip not found on PATH" >&2
	exit 1
fi

slug=$(
	awk -F':[[:space:]]*' 'tolower($1) == "text domain" { print $2; exit }' style.css \
		| tr -d '\r'
)

if ! echo "$slug" | grep -qE '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'; then
	echo "error: could not read a valid Text Domain slug from style.css" >&2
	exit 1
fi

required_paths=(
	"style.css"
	"functions.php"
	"theme.json"
	"build/main.asset.php"
	"build/main.css"
	"build/main.js"
	"templates/index.html"
	"parts/header.html"
	"patterns/home.php"
)

for path in "${required_paths[@]}"; do
	if [ ! -e "$path" ]; then
		echo "error: required package path is missing: $path" >&2
		echo "       Run 'npm run build' before packaging." >&2
		exit 1
	fi
done

# This knob belongs to the project, not to the starter's tooling: nothing
# outside this file defines or reads it. bin/rename-theme.sh therefore rewrites
# its prefix along with the theme's other uppercase global names, rather than
# allowlisting it the way the project-system CLI command name is allowlisted.
dist_dir="${WP_STARTER_DIST_DIR:-.dist}"
case "$dist_dir" in
	/*) dist_abs="$dist_dir" ;;
	*) dist_abs="$ROOT/$dist_dir" ;;
esac

mkdir -p "$dist_abs"
output="$dist_abs/$slug.zip"
rm -f "$output"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
package_dir="$tmpdir/$slug"
mkdir -p "$package_dir"

copy_paths=(
	"style.css"
	"functions.php"
	"theme.json"
	"readme.txt"
	"screenshot.png"
	"LICENSE"
	"assets/images"
	"build"
	"inc"
	"languages"
	"parts"
	"patterns"
	"styles"
	"templates"
)

for path in "${copy_paths[@]}"; do
	if [ -e "$path" ]; then
		# -R preserves the source-relative path, so nested entries like
		# assets/images land at <package>/assets/images, not <package>/images.
		rsync -aR --exclude='.DS_Store' "$path" "$package_dir/"
	fi
done

(
	cd "$tmpdir"
	zip -qr "$output" "$slug"
)

printf "%s\n" "$output"
