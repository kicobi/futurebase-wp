// modules/lighthouse.mjs — Lighthouse mobile audit of the primary page.
// Spawns the Lighthouse CLI, pointing Chrome at Playwright's bundled Chromium
// (CHROME_PATH) so no separate Chrome install is required. Runs on the primary
// (critical, else first) page to bound runtime; multi-page is a later extension.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadChromium, pkgVersion, resolveFrom, requireIfPresent } from '../lib/browser.mjs';

const num = (lhr, id) => lhr?.audits?.[id]?.numericValue ?? null;
const score = (lhr, cat) => (lhr?.categories?.[cat]?.score != null ? Math.round(lhr.categories[cat].score * 100) : null);

export async function run(ctx) {
	const { pages, runDir } = ctx;
	if (!pages.length) return { module: 'lighthouse', status: 'skipped', reason: 'no pages configured' };

	const chromium = await loadChromium();
	if (!chromium) return { module: 'lighthouse', status: 'unavailable', reason: 'playwright not resolvable (needed for Chromium)' };
	const lhPkgPath = resolveFrom('lighthouse/package.json');
	const lhPkg = requireIfPresent('lighthouse/package.json');
	if (!lhPkgPath || !lhPkg) return { module: 'lighthouse', status: 'unavailable', reason: 'lighthouse not resolvable from the project' };
	const binRel = typeof lhPkg.bin === 'string' ? lhPkg.bin : lhPkg.bin?.lighthouse;
	const cli = binRel ? join(dirname(lhPkgPath), binRel) : null;
	if (!cli || !existsSync(cli)) return { module: 'lighthouse', status: 'unavailable', reason: 'lighthouse CLI entry not found' };

	const target = pages.find((p) => p.critical) || pages[0];
	const outDir = join(runDir, 'lighthouse');
	mkdirSync(outDir, { recursive: true });
	const reportPath = join(outDir, `${target.name}.json`);

	const res = spawnSync(
		process.execPath,
		[
			cli,
			target.url,
			'--quiet',
			'--output=json',
			`--output-path=${reportPath}`,
			'--only-categories=performance,accessibility,best-practices,seo',
			'--form-factor=mobile',
			'--chrome-flags=--headless=new --no-sandbox --disable-gpu',
			'--max-wait-for-load=45000',
		],
		{ env: { ...process.env, CHROME_PATH: chromium.executablePath() }, encoding: 'utf8', timeout: 120000 }
	);

	if (res.status !== 0 || !existsSync(reportPath)) {
		return { module: 'lighthouse', status: 'failed', reason: (res.stderr || res.error?.message || 'lighthouse exited non-zero').slice(0, 300) };
	}

	let lhr;
	try {
		lhr = JSON.parse(readFileSync(reportPath, 'utf8'));
	} catch (err) {
		return { module: 'lighthouse', status: 'failed', reason: `could not parse lighthouse report: ${err.message}` };
	}
	const extract = {
		url: target.url,
		page: target.name,
		performance: score(lhr, 'performance'),
		accessibility: score(lhr, 'accessibility'),
		bestPractices: score(lhr, 'best-practices'),
		seo: score(lhr, 'seo'),
		lcp_ms: num(lhr, 'largest-contentful-paint'),
		cls: num(lhr, 'cumulative-layout-shift'),
		tbt_ms: num(lhr, 'total-blocking-time'),
		total_byte_weight: num(lhr, 'total-byte-weight'),
		requests: lhr?.audits?.['network-requests']?.details?.items?.length ?? null,
	};
	writeFileSync(join(outDir, 'extract.json'), JSON.stringify(extract, null, 2) + '\n', 'utf8');

	return { module: 'lighthouse', status: 'complete', evidence_path: 'lighthouse/', tool: 'lighthouse', tool_version: pkgVersion('lighthouse'), headline: extract };
}
