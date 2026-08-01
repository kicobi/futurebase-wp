#!/usr/bin/env bash
# Rename the Futurebase theme layer for a client project.
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
	THEME_URI="https://github.com/$REPOSITORY"
fi

NEW_SNAKE="$(printf '%s' "$NEW_SLUG" | tr '-' '_')"
NEW_UPPER="$(printf '%s' "$NEW_SNAKE" | tr '[:lower:]' '[:upper:]')"

cd "$ROOT"

echo "Renaming Futurebase theme:"
echo "  slug:     $FUTUREBASE_BASE_SLUG → $NEW_SLUG"
echo "  prefix:   ${FUTUREBASE_BASE_SNAKE}_ → ${NEW_SNAKE}_"
echo "  constants:${FUTUREBASE_BASE_UPPER}_ → ${NEW_UPPER}_"
echo "  name:     $FUTUREBASE_BASE_DISPLAY → $THEME_NAME"
echo "  version:  $THEME_VERSION"
echo

# Keep the surface narrow. readme.txt is the only .txt file intentionally
# included; package-manager locks, fixtures, tools, vendor, and build output are
# never passed through text substitution.
TARGETS=()
while IFS= read -r file; do TARGETS+=("$file"); done < <(
	scan_roots=(functions.php style.css composer.json package.json phpcs.xml.dist readme.txt)
	[ -f README.md ] && scan_roots+=(README.md)
	[ -f CLAUDE.md ] && scan_roots+=(CLAUDE.md)
	for dir in patterns templates parts docs src inc bin; do
		[ -d "$dir" ] && scan_roots+=("$dir")
	done
	find "${scan_roots[@]}" -type f \
		\( -name '*.php' -o -name '*.html' -o -name '*.json' -o -name '*.css' -o -name '*.dist' -o -name '*.xml' -o -name '*.md' -o -name '*.sh' -o -name 'readme.txt' \) \
		-not -name 'rename-theme.sh' \
		-not -name 'test-rename.sh' \
		-not -name 'audit-identity.sh' \
		2>/dev/null
)

# PHPCS stores the text domain and prefix in identically-shaped nested value
# elements, so the owning property provides the context for each replacement.
# Do this before the generic quoted-slug substitutions below.
NEW_SNAKE="$NEW_SNAKE" NEW_SLUG="$NEW_SLUG" perl -0777 -i -pe '
	s#(<property\s+name="prefixes".*?<element\s+value=")futurebase("\s*/>.*?</property>)#$1$ENV{NEW_SNAKE}$2#s;
	s#(<property\s+name="text_domain".*?<element\s+value=")futurebase("\s*/>.*?</property>)#$1$ENV{NEW_SLUG}$2#s;
' phpcs.xml.dist

for file in "${TARGETS[@]}"; do
	# PHP functions/options/meta and other underscore-prefixed identifiers.
	perl -pi -e "s/(?<![A-Za-z0-9])${FUTUREBASE_BASE_SNAKE}_/${NEW_SNAKE}_/g" "$file"
	# Constants and the client-owned distribution environment variable.
	perl -pi -e "s/(?<![A-Za-z0-9])${FUTUREBASE_BASE_UPPER}_/${NEW_UPPER}_/g" "$file"
	# Slug contexts: exact strings, pattern namespaces, handles, package names,
	# docblocks, and the style.css text-domain header.
	perl -pi -e "s/'${FUTUREBASE_BASE_SLUG}'/'${NEW_SLUG}'/g" "$file"
	perl -pi -e "s/\"${FUTUREBASE_BASE_SLUG}\"/\"${NEW_SLUG}\"/g" "$file"
	perl -pi -e "s/\`${FUTUREBASE_BASE_SLUG}\`/\`${NEW_SLUG}\`/g" "$file"
	perl -pi -e "s#(?<!/)${FUTUREBASE_BASE_SLUG}/#${NEW_SLUG}/#g" "$file"
	perl -pi -e "s#/${FUTUREBASE_BASE_SLUG}\"#/${NEW_SLUG}\"#g" "$file"
	perl -pi -e "s/\b${FUTUREBASE_BASE_SLUG}-/${NEW_SLUG}-/g" "$file"
	perl -pi -e "s/(\@package\s+)${FUTUREBASE_BASE_SLUG}\b/\$1${NEW_SLUG}/g" "$file"
	perl -pi -e "s/(Text Domain:\s*)${FUTUREBASE_BASE_SLUG}\b/\$1${NEW_SLUG}/g" "$file"
	# Display-name prose is client-owned outside tools/. The managed README
	# block below reintroduces the one permitted Futurebase provenance sentence.
	DISPLAY="$THEME_NAME" perl -i -pe 's/\bFuturebase\b/$ENV{DISPLAY}/g' "$file"
