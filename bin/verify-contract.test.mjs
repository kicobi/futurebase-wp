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
import { parseBlocks, collect, collectPatternSlugs, checkRawValues, checkThemeStyleValues, checkTemplateWiring, checkPageComposition, checkFluidTypography, checkCustomTemplates, checkThemePaths } from './verify-contract.mjs';

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

test('decoded block CSS ignores comments and strings but scans the effective tokens around them', () => {
	const block = (css) => {
		const markup = `<!-- wp:group ${JSON.stringify({ style: { css } })} /-->`;
		assert.equal(parseBlocks(markup).blocks[0].malformed, undefined);
		return raw(markup);
	};
	assert.deepEqual(block('.x{/* old 2rem */color:var(--token)}'), []);
	assert.ok(block('.x{/* url( */padding:2rem}').some((problem) => problem.includes('2rem')));
	assert.ok(block('.x{content:"url(";padding:2rem}').some((problem) => problem.includes('2rem')));
	assert.ok(block(String.raw`.x{color:r\67 b(1 2 3)}`).some((problem) => problem.includes('color function')));
	assert.deepEqual(block('.x{background:url/**/("/assets/2rem.svg")}'), []);
});

test('whole-source CSS tokenization preserves physical lines and scoped core exemptions', () => {
	const coverAndRaw = '<div class="wp-block-cover" style="min-height:50vh"></div>\n<div style="min-height:2rem"></div>';
	assert.ok(raw(coverAndRaw).some((problem) => /:2:.*2rem/.test(problem)));
	const sameLine = '<div class="wp-block-cover" style="min-height:50vh"></div><div style="min-height:2rem"></div>';
	assert.ok(raw(sameLine).some((problem) => problem.includes('2rem')));
	assert.deepEqual(raw('<style>.x{background:url/*\n*/("/assets/2rem.svg")}</style>'), []);
	assert.ok(raw('<style>.x{content:"url(";padding:2rem}</style>').some((problem) => problem.includes('2rem')));
	assert.ok(raw('<div style="/* url( */padding:2rem"></div>').some((problem) => problem.includes('2rem')));
	assert.ok(raw('<div style="content:&quot;url(&quot;;padding:2rem"></div>').some((problem) => problem.includes('2rem')));

	const multiline = '<!-- wp:group {\n  "style": {\n    "css": "padding:2rem"\n  }\n} /-->';
	assert.equal(parseBlocks(multiline).blocks[0].malformed, undefined);
	assert.ok(raw(multiline).some((problem) => /:3:.*2rem/.test(problem)));
});

test('HTML and block URL attributes are not mistaken for CSS values', () => {
	assert.deepEqual(raw('<img src="/assets/2rem-#fff.svg"><a href="/docs/#abcdef">Docs</a>'), []);
	const image = `<!-- wp:image ${JSON.stringify({ url: '/assets/2rem-#fff.svg', alt: '' })} /-->`;
	assert.equal(parseBlocks(image).blocks[0].malformed, undefined);
	assert.deepEqual(raw(image), []);
});

test('style elements and PHP-produced inline CSS are scanned in CSS context', () => {
	assert.ok(
		raw('<style>[data-label="url("]{padding:2rem}</style>').some((problem) => problem.includes('2rem')),
		'a valid selector string must not make url( consume the following declaration',
	);
	assert.ok(
		raw('<div style="<?php echo \'padding:2rem\'; ?>"></div>').some((problem) => problem.includes('2rem')),
		'CSS emitted by a PHP string inside a style attribute remains contract-visible',
	);
	assert.ok(
		raw('<style nonce="<?php echo esc_attr( $nonce ); ?>">\n.x { padding: 2rem; }\n</style>').some((problem) => /:2:.*2rem/.test(problem)),
		'a PHP close tag inside an opening attribute must not terminate the style tag',
	);
	assert.deepEqual(
		raw('<style itemscope itemid=".x{padding:2rem}"\n>.x{padding:2rem}</style>'),
		['patterns/_probe.php:2: raw length "2rem" — every value resolves to a theme.json preset'],
		'the body offset must not collide with identical text in a URL-valued opening attribute',
	);
	assert.ok(
		raw('<style nonce="<?php $probe = \'?>\'; ?>">\n.x{padding:2rem}\n</style>').some((problem) => /:2:.*2rem/.test(problem)),
		'a legal PHP string containing the close-tag text must not truncate a style opening tag',
	);
	assert.ok(
		raw('<style nonce="<?php #[Marker(\'?>\')] function contract_probe() {} ?>">\n.x{padding:2rem}\n</style>').some((problem) => /:2:.*2rem/.test(problem)),
		'a PHP 8 attribute is not a hash comment and quoted close-tag text inside it is inert',
	);
	assert.ok(
		raw('<style nonce="<?php #[Marker("?>")] function contract_probe_double() {} ?>">\n.x{padding:2rem}\n</style>').some((problem) => /:2:.*2rem/.test(problem)),
		'PHP attribute strings may use the same quote character as their HTML container',
	);
});

