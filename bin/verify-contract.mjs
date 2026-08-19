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
//           preset, and only examined root rem-denominated sizes — a 32px or
//           per-block preset needs fluid just as much and was skipped. Style
//           variations were syntax-checked elsewhere but never inspected.
//   item 9  parsed customTemplates with an AWK state machine that read compact
//           JSON as "no templates declared", passing by finding nothing.
//
// A blacklist answers "is this one of the bad things I thought of". A parse
// answers "is this the shape the contract requires". Everything here is the
// second kind, and bin/verify-contract.test.mjs feeds each check markup that
// must fail so the checks cannot quietly stop checking.
//
// Slug-free by construction: the theme slug is read from style.css at runtime.

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

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
	return new Set(patternsBySlug(files).keys());
}

// Slug → the file that declares it. Item 4 is a rule about the page-level
// pattern, and the page-level pattern is whichever one the template wires — not
// whichever one is called home.php. Keying the check to a filename made the rule
// opt-in: rename the pattern, update the template's reference, and the
// composition check silently stopped applying to the page being served.
export function patternsBySlug(files) {
	const bySlug = new Map();
	for (const file of files) {
		const m = /^\s*\*\s*Slug:\s*(\S+)\s*$/im.exec(file.contents);
		if (m && !bySlug.has(m[1])) bySlug.set(m[1], file);
	}
	return bySlug;
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
//
// Blanked OUT OF the line, not used to exempt the line. `TOLERATED.some(re =>
// re.test(line))` returned early on the whole line, so one core-serialized value
// hid every other value beside it — and a block delimiter serializes as a single
// line, so `{"width":"600px","style":{"color":{"text":"#ff0000"}}}` carried a
// raw hex straight through the check that exists to catch it. An exemption has
// to be as wide as the thing it excuses and no wider.
const TOLERATED = [/"width":"\d+px"/g, /<div style="height:\s*\d+px"/g];

// CSS Values & Units Level 4 length units, kept in one table so every scanner
// consumes the same closure. `fr` is a flex fraction, not a <length>.
const CSS_LENGTH_UNITS = [
	'px', 'cm', 'mm', 'q', 'in', 'pc', 'pt',
	'em', 'ex', 'cap', 'ch', 'ic', 'rem', 'rex', 'rcap', 'rch', 'ric', 'lh', 'rlh',
	'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax',
	'svw', 'svh', 'svi', 'svb', 'svmin', 'svmax',
	'lvw', 'lvh', 'lvi', 'lvb', 'lvmin', 'lvmax',
	'dvw', 'dvh', 'dvi', 'dvb', 'dvmin', 'dvmax',
	'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax',
];
const CSS_LENGTH_UNIT_SET = new Set(CSS_LENGTH_UNITS);

const isDigit = (char) => char >= '0' && char <= '9';
const isHex = (char) => /^[0-9a-f]$/i.test(char || '');
const isNameStart = (char) => !!char && (/[A-Za-z_]/.test(char) || char.codePointAt(0) >= 0x80);
const isNameChar = (char) => isNameStart(char) || isDigit(char) || char === '-';
const isValidEscape = (text, index) => text[index] === '\\' && index + 1 < text.length && !/[\n\r\f]/.test(text[index + 1]);

function consumeEscape(text, start) {
	let index = start + 1;
	if (!isHex(text[index])) return { end: index + 1, value: text[index] || '' };
	let hex = '';
	while (hex.length < 6 && isHex(text[index])) hex += text[index++];
	if (/\s/.test(text[index] || '')) index++;
	const point = Number.parseInt(hex, 16);
	return { end: index, value: point === 0 || point > 0x10ffff ? '\ufffd' : String.fromCodePoint(point) };
}

function wouldStartIdentifier(text, index) {
	const char = text[index];
	if (char === '-') return isNameStart(text[index + 1]) || text[index + 1] === '-' || isValidEscape(text, index + 1);
	return isNameStart(char) || isValidEscape(text, index);
}

function consumeIdentifier(text, start) {
	let index = start;
	let value = '';
	while (index < text.length) {
		if (isNameChar(text[index])) {
			value += text[index++];
			continue;
		}
		if (!isValidEscape(text, index)) break;
		const escape = consumeEscape(text, index);
		value += escape.value;
		index = escape.end;
	}
	return { end: index, value };
}

function wouldStartNumber(text, index) {
	const char = text[index];
	if (isDigit(char)) return true;
	if (char === '.') return isDigit(text[index + 1]);
	if (char !== '+' && char !== '-') return false;
	return isDigit(text[index + 1]) || (text[index + 1] === '.' && isDigit(text[index + 2]));
}

function consumeNumber(text, start) {
	const match = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(start));
	return start + match[0].length;
}

