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

// Commentary is blanked so line numbers survive. Block delimiters, HTML
// attributes, <style> bodies and PHP-emitted CSS are then parsed in their own
// contexts; visible prose and unrelated PHP strings are not CSS values.
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
		.replace(/<!--(?!\s*\/?wp:)[\s\S]*?-->/g, blankOut);
}

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

const COLOR_FUNCTIONS = new Set([
	'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch',
	'color', 'color-mix', 'device-cmyk', 'light-dark', 'contrast-color',
]);
// URL-valued HTML/SVG attributes are content, not CSS. Most of these names are
// element-specific: `data` is a URL on <object>, for example, but ordinary text
// on <div>. Pairing the name with its element prevents a misspelled or custom
// attribute from creating a broad raw-value exemption.
const URL_ATTRIBUTES_BY_TAG = new Map(Object.entries({
	a: ['href', 'ping'],
	applet: ['archive', 'code', 'codebase', 'object'],
	area: ['href', 'ping'],
	audio: ['src'],
	base: ['href'],
	blockquote: ['cite'],
	body: ['background'],
	button: ['formaction'],
	del: ['cite'],
	embed: ['src'],
	form: ['action'],
	frame: ['longdesc', 'src'],
	head: ['profile'],
	html: ['manifest'],
	iframe: ['longdesc', 'src'],
	img: ['attributionsrc', 'dynsrc', 'longdesc', 'lowsrc', 'src', 'srcset', 'usemap'],
	input: ['formaction', 'src', 'usemap'],
	ins: ['cite'],
	link: ['attributionsrc', 'href', 'imagesrcset'],
	object: ['archive', 'classid', 'codebase', 'data', 'usemap'],
	q: ['cite'],
	script: ['attributionsrc', 'src'],
	source: ['src', 'srcset'],
	table: ['background'],
	td: ['background'],
	th: ['background'],
	track: ['src'],
	video: ['poster', 'src'],
}).map(([tag, names]) => [tag.toLowerCase(), new Set(names)]));
const SVG_URL_ATTRIBUTES_BY_TAG = new Map(Object.entries({
	a: ['href', 'ping', 'xlink:href'],
	animate: ['href', 'xlink:href'],
	animateMotion: ['href', 'xlink:href'],
	animateTransform: ['href', 'xlink:href'],
	feImage: ['href', 'xlink:href'],
	filter: ['href', 'xlink:href'],
	image: ['href', 'xlink:href'],
	linearGradient: ['href', 'xlink:href'],
	marker: ['href', 'xlink:href'],
	mpath: ['href', 'xlink:href'],
	pattern: ['href', 'xlink:href'],
	radialGradient: ['href', 'xlink:href'],
	script: ['href', 'xlink:href'],
	set: ['href', 'xlink:href'],
	textPath: ['href', 'xlink:href'],
	use: ['href', 'xlink:href'],
}).map(([tag, names]) => [tag.toLowerCase(), new Set(names)]));
const HTML_FOREIGN_BREAKOUT_TAGS = new Set([
	'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt',
	'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img',
	'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small',
	'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var',
]);
const GLOBAL_URL_ATTRIBUTE_KEYS = new Set(['itemid', 'itemtype', 'xml:base', 'xmlns', 'xmlns:xlink']);
const BLOCK_URL_ATTRIBUTE_KEYS = new Set([
	'attributionsrc', 'href', 'imagesrcset', 'lowsrc', 'poster', 'src', 'srcset',
	'url', 'usemap', 'xlink:href',
]);

const isMarkupUrlAttribute = (name, tagName, namespace, attributes) => {
	const lower = name.toLowerCase();
	if (GLOBAL_URL_ATTRIBUTE_KEYS.has(lower) || lower.startsWith('xmlns:')) return true;
	const pairs = namespace === 'svg' ? SVG_URL_ATTRIBUTES_BY_TAG : URL_ATTRIBUTES_BY_TAG;
	if (pairs.get(tagName)?.has(lower)) return true;
	if (tagName !== 'meta' || lower !== 'content') return false;
	return attributes.get('http-equiv')?.decodedValue?.trim().toLowerCase() === 'refresh';
};

function cssTokenView(value) {
	const source = String(value);
	let text = '';
	const map = [];
	let quote = null;
	for (let index = 0; index < source.length;) {
		const char = source[index];
		// CSS input preprocessing turns CRLF into one LF, and lone CR/form-feed
		// into LF. Doing it here keeps every escape consumer on the same token
		// stream while the map still points diagnostics at the physical source.
		if (char === '\r') {
			text += '\n';
			map.push(index);
			index += source[index + 1] === '\n' ? 2 : 1;
			continue;
		}
		if (char === '\f') {
			text += '\n';
			map.push(index++);
			continue;
		}
		if (quote) {
			text += char;
			map.push(index);
			if (char === '\\' && index + 1 < source.length) {
				text += source[index + 1];
				map.push(index + 1);
				index += 2;
				continue;
			}
			if (char === quote) quote = null;
			index++;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			text += char;
			map.push(index++);
			continue;
		}
		if (char === '/' && source[index + 1] === '*') {
			const close = source.indexOf('*/', index + 2);
			index = close === -1 ? source.length : close + 2;
			continue;
		}
		text += char;
		map.push(index++);
	}
	return { source, text, map };
}

function consumeString(text, start) {
	const quote = text[start];
	let index = start + 1;
	while (index < text.length) {
		if (text[index] === '\\' && index + 1 < text.length) {
			index += 2;
			continue;
		}
		if (text[index++] === quote) break;
	}
	return index;
}

function rawValueHits(value) {
	const { source, text, map } = cssTokenView(value);
	const hits = [];
	const sourceSlice = (start, end) => {
		if (end <= start || map[start] === undefined) return '';
		return source.slice(map[start], (map[end - 1] ?? map[start]) + 1);
	};
	const add = (label, start, end) => hits.push({ label, value: sourceSlice(start, end), index: map[start] ?? 0 });

	let index = 0;
	while (index < text.length) {
		const char = text[index];
		if (char === '"' || char === "'") {
			index = consumeString(text, index);
			continue;
		}

		if (char === '#') {
			let end = index + 1;
			let decoded = '';
			while (end < text.length) {
				if (isNameChar(text[end])) {
					decoded += text[end++];
					continue;
				}
				if (!isValidEscape(text, end)) break;
				const escape = consumeEscape(text, end);
				decoded += escape.value;
				end = escape.end;
			}
			if (/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(decoded)) {
				add('hex color', index, end);
				index = end;
				continue;
			}
		}
		if (wouldStartNumber(text, index)) {
			const numberEnd = consumeNumber(text, index);
			if (wouldStartIdentifier(text, numberEnd)) {
				const unit = consumeIdentifier(text, numberEnd);
				if (CSS_LENGTH_UNIT_SET.has(unit.value.toLowerCase())) add('length', index, unit.end);
				index = unit.end;
				continue;
			}
			index = numberEnd;
			continue;
		}
		if (wouldStartIdentifier(text, index)) {
			const identifier = consumeIdentifier(text, index);
			if (text[identifier.end] === '(') {
				const end = consumeFunction(text, identifier.end);
				const name = identifier.value.toLowerCase();
				if (name === 'url') {
					index = end;
					continue;
				}
				if (COLOR_FUNCTIONS.has(name)) {
					add('color function', index, end);
					index = end;
					continue;
				}
			}
			index = identifier.end;
			continue;
		}
		index++;
	}
	return hits.sort((left, right) => left.index - right.index);
}