test('malformed block attributes fail closed instead of masking their raw values', () => {
	const markup = '<!-- wp:group {"style":{"spacing":{"padding":"2rem",}}} /-->';
	assert.equal(parseBlocks(markup).blocks[0].malformed, true, 'the fixture must reach the malformed-JSON path');
	assert.ok(
		raw(markup).some((problem) => problem.includes('malformed block attributes')),
		'an unparseable delimiter cannot be omitted from the contract result',
	);
	const dynamic = '<!-- wp:navigation {"ref":<?php echo (int) $nav->ID; ?>,"overlayMenu":"never"} /-->';
	assert.ok(
		raw(dynamic).every((problem) => !problem.includes('malformed block attributes')),
		'a PHP pattern may render a typed attribute into otherwise valid block JSON',
	);
	const dynamicWithRaw = '<!-- wp:navigation {"ref":<?php echo (int) $nav->ID; ?>,"style":{"spacing":{"padding":"2rem"}}} /-->';
	assert.ok(raw(dynamicWithRaw).some((problem) => problem.includes('2rem')), 'a dynamic scalar must not hide adjacent static values');
	const dynamicAndMalformed = '<!-- wp:navigation {"ref":<?php echo (int) $nav->ID; ?>,"style":{"spacing":{"padding":"2rem"}},} /-->';
	assert.ok(raw(dynamicAndMalformed).some((problem) => problem.includes('malformed block attributes')), 'PHP must not excuse unrelated malformed JSON');
	const dynamicAfterUnicode = '<!-- wp:navigation {"label":"😀","ref":<?php echo (int) $nav->ID; ?>,"style":{"spacing":{"padding":"2rem"}}} /-->';
	assert.ok(raw(dynamicAfterUnicode).some((problem) => problem.includes('2rem')), 'PHP neutralization preserves UTF-16 source offsets after non-BMP text');
	assert.ok(raw(dynamicAfterUnicode).every((problem) => !problem.includes('malformed block attributes')));
	const dynamicWithCloseText = '<!-- wp:group {"label":"<?php echo \'?>\'; ?>","style":{"spacing":{"padding":"2rem"}}} /-->';
	assert.ok(raw(dynamicWithCloseText).some((problem) => problem.includes('2rem')), 'quoted PHP close-tag text must not corrupt dynamic block JSON');
	assert.ok(raw(dynamicWithCloseText).every((problem) => !problem.includes('malformed block attributes')));
});

test('the cover min-height exemption requires the exact class token', () => {
	assert.deepEqual(raw('<div class="wp-block-cover" style="min-height:50vh"></div>'), []);
	for (const markup of [
		'<div class="wp-block-cover-extra" style="min-height:2rem"></div>',
		'<div class="not-wp-block-cover" style="min-height:2rem"></div>',
		'<div data-class="wp-block-cover" style="min-height:2rem"></div>',
		'<div data-template=\' class="wp-block-cover" \' style="min-height:2rem"></div>',
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('2rem')), markup);
	}
	for (const markup of [
		'<div class="wp-block-cover" style="min-height:50vh;min-height:2rem"></div>',
		'<div class="wp-block-cover" style="--min-height:2rem"></div>',
		'<div class="wp-block-spacer" style="min-height:50px"></div>',
	]) {
		assert.ok(raw(markup).length > 0, `only the exact generated declaration may be exempt: ${markup}`);
	}
	assert.deepEqual(raw('<div class="wp-block-cover" style="/* core: generated */ min-height:50vh"></div>'), [], 'CSS comments do not change the generated declaration name or value');
});

