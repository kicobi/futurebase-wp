#!/usr/bin/env bash
# Activate the separately mounted companion SEO plugin in wp-env.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./_seo-plugin.sh
. "$ROOT/bin/_seo-plugin.sh"

if plugin_dir="$(seo_plugin_dir)"; then
	:
else
	status=$?
	if [ "$status" -eq 1 ]; then
		echo "companion SEO install: skipped (plugin not present)"
		exit 0
	fi
	exit "$status"
fi

slug="$(basename "$plugin_dir")"
upper="$(printf '%s' "$slug" | tr '[:lower:]-' '[:upper:]_')"

wp() {
	npx --silent wp-env run cli wp "$@"
}

original_theme="$(wp option get stylesheet --skip-themes --skip-plugins | tail -1 | tr -d '\r')"
[ -n "$original_theme" ] || { echo "error: active theme could not be resolved" >&2; exit 1; }

restore() {
	wp theme activate "$original_theme" > /dev/null 2>&1 || true
	wp plugin activate "$slug" > /dev/null 2>&1 || true
}
trap restore EXIT

wp plugin activate "$slug" > /dev/null
wp plugin is-active "$slug"
wp eval "if (! defined('${upper}_VERSION')) { WP_CLI::error('companion SEO version constant missing'); }"

wp plugin deactivate "$slug" > /dev/null
if wp plugin is-active "$slug" > /dev/null 2>&1; then
	echo "error: companion SEO remained active after deactivation" >&2
	exit 1
fi
wp plugin activate "$slug" > /dev/null
wp plugin is-active "$slug"
wp compseo status --format=json | grep -q '"suppressed":false'

alternate_theme=$(
	wp theme list --status=inactive --field=name 2>/dev/null \
		| tr -d '\r' \
		| grep -v -F "$original_theme" \
		| head -1 \
		|| true
)
[ -n "$alternate_theme" ] || { echo "error: an inactive theme is required for the theme-switch fixture" >&2; exit 1; }
wp theme activate "$alternate_theme" > /dev/null
wp plugin is-active "$slug"
wp compseo status --format=json | grep -q '"settings_schema":2'
wp theme activate "$original_theme" > /dev/null

echo "companion SEO install: OK ($slug; activation cycle and theme switch)"
