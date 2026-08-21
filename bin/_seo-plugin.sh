#!/usr/bin/env bash
# Shared discovery for the separately packaged companion SEO plugin.

seo_plugin_dir() {
	local candidates=()
	local candidate

	for candidate in plugins/*-seo; do
		[ -d "$candidate" ] || continue
		[ -f "$candidate/$(basename "$candidate").php" ] || continue
		candidates+=("$candidate")
	done

	if [ "${#candidates[@]}" -eq 0 ]; then
		return 1
	fi
	if [ "${#candidates[@]}" -ne 1 ]; then
		echo "error: expected one companion SEO plugin, found ${#candidates[@]}" >&2
		return 2
	fi

	printf '%s\n' "${candidates[0]}"
}
