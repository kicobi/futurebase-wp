#!/usr/bin/env bash
# Non-regression smoke test for the Futurebase WP-to-client rename contract.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTRACT="$ROOT/tools/project-system/config/rename-contract.sh"
if [ ! -f "$CONTRACT" ]; then
	echo "rename non-regression: FAIL (shared contract missing)"
	exit 1
fi
# shellcheck source=../tools/project-system/config/rename-contract.sh
source "$CONTRACT"

REQUIRE_TEMPLATE=0
if [ "${1:-}" = "--require-template" ]; then
	REQUIRE_TEMPLATE=1
	shift
fi
if [ "$#" -ne 0 ]; then
	echo "usage: bash bin/test-rename.sh [--require-template]" >&2
	exit 1
fi

if ! grep -qE "$FUTUREBASE_TEMPLATE_TEXT_DOMAIN_RE" style.css 2>/dev/null; then
	if [ "$REQUIRE_TEMPLATE" -eq 1 ]; then
		echo "rename non-regression: FAIL (Futurebase WP template sentinel missing)"
		exit 1
	fi
	echo "rename non-regression: skipped (repo is no longer in template state)"
	exit 0
fi

base_theme_name="$(sed -n 's/^Theme Name:[[:space:]]*//p' style.css | head -1 | sed 's/[[:space:]]*$//')"
if [ "$base_theme_name" != "$FUTUREBASE_BASE_DISPLAY" ] \
	|| [ "$(head -1 readme.txt 2>/dev/null)" != "=== $FUTUREBASE_BASE_DISPLAY ===" ] \
	|| ! grep -qF " * $FUTUREBASE_BASE_DISPLAY theme functions." functions.php 2>/dev/null \
	|| ! grep -qE '^Author:[[:space:]]*Kicobi$' style.css 2>/dev/null \
	|| ! grep -qE '^Author URI:[[:space:]]*https://kicobi\.com$' style.css 2>/dev/null \
	|| ! grep -qE '^Contributors:[[:space:]]*kicobi$' readme.txt 2>/dev/null; then
	echo "rename non-regression: FAIL (Futurebase WP base identity surfaces disagree)"
	exit 1
fi
if [ "$(grep -cF '<!-- template-setup:start -->' README.md 2>/dev/null || true)" != "1" ] \
	|| [ "$(grep -cF '<!-- template-setup:end -->' README.md 2>/dev/null || true)" != "1" ]; then
	echo "rename non-regression: FAIL (README.md managed template-setup block is missing or ambiguous)"
	exit 1
fi

# The template-only CI step must carry an exact single-repository guard.
# .github/workflows is CLASS.SAFE and syncs verbatim into every client, so an
# unguarded step — or one broadened to the whole org — turns every promoted
# project's CI red on a check that can never pass there. The window is read
# around the run line so the guard is tied to that step rather than merely
# present somewhere in the file, and either YAML key order is accepted.
WORKFLOW="$ROOT/.github/workflows/ci.yml"
guard_window="$(grep -B2 -A2 -F 'bash bin/test-rename.sh --require-template' "$WORKFLOW" 2>/dev/null || true)"
guard_problem=""
if [ -z "$guard_window" ]; then
	guard_problem="the required-template step is missing from .github/workflows/ci.yml"
elif ! printf '%s\n' "$guard_window" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
	| grep -qxF "if: github.repository == '$FUTUREBASE_TEMPLATE_REPOSITORY'"; then
	guard_problem="the required-template step lacks the exact guard: if: github.repository == '$FUTUREBASE_TEMPLATE_REPOSITORY'"
elif printf '%s\n' "$guard_window" | grep -qE 'repository_owner|startsWith|contains\('; then
	guard_problem="the required-template guard was broadened beyond a single repository"
fi
if [ -n "$guard_problem" ]; then
	echo "rename non-regression: FAIL ($guard_problem)"
	exit 1
fi

WORKTREES=()
LOG="$(mktemp -t rename-contract-test-log.XXXXXX)"

cleanup() {
	local code=$?
	for worktree in "${WORKTREES[@]-}"; do
		[ -n "$worktree" ] && [ -d "$worktree" ] && git worktree remove --force "$worktree" >/dev/null 2>&1 || true
	done
	[ -n "$LOG" ] && rm -f "$LOG" 2>/dev/null || true
	exit "$code"
}
trap cleanup EXIT

NEW_WT=""
make_worktree() {
	NEW_WT="$(mktemp -d -t rename-contract-test.XXXXXX)"
	if ! git worktree add --quiet --detach "$NEW_WT" HEAD >/dev/null 2>&1; then
		echo "rename non-regression: FAIL (could not create worktree)"
		exit 1
	fi
	WORKTREES+=("$NEW_WT")
}