test('escaped CSS hash-token colors are rejected in markup, block CSS, and theme styles', () => {
	const escaped = String.raw`#\66 ff`;
	assert.ok(raw(`<style>.x{color:${escaped}}</style>`).some((problem) => problem.includes('hex color')));
	const block = `<!-- wp:group ${JSON.stringify({ style: { css: `.x{color:${escaped}}` } })} /-->`;
	assert.ok(raw(block).some((problem) => problem.includes('hex color')));
	assert.ok(checkThemeStyleValues({ styles: { color: { text: escaped } } }).some((problem) => problem.includes('hex color')));
	for (const css of [
		'#\\66\r\nff',
		'2r\\65\r\nm',
		'r\\67\r\nb(1 2 3)',
	]) {
		assert.ok(raw(`<style>.x{--probe:${css}}</style>`).length > 0, `CRLF-normalized CSS escape must be scanned: ${JSON.stringify(css)}`);
	}
});

test('standard HTML and SVG URL attributes remain outside CSS-value checks', () => {
	for (const markup of [
		'<img src="diagram.png" usemap="#fff"><map name="fff"></map>',
		'<svg><use xlink:href="/sprite.svg#fff"></use></svg>',
		'<svg><linearGradient href="/assets/2rem.svg#fff"></linearGradient></svg>',
		'<svg><radialGradient xlink:href="/assets/2rem.svg#fff"></radialGradient></svg>',
		'<svg><pattern href="/assets/2rem.svg#fff"></pattern><mpath href="/assets/2rem.svg#fff"></mpath><textPath href="/assets/2rem.svg#fff"></textPath></svg>',
		'<link rel="preload" imagesrcset="/assets/2rem.png 1x">',
		'<img src=/assets/2rem-#fff.svg>',
		'<a href=#fff>Map target</a>',
		'<img src=2rem.png>',
		'<img lowsrc="/assets/2rem.jpg">',
	]) {
		assert.deepEqual(raw(markup), [], markup);
	}
	assert.ok(raw('<div data-href="#fff"></div>').some((problem) => problem.includes('hex color')), 'URL classification must use an exact attribute name');
	assert.ok(raw('<div href="#fff"></div>').some((problem) => problem.includes('hex color')), 'URL classification must also use the element context');
	assert.ok(raw('<div data="2rem"></div>').some((problem) => problem.includes('2rem')), 'element-specific URL names are not global exemptions');
	for (const integrationPoint of ['desc', 'title']) {
		const markup = `<svg><${integrationPoint}><script href="/2rem#fff"></script></${integrationPoint}></svg>`;
		assert.ok(raw(markup).some((problem) => problem.includes('2rem')), `SVG ${integrationPoint} children re-enter the HTML namespace`);
	}
	const urlArray = '<!-- wp:acme/card {"url":["/assets/2rem.svg","#fff"]} /-->';
	assert.deepEqual(raw(urlArray), [], 'array items inherit their URL-valued block attribute key');
	assert.ok(raw('<!-- wp:image {"width":["600px"]} /-->').some((problem) => problem.includes('600px')), 'the core image width exception applies only to the direct scalar property');
	assert.ok(raw('<!-- wp:image {"style":{"width":"600px"}} /-->').some((problem) => problem.includes('600px')), 'the core image width exception applies only at the block root');
});

test('SVG anchor ping remains a URL-token-list attribute', () => {
	assert.deepEqual(raw('<svg><a href="/" ping="/telemetry/2rem#fff">link</a></svg>'), []);
});

test('HTML foreign-content breakout tags pop the SVG namespace', () => {
	assert.ok(raw('<svg><div><script href="2rem#fff"></script></div></svg>').some((problem) => problem.includes('2rem')));
});

test('mismatched foreign-content end tags cannot escape an HTML integration point', () => {
	for (const markup of [
		'<svg><foreignObject><div></foreignObject><script href="2rem#fff"></script>',
		'<svg><g></p><script href="2rem#fff"></script>',
		'<svg><g></br><script href="2rem#fff"></script>',
		'<svg><foreignObject></svg></foreignObject><script href="2rem#fff"></script>',
		'<svg><desc></svg></desc><script href="2rem#fff"></script>',
		'<svg><foreignObject><div><svg><g></foreignObject></div><script href="2rem#fff"></script>',
	]) {
		const problems = raw(markup);
		assert.ok(problems.some((problem) => problem.includes('2rem')), markup);
		assert.ok(problems.some((problem) => problem.includes('#fff')), markup);
	}
});

