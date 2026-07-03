// modules/axe.mjs — automated accessibility checks (axe-core injected via Playwright).
// Automated results are NOT an accessibility certification — they catch a subset.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium, pkgVersion, requireIfPresent } from '../lib/browser.mjs';

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

export async function run(ctx) {
	const { pages, runDir } = ctx;
	const chromium = await loadChromium();
	if (!chromium) return { module: 'axe', status: 'unavailable', reason: 'playwright not resolvable from the project' };
	const axeCore = requireIfPresent('axe-core');
	if (!axeCore?.source) return { module: 'axe', status: 'unavailable', reason: 'axe-core not resolvable from the project' };

	const outDir = join(runDir, 'accessibility');
	mkdirSync(outDir, { recursive: true });

	const totals = { critical: 0, serious: 0, moderate: 0, minor: 0, pages: 0 };
	let ok = 0;
	let fail = 0;
	let browser;
	try {
		browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	} catch (err) {
		return { module: 'axe', status: 'failed', reason: `chromium launch failed: ${err.message}` };
	}
	try {
		for (const page of pages) {
			const context = await browser.newContext();
			const p = await context.newPage();
			try {
				await p.goto(page.url, { waitUntil: 'load', timeout: 20000 });
				await p.addScriptTag({ content: axeCore.source });
				const results = await p.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }));
				const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
				for (const v of results.violations) {
					const imp = IMPACTS.includes(v.impact) ? v.impact : 'minor';
					byImpact[imp] += v.nodes.length;
					totals[imp] += v.nodes.length;
				}
				const violations = results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags, nodes: v.nodes.length }));
				writeFileSync(join(outDir, `${page.name}.json`), JSON.stringify({ url: page.url, byImpact, violations }, null, 2) + '\n', 'utf8');
				totals.pages++;
				ok++;
			} catch (err) {
				writeFileSync(join(outDir, `${page.name}.error.txt`), String(err.message || err), 'utf8');
				fail++;
			} finally {
				await context.close();
			}
		}
	} finally {
		await browser.close();
	}

	writeFileSync(join(outDir, 'summary.json'), JSON.stringify(totals, null, 2) + '\n', 'utf8');
	const status = ok === 0 ? 'failed' : fail ? 'complete_with_warnings' : 'complete';
	return {
		module: 'axe',
		status,
		evidence_path: 'accessibility/',
		tool: 'axe-core',
		tool_version: pkgVersion('axe-core'),
		headline: { critical: totals.critical, serious: totals.serious, moderate: totals.moderate, minor: totals.minor },
	};
}
