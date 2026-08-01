#!/usr/bin/env bash
#
# bin/new-cpt.sh — scaffold a custom post type at inc/post-types/<slug>.php.
#
# Theme-coupled by default: the file lands in inc/ and auto-loads from
# functions.php. For long-lived client sites where the theme IS the
# site, that's the right place. If a project needs the CPT to survive
# theme swaps, move the generated file to a must-use plugin. Full
# trade-off in docs/post-types.md. Also consider ACF Pro's CPT UI
# before reaching for code at all.
#
# Usage: npm run cpt:new -- <slug> [--plural <plural-slug>]
#        bin/new-cpt.sh <slug> [--plural <plural-slug>]
#
# Slug is the singular form, lowercase with dashes: case-study, team-member.
# Plural is derived automatically (-y → -ies, otherwise +s); override with
# --plural when English pluralization cheats on you.

set -euo pipefail

usage() {
	cat <<EOF
Usage: $0 <slug> [--plural <plural-slug>]

Scaffolds a custom post type at inc/post-types/<slug>.php.
<slug> is the singular form — lowercase, dashes only.
Example: $0 case-study
         $0 person --plural people
EOF
	exit 1
}

if [ "${1:-}" = "" ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
	usage
fi

SLUG="$1"
PLURAL_SLUG=""
shift || true

while [ "${1:-}" != "" ]; do
	case "$1" in
		--plural)
			shift
			PLURAL_SLUG="${1:-}"
			[ -z "$PLURAL_SLUG" ] && { echo "error: --plural requires a value" >&2; exit 1; }
			;;
		*)
			echo "error: unknown argument: $1" >&2
			usage
			;;
	esac
	shift
done

# Validate slugs: lowercase, digits, single dashes, leading letter.
validate_slug() {
	if ! echo "$1" | grep -qE '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'; then
		echo "error: slug must be lowercase, start with a letter, and use dashes only" >&2
		echo "       got: $1" >&2
		exit 1
	fi
}

validate_slug "$SLUG"
[ -n "$PLURAL_SLUG" ] && validate_slug "$PLURAL_SLUG"

# Post type key is the singular slug with dashes → underscores.
# WordPress requires ≤20 chars for post type keys.
POST_TYPE_KEY="$(echo "$SLUG" | tr '-' '_')"
if [ "${#POST_TYPE_KEY}" -gt 20 ]; then
	echo "error: post type key '$POST_TYPE_KEY' exceeds 20 chars" >&2
	echo "       Use a shorter slug so WordPress and PHPCS accept the generated post type." >&2
	exit 1
fi

# Reserved-slug guard.
#
# HARD: WordPress core post types and internal keys. Registering one of
# these either fails silently or clobbers core behavior. Always fail.
# List tracked against register_post_type() reserved keys in core as of
# WordPress 6.9.
#
# SOFT: slugs that aren't reserved by core but routinely collide with
# popular plugins (WooCommerce, bbPress) or WP's own URL rewrite
# vocabulary. Warn and require an interactive confirmation so a project
# that genuinely needs the slug can proceed, but a typo can't.
RESERVED_HARD=(
	post page attachment revision nav_menu_item custom_css
	customize_changeset oembed_cache user_request
	wp_block wp_template wp_template_part wp_navigation
	wp_global_styles wp_font_family wp_font_face
	action author order
)
RESERVED_SOFT=(
	product shop_order forum topic reply
	category tag taxonomy term type user
	comment date day month year feed paged
	theme
)

in_list() {
	local needle="$1"; shift
	for item in "$@"; do
		[ "$item" = "$needle" ] && return 0
	done
	return 1
}

if in_list "$POST_TYPE_KEY" "${RESERVED_HARD[@]}"; then
	echo "error: '$POST_TYPE_KEY' is a reserved post type key in WordPress core." >&2
	echo "       Pick a different slug — core refuses to register this one." >&2
	exit 1
