#!/usr/bin/env bash
#
# bin/rename-theme.sh — single-pass theme slug rename.
#
# Renames every reference to `wp-starter` (and its snake_case sibling
# `wp_starter_`) to a project-specific slug, across:
#
#   - PHP text domains:                     'wp-starter' → '<slug>'
#   - PHP function prefixes:                 wp_starter_ → <slug_snake>_
#   - @package docblock tags:               @package wp-starter → @package <slug>
#   - Pattern slugs in PHP headers:         Slug: wp-starter/... → Slug: <slug>/...
#   - Pattern slugs in template markup:     wp:pattern {"slug":"wp-starter/..."} → <slug>
#   - Enqueue handles in functions.php:     'wp-starter-style' etc. → '<slug>-…'
#   - style.css header:                     Text Domain, Theme URI
#   - composer.json:                        "name": "vendor/wp-starter" → "vendor/<slug>"
#   - package.json:                         "name": "wp-starter" → "<slug>"
#   - phpcs.xml.dist:                       text_domain + prefixes elements
#   - README.md, CLAUDE.md, docs/*.md, src/**, inc/**:
#                                           PHP snippets, pattern refs, slugs in prose
#   - bin/*.sh (except this script):        scaffolding-script prefix + tempfile refs
#
# Optional flags also set values that vary per project:
#   --contributors "foo, bar"  writes/updates style.css Contributors header
#   --theme-uri    <url>       writes/updates style.css Theme URI header
#
# Project-specific fields that still need a manual pass: Theme Name,
# Description, Author, Tags, composer vendor, package.json repository /
# homepage / bugs URLs. See the manual-steps output at the end.
#
# Usage: npm run rename -- <new-slug> [--contributors "foo, bar"] [--theme-uri <url>]
#        bin/rename-theme.sh <new-slug> [--contributors "foo, bar"] [--theme-uri <url>]

set -euo pipefail

usage() {
	cat <<EOF
Usage: $0 <new-slug> [--contributors "foo, bar"] [--theme-uri <url>]

<new-slug> must be lowercase, dashes-only (no underscores, no spaces).
Example: $0 acme-client --contributors "acme, jsmith" --theme-uri https://github.com/acme/acme-client
EOF
}

NEW_SLUG=""
CONTRIBUTORS=""
THEME_URI=""

while [ "$#" -gt 0 ]; do
	case "$1" in
		-h|--help)
			usage
			exit 1
			;;
		--contributors)
			CONTRIBUTORS="${2:-}"
			if [ -z "$CONTRIBUTORS" ]; then
				echo "error: --contributors requires a value" >&2
				exit 1
			fi
			shift 2
			;;
		--contributors=*)
			CONTRIBUTORS="${1#--contributors=}"
			shift
			;;
		--theme-uri)
			THEME_URI="${2:-}"
			if [ -z "$THEME_URI" ]; then
				echo "error: --theme-uri requires a value" >&2
				exit 1
			fi
			shift 2
			;;
		--theme-uri=*)
			THEME_URI="${1#--theme-uri=}"
			shift
			;;
		--*|-*)
			echo "error: unknown flag: $1" >&2
			usage >&2
			exit 1
			;;
		*)
			if [ -z "$NEW_SLUG" ]; then
				NEW_SLUG="$1"
			else
				echo "error: unexpected extra positional argument: $1" >&2
				usage >&2
				exit 1
			fi
			shift
			;;
	esac
done

if [ -z "$NEW_SLUG" ]; then
	usage
	exit 1
fi

OLD_SLUG="wp-starter"

# Validate: lowercase letters, digits, single dashes.
if ! echo "$NEW_SLUG" | grep -qE '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'; then
	echo "error: slug must be lowercase, start with a letter, and use dashes only" >&2
	echo "       got: $NEW_SLUG" >&2
	exit 1
fi

if [ "$NEW_SLUG" = "$OLD_SLUG" ]; then
	echo "error: new slug is identical to the current slug ($OLD_SLUG)" >&2
	exit 1
fi

NEW_SNAKE="$(echo "$NEW_SLUG" | tr '-' '_')"
OLD_SNAKE="wp_starter"

# --- Substring-collision safety check ---------------------------------------
# If the new slug embeds the current slug (e.g. old `wp-starter`, new
# `wp-starter-test-5`), the substitution patterns below would re-match
# inside an already-rewritten slug on a second pass and produce double-suffix
# output like `wp-starter-test-5-test-5`. Reject the input up front with a
# clear message. The substitution regex below also carries a negative-
# lookahead guard as defence-in-depth. See Issue #4.
case "$NEW_SLUG" in
	*"$OLD_SLUG"*)
		cat >&2 <<ERR
