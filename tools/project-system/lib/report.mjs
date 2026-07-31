// lib/report.mjs — render a baseline run into Markdown + HTML.
// Reads the run's summary and per-module headline data (passed in) and writes
// report.md + report.html into the run dir, plus a copy under .project/reports/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const kb = (bytes) => (bytes == null ? '—' : `${(bytes / 1024).toFixed(0)} KB`);
const ms = (v) => (v == null ? '—' : `${Math.round(v)} ms`);

function readJsonSafe(p) {
	try {
		return JSON.parse(readFileSync(p, 'utf8'));
	} catch {
		return null;
	}
}

// Build the headline lines from evidence on disk (authoritative) + results.
function headlines(runDir, results) {
	const lines = [];
	const crawl = readJsonSafe(join(runDir, 'crawl', 'crawl.json'));
	if (crawl?.summary) {
		const s = crawl.summary;
		lines.push(['Crawl', `${s.fetched}/${s.pageCount} pages fetched · ${s.brokenLinkCount} broken links · ${s.missingTitles} missing titles · ${s.missingMetaDesc} missing meta descriptions`]);
	}
	const lh = readJsonSafe(join(runDir, 'lighthouse', 'extract.json'));
	if (lh) {
		lines.push(['Lighthouse (mobile)', `perf ${lh.performance ?? '—'} · a11y ${lh.accessibility ?? '—'} · best-practices ${lh.bestPractices ?? '—'} · SEO ${lh.seo ?? '—'}`]);
		lines.push(['Core metrics', `LCP ${ms(lh.lcp_ms)} · CLS ${lh.cls ?? '—'} · TBT ${ms(lh.tbt_ms)} · weight ${kb(lh.total_byte_weight)} · ${lh.requests ?? '—'} requests`]);
	}
	const axe = readJsonSafe(join(runDir, 'accessibility', 'summary.json'));
	if (axe) lines.push(['axe violations', `critical ${axe.critical} · serious ${axe.serious} · moderate ${axe.moderate} · minor ${axe.minor} (${axe.pages} pages)`]);
	const wp = readJsonSafe(join(runDir, 'wordpress', 'wordpress.json'));
	if (wp) lines.push(['WordPress', `core ${wp.core_version} · PHP ${wp.php_version ?? '—'} · theme ${wp.active_theme ?? '—'} · ${wp.plugin_summary?.active ?? '?'} active plugins · ${(wp.post_types || []).length} post types`]);
	const shots = results.find((r) => r.module === 'screenshots');
	if (shots?.headline) lines.push(['Screenshots', `${shots.headline.captured} captured · ${shots.headline.failed} failed`]);
	return lines;
}

const EVIDENCE = [
	['crawl/crawl.json', 'Crawl data'],
	['lighthouse', 'Lighthouse reports'],
	['accessibility', 'axe results'],
	['screenshots/gallery.html', 'Screenshot gallery'],
	['notes', 'Manual notes'],
];

export function generateReport({ runDir, reportsDir, summary, results, config, projectName, kind = 'baseline', runId }) {
	const head = headlines(runDir, results);
	if (!runId) throw new Error('generateReport requires a validated runId');
	const evidence = EVIDENCE.filter(([p]) => existsSync(join(runDir, p)));
	const Kind = kind.charAt(0).toUpperCase() + kind.slice(1);

	// --- Markdown ---
	const md = [];
	md.push(`# ${Kind} — ${projectName}`);
	md.push('');
	md.push(`- Run: \`${runId}\``);
	md.push(`- Mode: ${config.mode}  ·  Status: **${summary.status}**`);
	md.push(`- Target: ${config.base_url || '(new site — no existing URL)'}`);
	md.push('');
	md.push('## Modules');
	md.push('');
	md.push('| Module | Status | Tool |');
	md.push('|--------|--------|------|');
	for (const m of summary.modules) md.push(`| ${m.module} | ${m.status}${m.reason ? ` (${m.reason})` : ''} | ${m.tool || '—'}${m.tool_version ? ' ' + m.tool_version : ''} |`);
	md.push('');
	if (head.length) {
		md.push('## Headline');
		md.push('');
		for (const [k, v] of head) md.push(`- **${k}:** ${v}`);
		md.push('');
	}
	md.push('## Evidence');
	md.push('');
	for (const [p, label] of evidence) md.push(`- [${label}](${p})`);
	md.push('');
	const mdText = md.join('\n');

	// --- HTML ---
	const rows = summary.modules
		.map((m) => `<tr><td>${esc(m.module)}</td><td class="s-${m.status}">${esc(m.status)}${m.reason ? ` <span class="r">${esc(m.reason)}</span>` : ''}</td><td>${esc(m.tool || '—')} ${esc(m.tool_version || '')}</td></tr>`)
		.join('\n');
	const headHtml = head.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n');
	const evHtml = evidence.map(([p, label]) => `<li><a href="${esc(p)}">${esc(label)}</a> — <code>${esc(p)}</code></li>`).join('\n');
	const html = `<!doctype html><html lang="en"><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(Kind)} — ${esc(projectName)}</title>
<style>
:root{--fg:#1a1a1a;--dim:#666;--line:#e2e2e2;--ok:#137333;--warn:#8a6d00;--bad:#b3261e}
body{font:15px/1.5 system-ui,sans-serif;color:var(--fg);max-width:60rem;margin:2rem auto;padding:0 1rem}
h1{margin:0 0 .25rem} .meta{color:var(--dim);margin-bottom:1.5rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem}
th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
.s-complete{color:var(--ok)} .s-complete_with_warnings,.s-partial{color:var(--warn)}
.s-failed{color:var(--bad)} .s-unavailable,.s-skipped,.s-pending{color:var(--dim)}
.r{color:var(--dim);font-size:.85em} code{background:#f4f4f4;padding:.1em .3em;border-radius:3px}
</style>
<h1>${esc(Kind)} — ${esc(projectName)}</h1>
<p class="meta">Run <code>${esc(runId)}</code> · mode ${esc(config.mode)} · status <strong>${esc(summary.status)}</strong><br>Target: ${esc(config.base_url || '(new site — no existing URL)')}</p>
<h2>Modules</h2>
<table><thead><tr><th>Module</th><th>Status</th><th>Tool</th></tr></thead><tbody>${rows}</tbody></table>
${head.length ? `<h2>Headline</h2><table><tbody>${headHtml}</tbody></table>` : ''}
<h2>Evidence</h2><ul>${evHtml}</ul>
<p class="meta">Automated results are not an accessibility or SEO certification — they capture a machine-detectable subset.</p>
</html>`;

	writeFileSync(join(runDir, 'report.md'), mdText, 'utf8');
	writeFileSync(join(runDir, 'report.html'), html, 'utf8');
	mkdirSync(reportsDir, { recursive: true });
	const reportName = `${kind}-${runId}.html`;
	writeFileSync(join(reportsDir, reportName), html, 'utf8');

	return { reportRel: `../../reports/${reportName}` };
}
