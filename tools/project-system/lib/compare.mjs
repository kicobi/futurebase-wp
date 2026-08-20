// lib/compare.mjs — diff a baseline run against a final run and render reports.
//
// Comparison is only valid when both runs measured the same thing the same way.
// This file used to claim the shared capture engine guaranteed that. It does
// not: the engine reads .project/baseline.yml, which is mutable and routinely
// edited between a baseline (months before launch) and a final (at cutover). A
// base_url or viewport changed in between produced two runs that were never
// comparable, and nothing said so — the rows rendered, the arrows pointed at
// improvements, and the limitations list was empty.
//
// So each run now carries a `target` snapshot of what it actually measured, and
// comparability is CHECKED here rather than assumed. Metrics missing on either
// side are still reported as "not comparable", never invented.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeBaseUrl, sanitizeTargetUrl, targetUrlHasSecret } from './targets.mjs';

const readJsonSafe = (p) => {
	try {
		return JSON.parse(readFileSync(p, 'utf8'));
	} catch {
		return null;
	}
};
const kb = (b) => (b == null ? null : Math.round(b / 1024));
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// direction: 'up' = higher is better, 'down' = lower is better.
function row(label, before, after, direction, unit = '') {
	let change = null;
	if (typeof before === 'number' && typeof after === 'number') {
		if (after === before) change = 'same';
		else {
			const improved = direction === 'up' ? after > before : after < before;
			change = improved ? 'better' : 'worse';
		}
	} else if (before == null || after == null) {
		change = 'n/a';
	}
	return { label, before, after, unit, change };
}

const baseIdentity = (url) => {
	try {
		const normalized = normalizeBaseUrl(url);
		return { valid: true, origin: normalized ? new URL(normalized).origin : null };
	} catch {
		return { valid: false, origin: null };
	}
};
// Trailing slash is not a difference worth blocking a comparison over.
// Query strings are: they can select a language, product, filter, or other
// materially different resource while keeping the same pathname. Fragments
// stay irrelevant because they never reach the server.
const pageIdentity = (url, base) => {
	if (!base.valid) return { valid: false, key: null, onBase: false };
	try {
		const parsed = base.origin ? new URL(url, `${base.origin}/`) : new URL(url);
		if (!['http:', 'https:'].includes(parsed.protocol)) return { valid: false, key: null, onBase: false };
		const onBase = base.origin !== null && parsed.origin === base.origin;
		const originKey = onBase ? '<base-origin>' : parsed.origin;
		return {
			valid: true,
			onBase,
			key: `${originKey}\0${parsed.username}\0${parsed.password}\0${parsed.pathname.replace(/\/+$/, '') || '/'}${parsed.search}`,
		};
	} catch {
		return { valid: false, key: null, onBase: false };
	}
};

const safeBaseUrl = (value) => sanitizeTargetUrl(value, { originOnly: true });
const safePageUrl = (value, baseUrl) => sanitizeTargetUrl(value, { baseUrl: safeBaseUrl(baseUrl) });
const viewportKey = (vs) =>
	(vs ?? [])
		.map((v) => `${v.name}:${v.width}x${v.height}`)
		.sort()
		.join(', ');
const toolKey = (mods) =>
	Object.fromEntries((mods ?? []).filter((m) => m.tool).map((m) => [m.module, `${m.tool}${m.tool_version ? `@${m.tool_version}` : ''}`]));