function consumeFunction(text, open) {
	let depth = 0;
	let quote = null;
	for (let index = open; index < text.length; index++) {
		const char = text[index];
		if (isValidEscape(text, index)) {
			index = consumeEscape(text, index).end - 1;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '(') depth++;
		if (char === ')' && --depth === 0) return index + 1;
	}
	return text.length;
}

function withoutCssUrls(value) {
	const text = String(value);
	let result = '';
	let cursor = 0;
	let index = 0;
	while (index < text.length) {
		if (!wouldStartIdentifier(text, index)) {
			index++;
			continue;
		}
		const identifier = consumeIdentifier(text, index);
		let open = identifier.end;
		while (/\s/.test(text[open] || '')) open++;
		if (identifier.value.toLowerCase() !== 'url' || text[open] !== '(') {
			index = identifier.end;
			continue;
		}
		const end = consumeFunction(text, open);
		result += text.slice(cursor, index) + blankOut(text.slice(index, end));
		cursor = end;
		index = end;
	}
	return result + text.slice(cursor);
}

function rawLengthHit(text) {
	let index = 0;
	while (index < text.length) {
		if (wouldStartNumber(text, index)) {
			const numberEnd = consumeNumber(text, index);
			if (wouldStartIdentifier(text, numberEnd)) {
				const unit = consumeIdentifier(text, numberEnd);
				if (CSS_LENGTH_UNIT_SET.has(unit.value.toLowerCase())) return text.slice(index, unit.end);
				index = unit.end;
				continue;
			}
			index = numberEnd;
			continue;
		}
		if (wouldStartIdentifier(text, index)) {
			index = consumeIdentifier(text, index).end;
			continue;
		}
		index++;
	}
	return null;
}

const RAW_VALUE_RULES = [
	['hex color', /#[0-9a-f]{3,8}\b/i],
	['color function', /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color(?:-mix)?)\s*\([^)]*\)/i],
];

function rawValueHits(value) {
	// URLs can legitimately contain color- or dimension-looking path segments.
	// Blank the complete CSS function, including escaped spellings of `url`,
	// before scanning the declaration value around it.
	const text = withoutCssUrls(value);
	const hits = [];
	for (const [label, re] of RAW_VALUE_RULES) {
		const hit = text.match(re);
		if (hit) hits.push({ label, value: hit[0] });
	}
	const length = rawLengthHit(text);
	if (length) hits.push({ label: 'length', value: length });
	return hits;
}

// Spaces, not deletion: removing the text would join its neighbours into tokens
// that were never written (`#ff` + `0000`), and the column a value sits at is
// the only way to read a reported line back against the file.
const withoutTolerated = (line) => {
	let result = TOLERATED.reduce((acc, re) => acc.replace(re, blankOut), line);
	// core/cover serializes its numeric minHeight + minHeightUnit attributes as
	// an inline min-height. Like image width and spacer height, no token-valued
	// block attribute exists; keep the exemption bounded to the generated class.
	if (/class="[^"]*\bwp-block-cover\b/.test(line)) {
		result = result.replace(/min-height:\s*\d+(?:\.\d+)?(?:px|rem|em|vh|vw)\b/gi, blankOut);
	}
	return result;
};

export function checkRawValues(files) {
	const problems = [];
	for (const { file, contents } of files) {
		const lines = scannableSource(contents).split('\n');
		lines.forEach((line, index) => {
			const scannable = withoutTolerated(line);
			for (const hit of rawValueHits(scannable)) {
				problems.push(`${file}:${index + 1}: raw ${hit.label} "${hit.value}" — every value resolves to a theme.json preset`);
			}
		});
	}
	return problems;
}

