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
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { parseBlocks, collect, collectPatternSlugs, checkRawValues, checkTemplateWiring, checkPageComposition, checkFluidTypography, checkCustomTemplates, checkThemePaths } from './verify-contract.mjs';

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

// The header docblock is PHP too, so "no PHP" cannot be the rule — which is
// exactly why the residue check swallowed the rest of it. `<[^>]*>` removes
// `<?php echo 'Buy now'; ?>` the same way it removes a tag, so hardcoded copy
// behind an echo left an empty residue and passed.
test('the pattern header is PHP and still passes', () => {
	const php = "<?php\n/**\n * Title: Home\n * Slug: acme-theme/home\n */\n?>\n<!-- wp:pattern {\"slug\":\"acme-theme/section-hero\"} /-->";
	assert.deepEqual(checkPageComposition(php, SLUG), []);
});

test('executable PHP in a page-level pattern is rejected', () => {
	const header = "<?php\n/**\n * Title: Home\n */\n?>\n";
	const php = `${header}<!-- wp:pattern {"slug":"acme-theme/section-hero"} /-->\n<?php echo esc_html__( 'Buy now', 'acme-theme' ); ?>`;
	const problems = checkPageComposition(php, SLUG);
	assert.ok(
		problems.some((p) => p.includes('executable PHP')),
		'content behind an echo is content the residue check cannot see',
	);
	assert.match(problems.find((p) => p.includes('executable PHP')), /:7:/, 'the reported line is where the PHP opens');
});

