#!/usr/bin/env bash
# Rename the Futurebase WP theme layer for a client project.
#
# Futurebase intentionally uses the same lowercase token for its dashed slug
# and PHP prefix. That means this script must rename by syntax/context; a broad
# lowercase pass would turn text domains into snake_case client prefixes.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACT="$ROOT/tools/project-system/config/rename-contract.sh"
if [ ! -f "$CONTRACT" ]; then
	echo "error: missing shared rename contract: $CONTRACT" >&2
	exit 1
fi
# shellcheck source=../tools/project-system/config/rename-contract.sh
source "$CONTRACT"

usage() {
	cat <<EOF
Usage: $0 <new-slug> [options]

Options:
  --theme-name <name>       Client-facing theme name (default: title-cased slug)
  --theme-version <semver>  Client theme/package version (default: 1.0.0)
  --theme-uri <url>         Theme URI header
  --repository <owner/repo> GitHub repository identity
  --contributors <names>   WordPress.org Contributors header

Example:
  $0 acme-client --theme-name "Acme Client" --theme-version 1.0.0 \
    --theme-uri https://github.com/acme/acme-client \
    --repository acme/acme-client
EOF
}

NEW_SLUG=""
THEME_NAME=""
THEME_VERSION="1.0.0"
THEME_URI=""
REPOSITORY=""
CONTRIBUTORS=""

require_value() {
	if [ -z "${2:-}" ]; then
		echo "error: $1 requires a value" >&2
		exit 1
	fi
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		-h|--help)
			usage
			exit 0
			;;
		--theme-name|--theme-version|--theme-uri|--repository|--contributors)
			require_value "$1" "${2:-}"
			case "$1" in
				--theme-name) THEME_NAME="$2" ;;
				--theme-version) THEME_VERSION="$2" ;;
				--theme-uri) THEME_URI="$2" ;;
				--repository) REPOSITORY="$2" ;;
				--contributors) CONTRIBUTORS="$2" ;;
			esac
			shift 2
			;;
		--theme-name=*|--theme-version=*|--theme-uri=*|--repository=*|--contributors=*)
			key="${1%%=*}"
			value="${1#*=}"
			require_value "$key" "$value"
			case "$key" in
				--theme-name) THEME_NAME="$value" ;;
				--theme-version) THEME_VERSION="$value" ;;
				--theme-uri) THEME_URI="$value" ;;
				--repository) REPOSITORY="$value" ;;
				--contributors) CONTRIBUTORS="$value" ;;
			esac
			shift
			;;
		--*|-*)
			echo "error: unknown flag: $1" >&2
			usage >&2
			exit 1
			;;
		*)
			if [ -n "$NEW_SLUG" ]; then
				echo "error: unexpected extra positional argument: $1" >&2
				exit 1
			fi
			NEW_SLUG="$1"
			shift
			;;
	esac
done

if [ -z "$NEW_SLUG" ]; then
	usage
	exit 1
fi
if ! printf '%s\n' "$NEW_SLUG" | grep -qE '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'; then
	echo "error: slug must be lowercase, start with a letter, and use dashes only" >&2
	exit 1
fi
if [ "$NEW_SLUG" = "$FUTUREBASE_BASE_SLUG" ]; then
	echo "error: new slug is identical to the Futurebase template slug" >&2
	exit 1
fi
case "$NEW_SLUG" in
	*"$FUTUREBASE_BASE_SLUG"*)
		echo "error: new slug must not contain '$FUTUREBASE_BASE_SLUG' (substring collision)" >&2
		exit 1
		;;
esac
if ! printf '%s\n' "$THEME_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'; then
	echo "error: --theme-version must be a semantic version" >&2
	exit 1
fi
if [ -n "$REPOSITORY" ] && ! printf '%s\n' "$REPOSITORY" | grep -qE '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'; then
	echo "error: --repository must be owner/repository" >&2
	exit 1
fi

if [ -z "$THEME_NAME" ]; then
	THEME_NAME="$(printf '%s\n' "$NEW_SLUG" | awk -F- '{ for (i = 1; i <= NF; i++) { printf "%s%s", (i > 1 ? " " : ""), toupper(substr($i, 1, 1)) substr($i, 2) } }')"
