#!/usr/bin/env bash
#
# Run the navigation migration scenarios against the active disposable wp-env.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

wp() {
	npx --silent wp-env run cli wp "$@"
}

wp_url=$(
	wp option get home --skip-themes --skip-plugins 2>/dev/null \
		| grep -oE '^https?://[^[:space:]]+$' \
		| head -1 \
		|| true
)
case "$wp_url" in
	http://localhost:*|https://localhost:*|http://127.0.0.1:*|https://127.0.0.1:*) ;;
	*)
		echo "error: navigation migration tests require a running localhost wp-env" >&2
		exit 1
		;;
esac

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

wp eval-file "$theme_dir/bin/test-navigation-migration.php"