test('PHP-emitted conditional font attributes pop the SVG namespace', () => {
	const problems = raw('<svg><font <?php echo \'color="red"\'; ?>><script href="2rem#fff"></script></font></svg>');
	assert.ok(problems.some((problem) => problem.includes('2rem')));
	assert.ok(problems.some((problem) => problem.includes('#fff')));
});

test('PHP-emitted SVG font attributes are parsed as exact complete names', () => {
	for (const markup of [
		'<svg><font <?php echo \'col\'; ?>or="red"><script href="2rem#fff"></script></font></svg>',
		'<svg><font <?php echo \'color\'; ?>><script href="2rem#fff"></script></font></svg>',
	]) {
		const problems = raw(markup);
		assert.ok(problems.some((problem) => problem.includes('2rem')), markup);
		assert.ok(problems.some((problem) => problem.includes('#fff')), markup);
	}
	assert.deepEqual(
		raw('<svg><font <?php echo \'data-color="red"\'; ?>><script href="2rem#fff"></script></font></svg>'),
		[],
		'an emitted data-color attribute is not the conditional SVG font color attribute',
	);
});

test('PHP inside an SVG font attribute name does not truncate the reconstructed tag', () => {
	for (const markup of [
		'<svg><font co<?php echo \'lo\'; ?>r><script href="2rem#fff"></script></font></svg>',
		'<svg><font co<?= \'l\' ?><?php echo \'or\'; ?>><script href="2rem#fff"></script></font></svg>',
	]) {
		const problems = raw(markup);
		assert.ok(problems.some((problem) => problem.includes('2rem')), markup);
		assert.ok(problems.some((problem) => problem.includes('#fff')), markup);
	}
});

test('PHP-emitted quotes can terminate an SVG font attribute before a conditional name', () => {
	const markup = `<svg><font data-x="<?php echo '"'; ?> color><script href="2rem#fff"></script></font></svg>`;
	const problems = raw(markup);
	assert.ok(problems.some((problem) => problem.includes('2rem')));
	assert.ok(problems.some((problem) => problem.includes('#fff')));
});

test('SVG font reconstruction follows HTML unquoted values and PHP-emitted tag boundaries', () => {
	const unquoted = `<svg><font data-x=a<?php echo '"'; ?> color><script href="2rem#fff"></script></font></svg>`;
	const problems = raw(unquoted);
	assert.ok(problems.some((problem) => problem.includes('2rem')));
	assert.ok(problems.some((problem) => problem.includes('#fff')));
	assert.deepEqual(
		raw(`<svg><font <?php echo '>'; ?><script href="2rem#fff"></script></font></svg>`),
		[],
		'a PHP-emitted tag close resumes before the child start tag, which remains SVG',
	);
});

test('markup emitted after a PHP tag close still updates the HTML namespace', () => {
	for (const markup of [
		'<svg><font <?php echo "><div>"; ?><script href="2rem#fff"></script></div></font></svg>',
		'<svg><font <?php echo ">"; ?><?php echo "<div>"; ?><script href="2rem#fff"></script></div></font></svg>',
	]) {
		const problems = raw(markup);
		assert.ok(problems.some((problem) => problem.includes('2rem')), markup);
		assert.ok(problems.some((problem) => problem.includes('#fff')), markup);
	}
});

test('post-quoted SVG font attribute syntax follows HTML reconsume rules', () => {
	assert.deepEqual(
		raw('<svg><font data-x="x"<?php echo \'=">\'; ?><script href="2rem#fff"></script></font></svg>'),
		[],
	);
});

test('post-quoted equals signs remain part of HTML attribute names', () => {
	const font = raw('<svg><font data-x="x"<?php echo \'= color\'; ?>><script href="2rem#fff"></script></font></svg>');
	assert.ok(font.some((problem) => problem.includes('2rem')));
	assert.ok(font.some((problem) => problem.includes('#fff')));

	const script = raw('<svg><script data-x="x"<?php echo \'=href="2rem#fff"\'; ?>></script></svg>');
	assert.ok(script.some((problem) => problem.includes('2rem')));
	assert.ok(script.some((problem) => problem.includes('#fff')));
});

test('self-closing syntax is ignored after an SVG font breakout enters HTML', () => {
	const problems = raw('<svg><font <?php echo \'color/>\'; ?><svg></font><script href="2rem#fff"></script></svg>');
	assert.ok(problems.some((problem) => problem.includes('2rem')));
	assert.ok(problems.some((problem) => problem.includes('#fff')));
});

