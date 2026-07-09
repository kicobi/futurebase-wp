// lib/compare.mjs — diff a baseline run against a final run and render reports.
//
// Comparison is only valid when both runs used the same config (same URLs,
// viewports, tools) — which the shared capture engine guarantees. Metrics that
// are missing on either side are reported as "not comparable", never invented.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

export function buildComparison(baselineRunDir, finalRunDir) {
	const rows = [];
	const limitations = [];

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

	return { rows, limitations };
}

const fmt = (v, unit) => (v == null ? '—' : `${v}${unit ? ' ' + unit : ''}`);
const arrow = { better: '▲ improved', worse: '▼ regressed', same: '– no change', 'n/a': 'not comparable' };

export function renderComparison({ projectName, baselineRun, finalRun, comparison, metrics }) {
	const { rows, limitations } = comparison;

	// --- internal (full) Markdown ---
	const md = [];
	md.push(`# Before / after — ${projectName}`);
	md.push('');
	md.push(`Baseline: \`${baselineRun}\`  →  Final: \`${finalRun}\``);
	md.push('');
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
	if (improved.length) for (const r of improved) cm.push(`- ${r.label}: ${fmt(r.before, r.unit)} → ${fmt(r.after, r.unit)}`);
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
<table><thead><tr><th>Measure</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>${rowsHtml}</tbody></table>
${limitations.length ? `<h2>Limitations</h2><ul>${limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
<p class="meta">Automated results are not an accessibility or SEO certification — they capture a machine-detectable subset.</p>
</html>`;

	return { internalMd, clientMd, html };
}

export { readJsonSafe };