fi

if in_list "$POST_TYPE_KEY" "${RESERVED_SOFT[@]}"; then
	echo "warn: '$POST_TYPE_KEY' commonly collides with plugins (WooCommerce, bbPress)" >&2
	echo "      or WordPress URL rewrite rules. It won't be rejected, but expect" >&2
	echo "      routing and query_var surprises." >&2
	if [ ! -t 0 ]; then
		echo "error: non-interactive shell — refusing to scaffold without confirmation." >&2
		echo "       Run the command from an interactive terminal to confirm." >&2
		exit 1
	fi
	printf 'Proceed anyway? [y/N] '
	read -r REPLY
	case "$REPLY" in
		y|Y|yes|YES) ;;
		*)
			echo "aborted."
			exit 1
			;;
	esac
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="inc/post-types/${SLUG}.php"
if [ -f "$TARGET" ]; then
	echo "error: $TARGET already exists" >&2
	exit 1
fi

# Theme slug + prefix from style.css (kept in sync by bin/rename-theme.sh).
THEME_SLUG="$(grep -E '^Text Domain:' style.css | sed 's/Text Domain:[[:space:]]*//' | tr -d '\r')"
if [ -z "$THEME_SLUG" ]; then
	echo "error: could not read Text Domain from style.css" >&2
	exit 1
fi
THEME_PREFIX="$(echo "$THEME_SLUG" | tr '-' '_')"

# Title-case a dash-separated slug. awk is portable; GNU sed \U isn't.
titleize() {
	echo "$1" | awk -F'-' '{
		for (i = 1; i <= NF; i++) {
			printf "%s%s%s", toupper(substr($i, 1, 1)), substr($i, 2), (i < NF ? " " : "")
		}
	}'
}

SINGULAR_TITLE="$(titleize "$SLUG")"
SINGULAR_TITLE_LC="$(echo "$SINGULAR_TITLE" | tr '[:upper:]' '[:lower:]')"

if [ -n "$PLURAL_SLUG" ]; then
	PLURAL_TITLE="$(titleize "$PLURAL_SLUG")"
else
	# Derive plural from singular. English plural rules are a pit, so we
	# handle the two cases that appear most often in CPT names and TODO
	# the file for manual review.
	case "$SLUG" in
		*[aeiou]y) PLURAL_TITLE="${SINGULAR_TITLE}s" ;;  # day → days
		*y)        PLURAL_TITLE="$(titleize "${SLUG%y}ies")" ;;  # study → studies
		*s|*x|*z|*ch|*sh) PLURAL_TITLE="${SINGULAR_TITLE}es" ;;  # box → boxes
		*)         PLURAL_TITLE="${SINGULAR_TITLE}s" ;;  # post → posts
	esac
fi
PLURAL_TITLE_LC="$(echo "$PLURAL_TITLE" | tr '[:upper:]' '[:lower:]')"

# Registration function name: <prefix>_register_<key>_post_type.
FUNC_NAME="${THEME_PREFIX}_register_${POST_TYPE_KEY}_post_type"

mkdir -p inc/post-types

# Heredoc with explicit escapes — $ characters that are PHP (not shell)
# are written as \$ so the shell doesn't try to interpolate.
cat > "$TARGET" <<PHP
<?php
/**
 * Register the "${SINGULAR_TITLE}" custom post type.
 *
 * Auto-loaded from functions.php (futurebase_load_post_types). Edit the
 * \$args below to tune supports, capability_type, menu icon, and rewrite.
 *
 * TODO(copy): review labels — automated plural derivation is approximate.
 *
 * @package ${THEME_SLUG}
 */