test('PHP output is reconstructed inside its surrounding CSS and URL context', () => {
	assert.deepEqual(
		raw('<style>\n.x { background-image: url(<?php echo get_theme_file_uri( \'assets/2rem.svg\' ); ?>); }\n</style>'),
		[],
		'a PHP URL fragment is still inside url(), not standalone CSS',
	);
	assert.deepEqual(raw('<style><?php $example = \'2rem\'; ?>.x{padding:var(--token)}</style>'), [], 'a non-output PHP string emits no CSS');
	assert.deepEqual(raw(`<style><?php $unused = <<<'CSS'
?> .x{padding:2rem}
CSS; ?>.x{padding:var(--token)}</style>`), [], 'a PHP close tag inside a non-output nowdoc does not end the PHP span');
	assert.deepEqual(raw('<div><?php $example = \'2rem\'; ?></div>'), [], 'PHP outside a CSS context is not CSS');
	assert.ok(raw('<div style="<?php echo \'padding:\' . \'2rem\'; ?>"></div>').some((problem) => problem.includes('2rem')), 'concatenated emitted strings are scanned as their rendered CSS');
	for (const markup of [
		'<style>.x{padding:<?php echo "2"; echo "rem"; ?>}</style>',
		'<style><?php echo ".x{padding:2", "rem}"; ?></style>',
		String.raw`<style><?php echo '.x{padding:2r\65 m}'; ?></style>`,
		'<style>.x{padding:<?php echo 2, "rem"; ?>}</style>',
		String.raw`<style><?php echo ".x{padding:\u{32}rem}"; ?></style>`,
	]) {
		assert.ok(raw(markup).length > 0, `every literal PHP echo form contributes in render order: ${markup}`);
	}
	assert.deepEqual(
		raw('<style><?php echo /* ".x{padding:2rem}" */ ".x{padding:var(--space)}"; ?></style>'),
		[],
		'comments inside an echo expression do not produce CSS',
	);
	assert.deepEqual(raw('<style><?php $echo = ".x{padding:2rem}"; ?>.x{padding:var(--space)}</style>'), [], 'a variable named echo is not an output statement');
	assert.deepEqual(raw('<style><?php $renderer->echo(".x{padding:2rem}"); ?>.x{padding:var(--space)}</style>'), [], 'a method named echo is not an output statement');
	assert.deepEqual(raw('<style><?php #[Echo(".x{padding:2rem}")] function contract_probe_attribute_name() {} ?>.x{padding:var(--space)}</style>'), [], 'an attribute class named Echo is not an output statement');
	assert.ok(raw('<style><?php #[Marker] function contract_probe_output() {} echo ".x{padding:2rem}"; ?></style>').some((problem) => problem.includes('2rem')), 'a PHP attribute does not hide a later echo statement');
	assert.ok(raw('<style><?php contract_probe_label: print ".x{padding:2rem}"; ?></style>').some((problem) => problem.includes('2rem')), 'a statement label is not static member access');
	assert.ok(
		raw('<style><?php $a = ["?>" => "x"]; $x = "{$a["?>"]}"; echo ".x{padding:2rem}"; ?></style>').some((problem) => problem.includes('2rem')),
		'quoted array keys inside complex interpolation do not terminate the PHP span',
	);
});

test('PHP numeric bases, print, heredoc, and nowdoc cannot bypass rendered CSS checks', () => {
	for (const markup of [
		'<style>.x{padding:<?php echo 0x20, "rem"; ?>}</style>',
		'<style>.x{padding:<?php echo 0b10, "rem"; ?>}</style>',
		'<style>.x{padding:<?php echo 0o20, "rem"; ?>}</style>',
		'<style><?php print ".x{padding:2rem}"; ?></style>',
		`<style><?php echo <<<CSS
.x{padding:2rem}
CSS; ?></style>`,
		String.raw`<style><?php echo <<<CSS
.x{padding:\u{32}rem}
CSS; ?></style>`,
		`<style><?php echo <<<'CSS'
.x{padding:2rem}
CSS; ?></style>`,
		String.raw`<style><?php echo ".x{color:\443fff}"; ?></style>`,
	]) {
		assert.ok(raw(markup).length > 0, `every statically rendered PHP form is scanned: ${markup}`);
	}
});