// Compare what the two runs measured, and how.
//
// The split matters. A different HOST is routinely intentional — a redesign
// baselines the old site and finals the new one — so it is disclosed, not
// refused. A different VIEWPORT SET is not a target difference but a METHOD
// difference: it changes what the numbers mean, so every performance row
// becomes an apples-to-oranges comparison that still renders as an arrow. That
// one blocks.
export function compareTargets(baselineSummary, finalSummary) {
	const limitations = [];
	const blocking = [];

	const b = baselineSummary?.target;
	const f = finalSummary?.target;
	if (!b || !f) {
		limitations.push('one or both runs predate target snapshots — comparability could not be verified, so treat this comparison as indicative only');
		return { limitations, blocking };
	}

	const bVp = viewportKey(b.viewports);
	const fVp = viewportKey(f.viewports);
	if (bVp !== fVp) {
		blocking.push(`viewports differ (baseline: ${bVp || 'none'} · final: ${fVp || 'none'}) — page-weight, layout and screenshot metrics are not comparable across different viewports`);
	}

	const bBase = baseIdentity(b.base_url);
	const fBase = baseIdentity(f.base_url);
	if (!bBase.valid || !fBase.valid) {
		blocking.push('one or both base URLs are malformed or unsafe — target identity cannot be verified');
	} else if ((bBase.origin === null) !== (fBase.origin === null)) {
		blocking.push('one run declares a base URL and the other does not — target identity cannot be verified');
	} else if (bBase.origin !== fBase.origin) {
		limitations.push(`base URL origin differs (baseline: ${bBase.origin ?? 'none'} · final: ${fBase.origin ?? 'none'}) — expected for a redesign that moves domain, but confirm it is deliberate`);
	}

	const bPages = (b.pages ?? []).map((p) => p.name).sort();
	const fPages = (f.pages ?? []).map((p) => p.name).sort();
	let pageTargetHasSecret = false;
	let pageTargetIsInvalid = false;
	for (const [target, base] of [
		[b, bBase],
		[f, fBase],
	]) {
		for (const page of target.pages ?? []) {
			if (targetUrlHasSecret(page.url, { baseUrl: base.origin })) pageTargetHasSecret = true;
			if (base.valid && !pageIdentity(page.url, base).valid) pageTargetIsInvalid = true;
		}
	}
	if (bPages.join('|') !== fPages.join('|')) {
		const onlyB = bPages.filter((p) => !fPages.includes(p));
		const onlyF = fPages.filter((p) => !bPages.includes(p));
		limitations.push(
			`page set differs — crawl and per-page metrics cover different ground` +
				(onlyB.length ? ` (baseline only: ${onlyB.join(', ')})` : '') +
				(onlyF.length ? ` (final only: ${onlyF.join(', ')})` : ''),
		);
	}

	// Matching NAMES are not matching pages. Comparing the labels alone let
	// `home = /` on one side and `home = /checkout/` on the other through with
	// nothing reported, and case-study will happily publish the difference as an
	// improvement.
	//
	// On a declared origin move the paths are expected to change too, and that is
	// already disclosed above — blocking there would break the redesign workflow
	// this tool exists for. An off-base origin receives no such exemption: it is a
	// different capture target even when the declared base itself moved.
	const bByName = new Map((b.pages ?? []).map((p) => [p.name, p.url]));
	if (bBase.valid && fBase.valid) {
		const blockingMoves = [];
		const allowedMoves = [];
		for (const p of f.pages ?? []) {
			const was = bByName.get(p.name);
			if (was === undefined) continue;
			const beforeIdentity = pageIdentity(was, bBase);
			const afterIdentity = pageIdentity(p.url, fBase);
			if (!beforeIdentity.valid || !afterIdentity.valid) {
				blockingMoves.push(`${p.name}: one or both targets are malformed or unsafe`);
				continue;
			}
			const secretBearing = targetUrlHasSecret(was, { baseUrl: bBase.origin }) || targetUrlHasSecret(p.url, { baseUrl: fBase.origin });
			if (secretBearing) {
				const beforeDisplay = safePageUrl(was, b.base_url);
				const afterDisplay = safePageUrl(p.url, f.base_url);
				blockingMoves.push(
					beforeDisplay === afterDisplay
						? `${p.name}: secret-bearing target differs or cannot support a public comparison`
						: `${p.name}: secret-bearing target differs (${beforeDisplay} → ${afterDisplay}) and cannot support a public comparison`,
				);
				continue;
			}
			if (beforeIdentity.key === afterIdentity.key) continue;

			const beforeDisplay = safePageUrl(was, b.base_url);
			const afterDisplay = safePageUrl(p.url, f.base_url);
			const detail = `${p.name}: ${beforeDisplay} → ${afterDisplay}`;
			const followsDeclaredMove = Boolean(bBase.origin && fBase.origin) && beforeIdentity.onBase && afterIdentity.onBase && bBase.origin !== fBase.origin;
			(followsDeclaredMove ? allowedMoves : blockingMoves).push(detail);
		}
		if (blockingMoves.length) {
			blocking.push(`the same page name measures a different path, query, or origin (${blockingMoves.join(' · ')}) — that is a different page, not a changed one`);
		}
		if (allowedMoves.length) {
			limitations.push(`the same page name measures a different path, query, or origin (${allowedMoves.join(' · ')}) — expected alongside the declared origin move, but confirm each pairing is the page you mean`);
		}
	}
	if (pageTargetHasSecret && !blocking.some((reason) => reason.includes('secret-bearing target'))) {
		blocking.push('a secret-bearing target differs or cannot support a public comparison — every historical page target must be public and unauthenticated');
	}
	if (pageTargetIsInvalid && !blocking.some((reason) => reason.includes('targets are malformed or unsafe'))) {
		blocking.push('one or more page targets are malformed or have no verifiable HTTP(S) origin');
	}

	const bMods = (b.modules ?? []).slice().sort();
	const fMods = (f.modules ?? []).slice().sort();
	if (bMods.join('|') !== fMods.join('|')) {
		limitations.push(`module set differs (baseline: ${bMods.join(', ') || 'none'} · final: ${fMods.join(', ') || 'none'})`);
	}

	// Tool versions come from the per-module entries, which already record them.
	const bTools = toolKey(baselineSummary.modules);
	const fTools = toolKey(finalSummary.modules);
	for (const mod of Object.keys(bTools)) {
		if (fTools[mod] && bTools[mod] !== fTools[mod]) {
			limitations.push(`${mod} ran under different tool versions (baseline: ${bTools[mod]} · final: ${fTools[mod]}) — scores are not strictly comparable across versions`);
		}
	}

	return { limitations, blocking };
}

