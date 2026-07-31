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

# wp-env mounts `"themes": [ "." ]` at wp-content/themes/<repo-dir> but never
# activates it, so a fresh environment boots on core's bundled default theme.
# Without this the resolution below returned twentytwentyfive's directory and
# the eval-file failed on a path that does not exist — and had it resolved, the
# test would still have been meaningless, because the migration functions it
# calls live in the ACTIVE theme. Same activation demo-content.sh does, for the
# same reason. Idempotent, and survives `npm run rename`.
theme_slug="$(basename "$ROOT")"
if ! wp theme activate "$theme_slug" > /dev/null 2>&1; then
	echo "error: could not activate theme '$theme_slug'" >&2
	echo "       wp-env mounts this repo at wp-content/themes/$theme_slug" >&2
	exit 1
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

wp eval-file "$theme_dir/bin/test-navigation-migration.php"