test('oversized integer literals retain a float boundary when echoed', () => {
	for (const markup of [
		'<style><?php echo "a", 9223372036854775808, "rem"; ?></style>',
		'<style><?php echo "a", 0xffffffffffffffff, "rem"; ?></style>',
	]) {
		assert.ok(raw(markup).length > 0, markup);
	}
});

test('complex interpolation cannot hide an adjacent raw value', () => {
	for (const markup of [
		'<style><?php $value = ["?>" => ""]; echo "{$value["?>"]}2rem"; ?></style>',
		'<style><?php $name = "empty"; $empty = ""; echo "${$name}2rem"; ?></style>',
		`<style><?php $value = ["?>" => ""]; echo <<<CSS
{$value["?>"]}2rem
CSS; ?></style>`,
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('2rem')), markup);
	}
});

test('printf output is rendered without pulling dynamic URL arguments out of context', () => {
	for (const markup of [
		'<style><?php printf(".x{padding:2rem}"); ?></style>',
		'<style><?php printf(".x{padding:%s}", "2rem"); ?></style>',
		'<style><?php printf(".x{padding:%1$s}", "2rem"); ?></style>',
		'<style><?php printf(".x{padding:%*srem}", 1, "2"); ?></style>',
		'<style><?php printf(".x{padding:%.1srem}", "2rem"); ?></style>',
		'<style><?php printf(".x{padding:%srem}", -2); ?></style>',
	]) {
		assert.ok(raw(markup).length > 0, `static printf output is scanned: ${markup}`);
	}
	assert.deepEqual(
		raw('<style><?php printf(".x{background:url(%s)}", get_theme_file_uri("assets/2rem.svg")); ?></style>'),
		[],
		'a dynamic URL argument remains inside the format string URL context',
	);
});

test('printf nested in echo keeps dynamic URL arguments inside url()', () => {
	assert.deepEqual(
		raw('<style><?php echo printf(".x{background:url(%s)}", get_theme_file_uri("assets/2rem.svg")); ?></style>'),
		[],
	);
});

test('nested printf side effects retain PHP evaluation order', () => {
	for (const markup of [
		'<style><?php echo ".x{background:url(" . printf("2rem") . ")}"; ?></style>',
		'<style><?php print ".x{background:url(" . printf("2rem") . ")}"; ?></style>',
		'<style><?= ".x{background:url(" . printf("2rem") . ")}" ?></style>',
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('2rem')), markup);
	}
});

test('comma-separated echo operands interleave nested printf side effects', () => {
	assert.ok(
		raw('<style><?php echo "x", printf("url(2rem)"); ?></style>')
			.some((problem) => problem.includes('2rem')),
	);
});

test('printf recursively emits nested printf argument side effects', () => {
	const problems = raw('<style><?php printf("%s%s", printf("2rem;"), printf("#fff;")); ?></style>');
	assert.ok(problems.some((problem) => problem.includes('2rem')));
	assert.ok(problems.some((problem) => problem.includes('#fff')));
});

test('dynamic printf output does not lend its placeholder length to the return value', () => {
	assert.ok(
		raw('<style><?php $value = ";"; echo printf("%s", $value) . "rem"; ?></style>')
			.some((problem) => problem.includes('1rem')),
	);
});

test('printf string width and return counts use PHP byte lengths', () => {
	const problems = raw('<style><?php echo printf("%3s;", "é") . "rem"; ?></style>');
	assert.ok(problems.some((problem) => problem.includes('4rem')));
	assert.ok(problems.every((problem) => !problem.includes('5rem')));
});

test('printf supports positional star width and precision selectors', () => {
	for (const markup of [
		'<style><?php printf(\'%2$*1$srem\', 1, \'2\'); ?></style>',
		'<style><?php printf(\'%2$.*1$srem\', 1, \'2x\'); ?></style>',
		'<style><?php printf(\'%3$*1$.*2$srem\', 1, 1, \'2x\'); ?></style>',
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('2rem')), markup);
	}
});

test('unknown printf string precision preserves truncation-sensitive CSS boundaries', () => {
	assert.ok(
		raw('<style><?php $precision = 1; printf("%.*srem", $precision, "2x"); ?></style>').length > 0,
	);
});

test('printf keeps byte-split precision counts through nested formatting', () => {
	assert.ok(
		raw('<style><?php printf("%.*s", printf("%3.1s;", "é"), "2remXX"); ?></style>')
			.some((problem) => problem.includes('2rem')),
	);
});

