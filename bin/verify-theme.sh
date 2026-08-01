#!/usr/bin/env bash
#
# bin/verify-theme.sh — Block theme standards verifier.
#
# Enforces the CI-checkable subset of the Technical Contract in CLAUDE.md —
# items 1, 3, 4, 5, 7, 8, and 9, scoped to the homepage/front-page workflow —
# plus the standard lint/static-analysis stack. Items 2 (no custom CSS for
# layout) and 6 (one source of truth per block style) rely on review
# discipline and are not grep-checkable. Non-zero exit on any failure.
#
# Run locally:  npm run verify
# Run from CI:  bin/verify-theme.sh

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./_pm-detect.sh
. "$ROOT/bin/_pm-detect.sh"

FAIL=0
pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAIL=1; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
section() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# ---------------------------------------------------------------------------
# 1. Tokens first. No raw hex/rgb/px/rem in pattern or template markup.
# ---------------------------------------------------------------------------
section "1. Tokens first (no raw hex/rgb/px/rem in patterns/templates/parts)"

# Scan only the content lines — skip PHP docblocks and HTML-comment header lines.
hex_hits=$(
	{ grep -rEn '#[0-9a-fA-F]{3,8}\b' patterns templates parts 2>/dev/null || true; } \
		| grep -v -E '^[^:]+:[0-9]+:[[:space:]]*(\*|//|<!--|\*/|/\*\*|\*\*)' \
		| grep -v -E '@package|@since|@return|@param' \
		|| true
)
if [ -n "$hex_hits" ]; then
	fail "raw hex color found in markup:"
	printf "%s\n" "$hex_hits" | sed 's/^/    /'
else
	pass "no raw hex colors in patterns/templates/parts"
fi

rgb_hits=$(
	{ grep -rEn '\brgba?\([^)]*\)' patterns templates parts 2>/dev/null || true; } \
		| grep -v -E '^[^:]+:[0-9]+:[[:space:]]*(\*|//|<!--)' \
		|| true
)
if [ -n "$rgb_hits" ]; then
	fail "raw rgb()/rgba() found in markup:"
	printf "%s\n" "$rgb_hits" | sed 's/^/    /'
else
	pass "no raw rgb()/rgba() in patterns/templates/parts"
fi

px_hits=$(
	{ grep -rEn '\b[0-9]+px\b' patterns templates parts 2>/dev/null || true; } \
		| grep -v -E '^[^:]+:[0-9]+:[[:space:]]*(\*|//|<!--|/\*\*)' \
		| grep -v -E 'Viewport Width' \
		| grep -v -E '"width":"[0-9]+px"' \
		| grep -v -E 'width="[0-9]+"' \
		|| true
)
# `px` in spacer/height attributes is tolerated for legacy core blocks;
# if you want to tighten further, remove the grep -v filters above.
if [ -n "$px_hits" ]; then
	# Treat as a warning surface — still report, but don't fail if every hit
	# is a known-ok pattern (outline/spacer heights, etc).
	offending=$(printf "%s\n" "$px_hits" | grep -vE ':[[:space:]]*<div style="height:\s*[0-9]+px"' || true)
	if [ -n "$offending" ]; then
		fail "raw px values in markup (outside known-ok spacers):"
		printf "%s\n" "$offending" | sed 's/^/    /'
	else
		pass "px values only appear in spacer heights (tolerated)"
	fi
else
	pass "no raw px values in patterns/templates/parts"
fi

rem_hits=$(
	{ grep -rEn '\b[0-9]+([.][0-9]+)?rem\b' patterns templates parts 2>/dev/null || true; } \
		| grep -v -E '^[^:]+:[0-9]+:[[:space:]]*(\*|//|<!--|/\*\*)' \
		|| true
)
if [ -n "$rem_hits" ]; then
	fail "raw rem values in markup:"
	printf "%s\n" "$rem_hits" | sed 's/^/    /'
else
	pass "no raw rem values in patterns/templates/parts"
fi

# ---------------------------------------------------------------------------
# 3. Patterns compose; templates wire.
#    front-page.html must not contain content blocks other than header/main/pattern/footer.
# ---------------------------------------------------------------------------
section "3, 4, 5, 7, 9. Parsed contract checks"