done

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
fi
if [ -n "$CONTRIBUTORS" ]; then
	if grep -q '^Contributors:' style.css; then
		CONTRIB="$CONTRIBUTORS" perl -i -pe 's/^Contributors:.*$/"Contributors: $ENV{CONTRIB}"/e' style.css
	else
		CONTRIB="$CONTRIBUTORS" perl -i -pe 'if (/^Theme URI:/ && !$done) { $_ .= "Contributors: $ENV{CONTRIB}\n"; $done = 1 }' style.css
	fi
fi

# Client README identity has a stable, bounded shape. Product positioning stays
# in the Futurebase source document and is not copied into a promoted theme.
if ! grep -q '<!-- project-intro:start -->' README.md || ! grep -q '<!-- project-intro:end -->' README.md; then
	echo "error: README.md is missing the managed project-intro markers" >&2
	exit 1
fi
DISPLAY="$THEME_NAME" perl -0777 -i -pe '
	$replacement = "<!-- project-intro:start -->\n# $ENV{DISPLAY}\n\n**The WordPress theme for $ENV{DISPLAY}.**\n\nBuilt on Futurebase.\n<!-- project-intro:end -->";
	s/<!-- project-intro:start -->.*?<!-- project-intro:end -->/$replacement/s;
' README.md
rm -f \
	docs/futurebase.md \
	docs/futurebase-company-site.md \
	docs/assets/futurebase-social.png \
	screenshot.png

# Structural assertions describe the required result; the runtime backstop
# catches unanticipated Futurebase identity in files that ship as theme code.
problems=()
grep -qF "Theme Name: $THEME_NAME" style.css || problems+=("style.css Theme Name mismatch")
grep -qE "^Text Domain:[[:space:]]*${NEW_SLUG}[[:space:]]*$" style.css || problems+=("style.css Text Domain mismatch")
grep -qE "^Version:[[:space:]]*${THEME_VERSION}[[:space:]]*$" style.css || problems+=("style.css Version mismatch")
grep -qF "=== $THEME_NAME ===" readme.txt || problems+=("readme.txt title mismatch")
grep -qE "^Stable tag:[[:space:]]*${THEME_VERSION}[[:space:]]*$" readme.txt || problems+=("readme.txt Stable tag mismatch")
grep -q "${NEW_SNAKE}_" functions.php || problems+=("functions.php prefix missing")
grep -q "${NEW_UPPER}_" inc/navigation-migration.php || problems+=("uppercase constant prefix missing")
NEW_SNAKE="$NEW_SNAKE" perl -0777 -ne '
	exit 1 unless /<property\s+name="prefixes".*?<element\s+value="\Q$ENV{NEW_SNAKE}\E"\s*\/>/s;
' phpcs.xml.dist || problems+=("PHPCS prefix mismatch")

readme_provenance_count="$(grep -o 'Futurebase' README.md 2>/dev/null | wc -l | tr -d ' ')"
[ "$readme_provenance_count" = "1" ] || problems+=("README.md must contain exactly one Futurebase provenance occurrence; found $readme_provenance_count")

runtime_leftovers="$(grep -rnE "${FUTUREBASE_BASE_SLUG}|${FUTUREBASE_BASE_DISPLAY}|${FUTUREBASE_BASE_UPPER}" "${FUTUREBASE_RUNTIME_PATHS[@]}" 2>/dev/null \
	| grep -vE '^style\.css:[0-9]+:Theme URI:[[:space:]]*https?://[^[:space:]]+/futurebase([/.]|$)' || true)"
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
echo "  1. Review Author, Author URI, Contributors, Tags, client README wording, and add a client screenshot."
next_step=2
if [ -z "$THEME_URI" ]; then
	echo "  $next_step. Set Theme URI with --theme-uri or --repository."
	next_step=$((next_step + 1))
fi
echo "  $next_step. Run: composer update --lock --no-install --no-interaction"
next_step=$((next_step + 1))
echo "  $next_step. Run the full project verification suite."
