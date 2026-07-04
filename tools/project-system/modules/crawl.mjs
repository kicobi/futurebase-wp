// modules/crawl.mjs — content-structure + header capture via built-in fetch.
// No browser required. Records per-page status/title/meta/headings, captures
// security/compression/cache headers, and checks internal links for breakage.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TIMEOUT_MS = 15000;
const MAX_LINK_CHECKS = 50;

async function fetchWithTimeout(url, opts = {}) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' });
	} finally {
		clearTimeout(t);
	}
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || null;

function parseHtml(html, pageUrl) {
	const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim() || null;
	const descTag = (html.match(/<meta[^>]+name=["']description["'][^>]*>/i) || [])[0] || '';
	const metaDescription = descTag ? attr(descTag, 'content') : null;
	const canonTag = (html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [])[0] || '';
	const canonical = canonTag ? attr(canonTag, 'href') : null;
	const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
	const links = [];
	for (const m of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)) {
		const href = m[1];
		if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
		try {
			links.push(new URL(href, pageUrl).toString());
		} catch {
			/* skip malformed */
		}
	}
	return { title, metaDescription, canonical, h1Count, links };
}

const HEADER_KEYS = [
	'strict-transport-security',
	'content-security-policy',
	'x-frame-options',
	'x-content-type-options',
	'referrer-policy',
	'content-encoding',
	'cache-control',
	'server',
];

export async function run(ctx) {
	const { pages, runDir, config } = ctx;
	const outDir = join(runDir, 'crawl');
	mkdirSync(outDir, { recursive: true });

	const origin = config.base_url ? new URL(config.base_url).origin : pages[0] ? new URL(pages[0].url).origin : null;
	const results = [];
	const allInternalLinks = new Set();
	let headers = null;
	let anyOk = false;

	for (const page of pages) {
		try {
			const res = await fetchWithTimeout(page.url);
			const html = /text\/html/i.test(res.headers.get('content-type') || '') ? await res.text() : '';
			const parsed = html ? parseHtml(html, res.url) : { title: null, metaDescription: null, canonical: null, h1Count: 0, links: [] };
			if (!headers) {
				headers = {};
				for (const k of HEADER_KEYS) headers[k] = res.headers.get(k);
				headers.https = res.url.startsWith('https://');
			}
			for (const l of parsed.links) if (origin && l.startsWith(origin)) allInternalLinks.add(l.split('#')[0]);
			results.push({
				name: page.name,
				url: page.url,
				final_url: res.url,
				status: res.status,
				redirected: res.redirected,
				title: parsed.title,
				metaDescription: parsed.metaDescription,
				canonical: parsed.canonical,
				h1Count: parsed.h1Count,
				internalLinks: parsed.links.length,
			});
			anyOk = true;
		} catch (err) {
			results.push({ name: page.name, url: page.url, status: null, error: String(err.message || err) });
		}
	}

	// Broken-link check on a bounded sample of discovered internal links.
	const toCheck = [...allInternalLinks].filter((l) => !pages.some((p) => p.url === l)).slice(0, MAX_LINK_CHECKS);
	const brokenLinks = [];
	for (const url of toCheck) {
		try {
			let res = await fetchWithTimeout(url, { method: 'HEAD' });
			if (res.status === 405 || res.status === 501) res = await fetchWithTimeout(url, { method: 'GET' });
			if (res.status >= 400) brokenLinks.push({ url, status: res.status });
		} catch (err) {
			brokenLinks.push({ url, error: String(err.message || err) });
		}
	}

	const summary = {
		pageCount: results.length,
		fetched: results.filter((r) => r.status && r.status < 400).length,
		brokenLinkCount: brokenLinks.length,
		missingTitles: results.filter((r) => r.status && !r.title).length,
		missingMetaDesc: results.filter((r) => r.status && !r.metaDescription).length,
	};

	writeFileSync(join(outDir, 'crawl.json'), JSON.stringify({ origin, headers, pages: results, brokenLinks, summary }, null, 2) + '\n', 'utf8');

	const status = !anyOk ? 'failed' : results.some((r) => !r.status || r.status >= 400) || brokenLinks.length ? 'complete_with_warnings' : 'complete';
	return {
		module: 'crawl',
		status,
		evidence_path: 'crawl/',
		tool: 'fetch',
		tool_version: process.version,
		reason: anyOk ? undefined : 'no pages could be fetched',
		headline: summary,
	};
}
