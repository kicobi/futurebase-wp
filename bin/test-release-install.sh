#!/usr/bin/env bash
# Install built ZIPs into a separate, empty WordPress; never replace mounted sources.
# WP_ENV_CORE / WP_ENV_PHP_VERSION select the compatibility cell.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
. "$ROOT/bin/_seo-plugin.sh"
plugin_dir=$(seo_plugin_dir)
plugin_slug=$(basename "$plugin_dir")
theme_slug=$(sed -n 's/^Text Domain:[[:space:]]*//p' style.css | head -1 | tr -d '[:space:]')
bin/test-package.sh
bin/test-seo-package.sh
release_root=$(mktemp -d "${TMPDIR:-/tmp}/theme-release.XXXXXXXX")
wp_env() { (cd "$release_root" && "$ROOT/node_modules/.bin/wp-env" "$@"); }
wp() { wp_env run cli wp "$@"; }
cleanup() {
    wp_env destroy --force > /dev/null 2>&1 || true
    rm -rf "$release_root"
}
trap cleanup EXIT
node --input-type=module - "$ROOT" "$release_root" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const [root, target] = process.argv.slice(2);
const baseline = JSON.parse(readFileSync(`${root}/.wp-env.json`, 'utf8'));
writeFileSync(`${target}/.wp-env.json`, JSON.stringify({
    core: baseline.core, phpVersion: baseline.phpVersion,
    // wp-env disables --auto-port in CI. Reserve a separate port from the
    // mounted-source environment on 8888; local runs can still auto-fallback.
    port: 8890,
    testsEnvironment: false, themes: [], plugins: [],
    mappings: { 'wp-content/release-tests': root },
    config: { WP_DEBUG: true, WP_DEBUG_LOG: true }
}));
JS
wp_env start --auto-port
wp core version
wp eval 'echo "PHP " . PHP_VERSION . "\n";'
wp theme install "/var/www/html/wp-content/release-tests/.dist/$theme_slug.zip" --activate
wp plugin install "/var/www/html/wp-content/release-tests/.dist/$plugin_slug.zip" --activate
wp eval 'if (!wp_is_block_theme()) { WP_CLI::error("Installed artifact is not a block theme."); }'
wp eval-file /var/www/html/wp-content/release-tests/bin/test-navigation-migration.php
wp eval-file /var/www/html/wp-content/release-tests/bin/test-theme-runtime.php
WP_ENV_TEST_ROOT="$release_root" SEO_TEST_HARNESS_DIR=/var/www/html/wp-content/release-tests bin/test-seo-runtime.sh
# This importer only upserts fixture-owned slugs. The database was created by
# this invocation; the normal developer environment is never selected here.
wp eval-file /var/www/html/wp-content/release-tests/fixtures/import-demo.php
wp rewrite flush
WP_ENV_TEST_ROOT="$release_root" A11Y_THEME_SLUG="$theme_slug" bin/a11y-wp-env.sh
url=$(wp option get home --skip-themes --skip-plugins 2>/dev/null | grep -E '^https?://' | head -1)
curl --fail --silent --show-error "$url/" > /dev/null
empty_search=$(curl --fail --silent --show-error "$url/?s=release-no-match")
[[ "$empty_search" == *'No results found.'* ]]
if [[ "${RELEASE_SCORECARD:-0}" == 1 ]]; then
    # URL mode measures the already-installed fixture without resetting any DB.
    bin/scorecard.sh "--url=$url"
fi
echo "Installed theme and companion ZIPs: PASS ($theme_slug, $plugin_slug)"