function decodedJsonStrings(json, absoluteStart) {
	const strings = [];
	let index = 0;
	const skipSpace = () => {
		while (/\s/.test(json[index] || '')) index++;
	};
	const readString = () => {
		const start = index++;
		while (index < json.length) {
			if (json[index] === '\\') index += 2;
			else if (json[index++] === '"') break;
		}
		const raw = json.slice(start, index);
		const value = JSON.parse(raw);
		const map = [];
		for (let rawIndex = 1; rawIndex < raw.length - 1;) {
			if (raw[rawIndex] !== '\\') {
				map.push(absoluteStart + start + rawIndex++);
				continue;
			}
			const escapeStart = rawIndex;
			if (raw[rawIndex + 1] === 'u') rawIndex += 6;
			else rawIndex += 2;
			map.push(absoluteStart + start + escapeStart);
		}
		return { value, map };
	};
	const parseValue = (inheritedKey = null, relation = 'root', objectDepth = 0) => {
		skipSpace();
		if (json[index] === '"') {
			strings.push({ ...readString(), key: inheritedKey, directProperty: relation === 'property', objectDepth });
			return;
		}
		if (json[index] === '{') {
			index++;
			skipSpace();
			while (index < json.length && json[index] !== '}') {
				const key = readString().value;
				skipSpace();
				index++; // colon; full JSON validation has already established it
				parseValue(key, 'property', objectDepth + 1);
				skipSpace();
				if (json[index] === ',') {
					index++;
					skipSpace();
				}
			}
			index++;
			return;
		}
		if (json[index] === '[') {
			index++;
			skipSpace();
			while (index < json.length && json[index] !== ']') {
				parseValue(inheritedKey, 'array', objectDepth);
				skipSpace();
				if (json[index] === ',') {
					index++;
					skipSpace();
				}
			}
			index++;
			return;
		}
		while (index < json.length && !/[,}\]]/.test(json[index])) index++;
	};
	parseValue();
	return strings;
}

function neutralizePhpInJson(json) {
	// Indices throughout the parser are UTF-16 code-unit offsets. split('') keeps
	// those offsets stable across non-BMP text; a code-point spread would shorten
	// the array before a later PHP span and neutralize the wrong characters.
	const characters = json.split('');
	let quoted = false;
	for (let index = 0; index < json.length;) {
		if (json[index] === '\\' && quoted) {
			index += 2;
			continue;
		}
		if (json[index] === '"') {
			quoted = !quoted;
			index++;
			continue;
		}
		if (json[index] !== '<' || json[index + 1] !== '?') {
			index++;
			continue;
		}
		const end = phpEnd(json, index);
		characters.fill(' ', index, end);
		if (!quoted) characters[index] = '0';
		index = end;
	}
	return characters.join('');
}

function phpComplexInterpolationEnd(source, start) {
	let index = start + 1;
	let depth = 1;
	let quote = null;
	let blockComment = false;
	let lineComment = false;
	while (index < source.length && depth > 0) {
		if (quote) {
			if (source[index] === '\\') index += 2;
			else if (source[index++] === quote) quote = null;
			continue;
		}
		if (blockComment) {
			if (source.startsWith('*/', index)) {
				blockComment = false;
				index += 2;
			} else index++;
			continue;
		}
		if (lineComment) {
			if (source[index] === '\n' || source[index] === '\r') lineComment = false;
			index++;
			continue;
		}
		if (source.startsWith('/*', index)) {
			blockComment = true;
			index += 2;
			continue;
		}
		if (source.startsWith('//', index) || (source[index] === '#' && source[index + 1] !== '[')) {
			lineComment = true;
			index += source[index] === '#' ? 1 : 2;
			continue;
		}
		if (source[index] === '"' || source[index] === "'") {
			quote = source[index++];
			continue;
		}
		if (source[index] === '{') depth++;
		else if (source[index] === '}') depth--;
		index++;
	}
	return index;
}

function phpQuotedEnd(source, start) {
	const quote = source[start];
	let index = start + 1;
	while (index < source.length) {
		if (source[index] === '\\') {
			index += 2;
			continue;
		}
		if (quote !== "'" && source[index] === '{' && source[index + 1] === '$') {
			index = phpComplexInterpolationEnd(source, index);
			continue;
		}
		if (quote !== "'" && source[index] === '$' && source[index + 1] === '{') {
			index = phpComplexInterpolationEnd(source, index + 1);
			continue;
		}
		if (source[index++] === quote) return index;
	}
	return source.length;
}

function phpEnd(source, start) {
	let index = start + 2;
	let blockComment = false;
	let lineComment = false;
	while (index < source.length) {
		if (blockComment) {
			if (source.startsWith('*/', index)) {
				blockComment = false;
				index += 2;
			} else {
				index++;
			}
			continue;
		}
		// In PHP, a close tag ends a // or # comment too.
		if (lineComment) {
			if (source.startsWith('?>', index)) return index + 2;
			if (source[index] === '\n' || source[index] === '\r') lineComment = false;
			index++;
			continue;
		}
		if (source.startsWith('<<<', index)) {
			const heredoc = phpHeredocToken(source, index, 0);
			if (heredoc) {
				index = heredoc.end;
				continue;
			}
		}
		if (source.startsWith('?>', index)) return index + 2;
		if (source.startsWith('/*', index)) {
			blockComment = true;
			index += 2;
			continue;
		}
		if (source.startsWith('//', index) || (source[index] === '#' && source[index + 1] !== '[')) {
			lineComment = true;
			index += source[index] === '#' ? 1 : 2;
			continue;
		}
		if (source[index] === '"' || source[index] === "'" || source[index] === '`') {
			index = phpQuotedEnd(source, index);
			continue;
		}
		index++;
	}
	return source.length;
}

// Parse only the part of HTML needed by this contract: start tags, their exact
// attributes, and raw-text style bodies. Unlike a `<[^>]*>` expression this
// keeps `>` inside quotes and PHP spans inside the opening tag, so an attribute
// cannot impersonate `class=` and a PHP close tag cannot truncate `<style>`.
function tokenizeStartTag(source) {
	const opener = /^<\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(source);
	if (!opener) return { attributes: [], names: [], endIndex: source.length, selfClosing: false, complete: false };
	const attributes = [];
	let cursor = opener[0].length;
	let state = 'before-name';
	let quote = null;
	let current = null;
	const beginAttribute = () => {
		current = { name: '', value: null, valueStart: null, valueEnd: null };
		state = 'name';
	};
	const commitAttribute = () => {
		if (!current) return;
		attributes.push({ ...current, name: current.name.toLowerCase() });
		current = null;
	};
	const result = (endIndex, selfClosing, complete = true) => {
		commitAttribute();
		return {
			attributes,
			names: attributes.map((attribute) => attribute.name),
			endIndex,
			selfClosing,
			complete,
		};
	};
	while (cursor < source.length) {
		const char = source[cursor];
		if (state === 'quoted-value') {
			if (char === quote) {
				current.valueEnd = cursor;
				current.value = source.slice(current.valueStart, current.valueEnd);
				state = 'after-quoted-value';
			}
			cursor++;
			continue;
		}
		if (state === 'unquoted-value') {
			if (/[\t\n\f\r ]/.test(char)) {
				current.valueEnd = cursor;
				current.value = source.slice(current.valueStart, current.valueEnd);
				commitAttribute();
				state = 'before-name';
				cursor++;
				continue;
			}
			if (char === '>') {
				current.valueEnd = cursor;
				current.value = source.slice(current.valueStart, current.valueEnd);
				return result(cursor, false);
			}
			cursor++;
			continue;
		}
		if (state === 'before-value') {
			if (/[\t\n\f\r ]/.test(char)) {
				cursor++;
				continue;
			}
			if (char === '"' || char === "'") {
				quote = char;
				current.valueStart = cursor + 1;
				state = 'quoted-value';
				cursor++;
				continue;
			}
			if (char === '>') {
				current.valueStart = cursor;
				current.valueEnd = cursor;
				current.value = '';
				return result(cursor, false);
			}
			current.valueStart = cursor;
			state = 'unquoted-value';
			continue;
		}
		if (state === 'name') {
			if (/[\t\n\f\r ]/.test(char)) {
				state = 'after-name';
				cursor++;
				continue;
			}
			if (char === '/') {
				commitAttribute();
				state = 'self-closing';
				cursor++;
				continue;
			}
			if (char === '=') {
				state = 'before-value';
				cursor++;
				continue;
			}
			if (char === '>') {
				return result(cursor, false);
			}
			current.name += char === '\0' ? '\ufffd' : char;
			cursor++;
			continue;
		}
		if (state === 'after-name') {
			if (/[\t\n\f\r ]/.test(char)) {
				cursor++;
				continue;
			}
			if (char === '/') {
				commitAttribute();
				state = 'self-closing';
				cursor++;
				continue;
			}
			if (char === '=') {
				state = 'before-value';
				cursor++;
				continue;
			}
			if (char === '>') return result(cursor, false);
			commitAttribute();
			state = 'before-name';
			continue;
		}
		if (state === 'after-quoted-value') {
			if (/[\t\n\f\r ]/.test(char)) {
				commitAttribute();
				state = 'before-name';
				cursor++;
				continue;
			}
			if (char === '/') {
				commitAttribute();
				state = 'self-closing';
				cursor++;
				continue;
			}
			if (char === '>') return result(cursor, false);
			commitAttribute();
			state = 'before-name';
			continue;
		}
		if (state === 'self-closing') {
			if (char === '>') return result(cursor, true);
			state = 'before-name';
			continue;
		}
		if (/[\t\n\f\r ]/.test(char)) {
			cursor++;
			continue;
		}
		if (char === '/') {
			state = 'self-closing';
			cursor++;
			continue;
		}
		if (char === '>') return result(cursor, false);
		beginAttribute();
		if (char === '=') {
			current.name = '=';
			cursor++;
		}
		continue;
	}
	if (current?.valueStart !== null && current.valueEnd === null) {
		current.valueEnd = source.length;
		current.value = source.slice(current.valueStart);
	}
	return result(source.length, false, false);
}

