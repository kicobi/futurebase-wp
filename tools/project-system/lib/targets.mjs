// Capture-target validation and redaction.
//
// URLs are durable project evidence: they are copied into summaries, reports,
// inspection output, and dry-run plans. Keep the acceptance boundary and the
// defence-in-depth rendering boundary together so a historical unsafe value
// cannot be re-emitted by a newer CLI.

const REDACTED_TARGET = '[redacted unsafe target]';
const DUMMY_ORIGIN = 'https://relative.invalid/';

const SECRET_PARAMETERS = new Set([
	'api_key',
	'apikey',
	'access_token',
	'auth_token',
	'authorization',
	'bearer_token',
	'client_secret',
	'credential',
	'credentials',
	'id_token',
	'password',
	'passwd',
	'passcode',
	'private_key',
	'refresh_token',
	'secret',
	'jsessionid',
	'phpsessid',
	'session_id',
	'sessionid',
	'session_token',
	'token',
]);

function canonicalParameter(name) {
	return String(name).trim().toLowerCase().replace(/[\[\].-]+/g, '_').replace(/^_+|_+$/g, '');
}

export function isSecretParameter(name) {
	const canonical = canonicalParameter(name);
	const bounded = `_${canonical}_`;
	return [...SECRET_PARAMETERS].some((secret) => bounded.includes(`_${secret}_`));
}

function isAbsoluteReference(value) {
	return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//');
}

function parsePageUrl(value, baseUrl) {
	const raw = String(value);
	if (isAbsoluteReference(raw)) return new URL(raw, baseUrl || DUMMY_ORIGIN);
	return new URL(raw, baseUrl || DUMMY_ORIGIN);
}

function hasSecretQuery(url) {
	for (const name of url.searchParams.keys()) {
		if (isSecretParameter(name)) return true;
	}
	return false;
}

const PATH_PARAMETER_RE = /;([^=;/]+)=([^;/]*)/g;

function decoded(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function hasSecretPath(url) {
	const pathname = decoded(url.pathname);
	for (const match of pathname.matchAll(PATH_PARAMETER_RE)) {
		if (isSecretParameter(decoded(match[1]))) return true;
	}
	return false;
}

// OAuth callbacks and SPA routers commonly place query-shaped data after `#`.
// Fragments never reach the server, but they are still durable configuration
// here and are copied into inspection/report output, so treat recognized names
// exactly as we do in the real query and matrix/path components.
const FRAGMENT_PARAMETER_RE = /(?:^|[?&;])([^=/?#&;]+)=([^#&;]*)/g;

function hasSecretFragment(url) {
	const fragment = decoded(url.hash.replace(/^#/, ''));
	for (const match of fragment.matchAll(FRAGMENT_PARAMETER_RE)) {
		if (isSecretParameter(decoded(match[1]))) return true;
	}
	return false;
}

// Strip literal matrix/path parameters such as `;jsessionid=...`. If the
// delimiter itself was encoded, rewriting only part of the encoded path risks
// leaving a credential behind after a downstream decode, so redact the whole
// target instead.
function stripSecretPath(url) {
	url.pathname = url.pathname.replace(PATH_PARAMETER_RE, (match, name) => {
		if (!isSecretParameter(decoded(name))) return match;
		return '';
	});
	return !hasSecretPath(url);
}

export function targetUrlHasSecret(value, { baseUrl = null } = {}) {
	if (value == null || value === '') return false;
	try {
		const url = parsePageUrl(String(value), baseUrl);
		return !!(url.username || url.password || hasSecretQuery(url) || hasSecretPath(url) || hasSecretFragment(url));
	} catch {
		return true;
	}
}

export function normalizeBaseUrl(value) {
	if (value == null || value === '') return null;
	let url;
	try {
		url = new URL(String(value));
	} catch {
		throw new Error('base_url must be an HTTP(S) origin without credentials, path, query, or fragment');
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.pathname !== '/' ||
		url.search ||
		url.hash
	) {
		throw new Error('base_url must be an HTTP(S) origin without credentials, path, query, or fragment');
	}
	return `${url.origin}/`;
}

export function captureTargetErrors(config) {
	if (!config || typeof config !== 'object') return [];
	const errors = [];
	let baseUrl = null;
	try {
		baseUrl = normalizeBaseUrl(config.base_url);
	} catch (error) {
		errors.push(`/base_url ${error.message}`);
	}

	for (const [index, page] of (Array.isArray(config.pages) ? config.pages : []).entries()) {
		if (!page || typeof page.url !== 'string') continue;
		let url;
		try {
			url = parsePageUrl(page.url, baseUrl);
		} catch {
			// A parser failure is not evidence that a target is harmless. Encoded
			// userinfo can make an absolute URL unparseable while still preserving
			// the credential bytes for a config/report to persist. Fail closed and
			// keep the error value-free.
			errors.push(`/pages/${index}/url must be a valid HTTP(S) page URL without credentials or secret parameters`);
			continue;
		}
		if (!['http:', 'https:'].includes(url.protocol)) {
			errors.push(`/pages/${index}/url must resolve to HTTP(S)`);
			continue;
		}
		if (url.username || url.password || hasSecretQuery(url) || hasSecretPath(url) || hasSecretFragment(url)) {
			errors.push(`/pages/${index}/url must not contain credentials or secret parameters`);
		}
	}
	return errors;
}

export function normalizeCaptureConfig(config) {
	return {
		...config,
		base_url: normalizeBaseUrl(config?.base_url),
		pages: Array.isArray(config?.pages) ? config.pages.map((page) => ({ ...page })) : config?.pages,
	};
}

export function sanitizeTargetUrl(value, { baseUrl = null, originOnly = false } = {}) {
	if (value == null || value === '') return null;
	const raw = String(value);
	let url;
	try {
		url = parsePageUrl(raw, baseUrl);
	} catch {
		return REDACTED_TARGET;
	}
	if (!['http:', 'https:'].includes(url.protocol)) return REDACTED_TARGET;
	url.username = '';
	url.password = '';
	if (!stripSecretPath(url)) return REDACTED_TARGET;
	if (hasSecretFragment(url)) url.hash = '';
	for (const name of [...url.searchParams.keys()]) {
		if (isSecretParameter(name)) url.searchParams.delete(name);
	}
	if (originOnly) return `${url.origin}/`;

	if (isAbsoluteReference(raw)) {
		if (raw.startsWith('//')) return `//${url.host}${url.pathname}${url.search}${url.hash}`;
		return url.toString();
	}
	if (raw.startsWith('?')) return `${url.search}${url.hash}` || '';
	if (raw.startsWith('#')) return url.hash;
	return `${url.pathname}${url.search}${url.hash}`;
}

export function sanitizeTargetSnapshot(target) {
	if (!target || typeof target !== 'object') return target;
	const safeBase = sanitizeTargetUrl(target.base_url, { originOnly: true });
	return {
		...target,
		base_url: safeBase,
		pages: Array.isArray(target.pages)
			? target.pages.map((page) => ({
				...page,
				url: sanitizeTargetUrl(page?.url, { baseUrl: safeBase }),
			}))
			: target.pages,
	};
}

export function sanitizeCaptureConfig(config) {
	if (!config || typeof config !== 'object') return config;
	return sanitizeTargetSnapshot(config);
}

export function sanitizeRunSummary(summary) {
	if (!summary || typeof summary !== 'object') return summary;
	return summary.target ? { ...summary, target: sanitizeTargetSnapshot(summary.target) } : { ...summary };
}
