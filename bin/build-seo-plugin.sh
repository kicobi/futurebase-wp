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

npx wp-scripts "$mode" \
	--webpack-src-dir="$plugin_dir/src" \
	--output-path="$plugin_dir/build" \
	--config=node_modules/@wordpress/scripts/config/webpack.config.js
