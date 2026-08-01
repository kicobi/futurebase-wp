#!/usr/bin/env bash
#
# bin/new-block.sh — scaffold a theme-bound block under src/blocks/<slug>/.
#
# Creates a dynamic (server-rendered) block using the @wordpress/scripts
# discovery convention. The block auto-registers via
# futurebase_register_blocks() in functions.php after `npm run build`.
#
# Theme-bound blocks (what this scaffold makes) live with the theme.
# Reusable cross-project blocks belong in a companion plugin — see
# docs/block-authoring.md.
#
# Usage: npm run block:new -- <slug>
#        bin/new-block.sh <slug>

set -euo pipefail

if [ "${1:-}" = "" ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
	cat <<EOF
Usage: $0 <slug>

Scaffolds a theme-bound block at src/blocks/<slug>/.
<slug> must be lowercase, dashes only (no underscores, no spaces).
Example: $0 author-card
EOF
	exit 1
fi

SLUG="$1"

# Validate: lowercase letters, digits, single dashes.
if ! echo "$SLUG" | grep -qE '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'; then
	echo "error: slug must be lowercase, start with a letter, and use dashes only" >&2
	echo "       got: $SLUG" >&2
	exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="src/blocks/$SLUG"
if [ -d "$TARGET" ]; then
	echo "error: $TARGET already exists" >&2
	exit 1
fi

# Read theme slug from style.css Text Domain (set by bin/rename-theme.sh).
THEME_SLUG="$(grep -E '^Text Domain:' style.css | sed 's/Text Domain:[[:space:]]*//' | tr -d '\r')"
if [ -z "$THEME_SLUG" ]; then
	echo "error: could not read Text Domain from style.css" >&2
	exit 1
fi

# Human-readable title from slug: author-card → Author Card.
# Use awk for portable case-conversion — GNU sed \U is not supported on
# BSD/macOS sed and fails silently, inserting a literal "U" instead.
TITLE="$(echo "$SLUG" | awk -F'-' '{
	for (i = 1; i <= NF; i++) {
		printf "%s%s%s", toupper(substr($i, 1, 1)), substr($i, 2), (i < NF ? " " : "")
	}
}')"

mkdir -p "$TARGET"

cat > "$TARGET/block.json" <<JSON
{
	"\$schema": "https://schemas.wp.org/trunk/block.json",
	"apiVersion": 3,
	"name": "${THEME_SLUG}/${SLUG}",
	"version": "1.0.0",
	"title": "${TITLE}",
	"category": "theme",
	"description": "TODO(copy): add a human description.",
	"textdomain": "${THEME_SLUG}",
	"editorScript": "file:./index.js",
	"render": "file:./render.php",
	"supports": {
		"html": false,
		"spacing": {
			"padding": true,
			"margin": true
		}
	}
}
JSON

cat > "$TARGET/index.js" <<'JS'
import { registerBlockType } from '@wordpress/blocks';
import Edit from './edit';
import metadata from './block.json';

registerBlockType( metadata.name, {
	edit: Edit,
} );
JS

cat > "$TARGET/edit.js" <<JS
import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

export default function Edit() {
	const blockProps = useBlockProps();
	const label = __( '${TITLE}', '${THEME_SLUG}' );

	return <div { ...blockProps }>{ label }</div>;
}
JS

cat > "$TARGET/render.php" <<PHP
<?php
/**
 * Server-side render for the ${TITLE} block.
 *
 * @var array<string, mixed> \$attributes Block attributes (keyed by attribute name).
 * @var string                \$content    Serialized inner blocks HTML.
 * @var WP_Block              \$block      Block instance.
 *
 * @package ${THEME_SLUG}
 */

?>
<div <?php echo get_block_wrapper_attributes(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- get_block_wrapper_attributes() returns a pre-escaped HTML-safe attribute string. ?>>
	<?php esc_html_e( '${TITLE}', '${THEME_SLUG}' ); ?>
</div>
PHP

# Format the generated JS with the repo's prettier config. A long TITLE plus a
# long THEME_SLUG overflows prettier's 80-col printWidth when the __() call is
# inlined (only prettier knows where to wrap it), so an unformatted scaffold can
# fail `npm run lint`. The starter's own slug is short enough to stay under the
# limit, so this only bites promoted projects. Requires the toolchain — present
# in CI and after `npm install`; skip with a note otherwise.
if [ -x node_modules/.bin/wp-scripts ]; then
	node_modules/.bin/wp-scripts format "$TARGET/index.js" "$TARGET/edit.js" > /dev/null 2>&1
else
	echo "note: skipped auto-format (node_modules not installed) — run 'npm run format' before committing." >&2
fi

echo "Created $TARGET/"
echo
echo "Next steps:"
echo "  1. Edit $TARGET/block.json — refine title, description, supports."
echo "  2. Flesh out edit.js and render.php."
echo "  3. npm run build   (compiles src/blocks/ → build/blocks/)"
echo "  4. Block auto-registers via futurebase_register_blocks() in functions.php."