function markupContexts(source) {
	const tags = [];
	const styles = [];
	const elementStack = [];
	const voidHtmlElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
	let index = 0;
	while (index < source.length) {
		const start = source.indexOf('<', index);
		if (start === -1) break;
		if (source.startsWith('<!--', start)) {
			const close = source.indexOf('-->', start + 4);
			index = close === -1 ? source.length : close + 3;
			continue;
		}
		if (source.startsWith('<?', start)) {
			index = phpEnd(source, start);
			continue;
		}
		if (source[start + 1] === '/') {
			const closingName = /^<\/\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(source.slice(start))?.[1]?.toLowerCase();
			if (closingName) {
				if (elementStack.at(-1)?.childNamespace === 'svg' && ['br', 'p'].includes(closingName)) {
					while (elementStack.at(-1)?.childNamespace === 'svg') elementStack.pop();
				} else if (elementStack.at(-1)?.name === closingName) {
					elementStack.pop();
				} else {
					// URL-valued SVG attributes are exempt only while well-nested markup
					// proves the foreign-content namespace. HTML's recovery rules for a
					// mismatched end tag can cross integration points and nested SVG, so
					// discard the proof and fail closed for everything that follows.
					elementStack.length = 0;
				}
			}
			const close = source.indexOf('>', start + 2);
			index = close === -1 ? source.length : close + 1;
			continue;
		}
		if (source[start + 1] === '!') {
			const close = source.indexOf('>', start + 2);
			index = close === -1 ? source.length : close + 1;
			continue;
		}
		const nameMatch = /^[A-Za-z][A-Za-z0-9:-]*/.exec(source.slice(start + 1));
		if (!nameMatch) {
			index = start + 1;
			continue;
		}
		const name = nameMatch[0].toLowerCase();
		const token = tokenizeStartTag(source.slice(start));
		if (!token.complete) break;
		const end = start + token.endIndex + 1;
		const selfClosing = token.selfClosing;
		const attributes = token.attributes.map((attribute) => ({
			...attribute,
			valueStart: attribute.valueStart === null ? null : start + attribute.valueStart,
			valueEnd: attribute.valueEnd === null ? null : start + attribute.valueEnd,
		}));
		let parentNamespace = elementStack.at(-1)?.childNamespace ?? 'html';
		const fontBreakout = name === 'font'
			&& token.names.some((attributeName) => ['color', 'face', 'size'].includes(attributeName));
		if (parentNamespace === 'svg' && (HTML_FOREIGN_BREAKOUT_TAGS.has(name) || fontBreakout)) {
			while (elementStack.at(-1)?.childNamespace === 'svg') elementStack.pop();
			parentNamespace = elementStack.at(-1)?.childNamespace ?? 'html';
		}
		const namespace = name === 'svg' ? 'svg' : parentNamespace;
		const childNamespace = namespace === 'svg' && ['foreignobject', 'desc', 'title'].includes(name) ? 'html' : namespace;
		const tag = { name, namespace, start, end, attributes };
		tags.push(tag);
		if (name !== 'style') {
			const selfClosingApplies = selfClosing && namespace !== 'html';
			if (!selfClosingApplies && !(namespace === 'html' && voidHtmlElements.has(name))) {
				elementStack.push({ name, namespace, childNamespace });
			}
			index = end;
			continue;
		}
		const closePattern = /<\/style\s*>/gi;
		closePattern.lastIndex = end;
		const close = closePattern.exec(source);
		const bodyEnd = close?.index ?? source.length;
		styles.push({ start: end, end: bodyEnd });
		index = close ? close.index + close[0].length : source.length;
	}
	return { tags, styles };
}

function encodedPhpText(text, sourceMap = [], fallback = 0) {
	const bytes = [];
	const byteMap = [];
	for (let index = 0; index < text.length;) {
		const point = text.codePointAt(index);
		const value = String.fromCodePoint(point);
		const encoded = Buffer.from(value, 'utf8');
		bytes.push(...encoded);
		byteMap.push(...Array.from({ length: encoded.length }, () => sourceMap[index] ?? fallback));
		index += value.length;
	}
	return { bytes: Buffer.from(bytes), byteMap };
}

function decodedPhpBytes(bytes, byteMap = [], fallback = 0) {
	let text = '';
	const map = [];
	for (let index = 0; index < bytes.length;) {
		const first = bytes[index];
		let length = 1;
		if (first >= 0xc2 && first <= 0xdf && index + 1 < bytes.length && (bytes[index + 1] & 0xc0) === 0x80) {
			length = 2;
		} else if (first >= 0xe0 && first <= 0xef && index + 2 < bytes.length
			&& (bytes[index + 1] & 0xc0) === 0x80 && (bytes[index + 2] & 0xc0) === 0x80
			&& !(first === 0xe0 && bytes[index + 1] < 0xa0) && !(first === 0xed && bytes[index + 1] >= 0xa0)) {
			length = 3;
		} else if (first >= 0xf0 && first <= 0xf4 && index + 3 < bytes.length
			&& (bytes[index + 1] & 0xc0) === 0x80 && (bytes[index + 2] & 0xc0) === 0x80 && (bytes[index + 3] & 0xc0) === 0x80
			&& !(first === 0xf0 && bytes[index + 1] < 0x90) && !(first === 0xf4 && bytes[index + 1] >= 0x90)) {
			length = 4;
		}
		const value = bytes.subarray(index, index + length).toString('utf8');
		text += value;
		map.push(...Array.from({ length: value.length }, () => byteMap[index] ?? fallback));
		index += length;
	}
	return { text, map, bytes, byteMap };
}

