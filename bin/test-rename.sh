#!/usr/bin/env bash
#
# bin/test-rename.sh — non-regression smoke test for bin/rename-theme.sh.
#
# Two phases, each in its own throwaway git worktree:
#
#   1. Collision safety (Issue #4): rename to a slug that embeds the old slug
#      as a substring must NOT produce double-suffix output.
#   2. Real rename: rename to a normal slug must succeed CLEANLY (exit 0 — i.e.
#      no "unexpected leftovers"), apply the snake_case prefix and text domain,
#      and leave the tools/project-system templates untouched (they carry the
#      starter's own identity, not client slugs).
#
# Phase 2 exists because phase 1 aborts early on the collision guard and never
# exercises the main substitution/scan path — which is exactly how a shell
# parse bug in that path (macOS bash 3.2 mishandling of quotes/backticks/parens
# inside the process substitution) once shipped undetected.
#
# Worktrees are torn down regardless of pass/fail, so this is safe to run from
# verify-theme.sh or locally against a dirty working tree.
#
# Usage:       bash bin/test-rename.sh
# Wired into:  bin/verify-theme.sh
# Issue:       https://github.com/studiokicobi/wp-starter/issues/4

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Precondition: only meaningful on the starter itself, whose Text Domain is
# still the slug rename-theme.sh renames *from* (OLD_SLUG). A promoted project
# has rewritten it, so a dry rename would find nothing to exercise — skip.
#
# Anchor on the Text Domain line specifically. style.css keeps a Theme URI
# pointing at the template's origin repo (…/wp-starter) in every promoted
# project, so a substring match against the whole file would always succeed
# and no fork could ever skip. rename-theme.sh excludes this file so the
# sentinel below survives promotion; both halves are required.
if ! grep -qiE '^Text Domain:[[:space:]]*wp-starter[[:space:]]*$' style.css 2>/dev/null; then
	echo "rename non-regression: skipped (repo is no longer in template state)"
	exit 0
fi

WORKTREES=()
LOG="$(mktemp -t wp-starter-rename-test-log.XXXXXX)"

cleanup() {
	local code=$?
	if [ "${#WORKTREES[@]}" -gt 0 ]; then
		for wt in "${WORKTREES[@]}"; do
			[ -n "$wt" ] && [ -d "$wt" ] && git worktree remove --force "$wt" > /dev/null 2>&1 || true
		done
	fi
	[ -n "$LOG" ] && rm -f "$LOG" 2>/dev/null || true
	exit $code
}
trap cleanup EXIT

# Create a detached worktree at HEAD and record it for cleanup. Sets NEW_WT.
# NOTE: must run in the CURRENT shell (not $(...)) so WORKTREES accumulates.
NEW_WT=""
make_worktree() {
	NEW_WT="$(mktemp -d -t wp-starter-rename-test.XXXXXX)"
	if ! git worktree add --quiet --detach "$NEW_WT" HEAD > /dev/null 2>&1; then
		echo "rename non-regression: FAIL (could not create worktree)"
		exit 1
	fi
	WORKTREES+=("$NEW_WT")
}

FAILED=0

# --- Phase 1: collision safety (Issue #4) -----------------------------------
TEST_SLUG="wp-starter-collision-probe"
DOUBLED="${TEST_SLUG}-${TEST_SLUG#wp-starter-}"
DOUBLED_SNAKE="$(echo "$DOUBLED" | tr '-' '_')"

make_worktree
WT1="$NEW_WT"

# Non-zero exit is acceptable here — the safety check is expected to abort on a
# substring-collision slug. The assertion is that no double-suffix appears.
bash "$WT1/bin/rename-theme.sh" "$TEST_SLUG" > "$LOG" 2>&1 || true

doubled=$(grep -rn --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git --exclude-dir=build -- "$DOUBLED" "$WT1" 2>/dev/null | head -20 || true)
doubled_snake=$(grep -rn --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git --exclude-dir=build -- "$DOUBLED_SNAKE" "$WT1" 2>/dev/null | head -20 || true)