# These five moved into bin/verify-contract.mjs, which parses block markup and
# theme.json instead of grepping them. The greps here passed for the wrong
# reason: a blacklist that omitted core/list and core/html, a pattern count
# nobody took, a `"fluid": true` match that a nested preset satisfied, an AWK
# parser that read compact JSON as an empty list. bin/verify-contract.test.mjs
# feeds each check markup that must fail it.
if command -v node > /dev/null; then
	if contract_output=$(node bin/verify-contract.mjs 2>&1); then
		pass "contract items 3, 4, 5, 7, 9 (parsed)"
	else
		fail "contract violations:"
		printf "%s\n" "$contract_output" | sed 's/^/    /'
	fi

	if node --test bin/verify-contract.test.mjs > /dev/null 2>&1; then
		pass "contract checks still reject known-bad markup"
	else
		fail "bin/verify-contract.test.mjs failed — the contract checks are not proven to reject violations"
	fi
else
	fail "node not found on PATH (cannot run the parsed contract checks)"
fi

# ---------------------------------------------------------------------------
# 4. Section patterns use the _section-* prefix convention.
#    Baseline four must exist; every _section-* file must carry a well-formed
#    header whose Slug is <theme-slug>/section-<name> matching its filename.
# ---------------------------------------------------------------------------
section "4. Section patterns follow _section-* convention"

missing_sections=0
for slug in hero cards writing cta; do
	if [ ! -f "patterns/_section-${slug}.php" ]; then
		fail "patterns/_section-${slug}.php is missing"
		missing_sections=1
	fi
done
[ $missing_sections -eq 0 ] && pass "all four baseline section patterns present"

# Theme slug from style.css — the pattern namespace must match it, and the
# check must survive bin/rename-theme.sh, so never hardcode the slug here.
theme_slug=$(grep -E '^Text Domain:' style.css | head -1 | sed 's/^Text Domain:[[:space:]]*//' | tr -d '[:space:]')
if [ -z "$theme_slug" ]; then
	fail "style.css has no Text Domain header (cannot validate pattern slugs)"
else
	header_bad=0
	for f in patterns/_section-*.php; do
		[ -e "$f" ] || continue
		name=$(basename "$f" .php)
		name="${name#_section-}"
		if ! grep -qE '^\s*\*\s*Title:\s*\S' "$f"; then
			fail "$f header is missing a Title"
			header_bad=1
		fi
		if ! grep -qE "^\s*\*\s*Slug:\s*${theme_slug}/section-${name}\s*$" "$f"; then
			fail "$f header Slug must be exactly '${theme_slug}/section-${name}'"
			header_bad=1
		fi
	done
	[ $header_bad -eq 0 ] && pass "every _section-* pattern has a Title and a matching '${theme_slug}/section-*' slug"
fi

# Placeholder inventory — [UPPERCASE] tokens are substitution placeholders
# (docs/conventions.md) and must never ship in pattern/template/part content.
placeholder_hits=$(grep -rEn '\[[A-Z][A-Z0-9_ -]*\]' patterns templates parts 2>/dev/null || true)
if [ -n "$placeholder_hits" ]; then
	fail "[UPPERCASE] placeholder still visible in shipped markup:"
	printf "%s\n" "$placeholder_hits" | sed 's/^/    /'
else
	pass "no [UPPERCASE] placeholders in patterns/templates/parts"
fi

# ---------------------------------------------------------------------------
# 7. Fluid typography is on; no raw clamp() in patterns/templates.
# ---------------------------------------------------------------------------
section "7. Fluid typography (raw clamp)"

# settings.typography.fluid and the fontSize presets are checked by
# bin/verify-contract.mjs — both needed parsed JSON rather than a grep that
# a nested key could satisfy. What remains here is markup-level.
clamp_hits=$(grep -rEn '\bclamp\(' patterns templates parts 2>/dev/null || true)
if [ -n "$clamp_hits" ]; then
	fail "raw clamp() in markup — move to a fontSize preset with fluid: { min, max }"
	printf "%s\n" "$clamp_hits" | sed 's/^/    /'
else
	pass "no raw clamp() in patterns/templates/parts"
fi

# The fontSize preset rule lives in bin/verify-contract.mjs now. This version
# skipped every non-rem size, so a 32px preset needing a fluid range passed by
# not being looked at.

