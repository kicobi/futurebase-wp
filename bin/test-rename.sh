#!/usr/bin/env bash
# Non-regression smoke test for the Futurebase-to-client rename contract.

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
		echo "rename non-regression: FAIL (Futurebase template sentinel missing)"
		exit 1
	fi
	echo "rename non-regression: skipped (repo is no longer in template state)"
	exit 0
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
REAL_SLUG="acme-client-probe"
REAL_SNAKE="acme_client_probe"
REAL_UPPER="ACME_CLIENT_PROBE"
REAL_NAME="Acme Client Probe"
REAL_VERSION="1.0.0"
REAL_REPOSITORY="acme/acme-client-probe"
make_worktree
WT2="$NEW_WT"

if bash "$WT2/bin/rename-theme.sh" "$REAL_SLUG" \
	--theme-name "$REAL_NAME" \
	--theme-version "$REAL_VERSION" \
	--theme-uri "https://github.com/$REAL_REPOSITORY" \
	--repository "$REAL_REPOSITORY" >"$LOG" 2>&1; then
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
		--theme-uri "https://github.com/$REAL_REPOSITORY" \
		--repository "$REAL_REPOSITORY" >"$LOG" 2>&1; then
		problems+=("second identical rename was not idempotent")
	fi
fi
grep -q "${REAL_SNAKE}_" "$WT2/functions.php" 2>/dev/null || problems+=("functions.php missing client prefix")
grep -q "${REAL_UPPER}_" "$WT2/inc/navigation-migration.php" 2>/dev/null || problems+=("navigation migration missing client constant")
grep -qE "^Theme Name:[[:space:]]*$REAL_NAME$" "$WT2/style.css" 2>/dev/null || problems+=("Theme Name mismatch")
grep -qE "^Text Domain:[[:space:]]*$REAL_SLUG$" "$WT2/style.css" 2>/dev/null || problems+=("Text Domain mismatch")
grep -qE "^Version:[[:space:]]*$REAL_VERSION$" "$WT2/style.css" 2>/dev/null || problems+=("theme version mismatch")
grep -qF "=== $REAL_NAME ===" "$WT2/readme.txt" 2>/dev/null || problems+=("readme title mismatch")
grep -qE "^Stable tag:[[:space:]]*$REAL_VERSION$" "$WT2/readme.txt" 2>/dev/null || problems+=("readme stable tag mismatch")
grep -qF '* Initial client theme release.' "$WT2/readme.txt" 2>/dev/null || problems+=("client changelog was not reset")
[ ! -e "$WT2/docs/futurebase.md" ] || problems+=("Futurebase product narrative survived in client docs")
[ ! -e "$WT2/docs/futurebase-company-site.md" ] || problems+=("Futurebase company-site brief survived in client docs")
[ ! -e "$WT2/docs/assets/futurebase-social.png" ] || problems+=("Futurebase social asset survived in client docs")
[ ! -e "$WT2/screenshot.png" ] || problems+=("Futurebase screenshot survived in the client theme")

template_file="$WT2/tools/project-system/templates/lead/CLAUDE.md"
if [ -f "$template_file" ]; then
	grep -qF "$FUTUREBASE_TOOL_TEMPLATE_SENTINEL" "$template_file" 2>/dev/null || problems+=("tools contract was rewritten instead of copied verbatim")
fi

readme_count="$(grep -o "$FUTUREBASE_DISPLAY_SENTINEL" "$WT2/README.md" 2>/dev/null | wc -l | tr -d ' ')"
[ "$readme_count" = "1" ] || problems+=("client README has $readme_count Futurebase occurrences; expected one")

node - "$WT2/package.json" "$WT2/package-lock.json" <<'NODE' || problems+=("npm manifest/lock root identities disagree")
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const lock = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const root = lock.packages?.[''];
if (manifest.name !== 'acme-client-probe' || manifest.version !== '1.0.0') process.exit(1);
if (lock.name !== manifest.name || lock.version !== manifest.version) process.exit(1);
if (root?.name !== manifest.name || root?.version !== manifest.version) process.exit(1);
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

if [ "${#problems[@]}" -gt 0 ]; then
	FAILED=1
	echo "rename non-regression: FAIL — real rename ($REAL_SLUG):"
	for problem in "${problems[@]}"; do echo "    - $problem"; done
	echo "  rename output (tail):"
	tail -25 "$LOG" | sed 's/^/    /'
else
	echo "  real-rename: OK ($REAL_SLUG applied cleanly; tools preserved)"
fi

# Standalone use keeps the Futurebase repository as Theme URI when no client
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
grep -qE '^Theme URI:[[:space:]]*https://github\.com/studiokicobi/futurebase$' "$WT3/style.css" 2>/dev/null || standalone_problems+=("standalone Theme URI compatibility exception missing")
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