if [ -n "$doubled" ] || [ -n "$doubled_snake" ]; then
	FAILED=1
	echo "rename non-regression: FAIL — double-suffix patterns found after rename:"
	[ -n "$doubled" ]       && printf '%s\n' "$doubled"       | sed 's/^/    /'
	[ -n "$doubled_snake" ] && printf '%s\n' "$doubled_snake" | sed 's/^/    /'
else
	echo "  collision-safety: OK ($TEST_SLUG produced no double-suffix output)"
fi

# --- Phase 2: a real rename succeeds cleanly --------------------------------
REAL_SLUG="acme-client-probe"
REAL_SNAKE="acme_client_probe"

make_worktree
WT2="$NEW_WT"

if bash "$WT2/bin/rename-theme.sh" "$REAL_SLUG" > "$LOG" 2>&1; then
	RC=0
else
	RC=$?
fi

problems=()
[ "$RC" -eq 0 ] || problems+=("rename exited $RC (expected 0 — 'unexpected leftovers' or a shell parse error)")
grep -q "${REAL_SNAKE}_" "$WT2/functions.php" 2>/dev/null || problems+=("functions.php missing the ${REAL_SNAKE}_ prefix")
grep -qi "text domain:[[:space:]]*${REAL_SLUG}" "$WT2/style.css" 2>/dev/null || problems+=("style.css Text Domain was not renamed to ${REAL_SLUG}")
tmpl="$WT2/tools/project-system/templates/lead/CLAUDE.md"
if [ -f "$tmpl" ]; then
	grep -q 'wp-starter' "$tmpl" 2>/dev/null || problems+=("tools/project-system template literal 'wp-starter' was rewritten (exclusion broken)")
fi

# Demo fixture + scorecard tooling must never hardcode the theme slug —
# they derive it at runtime (pattern registry / style.css), so no 'wp-starter'
# literal may survive a rename in these paths. rename-theme.sh does not scan
# them; this asserts they never need it to.
#
# The bin/ half of that list is DERIVED from PORTABLE_BIN in the sync
# classifier, never restated here. Those files are copied verbatim into client
# projects because they are held to be slug-free, and this loop is the only
# thing that makes that hold. A file added to PORTABLE_BIN without the property
# actually being true would otherwise be synced into a project and undo its
# rename — so a list we failed to keep in step is the exact failure to prevent.
SYNC_LIB="tools/project-system/lib/sync.mjs"
portable_bin=$(node --input-type=module -e "
	import { PORTABLE_BIN } from './$SYNC_LIB';
	if (!Array.isArray(PORTABLE_BIN) || PORTABLE_BIN.length === 0) process.exit(2);
	console.log(PORTABLE_BIN.join('\n'));
" 2>>"$LOG")
if [ -z "$portable_bin" ]; then
	problems+=("could not read PORTABLE_BIN from $SYNC_LIB — the slug-free contract for bin/ is unverified")
fi

for probe in fixtures $portable_bin; do
	target="$WT2/$probe"
	if [ ! -e "$target" ]; then
		# fixtures/ is probed opportunistically; a PORTABLE_BIN entry that does
		# not exist means sync would offer a path the starter no longer ships.
		[ "$probe" = "fixtures" ] || problems+=("$probe is listed in PORTABLE_BIN but does not exist")
		continue
	fi
	leftovers=$(grep -rInl -- 'wp-starter' "$target" 2>/dev/null || true)
	if [ -n "$leftovers" ]; then
		problems+=("$probe still contains a 'wp-starter' literal after rename (derive the slug at runtime instead)")
	fi
done

if [ "${#problems[@]}" -gt 0 ]; then
	FAILED=1
	echo "rename non-regression: FAIL — real rename ($REAL_SLUG):"
	for p in "${problems[@]}"; do echo "    - $p"; done
	echo "  rename output (tail):"
	tail -20 "$LOG" | sed 's/^/    /'
else
	echo "  real-rename: OK ($REAL_SLUG applied cleanly; tools/ preserved)"
fi

if [ "$FAILED" -ne 0 ]; then
	exit 1
fi

echo "rename non-regression: OK"
