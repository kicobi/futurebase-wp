// bin/verify-contract.test.mjs — mutation fixtures for the Technical Contract.
//
// Every check here is fed markup that MUST fail it. That is the whole point:
// the checks these replaced all passed, and passed for the wrong reason — a
// blacklist that did not list the block someone used, a grep that matched a
// nested key, an AWK parser that read valid JSON as an empty list. A check that
// has never been shown to fail is a check nobody has tested.
//
// Run: npm run test:contract

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, checkTemplateWiring, checkPageComposition, checkFluidTypography, checkCustomTemplates, checkThemePaths } from './verify-contract.mjs';

// A slug this theme is not. These fixtures test the SHAPE the contract
// requires, not this particular theme, and using the real slug made them look
// theme-specific when they are not. It also keeps this file slug-free, which is
// what lets sync carry it into client projects alongside the checker it proves
// — see PORTABLE_BIN in tools/project-system/lib/sync.mjs.
const SLUG = 'acme-theme';

// --- the parser --------------------------------------------------------------

test('block parser reads both delimiter forms and namespaces core', () => {
	const blocks = parseBlocks('<!-- wp:paragraph --><!-- /wp:paragraph --><!-- wp:acme/card {"id":3} /-->');
	assert.deepEqual(
		blocks.map((b) => b.name),
		['core/paragraph', 'acme/card'],
	);
	assert.equal(blocks[1].attrs.id, 3);
});

test('block parser tracks nesting depth', () => {
	const blocks = parseBlocks('<!-- wp:group --><!-- wp:paragraph /--><!-- /wp:group -->');
	assert.equal(blocks[0].depth, 0);
	assert.equal(blocks[1].depth, 1, 'the paragraph is inside the group');
});

// --- item 3 ------------------------------------------------------------------

const WIRING = `
<!-- wp:template-part {"slug":"header"} /-->
<!-- wp:group {"tagName":"main"} -->
<main><!-- wp:pattern {"slug":"acme-theme/home"} /--></main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer"} /-->`;

test('a thin template passes', () => {
	assert.deepEqual(checkTemplateWiring(WIRING), []);
});

test('blocks the old blacklist missed are caught', () => {
	// core/list and core/html were not in the blacklist, so a template could
	// carry either and be reported as "pure wiring".
	for (const block of ['<!-- wp:list /-->', '<!-- wp:html /-->', '<!-- wp:separator /-->', '<!-- wp:acme/hero-slider /-->']) {
		const problems = checkTemplateWiring(WIRING.replace('<!-- wp:template-part {"slug":"footer"} /-->', block));
		assert.ok(
			problems.some((p) => p.includes('templates wire')),
			`${block} must be rejected`,
		);
	}
});

test('a blacklisted block is still caught', () => {
	const problems = checkTemplateWiring(WIRING + '<!-- wp:paragraph /-->');
	assert.ok(problems.some((p) => p.includes('core/paragraph')));
});

test('composing more than one pattern is rejected', () => {
	// The old check counted nothing, so a template could reference three
	// patterns and still be "thin".
	const two = WIRING.replace('<!-- /wp:group -->', '<!-- wp:pattern {"slug":"acme-theme/extra"} /--><!-- /wp:group -->');
	assert.ok(checkTemplateWiring(two).some((p) => p.includes('references 2 patterns')));
});

test('a template referencing no pattern is rejected', () => {
	const none = '<!-- wp:template-part {"slug":"header"} /--><!-- wp:template-part {"slug":"footer"} /-->';
	assert.ok(checkTemplateWiring(none).some((p) => p.includes('references no pattern')));
});

// --- item 4 ------------------------------------------------------------------

// The file is patterns/_section-hero.php; the slug it registers is
// acme-theme/section-hero. References name the slug.
test('a page-level pattern composing section patterns passes', () => {
	const php = '<!-- wp:pattern {"slug":"acme-theme/section-hero"} /--><!-- wp:pattern {"slug":"acme-theme/section-cta"} /-->';
	assert.deepEqual(checkPageComposition(php, SLUG), []);
});

test('content in a page-level pattern is rejected', () => {
	const php = '<!-- wp:pattern {"slug":"acme-theme/section-hero"} /--><!-- wp:heading /-->';
	assert.ok(checkPageComposition(php, SLUG).some((p) => p.includes('does not carry content')));
});

