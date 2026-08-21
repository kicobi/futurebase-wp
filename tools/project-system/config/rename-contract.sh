#!/usr/bin/env bash
# Shared Futurebase identity contract.
#
# This file deliberately lives under tools/: project sync copies that tree
# verbatim and the client rename excludes it. bin/test-rename.sh therefore sees
# the same unmodified template sentinel in Futurebase and in promoted projects.
# Moving it into a rename-scanned path breaks that contract.

FUTUREBASE_BASE_SLUG="futurebase"
FUTUREBASE_BASE_SNAKE="futurebase"
FUTUREBASE_BASE_UPPER="FUTUREBASE"
FUTUREBASE_BASE_DISPLAY="Futurebase WP"
FUTUREBASE_SEO_BASE_SLUG="futurebase-seo"
FUTUREBASE_SEO_BASE_DISPLAY="Futurebase SEO"
FUTUREBASE_SEO_BASE_NAMESPACE='Futurebase\SEO'

FUTUREBASE_TEMPLATE_TEXT_DOMAIN_RE='^Text Domain:[[:space:]]*futurebase[[:space:]]*$'
FUTUREBASE_TOOL_TEMPLATE_SENTINEL='references/futurebase-context.md'
FUTUREBASE_UPPER_SENTINEL='FUTUREBASE_'
FUTUREBASE_DISPLAY_SENTINEL='Futurebase'

# The source repository. .github/ is outside the rename scan surface, so this
# literal survives into every client — which is what lets the template-only CI
# step identify itself and skip everywhere else. Workflows are CLASS.SAFE and
# sync verbatim, so an unguarded template-only step would fail client CI
# permanently; bin/test-rename.sh asserts the guard is present and exact.
FUTUREBASE_TEMPLATE_REPOSITORY='kicobi/futurebase-wp'
FUTUREBASE_PATH_FLAG='--futurebase-path'
FUTUREBASE_RENAME_KEEP_MARKER='<!-- futurebase-rename: keep-line -->'

FUTUREBASE_LEGACY_FORMS=(
	'wp-starter'
	'wp_starter'
	'WP_STARTER'
	'WP Starter'
)

FUTUREBASE_RUNTIME_PATHS=(
	patterns
	templates
	parts
	inc
	src
	functions.php
	style.css
	readme.txt
	plugins
)

# Stored state and extension hooks belong to the companion product rather than
# a branded project identity. Promotion must preserve every value exactly.
FUTUREBASE_SEO_FROZEN_IDENTIFIERS=(
	_compseo_title
	_compseo_description
	_compseo_noindex
	_compseo_canonical
	_compseo_social_image_id
	compseo_settings
	compseo_is_suppressed
	compseo_supported_post_types
	compseo_document
	compseo_schema_graph
	compseo_indexable_query_vars
	compseo_indexing_decision
)

# Product-positioning files belong only to the Futurebase WP source repository.
# Client rename removes every entry rather than attempting to rebrand it.
FUTUREBASE_PRODUCT_EXCLUSIONS=(
	docs/futurebase-wp.md
	docs/futurebase-company-site.md
	docs/assets/futurebase-wp-social.png
	screenshot.png
)