export function buildComparison(baselineRunDir, finalRunDir) {
	const rows = [];
	const limitations = [];

	// Comparability first: a mismatch here changes what every row below means.
	// Historical summaries predate capture validation and can contain durable
	// credentials. compareTargets keeps raw identities in memory so redaction
	// cannot erase a difference, but formats every reason from safe display URLs.
	const bSummary = readJsonSafe(join(baselineRunDir, 'summary.json'));
	const fSummary = readJsonSafe(join(finalRunDir, 'summary.json'));
	const { limitations: targetLimits, blocking } = compareTargets(bSummary, fSummary);
	limitations.push(...targetLimits);

	const bCrawl = readJsonSafe(join(baselineRunDir, 'crawl', 'crawl.json'));
	const fCrawl = readJsonSafe(join(finalRunDir, 'crawl', 'crawl.json'));
	if (bCrawl?.summary && fCrawl?.summary) {
		rows.push(row('Pages fetched', bCrawl.summary.fetched, fCrawl.summary.fetched, 'up'));
		rows.push(row('Broken internal links', bCrawl.summary.brokenLinkCount, fCrawl.summary.brokenLinkCount, 'down'));
		rows.push(row('Missing meta descriptions', bCrawl.summary.missingMetaDesc, fCrawl.summary.missingMetaDesc, 'down'));
	} else if (bCrawl || fCrawl) limitations.push('crawl data present on only one side — crawl metrics not compared');

	const bLh = readJsonSafe(join(baselineRunDir, 'lighthouse', 'extract.json'));
	const fLh = readJsonSafe(join(finalRunDir, 'lighthouse', 'extract.json'));
	if (bLh && fLh) {
		rows.push(row('Mobile performance', bLh.performance, fLh.performance, 'up'));
		rows.push(row('Accessibility (Lighthouse)', bLh.accessibility, fLh.accessibility, 'up'));
		rows.push(row('SEO (Lighthouse)', bLh.seo, fLh.seo, 'up'));
		rows.push(row('LCP', bLh.lcp_ms, fLh.lcp_ms, 'down', 'ms'));
		rows.push(row('CLS', bLh.cls, fLh.cls, 'down'));
		rows.push(row('Total page weight', kb(bLh.total_byte_weight), kb(fLh.total_byte_weight), 'down', 'KB'));
		rows.push(row('Requests', bLh.requests, fLh.requests, 'down'));
	} else if (bLh || fLh) limitations.push('Lighthouse present on only one side — performance not compared');

	const bAxe = readJsonSafe(join(baselineRunDir, 'accessibility', 'summary.json'));
	const fAxe = readJsonSafe(join(finalRunDir, 'accessibility', 'summary.json'));
	if (bAxe && fAxe) {
		for (const impact of ['critical', 'serious', 'moderate', 'minor']) {
			rows.push(row(`axe ${impact}`, bAxe[impact], fAxe[impact], 'down'));
		}
	} else if (bAxe || fAxe) limitations.push('axe present on only one side — accessibility violations not compared');

	const bWp = readJsonSafe(join(baselineRunDir, 'wordpress', 'wordpress.json'));
	const fWp = readJsonSafe(join(finalRunDir, 'wordpress', 'wordpress.json'));
	if (bWp && fWp) rows.push(row('Active plugins', bWp.plugin_summary?.active, fWp.plugin_summary?.active, 'down'));

	return { rows, limitations, blocking };
}

const fmt = (v, unit) => (v == null ? '—' : `${v}${unit ? ' ' + unit : ''}`);
const arrow = { better: '▲ improved', worse: '▼ regressed', same: '– no change', 'n/a': 'not comparable' };