FAILED=0

# A slug containing the base token must abort before writing anything.
TEST_SLUG="${FUTUREBASE_BASE_SLUG}-collision-probe"
DOUBLED="${TEST_SLUG}-${TEST_SLUG#${FUTUREBASE_BASE_SLUG}-}"
make_worktree
WT1="$NEW_WT"
bash "$WT1/bin/rename-theme.sh" "$TEST_SLUG" >"$LOG" 2>&1 || true
if grep -rIn --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git --exclude-dir=build -- "$DOUBLED" "$WT1" >/dev/null 2>&1; then
	FAILED=1
	echo "rename non-regression: FAIL — collision rename produced double-suffix output"
else
	echo "  collision-safety: OK"
fi

# Exercise the complete real interface in a cold detached worktree.
REAL_SLUG="acme-client"
REAL_SNAKE="acme_client"
REAL_UPPER="ACME_CLIENT"
REAL_NAME="Acme Client"
REAL_VERSION="1.0.0"
REAL_REPOSITORY="kicobi/acme-client"
REAL_CONTRIBUTORS="kicobi, jsmith"
make_worktree
WT2="$NEW_WT"

if bash "$WT2/bin/rename-theme.sh" "$REAL_SLUG" \
	--theme-name "$REAL_NAME" \
	--theme-version "$REAL_VERSION" \
	--repository "$REAL_REPOSITORY" \
	--contributors "$REAL_CONTRIBUTORS" >"$LOG" 2>&1; then
	RC=0
else
	RC=$?
fi

problems=()
[ "$RC" -eq 0 ] || problems+=("rename exited $RC")
if [ "$RC" -eq 0 ]; then
	if ! bash "$WT2/bin/rename-theme.sh" "$REAL_SLUG" \
		--theme-name "$REAL_NAME" \
		--theme-version "$REAL_VERSION" \
		--repository "$REAL_REPOSITORY" \
		--contributors "$REAL_CONTRIBUTORS" >"$LOG" 2>&1; then
		problems+=("second identical rename was not idempotent")
	fi
fi
grep -q "${REAL_SNAKE}_" "$WT2/functions.php" 2>/dev/null || problems+=("functions.php missing client prefix")
grep -q "${REAL_UPPER}_" "$WT2/inc/navigation-migration.php" 2>/dev/null || problems+=("navigation migration missing client constant")
actual_client_theme_name="$(sed -n 's/^Theme Name:[[:space:]]*//p' "$WT2/style.css" 2>/dev/null | head -1 | sed 's/[[:space:]]*$//')"
[ "$actual_client_theme_name" = "$REAL_NAME" ] || problems+=("Theme Name mismatch: expected '$REAL_NAME', found '$actual_client_theme_name'")
grep -qE "^Text Domain:[[:space:]]*$REAL_SLUG$" "$WT2/style.css" 2>/dev/null || problems+=("Text Domain mismatch")
grep -qE "^Version:[[:space:]]*$REAL_VERSION$" "$WT2/style.css" 2>/dev/null || problems+=("theme version mismatch")
grep -qE '^Theme URI:[[:space:]]*https://kicobi\.com$' "$WT2/style.css" 2>/dev/null || problems+=("public Theme URI fallback mismatch")
grep -qE '^Author:[[:space:]]*Kicobi$' "$WT2/style.css" 2>/dev/null || problems+=("Kicobi author did not carry into client theme")
grep -qE '^Author URI:[[:space:]]*https://kicobi\.com$' "$WT2/style.css" 2>/dev/null || problems+=("Kicobi author URI did not carry into client theme")
[ "$(head -1 "$WT2/readme.txt" 2>/dev/null)" = "=== $REAL_NAME ===" ] || problems+=("readme title mismatch")
grep -qE "^Stable tag:[[:space:]]*$REAL_VERSION$" "$WT2/readme.txt" 2>/dev/null || problems+=("readme stable tag mismatch")
# The version audit runs inside every client's CI through verify-theme.sh. It
# used to assert one hardcoded Futurebase version across the client surfaces as
# well as the lifecycle ones, so a normal rename failed it on five surfaces and
# every promoted project went red on its first push. Nothing caught that: the
# audit had only ever run against the un-renamed template. A renamed worktree is
# the one place it could have surfaced, so run it here.
if ! (cd "$WT2" && node bin/verify-version-surfaces.mjs >>"$LOG" 2>&1); then
	problems+=("the version audit fails in a renamed client — a promoted project would fail its own CI")