error: new slug '$NEW_SLUG' embeds the current slug '$OLD_SLUG' as a substring.

       Running this rename would cause substring collisions — the substitution
       patterns would match inside the already-rewritten new slug on a second
       pass and produce double-suffix output (e.g. 'wp-starter-test-test').

       Choose a slug that does not contain '$OLD_SLUG'.
ERR
		exit 1
		;;
esac

# --- Defensive substitution guards -------------------------------------------
# Negative lookaheads that stop `\b${OLD_SLUG}-` and `\b${OLD_SNAKE}_` from
# re-matching inside a new-slug token that shares the old slug's prefix. The
# safety check above rejects this input entirely, so these guards are always
# empty at runtime — but they remain wired into the regex as a second line
# of defence against regression of the safety check.
SLUG_GUARD=""
case "$NEW_SLUG" in
	"${OLD_SLUG}-"*)
		SLUG_GUARD="(?!\\Q${NEW_SLUG#${OLD_SLUG}-}\\E)"
		;;
esac
SNAKE_GUARD=""
case "$NEW_SNAKE" in
	"${OLD_SNAKE}_"*)
		SNAKE_GUARD="(?!\\Q${NEW_SNAKE#${OLD_SNAKE}_}\\E)"
		;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Renaming theme:"
echo "  slug:    $OLD_SLUG  →  $NEW_SLUG"
echo "  prefix:  ${OLD_SNAKE}_  →  ${NEW_SNAKE}_"
echo

# -------------------------------------------------------------------------
# Replacement helpers. perl -i is consistent across macOS/Linux.
# -------------------------------------------------------------------------
replace_in() {
	local from="$1"
	local to="$2"
	shift 2
	for f in "$@"; do
		[ -f "$f" ] || continue
		perl -pi -e "s/\Q${from}\E/${to}/g" "$f"
	done
}

# List of files to touch. Keep this narrow — the package manager lockfiles,
# node_modules, vendor, and build outputs must not be rewritten.
#
# docs/, src/, inc/ are scanned so that PHP snippets, text domains, and
# pattern slugs inside docs and scaffolded source directories rename with
# the rest of the project. Prose sentences that discuss "the starter" by
# name will also get rewritten — that is a known trade-off; review
# docs/conventions.md by hand after rename if the starter-history text
# matters to you.
# bin/*.sh is scanned so scaffolding scripts — new-block, new-cpt, verify-theme —
# carry the project's prefix instead of the template's. rename-theme.sh itself
# is excluded; its comments and OLD_SLUG/OLD_SNAKE variables are the template's
# self-documentation, kept stable for future maintainers.
TARGETS=()
while IFS= read -r f; do TARGETS+=("$f"); done < <(
	# Only scan directories that actually exist at the repo root.
	scan_roots=(functions.php style.css composer.json package.json phpcs.xml.dist)
	[ -f README.md ] && scan_roots+=(README.md)
	[ -f CLAUDE.md ] && scan_roots+=(CLAUDE.md)
	# This is an ALLOWLIST -- only these roots are scanned. tools/ is
	# deliberately absent: the tools/project-system project lifecycle system
	# ships templates carrying literal wp-starter and studiokicobi/wp-starter
	# references that form the identity of the starter itself, not client
	# slugs to rewrite. Do NOT add tools here. See docs/project-lifecycle.md.
	# Keep this comment free of quotes, apostrophes, backticks, and parens:
	# macOS bash 3.2 miscounts them inside a process substitution.
	for d in patterns templates parts docs src inc bin; do
		[ -d "$d" ] && scan_roots+=("$d")
	done
	find \
		"${scan_roots[@]}" \
		-type f \
		\( -name '*.php' -o -name '*.html' -o -name '*.json' -o -name '*.css' -o -name '*.dist' -o -name '*.xml' -o -name '*.md' -o -name '*.sh' \) \
		-not -name 'rename-theme.sh' \
		2>/dev/null
)

# 1. Snake-case function prefix. Must run before the dashed-slug pass, since
#    some docblocks contain both (@package wp-starter above a wp_starter_ fn).
#    The `_` form covers function prefixes; the bare form covers phpcs
#    `<element value="wp_starter"/>` and similar whole-word references.
for f in "${TARGETS[@]}"; do
	perl -pi -e "s/\b${OLD_SNAKE}_${SNAKE_GUARD}/${NEW_SNAKE}_/g" "$f"
	perl -pi -e "s/\b${OLD_SNAKE}\b/${NEW_SNAKE}/g" "$f"