test('composing a non-section pattern is rejected', () => {
	const php = '<!-- wp:pattern {"slug":"acme-theme/_copyright"} /-->';
	assert.ok(checkPageComposition(php, SLUG).some((p) => p.includes('section-* patterns only')));
});

test('composing another theme’s pattern is rejected', () => {
	const php = '<!-- wp:pattern {"slug":"twentytwentyfive/hero"} /-->';
	assert.ok(checkPageComposition(php, SLUG).some((p) => p.includes('not a acme-theme/ pattern')));
});

// --- item 7 ------------------------------------------------------------------

const themeWith = (over) => ({ settings: { typography: { fluid: true, fontSizes: [], ...over } } });

test('fluid typography on, with compliant presets, passes', () => {
	const theme = themeWith({
		fontSizes: [
			{ slug: 'small', size: '1rem' },
			{ slug: 'large', size: '1.75rem', fluid: { min: '1.5rem', max: '1.75rem' } },
		],
	});
	assert.deepEqual(checkFluidTypography(theme), []);
});

test('fluid: true nested in a preset does not satisfy the setting', () => {
	// The old grep matched `"fluid": true` anywhere in the file, so a preset
	// carrying it made the whole theme look compliant.
	const theme = { settings: { typography: { fontSizes: [{ slug: 'x', size: '2rem', fluid: true }] } } };
	assert.ok(checkFluidTypography(theme).some((p) => p.includes('settings.typography.fluid must be true')));
});

test('an oversized px preset without fluid is rejected', () => {
	// Skipped entirely by the old check, which only looked at rem.
	const theme = themeWith({ fontSizes: [{ slug: 'display', size: '32px' }] });
	assert.ok(checkFluidTypography(theme).some((p) => p.includes("fontSize 'display'")));
});

test('a 16px preset is body scale and stays exempt', () => {
	assert.deepEqual(checkFluidTypography(themeWith({ fontSizes: [{ slug: 'base', size: '16px' }] })), []);
});

test('fluid missing min or max is rejected', () => {
	const theme = themeWith({ fontSizes: [{ slug: 'large', size: '2rem', fluid: { max: '2rem' } }] });
	assert.ok(checkFluidTypography(theme).some((p) => p.includes('both min and max')));
});

// --- item 9 ------------------------------------------------------------------

test('customTemplates with files on disk passes', () => {
	const theme = { customTemplates: [{ name: 'page-notitle', title: 'No title' }] };
	assert.deepEqual(checkCustomTemplates(theme, (n) => n === 'page-notitle'), []);
});

test('a ghost customTemplate entry is rejected', () => {
	const theme = { customTemplates: [{ name: 'page-wide', title: 'Wide' }] };
	assert.ok(checkCustomTemplates(theme, () => false).some((p) => p.includes("customTemplate 'page-wide'")));
});

test('compact JSON is read correctly rather than as "none declared"', () => {
	// The AWK state machine keyed off line structure, so customTemplates
	// written on one line parsed as an empty list and the check passed by
	// finding nothing to check.
	const theme = JSON.parse('{"customTemplates":[{"name":"page-wide","title":"Wide"},{"name":"page-narrow","title":"Narrow"}]}');
	const problems = checkCustomTemplates(theme, () => false);
	assert.equal(problems.length, 2, 'both entries must be seen');
});

// --- item 5 ------------------------------------------------------------------

test('markup free of theme paths passes', () => {
	assert.deepEqual(checkThemePaths([{ file: 'patterns/a.php', contents: '<img src="<?php echo get_theme_file_uri( "assets/logo.svg" ); ?>">' }]), []);
});

test('hardcoded theme directory paths are rejected in every form', () => {
	for (const bad of ['<img src="/wp-content/themes/acme-theme/assets/x.png">', '<img src="https://example.com/wp-content/themes/x/a.png">', '<?php echo get_stylesheet_directory_uri(); ?>/assets/x.png', '<?php echo get_template_directory_uri(); ?>/assets/x.png']) {
		const problems = checkThemePaths([{ file: 'patterns/a.php', contents: bad }]);
		assert.equal(problems.length, 1, `must reject: ${bad}`);
	}
});