fi
grep -qF "Contributors: $REAL_CONTRIBUTORS" "$WT2/readme.txt" 2>/dev/null || problems+=("readme contributors mismatch")
if grep -q '^Contributors:' "$WT2/style.css" 2>/dev/null; then
	problems+=("Contributors header was written to style.css instead of readme.txt")
fi
grep -qF '* Initial client theme release.' "$WT2/readme.txt" 2>/dev/null || problems+=("client changelog was not reset")
grep -qF " * $REAL_NAME theme functions." "$WT2/functions.php" 2>/dev/null || problems+=("functions.php display-name docblock mismatch")
if grep -qF "$REAL_NAME WP" "$WT2/style.css" "$WT2/readme.txt" "$WT2/functions.php" 2>/dev/null; then
	problems+=("client display name retained a trailing WP product suffix")
fi
for product_file in "${FUTUREBASE_PRODUCT_EXCLUSIONS[@]}"; do
	[ ! -e "$WT2/$product_file" ] || problems+=("Futurebase WP product file survived client rename: $product_file")
done

template_file="$WT2/tools/project-system/templates/lead/CLAUDE.md"
if [ -f "$template_file" ]; then
	grep -qF "$FUTUREBASE_TOOL_TEMPLATE_SENTINEL" "$template_file" 2>/dev/null || problems+=("tools contract was rewritten instead of copied verbatim")
fi

readme_count="$(grep -o "$FUTUREBASE_DISPLAY_SENTINEL" "$WT2/README.md" 2>/dev/null | wc -l | tr -d ' ')"
[ "$readme_count" = "1" ] || problems+=("client README has $readme_count Futurebase occurrences; expected one")
grep -qF 'Built on Futurebase WP.' "$WT2/README.md" 2>/dev/null || problems+=("client README provenance sentence missing")
if grep -qF '<!-- template-setup:' "$WT2/README.md" 2>/dev/null \
	|| grep -qF '## Rename checklist' "$WT2/README.md" 2>/dev/null \
	|| grep -qF '## Quick start with GitHub CLI' "$WT2/README.md" 2>/dev/null; then
	problems+=("client README retained template setup or rename instructions")
fi
if grep -qF "$REAL_NAME provenance sentence" "$WT2/README.md" 2>/dev/null \
	|| grep -qF "$REAL_NAME narrative" "$WT2/README.md" 2>/dev/null \
	|| grep -qF "$REAL_NAME product screenshot" "$WT2/README.md" 2>/dev/null; then
	problems+=("client README contains display-name-substituted Futurebase product prose")
fi

node - "$WT2/package.json" "$WT2/package-lock.json" "$WT2/composer.json" <<'NODE' || problems+=("client npm or Composer identity mismatch")
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const lock = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const composer = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const root = lock.packages?.[''];
if (manifest.name !== 'acme-client' || manifest.version !== '1.0.0') process.exit(1);
if (lock.name !== manifest.name || lock.version !== manifest.version) process.exit(1);
if (root?.name !== manifest.name || root?.version !== manifest.version) process.exit(1);
if (composer.name !== 'kicobi/acme-client') process.exit(1);
NODE

