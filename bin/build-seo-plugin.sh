#!/usr/bin/env bash
# Build the separately mounted companion SEO plugin.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./_seo-plugin.sh
. "$ROOT/bin/_seo-plugin.sh"

mode="${1:-build}"
if [ "$#" -gt 1 ] || { [ "$mode" != "build" ] && [ "$mode" != "start" ]; }; then
	echo "usage: $0 [build|start]" >&2
	exit 1
fi

if plugin_dir="$(seo_plugin_dir)"; then
	:
else
	status=$?
	if [ "$status" -eq 1 ]; then
		echo "companion SEO build: skipped (plugin not present)"
		exit 0
	fi
	exit "$status"
fi

text_domain="$(awk '/^[[:space:]]*\*[[:space:]]*Text Domain:/ { print $4; exit }' "$plugin_dir"/*.php)"
if ! [[ "$text_domain" =~ ^[a-z0-9-]+$ ]]; then
	echo "companion SEO build: could not resolve a safe plugin text domain" >&2
	exit 1
fi

COMPSEO_PLUGIN_DIR="$plugin_dir" COMPSEO_TEXT_DOMAIN="$text_domain" npx wp-scripts "$mode" \
	--webpack-src-dir="$plugin_dir/src" \
	index.js settings.js \
	--output-path="$plugin_dir/build" \
	--config="$plugin_dir/webpack.config.js"