fi
if [ -z "$THEME_URI" ] && [ -n "$REPOSITORY" ]; then
	THEME_URI="https://kicobi.com"
fi

NEW_SNAKE="$(printf '%s' "$NEW_SLUG" | tr '-' '_')"
NEW_UPPER="$(printf '%s' "$NEW_SNAKE" | tr '[:lower:]' '[:upper:]')"
NEW_NAMESPACE="$(printf '%s\n' "$NEW_SLUG" | awk -F- '{ for (i = 1; i <= NF; i++) { printf "%s", toupper(substr($i, 1, 1)) substr($i, 2) } }')"
SEO_SLUG="${NEW_SLUG}-seo"
SEO_UPPER="${NEW_UPPER}_SEO"
SEO_DISPLAY="${THEME_NAME} SEO"
SEO_NAMESPACE="${NEW_NAMESPACE}\\SEO"

cd "$ROOT"

# A repository name may begin with the technical slug (futurebase-wp). Keep
# the existing Theme URI out of generic slug/handle rewriting unless the caller
# explicitly supplies its replacement.
ORIGINAL_THEME_URI="$(sed -n 's/^Theme URI:[[:space:]]*//p' style.css | head -1)"

echo "Renaming $FUTUREBASE_BASE_DISPLAY theme:"
echo "  slug:     $FUTUREBASE_BASE_SLUG → $NEW_SLUG"
echo "  prefix:   ${FUTUREBASE_BASE_SNAKE}_ → ${NEW_SNAKE}_"
echo "  constants:${FUTUREBASE_BASE_UPPER}_ → ${NEW_UPPER}_"
echo "  name:     $FUTUREBASE_BASE_DISPLAY → $THEME_NAME"
echo "  version:  $THEME_VERSION"
echo "  plugin:   $FUTUREBASE_SEO_BASE_SLUG → $SEO_SLUG"
echo

# Keep the surface narrow. readme.txt is the only .txt file intentionally
# included; package-manager locks, fixtures, tools, vendor, and build output are
# never passed through text substitution.
TARGETS=()
while IFS= read -r file; do TARGETS+=("$file"); done < <(
	scan_roots=(functions.php style.css composer.json package.json phpcs.xml.dist phpstan.neon.dist readme.txt .wp-env.json)
	[ -f README.md ] && scan_roots+=(README.md)
	[ -f CLAUDE.md ] && scan_roots+=(CLAUDE.md)
	for dir in patterns templates parts docs src inc bin plugins; do
		[ -d "$dir" ] && scan_roots+=("$dir")
	done
	find "${scan_roots[@]}" -type f \
		\( -name '*.php' -o -name '*.html' -o -name '*.json' -o -name '*.css' -o -name '*.dist' -o -name '*.xml' -o -name '*.md' -o -name '*.sh' -o -name 'readme.txt' \) \
		-not -name 'rename-theme.sh' \
		-not -name 'test-rename.sh' \
		-not -name 'audit-identity.sh' \
		-not -path 'docs/project-lifecycle.md' \
		2>/dev/null
)

# PHPCS stores the text domain and prefix in identically-shaped nested value
# elements, so the owning property provides the context for each replacement.
# Track the property line-by-line so the same keep-line contract applies here.
KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" BASE_SLUG="$FUTUREBASE_BASE_SLUG" SEO_BASE_SLUG="$FUTUREBASE_SEO_BASE_SLUG" NEW_SNAKE="$NEW_SNAKE" NEW_SLUG="$NEW_SLUG" SEO_SLUG="$SEO_SLUG" perl -i -pe '
	$property = "prefixes" if /<property\s+name="prefixes"/;
	$property = "text_domain" if /<property\s+name="text_domain"/;
	if (index($_, $ENV{KEEP_MARKER}) < 0 && /<element\s+value="\Q$ENV{BASE_SLUG}\E"\s*\/>/) {
		s/value="\Q$ENV{BASE_SLUG}\E"/value="$ENV{NEW_SNAKE}"/ if $property eq "prefixes";
		s/value="\Q$ENV{BASE_SLUG}\E"/value="$ENV{NEW_SLUG}"/ if $property eq "text_domain";
	}
	if (index($_, $ENV{KEEP_MARKER}) < 0 && $property eq "text_domain") {
		s/value="\Q$ENV{SEO_BASE_SLUG}\E"/value="$ENV{SEO_SLUG}"/g;
	}
	$property = "" if /<\/property>/;