export function renderComparison({ projectName, baselineRun, finalRun, comparison, metrics }) {
	const { rows, limitations, blocking = [] } = comparison;

	// --- internal (full) Markdown ---
	const md = [];
	md.push(`# Before / after — ${projectName}`);
	md.push('');
	md.push(`Baseline: \`${baselineRun}\`  →  Final: \`${finalRun}\``);
	md.push('');
	// Above the table, not below it. A caveat printed after the numbers is read
	// after the numbers have already landed.
	if (blocking.length) {
		md.push('> **These runs are not comparable.**');
		md.push('>');
		for (const b of blocking) md.push(`> - ${b}`);
		md.push('>');
		md.push('> The table below is rendered for inspection only. Do not quote it.');
		md.push('');
	}
	md.push('| Measure | Before | After | Change |');
	md.push('|---------|--------|-------|--------|');
	for (const r of rows) md.push(`| ${r.label} | ${fmt(r.before, r.unit)} | ${fmt(r.after, r.unit)} | ${arrow[r.change] || r.change || ''} |`);
	md.push('');
	if (metrics?.items?.length) {
		md.push('## Agreed success metrics');
		md.push('');
		for (const m of metrics.items) md.push(`- ${m.title} _(${m.category}, ${m.evidence_type}, owner ${m.owner})_`);
		md.push('');
	}
	if (limitations.length) {
		md.push('## Limitations');
		md.push('');
		for (const l of limitations) md.push(`- ${l}`);
		md.push('');
	}
	md.push('_Automated results are not an accessibility or SEO certification — they capture a machine-detectable subset._');
	const internalMd = md.join('\n');

	// --- client-safe Markdown ---
	const improved = rows.filter((r) => r.change === 'better');
	const cm = [];
	cm.push(`# ${projectName} — what changed`);
	cm.push('');
	cm.push('## What we agreed to improve');
	if (metrics?.items?.length) for (const m of metrics.items.filter((x) => x.category !== 'delivery')) cm.push(`- ${m.title}`);
	else cm.push('- _(success metrics not yet recorded)_');
	cm.push('');
	cm.push('## What improved');
	if (blocking.length) cm.push('- Before/after figures are withheld because the selected runs are not comparable.');
	else if (improved.length) for (const r of improved) cm.push(`- ${r.label}: ${fmt(r.before, r.unit)} → ${fmt(r.after, r.unit)}`);
	else cm.push('- _(no automated improvements to report yet)_');
	cm.push('');
	cm.push('## What will be reviewed after launch');
	const post = (metrics?.items || []).filter((m) => (m.measure_at || []).some((w) => /30_days|90_days|7_days/.test(w)));
	if (post.length) for (const m of post) cm.push(`- ${m.title}`);
	else cm.push('- _(no post-launch measures scheduled)_');
	cm.push('');
	if (limitations.length) {
		cm.push('## What could not be compared');
		for (const l of limitations) cm.push(`- ${l}`);
		cm.push('');
	}
	if (blocking.length) {
		cm.push('## Why before/after figures are withheld');
		for (const b of blocking) cm.push(`- ${b}`);
		cm.push('');
	}
	const clientMd = cm.join('\n');

	// --- HTML (internal, styled) ---
	const rowsHtml = rows
		.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(fmt(r.before, r.unit))}</td><td>${esc(fmt(r.after, r.unit))}</td><td class="ch-${r.change}">${esc(arrow[r.change] || '')}</td></tr>`)
		.join('\n');
	const html = `<!doctype html><html lang="en"><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Before / after — ${esc(projectName)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #e2e2e2}
.ch-better{color:#137333;font-weight:600}.ch-worse{color:#b3261e}.ch-same,.ch-n\\/a{color:#666}
.meta{color:#666}
</style>
<h1>Before / after — ${esc(projectName)}</h1>
<p class="meta">Baseline <code>${esc(baselineRun)}</code> → Final <code>${esc(finalRun)}</code></p>
${blocking.length ? `<section class="blocking"><h2>These runs are not comparable</h2><ul>${blocking.map((b) => `<li>${esc(b)}</li>`).join('')}</ul><p>The table is shown for inspection only. Do not quote it.</p></section>` : ''}
<table><thead><tr><th>Measure</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>${rowsHtml}</tbody></table>
${limitations.length ? `<h2>Limitations</h2><ul>${limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
<p class="meta">Automated results are not an accessibility or SEO certification — they capture a machine-detectable subset.</p>
</html>`;

	return { internalMd, clientMd, html };
}

export { readJsonSafe };