done

# 2. Text-domain and pattern-slug references — `wp-starter` as a word boundary
#    (single quotes, double quotes, slashes, spaces).
for f in "${TARGETS[@]}"; do
	# 'wp-starter'      (PHP i18n)
	perl -pi -e "s/'${OLD_SLUG}'/'${NEW_SLUG}'/g" "$f"
	# "wp-starter"      (JSON package names, JSON block attrs)
	perl -pi -e "s/\"${OLD_SLUG}\"/\"${NEW_SLUG}\"/g" "$f"
	# `wp-starter`      (markdown prose in docs/)
	perl -pi -e "s/\`${OLD_SLUG}\`/\`${NEW_SLUG}\`/g" "$f"
	# wp-starter/       (pattern slugs in several contexts:
	#   - PHP header:          Slug: wp-starter/foo
	#   - block attribute:     {"slug":"wp-starter/foo"}
	#   - doc comment:         `wp-starter/foo`
	# A negative lookbehind on `/` blocks URL path segments like
	# https://github.com/owner/wp-starter/issues — the template's origin
	# repo URLs must survive rename.)
	perl -pi -e "s#(?<!/)${OLD_SLUG}/#${NEW_SLUG}/#g" "$f"
	# /wp-starter"      (composer vendor/package: "vendor/wp-starter")
	perl -pi -e "s#/${OLD_SLUG}\"#/${NEW_SLUG}\"#g" "$f"
	# wp-starter-       (enqueue handles: 'wp-starter-style' → quoted form handled above, but handle the tail)
	#                   ${SLUG_GUARD} is a negative lookahead that prevents this
	#                   pattern from re-matching inside a new-slug token when
	#                   NEW_SLUG starts with `${OLD_SLUG}-` (Issue #4 defence).
	perl -pi -e "s/\b${OLD_SLUG}-${SLUG_GUARD}/${NEW_SLUG}-/g" "$f"
	# @package wp-starter
	perl -pi -e "s/(\@package\s+)${OLD_SLUG}\b/\$1${NEW_SLUG}/g" "$f"
	# Text Domain: wp-starter   (style.css)
	perl -pi -e "s/(Text Domain:\s*)${OLD_SLUG}\b/\$1${NEW_SLUG}/g" "$f"
	# "the wp-starter theme"    (phpcs.xml.dist description)
	perl -pi -e "s/\bthe ${OLD_SLUG} theme\b/the ${NEW_SLUG} theme/g" "$f"
	# Theme Name: WP Starter    — NOT replaced; project sets this by hand.
done

# 3. Optional header edits. Re-running with the same flag values must be a
#    no-op — grep-first, then either update the existing line in place or
#    insert a new one. The existing-line regex anchors on the field name so
#    the replacement is safe even if the value contains forward slashes or
#    colons.
if [ -n "$CONTRIBUTORS" ]; then
	if grep -q '^Contributors:' style.css; then
		CONTRIB="$CONTRIBUTORS" perl -i -pe 's/^Contributors:.*$/"Contributors: $ENV{CONTRIB}"/e' style.css
	else
		# Insert right after the first Theme URI line (always present in
		# this starter). $done guards against multiple matches.
		CONTRIB="$CONTRIBUTORS" perl -i -pe '
			if (/^Theme URI:/ && !$done) {
				$_ .= "Contributors: $ENV{CONTRIB}\n";
				$done = 1;
			}
		' style.css
	fi
fi

if [ -n "$THEME_URI" ]; then
	URI="$THEME_URI" perl -i -pe 's|^(Theme URI:\s*).*$|"$1" . $ENV{URI}|e' style.css
fi

# 4. phpcs.xml.dist needs both slug (text_domain) and snake (prefix) elements.
#    Those are handled above because both patterns are already applied to
#    phpcs.xml.dist. Confirm by printing what we landed on.
echo "Summary:"
printf "  %-30s %s\n" "functions.php prefixes:" "$(grep -c "${NEW_SNAKE}_" functions.php || true)"
printf "  %-30s %s\n" "pattern slugs on '${NEW_SLUG}':" "$(grep -rE "${NEW_SLUG}/" patterns templates parts 2>/dev/null | wc -l | tr -d ' ')"
printf "  %-30s %s\n" "PHP text domains '${NEW_SLUG}':" "$(grep -rE "'${NEW_SLUG}'" patterns templates functions.php 2>/dev/null | wc -l | tr -d ' ')"
if [ -n "$CONTRIBUTORS" ]; then
	printf "  %-30s %s\n" "Contributors header:" "$(grep '^Contributors:' style.css || echo '(missing)')"