test('the short echo tag is executable too', () => {
	assert.ok(checkPageComposition('<?= $heading ?>', SLUG).some((p) => p.includes('executable PHP')));
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

test('JSON-escaped CSS url functions hide URL contents but not adjacent raw values', () => {
	const attributes = JSON.stringify({ style: { css: '.x{background:u\\72l("/assets/2rem-#fff.svg");padding:3px}' } });
	const markup = `<!-- wp:group ${attributes} /-->`;
	const parsed = parseBlocks(markup);
	assert.deepEqual(parsed.unbalanced, []);
	assert.equal(parsed.blocks[0].malformed, undefined, 'the fixture must exercise valid Gutenberg JSON');
	const problems = raw(markup);
	assert.equal(problems.filter((problem) => problem.includes('raw length')).length, 1);
	assert.match(problems[0], /raw length "3px"/);
	assert.ok(problems.every((problem) => !problem.includes('2rem') && !problem.includes('#fff')));
});

test('CSS url masking requires function-token adjacency and spans complete values', () => {
	assert.ok(raw('<style>:root{--probe:url (2rem)}</style>').some((problem) => problem.includes('2rem')));
	assert.deepEqual(raw('<style>.x{background:url(\n"/assets/2rem-#fff.svg"\n)}</style>'), []);
	assert.deepEqual(raw('<style>.x{background:url/**/("/assets/2rem-#fff.svg")}</style>'), []);
});

test('decoded CSS escapes form dimensions in block JSON and across source lines', () => {
	const attributes = JSON.stringify({ style: { css: '.x{padding:2r\\65 m}' } });
	const markup = `<!-- wp:group ${attributes} /-->`;
	assert.equal(parseBlocks(markup).blocks[0].malformed, undefined);
	assert.ok(raw(markup).some((problem) => problem.includes('raw length')));
	assert.ok(raw('<style>.x{padding:2r\\65\nm}</style>').some((problem) => problem.includes('raw length')));
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

test('a tolerated value does not exempt the rest of its line', () => {
	// The exemption tested the whole LINE and returned. A block delimiter
	// serializes as one line, so a single core-written width or spacer height
	// hid every raw value sitting beside it in the same attributes.
	const image = '<!-- wp:image {"width":"600px","style":{"color":{"text":"#ff0000"}}} /-->';
	assert.ok(raw(image).some((p) => p.includes('hex color')), 'a hex beside a tolerated width must still be caught');
	const spacer = '<div style="height: 50px" class="wp-block-spacer" data-accent="#abcdef"></div>';
	assert.ok(raw(spacer).some((p) => p.includes('hex color')), 'a hex beside a tolerated spacer height must still be caught');
});

test('what core serializes itself is still tolerated', () => {
	assert.deepEqual(raw('<!-- wp:image {"width":"600px"} /-->'), []);
	assert.deepEqual(raw('<div style="height: 50px" aria-hidden="true" class="wp-block-spacer"></div>'), []);
});

test('reported line numbers survive comment blanking', () => {
	const html = '<!--\nTitle: Home\n-->\n<!-- wp:group {"style":{"color":{"background":"#abcdef"}}} /-->';
	assert.match(raw(html)[0], /:4:/, 'blanking must preserve line numbers, not shift them');
});

// --- gaps in the item 5 and item 7 rules --------------------------------------

test('every theme-root construction is caught, whatever its case', () => {
	// PHP function names are case-insensitive, and the blacklist named only two
	// of the several ways to reach the theme root.
	const forms = [
		"<?php echo get_theme_root_uri() . '/acme/assets/logo.svg';",
		"<?php echo GET_THEME_ROOT_URI() . '/acme/assets/logo.svg';",
		"<?php echo get_theme_root() . '/acme/assets/logo.svg';",
		"<?php echo Get_Stylesheet_Directory_Uri();",
		"<?php echo get_stylesheet_directory();",
		"<?php echo get_template_directory();",
		'<img src="/wp-content/themes/acme/assets/logo.svg">',
	];
	for (const contents of forms) {
		assert.equal(
			checkThemePaths([{ file: 'patterns/_probe.php', contents }]).length,
			1,
			`not caught: ${contents}`,
		);
	}
});

test('the sanctioned theme-file helpers are not flagged', () => {
	// Otherwise the rule would reject the very call docs/media-conventions.md
	// tells you to use.
	for (const contents of ["<?php echo get_theme_file_uri('assets/images/logo.svg');", "<?php echo get_theme_file_path('assets/fonts/brand.woff2');"]) {
		assert.deepEqual(checkThemePaths([{ file: 'patterns/_probe.php', contents }]), []);
	}
});

test('a size the fluid rule cannot measure is reported, not skipped', () => {
	// `2em` is heading-sized, but sizeInRem() returns null for it — and null was
	// treated as "nothing to check", so the preset escaped the rule silently.
	const theme = { settings: { typography: { fluid: true, fontSizes: [{ slug: 'huge', size: '2em' }] } } };
	assert.ok(
		checkFluidTypography(theme).some((p) => p.includes('must be rem or px')),
		'an unmeasurable size must be named',
	);
});

test('rem and px presets are still measured, not rejected as unsupported', () => {
	const ok = { settings: { typography: { fluid: true, fontSizes: [
		{ slug: 'small', size: '1rem' },
		{ slug: 'large', size: '1.75rem', fluid: { min: '1.5rem', max: '1.75rem' } },
		{ slug: 'body', size: '16px' },
	] } } };
	assert.deepEqual(checkFluidTypography(ok), []);
	const px = { settings: { typography: { fluid: true, fontSizes: [{ slug: 'big', size: '32px' }] } } };
	assert.ok(checkFluidTypography(px).some((p) => p.includes('declares no fluid')), 'px above body scale still needs a range');
});

// --- what the gate actually opens ---------------------------------------------
//
// Every rule above is worthless on a file nobody reads. The collector took one
// level of each directory and its try/catch swallowed subdirectories as
// "not markup" — but WordPress registers these recursively
// (WP_Theme::scandir($dirpath, 'php', -1) for patterns,
// _get_block_templates_paths()'s RecursiveIteratorIterator for templates and
// parts), so patterns/sections/hero.php was a live registered pattern the gate
// had never opened.

test('nested patterns, templates and parts are collected', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-collect-'));
	try {
		mkdirSync(join(root, 'patterns', 'sections'), { recursive: true });
		writeFileSync(join(root, 'patterns', 'top.php'), '<!-- wp:paragraph /-->');
		writeFileSync(join(root, 'patterns', 'sections', 'nested.php'), '<p style="color:#ff0000">x</p>');

		const files = collect(['patterns'], root);
		assert.deepEqual(
			files.map((f) => f.file).sort(),
			['patterns/sections/nested.php', 'patterns/top.php'],
		);
		assert.ok(
			checkRawValues(files).some((p) => p.startsWith('patterns/sections/nested.php:')),
			'a raw value in a nested pattern must be reported against its real path',
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- which pattern the rules apply to ------------------------------------------
//
// Item 4 is a rule about the page-level pattern, and the page-level pattern is
// whichever one the template wires. Keying the checks to the literal filename
// patterns/home.php made the rule opt-in: rename the pattern, point the template
// at the new slug, and the composition checks silently stopped applying to the
// page actually being served.

function fixtureTheme(root, { pageSlug = 'acme-theme/landing', pageFile = 'patterns/landing.php', pageBody = '' } = {}) {
	mkdirSync(join(root, 'patterns'), { recursive: true });
	mkdirSync(join(root, 'templates'), { recursive: true });
	writeFileSync(join(root, 'style.css'), '/*\nTheme Name: Acme\nText Domain: acme-theme\n*/\n');
	writeFileSync(join(root, 'theme.json'), JSON.stringify({ version: 3, settings: { typography: { fluid: true, fontSizes: [] } } }));
	writeFileSync(
		join(root, 'templates', 'front-page.html'),
		`<!-- wp:template-part {"slug":"header"} /-->\n<!-- wp:group {"tagName":"main"} -->\n<main><!-- wp:pattern {"slug":"${pageSlug}"} /--></main>\n<!-- /wp:group -->\n<!-- wp:template-part {"slug":"footer"} /-->\n`,
	);
	writeFileSync(join(root, 'patterns', '_section-hero.php'), '<?php\n/**\n * Title: Hero\n * Slug: acme-theme/section-hero\n */\n?>\n<!-- wp:paragraph --><p>Hero</p><!-- /wp:paragraph -->\n');
	mkdirSync(dirname(join(root, pageFile)), { recursive: true });
	writeFileSync(
		join(root, pageFile),
		`<?php\n/**\n * Title: Page\n * Slug: ${pageSlug}\n */\n?>\n<!-- wp:pattern {"slug":"acme-theme/section-hero"} /-->\n${pageBody}`,
	);
}

const runChecker = (cwd) => spawnSync(process.execPath, [fileURLToPath(new URL('./verify-contract.mjs', import.meta.url))], { cwd, encoding: 'utf8' });

test('the page-level pattern is found through the template, not by filename', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-wiring-'));
	try {
		fixtureTheme(root);
		const clean = runChecker(root);
		assert.equal(clean.status, 0, clean.stdout + clean.stderr);

		fixtureTheme(root, { pageBody: "<?php echo '<h1>Buy now, half price</h1>'; ?>\n" });
		const dirty = runChecker(root);
		assert.equal(dirty.status, 1, 'a wired pattern named anything must still be checked');
		assert.match(dirty.stderr, /patterns\/landing\.php.*executable PHP/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('a symlinked pattern file is scanned, a symlinked directory is not followed', () => {
	// WordPress reads straight through a symlinked pattern file, so skipping one
	// would have narrowed the gate at the same moment recursion widened it.
	const root = mkdtempSync(join(tmpdir(), 'contract-links-'));
	try {
		fixtureTheme(root);
		const outside = join(root, 'outside.php');
		writeFileSync(outside, '<p style="color:#ff0000">x</p>\n');
		symlinkSync(outside, join(root, 'patterns', '_linked.php'));
		symlinkSync(join(root, 'patterns'), join(root, 'patterns', 'loop'));

		const r = runChecker(root);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /patterns\/_linked\.php:1: raw hex color/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- verifier completion: frozen negative fixtures --------------------------
//
// These five categories came from the PR #101 follow-up audit. Keep them as
// whole-checker fixtures: the bug was not merely in a helper, but in which
// files and settings the executable gate opened at all.

test('a style variation cannot disable fluid typography', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-variation-fluid-'));
	try {
		fixtureTheme(root);
		mkdirSync(join(root, 'styles'));
		writeFileSync(join(root, 'styles', 'dark.json'), JSON.stringify({ version: 3, title: 'Dark', settings: { typography: { fluid: false } } }));
		const result = runChecker(root);
		assert.equal(result.status, 1, 'every styles/*.json document must enter the parsed checker');
		assert.match(result.stderr, /styles\/dark\.json.*fluid/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('style-variation per-block typography is checked too', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-variation-block-fluid-'));
	try {
		fixtureTheme(root);
		mkdirSync(join(root, 'styles'));
		writeFileSync(join(root, 'styles', 'editorial.json'), JSON.stringify({
			version: 3,
			title: 'Editorial',
			settings: { blocks: { 'core/post-title': { typography: { fontSizes: [{ slug: 'hero', size: '48px' }] } } } },
		}));
		const result = runChecker(root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /styles\/editorial\.json.*core\/post-title.*hero.*fluid/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('per-block typography presets cannot bypass the fluid rule', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-block-fluid-'));
	try {
		fixtureTheme(root);
		writeFileSync(join(root, 'theme.json'), JSON.stringify({
			version: 3,
			settings: {
				typography: { fluid: true, fontSizes: [] },
				blocks: { 'core/heading': { typography: { fontSizes: [{ slug: 'display', size: '3rem' }] } } },
			},
		}));
		const result = runChecker(root);
		assert.equal(result.status, 1, 'settings.blocks.*.typography.fontSizes must be validated');
		assert.match(result.stderr, /core\/heading.*display.*fluid/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('fluid range endpoints must be measurable', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-fluid-range-'));
	try {
		fixtureTheme(root);
		writeFileSync(join(root, 'theme.json'), JSON.stringify({
			version: 3,
			settings: { typography: { fluid: true, fontSizes: [{ slug: 'display', size: '2rem', fluid: { min: '1rem', max: '4em' } }] } },
		}));
		const result = runChecker(root);
		assert.equal(result.status, 1, 'a string is not enough; min and max must be measurable rem/px values');
		assert.match(result.stderr, /display.*max.*rem or px/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('a custom-template directory is not a template file', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-template-directory-'));
	try {
		fixtureTheme(root);
		writeFileSync(join(root, 'theme.json'), JSON.stringify({
			version: 3,
			customTemplates: [{ name: 'page-wide', title: 'Wide' }],
			settings: { typography: { fluid: true, fontSizes: [] } },
		}));
		mkdirSync(join(root, 'templates', 'page-wide.html'));
		const result = runChecker(root);
		assert.equal(result.status, 1, 'existsSync() must not let a directory satisfy customTemplates');
		assert.match(result.stderr, /page-wide.*regular file/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('uppercase CSS units and color functions cannot bypass raw-value detection', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-uppercase-css-'));
	try {
		fixtureTheme(root);
		writeFileSync(
			join(root, 'patterns', '_section-hero.php'),
			'<?php\n/**\n * Title: Hero\n * Slug: acme-theme/section-hero\n */\n?>\n<!-- wp:group {"style":{"spacing":{"padding":"24PX"},"color":{"text":"RGB(1 2 3)","background":"OKLCH(50% .2 20)"}}} /-->\n',
		);
		const result = runChecker(root);
		assert.equal(result.status, 1, 'CSS syntax is ASCII case-insensitive');
		assert.match(result.stderr, /24PX|RGB|OKLCH/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// Adjacent probes were added before the checker changed as well. They bound
// the fix so it cannot reject legitimate definitions or solve only the exact
// spelling used by the original reproductions.

test('raw color and length values in root and variation styles are rejected, but settings definitions are allowed', () => {
	for (const [label, theme, variation] of [
		['root styles', { version: 3, settings: { typography: { fluid: true, fontSizes: [] } }, styles: { color: { text: '#123456' } } }, null],
		['variation styles', { version: 3, settings: { typography: { fluid: true, fontSizes: [] } } }, { version: 3, title: 'Dark', styles: { elements: { button: { border: { width: '2px' } } } } }],
	]) {
		const root = mkdtempSync(join(tmpdir(), 'contract-style-values-'));
		try {
			fixtureTheme(root);
			writeFileSync(join(root, 'theme.json'), JSON.stringify(theme));
			if (variation) {
				mkdirSync(join(root, 'styles'));
				writeFileSync(join(root, 'styles', 'dark.json'), JSON.stringify(variation));
			}
			const result = runChecker(root);
			assert.equal(result.status, 1, `${label} must be scanned`);
			assert.match(result.stderr, /raw (?:hex color|length)/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}

	const root = mkdtempSync(join(tmpdir(), 'contract-style-definitions-'));
	try {
		fixtureTheme(root);
		writeFileSync(join(root, 'theme.json'), JSON.stringify({
			version: 3,
			settings: {
				typography: { fluid: true, fontSizes: [{ slug: 'large', size: '2rem', fluid: { min: '1rem', max: '2rem' } }] },
				color: { palette: [{ slug: 'brand', name: 'Brand', color: '#123456' }] },
				custom: { focus: { width: '2px' } },
			},
			styles: { color: { text: 'var(--wp--preset--color--brand)' }, outline: { width: 'var(--wp--custom--focus--width)' } },
		}));
		const result = runChecker(root);
		assert.equal(result.status, 0, result.stdout + result.stderr);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('raw CSS detection reports signed decimals and modern color functions exactly', () => {
	for (const value of ['-.5rem', '-2.25PX', '.75em', '1e2px', '+1E-2rem', 'HSL(10 20% 30%)', 'color(display-p3 1 0 0)', 'oklab(50% .1 -.1)']) {
		const problems = raw(`<!-- wp:group {"style":{"css":"${value}"}} /-->`);
		assert.ok(problems.some((problem) => problem.includes(`"${value}"`)), `must report the complete raw value: ${value}`);
	}
});

test('raw CSS detection covers every modern length-unit family case-insensitively', () => {
	for (const unit of [
		'px', 'cm', 'mm', 'q', 'in', 'pc', 'pt',
		'em', 'ex', 'cap', 'ch', 'ic', 'rem', 'rex', 'rcap', 'rch', 'ric', 'lh', 'rlh',
		'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax',
		'svw', 'svh', 'svi', 'svb', 'svmin', 'svmax',
		'lvw', 'lvh', 'lvi', 'lvb', 'lvmin', 'lvmax',
		'dvw', 'dvh', 'dvi', 'dvb', 'dvmin', 'dvmax',
		'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax', 'CQI',
	]) {
		const value = `2${unit}`;
		assert.ok(raw(`<!-- wp:group {"style":{"spacing":{"padding":"${value}"}}} /-->`).some((problem) => problem.includes(`"${value}"`)), value);
	}
});

test('length-like substrings inside identifiers and URLs are not raw CSS dimensions', () => {
	for (const value of [
		'2cqw-token',
		'token-2cqw',
		'2remé',
		String.raw`2rem\-token`,
		'url(/docs/2cqw-layout)',
		'url("/docs/2rem/layout.svg")',
		String.raw`u\72l(/docs/2rem.svg)`,
	]) {
		const attributes = JSON.stringify({ style: { css: value } });
		const markup = `<!-- wp:group ${attributes} /-->`;
		assert.equal(parseBlocks(markup).blocks[0].malformed, undefined, value);
		assert.deepEqual(raw(markup), [], value);
	}
});

test('fluid ranges reject incomplete and inverted endpoints and use the largest endpoint', () => {
	const fixtures = [
		[{ slug: 'incomplete', size: '1rem', fluid: { min: '1rem' } }, /both min and max/],
		[{ slug: 'inverted', size: '1rem', fluid: { min: '2rem', max: '1rem' } }, /min.*greater than max/],
		[{ slug: 'large-max', size: '1rem', fluid: { min: '1rem', max: '2rem' } }, null],
	];
	for (const [preset, expected] of fixtures) {
		const problems = checkFluidTypography(themeWith({ fontSizes: [preset] }));
		if (expected) assert.ok(problems.some((problem) => expected.test(problem)), preset.slug);
		else assert.deepEqual(problems, [], 'a complete range is valid even when size itself is body scale');
	}
});

test('fluid size must sit inside its min/max range across compatible rem and px units', () => {
	for (const [preset, expected] of [
		[{ slug: 'above', size: '48px', fluid: { min: '1rem', max: '2rem' } }, /size 48px is greater than fluid max 2rem/],
		[{ slug: 'below', size: '.5rem', fluid: { min: '16px', max: '32px' } }, /size \.5rem is less than fluid min 16px/],
	]) {
		const problems = checkFluidTypography(themeWith({ fontSizes: [preset] }));
		assert.ok(problems.some((problem) => expected.test(problem)), preset.slug);
	}
});

test('nested style variations enter the parsed checker', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-nested-variation-'));
	try {
		fixtureTheme(root);
		mkdirSync(join(root, 'styles', 'typography'), { recursive: true });
		writeFileSync(join(root, 'styles', 'typography', 'unsafe.json'), JSON.stringify({
			version: 3,
			settings: { typography: { fluid: false } },
			styles: { typography: { fontSize: '8cqi' }, color: { text: '#123456' } },
		}));
		const result = runChecker(root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /styles\/typography\/unsafe\.json.*fluid/);
		assert.match(result.stderr, /styles\/typography\/unsafe\.json.*8cqi/);
		assert.match(result.stderr, /styles\/typography\/unsafe\.json.*#123456/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('WordPress-style case-insensitive JSON variation extensions enter the checker', () => {
	for (const file of ['unsafe.JSON', 'nested/unsafe.JsOn']) {
		const root = mkdtempSync(join(tmpdir(), 'contract-case-variation-'));
		try {
			fixtureTheme(root);
			mkdirSync(dirname(join(root, 'styles', file)), { recursive: true });
			writeFileSync(join(root, 'styles', file), JSON.stringify({
				version: 3,
				settings: { typography: { fluid: false } },
				styles: { color: { text: '#123456' } },
			}));
			const result = runChecker(root);
			assert.equal(result.status, 1, file);
			assert.match(result.stderr, new RegExp(`styles/${file.replaceAll('.', '\\.')}.*fluid`, 'i'));
			assert.match(result.stderr, new RegExp(`styles/${file.replaceAll('.', '\\.')}.*raw hex color`, 'i'));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

test('nested style discovery rejects symlinks without following cycles and ignores non-JSON files', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-variation-links-'));
	try {
		fixtureTheme(root);
		mkdirSync(join(root, 'styles', 'group'), { recursive: true });
		writeFileSync(join(root, 'styles', 'notes.md'), '# ignored by WordPress\n');
		writeFileSync(join(root, 'outside.json'), JSON.stringify({ styles: { color: { text: '#123456' } } }));
		symlinkSync(join(root, 'outside.json'), join(root, 'styles', 'linked.json'));
		symlinkSync(join(root, 'styles'), join(root, 'styles', 'group', 'cycle'));

		const result = runChecker(root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /styles\/linked\.json.*symlink/);
		assert.match(result.stderr, /styles\/group\/cycle.*symlink/);
		assert.doesNotMatch(result.stderr, /outside\.json.*raw hex color/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('custom-template names are safe slugs and targets cannot traverse or symlink', () => {
	for (const kind of ['traversal', 'symlink']) {
		const root = mkdtempSync(join(tmpdir(), `contract-template-${kind}-`));
		try {
			fixtureTheme(root);
			const name = kind === 'traversal' ? '../outside' : 'page-linked';
			writeFileSync(join(root, 'theme.json'), JSON.stringify({
				version: 3,
				customTemplates: [{ name, title: 'Unsafe' }],
				settings: { typography: { fluid: true, fontSizes: [] } },
			}));
			writeFileSync(join(root, 'outside.html'), '<!-- wp:paragraph /-->');
			if (kind === 'symlink') symlinkSync(join(root, 'outside.html'), join(root, 'templates', 'page-linked.html'));
			const result = runChecker(root);
			assert.equal(result.status, 1, `${kind} custom template must fail closed`);
			assert.match(result.stderr, kind === 'traversal' ? /safe slug/ : /symlink/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

test('a regular custom-template file reached through an escaping templates directory is rejected', () => {
	const base = mkdtempSync(join(tmpdir(), 'contract-template-contained-'));
	const root = join(base, 'theme');
	const outside = join(base, 'outside-templates');
	try {
		fixtureTheme(root);
		rmSync(join(root, 'templates'), { recursive: true, force: true });
		mkdirSync(outside);
		writeFileSync(join(outside, 'front-page.html'), WIRING);
		writeFileSync(join(outside, 'page-wide.html'), '<!-- wp:paragraph /-->');
		symlinkSync(outside, join(root, 'templates'));
		writeFileSync(join(root, 'theme.json'), JSON.stringify({
			version: 3,
			customTemplates: [{ name: 'page-wide', title: 'Wide' }],
			settings: { typography: { fluid: true, fontSizes: [] } },
		}));
		const result = runChecker(root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /page-wide.*not contained/);
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test('malformed style variations are reported by the parsed checker', () => {
	const root = mkdtempSync(join(tmpdir(), 'contract-variation-json-'));
	try {
		fixtureTheme(root);
		mkdirSync(join(root, 'styles'));
		writeFileSync(join(root, 'styles', 'broken.json'), '{ invalid');
		const result = runChecker(root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /styles\/broken\.json.*does not parse/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
