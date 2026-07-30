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

// Flat list of block occurrences with nesting depth. Depth is what separates
// "the template wires a pattern" from "the template contains a paragraph that
// happens to sit inside a pattern's own markup".
export function parseBlocks(html) {
	const out = [];
	let depth = 0;
	for (const m of html.matchAll(BLOCK_RE)) {
		const [, closing, rawName, , json, selfClose] = m;
		const name = rawName.includes('/') ? rawName : `core/${rawName}`;
		if (closing) {
			depth = Math.max(0, depth - 1);
			continue;
		}
		let attrs = {};
		if (json) {
			try {
				attrs = JSON.parse(json);
			} catch {
				out.push({ name, attrs: {}, depth, malformed: true });
				continue;
			}
		}
		out.push({ name, attrs, depth });
		if (!selfClose) depth += 1;
	}
	return out;
}

// --- item 3: templates wire --------------------------------------------------

// A whitelist, deliberately. The contract says a template is a header part, a
// main wrapper, one pattern reference and a footer part — so anything else is a
// violation whether or not anyone predicted it.
const WIRING_BLOCKS = new Set(['core/template-part', 'core/group', 'core/pattern']);

export function checkTemplateWiring(html, file = 'templates/front-page.html') {
	const problems = [];
	const blocks = parseBlocks(html);

	for (const b of blocks) {
		if (b.malformed) {
			problems.push(`${file}: malformed block attributes on wp:${b.name}`);
			continue;
		}
		if (!WIRING_BLOCKS.has(b.name)) {
			problems.push(`${file}: contains ${b.name} — templates wire, patterns compose (move it into a pattern)`);
		}
	}

	const patterns = blocks.filter((b) => b.name === 'core/pattern');
	if (patterns.length === 0) problems.push(`${file}: references no pattern — the page body belongs in one`);
	if (patterns.length > 1) {
		problems.push(`${file}: references ${patterns.length} patterns (${patterns.map((p) => p.attrs.slug ?? '?').join(', ')}) — a template wires ONE page-level pattern`);
	}
	return problems;
}

// --- item 4: page-level patterns compose section patterns --------------------

export function checkPageComposition(php, themeSlug, file = 'patterns/home.php') {
	const problems = [];
	const blocks = parseBlocks(php);
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
		}
	}
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
	return null; // em, %, clamp(), var() — a separate rule's business
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
		if (rem === null || rem <= 1) continue;
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
const THEME_PATH_RE = /(\/wp-content\/themes\/|get_stylesheet_directory_uri|get_template_directory_uri)/;

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
	if (existsSync(frontPage)) problems.push(...checkTemplateWiring(readFileSync(frontPage, 'utf8')));
	else problems.push('templates/front-page.html is missing');

	const home = join(root, 'patterns', 'home.php');
	if (existsSync(home)) problems.push(...checkPageComposition(readFileSync(home, 'utf8'), themeSlug));
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

	problems.push(...checkThemePaths(collect(['patterns', 'templates', 'parts'], root)));

	if (problems.length) {
		for (const p of problems) console.error(`  ${p}`);
		process.exit(1);
	}
	console.log('  contract items 3, 4, 5, 7, 9: OK');
}

// Only run when invoked directly, so the checks stay importable by the tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
