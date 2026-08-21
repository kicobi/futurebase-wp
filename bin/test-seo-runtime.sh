#!/usr/bin/env bash
# Exercise companion SEO behavior in the real wp-env WordPress runtime.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./_seo-plugin.sh
. "$ROOT/bin/_seo-plugin.sh"

if seo_plugin_dir > /dev/null; then
	:
else
	status=$?
	if [ "$status" -eq 1 ]; then
		echo "companion SEO runtime: skipped (plugin not present)"
		exit 0
	fi
	exit "$status"
fi

wp() {
	npx --silent wp-env run cli wp "$@"
}

pass() { printf '  ✓ %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1" >&2; exit 1; }
contains() {
	case "$1" in
		*"$2"*) return 0 ;;
		*) return 1 ;;
	esac
}
not_contains() { ! contains "$1" "$2"; }
head_only() { sed -n '/<head/,/<\/head>/p'; }
seo_metadata_only() { grep -E "<title>|<meta name=['\"](description|robots|twitter:)|<meta property=['\"](og:|article:)|<link rel=['\"]canonical|application/ld\\+json"; }

SEO_TEST_THEME_DIR=""
SEO_TEST_COOKIE="$(mktemp)"

cleanup() {
	if [ -n "$SEO_TEST_THEME_DIR" ]; then
		wp option delete compseo_runtime_invalid_contract > /dev/null 2>&1 || true
		wp option delete compseo_runtime_valid_contract > /dev/null 2>&1 || true
		wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" cleanup > /dev/null 2>&1 || true
	fi
	for fixture in compseo-fixture-yoast compseo-fixture-rank-math compseo-runtime-fixture; do
		wp plugin deactivate "$fixture" > /dev/null 2>&1 || true
		wp plugin delete "$fixture" > /dev/null 2>&1 || true
	done
	rm -f "$SEO_TEST_COOKIE"
}
trap cleanup EXIT

SEO_TEST_URL=$(
	wp option get home --skip-themes --skip-plugins 2>/dev/null \
		| grep -oE '^https?://[^[:space:]]+$' \
		| head -1 \
		|| true
)
[ -n "$SEO_TEST_URL" ] || fail "wp-env is not reachable; start it with npm run env:start"
SEO_TEST_URL="${SEO_TEST_URL%/}"

SEO_TEST_THEME_DIR=$(
	wp eval 'echo get_stylesheet_directory();' 2>/dev/null \
		| grep -E '^/' \
		| head -1 \
		|| true
)
[ -n "$SEO_TEST_THEME_DIR" ] || fail "could not resolve the container-side theme directory"

wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" install-plugins > /dev/null
wp plugin activate compseo-runtime-fixture > /dev/null
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" setup > /dev/null
wp rewrite flush > /dev/null
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-contracts > /dev/null
pass "registered metadata, permissions, sanitization, revisions, and public CPT support"

