#!/usr/bin/env bash
#
# bin/smoke-render.sh — behavioral smoke test against the active wp-env site.
#
#   1. imports demo content (idempotent; forwards --force, or $CI skips guard)
#   2. every registered section pattern renders non-empty (bin/smoke-render.php)
#   3. the page-notitle demo page renders WITHOUT a post-title heading
#   4. category / author / search pages render at least one result
#   5. an unknown URL returns HTTP 404
#
# Usage:  bin/smoke-render.sh --force    (local)
#         bin/smoke-render.sh            (CI)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE_ARGS=()
for arg in "$@"; do
	case "$arg" in
		--force) FORCE_ARGS+=( "--force" ) ;;
		*) echo "error: unknown argument: $arg" >&2; exit 2 ;;
	esac
done

wp() {
	npx --silent wp-env run cli wp "$@"
}

WP_URL=$(
	wp option get home --skip-themes --skip-plugins 2>/dev/null \
		| grep -oE '^https?://[^[:space:]]+$' \
		| head -1 \
		|| true
)
if [ -z "$WP_URL" ]; then
	echo "error: wp-env is not reachable; start it with 'npm run env:start'" >&2
	exit 1
fi
WP_URL="${WP_URL%/}"

./bin/demo-content.sh ${FORCE_ARGS[@]+"${FORCE_ARGS[@]}"}

FAIL=0
pass() { printf "  ✓ %s\n" "$1"; }
fail() { printf "  ✗ %s\n" "$1"; FAIL=1; }

theme_dir=$(
	wp eval 'echo get_stylesheet_directory();' 2>/dev/null \
		| grep -E '^/' \
		| head -1 \
		|| true
)
if [ -z "$theme_dir" ]; then
	echo "error: could not resolve the container-side theme directory" >&2
	exit 1
fi

if wp eval-file "$theme_dir/bin/smoke-render.php"; then
	pass "all section patterns render non-empty"
else
	fail "section pattern rendering — see output above"
fi

# Deterministic fixture slugs — keep in sync with fixtures/import-demo.php.
services_html=$(curl -fsS "$WP_URL/services/")
if printf "%s" "$services_html" | grep -qE '<h1[^>]*wp-block-post-title'; then
	fail "/services/ (page-notitle) renders a post-title heading"
else
	pass "/services/ uses the page-notitle template (no post-title heading)"
fi

for path in /category/notes/ /author/demo-author/ "/?s=demo"; do
	count=$(curl -fsS "$WP_URL$path" | grep -c 'wp-block-post-title' || true)
	if [ "$count" -ge 1 ]; then
		pass "$path lists $count result heading(s)"
	else
		fail "$path rendered an empty loop"
	fi
done

status=$(curl -s -o /dev/null -w '%{http_code}' "$WP_URL/this-page-does-not-exist/")
if [ "$status" = "404" ]; then
	pass "unknown URL returns 404"
else
	fail "unknown URL returned HTTP $status (expected 404)"
fi

# The fixture claims in its own header that it converges when re-run without an
# intervening `wp site empty`. Assert it, because the failure is silent: a plain
# wp_insert_post does not reject a duplicate slug, it coins `home-2` — leaving a
# site that looks imported while every scorecard URL points at the wrong post.
# Re-import over the state the checks above just used; nothing may change.
page_slugs() {
	wp post list --post_type=page --post_status=any --field=post_name 2>/dev/null \
		| tr -d '\r' \
		| sort \
		| tr '\n' ' '
}
before=$(page_slugs)
# Both failure modes have to be caught here, and they look nothing alike: the
# import can abort outright (a duplicate term is a hard WP_CLI::error), or it
# can succeed while quietly renaming pages. Guard the exit status explicitly —
# under `set -e` a non-zero eval-file would otherwise kill this script before
# the comparison runs, failing CI with no line saying why.
if ! wp eval-file "$theme_dir/fixtures/import-demo.php" > /dev/null 2>&1; then
	fail "re-import errored — the fixture cannot run over a site that already holds it"
else
	after=$(page_slugs)
	if [ "$before" = "$after" ]; then
		pass "re-import is idempotent (pages unchanged: $after)"
	else
		fail "re-import changed the page set: '$before' -> '$after'"
	fi
fi

if [ $FAIL -ne 0 ]; then
	echo "smoke-render: FAIL"
	exit 1
fi
echo "smoke-render: OK"