function phpStringBody(source, start, end, absoluteStart, quote, sourcePositions = null) {
	let index = start;
	const bytes = [];
	const byteMap = [];
	const appendBytes = (value, sourceIndex) => {
		bytes.push(...value);
		const position = sourcePositions?.[sourceIndex] ?? absoluteStart + sourceIndex;
		byteMap.push(...Array.from({ length: value.length }, () => position));
	};
	const appendText = (value, sourceIndex) => {
		appendBytes(Buffer.from(value, 'utf8'), sourceIndex);
	};
	while (index < end) {
		if (quote !== "'" && source[index] === '{' && source[index + 1] === '$') {
			appendText(';', index);
			index = Math.min(end, phpComplexInterpolationEnd(source, index));
			continue;
		}
		if (quote !== "'" && source[index] === '$' && source[index + 1] === '{') {
			appendText(';', index);
			index = Math.min(end, phpComplexInterpolationEnd(source, index + 1));
			continue;
		}
		if (source[index] !== '\\' || index + 1 >= end) {
			const point = source.codePointAt(index);
			const value = String.fromCodePoint(point);
			appendText(value, index);
			index += value.length;
			continue;
		}
		const escapeStart = index;
		const escaped = source[index + 1];
		if (quote === "'") {
			if (escaped === "'" || escaped === '\\') {
				appendText(escaped, escapeStart);
				index += 2;
			} else {
				appendText('\\', index++);
			}
			continue;
		}
		const simple = new Map([
			['n', '\n'], ['r', '\r'], ['t', '\t'], ['v', '\v'], ['e', '\x1b'],
			['f', '\f'], ['\\', '\\'], ['$', '$'], ['"', '"'],
		]);
		if (simple.has(escaped)) {
			appendText(simple.get(escaped), escapeStart);
			index += 2;
			continue;
		}
		const octal = /^[0-7]{1,3}/.exec(source.slice(index + 1));
		if (octal) {
			appendBytes(Buffer.from([Number.parseInt(octal[0], 8) & 0xff]), escapeStart);
			index += 1 + octal[0].length;
			continue;
		}
		const hex = /^x([0-9a-f]{1,2})/i.exec(source.slice(index + 1));
		if (hex) {
			appendBytes(Buffer.from([Number.parseInt(hex[1], 16)]), escapeStart);
			index += 2 + hex[1].length;
			continue;
		}
		const unicode = /^u\{([0-9a-f]+)\}/i.exec(source.slice(index + 1));
		if (unicode && Number.parseInt(unicode[1], 16) <= 0x10ffff) {
			appendText(String.fromCodePoint(Number.parseInt(unicode[1], 16)), escapeStart);
			index += 1 + unicode[0].length;
			continue;
		}
		// PHP preserves an unknown escape in a double-quoted string.
		appendText('\\', index++);
	}
	return decodedPhpBytes(Buffer.from(bytes), byteMap, sourcePositions?.[start] ?? absoluteStart + start);
}

function phpStringToken(source, start, absoluteStart) {
	const quote = source[start];
	const end = phpQuotedEnd(source, start);
	const bodyEnd = source[end - 1] === quote ? end - 1 : end;
	const body = phpStringBody(source, start + 1, bodyEnd, absoluteStart, quote);
	return { type: 'string', ...body, start, end };
}

function normalizedHeredocBody(source, bodyStart, closingStart, closingText, absoluteStart) {
	let bodyEnd = closingStart;
	if (source[bodyEnd - 1] === '\n') {
		bodyEnd--;
		if (source[bodyEnd - 1] === '\r') bodyEnd--;
	} else if (source[bodyEnd - 1] === '\r') {
		bodyEnd--;
	}
	const indentation = /^[ \t]*/.exec(closingText)?.[0] ?? '';
	let text = '';
	const map = [];
	let cursor = bodyStart;
	while (cursor < bodyEnd) {
		const lineStart = cursor;
		while (cursor < bodyEnd && source[cursor] !== '\r' && source[cursor] !== '\n') cursor++;
		const contentEnd = cursor;
		let contentStart = lineStart;
		if (indentation && source.startsWith(indentation, lineStart)) {
			contentStart += indentation.length;
		} else if (indentation && /^[ \t]*$/.test(source.slice(lineStart, contentEnd))) {
			contentStart = Math.min(contentEnd, lineStart + indentation.length);
		}
		for (let index = contentStart; index < contentEnd; index++) {
			text += source[index];
			map.push(absoluteStart + index);
		}
		if (cursor < bodyEnd) {
			text += source[cursor];
			map.push(absoluteStart + cursor++);
			if (text.endsWith('\r') && source[cursor] === '\n' && cursor < bodyEnd) {
				text += source[cursor];
				map.push(absoluteStart + cursor++);
			}
		}
	}
	return { text, map };
}

