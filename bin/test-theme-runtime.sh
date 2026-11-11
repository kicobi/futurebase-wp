#!/usr/bin/env bash
# Test native block rendering against the mounted theme in disposable wp-env.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
wp() { npx --silent wp-env run cli wp "$@"; }
url=$(wp option get home --skip-themes --skip-plugins 2>/dev/null | grep -E '^https?://' | head -1)
case "$url" in
    http://localhost:*|https://localhost:*|http://127.0.0.1:*|https://127.0.0.1:*) ;;
    *) echo "error: theme runtime tests require localhost wp-env" >&2; exit 1 ;;
esac
wp theme activate "$(basename "$ROOT")" > /dev/null
theme_dir=$(wp eval 'echo get_stylesheet_directory();' 2>/dev/null | grep -E '^/' | head -1)
wp eval-file "$theme_dir/bin/test-theme-runtime.php"
