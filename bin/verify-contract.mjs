#!/usr/bin/env node
// bin/verify-contract.mjs — the Technical Contract items that grep cannot decide.
//
// verify-theme.sh checked these with regular expressions, and the review found
// every one of them passing for the wrong reason:
//
//   item 3  blacklisted a handful of block names, so core/list, core/html and
//           any custom block wired straight into a template went unnoticed —
//           and nothing counted the pattern references, so a template could
//           compose three patterns and still "stay thin".
//   item 4  validated pattern filenames and headers but never looked at what
//           the page-level pattern composes.
//   item 7  matched `"fluid": true` anywhere in theme.json, including inside a
//           preset, and only examined rem-denominated sizes — a 32px preset
//           needs fluid just as much and was skipped.
//   item 9  parsed customTemplates with an AWK state machine that read compact
//           JSON as "no templates declared", passing by finding nothing.
//
// A blacklist answers "is this one of the bad things I thought of". A parse
// answers "is this the shape the contract requires". Everything here is the
// second kind, and bin/verify-contract.test.mjs feeds each check markup that
// must fail so the checks cannot quietly stop checking.
//
// Slug-free by construction: the theme slug is read from style.css at runtime.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// --- block markup ------------------------------------------------------------

// Block delimiters: `<!-- wp:name {json} -->`, the self-closing `/-->` form,
// and `<!-- /wp:name -->`. An unnamespaced name means core.
const BLOCK_RE = /<!--\s*(\/?)wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(\s+(\{[\s\S]*?\}))?\s*(\/)?-->/g;

// Block occurrences with nesting depth, plus whatever does not balance. Depth
// separates "the template wires a pattern" from "the template contains a
// paragraph that happens to sit inside a pattern's own markup".
//
// Balance is reported rather than silently
// clamped: an unclosed group made every following block look nested, so a
// template missing its header and footer entirely still presented one pattern
// at the right depth and passed. A parser that cannot say "this markup is
// broken" is only checking the markup it happens to understand.
export function parseBlocks(html) {
	const blocks = [];
	const open = [];
	const unbalanced = [];
	for (const m of html.matchAll(BLOCK_RE)) {
		const [, closing, rawName, , json, selfClose] = m;
		const name = rawName.includes('/') ? rawName : `core/${rawName}`;
		if (closing) {
			if (!open.length) unbalanced.push(`closing wp:${name} with nothing open`);
			else if (open.at(-1) !== name) unbalanced.push(`closing wp:${name} while wp:${open.at(-1)} is open`);
			else open.pop();
			continue;
		}
		let attrs = {};
		let malformed = false;
		if (json) {
			try {
				attrs = JSON.parse(json);
			} catch {
				malformed = true;
			}
		}
		blocks.push({ name, attrs, depth: open.length, ...(malformed ? { malformed } : {}) });
		if (!selfClose && !malformed) open.push(name);
	}
	for (const name of open) unbalanced.push(`wp:${name} is never closed`);
	return { blocks, unbalanced };
}

// Every pattern slug the theme actually registers, read from the `Slug:` header
// of each patterns/*.php. A reference to a pattern that does not exist renders
// as nothing at all — the page silently loses a section — and the old check
// had no way to notice.
// Visible text that sits outside every block.
//
// parseBlocks only sees delimiters, so raw markup between them was invisible: a
// template or page-level pattern could carry a hardcoded <h1> and every check
// still returned an empty problem list. Tags are stripped before the test
// because a group legitimately serializes its own <main> wrapper into the
// template — it is the TEXT that indicates content, and content belongs in a
// pattern.
export function residualText(html) {
	return String(html)
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&[a-z]+;|&#\d+;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function collectPatternSlugs(files) {
	const slugs = new Set();
	for (const { contents } of files) {
		const m = /^\s*\*\s*Slug:\s*(\S+)\s*$/im.exec(contents);
		if (m) slugs.add(m[1]);
	}
	return slugs;
}

// --- item 1: tokens first ----------------------------------------------------

// Commentary, blanked so line numbers survive. Everything else is scanned —
// including block delimiters, which is the whole point.
//
// The bash gate this replaces skipped every line beginning `<!--`. That is
// exactly how Gutenberg serializes a block delimiter, so
// `<!-- wp:paragraph {"style":{"color":{"text":"#ff0000"}}} --><p>…</p>` was
// discarded whole — attributes and inline HTML together — whenever the
// delimiter shared a line with its saved markup, which is the normal
// serialization for a simple block. The exclusion existed for the file-header
// comments at the top of templates/front-page.html and parts/footer.html, and a
// line-prefix test cannot tell those from a block.
const blankOut = (match) => match.replace(/[^\n]/g, ' ');

