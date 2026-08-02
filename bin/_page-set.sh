#!/usr/bin/env bash
# bin/_page-set.sh — the page set the measurement harnesses cover.
#
# One list, two consumers. bin/scorecard.sh measured eight URLs while
# bin/a11y-wp-env.sh measured two — the homepage and whichever post came back
# first — so the accessibility gate never visited /about/ or /services/, where
# most of the section patterns actually render. Two WCAG failures lived on
# /services/ and survived a permanently green a11y job because of it. A gate
# whose coverage is narrower than its name is worse than no gate: it is trusted.
#
# Slugs are the deterministic fixture slugs created by fixtures/import-demo.php.
# Keep the two in step — a URL here that the fixture does not create measures a
# 404 and reports it as a page.
#
# Sourced, never executed. Slug-free by contract: bin/test-rename.sh asserts it,
# because this file is CLASS.SAFE and copies verbatim into client projects.

# One URL per shipped template family.
page_set() {
	local base="${1%/}"
	printf '%s\n' \
		"$base/" \
		"$base/about/" \
		"$base/services/" \
		"$base/blog/" \
		"$base/designing-with-demo-content/" \
		"$base/category/notes/" \
		"$base/author/demo-author/" \
		"$base/?s=demo"
}

# The 404 template is pa11y-only: Lighthouse on a non-200 response is unreliable,
# but an error page still has to be navigable.
page_set_with_404() {
	local base="${1%/}"
	page_set "$base"
	printf '%s\n' "$base/this-page-does-not-exist/"
}