test('PHP hex and octal byte escapes keep byte counts through nested formatting', () => {
	for (const markup of [
		String.raw`<style><?php printf("%.*s", printf("%s;", "\xC3\xA9"), "2pxZZ"); ?></style>`,
		String.raw`<style><?php printf("%.*s", printf("%s;", "\303\251"), "2pxZZ"); ?></style>`,
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('2px')), markup);
	}
});

test('heredoc and nowdoc output removes terminal newlines and closing indentation', () => {
	for (const opener of ["<<<'TXT'", '<<<TXT']) {
		const terminal = `<style><?php printf("%srem", ${opener}
2
TXT); ?></style>`;
		assert.ok(raw(terminal).some((problem) => problem.includes('2rem')), opener);
		const indented = `<style><?php printf("%srem", ${opener}
    2
    TXT); ?></style>`;
		assert.ok(raw(indented).some((problem) => problem.includes('2rem')), `${opener} indentation`);
	}
});

test('printf %c output keeps PHP byte counts through nested formatting', () => {
	assert.ok(
		raw('<style><?php printf("%.*s", printf("%c;%c;%c;%c;", 233, 233, 233, 233), ";;;;2remfoo"); ?></style>')
			.some((problem) => problem.includes('2rem')),
	);
});

test('printf %c coerces signed strings and large integers to one PHP byte', () => {
	for (const markup of [
		'<style><?php printf("%crem", "-206x"); ?></style>',
		'<style><?php printf("%crem", 9223372036854775602); ?></style>',
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('2rem')), markup);
	}
});

test('numeric printf conversions cannot hide adjacent CSS units', () => {
	assert.ok(
		raw('<style><?php printf("%drem", "2x"); ?></style>')
			.some((problem) => problem.includes('rem')),
	);
});

test('unknown numeric printf arguments fail closed beside CSS units', () => {
	for (const specifier of ['d', 'u', 'x', 'f']) {
		const markup = `<style><?php $value = 2; printf("%${specifier}rem", $value); ?></style>`;
		assert.ok(raw(markup).some((problem) => problem.includes('rem')), markup);
	}
});

test('numeric placeholders preserve raw-value token boundaries', () => {
	for (const markup of [
		'<style><?php $value = 2; printf("a%5drem", $value); ?></style>',
		'<style><?php printf("a%frem", 2); ?></style>',
		'<style><?php echo printf("a%f", 2) . "rem"; ?></style>',
	]) {
		assert.ok(raw(markup).length > 0, markup);
	}
});

test('left-aligned non-exact printf values preserve width-overflow boundaries', () => {
	for (const markup of [
		'<style><?php $value = 123456; printf("%-5drem", $value); ?></style>',
		'<style><?php printf("%-5srem", 9223372036854775808); ?></style>',
		'<style><?php printf("%-5frem", 2); ?></style>',
	]) {
		assert.ok(raw(markup).length > 0, markup);
	}
});

test('printf applies zero padding with left alignment per conversion', () => {
	assert.ok(
		raw('<style><?php printf("%-05brem", 2); ?></style>')
			.some((problem) => problem.includes('10000rem')),
	);
});

test('printf precision and width behavior remains conversion-specific', () => {
	assert.deepEqual(raw('<style><?php printf("%.0brem", 2); ?></style>'), []);
	assert.ok(raw('<style><?php printf("%-03.0brem", 2); ?></style>').some((problem) => problem.includes('000rem')));
	assert.ok(raw('<style><?php printf("%-5crem", 50); ?></style>').some((problem) => problem.includes('2rem')));
});

test('known printf precision preserves raw-value boundaries for dynamic strings', () => {
	assert.ok(
		raw('<style><?php $value = "2x"; printf("%.1srem", $value); ?></style>')
			.some((problem) => problem.includes('rem')),
	);
});

test('deterministic integer precision preserves padding for dynamic values', () => {
	for (const format of ['%-05.1brem', '%-05.1orem', '%-05.1xrem', "%'05.1Xrem"]) {
		const markup = `<style><?php $value = 2; printf("${format}", $value); ?></style>`;
		assert.ok(raw(markup).some((problem) => problem.includes('00000rem')), markup);
	}
});

test('printf accepts PHP bare-dot precision directives', () => {
	for (const markup of [
		'<style><?php printf("%.drem", 2); ?></style>',
		'<style><?php printf("%.brem", 2); ?></style>',
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('rem')), markup);
	}
});

