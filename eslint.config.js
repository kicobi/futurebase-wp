/**
 * ESLint config override for futurebase.
 *
 * Extends @wordpress/scripts' default flat config and adds a single
 * settings key: `import/core-modules` for every `@wordpress/*` package
 * that dependency-extraction-webpack-plugin externalizes at build time.
 *
 * Why this file exists
 * --------------------
 * Block entrypoints import from `@wordpress/blocks`, `@wordpress/i18n`,
 * etc. These packages are NOT installed in node_modules — they're made
 * available as runtime globals (wp.blocks, wp.i18n, …) by webpack's
 * dependency-extraction plugin, which translates `import { x } from
 * '@wordpress/foo'` into a reference to `wp.foo.x` at build time.
 *
 * ESLint's `import/no-unresolved` rule doesn't know about that webpack
 * transform and tries to resolve each import on disk, which fails. Listing
 * these as `import/core-modules` tells ESLint they're "provided" — same
 * mental model as built-in Node modules like `fs`.
 *
 * Why the list is so long
 * -----------------------
 * The plugin's externalization logic is wildcard-based — any request
 * starting with `@wordpress/` (except a small BUNDLED_PACKAGES list that
 * stays bundled and therefore installs into node_modules) becomes an
 * external. ESLint's `import/core-modules` setting, however, is literal
 * string matching (confirmed in eslint-plugin-import at
 * lib/core/importType.js: `extras.indexOf(base) > -1`). There is no glob
 * or regex form of this setting, so the only way to match the plugin's
 * wildcard behavior is to enumerate every @wordpress/* package
 * individually.
 *
 * The list below mirrors the Gutenberg monorepo `packages/` directory.
 * It includes both externalized and bundled packages — the bundled ones
 * would resolve via node_modules anyway, but listing them costs nothing
 * and prevents confusion if someone tries to remove "unused" entries.
 *
 * When to update this list
 * ------------------------
 * Any time a block (or hand-written JS) imports a `@wordpress/*` package
 * not on this list. The symptom is a fresh `import/no-unresolved` error
 * in `npm run lint`. Add the package name here; do not install it as a
 * devDependency (the runtime-global pattern relies on these staying out
 * of node_modules for block-entry code).
 *
 * If Gutenberg adds a new package between releases, it won't cause a
 * lint failure until someone in this project tries to import it — add
 * the entry when that happens.
 */

const wpDefault = require( '@wordpress/scripts/config/eslint.config.cjs' );

module.exports = [
	...wpDefault,
	{
		settings: {
			'import/core-modules': [
				'@wordpress/a11y',
				'@wordpress/admin-ui',
				'@wordpress/annotations',
				'@wordpress/api-fetch',
				'@wordpress/autop',
				'@wordpress/blob',
				'@wordpress/block-directory',
				'@wordpress/block-editor',
				'@wordpress/block-library',
				'@wordpress/block-serialization-default-parser',
				'@wordpress/blocks',
				'@wordpress/commands',
				'@wordpress/components',
				'@wordpress/compose',
				'@wordpress/core-commands',
				'@wordpress/core-data',
				'@wordpress/customize-widgets',
				'@wordpress/data',
				'@wordpress/data-controls',
				'@wordpress/dataviews',
				'@wordpress/date',
				'@wordpress/deprecated',
				'@wordpress/dom',
				'@wordpress/dom-ready',
				'@wordpress/edit-post',
				'@wordpress/edit-site',
				'@wordpress/edit-widgets',
				'@wordpress/editor',
				'@wordpress/element',
				'@wordpress/escape-html',
				'@wordpress/fields',
				'@wordpress/format-library',
				'@wordpress/hooks',
				'@wordpress/html-entities',
				'@wordpress/i18n',
				'@wordpress/icons',
				'@wordpress/interactivity',
				'@wordpress/interactivity-router',
				'@wordpress/interface',
				'@wordpress/is-shallow-equal',
				'@wordpress/keyboard-shortcuts',
				'@wordpress/keycodes',
				'@wordpress/list-reusable-blocks',
				'@wordpress/media-utils',
				'@wordpress/notices',
				'@wordpress/nux',
				'@wordpress/patterns',
				'@wordpress/plugins',
				'@wordpress/preferences',
				'@wordpress/preferences-persistence',
				'@wordpress/primitives',
				'@wordpress/priority-queue',
				'@wordpress/private-apis',
				'@wordpress/react-i18n',
				'@wordpress/redux-routine',
				'@wordpress/reusable-blocks',
				'@wordpress/rich-text',
				'@wordpress/router',
				'@wordpress/server-side-render',
				'@wordpress/shortcode',
				'@wordpress/style-engine',
				'@wordpress/sync',
				'@wordpress/token-list',
				'@wordpress/ui',
				'@wordpress/undo-manager',
				'@wordpress/url',
				'@wordpress/viewport',
				'@wordpress/views',
				'@wordpress/warning',
				'@wordpress/widgets',
				'@wordpress/wordcount',
			],
		},
	},
];