export function scannableSource(source) {
	return String(source)
		.replace(/\/\*[\s\S]*?\*\//g, blankOut)
		.replace(/<!--(?!\s*\/?wp:)[\s\S]*?-->/g, blankOut);
}

// Tolerated because core's own blocks serialize them and the theme cannot say it
// otherwise: an image width attribute, and a spacer's height.
const TOLERATED = [/"width":"\d+px"/, /<div style="height:\s*\d+px"/];

const RAW_VALUE_RULES = [
	['hex color', /#[0-9a-fA-F]{3,8}\b/],
	['rgb()/rgba()', /\brgba?\([^)]*\)/],
	['px value', /\b\d+px\b/],
	['rem value', /\b\d+(?:\.\d+)?rem\b/],
];

export function checkRawValues(files) {
	const problems = [];
	for (const { file, contents } of files) {
		const lines = scannableSource(contents).split('\n');
		lines.forEach((line, index) => {
			if (TOLERATED.some((re) => re.test(line))) return;
			for (const [label, re] of RAW_VALUE_RULES) {
				const hit = line.match(re);
				if (hit) problems.push(`${file}:${index + 1}: raw ${label} "${hit[0]}" — every value resolves to a theme.json preset`);
			}
		});
	}
	return problems;
}

// --- item 3: templates wire --------------------------------------------------

// A whitelist, deliberately. The contract says a template is a header part, a
// main wrapper, one pattern reference and a footer part — so anything else is a
// violation whether or not anyone predicted it.
const WIRING_BLOCKS = new Set(['core/template-part', 'core/group', 'core/pattern']);

export function checkTemplateWiring(html, { file = 'templates/front-page.html', knownPatterns = null } = {}) {
	const problems = [];
	const { blocks, unbalanced } = parseBlocks(html);

	for (const u of unbalanced) problems.push(`${file}: ${u}`);

	for (const b of blocks) {
		if (b.malformed) {
			problems.push(`${file}: malformed block attributes on wp:${b.name}`);
			continue;
		}
		if (!WIRING_BLOCKS.has(b.name)) {
			problems.push(`${file}: contains ${b.name} — templates wire, patterns compose (move it into a pattern)`);
		}
	}

	// The contract names the shape, so assert the shape. Counting patterns
	// alone let a template with no header, no footer and an unclosed group
	// through, because the one thing being counted was still there.
	const roots = blocks.filter((b) => b.depth === 0);
	const shape = roots.map((b) => b.name).join(' → ');
	const expected = 'core/template-part → core/group → core/template-part';
	if (shape !== expected) {
		problems.push(`${file}: top level is "${shape || 'empty'}" — a template is header part, main, footer part ("${expected}")`);
	} else {
		if (roots[0].attrs.slug !== 'header') problems.push(`${file}: first template-part is "${roots[0].attrs.slug ?? '?'}", expected "header"`);
		if (roots[2].attrs.slug !== 'footer') problems.push(`${file}: last template-part is "${roots[2].attrs.slug ?? '?'}", expected "footer"`);
		if (roots[1].attrs.tagName !== 'main') problems.push(`${file}: the middle group must be tagName "main" (found "${roots[1].attrs.tagName ?? 'div'}")`);
	}

	const patterns = blocks.filter((b) => b.name === 'core/pattern');
	if (patterns.length === 0) problems.push(`${file}: references no pattern — the page body belongs in one`);
	if (patterns.length > 1) {
		problems.push(`${file}: references ${patterns.length} patterns (${patterns.map((p) => p.attrs.slug ?? '?').join(', ')}) — a template wires ONE page-level pattern`);
	}
	for (const p of patterns) {
		// A reference with no slug renders as nothing, and missingPattern() cannot
		// speak about a slug it was not given — so the absence has to be named
		// here or an empty <!-- wp:pattern /--> passes every check.
		if (!p.attrs.slug) problems.push(`${file}: a wp:pattern reference has no slug — it renders as nothing`);
	}
	for (const p of patterns) problems.push(...missingPattern(p.attrs.slug, knownPatterns, file));

	// Inside main there is exactly one child: the page-level pattern. An extra
	// wrapper group passed because core/group is a legal WIRING block and nesting
	// left the root shape untouched — but layout inside a template is layout the
	// pattern should own.
	const nested = blocks.filter((b) => b.depth > 0);
	const extra = nested.filter((b) => b.name !== 'core/pattern');
	if (extra.length) {
		problems.push(`${file}: main wraps ${extra.map((b) => b.name).join(', ')} around the pattern — a template wires, it does not lay out`);
	}

	const residue = residualText(html);
	if (residue) problems.push(`${file}: carries hardcoded content ("${residue.slice(0, 60)}") — content belongs in a pattern`);

	return problems;
}

// A reference to a pattern nobody registers renders as nothing. Checked only
// when the caller supplies the registry, so the rule stays testable in isolation.
function missingPattern(slug, knownPatterns, file) {
	if (!knownPatterns || !slug) return [];
	return knownPatterns.has(slug) ? [] : [`${file}: references pattern '${slug}', which no patterns/*.php registers`];
}

// --- item 4: page-level patterns compose section patterns --------------------

export function checkPageComposition(php, themeSlug, { file = 'patterns/home.php', knownPatterns = null } = {}) {
	const problems = [];
	const { blocks, unbalanced } = parseBlocks(php);
	for (const u of unbalanced) problems.push(`${file}: ${u}`);
	if (!blocks.length) {
		problems.push(`${file}: composes nothing`);
		return problems;
	}
	for (const b of blocks) {
		if (b.name !== 'core/pattern') {
			problems.push(`${file}: contains ${b.name} — a page-level pattern composes section patterns, it does not carry content`);
			continue;
		}
		// The FILE is patterns/_section-hero.php — the leading underscore keeps
		// it out of the inserter — but the registered slug it declares is
		// `<theme>/section-hero`. The slug is what a reference names.
		const slug = b.attrs.slug ?? '';
		if (!slug.startsWith(`${themeSlug}/`)) {
			problems.push(`${file}: references '${slug}', which is not a ${themeSlug}/ pattern`);
		} else if (!slug.startsWith(`${themeSlug}/section-`)) {
			problems.push(`${file}: references '${slug}' — page-level patterns compose section-* patterns only`);
		} else {
			problems.push(...missingPattern(slug, knownPatterns, file));
		}
	}

	const residue = residualText(php);
	if (residue) problems.push(`${file}: carries hardcoded content ("${residue.slice(0, 60)}") — a page-level pattern composes section patterns`);

	return problems;
}

// --- item 7: fluid typography ------------------------------------------------

// Anything larger than body scale needs a fluid range, whatever unit it is
// written in. 1rem is the boundary; 16px is the same size and was exempt only
// because the old check could not read it.
const REM_PX = 16;

function sizeInRem(size) {
	const rem = /^([\d.]+)rem$/.exec(size ?? '');
	if (rem) return parseFloat(rem[1]);
	const px = /^([\d.]+)px$/.exec(size ?? '');
	if (px) return parseFloat(px[1]) / REM_PX;
	return null; // em, %, clamp(), var() — unmeasurable; the caller reports it
}

export function checkFluidTypography(theme) {
	const problems = [];
	const typography = theme?.settings?.typography ?? {};

	// Exactly settings.typography.fluid, not "the string appears somewhere".
	if (typography.fluid !== true) {
		problems.push(`theme.json: settings.typography.fluid must be true (found ${JSON.stringify(typography.fluid ?? null)})`);
	}

	for (const preset of typography.fontSizes ?? []) {
		const rem = sizeInRem(preset.size);
		// A size the rule cannot measure used to be skipped, so a `2em` heading
		// escaped the fluid requirement entirely — the check reported OK because
		// it had quietly declined to look. If it cannot be measured it cannot be
		// held to the contract, so say that rather than passing it.
		if (rem === null) {
			problems.push(`theme.json: fontSize '${preset.slug}' is ${JSON.stringify(preset.size ?? null)} — sizes must be rem or px so the fluid rule can measure them`);
			continue;
		}
		if (rem <= 1) continue;
		if (!preset.fluid || typeof preset.fluid !== 'object') {
			problems.push(`theme.json: fontSize '${preset.slug}' is ${preset.size} (> 1rem) but declares no fluid { min, max }`);
			continue;
		}
		if (typeof preset.fluid.min !== 'string' || typeof preset.fluid.max !== 'string') {
			problems.push(`theme.json: fontSize '${preset.slug}' fluid must carry both min and max as strings`);
		}
	}
	return problems;
}

// --- item 9: custom templates exist ------------------------------------------

export function checkCustomTemplates(theme, hasTemplate) {
	const problems = [];
	const entries = theme?.customTemplates;
	if (entries === undefined) return problems;
	if (!Array.isArray(entries)) {
		problems.push('theme.json: customTemplates must be an array');
		return problems;
	}
	for (const entry of entries) {
		const name = entry?.name;
		if (typeof name !== 'string' || !name) {
			problems.push(`theme.json: customTemplates entry has no name (${JSON.stringify(entry)})`);
			continue;
		}
		if (!hasTemplate(name)) problems.push(`theme.json: customTemplate '${name}' has no templates/${name}.html`);
	}
	return problems;
}

// --- item 5: theme-path references -------------------------------------------

// What is genuinely decidable here. Whether a given image is editorial (and so
// belongs to an attachment) or a brand mark (and so belongs to the theme) is a
// judgement about the asset, not a property of the markup — docs/media-
// conventions.md owns that, and review enforces it. What a parser CAN say is
// that no markup hardcodes a path into the theme directory, in any of its forms.
// PHP function names are case-insensitive, and there is more than one way to
// reach the theme root: get_theme_root_uri() and the non-_uri path variants all
// hardcode the same thing and all passed. get_theme_file_uri() — the sanctioned
// call — is deliberately not matched.
const THEME_PATH_RE = /\/wp-content\/themes\/|get_(?:stylesheet|template)_directory(?:_uri)?\b|get_theme_root(?:_uri)?\b/i;

export function checkThemePaths(files) {
	const problems = [];
	for (const { file, contents } of files) {
		contents.split('\n').forEach((line, i) => {
			if (THEME_PATH_RE.test(line)) {
				problems.push(`${file}:${i + 1}: hardcoded theme path — use get_theme_file_uri() for brand marks, an attachment id for editorial imagery`);
			}
		});
	}
	return problems;
}

// --- CLI ---------------------------------------------------------------------

function themeSlugFrom(styleCss) {
	return /^Text Domain:\s*(\S+)\s*$/im.exec(styleCss)?.[1] ?? null;
}

function collect(dirs, root) {
	const out = [];
	for (const dir of dirs) {
		const abs = join(root, dir);
		if (!existsSync(abs)) continue;
		for (const name of readdirSync(abs)) {
			const path = join(abs, name);
			try {
				out.push({ file: `${dir}/${name}`, contents: readFileSync(path, 'utf8') });
			} catch {
				/* directories and unreadable entries are not markup */
			}
		}
	}
	return out;
}

function main() {
	const root = process.cwd();
	const problems = [];

	const stylePath = join(root, 'style.css');
	const themeSlug = existsSync(stylePath) ? themeSlugFrom(readFileSync(stylePath, 'utf8')) : null;
	if (!themeSlug) {
		console.error('verify-contract: style.css has no Text Domain header — cannot resolve the theme slug');
		process.exit(1);
	}

	const frontPage = join(root, 'templates', 'front-page.html');
	// The pattern registry, so a reference to something that does not exist is
	// caught here rather than by a section quietly missing from a rendered page.
	const knownPatterns = collectPatternSlugs(collect(['patterns'], root));

	if (existsSync(frontPage)) problems.push(...checkTemplateWiring(readFileSync(frontPage, 'utf8'), { knownPatterns }));
	else problems.push('templates/front-page.html is missing');

	const home = join(root, 'patterns', 'home.php');
	if (existsSync(home)) problems.push(...checkPageComposition(readFileSync(home, 'utf8'), themeSlug, { knownPatterns }));
	else problems.push('patterns/home.php is missing');

	const themeJsonPath = join(root, 'theme.json');
	if (existsSync(themeJsonPath)) {
		let theme;
		try {
			theme = JSON.parse(readFileSync(themeJsonPath, 'utf8'));
		} catch (err) {
			console.error(`verify-contract: theme.json does not parse — ${err.message}`);
			process.exit(1);
		}
		problems.push(...checkFluidTypography(theme));
		problems.push(...checkCustomTemplates(theme, (name) => existsSync(join(root, 'templates', `${name}.html`))));
	} else {
		problems.push('theme.json is missing');
	}

	const markup = collect(['patterns', 'templates', 'parts'], root);
	problems.push(...checkThemePaths(markup));
	problems.push(...checkRawValues(markup));

	if (problems.length) {
		for (const p of problems) console.error(`  ${p}`);
		process.exit(1);
	}
	console.log('  contract items 1, 3, 4, 5, 7, 9: OK');
}

// Only run when invoked directly, so the checks stay importable by the tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