// theme.json preset and settings.custom values are definitions, so raw values
// are legitimate there. Only the `styles` usage tree must consume those
// definitions through var(--wp--preset--*) or var(--wp--custom--*) references.
export function checkThemeStyleValues(theme, { file = 'theme.json' } = {}) {
	const problems = [];
	const walk = (value, path) => {
		if (typeof value === 'string') {
			for (const hit of rawValueHits(value)) {
				problems.push(`${file}: ${path}: raw ${hit.label} "${hit.value}" — styles values resolve to a theme.json preset or settings.custom token`);
			}
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((child, index) => walk(child, `${path}[${index}]`));
			return;
		}
		if (!value || typeof value !== 'object') return;
		for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
	};
	if (theme?.styles && typeof theme.styles === 'object') walk(theme.styles, 'styles');
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

// residualText() cannot see what PHP emits. It strips `<?php echo 'Buy now'; ?>`
// exactly the way it strips a tag — `<[^>]*>` cannot tell one angle-bracketed
// span from another — so a page-level pattern carrying hardcoded copy behind an
// echo left an empty residue and passed item 4 with content on the page.
//
// The answer is not a better content parser. A page-level pattern composes
// section patterns, so nothing executable belongs in it at all and the header
// docblock is the only PHP it needs. Section patterns are a different job —
// they carry this theme's translatable strings — and this check is deliberately
// not applied to them.
const PHP_SPAN_RE = /<\?(?:php\b|=)?([\s\S]*?)(?:\?>|$)/g;

const withoutPhpComments = (code) =>
	code
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/\/\/[^\n]*/g, ' ')
		.replace(/#[^\n]*/g, ' ');

export function checkExecutablePhp(source, { file = 'patterns/home.php' } = {}) {
	const problems = [];
	const text = String(source);
	for (const m of text.matchAll(PHP_SPAN_RE)) {
		const code = withoutPhpComments(m[1] ?? '').trim();
		if (!code) continue; // a docblock and nothing else: the pattern header
		const line = text.slice(0, m.index).split('\n').length;
		problems.push(`${file}:${line}: executable PHP ("${code.slice(0, 40)}") — a page-level pattern composes section patterns, and what PHP echoes is invisible to the content check`);
	}
	return problems;
}

export function checkPageComposition(php, themeSlug, { file = 'patterns/home.php', knownPatterns = null } = {}) {
	const problems = checkExecutablePhp(php, { file });
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
	if (typeof size !== 'string') return null;
	const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))(rem|px)$/i.exec(size.trim());
	if (!match) return null;
	const amount = Number.parseFloat(match[1]);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	return match[2].toLowerCase() === 'px' ? amount / REM_PX : amount;
}

function typographyScopes(theme) {
	const settings = theme?.settings ?? {};
	const scopes = [];
	if (settings.typography !== undefined) scopes.push({ path: 'settings.typography', typography: settings.typography });
	for (const [block, blockSettings] of Object.entries(settings.blocks ?? {})) {
		if (blockSettings?.typography !== undefined) scopes.push({ path: `settings.blocks.${block}.typography`, typography: blockSettings.typography });
	}
	return scopes;
}

export function checkFluidTypography(theme, { file = 'theme.json', requireGlobalFluid = true } = {}) {
	const problems = [];
	const globalTypography = theme?.settings?.typography;

	// Exactly settings.typography.fluid, not "the string appears somewhere".
	if (requireGlobalFluid && globalTypography?.fluid !== true) {
		problems.push(`${file}: settings.typography.fluid must be true (found ${JSON.stringify(globalTypography?.fluid ?? null)})`);
	}

	for (const { path, typography } of typographyScopes(theme)) {
		if (!typography || typeof typography !== 'object' || Array.isArray(typography)) {
			problems.push(`${file}: ${path} must be an object`);
			continue;
		}
		if (typography.fluid !== undefined && typography.fluid !== true) {
			problems.push(`${file}: ${path}.fluid must be true when declared (found ${JSON.stringify(typography.fluid)})`);
		}
		if (typography.fontSizes !== undefined && !Array.isArray(typography.fontSizes)) {
			problems.push(`${file}: ${path}.fontSizes must be an array`);
			continue;
		}
		for (const preset of typography.fontSizes ?? []) {
			const slug = typeof preset?.slug === 'string' && preset.slug ? preset.slug : '<unnamed>';
			const prefix = `${file}: ${path} fontSize '${slug}'`;
			const size = sizeInRem(preset?.size);
			if (size === null) {
				problems.push(`${prefix} size ${JSON.stringify(preset?.size ?? null)} must be rem or px so the fluid rule can measure it`);
			}

			const fluid = preset?.fluid;
			let min = null;
			let max = null;
			if (fluid !== undefined) {
				if (!fluid || typeof fluid !== 'object' || Array.isArray(fluid)) {
					problems.push(`${prefix} fluid must be an object carrying both min and max`);
				} else if (!Object.hasOwn(fluid, 'min') || !Object.hasOwn(fluid, 'max')) {
					problems.push(`${prefix} fluid must carry both min and max`);
				} else {
					min = sizeInRem(fluid.min);
					max = sizeInRem(fluid.max);
					if (min === null) problems.push(`${prefix} fluid min ${JSON.stringify(fluid.min)} must be rem or px`);
					if (max === null) problems.push(`${prefix} fluid max ${JSON.stringify(fluid.max)} must be rem or px`);
					if (min !== null && max !== null) {
						if (min > max) problems.push(`${prefix} fluid min ${fluid.min} is greater than max ${fluid.max}`);
						else if (size !== null && size < min) problems.push(`${prefix} size ${preset.size} is less than fluid min ${fluid.min}`);
						else if (size !== null && size > max) problems.push(`${prefix} size ${preset.size} is greater than fluid max ${fluid.max}`);
					}
				}
			}

			const largest = Math.max(...[size, min, max].filter((value) => value !== null));
			if (Number.isFinite(largest) && largest > 1 && fluid === undefined) {
				problems.push(`${prefix} reaches ${largest}rem (> 1rem) but declares no fluid { min, max }`);
			}
		}
	}
	return problems;
}