test('printf custom padding is distinct from alignment flags', () => {
	assert.ok(
		raw('<style><?php printf("%\'-5s", "2rem"); ?></style>')
			.some((problem) => problem.includes('-2rem')),
	);
});

test('printf signs and zero padding preserve PHP token boundaries', () => {
	assert.ok(raw('<style><?php printf("a%+drem", 2); ?></style>').some((problem) => problem.includes('+2rem')));
	assert.ok(raw('<style><?php printf("%05drem", -2); ?></style>').some((problem) => problem.includes('-0002rem')));
});

test('integer printf coercion follows PHP 8.4 signed 64-bit bounds', () => {
	assert.ok(
		raw('<style><?php printf("%drem", 9223372036854775808); ?></style>')
			.some((problem) => problem.includes('-9223372036854775808rem')),
	);
	assert.ok(
		raw('<style><?php printf("%drem", "9223372036854775808"); ?></style>')
			.some((problem) => problem.includes('9223372036854775807rem')),
	);
});

test('integer printf coercion preserves based-literal and concatenated-string origins', () => {
	for (const markup of [
		'<style><?php printf("a%20drem", 0xffffffffffffffff); ?></style>',
		'<style><?php printf("a%20drem", "1844674407370955161" . "6"); ?></style>',
	]) {
		assert.ok(raw(markup).length > 0, markup);
	}
});

test('overflowing based literals cannot determine printf padding or adjacency', () => {
	const binary = `0b1${'0'.repeat(63)}`;
	assert.ok(
		raw(`<style><?php printf("a%20drem", ${binary}); ?></style>`).length > 0,
	);
});

test('left-aligned numeric printf ignores zero padding', () => {
	assert.deepEqual(raw('<style><?php printf("%-05drem", -2); ?></style>'), []);
});

test('unary printf operand diagnostics retain the sign source line', () => {
	const problems = raw(`<style><?php printf("%05drem",
-2); ?></style>`);
	assert.ok(problems.some((problem) => /:2:.*-0002rem/.test(problem)), problems.join('\n'));
});

test('nested printf return diagnostics map to the callable line', () => {
	const problems = raw(`<style><?php echo
printf("%s", ";") . "rem"; ?></style>`);
	assert.ok(problems.some((problem) => /:2:.*1rem/.test(problem)), problems.join('\n'));
});

test('printf leading padding preserves the formatted value source line', () => {
	const problems = raw(`<style><?php printf("%10s", "
2rem"); ?></style>`);
	assert.ok(problems.some((problem) => /:2:.*2rem/.test(problem)), problems.join('\n'));
});

test('HTML character references are decoded before context and CSS checks', () => {
	assert.ok(raw('<div style="color:&#35;fff"></div>').some((problem) => problem.includes('#fff')));
	assert.ok(raw('<div style="color:&num;fff"></div>').some((problem) => problem.includes('#fff')));
	assert.ok(raw('<div style="color:&#35fff"></div>').some((problem) => problem.includes('#fff')), 'numeric references may omit their semicolon');
	assert.ok(raw('<div style="content:&quot;x&QUOT;;padding:2rem"></div>').some((problem) => problem.includes('2rem')), 'standard uppercase aliases are decoded with exact case');
	assert.ok(raw('<div style="/*safe&ast;&sol;padding:2rem"></div>').some((problem) => problem.includes('2rem')), 'syntax-forming named references cannot hide CSS after a comment');
	assert.ok(raw('<div style="content:&quot;x&QUOT/**/;padding:2rem"></div>').some((problem) => problem.includes('2rem')), 'legacy named references may omit a semicolon before punctuation');
	assert.deepEqual(raw('<meta content="0;url=/2rem.html#fff" http-equiv="&#114;efresh">'), []);
});

test('class tokenization uses HTML ASCII whitespace only', () => {
	for (const markup of [
		'<div class="wp-block-cover&nbsp;extra" style="min-height:2rem"></div>',
		'<div class="wp-block-cover&#8195;extra" style="min-height:2rem"></div>',
	]) {
		assert.ok(raw(markup).some((problem) => problem.includes('2rem')), markup);
	}
	assert.deepEqual(raw('<div class="wp-block-cover&Tab;extra" style="min-height:50vh"></div>'), []);
});

test('markup attribute diagnostics preserve UTF-16 source offsets', () => {
	assert.match(raw('<div data-probe="😀😀😀😀\n#fff"></div>')[0], /:2:/);
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