# No uppercase base names may remain outside base-owned tooling and the
# contract-aware verification scripts that must keep their Futurebase names.
upper_left="$(find "$WT2" -type f \
	-not -path "$WT2/.git/*" \
	-not -path "$WT2/node_modules/*" \
	-not -path "$WT2/vendor/*" \
	-not -path "$WT2/build/*" \
	-not -path "$WT2/tools/*" \
	-not -name 'rename-theme.sh' \
	-not -name 'test-rename.sh' \
	-not -name 'audit-identity.sh' \
	-exec grep -IHn -- "$FUTUREBASE_UPPER_SENTINEL" {} + 2>/dev/null | head -20 || true)"
if [ -n "$upper_left" ]; then
	problems+=("uppercase Futurebase names survived outside tools: $upper_left")
fi

# PORTABLE_BIN is copied verbatim, so every listed file must derive identity at
# runtime and contain no base slug after a client rename.
SYNC_LIB="$WT2/tools/project-system/lib/sync.mjs"
portable_bin="$(node -e "
	const { pathToFileURL } = require('node:url');
	import(pathToFileURL(process.argv[1]).href).then((module) => {
		if (!Array.isArray(module.PORTABLE_BIN) || module.PORTABLE_BIN.length === 0) process.exit(2);
		console.log(module.PORTABLE_BIN.join('\\n'));
	}).catch(() => process.exit(2));
" "$SYNC_LIB" 2>>"$LOG")"
if [ -z "$portable_bin" ]; then
	problems+=("could not read PORTABLE_BIN")
fi
for probe in fixtures $portable_bin; do
	target="$WT2/$probe"
	if [ ! -e "$target" ]; then
		[ "$probe" = fixtures ] || problems+=("$probe is listed in PORTABLE_BIN but missing")
		continue
	fi
	if grep -rInl -- "$FUTUREBASE_BASE_SLUG" "$target" >/dev/null 2>&1; then
		problems+=("$probe contains the base slug but is copied verbatim")
	fi
done

# PRODUCT_ONLY in the sync classifier and FUTUREBASE_PRODUCT_EXCLUSIONS here are
# the same fact in two languages: files belonging to Futurebase WP alone, which
# rename DELETES from a client. If they drift, sync starts telling the operator to
# port the product narrative — and the branded screenshot wp-admin displays — back
# into a client theme.
product_only="$(node -e "
	const { pathToFileURL } = require('node:url');
	import(pathToFileURL(process.argv[1]).href).then((module) => {
		if (!Array.isArray(module.PRODUCT_ONLY) || module.PRODUCT_ONLY.length === 0) process.exit(2);
		console.log(module.PRODUCT_ONLY.slice().sort().join('\\n'));
	}).catch(() => process.exit(2));
" "$SYNC_LIB" 2>>"$LOG")"
contract_product="$(printf '%s\n' "${FUTUREBASE_PRODUCT_EXCLUSIONS[@]}" | sort)"
if [ -z "$product_only" ]; then
	problems+=("could not read PRODUCT_ONLY from the sync classifier")
elif [ "$product_only" != "$contract_product" ]; then
	problems+=("PRODUCT_ONLY and FUTUREBASE_PRODUCT_EXCLUSIONS disagree — sync would offer a client the files rename deletes")
fi

if [ "${#problems[@]}" -gt 0 ]; then
	FAILED=1
	echo "rename non-regression: FAIL — real rename ($REAL_SLUG):"
	for problem in "${problems[@]}"; do echo "    - $problem"; done
	echo "  rename output (tail):"
	tail -25 "$LOG" | sed 's/^/    /'
else
	echo "  real-rename: OK ($REAL_SLUG applied cleanly; tools preserved)"
fi

# Standalone use keeps the Futurebase WP repository as Theme URI when no client
# URI is supplied. That is the runtime backstop's sole intentional exception.
STANDALONE_SLUG="standalone-client-probe"
STANDALONE_NAME="Standalone Client Probe"
make_worktree
WT3="$NEW_WT"
standalone_problems=()
if ! bash "$WT3/bin/rename-theme.sh" "$STANDALONE_SLUG" >"$LOG" 2>&1; then
	standalone_problems+=("standalone rename failed")
fi
grep -qF "Theme Name: $STANDALONE_NAME" "$WT3/style.css" 2>/dev/null || standalone_problems+=("standalone display-name default mismatch")
grep -qE "^Text Domain:[[:space:]]*$STANDALONE_SLUG$" "$WT3/style.css" 2>/dev/null || standalone_problems+=("standalone text domain mismatch")
grep -qE '^Theme URI:[[:space:]]*https://github\.com/kicobi/futurebase-wp$' "$WT3/style.css" 2>/dev/null || standalone_problems+=("standalone Theme URI compatibility exception missing")
grep -qF 'kicobi/futurebase-wp' "$WT3/package.json" 2>/dev/null || standalone_problems+=("standalone npm repository identity was rewritten")
grep -qF 'references/futurebase-context.md' "$WT3/docs/project-lifecycle.md" 2>/dev/null || standalone_problems+=("family lifecycle context name was rewritten")
grep -qF -- '--futurebase-path' "$WT3/docs/project-lifecycle.md" 2>/dev/null || standalone_problems+=("family lifecycle path flag was rewritten")
grep -qF 'Futurebase 2.x' "$WT3/docs/project-lifecycle.md" 2>/dev/null || standalone_problems+=("family lifecycle display name was rewritten")
unexpected_repository="${STANDALONE_SLUG}-wp"
if grep -rIn --exclude-dir=tools -- "$unexpected_repository" "$WT3" >/dev/null 2>&1; then
	standalone_problems+=("repository suffix was mistaken for a client theme handle")
fi
if [ "${#standalone_problems[@]}" -gt 0 ]; then
	FAILED=1
	echo "rename non-regression: FAIL — standalone rename ($STANDALONE_SLUG):"
	for problem in "${standalone_problems[@]}"; do echo "    - $problem"; done
	echo "  rename output (tail):"
	tail -25 "$LOG" | sed 's/^/    /'
else
	echo "  standalone-rename: OK (default identity and Theme URI exception)"
fi

[ "$FAILED" -eq 0 ] || exit 1
echo "rename non-regression: OK"