if ( ! function_exists( '${FUNC_NAME}' ) ) {
	/**
	 * Register the ${SINGULAR_TITLE_LC} post type.
	 *
	 * @return void
	 */
	function ${FUNC_NAME}() {
		\$labels = array(
			'name'                  => _x( '${PLURAL_TITLE}', 'Post type general name', '${THEME_SLUG}' ),
			'singular_name'         => _x( '${SINGULAR_TITLE}', 'Post type singular name', '${THEME_SLUG}' ),
			'menu_name'             => _x( '${PLURAL_TITLE}', 'Admin Menu text', '${THEME_SLUG}' ),
			'name_admin_bar'        => _x( '${SINGULAR_TITLE}', 'Add New on Toolbar', '${THEME_SLUG}' ),
			'add_new'               => __( 'Add New', '${THEME_SLUG}' ),
			'add_new_item'          => __( 'Add New ${SINGULAR_TITLE}', '${THEME_SLUG}' ),
			'new_item'              => __( 'New ${SINGULAR_TITLE}', '${THEME_SLUG}' ),
			'edit_item'             => __( 'Edit ${SINGULAR_TITLE}', '${THEME_SLUG}' ),
			'view_item'             => __( 'View ${SINGULAR_TITLE}', '${THEME_SLUG}' ),
			'view_items'            => __( 'View ${PLURAL_TITLE}', '${THEME_SLUG}' ),
			'all_items'             => __( 'All ${PLURAL_TITLE}', '${THEME_SLUG}' ),
			'search_items'          => __( 'Search ${PLURAL_TITLE}', '${THEME_SLUG}' ),
			'not_found'             => __( 'No ${PLURAL_TITLE_LC} found.', '${THEME_SLUG}' ),
			'not_found_in_trash'    => __( 'No ${PLURAL_TITLE_LC} found in Trash.', '${THEME_SLUG}' ),
			'archives'              => _x( '${SINGULAR_TITLE} archives', 'Post type archive label', '${THEME_SLUG}' ),
			'insert_into_item'      => _x( 'Insert into ${SINGULAR_TITLE_LC}', 'Overrides the "Insert into post" phrase', '${THEME_SLUG}' ),
			'uploaded_to_this_item' => _x( 'Uploaded to this ${SINGULAR_TITLE_LC}', 'Overrides the "Uploaded to this post" phrase', '${THEME_SLUG}' ),
			'filter_items_list'     => _x( 'Filter ${PLURAL_TITLE_LC} list', 'Screen reader text for the filter links heading', '${THEME_SLUG}' ),
			'items_list_navigation' => _x( '${PLURAL_TITLE} list navigation', 'Screen reader text for the pagination heading', '${THEME_SLUG}' ),
			'items_list'            => _x( '${PLURAL_TITLE} list', 'Screen reader text for the items list heading', '${THEME_SLUG}' ),
		);

		\$args = array(
			'labels'             => \$labels,
			'public'             => true,
			'publicly_queryable' => true,
			'show_ui'            => true,
			'show_in_menu'       => true,
			'show_in_rest'       => true,
			'query_var'          => true,
			'rewrite'            => array(
				'slug'       => '${SLUG}',
				'with_front' => false,
			),
			'capability_type'    => 'post',
			'has_archive'        => true,
			'hierarchical'       => false,
			'menu_position'      => 20,
			'menu_icon'          => 'dashicons-admin-post',
			'supports'           => array( 'title', 'editor', 'thumbnail', 'excerpt', 'revisions', 'author' ),
		);

		register_post_type( '${POST_TYPE_KEY}', \$args );
	}
	add_action( 'init', '${FUNC_NAME}' );
}
PHP

echo "Created $TARGET"
echo
echo "Next steps:"
echo "  1. Edit $TARGET — review labels, menu_icon, supports, rewrite slug."
echo "  2. Flush rewrites: npm run env:cli -- rewrite flush   (or visit Settings → Permalinks)."
echo "  3. TODO(copy): review generated plural labels; irregular nouns need manual correction."
echo "  4. For field groups, use ACF Pro's UI (docs/acf-pro-setup.md) or register_post_meta()."