function phpHeredocToken(source, start, absoluteStart) {
	const header = /^<<<[ \t]*(?:(['"])([A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)\1|([A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*))[ \t]*(?:\r\n|\n|\r)/.exec(source.slice(start));
	if (!header) return null;
	const label = header[2] || header[3];
	const bodyStart = start + header[0].length;
	const closing = new RegExp(`^[ \\t]*${label}(?![A-Za-z0-9_\\x80-\\uffff])`, 'gm');
	closing.lastIndex = bodyStart;
	const match = closing.exec(source);
	if (!match) return null;
	const closingStart = match.index;
	const end = closingStart + match[0].length;
	const nowdoc = header[1] === "'";
	const normalized = normalizedHeredocBody(source, bodyStart, closingStart, match[0], absoluteStart);
	let body;
	if (nowdoc) {
		const encoded = encodedPhpText(normalized.text, normalized.map, absoluteStart + bodyStart);
		body = { ...normalized, ...encoded };
	} else {
		body = phpStringBody(normalized.text, 0, normalized.text.length, 0, '"', normalized.map);
	}
	return { type: 'string', ...body, start, end };
}

function phpNumberToken(source, start, absoluteStart) {
	const input = source.slice(start);
	const based = /^(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|0[0-7](?:_?[0-7])*)/.exec(input);
	if (based) {
		const literal = based[0].replaceAll('_', '');
		let radix = 8;
		let digits = literal;
		if (/^0[xX]/.test(literal)) {
			radix = 16;
			digits = literal.slice(2);
		} else if (/^0[bB]/.test(literal)) {
			radix = 2;
			digits = literal.slice(2);
		} else if (/^0[oO]/.test(literal)) {
			digits = literal.slice(2);
		} else {
			digits = literal.slice(1) || '0';
		}
		let integer = 0n;
		for (const digit of digits.toLowerCase()) {
			integer = integer * BigInt(radix) + BigInt('0123456789abcdef'.indexOf(digit));
		}
		const numericText = integer.toString();
		const numericKind = integer <= 0x7fffffffffffffffn ? 'int-literal' : 'float-based-literal';
		const text = numericKind === 'float-based-literal' ? '0.0' : numericText;
		const map = Array.from({ length: text.length }, () => absoluteStart + start);
		const encoded = encodedPhpText(text, map, absoluteStart + start);
		return {
			type: 'static',
			text,
			numericText,
			displayExact: numericKind !== 'float-based-literal',
			map,
			...encoded,
			numericKind,
			start,
			end: start + based[0].length,
		};
	}
	const decimal = /^(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?/.exec(input);
	if (!decimal) return null;
	const numericText = decimal[0].replaceAll('_', '');
	let numericKind = 'float-literal';
	let oversizedInteger = false;
	if (/^\d+$/.test(numericText)) {
		try {
			oversizedInteger = BigInt(numericText) > 0x7fffffffffffffffn;
			numericKind = oversizedInteger ? 'float-literal' : 'int-literal';
		} catch {
			numericKind = 'float-literal';
		}
	}
	const text = oversizedInteger ? '0.0' : numericText;
	const map = [];
	for (let offset = 0; offset < decimal[0].length; offset++) {
		if (decimal[0][offset] !== '_' && !oversizedInteger) map.push(absoluteStart + start + offset);
	}
	if (oversizedInteger) map.push(...Array.from({ length: text.length }, () => absoluteStart + start));
	return { type: 'static', text, numericText, displayExact: !oversizedInteger, map, ...encodedPhpText(text, map, absoluteStart + start), numericKind, start, end: start + decimal[0].length };
}

function phpTokens(source, absoluteStart) {
	const tokens = [];
	for (let index = 0; index < source.length;) {
		if (/\s/.test(source[index])) {
			index++;
			continue;
		}
		if (source.startsWith('//', index) || (source[index] === '#' && source[index + 1] !== '[')) {
			const relativeNewline = source.slice(index + 1).search(/\r|\n/);
			index = relativeNewline === -1 ? source.length : index + 2 + relativeNewline;
			continue;
		}
		if (source.startsWith('/*', index)) {
			const close = source.indexOf('*/', index + 2);
			index = close === -1 ? source.length : close + 2;
			continue;
		}
		if (source[index] === '"' || source[index] === "'") {
			const token = phpStringToken(source, index, absoluteStart);
			tokens.push(token);
			index = token.end;
			continue;
		}
		if (source[index] === '`') {
			const quote = source[index++];
			while (index < source.length && source[index] !== quote) index += source[index] === '\\' ? 2 : 1;
			if (source[index] === quote) index++;
			tokens.push({ type: 'dynamic', value: 'backtick' });
			continue;
		}
		if (source.startsWith('<<<', index)) {
			const token = phpHeredocToken(source, index, absoluteStart);
			if (token) {
				tokens.push(token);
				index = token.end;
				continue;
			}
		}
		const number = phpNumberToken(source, index, absoluteStart);
		if (number) {
			tokens.push(number);
			index = number.end;
			continue;
		}
		const variable = /^\$[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*/.exec(source.slice(index));
		if (variable) {
			tokens.push({ type: 'dynamic', value: variable[0], start: index, end: index + variable[0].length });
			index += variable[0].length;
			continue;
		}
		const identifier = /^[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*/.exec(source.slice(index));
		if (identifier) {
			const value = identifier[0].toLowerCase();
			if (value === 'true') {
				tokens.push({ type: 'static', text: '1', map: [absoluteStart + index], bytes: Buffer.from('1'), byteMap: [absoluteStart + index], start: index, end: index + identifier[0].length });
			} else if (value === 'false' || value === 'null') {
				tokens.push({ type: 'static', text: '', map: [], bytes: Buffer.alloc(0), byteMap: [], start: index, end: index + identifier[0].length });
			} else {
				tokens.push({ type: 'identifier', value, start: index, end: index + identifier[0].length });
			}
			index += identifier[0].length;
			continue;
		}
		tokens.push({ type: 'punctuation', value: source[index], start: index, end: index + 1 });
		index++;
	}
	return tokens;
}

function renderedEchoValue(tokens, absoluteFallback) {
	const bytes = [];
	const byteMap = [];
	let previous = null;
	let depth = 0;
	const depths = new Map();
	for (const token of tokens) {
		depths.set(token, depth);
		if (token.type === 'punctuation' && ['(', '[', '{'].includes(token.value)) depth++;
		if (token.type === 'punctuation' && [')', ']', '}'].includes(token.value)) depth = Math.max(0, depth - 1);
	}
	for (let index = 0; index < tokens.length; index++) {
		const literal = tokens[index];
		if (literal.type !== 'string' && literal.type !== 'static') continue;
		if (previous) {
			const between = tokens.slice(previous.index + 1, index);
			const previousDepth = depths.get(previous.literal);
			const joins = between.every((token) => token.type === 'punctuation'
				&& (token.value === '.' || (token.value === ',' && depths.get(token) === 0)))
				&& depths.get(literal) === previousDepth;
			if (!joins) {
				bytes.push(0x20);
				byteMap.push(literal.map[0] ?? absoluteFallback);
			}
		}
		const encoded = literal.bytes
			? { bytes: literal.bytes, byteMap: literal.byteMap }
			: encodedPhpText(literal.text, literal.map, absoluteFallback);
		bytes.push(...encoded.bytes);
		byteMap.push(...encoded.byteMap);
		previous = { literal, index };
	}
	return decodedPhpBytes(Buffer.from(bytes), byteMap, absoluteFallback);
}

function renderedEchoOperand(tokens, absoluteFallback) {
	const collapsed = collapseNestedPrintf(tokens, absoluteFallback);
	const value = renderedEchoValue(collapsed.tokens, absoluteFallback);
	return decodedPhpBytes(
		Buffer.concat([collapsed.bytes, value.bytes]),
		[...collapsed.byteMap, ...value.byteMap],
		absoluteFallback,
	);
}

function renderedEchoExpression(tokens, absoluteFallback) {
	const bytes = [];
	const byteMap = [];
	for (const operand of splitPhpArguments(tokens)) {
		const rendered = renderedEchoOperand(operand, absoluteFallback);
		bytes.push(...rendered.bytes);
		byteMap.push(...rendered.byteMap);
	}
	return decodedPhpBytes(Buffer.from(bytes), byteMap, absoluteFallback);
}

function renderedStaticPhpExpression(tokens, absoluteFallback) {
	const collapsed = collapseNestedPrintf(tokens, absoluteFallback);
	const normalized = [];
	let known = true;
	for (let index = 0; index < collapsed.tokens.length; index++) {
		const token = collapsed.tokens[index];
		if (token.known === false) known = false;
		if (token.type === 'string' || token.type === 'static'
			|| (token.type === 'punctuation' && ['.', '(', ')'].includes(token.value))) {
			normalized.push(token);
			continue;
		}
		if (token.type === 'punctuation' && ['+', '-'].includes(token.value)
			&& collapsed.tokens[index + 1]?.type === 'static'
			&& (!normalized.length || (normalized.at(-1).type === 'punctuation' && ['.', '('].includes(normalized.at(-1).value)))) {
			const signSource = absoluteFallback + (token.start ?? 0);
			normalized.push({ type: 'static', text: token.value, map: [signSource], bytes: Buffer.from(token.value), byteMap: [signSource], unarySign: true, start: token.start, end: token.end });
			continue;
		}
		known = false;
	}
	const value = renderedEchoValue(normalized, absoluteFallback);
	const literalTokens = normalized.filter((token) => token.type === 'string' || token.type === 'static');
	let origin = 'computed';
	let coercionText = value.text;
	const displayExact = literalTokens.every((token) => token.displayExact !== false);
	if (literalTokens.length === 1) {
		origin = literalTokens[0].numericKind ?? (literalTokens[0].type === 'string' ? 'string' : 'computed');
		coercionText = literalTokens[0].numericText ?? value.text;
	} else if (literalTokens.length === 2 && literalTokens[0].unarySign && literalTokens[1].numericKind) {
		origin = literalTokens[1].numericKind;
		coercionText = literalTokens[0].text + (literalTokens[1].numericText ?? literalTokens[1].text);
	} else if (literalTokens.length > 1
		&& normalized.some((token) => token.type === 'punctuation' && token.value === '.')) {
		origin = 'string';
	}
	return {
		known,
		origin,
		coercionText,
		displayExact,
		text: value.text,
		map: value.map,
		bytes: value.bytes,
		byteMap: value.byteMap,
		effectText: collapsed.text,
		effectMap: collapsed.map,
		effectBytes: collapsed.bytes,
		effectByteMap: collapsed.byteMap,
	};
}

function splitPhpArguments(tokens) {
	const argumentsList = [[]];
	let depth = 0;
	for (const token of tokens) {
		if (token.type === 'punctuation' && ['(', '[', '{'].includes(token.value)) depth++;
		if (token.type === 'punctuation' && [')', ']', '}'].includes(token.value)) depth = Math.max(0, depth - 1);
		if (token.type === 'punctuation' && token.value === ',' && depth === 0) {
			argumentsList.push([]);
		} else {
			argumentsList.at(-1).push(token);
		}
	}
	return argumentsList;
}

function phpIntegerValue(text, origin = 'computed') {
	if (origin === 'float-based-literal') return null;
	const numeric = /^[\t\n\r\f\v ]*([+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?))/i.exec(text)?.[1];
	if (!numeric) return null;
	if (/^[+-]?\d+$/.test(numeric)) {
		try {
			const integer = BigInt(numeric);
			if (origin === 'string') {
				if (integer > 0x7fffffffffffffffn) return 0x7fffffffffffffffn;
				if (integer < -0x8000000000000000n) return -0x8000000000000000n;
			}
			if (origin === 'float-literal') return BigInt.asIntN(64, BigInt(Number(numeric)));
			return integer;
		} catch {
			return null;
		}
	}
	const number = Number(numeric);
	return Number.isFinite(number) && Number.isSafeInteger(Math.trunc(number))
		? BigInt(Math.trunc(number))
		: null;
}

function phpIntegerFormat(value, specifier) {
	if (specifier === 'd') return value.toString(10);
	const unsigned = BigInt.asUintN(64, value);
	if (specifier === 'u') return unsigned.toString(10);
	if (specifier === 'b') return unsigned.toString(2);
	if (specifier === 'o') return unsigned.toString(8);
	if (specifier === 'x') return unsigned.toString(16);
	if (specifier === 'X') return unsigned.toString(16).toUpperCase();
	return null;
}

function renderedPrintfExpression(tokens, absoluteFallback) {
	const argumentsList = splitPhpArguments(tokens);
	const format = renderedStaticPhpExpression(argumentsList.shift() ?? [], absoluteFallback);
	const values = argumentsList.map((argument) => renderedStaticPhpExpression(argument, absoluteFallback));
	const effectBytes = [...format.effectBytes];
	const effectByteMap = [...format.effectByteMap];
	for (const value of values) {
		effectBytes.push(...value.effectBytes);
		effectByteMap.push(...value.effectByteMap);
	}
	const bytes = [];
	const byteMap = [];
	let returnKnown = format.known;
	let sequential = 0;
	const append = (value, sourceMap, fallback) => {
		bytes.push(...value);
		byteMap.push(...Array.from({ length: value.length }, (_, offset) => sourceMap[offset] ?? fallback));
	};
	const formatText = format.bytes.toString('latin1');
	for (let index = 0; index < formatText.length;) {
		if (formatText[index] !== '%') {
			append(Buffer.from([format.bytes[index]]), [format.byteMap[index]], absoluteFallback);
			index++;
			continue;
		}
		if (formatText[index + 1] === '%') {
			append(Buffer.from('%'), [format.byteMap[index]], absoluteFallback);
			index += 2;
			continue;
		}
		const directive = /^%(?:(\d+)\$)?((?:[-+ 0]|'.)*)(?:(\d+)|(\*)(?:(\d+)\$)?)?(?:\.(?:(\d+)|(\*)(?:(\d+)\$)?)?)?([bcdeEfFgGouxXhHs])/.exec(formatText.slice(index));
		if (!directive) {
			append(Buffer.from('%'), [format.byteMap[index]], absoluteFallback);
			index++;
			continue;
		}
		let width = directive[3] ? Number.parseInt(directive[3], 10) : null;
		if (directive[4]) {
			const widthValue = values[directive[5] ? Number.parseInt(directive[5], 10) - 1 : sequential++];
			width = widthValue?.known && /^[+-]?\d+$/.test(widthValue.text) ? Number.parseInt(widthValue.text, 10) : null;
			if (width === null) returnKnown = false;
		}
		let precision = directive[6] ? Number.parseInt(directive[6], 10) : null;
		let precisionUnknown = false;
		if (directive[7]) {
			const precisionValue = values[directive[8] ? Number.parseInt(directive[8], 10) - 1 : sequential++];
			precision = precisionValue?.known && /^[+-]?\d+$/.test(precisionValue.text) ? Number.parseInt(precisionValue.text, 10) : null;
			if (precision === null) {
				precisionUnknown = true;
				returnKnown = false;
			}
		}
		const valueIndex = directive[1] ? Number.parseInt(directive[1], 10) - 1 : sequential++;
		const value = values[valueIndex];
		const rawSpecifier = directive[9];
		const specifier = rawSpecifier.toLowerCase();
		const flags = directive[2];
		const customPad = /'(.)/.exec(flags)?.[1];
		const ordinaryFlags = flags.replace(/'./g, '');
		const numericSpecifier = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'o', 'u', 'x'].includes(specifier);
		let renderedBytes;
		let renderedByteMap;
		let renderedExact = false;
		if (value?.known) {
			renderedBytes = value.bytes;
			renderedByteMap = [...value.byteMap];
			const integer = phpIntegerValue(value.coercionText, value.origin);
			if (specifier === 'c') {
				if (integer === null) {
					returnKnown = false;
					renderedBytes = Buffer.from(';');
				} else {
					renderedBytes = Buffer.from([Number(BigInt.asUintN(8, integer))]);
					renderedExact = true;
				}
				renderedByteMap = [value.byteMap[0] ?? format.byteMap[index] ?? absoluteFallback];
			} else if (['b', 'd', 'o', 'u', 'x'].includes(specifier)) {
				const formattedInteger = integer === null ? null : phpIntegerFormat(integer, rawSpecifier);
				if (formattedInteger === null) {
					returnKnown = false;
					renderedBytes = Buffer.from('0');
					renderedByteMap = [format.byteMap[index] ?? absoluteFallback];
				} else {
					renderedBytes = Buffer.from(formattedInteger);
					renderedByteMap = Array.from({ length: renderedBytes.length }, () => value.byteMap[0] ?? absoluteFallback);
					renderedExact = value.displayExact !== false;
				}
			} else if (!['s'].includes(specifier)) {
				// Float conversions depend on PHP-specific coercion, locale and exponent
				// formatting. A decimal placeholder preserves a token boundary next to
				// CSS units, while an unknown return count prevents unsafe inference.
				returnKnown = false;
				renderedBytes = Buffer.from('0.0');
				renderedByteMap = Array.from({ length: renderedBytes.length }, () => format.byteMap[index] ?? absoluteFallback);
			}
			if (specifier === 's') {
				renderedExact = value.displayExact !== false;
				if (!renderedExact) returnKnown = false;
			}
		} else {
			returnKnown = false;
			const floatSpecifier = ['e', 'f', 'g', 'h'].includes(specifier);
			const placeholder = floatSpecifier ? '0.0' : (numericSpecifier ? '0' : ';');
			renderedBytes = Buffer.from(placeholder);
			renderedByteMap = Array.from({ length: renderedBytes.length }, () => format.byteMap[index] ?? absoluteFallback);
		}
		const signedSpecifier = specifier === 'd' || ['e', 'f', 'g', 'h'].includes(specifier);
		if (signedSpecifier && ordinaryFlags.includes('+') && renderedBytes[0] !== 0x2d && renderedBytes[0] !== 0x2b) {
			renderedBytes = Buffer.concat([Buffer.from('+'), renderedBytes]);
			renderedByteMap = [format.byteMap[index] ?? absoluteFallback, ...renderedByteMap];
		}
		if (precisionUnknown) {
			renderedBytes = Buffer.from('0');
			renderedByteMap = [value?.byteMap[0] ?? format.byteMap[index] ?? absoluteFallback];
			renderedExact = false;
		} else if (specifier === 's' && precision !== null && precision >= 0) {
			if (!renderedExact && precision > 0) {
				// The unknown string may begin with a digit. Keep that possible
				// boundary visible beside a CSS unit after precision truncation.
				renderedBytes = Buffer.from('0');
				renderedByteMap = [value?.byteMap[0] ?? format.byteMap[index] ?? absoluteFallback];
			} else {
				renderedBytes = renderedBytes.subarray(0, precision);
				renderedByteMap = renderedByteMap.slice(0, precision);
				if (precision === 0) renderedExact = true;
			}
		} else if (['b', 'o', 'x'].includes(specifier) && precision !== null) {
			renderedBytes = Buffer.alloc(0);
			renderedByteMap = [];
			renderedExact = true;
		}
		const leftAligned = width !== null && (width < 0 || ordinaryFlags.includes('-'));
		const widthCanBeModeled = specifier !== 'c' && !(leftAligned && !renderedExact);
		if (widthCanBeModeled && width !== null && Math.abs(width) > renderedBytes.length) {
			const zeroPad = ordinaryFlags.includes('0') && !(leftAligned && ['d', 'u'].includes(specifier));
			const pad = customPad ? customPad.charCodeAt(0) : (zeroPad ? 0x30 : 0x20);
			const padding = Buffer.alloc(Math.abs(width) - renderedBytes.length, pad);
			const paddingMap = Array.from({ length: padding.length }, () => format.byteMap[index] ?? absoluteFallback);
			if (leftAligned) {
				renderedBytes = Buffer.concat([renderedBytes, padding]);
				renderedByteMap = [...renderedByteMap, ...paddingMap];
			} else if (pad === 0x30 && (renderedBytes[0] === 0x2d || renderedBytes[0] === 0x2b)) {
				renderedBytes = Buffer.concat([renderedBytes.subarray(0, 1), padding, renderedBytes.subarray(1)]);
				renderedByteMap = [renderedByteMap[0], ...paddingMap, ...renderedByteMap.slice(1)];
			} else {
				renderedBytes = Buffer.concat([padding, renderedBytes]);
				renderedByteMap = [...paddingMap, ...renderedByteMap];
			}
		}
		append(renderedBytes, renderedByteMap, format.byteMap[index] ?? absoluteFallback);
		index += directive[0].length;
	}
	const formatted = decodedPhpBytes(Buffer.from(bytes), byteMap, absoluteFallback);
	const rendered = decodedPhpBytes(
		Buffer.concat([Buffer.from(effectBytes), formatted.bytes]),
		[...effectByteMap, ...formatted.byteMap],
		absoluteFallback,
	);
	return { ...rendered, formattedText: formatted.text, formattedMap: formatted.map, formattedBytes: formatted.bytes, formattedByteLength: formatted.bytes.length, returnKnown };
}

function isPhpMemberAccess(tokens, index) {
	const previous = tokens[index - 1];
	const beforePrevious = tokens[index - 2];
	return previous?.type === 'punctuation'
		&& ((previous.value === '>' && beforePrevious?.type === 'punctuation' && beforePrevious.value === '-')
			|| (previous.value === ':' && beforePrevious?.type === 'punctuation' && beforePrevious.value === ':'));
}

function collapseNestedPrintf(tokens, absoluteFallback) {
	const collapsed = [];
	const bytes = [];
	const byteMap = [];
	for (let index = 0; index < tokens.length;) {
		const callable = tokens[index].type === 'identifier' && tokens[index].value === 'printf'
			&& tokens[index + 1]?.type === 'punctuation' && tokens[index + 1].value === '('
			&& !isPhpMemberAccess(tokens, index);
		if (!callable) {
			collapsed.push(tokens[index++]);
			continue;
		}
		let cursor = index + 2;
		let depth = 1;
		const expression = [];
		while (cursor < tokens.length && depth > 0) {
			const token = tokens[cursor++];
			if (token.type === 'punctuation' && token.value === '(') depth++;
			if (token.type === 'punctuation' && token.value === ')') depth--;
			if (depth > 0) expression.push(token);
		}
		const rendered = renderedPrintfExpression(expression, absoluteFallback);
		bytes.push(...rendered.bytes);
		byteMap.push(...rendered.byteMap);
		const returnValue = rendered.returnKnown ? String(rendered.formattedByteLength) : '1';
		const callableStart = absoluteFallback + (tokens[index].start ?? 0);
		const returnMap = Array.from({ length: returnValue.length }, () => callableStart);
		const encodedReturn = encodedPhpText(returnValue, returnMap, callableStart);
		collapsed.push({
			type: 'static',
			text: returnValue,
			map: returnMap,
			...encodedReturn,
			known: rendered.returnKnown,
			start: tokens[index].start,
			end: tokens[cursor - 1]?.end ?? tokens[index].end,
		});
		index = cursor;
	}
	return { tokens: collapsed, ...decodedPhpBytes(Buffer.from(bytes), byteMap, absoluteFallback) };
}

function renderedPhpOutput(php, absoluteStart) {
	const opener = /^<\?(?:php\b)?/i.exec(php)?.[0] ?? '<?';
	const bodyStart = php.startsWith('<?=') ? 3 : opener.length;
	const bodyEnd = php.endsWith('?>') ? php.length - 2 : php.length;
	const body = php.slice(bodyStart, bodyEnd);
	const tokens = phpTokens(body, absoluteStart + bodyStart);
	const expressions = [];
	if (php.startsWith('<?=')) {
		expressions.push({ kind: 'echo', tokens });
	} else {
		let attributeDepth = 0;
		for (let index = 0; index < tokens.length;) {
			if (attributeDepth > 0) {
				if (tokens[index].type === 'punctuation' && tokens[index].value === '[') attributeDepth++;
				if (tokens[index].type === 'punctuation' && tokens[index].value === ']') attributeDepth--;
				index++;
				continue;
			}
			if (tokens[index].type === 'punctuation' && tokens[index].value === '#'
				&& tokens[index + 1]?.type === 'punctuation' && tokens[index + 1].value === '[') {
				attributeDepth = 1;
				index += 2;
				continue;
			}
			const memberAccess = isPhpMemberAccess(tokens, index);
			const callableOutput = tokens[index].type === 'identifier' && tokens[index].value === 'printf'
				&& tokens[index + 1]?.type === 'punctuation' && tokens[index + 1].value === '(';
			const statementOutput = tokens[index].type === 'identifier' && ['echo', 'print'].includes(tokens[index].value);
			if ((!callableOutput && !statementOutput) || memberAccess) {
				index++;
				continue;
			}
			if (callableOutput) {
				const expression = [];
				let depth = 1;
				index += 2;
				while (index < tokens.length && depth > 0) {
					const token = tokens[index++];
					if (token.type === 'punctuation' && token.value === '(') depth++;
					if (token.type === 'punctuation' && token.value === ')') depth--;
					if (depth > 0) expression.push(token);
				}
				expressions.push({ kind: 'printf', tokens: expression });
				continue;
			}
			const expression = [];
			let depth = 0;
			index++;
			while (index < tokens.length) {
				const token = tokens[index];
				if (token.type === 'punctuation' && ['(', '[', '{'].includes(token.value)) depth++;
				if (token.type === 'punctuation' && [')', ']', '}'].includes(token.value)) depth = Math.max(0, depth - 1);
				if (token.type === 'punctuation' && token.value === ';' && depth === 0) break;
				expression.push(token);
				index++;
			}
			expressions.push({ kind: 'echo', tokens: expression });
			if (tokens[index]?.value === ';') index++;
		}
	}
	const bytes = [];
	const byteMap = [];
	for (const expression of expressions) {
		const rendered = expression.kind === 'printf'
			? renderedPrintfExpression(expression.tokens, absoluteStart + bodyStart)
			: renderedEchoExpression(expression.tokens, absoluteStart + bodyStart);
		bytes.push(...rendered.bytes);
		byteMap.push(...rendered.byteMap);
	}
	return decodedPhpBytes(Buffer.from(bytes), byteMap, absoluteStart + bodyStart);
}

const HTML_NAMED_CHARACTERS = new Map([
	['amp', '&'], ['AMP', '&'], ['apos', "'"], ['ast', '*'], ['bsol', '\\'],
	['colon', ':'], ['comma', ','], ['commat', '@'], ['dollar', '$'], ['equals', '='],
	['excl', '!'], ['grave', '`'], ['gt', '>'], ['GT', '>'], ['Hat', '^'],
	['lbrace', '{'], ['lbrack', '['], ['lcub', '{'], ['lpar', '('], ['lsqb', '['],
	['lt', '<'], ['LT', '<'], ['lowbar', '_'], ['minus', '-'], ['nbsp', '\u00a0'],
	['NewLine', '\n'], ['num', '#'], ['percnt', '%'], ['period', '.'], ['plus', '+'],
	['quest', '?'], ['quot', '"'], ['QUOT', '"'], ['rbrace', '}'], ['rbrack', ']'],
	['rcub', '}'], ['rpar', ')'], ['rsqb', ']'], ['semi', ';'], ['sol', '/'],
	['Tab', '\t'], ['UnderBar', '_'], ['vert', '|'], ['VerticalLine', '|'],
]);
const HTML_LEGACY_NAME_WITHOUT_SEMICOLON = new Set(['amp', 'AMP', 'gt', 'GT', 'lt', 'LT', 'nbsp', 'quot', 'QUOT']);
const HTML_NAMED_CHARACTER_NAMES = [...HTML_NAMED_CHARACTERS.keys()].sort((left, right) => right.length - left.length);

function namedHtmlReferenceAt(source, start) {
	for (const name of HTML_NAMED_CHARACTER_NAMES) {
		const prefix = `&${name}`;
		if (!source.startsWith(prefix, start)) continue;
		const next = source[start + prefix.length];
		if (next === ';') return { decoded: HTML_NAMED_CHARACTERS.get(name), length: prefix.length + 1 };
		if (HTML_LEGACY_NAME_WITHOUT_SEMICOLON.has(name) && !/[A-Za-z0-9=]/.test(next || '')) {
			return { decoded: HTML_NAMED_CHARACTERS.get(name), length: prefix.length };
		}
	}
	return null;
}

function decodeHtmlReferences(view) {
	let text = '';
	const map = [];
	for (let index = 0; index < view.text.length;) {
		if (view.text[index] === '&') {
			const numeric = /^&#(?:x([0-9a-f]+)|([0-9]+));?/i.exec(view.text.slice(index));
			const named = numeric ? null : namedHtmlReferenceAt(view.text, index);
			let decoded = null;
			if (numeric) {
				const point = Number.parseInt(numeric[1] || numeric[2], numeric[1] ? 16 : 10);
				decoded = point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
					? String.fromCodePoint(point) : '\ufffd';
			} else if (named) {
				decoded = named.decoded;
			}
			if (decoded !== null) {
				text += decoded;
				for (let offset = 0; offset < decoded.length; offset++) map.push(view.map[index]);
				index += numeric ? numeric[0].length : named.length;
				continue;
			}
		}
		text += view.text[index];
		map.push(view.map[index++]);
	}
	return { text, map };
}

function renderedCssView(source, absoluteStart, { attribute = false } = {}) {
	let text = '';
	const map = [];
	const resumeMap = [];
	let index = 0;
	const appendDirect = (end) => {
		while (index < end) {
			text += source[index];
			map.push(absoluteStart + index);
			resumeMap.push(absoluteStart + index + 1);
			index++;
		}
	};
	while (index < source.length) {
		const phpStart = source.indexOf('<?', index);
		if (phpStart === -1) {
			appendDirect(source.length);
			break;
		}
		appendDirect(phpStart);
		const end = phpEnd(source, phpStart);
		const rendered = renderedPhpOutput(source.slice(phpStart, end), absoluteStart + phpStart);
		text += rendered.text;
		map.push(...rendered.map);
		resumeMap.push(...Array.from({ length: rendered.text.length }, () => absoluteStart + end));
		index = end;
	}
	const view = { text, map, resumeMap };
	return attribute ? decodeHtmlReferences(view) : view;
}

function cssDeclarations(css) {
	const declarations = [];
	let start = 0;
	let quote = null;
	let depth = 0;
	let comment = false;
	for (let index = 0; index <= css.length; index++) {
		if (comment) {
			if (css.startsWith('*/', index)) {
				comment = false;
				index++;
			}
			continue;
		}
		if (quote) {
			if (css[index] === '\\') index++;
			else if (css[index] === quote) quote = null;
			continue;
		}
		if (css.startsWith('/*', index)) {
			comment = true;
			index++;
			continue;
		}
		if (css[index] === '"' || css[index] === "'") {
			quote = css[index];
			continue;
		}
		if (css[index] === '(') depth++;
		else if (css[index] === ')') depth = Math.max(0, depth - 1);
		if ((css[index] !== ';' || depth !== 0) && index !== css.length) continue;
		const end = index;
		const segment = css.slice(start, end);
		const tokenView = cssTokenView(segment);
		let colon = -1;
		let tokenQuote = null;
		let tokenDepth = 0;
		for (let tokenIndex = 0; tokenIndex < tokenView.text.length; tokenIndex++) {
			const char = tokenView.text[tokenIndex];
			if (tokenQuote) {
				if (char === '\\') tokenIndex++;
				else if (char === tokenQuote) tokenQuote = null;
				continue;
			}
			if (char === '"' || char === "'") {
				tokenQuote = char;
				continue;
			}
			if (char === '(') tokenDepth++;
			else if (char === ')') tokenDepth = Math.max(0, tokenDepth - 1);
			else if (char === ':' && tokenDepth === 0) {
				colon = tokenIndex;
				break;
			}
		}
		if (colon !== -1) {
			declarations.push({
				start,
				end,
				property: tokenView.text.slice(0, colon).trim().toLowerCase(),
				value: tokenView.text.slice(colon + 1).trim(),
			});
		}
		start = index + 1;
	}
	return declarations;
}

function withoutGeneratedDeclaration(css, property, valuePattern) {
	const candidates = cssDeclarations(css).filter((declaration) => declaration.property === property);
	if (candidates.length !== 1 || !valuePattern.test(candidates[0].value)) return css;
	const declaration = candidates[0];
	return css.slice(0, declaration.start) + blankOut(css.slice(declaration.start, declaration.end)) + css.slice(declaration.end);
}

export function checkRawValues(files) {
	const problems = [];
	for (const { file, contents } of files) {
		const source = String(contents);
		const maskedRanges = [];
		const addHits = (view) => {
			for (const hit of rawValueHits(view.text)) {
				const absoluteIndex = view.map[hit.index] ?? 0;
				const line = source.slice(0, absoluteIndex).split('\n').length;
				problems.push(`${file}:${line}: raw ${hit.label} "${hit.value}" — every value resolves to a theme.json preset`);
			}
		};
		for (const match of source.matchAll(BLOCK_RE)) {
			const json = match[4];
			if (!json) continue;
			const jsonOffset = match[0].indexOf(json);
			const jsonStart = match.index + jsonOffset;
			let normalized = json;
			try {
				JSON.parse(normalized);
			} catch {
				normalized = neutralizePhpInJson(json);
				try {
					JSON.parse(normalized);
				} catch {
					const line = source.slice(0, jsonStart).split('\n').length;
					problems.push(`${file}:${line}: malformed block attributes — raw values cannot be verified`);
					maskedRanges.push([jsonStart, jsonStart + json.length]);
					continue;
				}
			}
			const name = match[2].includes('/') ? match[2] : `core/${match[2]}`;
			for (const decoded of decodedJsonStrings(normalized, jsonStart)) {
				if (name === 'core/image' && decoded.directProperty && decoded.objectDepth === 1 && decoded.key === 'width' && /^\d+px$/.test(decoded.value)) continue;
				if (BLOCK_URL_ATTRIBUTE_KEYS.has(decoded.key?.toLowerCase())) continue;
				for (const hit of rawValueHits(decoded.value)) {
					const absoluteIndex = decoded.map[hit.index] ?? jsonStart;
					const line = source.slice(0, absoluteIndex).split('\n').length;
					problems.push(`${file}:${line}: raw ${hit.label} "${hit.value}" — every value resolves to a theme.json preset`);
				}
			}
			maskedRanges.push([jsonStart, jsonStart + json.length]);
		}

		let sourceWithoutBlockJson = source;
		for (const [start, end] of maskedRanges.reverse()) {
			sourceWithoutBlockJson = sourceWithoutBlockJson.slice(0, start) + blankOut(sourceWithoutBlockJson.slice(start, end)) + sourceWithoutBlockJson.slice(end);
		}
		const scannable = scannableSource(sourceWithoutBlockJson);
		const renderedMarkup = renderedCssView(scannable, 0);
		const contexts = markupContexts(renderedMarkup.text);
		for (const style of contexts.styles) {
			addHits({
				text: renderedMarkup.text.slice(style.start, style.end),
				map: renderedMarkup.map.slice(style.start, style.end),
			});
		}
		for (const tag of contexts.tags) {
			const attributes = new Map();
			for (const attribute of tag.attributes) {
				const directView = attribute.value === null ? null : decodeHtmlReferences({
					text: attribute.value,
					map: renderedMarkup.map.slice(attribute.valueStart, attribute.valueEnd),
				});
				attribute.decodedView = directView;
				attribute.decodedValue = directView?.text ?? null;
				if (!attributes.has(attribute.name)) attributes.set(attribute.name, attribute);
			}
			const classes = attributes.get('class')?.decodedValue?.split(/[\t\n\f\r ]+/).filter(Boolean) ?? [];
			for (const attribute of tag.attributes) {
				if (attribute.value === null || isMarkupUrlAttribute(attribute.name, tag.name, tag.namespace, attributes)) continue;
				if (attribute.name !== 'style') {
					addHits(attribute.decodedView);
					continue;
				}
				let css = attribute.value;
				if (classes.includes('wp-block-cover')) {
					css = withoutGeneratedDeclaration(css, 'min-height', /^\d+(?:\.\d+)?(?:px|rem|em|vh|vw)$/i);
				}
				if (tag.name === 'div' && classes.includes('wp-block-spacer')) {
					css = withoutGeneratedDeclaration(css, 'height', /^\d+(?:\.\d+)?px$/i);
				}
				addHits(decodeHtmlReferences({
					text: css,
					map: renderedMarkup.map.slice(attribute.valueStart, attribute.valueEnd),
				}));
			}
		}
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
