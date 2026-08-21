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
head_only() { sed -n '/<head[ >]/,/<\/head>/p'; }
seo_metadata_only() { grep -E "<title>|<meta name=['\"](description|robots|twitter:)|<meta property=['\"](og:|article:)|<link rel=['\"]canonical|application/ld\\+json"; }
robots_only() { grep -E "<meta name=['\"]robots" | head -1; }

SEO_TEST_THEME_DIR=""
SEO_TEST_COOKIE="$(mktemp)"

cleanup() {
	if [ -n "$SEO_TEST_THEME_DIR" ]; then
		wp option delete compseo_runtime_invalid_contract > /dev/null 2>&1 || true
		wp option delete compseo_runtime_valid_contract > /dev/null 2>&1 || true
		wp option delete compseo_runtime_invalid_indexing_contract > /dev/null 2>&1 || true
		wp option delete compseo_runtime_invalid_query_contract > /dev/null 2>&1 || true
		wp option delete compseo_runtime_indexable_lang > /dev/null 2>&1 || true
		wp option delete compseo_runtime_force_index > /dev/null 2>&1 || true
		wp option delete compseo_runtime_sitemap_page_size > /dev/null 2>&1 || true
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

SEO_TEST_THEME_TEXT_DOMAIN=$(sed -n 's/^Text Domain:[[:space:]]*//p' style.css | head -1 | tr -d '[:space:]')
[[ "$SEO_TEST_THEME_TEXT_DOMAIN" =~ ^[a-z0-9-]+$ ]] || fail "could not resolve the mounted theme identity"
SEO_TEST_THEME_DIR=$(
	wp eval "\$matches = array(); foreach ( wp_get_themes() as \$slug => \$theme ) { if ( '$SEO_TEST_THEME_TEXT_DOMAIN' === \$theme->get( 'TextDomain' ) ) { \$matches[] = get_theme_root( \$slug ) . '/' . \$slug; } } if ( 1 === count( \$matches ) ) { echo \$matches[0]; }" --skip-themes --skip-plugins 2>/dev/null \
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
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-settings > /dev/null
pass "schema-versioned settings sanitize verification tags without echoing rejected values"
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-editor > /dev/null
pass "supported block-editor screens receive the compiled SEO sidebar asset"

SEO_TEST_PUBLIC_ID=$(wp post list --post_type=post --name=compseo-runtime-public --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_NO_IMAGE_ID=$(wp post list --post_type=post --name=compseo-runtime-no-image --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_AUTHORED_ID=$(wp post list --post_type=post --name=compseo-runtime-authored --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_PROTECTED_ID=$(wp post list --post_type=post --name=compseo-runtime-protected --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_PROTECTED_AUTHORED_ID=$(wp post list --post_type=post --name=compseo-runtime-protected-authored --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_FRONT_ID=$(wp post list --post_type=page --name=compseo-runtime-front --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_POSTS_PAGE_ID=$(wp post list --post_type=page --name=compseo-runtime-news --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_BOOK_ID=$(wp post list --post_type=compseo_book --name=compseo-runtime-book --field=ID --format=ids | tail -1 | tr -d '\r')
SEO_TEST_ATTACHMENT_ID=$(wp post meta get "$SEO_TEST_PUBLIC_ID" _thumbnail_id | tail -1 | tr -d '\r')

for id in "$SEO_TEST_PUBLIC_ID" "$SEO_TEST_NO_IMAGE_ID" "$SEO_TEST_AUTHORED_ID" "$SEO_TEST_PROTECTED_ID" "$SEO_TEST_PROTECTED_AUTHORED_ID" "$SEO_TEST_FRONT_ID" "$SEO_TEST_POSTS_PAGE_ID" "$SEO_TEST_BOOK_ID" "$SEO_TEST_ATTACHMENT_ID"; do
	[ -n "$id" ] || fail "runtime fixture IDs could not be resolved"
done

SEO_TEST_PUBLIC_URL=$(wp post url "$SEO_TEST_PUBLIC_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_NO_IMAGE_URL=$(wp post url "$SEO_TEST_NO_IMAGE_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_AUTHORED_URL=$(wp post url "$SEO_TEST_AUTHORED_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_PROTECTED_URL=$(wp post url "$SEO_TEST_PROTECTED_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_PROTECTED_AUTHORED_URL=$(wp post url "$SEO_TEST_PROTECTED_AUTHORED_ID" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_ATTACHMENT_URL=$(wp eval "echo get_attachment_link($SEO_TEST_ATTACHMENT_ID);" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_AUTHOR_URL=$(wp eval "echo get_author_posts_url((int) get_post($SEO_TEST_PUBLIC_ID)->post_author);" | grep -oE '^https?://[^[:space:]]+$' | head -1)
SEO_TEST_DATE_URL=$(wp eval "\$post = get_post($SEO_TEST_PUBLIC_ID); echo get_month_link((int) mysql2date('Y', \$post->post_date), (int) mysql2date('m', \$post->post_date));" | grep -oE '^https?://[^[:space:]]+$' | head -1)

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
contains "$SEO_TEST_HEAD" 'name="google-site-verification" content="runtime-google-token"' || fail "canonical homepage is missing Google verification"
contains "$SEO_TEST_HEAD" 'name="msvalidate.01" content="runtime-bing-token"' || fail "canonical homepage is missing Bing verification"
SEO_TEST_QUERY_HEAD=$(curl -fsS "$SEO_TEST_URL/?utm_source=runtime" | head_only)
not_contains "$SEO_TEST_QUERY_HEAD" 'google-site-verification' || fail "homepage query variant emitted Google verification"
not_contains "$SEO_TEST_QUERY_HEAD" 'msvalidate.01' || fail "homepage query variant emitted Bing verification"
SEO_TEST_PAGED_HEAD=$(curl -fsS "$SEO_TEST_URL/?paged=2" | head_only)
not_contains "$SEO_TEST_PAGED_HEAD" 'google-site-verification' || fail "paged homepage emitted Google verification"
not_contains "$SEO_TEST_PAGED_HEAD" 'msvalidate.01' || fail "paged homepage emitted Bing verification"
pass "latest-posts home schema and canonical-only verification output"

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
contains "$SEO_TEST_HEAD" 'Native category archive description.' || fail "taxonomy archive did not use its native description"
SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
contains "$SEO_TEST_ROBOTS" 'noindex' || fail "category-specific noindex policy was not applied"
contains "$SEO_TEST_ROBOTS" 'follow' || fail "category noindex policy must remain follow"
contains "$SEO_TEST_ROBOTS" 'max-image-preview:large' || fail "core max-image-preview:large was not preserved"
not_contains "$SEO_TEST_ROBOTS" 'max-snippet' || fail "companion output must leave max-snippet unset"
SEO_TEST_HEAD=$(curl -fsS "${SEO_TEST_ARCHIVE_URL}page/2/" | head_only)
contains "$SEO_TEST_HEAD" "<link rel=\"canonical\" href=\"${SEO_TEST_ARCHIVE_URL}page/2/\"" || fail "paged archive did not self-canonicalize"
not_contains "$SEO_TEST_HEAD" 'Native category archive description.' || fail "paged archive repeated its page-one description"

SEO_TEST_TAG_URL="$SEO_TEST_URL/tag/compseo-runtime-tag/"
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_TAG_URL" | head_only)
SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
contains "$SEO_TEST_ROBOTS" 'index' || fail "tag-specific index policy was not applied"
contains "$SEO_TEST_ROBOTS" 'follow' || fail "tag index policy must remain follow"
not_contains "$SEO_TEST_ROBOTS" 'noindex' || fail "category policy leaked into the independently configured tag archive"

SEO_TEST_BOOK_ARCHIVE_URL="$SEO_TEST_URL/runtime-books/"
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_BOOK_ARCHIVE_URL" | head_only)
SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
contains "$SEO_TEST_ROBOTS" 'noindex' || fail "post-type archive policy was not applied"
contains "$SEO_TEST_HEAD" "<link rel=\"canonical\" href=\"$SEO_TEST_BOOK_ARCHIVE_URL\"" || fail "post-type archive canonical is missing"

SEO_TEST_GENRE_URL="$SEO_TEST_URL/runtime-genre/compseo-runtime-genre/"
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_GENRE_URL" | head_only)
SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
contains "$SEO_TEST_ROBOTS" 'noindex' || fail "custom-taxonomy archive policy was not applied"

for archive_url in "$SEO_TEST_AUTHOR_URL" "$SEO_TEST_DATE_URL"; do
	SEO_TEST_HEAD=$(curl -fsS "$archive_url" | head_only)
	SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
	contains "$SEO_TEST_ROBOTS" 'noindex' || fail "$archive_url did not receive its fixed-default archive policy"
	contains "$SEO_TEST_ROBOTS" 'follow' || fail "$archive_url must remain follow"
done
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_AUTHOR_URL" | head_only)
contains "$SEO_TEST_HEAD" 'Native author archive biography.' || fail "author archive did not use the native biography"
pass "per-object archive policies, native descriptions, pagination, and core robots directives"

wp option update compseo_runtime_sitemap_page_size 1 > /dev/null
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-sitemaps > /dev/null
SEO_TEST_SITEMAP_INDEX=$(curl -fsS "$SEO_TEST_URL/wp-sitemap.xml")
contains "$SEO_TEST_SITEMAP_INDEX" 'wp-sitemap-posts-compseo_book-1.xml' || fail "native sitemap index is missing the first filtered post-type page"
contains "$SEO_TEST_SITEMAP_INDEX" 'wp-sitemap-posts-compseo_book-2.xml' || fail "native sitemap index is missing the second filtered post-type page"
not_contains "$SEO_TEST_SITEMAP_INDEX" 'wp-sitemap-posts-compseo_book-3.xml' || fail "excluded singular items inflated native sitemap pagination"
contains "$SEO_TEST_SITEMAP_INDEX" 'wp-sitemap-taxonomies-post_tag-1.xml' || fail "indexable taxonomy is missing from the native sitemap index"
not_contains "$SEO_TEST_SITEMAP_INDEX" 'wp-sitemap-taxonomies-category' || fail "noindex category remained in the native sitemap index"
not_contains "$SEO_TEST_SITEMAP_INDEX" 'wp-sitemap-taxonomies-compseo_genre' || fail "noindex custom taxonomy remained in the native sitemap index"
not_contains "$SEO_TEST_SITEMAP_INDEX" 'wp-sitemap-users' || fail "users provider remained while author archives are noindex"

SEO_TEST_BOOK_SITEMAPS="$(curl -fsS "$SEO_TEST_URL/wp-sitemap-posts-compseo_book-1.xml")$(curl -fsS "$SEO_TEST_URL/wp-sitemap-posts-compseo_book-2.xml")"
contains "$SEO_TEST_BOOK_SITEMAPS" '/compseo-runtime-book/' || fail "absent-metadata singular item is missing from the native sitemap"
contains "$SEO_TEST_BOOK_SITEMAPS" '/compseo-sitemap-local/' || fail "same-origin canonical singular item is missing from the native sitemap"
not_contains "$SEO_TEST_BOOK_SITEMAPS" '/compseo-sitemap-noindex/' || fail "noindex singular item remained in the native sitemap"
not_contains "$SEO_TEST_BOOK_SITEMAPS" '/compseo-sitemap-external/' || fail "externally canonicalized singular item remained in the native sitemap"
not_contains "$SEO_TEST_BOOK_SITEMAPS" '/compseo-sitemap-protected/' || fail "password-protected singular item remained in the native sitemap"

wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" set-author-index > /dev/null
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-author-sitemap > /dev/null
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" set-author-noindex > /dev/null
wp option delete compseo_runtime_sitemap_page_size > /dev/null
pass "native sitemaps exclude blocked content without per-entry queries and follow archive policy"

SEO_TEST_HEAD=$(curl -fsS "${SEO_TEST_ARCHIVE_URL}?utm_source=runtime&gclid=fixture" | head_only)
contains "$SEO_TEST_HEAD" "<link rel=\"canonical\" href=\"$SEO_TEST_ARCHIVE_URL\"" || fail "tracking-only archive state did not canonicalize to the base archive"
not_contains "$SEO_TEST_HEAD" 'utm_source' || fail "tracking parameter leaked into archive metadata"
not_contains "$SEO_TEST_HEAD" 'gclid' || fail "click identifier leaked into archive metadata"

SEO_TEST_FILTERED_URL="${SEO_TEST_TAG_URL}?color=red"
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_FILTERED_URL" | head_only)
SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
contains "$SEO_TEST_ROBOTS" 'noindex' || fail "meaningful filtered archive did not receive noindex"
contains "$SEO_TEST_ROBOTS" 'follow' || fail "meaningful filtered archive must remain follow"
contains "$SEO_TEST_HEAD" "<link rel=\"canonical\" href=\"$SEO_TEST_FILTERED_URL\"" || fail "filtered archive did not self-canonicalize"

wp option update compseo_runtime_indexable_lang 1 > /dev/null
SEO_TEST_LANG_URL="${SEO_TEST_TAG_URL}?lang=sv"
SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_LANG_URL" | head_only)
SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
contains "$SEO_TEST_ROBOTS" 'index' || fail "declared public query state did not inherit its indexable archive policy"
not_contains "$SEO_TEST_ROBOTS" 'noindex' || fail "declared public query state was treated as filtered junk"
contains "$SEO_TEST_HEAD" "<link rel=\"canonical\" href=\"$SEO_TEST_LANG_URL\"" || fail "declared public query state did not self-canonicalize"
pass "tracking, filtered, and explicitly indexable query states resolve conservatively"

for path in '/?s=runtime' '/compseo-runtime-public/embed/' '/feed/' '/definitely-not-a-runtime-page/'; do
	SEO_TEST_HEAD=$(curl -sS "$SEO_TEST_URL$path" | head_only)
	not_contains "$SEO_TEST_HEAD" 'property="og:' || fail "$path received companion social output"
	not_contains "$SEO_TEST_HEAD" 'application/ld+json' || fail "$path received companion schema output"
done
SEO_TEST_SEARCH_ROBOTS=$(curl -fsS "$SEO_TEST_URL/?s=runtime" | head_only | robots_only)
contains "$SEO_TEST_SEARCH_ROBOTS" 'noindex' || fail "search did not receive noindex"
contains "$SEO_TEST_SEARCH_ROBOTS" 'follow' || fail "search noindex must remain follow"
SEO_TEST_404_ROBOTS=$(curl -sS "$SEO_TEST_URL/definitely-not-a-runtime-page/" | head_only | robots_only)
contains "$SEO_TEST_404_ROBOTS" 'noindex' || fail "404 did not receive noindex"
contains "$SEO_TEST_404_ROBOTS" 'follow' || fail "404 noindex must remain follow"
SEO_TEST_FEED_HEADERS=$(curl -sSI "$SEO_TEST_URL/feed/" | tr '[:upper:]' '[:lower:]')
not_contains "$SEO_TEST_FEED_HEADERS" 'x-robots-tag' || fail "feeds received an out-of-scope X-Robots-Tag header"
pass "search, embeds, feeds, and 404s use core-compatible conservative behavior"

SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_ATTACHMENT_URL" | head_only)
SEO_TEST_ROBOTS=$(printf '%s' "$SEO_TEST_HEAD" | robots_only)
contains "$SEO_TEST_ROBOTS" 'noindex' || fail "live attachment page did not receive noindex"
contains "$SEO_TEST_ROBOTS" 'follow' || fail "live attachment page must remain follow"
wp option update wp_attachment_pages_enabled 0 > /dev/null
SEO_TEST_DECISION=$(wp compseo decision "$SEO_TEST_ATTACHMENT_URL" --format=json)
contains "$SEO_TEST_DECISION" '"reason":"attachment_redirected"' || fail "disabled attachment pages did not defer to core redirect behavior"
wp option update wp_attachment_pages_enabled 1 > /dev/null
pass "attachment-page policy follows the core attachment option"

wp option update compseo_runtime_force_index 1 > /dev/null
wp option update blog_public 0 > /dev/null
SEO_TEST_PRIVATE_HEAD=$(curl -fsS "$SEO_TEST_URL/" | head_only)
SEO_TEST_PRIVATE_ROBOTS=$(printf '%s' "$SEO_TEST_PRIVATE_HEAD" | robots_only)
contains "$SEO_TEST_PRIVATE_ROBOTS" 'noindex' || fail "private-site override did not force noindex"
contains "$SEO_TEST_PRIVATE_ROBOTS" 'nofollow' || fail "private-site override did not force nofollow"
not_contains "$SEO_TEST_PRIVATE_HEAD" 'rel="canonical"' || fail "private-site override retained a companion canonical"
wp option update blog_public 1 > /dev/null
wp option delete compseo_runtime_force_index > /dev/null
pass "site privacy overrides every companion policy"

SEO_TEST_STATUS=$(wp compseo status --format=json)
contains "$SEO_TEST_STATUS" '"settings_schema":2' || fail "WP-CLI status did not report schema version 2"
contains "$SEO_TEST_STATUS" '"suppressed":false' || fail "WP-CLI status reported the wrong suppression state"
not_contains "$SEO_TEST_STATUS" 'runtime-google-token' || fail "WP-CLI status exposed the Google verification token"
not_contains "$SEO_TEST_STATUS" 'runtime-bing-token' || fail "WP-CLI status exposed the Bing verification token"

assert_decision() {
	local decision_url="$1"
	local decision_reason="$2"
	SEO_TEST_DECISION=$(wp compseo decision "$decision_url" --format=json)
	contains "$SEO_TEST_DECISION" "\"reason\":\"$decision_reason\"" || fail "WP-CLI decision returned the wrong reason for $decision_url"
}
assert_decision "$SEO_TEST_URL/" content_archive
assert_decision "$SEO_TEST_PUBLIC_URL" singular_default
assert_decision "$SEO_TEST_ARCHIVE_URL" content_archive
assert_decision "${SEO_TEST_ARCHIVE_URL}page/2/" content_archive
assert_decision "$SEO_TEST_URL/?paged=2" content_archive
assert_decision "$SEO_TEST_BOOK_ARCHIVE_URL" content_archive
assert_decision "$SEO_TEST_AUTHOR_URL" author_archive
assert_decision "$SEO_TEST_DATE_URL" date_archive
assert_decision "$SEO_TEST_ATTACHMENT_URL" attachment_live
assert_decision "$SEO_TEST_URL/?s=runtime" search
assert_decision "$SEO_TEST_FILTERED_URL" filtered_query
assert_decision "$SEO_TEST_URL/definitely-not-a-runtime-page/" not_found

SEO_TEST_DECISION=$(wp compseo decision "$SEO_TEST_LANG_URL" --format=json)
contains "$SEO_TEST_DECISION" '"reason":"declared_indexable_query"' || fail "WP-CLI did not expose the declared query-state reason"
contains "$SEO_TEST_DECISION" '"taxonomy":"post_tag"' || fail "WP-CLI decision context omitted the taxonomy slug"
contains "$SEO_TEST_DECISION" '"canonical"' || fail "WP-CLI decision omitted the canonical field"
set +e
SEO_TEST_CLI_RAW=$(wp compseo decision 'https://user:COMPSEO_CLI_SECRET@example.com/private' --format=json 2>&1)
SEO_TEST_CLI_STATUS=$?
set -e
if [ "$SEO_TEST_CLI_STATUS" -eq 0 ]; then
	fail "WP-CLI accepted a credential-bearing cross-origin target"
fi
SEO_TEST_CLI_ERROR=$(printf '%s\n' "$SEO_TEST_CLI_RAW" | grep '^Error:' || true)
not_contains "$SEO_TEST_CLI_ERROR" 'COMPSEO_CLI_SECRET' || fail "WP-CLI error echoed rejected credentials"
pass "WP-CLI status and bounded URL decisions are scriptable and secret-free"

wp option update compseo_runtime_invalid_contract 1 > /dev/null
wp option update compseo_runtime_invalid_indexing_contract 1 > /dev/null
wp option update compseo_runtime_invalid_query_contract 1 > /dev/null
wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-invalid-contract > /dev/null
wp option delete compseo_runtime_invalid_contract > /dev/null
wp option delete compseo_runtime_invalid_indexing_contract > /dev/null
wp option delete compseo_runtime_invalid_query_contract > /dev/null
pass "invalid document and indexing adapters fall back loudly without echoing rejected values"

for provider in compseo-fixture-yoast compseo-fixture-rank-math; do
	wp plugin activate "$provider" > /dev/null
	wp eval-file "$SEO_TEST_THEME_DIR/bin/test-seo-runtime.php" assert-suppressed > /dev/null
	SEO_TEST_HEAD=$(curl -fsS "$SEO_TEST_AUTHORED_URL" | head_only)
	not_contains "$SEO_TEST_HEAD" 'Authored Full Title' || fail "$provider did not suppress the title override"
	not_contains "$SEO_TEST_HEAD" 'property="og:' || fail "$provider did not suppress Open Graph output"
	not_contains "$SEO_TEST_HEAD" 'name="description"' || fail "$provider did not suppress the meta description"
	not_contains "$SEO_TEST_HEAD" 'https://example.net/reference?lang=sv' || fail "$provider did not suppress the canonical override"
	SEO_TEST_HOME_HEAD=$(curl -fsS "$SEO_TEST_URL/" | head_only)
	not_contains "$SEO_TEST_HOME_HEAD" 'google-site-verification' || fail "$provider did not suppress Google verification"
	not_contains "$SEO_TEST_HOME_HEAD" 'msvalidate.01' || fail "$provider did not suppress Bing verification"
	SEO_TEST_SUPPRESSED_STATUS=$(wp compseo status --format=json)
	contains "$SEO_TEST_SUPPRESSED_STATUS" '"suppressed":true' || fail "$provider hid or bypassed suppressed diagnostics"
	SEO_TEST_SUPPRESSED_DECISION=$(wp compseo decision "$SEO_TEST_ARCHIVE_URL" --format=json)
	contains "$SEO_TEST_SUPPRESSED_DECISION" '"suppressed":true' || fail "$provider hid or bypassed URL diagnostics"
	wp plugin deactivate "$provider" > /dev/null
	pass "$provider suppresses runtime output while preserving non-secret diagnostics"
done

echo "companion SEO runtime: OK"