' phpcs.xml.dist

for file in "${TARGETS[@]}"; do
	# PHP functions/options/meta and other underscore-prefixed identifiers.
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/(?<![A-Za-z0-9])${FUTUREBASE_BASE_SNAKE}_/${NEW_SNAKE}_/g" "$file"
	# Constants and the client-owned distribution environment variable.
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/(?<![A-Za-z0-9])${FUTUREBASE_BASE_UPPER}_/${NEW_UPPER}_/g" "$file"
	# Slug contexts: exact strings, pattern namespaces, handles, package names,
	# docblocks, and the style.css text-domain header.
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/'${FUTUREBASE_BASE_SLUG}'/'${NEW_SLUG}'/g" "$file"
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/\"${FUTUREBASE_BASE_SLUG}\"/\"${NEW_SLUG}\"/g" "$file"
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/\`${FUTUREBASE_BASE_SLUG}\`/\`${NEW_SLUG}\`/g" "$file"
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s#(?<!/)${FUTUREBASE_BASE_SLUG}/#${NEW_SLUG}/#g" "$file"
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s#/${FUTUREBASE_BASE_SLUG}\"#/${NEW_SLUG}\"#g" "$file"
	# Only these dashed identifiers belong to the theme. Family-level lifecycle
	# names such as futurebase-context and --futurebase-path remain canonical.
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/\b${FUTUREBASE_BASE_SLUG}-(style|main|script)\b/${NEW_SLUG}-\$1/g" "$file"
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/(\@package\s+)${FUTUREBASE_BASE_SLUG}\b/\$1${NEW_SLUG}/g" "$file"
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" perl -pi -e "next if index(\$_, \$ENV{KEEP_MARKER}) >= 0; s/(Text Domain:\s*)${FUTUREBASE_BASE_SLUG}\b/\$1${NEW_SLUG}/g" "$file"
	# Consume the full two-token product display name. Bare family references are
	# provenance or base-only prose and must never be globally rewritten.
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" BASE_DISPLAY="$FUTUREBASE_BASE_DISPLAY" DISPLAY="$THEME_NAME" perl -i -pe '
		next if index($_, $ENV{KEEP_MARKER}) >= 0;
		s/\Q$ENV{BASE_DISPLAY}\E/$ENV{DISPLAY}/g;
	' "$file"
	# Repository configuration refers to the plugin by path. Rewrite this
	# bounded structural form wherever it appears, including wp-env and PHPStan.
	KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" BASE_SLUG="$FUTUREBASE_SEO_BASE_SLUG" SLUG="$SEO_SLUG" perl -i -pe '
		next if index($_, $ENV{KEEP_MARKER}) >= 0;
		s#plugins/\Q$ENV{BASE_SLUG}\E#plugins/$ENV{SLUG}#g;
	' "$file"

	# The companion plugin has a second, structural identity axis. Database
	# keys and extension hooks use compseo and therefore match none of these
	# transformations; they remain permanent across every promotion.
	case "$file" in
		plugins/*)
			KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" BASE_SLUG="$FUTUREBASE_SEO_BASE_SLUG" SLUG="$SEO_SLUG" perl -i -pe '
				next if index($_, $ENV{KEEP_MARKER}) >= 0;
				s/\Q$ENV{BASE_SLUG}\E/$ENV{SLUG}/g;
			' "$file"
			KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" BASE_DISPLAY="$FUTUREBASE_SEO_BASE_DISPLAY" DISPLAY="$SEO_DISPLAY" perl -i -pe '
				next if index($_, $ENV{KEEP_MARKER}) >= 0;
				s/\Q$ENV{BASE_DISPLAY}\E/$ENV{DISPLAY}/g;
			' "$file"
			KEEP_MARKER="$FUTUREBASE_RENAME_KEEP_MARKER" BASE_NAMESPACE="$FUTUREBASE_SEO_BASE_NAMESPACE" NAMESPACE="$SEO_NAMESPACE" perl -i -pe '
				next if index($_, $ENV{KEEP_MARKER}) >= 0;
				s/\Q$ENV{BASE_NAMESPACE}\E/$ENV{NAMESPACE}/g;
			' "$file"
			;;
	esac
done

# Directory and bootstrap names are WordPress plugin identity, not stored
# state. Move them after content rewriting so the target list stays stable.
source_plugin_dir="plugins/$FUTUREBASE_SEO_BASE_SLUG"
target_plugin_dir="plugins/$SEO_SLUG"
if [ -d "$source_plugin_dir" ]; then
	if [ -e "$target_plugin_dir" ]; then
		echo "error: companion plugin target already exists: $target_plugin_dir" >&2
		exit 1
	fi
	mv "$source_plugin_dir/$FUTUREBASE_SEO_BASE_SLUG.php" "$source_plugin_dir/$SEO_SLUG.php"
	mv "$source_plugin_dir" "$target_plugin_dir"
elif [ ! -f "$target_plugin_dir/$SEO_SLUG.php" ]; then
	echo "error: companion SEO plugin is missing or has an unexpected identity" >&2
	exit 1
fi

# Explicit identity/version fields.
DISPLAY="$THEME_NAME" VERSION="$THEME_VERSION" perl -i -pe '
	s/^(Theme Name:\s*).*$/$1$ENV{DISPLAY}/;
	s/^(Version:\s*).*$/$1$ENV{VERSION}/;
' style.css
DISPLAY="$THEME_NAME" VERSION="$THEME_VERSION" perl -i -pe '
	s/^=== .* ===$/=== $ENV{DISPLAY} ===/ if $. == 1;
	s/^(Stable tag:\s*).*$/$1$ENV{VERSION}/;
' readme.txt
VERSION="$THEME_VERSION" perl -0777 -i -pe 's/== Changelog ==\n.*\z/== Changelog ==\n\n= $ENV{VERSION} =\n* Initial client theme release.\n/s' readme.txt

plugin_main="$target_plugin_dir/$SEO_SLUG.php"
DISPLAY="$SEO_DISPLAY" SLUG="$SEO_SLUG" perl -i -pe '
	s/^( \* Plugin Name:\s*).*$/$1$ENV{DISPLAY}/;
	s/^( \* Text Domain:\s*).*$/$1$ENV{SLUG}/;
' "$plugin_main"
DISPLAY="$SEO_DISPLAY" perl -i -pe '
	s/^=== .* ===$/=== $ENV{DISPLAY} ===/ if $. == 1;
' "$target_plugin_dir/readme.txt"

# Root package identity is client-owned. The lock helper then copies these
# authoritative values to the four root lockfile fields without resolution.
PKG_NAME="$NEW_SLUG" VERSION="$THEME_VERSION" perl -i -pe '
	s/^(\s*"name":\s*)"[^"]+"/$1"$ENV{PKG_NAME}"/ if $. == 2;
	s/^(\s*"version":\s*)"[^"]+"/$1"$ENV{VERSION}"/ if $. == 3;
' package.json
if [ -n "$REPOSITORY" ]; then
	REPO="$REPOSITORY" perl -i -pe '
		s#^(\s*"homepage":\s*)"[^"]+"#$1"https://github.com/$ENV{REPO}"#;
		s#^(\s*"url":\s*)"git\+https://github\.com/[^"]+\.git"#$1"git+https://github.com/$ENV{REPO}.git"#;
		s#^(\s*"url":\s*)"https://github\.com/[^"]+/issues"#$1"https://github.com/$ENV{REPO}/issues"#;
	' package.json
	OWNER="${REPOSITORY%%/*}"
	OWNER="$OWNER" SLUG="$NEW_SLUG" perl -i -pe 's/^(\s*"name":\s*)"[^"]+"/$1"$ENV{OWNER}\/$ENV{SLUG}"/ if $. == 2' composer.json
fi
node bin/reconcile-package-lock.mjs --manifest package.json --lock package-lock.json

if [ -n "$THEME_URI" ]; then
	URI="$THEME_URI" perl -i -pe 's|^(Theme URI:\s*).*$|$1$ENV{URI}|' style.css
elif [ -n "$ORIGINAL_THEME_URI" ]; then
	URI="$ORIGINAL_THEME_URI" perl -i -pe 's|^(Theme URI:\s*).*$|$1$ENV{URI}|' style.css
fi
if [ -n "$CONTRIBUTORS" ]; then
	if grep -q '^Contributors:' readme.txt; then
		CONTRIB="$CONTRIBUTORS" perl -i -pe 's/^Contributors:.*$/"Contributors: $ENV{CONTRIB}"/e' readme.txt
	else
		CONTRIB="$CONTRIBUTORS" perl -i -pe 'if ($. == 1) { $_ .= "Contributors: $ENV{CONTRIB}\n" }' readme.txt
	fi
fi

# Client README identity has a stable, bounded shape. Product positioning stays
# in the Futurebase source document and is not copied into a promoted theme.
if ! grep -q '<!-- project-intro:start -->' README.md || ! grep -q '<!-- project-intro:end -->' README.md; then
	echo "error: README.md is missing the managed project-intro markers" >&2
	exit 1
fi
DISPLAY="$THEME_NAME" perl -0777 -i -pe '
	$replacement = "<!-- project-intro:start -->\n# $ENV{DISPLAY}\n\n**The WordPress theme for $ENV{DISPLAY}.**\n\nBuilt on Futurebase WP.\n<!-- project-intro:end -->";
	s/<!-- project-intro:start -->.*?<!-- project-intro:end -->/$replacement/s;
' README.md

# Template setup and rename instructions have served their purpose once a
# client identity exists. Strip the bounded section on the first run and allow
# it to remain absent on identical reruns; mismatched markers are corruption.
setup_start_count="$(grep -cF '<!-- template-setup:start -->' README.md 2>/dev/null || true)"
setup_end_count="$(grep -cF '<!-- template-setup:end -->' README.md 2>/dev/null || true)"
if [ "$setup_start_count" = "1" ] && [ "$setup_end_count" = "1" ]; then
	perl -0777 -i -pe 's/\n*<!-- template-setup:start -->.*?<!-- template-setup:end -->\n*/\n\n/s' README.md
elif [ "$setup_start_count" != "0" ] || [ "$setup_end_count" != "0" ]; then
	echo "error: README.md has invalid managed template-setup markers" >&2
	exit 1
fi
rm -f "${FUTUREBASE_PRODUCT_EXCLUSIONS[@]}"

# Structural assertions describe the required result; the runtime backstop
# catches unanticipated Futurebase identity in files that ship as theme code.
problems=()
actual_theme_name="$(sed -n 's/^Theme Name:[[:space:]]*//p' style.css | head -1 | sed 's/[[:space:]]*$//')"
[ "$actual_theme_name" = "$THEME_NAME" ] || problems+=("style.css Theme Name mismatch: expected '$THEME_NAME', found '$actual_theme_name'")
grep -qE "^Text Domain:[[:space:]]*${NEW_SLUG}[[:space:]]*$" style.css || problems+=("style.css Text Domain mismatch")
grep -qE "^Version:[[:space:]]*${THEME_VERSION}[[:space:]]*$" style.css || problems+=("style.css Version mismatch")
[ "$(head -1 readme.txt)" = "=== $THEME_NAME ===" ] || problems+=("readme.txt title mismatch")
grep -qE "^Stable tag:[[:space:]]*${THEME_VERSION}[[:space:]]*$" readme.txt || problems+=("readme.txt Stable tag mismatch")
grep -q "${NEW_SNAKE}_" functions.php || problems+=("functions.php prefix missing")
grep -q "${NEW_UPPER}_" inc/navigation-migration.php || problems+=("uppercase constant prefix missing")
NEW_SNAKE="$NEW_SNAKE" perl -0777 -ne '
	exit 1 unless /<property\s+name="prefixes".*?<element\s+value="\Q$ENV{NEW_SNAKE}\E"\s*\/>/s;
' phpcs.xml.dist || problems+=("PHPCS prefix mismatch")
grep -qF " * $THEME_NAME theme functions." functions.php || problems+=("functions.php display-name docblock mismatch")
actual_plugin_name="$(sed -n 's/^ \* Plugin Name:[[:space:]]*//p' "$plugin_main" | head -1 | sed 's/[[:space:]]*$//')"
[ "$actual_plugin_name" = "$SEO_DISPLAY" ] || problems+=("plugin name mismatch: expected '$SEO_DISPLAY', found '$actual_plugin_name'")
grep -qE "^ \* Text Domain:[[:space:]]*${SEO_SLUG}[[:space:]]*$" "$plugin_main" || problems+=("plugin Text Domain mismatch")
plugin_version="$(sed -n 's/^ \* Version:[[:space:]]*//p' "$plugin_main" | head -1 | sed 's/[[:space:]]*$//')"
[ -n "$plugin_version" ] || problems+=("plugin Version header missing")
grep -qE "^Stable tag:[[:space:]]*${plugin_version}[[:space:]]*$" "$target_plugin_dir/readme.txt" || problems+=("plugin Stable tag does not match its Version header")
grep -qF "namespace $SEO_NAMESPACE;" "$plugin_main" || problems+=("plugin namespace mismatch")
grep -qF "define( '${SEO_UPPER}_VERSION'" "$plugin_main" || problems+=("plugin constant prefix mismatch")
grep -qF "'${SEO_SLUG}-editor'" "$plugin_main" || problems+=("plugin asset handle mismatch")
[ ! -e "$source_plugin_dir" ] || problems+=("source plugin directory survived promotion")
for identifier in "${FUTUREBASE_SEO_FROZEN_IDENTIFIERS[@]}"; do
	grep -rqF "$identifier" "$target_plugin_dir" || problems+=("permanent companion identifier missing after rename: $identifier")
done
if [ -n "$CONTRIBUTORS" ]; then
	grep -qF "Contributors: $CONTRIBUTORS" readme.txt || problems+=("readme.txt Contributors mismatch")
fi
if grep -q '^Contributors:' style.css; then
	problems+=("style.css contains the non-standard Contributors header")
fi

readme_provenance_count="$(grep -o 'Futurebase' README.md 2>/dev/null | wc -l | tr -d ' ')"
[ "$readme_provenance_count" = "1" ] || problems+=("README.md must contain exactly one Futurebase provenance occurrence; found $readme_provenance_count")

runtime_leftovers="$(grep -rnE "${FUTUREBASE_BASE_SLUG}|${FUTUREBASE_DISPLAY_SENTINEL}|${FUTUREBASE_BASE_UPPER}" "${FUTUREBASE_RUNTIME_PATHS[@]}" 2>/dev/null \
	| grep -vE '^style\.css:[0-9]+:Theme URI:[[:space:]]*https?://[^[:space:]]+/futurebase-wp([/.]|$)' || true)"
if [ -n "$runtime_leftovers" ]; then
	problems+=("Futurebase identity survived in client runtime paths:")
	while IFS= read -r line; do [ -n "$line" ] && problems+=("    $line"); done <<< "$runtime_leftovers"
fi

if [ "${#problems[@]}" -gt 0 ]; then
	echo "error: rename contract failed:" >&2
	for problem in "${problems[@]}"; do echo "  - $problem" >&2; done
	exit 2
fi

echo "Rename complete."
echo "Next manual steps:"
echo "  1. Review Description, Tags, client README wording, and add a client screenshot."
next_step=2
if [ -z "$THEME_URI" ]; then
	echo "  $next_step. Set Theme URI with --theme-uri or --repository."
	next_step=$((next_step + 1))
fi
echo "  $next_step. Run: composer update --lock --no-install --no-interaction"
next_step=$((next_step + 1))
echo "  $next_step. Run the full project verification suite."
