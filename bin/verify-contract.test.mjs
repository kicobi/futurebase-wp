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
import { parseBlocks, collectPatternSlugs, checkRawValues, checkTemplateWiring, checkPageComposition, checkFluidTypography, checkCustomTemplates, checkThemePaths } from './verify-contract.mjs';

// A slug this theme is not. These fixtures test the SHAPE the contract
// requires, not this particular theme, and using the real slug made them look
// theme-specific when they are not. It also keeps this file slug-free, which is
// what lets sync carry it into client projects alongside the checker it proves
// — see PORTABLE_BIN in tools/project-system/lib/sync.mjs.
const SLUG = 'acme-theme';

// --- the parser --------------------------------------------------------------

test('block parser reads both delimiter forms and namespaces core', () => {
	const { blocks } = parseBlocks('<!-- wp:paragraph --><!-- /wp:paragraph --><!-- wp:acme/card {"id":3} /-->');
	assert.deepEqual(
		blocks.map((b) => b.name),
		['core/paragraph', 'acme/card'],
	);
	assert.equal(blocks[1].attrs.id, 3);
});

test('block parser tracks nesting depth', () => {
	const { blocks, unbalanced } = parseBlocks('<!-- wp:group --><!-- wp:paragraph /--><!-- /wp:group -->');
	assert.equal(blocks[0].depth, 0);
	assert.equal(blocks[1].depth, 1, 'the paragraph is inside the group');
	assert.deepEqual(unbalanced, []);
});