# Repo-wide legacy-name exceptions. Each tab-separated row is:
#   path regex reason removal-policy
# Keep this exact: bin/audit-identity.sh fails both unlisted matches and stale
# allowlist rows. Entries are populated alongside the 2.x compatibility shims.
FUTUREBASE_LEGACY_ALLOWLIST=(
	$'tools/project-system/config/rename-contract.sh\t.*\tcontract definitions and allowlist source\tpermanent'
	$'.gitignore\t\\.wp-starter-promotion\\.json\tlegacy promotion checkpoint ignore\tFuturebase 3.0'
	$'.gitignore\t\\.wp-starter-promotion-\\*\\.json\tlegacy promotion receipt ignore\tFuturebase 3.0'
	$'docs/navigation-migration-v2.md\t_wp_starter_navigation_migration\thistorical persisted meta-key note\tpermanent'
	$'docs/project-lifecycle.md\tlegacy `\\.wp-starter-promotion…json`\tlegacy receipt documentation\tFuturebase 3.0'
	$'docs/project-lifecycle.md\tbin/wp-starter\\.mjs sync\tclient source-path bootstrap command\tFuturebase 3.0'
	$'tools/project-system/bin/wp-starter.mjs\twp-starter is deprecated\tlegacy CLI warning\tFuturebase 3.0'
	$'tools/project-system/commands/lead/inspect.mjs\treferences/wp-starter-context\\.md\tpermanent legacy dossier reader\tpermanent'
	$'tools/project-system/commands/lead/promote.mjs\tLEGACY_TEMPLATE.*studiokicobi/wp-starter\tpre-cutover template equivalence\tFuturebase 3.0'
	$'tools/project-system/commands/lead/promote.mjs\tLEGACY_CHECKPOINT_FILE.*\\.wp-starter-promotion\\.json\tlegacy checkpoint reader\tFuturebase 3.0'
	$'tools/project-system/commands/lead/promote.mjs\t^[0-9]+:[[:space:]]*\x27\\.wp-starter-promotion\\.json\x27\tlegacy checkpoint gitignore entry\tFuturebase 3.0'
	$'tools/project-system/commands/lead/promote.mjs\t`\\.wp-starter-promotion-\\$\\{hash\\}\\.json`\tlegacy recovery receipt reader\tFuturebase 3.0'
	$'tools/project-system/commands/lead/promote.mjs\tprocess\\.env\\.WP_STARTER_PROMOTE_CLONE_FROM\tlegacy promotion seam environment variable\tFuturebase 3.0'
	$'tools/project-system/lib/paths.mjs\tprocess\\.env\\.WP_STARTER_LEADS_ROOT\tlegacy leads-root environment variable\tFuturebase 3.0'
	$'tools/project-system/modules/wordpress.mjs\tprocess\\.env\\.WP_STARTER_WP_CLI\tlegacy WP-CLI environment variable\tFuturebase 3.0'
	$'tools/project-system/package.json\t"wp-starter": "\\./bin/wp-starter\\.mjs"\tlegacy npm binary\tFuturebase 3.0'
	$'tools/project-system/package-lock.json\t"wp-starter": "bin/wp-starter\\.mjs"\tlegacy npm binary lock metadata\tFuturebase 3.0'
	$'tools/project-system/test/compatibility.test.mjs\tbin.*wp-starter\\.mjs\tlegacy CLI compatibility fixture\tFuturebase 3.0'
	$'tools/project-system/test/compatibility.test.mjs\twp-starter is deprecated; use futurebase\tlegacy CLI warning assertion\tFuturebase 3.0'
	$'tools/project-system/test/promotion.test.mjs\tcheckpointFor.*studiokicobi/wp-starter\tlegacy checkpoint equivalence fixture\tFuturebase 3.0'
	$'tools/project-system/test/promotion.test.mjs\ttemplateNamesEquivalent.*studiokicobi/wp-starter\thandle-cutover equivalence-pair assertion\tFuturebase 3.0'
	$'tools/project-system/test/promotion.test.mjs\ttemplate: \x27studiokicobi/wp-starter\x27\tlegacy receipt template fixture\tFuturebase 3.0'
	$'tools/project-system/test/promotion.test.mjs\ttemplate_repository: \x27studiokicobi/wp-starter\x27\tlegacy receipt repository fixture\tFuturebase 3.0'
	$'tools/project-system/test/promotion.test.mjs\tliveIdentity.*template_repository: \x27studiokicobi/wp-starter\x27\tstrict live-template comparison fixture\tFuturebase 3.0'
	$'tools/project-system/test/sync.test.mjs\t/missing/wp-starter\tstale source-path repair fixture\tFuturebase 3.0'
)