// --- item 9: custom templates exist ------------------------------------------

export function checkCustomTemplates(theme, hasTemplate, { file = 'theme.json' } = {}) {
	const problems = [];
	const entries = theme?.customTemplates;
	if (entries === undefined) return problems;
	if (!Array.isArray(entries)) {
		problems.push(`${file}: customTemplates must be an array`);
		return problems;
	}
	for (const entry of entries) {
		const name = entry?.name;
		if (typeof name !== 'string' || !name) {
			problems.push(`${file}: customTemplates entry has no name (${JSON.stringify(entry)})`);
			continue;
		}
		if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
			problems.push(`${file}: customTemplate '${name}' name must be a safe slug (lowercase letters, digits, and single dashes)`);
			continue;
		}
		const target = hasTemplate(name);
		if (target === true) continue;
		if (!target || target.exists === false) {
			problems.push(`${file}: customTemplate '${name}' has no templates/${name}.html`);
		} else if (target.symlink) {
			problems.push(`${file}: customTemplate '${name}' target must not be a symlink`);
		} else if (target.contained === false) {
			problems.push(`${file}: customTemplate '${name}' target is not contained in the theme`);
		} else if (!target.regular) {
			problems.push(`${file}: customTemplate '${name}' target must be a regular file`);
		}
	}
	return problems;
}