# Every assets/fonts/ reference in theme.json fontFamilies[].fontFace[].src
# points at a real file. Only fires when the theme declares custom faces —
# system stacks (sans-serif / serif / monospace) are a no-op.
if command -v node > /dev/null; then
	if font_output=$(node -e '
		const theme = require("./theme.json");
		const fs = require("fs");
		const fams = ((theme.settings || {}).typography || {}).fontFamilies || [];
		const missing = [];
		for (const f of fams) {
			const faces = f.fontFace || [];
			for (const face of (Array.isArray(faces) ? faces : [faces])) {
				const srcs = face.src || [];
				for (const src of (Array.isArray(srcs) ? srcs : [srcs])) {
					if (typeof src !== "string") continue;
					const m = src.match(/(?:file:)?(\.?\/?assets\/fonts\/[^"\s)]+)/);
					if (!m) continue;
					const rel = m[1].replace(/^\.\//, "");
					if (!fs.existsSync(rel)) missing.push(rel + " (family: " + (f.slug || "?") + ")");
				}
			}
		}
		if (missing.length) { console.log(missing.join("\n")); process.exit(1); }
	' 2>&1); then
		pass "theme.json assets/fonts/ references resolve (or none declared)"
	else
		fail "theme.json references missing font files:"
		printf "%s\n" "$font_output" | sed 's/^/    /'
	fi
else
	fail "node not found on PATH (cannot check font references)"
fi

# ---------------------------------------------------------------------------
# Theme-bound blocks — every src/blocks/<slug>/block.json must have a matching
# build/blocks/<slug>/block.json. futurebase_register_blocks() in
# functions.php only sees the compiled tree, so a source block without a
# build is silently unregistered until someone runs `npm run build`. Catch
# drift here instead of in the editor.
# ---------------------------------------------------------------------------
section "Theme-bound blocks compiled"

if [ -d src/blocks ]; then
	src_blocks=$(find src/blocks -mindepth 2 -maxdepth 2 -name block.json 2>/dev/null || true)
	if [ -z "$src_blocks" ]; then
		pass "no theme-bound blocks declared"
	else
		missing_builds=0
		for src_manifest in $src_blocks; do
			slug=$(basename "$(dirname "$src_manifest")")
			if [ ! -f "build/blocks/${slug}/block.json" ]; then
				fail "src/blocks/${slug} has no compiled build/blocks/${slug}/block.json — run 'npm run build'"
				missing_builds=1
			fi
		done
		[ $missing_builds -eq 0 ] && pass "every src/blocks/<slug> has a compiled build/blocks/<slug>"
	fi
else
	pass "src/blocks/ not present (no theme-bound blocks)"
fi

# ---------------------------------------------------------------------------
# Style variations — every styles/*.json file must parse. Broken variation
# JSON silently degrades to "no variation available" in the editor; catch
# it here so it isn't discovered at project delivery.
# ---------------------------------------------------------------------------
section "Style variations parse"

if command -v node > /dev/null; then
	style_files=$(find styles -maxdepth 1 -name '*.json' 2>/dev/null || true)
	if [ -z "$style_files" ]; then
		pass "no styles/*.json files declared"
	else
		if styles_output=$(node -e '
			const fs = require("fs");
			const path = require("path");
			const dir = "styles";
			if (!fs.existsSync(dir)) process.exit(0);
			const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
			const bad = [];
			for (const f of files) {
				const full = path.join(dir, f);
				try { JSON.parse(fs.readFileSync(full, "utf8")); }
				catch (e) { bad.push(full + ": " + e.message); }
			}
			if (bad.length) { console.log(bad.join("\n")); process.exit(1); }
		' 2>&1); then
			pass "every styles/*.json file parses"
		else
			fail "styles/*.json contains invalid JSON:"
			printf "%s\n" "$styles_output" | sed 's/^/    /'
		fi
	fi
else
	fail "node not found on PATH (cannot validate styles/*.json)"
fi

# ---------------------------------------------------------------------------
# Comment grammar (docs/conventions.md).
#   TODO(kind): is the only TODO form. Kinds: copy, design, content, a11y, perf.
#   FIXME / XXX / HACK are forbidden — rewrite as TODO(kind):.
# ---------------------------------------------------------------------------
section "Comment grammar (TODO(kind): only)"

bad_todos=$(
	{ grep -rEn '\bTODO\b' patterns templates parts assets inc functions.php 2>/dev/null || true; } \
		| grep -vE 'TODO\((copy|design|content|a11y|perf)\):' \
		|| true
)
if [ -n "$bad_todos" ]; then
	fail "TODO without a valid kind — allowed kinds: copy, design, content, a11y, perf"
	printf "%s\n" "$bad_todos" | sed 's/^/    /'
else
	pass "every TODO has a valid kind"
fi

forbidden=$(grep -rEn '\b(FIXME|XXX|HACK)\b' patterns templates parts assets inc functions.php 2>/dev/null || true)
if [ -n "$forbidden" ]; then
	fail "FIXME/XXX/HACK are forbidden — rewrite as TODO(kind):"
	printf "%s\n" "$forbidden" | sed 's/^/    /'
else
	pass "no FIXME/XXX/HACK"
fi

# ---------------------------------------------------------------------------
# Rename script non-regression (Issue #4).
#   bin/test-rename.sh runs the rename against a substring-containing slug in
#   an isolated worktree and asserts no double-suffix output appears. Guards
#   against regressing the boundary/safety-check fix from that issue.
# ---------------------------------------------------------------------------
section "Rename collision safety (Issue #4)"

if bash "$ROOT/bin/audit-identity.sh"; then
	pass "legacy identity allowlist"
else
	fail "legacy identity allowlist — see output above"
fi

if node "$ROOT/bin/verify-version-surfaces.mjs"; then
	pass "Futurebase WP version surfaces"
else
	fail "Futurebase WP version surfaces — see output above"
fi

if bash "$ROOT/bin/test-rename.sh"; then
	pass "rename non-regression smoke test"
else
	fail "rename non-regression smoke test — see output above"
fi

# ---------------------------------------------------------------------------
# Standard tool stack (build, lint, phpcs, phpstan).
# ---------------------------------------------------------------------------
section "Build / lint / phpcs / phpstan"

run() {
	local label="$1"; shift
	local log
	log="$(mktemp -t theme-verify.XXXXXX)"
	if "$@" > "$log" 2>&1; then
		pass "$label"
	else
		fail "$label"
		sed 's/^/    /' "$log"
	fi
	rm -f "$log"
}

if command -v npm > /dev/null; then
	run "npm run build"     npm run --silent build
	run "npm run lint"      npm run --silent lint
	run "npm run lint:css"  npm run --silent lint:css
	run "npm run lint:pkg"  npm run --silent lint:pkg
else
	fail "npm not found on PATH"
fi

if command -v composer > /dev/null; then
	run "composer phpcs"    composer phpcs
	run "composer phpstan"  composer phpstan
else
	fail "composer not found on PATH"
fi

# ---------------------------------------------------------------------------
# Accessibility gate (pa11y-ci). Needs a running WordPress instance — normally
# wp-env. wp-env defaults to port 8888 but shifts to 8890+ when another
# project already holds 8888, so the a11y runner asks wp-env for the real home
# URL rather than trusting a hardcoded port. If wp-env isn't reachable at all,
# verify keeps the non-a11y workflows usable by warning instead of failing.
# When the server is up, pa11y-ci is a real gate: any WCAG2AA violation fails.
# ---------------------------------------------------------------------------
section "Accessibility"

if command -v npm > /dev/null; then
	WP_URL=""
	if command -v npx > /dev/null 2>&1; then
		WP_URL=$(
			npx --silent wp-env run cli wp option get home --skip-themes --skip-plugins 2>/dev/null \
				| grep -oE '^https?://[^[:space:]]+$' \
				| head -1 \
				|| true
		)
	fi
	WP_URL="${WP_URL%/}"
	if [ -n "$WP_URL" ] && curl -fsS --max-time 2 "$WP_URL/" > /dev/null 2>&1; then
		run "pa11y-ci wp-env desktop/mobile ($WP_URL)" "$ROOT/bin/a11y-wp-env.sh"
	else
		warn "wp-env not reachable — start it with 'npm run env:start' to exercise the a11y gate"
	fi
else
	fail "npm not found on PATH (cannot run a11y)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf "\n"
if [ $FAIL -ne 0 ]; then
	printf "\033[31mverify-theme: FAIL\033[0m\n"
	exit 1
fi
printf "\033[32mverify-theme: OK\033[0m\n"
