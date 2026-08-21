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

npx --silent wp-env run cli wp plugin activate "$slug"
npx --silent wp-env run cli wp plugin is-active "$slug"
npx --silent wp-env run cli wp eval "if (! defined('${upper}_VERSION')) { WP_CLI::error('companion SEO version constant missing'); }"

echo "companion SEO install: OK ($slug)"