SEO_TEST_PUBLIC_ID=$(wp post list --post_type=post --name=compseo-runtime-public --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_NO_IMAGE_ID=$(wp post list --post_type=post --name=compseo-runtime-no-image --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_AUTHORED_ID=$(wp post list --post_type=post --name=compseo-runtime-authored --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_PROTECTED_ID=$(wp post list --post_type=post --name=compseo-runtime-protected --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_PROTECTED_AUTHORED_ID=$(wp post list --post_type=post --name=compseo-runtime-protected-authored --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_FRONT_ID=$(wp post list --post_type=page --name=compseo-runtime-front --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_POSTS_PAGE_ID=$(wp post list --post_type=page --name=compseo-runtime-news --field=ID --format=ids | tail -1 | tr -d '\r')

for id in "$SEO_TEST_PUBLIC_ID" "$SEO_TEST_NO_IMAGE_ID" "$SEO_TEST_AUTHORED_ID" "$SEO_TEST_PROTECTED_ID" "$SEO_TEST_PROTECTED_AUTHORED_ID" "$SEO_TEST_FRONT_ID" "$SEO_TEST_POSTS_PAGE_ID"; do
	[ -n "$id" ] || fail "runtime fixture IDs could not be resolved"
done

SEO_TEST_PUBLIC_URL=$(wp post url "$SEO_TEST_PUBLIC_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_NO_IMAGE_URL=$(wp post url "$SEO_TEST_NO_IMAGE_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_AUTHORED_URL=$(wp post url "$SEO_TEST_AUTHORED_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_PROTECTED_URL=$(wp post url "$SEO_TEST_PROTECTED_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_PROTECTED_AUTHORED_URL=$(wp post url "$SEO_TEST_PROTECTED_AUTHORED_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)

SEO_TEST_HTML=$(curl -fsS "$SEO_TEST_PUBLIC_URL")
SEO_TEST_HEAD=$(printf '%s' "$SEO_TEST_HTML" | head_only)
contains "$SEO_TEST_HEAD" 'content="Första meningen med café. Second sentence stays public."' || fail "nested-block description fallback is incomplete"
SEO_TEST_DESCRIPTION_LINES=$(printf '%s' "$SEO_TEST_HEAD" | grep -E 'description|application/ld\+json' || true)
not_contains "$SEO_TEST_DESCRIPTION_LINES" 'Third sentence must not appear in metadata.' || fail "description fallback emitted more than two sentences"
contains "$SEO_TEST_HEAD" 'property="og:image:width"' || fail "Open Graph image width is missing"
contains "$SEO_TEST_HEAD" 'property="og:image:height"' || fail "Open Graph image height is missing"
contains "$SEO_TEST_HEAD" 'property="og:image:type" content="image/png"' || fail "Open Graph image MIME type is missing"
contains "$SEO_TEST_HEAD" 'property="og:image:alt" content="Protected featured artwork"' || fail "Open Graph image alt text is missing"
contains "$SEO_TEST_HEAD" 'name="twitter:card" content="summary_large_image"' || fail "large-image X card was not selected"
contains "$SEO_TEST_HEAD" '"@type":"Article"' || fail "ordinary posts must emit Article schema"
contains "$SEO_TEST_HEAD" '"publisher":{"@id"' || fail "configured factual publisher is missing from Article schema"
SEO_TEST_CANONICAL_COUNT=$(printf '%s' "$SEO_TEST_HEAD" | grep -c 'rel="canonical"' || true)
[ "$SEO_TEST_CANONICAL_COUNT" -eq 1 ] || fail "singular output must contain exactly one core canonical"
SEO_TEST_DERIVED_DESCRIPTION=$(wp post meta get "$SEO_TEST_PUBLIC_ID" _compseo_description 2>/dev/null || true)
[ -z "$SEO_TEST_DERIVED_DESCRIPTION" ] || fail "render-time description fallback was persisted"
pass "content fallback, social image details, canonical, and Article schema"

wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" default-image-off > /dev/null
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_NO_IMAGE_URL" | head_only)
contains "$SEO_TEST_HEAD" 'name="description" content="Explicit excerpt wins over the content fallback."' || fail "explicit excerpt did not precede content fallback"
contains "$SEO_TEST_HEAD" 'name="twitter:card" content="summary"' || fail "image-free output did not select the summary card"
not_contains "$SEO_TEST_HEAD" 'property="og:image"' || fail "image-free output emitted an Open Graph image"
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" default-image-on > /dev/null
pass "explicit excerpt precedence and image-free summary card"

SEO_TEST_REST=$(curl -fsS "$SEO_TEST_URL/wp-json/wp/v2/posts/$SEO_TEST_PUBLIC_ID")
contains "$SEO_TEST_REST" '"_compseo_title"' || fail "registered metadata is missing from the REST response"
contains "$SEO_TEST_REST" '"_compseo_social_image_id"' || fail "social image metadata is missing from the REST response"
pass "registered metadata is exposed through the core REST resource"

wp option update compseo_runtime_valid_contract 1 > /dev/null
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_PUBLIC_URL" | head_only)
contains "$SEO_TEST_HEAD" '<title>Adapter-owned document title</title>' || fail "document adapter did not control the complete title tag"
contains "$SEO_TEST_HEAD" 'name="description" content="Adapter-owned public description."' || fail "document adapter did not control the description"
contains "$SEO_TEST_HEAD" '<link rel="canonical" href="https://adapter.example/canonical?lang=sv"' || fail "document adapter did not control the canonical tag"
contains "$SEO_TEST_HEAD" 'property="og:title" content="Adapter-owned document title"' || fail "document adapter title did not reach Open Graph output"
SEO_TEST_CANONICAL_COUNT=$(printf '%s' "$SEO_TEST_HEAD" | grep -c 'rel="canonical"' || true)
[ "$SEO_TEST_CANONICAL_COUNT" -eq 1 ] || fail "document adapter produced duplicate canonical tags"
wp option delete compseo_runtime_valid_contract > /dev/null
pass "valid document adapters control title, description, canonical, and social output"

SEO_TEST_HTML=$(curl -fsS "$SEO_TEST_AUTHORED_URL")
SEO_TEST_HEAD=$(printf '%s' "$SEO_TEST_HTML" | head_only)
contains "$SEO_TEST_HEAD" '<title>Authored Full Title</title>' || fail "authored title was not treated as the complete document title"
contains "$SEO_TEST_HEAD" '<link rel="canonical" href="https://example.net/reference?lang=sv"' || fail "cross-origin canonical override was not emitted"
if not_contains "$SEO_TEST_HEAD" 'name="robots"' && not_contains "$SEO_TEST_HEAD" "name='robots'"; then
	fail "authored noindex did not produce robots output"
fi
contains "$SEO_TEST_HEAD" 'noindex' || fail "authored noindex directive is missing"
contains "$SEO_TEST_HEAD" 'follow' || fail "authored noindex must remain follow"
SEO_TEST_DESCRIPTION=$(printf '%s' "$SEO_TEST_HEAD" | grep -F 'name="description"' | head -1)
[ "${#SEO_TEST_DESCRIPTION}" -gt 180 ] || fail "authored descriptions were truncated"
pass "complete authored title, non-truncated description, canonical override, and noindex"

SEO_TEST_BEFORE=$(curl -fsS "$SEO_TEST_PROTECTED_URL" | head_only | seo_metadata_only)
not_contains "$SEO_TEST_BEFORE" 'TOP SECRET CONTENT MUST NOT LEAK' || fail "protected content leaked before password entry"
not_contains "$SEO_TEST_BEFORE" 'HIDDEN EXCERPT MUST NOT LEAK' || fail "protected excerpt leaked before password entry"
not_contains "$SEO_TEST_BEFORE" 'Protected featured artwork' || fail "protected featured image leaked before password entry"
contains "$SEO_TEST_BEFORE" 'Public default artwork' || fail "protected output did not use the public site default image"
not_contains "$SEO_TEST_BEFORE" '"@type":"Article"' || fail "protected content emitted Article schema"
contains "$SEO_TEST_BEFORE" 'noindex' || fail "protected content is missing noindex"
contains "$SEO_TEST_BEFORE" 'follow' || fail "protected content must remain follow"

curl -fsS -c "$SEO_TEST_COOKIE" -d 'post_password=opensesame' "$SEO_TEST_URL/wp-login.php?action=postpass" -o /dev/null
SEO_TEST_AFTER=$(curl -fsS -b "$SEO_TEST_COOKIE" "$SEO_TEST_PROTECTED_URL" | head_only | seo_metadata_only)
[ "$SEO_TEST_BEFORE" = "$SEO_TEST_AFTER" ] || fail "protected metadata changed after a valid password cookie"
pass "password metadata is invariant and leaks no excerpt, content, featured image, or Article schema"

SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_PROTECTED_AUTHORED_URL" | head_only)
contains "$SEO_TEST_HEAD" '<title>Public protected title</title>' || fail "deliberately authored protected title was withheld"
contains "$SEO_TEST_HEAD" 'Deliberately public protected description.' || fail "deliberately authored protected description was withheld"
contains "$SEO_TEST_HEAD" 'Protected featured artwork' || fail "deliberately authored protected social image was withheld"
pass "deliberately authored protected metadata remains public"

SEO_TEST_HTML=$(curl -fsS "$SEO_TEST_URL/")
SEO_TEST_HEAD=$(printf '%s' "$SEO_TEST_HTML" | head_only)
contains "$SEO_TEST_HEAD" 'name="description" content="Public site tagline"' || fail "latest-posts home did not use the site tagline"
contains "$SEO_TEST_HEAD" '"@type":"WebSite"' || fail "home is missing WebSite schema"
contains "$SEO_TEST_HEAD" '"@type":"Organization"' || fail "home is missing configured Organization schema"
pass "latest-posts home description and factual schema graph"

wp option update show_on_front page > /dev/null
wp option update page_on_front "$SEO_TEST_FRONT_ID" > /dev/null
wp option update page_for_posts "$SEO_TEST_POSTS_PAGE_ID" > /dev/null
wp rewrite flush > /dev/null

SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_URL/" | head_only)
contains "$SEO_TEST_HEAD" 'Static front sentence one. Static front sentence two.' || fail "static front page did not resolve page content"
SEO_TEST_DESCRIPTION_LINES=$(printf '%s' "$SEO_TEST_HEAD" | grep -E 'description|application/ld\+json' || true)
not_contains "$SEO_TEST_DESCRIPTION_LINES" 'Static front sentence three.' || fail "static front page emitted more than two sentences"
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_URL/compseo-runtime-news/" | head_only)
contains "$SEO_TEST_HEAD" 'Assigned posts page description.' || fail "assigned posts page did not use its authored description"
pass "static front and assigned posts-page description order"

wp option update show_on_front posts > /dev/null
wp rewrite flush > /dev/null
SEO_TEST_ARCHIVE_URL="$SEO_TEST_URL/category/compseo-runtime/"
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_ARCHIVE_URL" | head_only)
contains "$SEO_TEST_HEAD" "<link rel=\"canonical\" href=\"$SEO_TEST_ARCHIVE_URL\"" || fail "ordinary archive canonical is missing"
SEO_TEST_HEAD=$(curl -fsS "${SEO_TEST_ARCHIVE_URL}page/2/" | head_only)
contains "$SEO_TEST_HEAD" "<link rel=\"canonical\" href=\"${SEO_TEST_ARCHIVE_URL}page/2/\"" || fail "paged archive did not self-canonicalize"
SEO_TEST_HEAD=$(curl -fsS "${SEO_TEST_ARCHIVE_URL}?lang=sv" | head_only)
not_contains "$SEO_TEST_HEAD" 'rel="canonical"' || fail "PR 2 must remain silent on archive canonicals with external query parameters"
pass "ordinary and paged archive canonicals; query states remain silent"

for path in '/?s=runtime' '/compseo-runtime-public/embed/' '/feed/' '/definitely-not-a-runtime-page/'; do
	SEO_TEST_HEAD=$(curl -sS "$SEO_TEST_URL$path" | head_only)
	not_contains "$SEO_TEST_HEAD" 'property="og:' || fail "$path received companion social output"
	not_contains "$SEO_TEST_HEAD" 'application/ld+json' || fail "$path received companion schema output"
done
pass "search, embeds, feeds, and 404s receive no companion document output"

wp option update compseo_runtime_invalid_contract 1 > /dev/null
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-invalid-contract > /dev/null
wp option delete compseo_runtime_invalid_contract > /dev/null
pass "invalid adapter output falls back loudly without echoing the rejected value"

for provider in compseo-fixture-yoast compseo-fixture-rank-math; do
	wp plugin activate "$provider" > /dev/null
	wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-suppressed > /dev/null
	SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_AUTHORED_URL" | head_only)
	not_contains "$SEO_TEST_HEAD" 'Authored Full Title' || fail "$provider did not suppress the title override"
	not_contains "$SEO_TEST_HEAD" 'property="og:' || fail "$provider did not suppress Open Graph output"
	not_contains "$SEO_TEST_HEAD" 'name="description"' || fail "$provider did not suppress the meta description"
	not_contains "$SEO_TEST_HEAD" 'https://example.net/reference?lang=sv' || fail "$provider did not suppress the canonical override"
	wp plugin deactivate "$provider" > /dev/null
	pass "$provider suppresses output and REST metadata independently"
done

echo "companion SEO runtime: OK"