export function templateTargetStatus(root, name) {
	const abs = join(root, 'templates', `${name}.html`);
	try {
		const stat = lstatSync(abs);
		if (stat.isSymbolicLink()) return { exists: true, symlink: true, regular: false, contained: false };
		const rootReal = realpathSync(root);
		const targetReal = realpathSync(abs);
		const rel = relative(rootReal, targetReal);
		const contained = rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
		return { exists: true, symlink: false, regular: stat.isFile(), contained };
	} catch {
		return { exists: false, symlink: false, regular: false, contained: false };
	}
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

// Recursively, because WordPress registers these recursively —
// WP_Theme::scandir($dirpath, 'php', -1) for patterns and
// _get_block_templates_paths()'s RecursiveIteratorIterator for templates and
// parts. A one-level read with a try/catch that swallowed directories meant
// patterns/sections/hero.php was a live, registered pattern that the gate had
// never opened: not a check that passed for the wrong reason, a check that was
// never asked the question.
export function collect(dirs, root) {
	const out = [];
	const walk = (abs, rel) => {
		let entries;
		try {
			entries = readdirSync(abs, { withFileTypes: true });
		} catch {
			return; // an unreadable directory is reported by the tools that own it
		}
		for (const entry of entries) {
			const path = join(abs, entry.name);
			const file = `${rel}/${entry.name}`;
			if (entry.isDirectory()) {
				walk(path, file);
				continue;
			}
			// A SYMLINKED pattern file is a live, registered pattern — scandir()
			// reads straight through it, and so did the one-level collector this
			// replaced — so it has to be scanned or the fix that widened this gate
			// would have narrowed it at the same time. Symlinked DIRECTORIES are
			// not recursed into: a link cycle would not terminate, and readFileSync
			// on one throws EISDIR into the catch below.
			if (!entry.isFile() && !entry.isSymbolicLink()) continue;
			try {
				out.push({ file, contents: readFileSync(path, 'utf8') });
			} catch {
				/* unreadable is not markup — the one-level version tolerated this too */
			}
		}
	};
	for (const dir of dirs) {
		const abs = join(root, dir);
		if (!existsSync(abs)) continue;
		walk(abs, dir);
	}
	return out;
}

// Root theme.json and every styles/**/*.json variation enter one parsed
// pipeline. Keeping variation parsing in the shell created two rule sets that
// could only drift: the shell knew whether JSON parsed, while the JavaScript
// checker knew what valid JSON was allowed to say.
export function loadThemeJsonDocuments(root) {
	const documents = [];
	const problems = [];
	const files = ['theme.json'];
	const stylesDir = join(root, 'styles');
	try {
		const rootReal = realpathSync(root);
		const stylesStat = lstatSync(stylesDir);
		if (stylesStat.isSymbolicLink()) {
			problems.push('styles/: style variations directory must not be a symlink');
		} else if (!stylesStat.isDirectory()) {
			problems.push('styles/: style variations path must be a directory');
		} else {
			const contained = (path) => {
				const rel = relative(rootReal, realpathSync(path));
				return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
			};
			const walk = (abs, rel) => {
				for (const entry of readdirSync(abs, { withFileTypes: true })) {
					const path = join(abs, entry.name);
					const file = `${rel}/${entry.name}`;
					const stat = lstatSync(path);
					if (stat.isSymbolicLink()) {
						problems.push(`${file}: style variation paths must not be symlinks`);
						continue;
					}
					if (!contained(path)) {
						problems.push(`${file}: style variation path is not contained in the theme`);
						continue;
					}
					if (stat.isDirectory()) {
						walk(path, file);
						continue;
					}
					// WordPress ignores support/documentation files in styles/; only
					// regular JSON files are style-variation inputs.
					if (stat.isFile() && /\.json$/i.test(entry.name)) files.push(file);
				}
			};
			walk(stylesDir, 'styles');
		}
	} catch (err) {
		if (err?.code !== 'ENOENT') problems.push(`styles/: cannot read style variations — ${err.message}`);
	}

	for (const file of files.sort((a, b) => a.localeCompare(b))) {
		const path = join(root, file);
		if (!existsSync(path)) {
			if (file === 'theme.json') problems.push('theme.json is missing');
			continue;
		}
		try {
			documents.push({ file, theme: JSON.parse(readFileSync(path, 'utf8')) });
		} catch (err) {
			problems.push(`${file}: does not parse — ${err.message}`);
		}
	}
	return { documents, problems };
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
	const patternFiles = collect(['patterns'], root);
	const bySlug = patternsBySlug(patternFiles);
	const knownPatterns = new Set(bySlug.keys());

	// Item 4 is checked against the pattern the template actually wires, found
	// through the template's own reference. patterns/home.php is the convention
	// and the fallback, not the rule: keying the check to that filename meant a
	// page-level pattern under any other name — and the hardcoded content or
	// executable PHP in it — was exempt by naming.
	let pageLevel = [];
	if (existsSync(frontPage)) {
		const html = readFileSync(frontPage, 'utf8');
		problems.push(...checkTemplateWiring(html, { knownPatterns }));
		pageLevel = parseBlocks(html)
			.blocks.filter((b) => b.name === 'core/pattern' && b.attrs.slug)
			.map((b) => bySlug.get(b.attrs.slug))
			.filter(Boolean);
	} else {
		problems.push('templates/front-page.html is missing');
	}

	if (!pageLevel.length) {
		const home = bySlug.get(`${themeSlug}/home`);
		if (home) pageLevel = [home];
		else problems.push(`no page-level pattern found — templates/front-page.html references none that exists, and no pattern declares ${themeSlug}/home`);
	}
	for (const pattern of pageLevel) {
		problems.push(...checkPageComposition(pattern.contents, themeSlug, { file: pattern.file, knownPatterns }));
	}

	const themeDocuments = loadThemeJsonDocuments(root);
	problems.push(...themeDocuments.problems);
	for (const { file, theme } of themeDocuments.documents) {
		problems.push(...checkFluidTypography(theme, { file, requireGlobalFluid: file === 'theme.json' }));
		problems.push(...checkThemeStyleValues(theme, { file }));
		if (file === 'theme.json') {
			problems.push(...checkCustomTemplates(theme, (name) => templateTargetStatus(root, name), { file }));
		}
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
