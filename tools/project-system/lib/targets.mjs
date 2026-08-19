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
	'session_token',
	'token',
]);

function canonicalParameter(name) {
	return String(name).trim().toLowerCase().replace(/[\[\].-]+/g, '_').replace(/^_+|_+$/g, '');
}

export function isSecretParameter(name) {
	const canonical = canonicalParameter(name);
	if (SECRET_PARAMETERS.has(canonical)) return true;
	return /(?:^|_)(?:password|passwd|secret|access_token|auth_token|client_secret|private_key|refresh_token|session_token)$/.test(canonical);
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
			// URL syntax remains the capture module's concern, but credential-like
			// values fail closed even when the URL parser cannot interpret them.
			if (/:\/\/[^/?#]*@/i.test(page.url) || /(?:^|[?&])[^=]*(?:password|passwd|secret|token|api[_-]?key)[^=]*=/i.test(page.url)) {
				errors.push(`/pages/${index}/url must not contain credentials or secret query parameters`);
			}
			continue;
		}
		if (!['http:', 'https:'].includes(url.protocol)) {
			errors.push(`/pages/${index}/url must resolve to HTTP(S)`);
			continue;
		}
		if (url.username || url.password || hasSecretQuery(url)) {
			errors.push(`/pages/${index}/url must not contain credentials or secret query parameters`);
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
