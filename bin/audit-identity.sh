#!/usr/bin/env bash
# Fail on any legacy identity outside the exact shared allowlist.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../tools/project-system/config/rename-contract.sh
source "$ROOT/tools/project-system/config/rename-contract.sh"
cd "$ROOT"

legacy_regex="$(IFS='|'; printf '%s' "${FUTUREBASE_LEGACY_FORMS[*]}")"
matches=()
while IFS= read -r file; do
	[ -f "$file" ] || continue
	grep -Iq . "$file" 2>/dev/null || continue
	while IFS= read -r line; do
		[ -n "$line" ] && matches+=("$file:$line")
	done < <(grep -nE "$legacy_regex" "$file" 2>/dev/null || true)
done < <(git ls-files -co --exclude-standard | sort -u)

allowed_match() {
	local path="$1"
	local text="$2"
	local row allowed_path allowed_regex reason removal
	for row in "${FUTUREBASE_LEGACY_ALLOWLIST[@]}"; do
		IFS=$'\t' read -r allowed_path allowed_regex reason removal <<< "$row"
		if [ "$path" = "$allowed_path" ] && printf '%s\n' "$text" | grep -qE "$allowed_regex"; then
			return 0
		fi
	done
	return 1
}

failed=0
for match in "${matches[@]}"; do
	path="${match%%:*}"
	text="${match#*:}"
	if ! allowed_match "$path" "$text"; then
		echo "unexpected legacy identity: $match" >&2
		failed=1
	fi
done

# A stale exception is also a contract failure; it otherwise becomes an
# unreviewed permission for a future legacy occurrence at the same path.
for row in "${FUTUREBASE_LEGACY_ALLOWLIST[@]}"; do
	IFS=$'\t' read -r allowed_path allowed_regex reason removal <<< "$row"
	found=0
	for match in "${matches[@]}"; do
		path="${match%%:*}"
		text="${match#*:}"
		if [ "$path" = "$allowed_path" ] && printf '%s\n' "$text" | grep -qE "$allowed_regex"; then
			found=1
			break
		fi
	done
	if [ "$found" -eq 0 ]; then
		echo "stale legacy allowlist entry: $allowed_path / $allowed_regex ($reason; $removal)" >&2
		failed=1
	fi
done

[ "$failed" -eq 0 ] || exit 1
echo "identity audit: OK (${#matches[@]} intentional legacy line(s))"