test('block parser reports what does not balance', () => {
	// Silently clamping depth meant an unclosed group made every following
	// block look nested, so a template with no header and no footer still
	// presented one pattern at the right depth and passed.
	assert.match(parseBlocks('<!-- wp:group --><!-- wp:pattern /-->').unbalanced[0], /wp:core\/group is never closed/);
	assert.match(parseBlocks('<!-- /wp:group -->').unbalanced[0], /nothing open/);
	assert.match(parseBlocks('<!-- wp:group --><!-- /wp:columns -->').unbalanced[0], /while wp:core\/group is open/);
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

test('an unclosed group with no header or footer is rejected', () => {
	// It has exactly one pattern, all of its blocks are on the whitelist, and
	// under the previous checks that was enough to pass.
	const broken = '<!-- wp:group {"tagName":"main"} --><!-- wp:pattern {"slug":"acme-theme/home"} /-->';
	const problems = checkTemplateWiring(broken);
	assert.ok(
		problems.some((p) => p.includes('never closed')),
		'the unbalanced group must be reported',
	);
	assert.ok(
		problems.some((p) => p.includes('header part, main, footer part')),
		'the missing header and footer must be reported',
	);
});

test('the root structure must be header part, main, footer part', () => {
	const noFooter = '<!-- wp:template-part {"slug":"header"} /--><!-- wp:group {"tagName":"main"} --><!-- wp:pattern {"slug":"acme-theme/home"} /--><!-- /wp:group -->';
	assert.ok(checkTemplateWiring(noFooter).some((p) => p.includes('top level is')));

	const wrongPart = WIRING.replace('{"slug":"header"}', '{"slug":"sidebar"}');
	assert.ok(checkTemplateWiring(wrongPart).some((p) => p.includes('expected "header"')));

	const notMain = WIRING.replace('{"tagName":"main"}', '{"tagName":"div"}');
	assert.ok(checkTemplateWiring(notMain).some((p) => p.includes('tagName "main"')));
});

test('a reference to a pattern nobody registers is rejected', () => {
	// It renders as nothing, so the page silently loses a section.
	const known = new Set(['acme-theme/home']);
	assert.deepEqual(checkTemplateWiring(WIRING, { knownPatterns: known }), []);

	const ghost = WIRING.replace('acme-theme/home', 'acme-theme/does-not-exist');
	assert.ok(checkTemplateWiring(ghost, { knownPatterns: known }).some((p) => p.includes('no patterns/*.php registers')));

	const php = '<!-- wp:pattern {"slug":"acme-theme/section-ghost"} /-->';
	assert.ok(checkPageComposition(php, SLUG, { knownPatterns: new Set() }).some((p) => p.includes('no patterns/*.php registers')));
});

test('the pattern registry is read from Slug headers', () => {
	const files = [
		{ file: 'patterns/_section-hero.php', contents: '<?php\n/**\n * Title: Hero\n * Slug: acme-theme/section-hero\n */\n' },
		{ file: 'patterns/home.php', contents: '<?php\n/**\n * Title: Home\n * Slug: acme-theme/home\n */\n' },
		{ file: 'patterns/notes.md', contents: 'no header here' },
	];
	assert.deepEqual([...collectPatternSlugs(files)].sort(), ['acme-theme/home', 'acme-theme/section-hero']);
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

// --- gaps the parsed checks used to accept ------------------------------------
//
// Each of these returned an empty problem array. parseBlocks only sees
// delimiters, so raw markup between them was invisible; core/group is a legal
// wiring block, so an extra wrapper left the root shape untouched; and
// missingPattern() cannot speak about a slug it was never given.

test('hardcoded content in a template is rejected', () => {
	const html = WIRING.replace('<main>', '<main><h1>Welcome to Acme</h1>');
	assert.ok(
		checkTemplateWiring(html).some((p) => p.includes('hardcoded content')),
		'raw markup between blocks must be caught',
	);
});

test('a template legitimately carrying a group wrapper still passes', () => {
	// The group serializes its own <main> into the template. Stripping tags before
	// looking for text is what keeps that from reading as content.
	assert.deepEqual(checkTemplateWiring(WIRING), []);
});

test('an extra layout wrapper around the pattern is rejected', () => {
	const html = WIRING.replace(
		'<!-- wp:pattern {"slug":"acme-theme/home"} /-->',
		'<!-- wp:group {"layout":{"type":"constrained"}} --><div><!-- wp:pattern {"slug":"acme-theme/home"} /--></div><!-- /wp:group -->',
	);
	assert.ok(
		checkTemplateWiring(html).some((p) => p.includes('does not lay out')),
		'layout inside a template belongs to the pattern',
	);
});

test('a pattern reference with no slug is rejected', () => {
	const html = WIRING.replace('<!-- wp:pattern {"slug":"acme-theme/home"} /-->', '<!-- wp:pattern /-->');
	assert.ok(
		checkTemplateWiring(html).some((p) => p.includes('no slug')),
		'a slugless reference renders as nothing',
	);
});

test('hardcoded content beside a valid section reference is rejected', () => {
	const php = '<!-- wp:pattern {"slug":"acme-theme/section-hero"} /--><h2>Our services</h2>';
	assert.ok(
		checkPageComposition(php, SLUG).some((p) => p.includes('hardcoded content')),
		'text outside every block is content',
	);
});

// --- item 1: tokens first -----------------------------------------------------
//
// The bash gate this replaces skipped every line starting `<!--`, which is how
// Gutenberg serializes a block delimiter — so raw values inside block attributes
// passed whenever the delimiter shared a line with its saved markup, which is
// the normal serialization for a simple block.

const raw = (contents) => checkRawValues([{ file: 'patterns/_probe.php', contents }]);

test('raw values inside a one-line block delimiter are caught', () => {
	const html = '<!-- wp:paragraph {"style":{"color":{"text":"#ff0000"}}} --><p>Hi</p><!-- /wp:paragraph -->';
	assert.ok(raw(html).some((p) => p.includes('hex color')), 'a hex in block attributes must be caught');
});

test('every raw value form is caught on a delimiter line', () => {
	for (const [value, label] of [['#ff0000', 'hex'], ['rgba(0,0,0,.5)', 'rgb'], ['24px', 'px'], ['2rem', 'rem']]) {
		const html = `<!-- wp:group {"style":{"spacing":{"padding":"${value}"}}} --><div></div><!-- /wp:group -->`;
		assert.ok(raw(html).length > 0, `${label} on a delimiter line must be caught`);
	}
});

test('a file-header comment is not scanned', () => {
	// This is what the line-prefix exclusion was protecting, and why it could not
	// simply be deleted: templates and parts open with an HTML comment.
	const html = '<!--\nTitle: Home\nPalette: #ff0000 was the old brand colour\n-->\n<!-- wp:pattern {"slug":"acme/section-hero"} /-->';
	assert.deepEqual(raw(html), []);
});

test('a PHP docblock is not scanned', () => {
	assert.deepEqual(raw('<?php\n/**\n * Spacing was 2rem before tokens.\n */\n'), []);
});

test('reported line numbers survive comment blanking', () => {
	const html = '<!--\nTitle: Home\n-->\n<!-- wp:group {"style":{"color":{"background":"#abcdef"}}} /-->';
	assert.match(raw(html)[0], /:4:/, 'blanking must preserve line numbers, not shift them');
});