fi
if [ -n "$THEME_URI" ]; then
	printf "  %-30s %s\n" "Theme URI header:" "$(grep '^Theme URI:' style.css || echo '(missing)')"
fi

# 5. Verify no stale references remain — but classify URL-style leftovers
#    (template author's GitHub URLs) as expected, since the script cannot
#    know the new project's repo URL unless --theme-uri was passed.
echo
leftover_roots=(functions.php style.css composer.json package.json phpcs.xml.dist)
[ -f README.md ] && leftover_roots+=(README.md)
[ -f CLAUDE.md ] && leftover_roots+=(CLAUDE.md)
# Same allowlist as the scan above — tools/ is intentionally excluded so
# tools/project-system/ template references are not flagged as leftovers.
for d in patterns templates parts docs src inc bin; do
	[ -d "$d" ] && leftover_roots+=("$d")
done
raw_leftover=$(grep -rn "${OLD_SLUG}\|${OLD_SNAKE}_" \
	--include='*.php' --include='*.html' --include='*.json' --include='*.css' --include='*.xml' --include='*.dist' --include='*.md' --include='*.sh' \
	--exclude='rename-theme.sh' \
	"${leftover_roots[@]}" 2>/dev/null || true)

# Documentation references to the template's origin (e.g. a README
# `gh repo create ... --template <owner>/wp-starter` instruction) tell
# future users how to fork a new project from this template. They must
# survive rename — filter them out of the leftover check entirely so
# they are not flagged as unexpected or listed as "update these by hand".
raw_leftover=$(printf '%s\n' "$raw_leftover" \
	| grep -vE -- "--template [^[:space:]]+/${OLD_SLUG}\b" \
	|| true)

# CLI-command references like `wp-starter lead init` name the project-system
# CLI tool, whose command stays `wp-starter` in every project. They must
# survive rename. Filter them out so docs and CLAUDE.md that document the
# lifecycle commands are not flagged as gaps.
raw_leftover=$(printf '%s\n' "$raw_leftover" \
	| grep -vE -- "${OLD_SLUG} (lead|project|baseline|metrics|final|compare|init|inspect|promote|archive)" \
	|| true)

# Expected leftovers: URLs pointing at the template's origin repo.
expected=$(printf '%s\n' "$raw_leftover" | grep -E 'https?://|Theme URI|git\+https' || true)
unexpected=$(printf '%s\n' "$raw_leftover" | grep -vE 'https?://|Theme URI|git\+https' | grep -v '^$' || true)

if [ -n "$unexpected" ]; then
	echo "WARNING — unexpected leftovers (these should be zero):"
	printf '%s\n' "$unexpected" | sed 's/^/    /'
	echo
	echo "Please open an issue — the rename script has a gap."
	exit 2
fi

if [ -n "$expected" ]; then
	echo "Expected leftovers (URLs — update these by hand for your project):"
	printf '%s\n' "$expected" | sed 's/^/    /'
	echo
fi

echo "Next manual steps:"
step=1
echo "  ${step}. Edit style.css: update Theme Name, Description, Author, Author URI, Tags."
step=$((step + 1))
if [ -z "$CONTRIBUTORS" ]; then
	echo "  ${step}. Edit style.css: add a Contributors: line (or re-run with --contributors \"name1, name2\")."
	step=$((step + 1))
fi
if [ -z "$THEME_URI" ]; then
	echo "  ${step}. Edit style.css: update Theme URI (or re-run with --theme-uri <url>)."
	step=$((step + 1))
fi
echo "  ${step}. Edit composer.json: update the vendor prefix of the 'name' field if needed."
step=$((step + 1))
echo "  ${step}. Edit package.json: update 'author', 'homepage', 'repository.url', and 'bugs.url'."
step=$((step + 1))
echo "  ${step}. Review docs/conventions.md — starter-history prose was rewritten by the rename; adjust or delete as you like."
step=$((step + 1))
echo "  ${step}. Rename the theme directory on disk to '${NEW_SLUG}'."
step=$((step + 1))
echo "  ${step}. Regenerate .pot/.mo files in languages/ if carried over."
step=$((step + 1))
echo "  ${step}. Run 'npm run verify' to confirm nothing drifted."
