// modules/screenshots.mjs — full-page screenshots per page × viewport (Playwright).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium, pkgVersion } from '../lib/browser.mjs';

const DEFAULT_VIEWPORTS = [
	{ name: 'desktop', width: 1280, height: 800 },
	{ name: 'tablet', width: 834, height: 1112 },
	{ name: 'mobile', width: 390, height: 844 },
];

function gallery(meta) {
	const cards = meta
		.map(
			(m) =>
				`<figure><figcaption>${m.page} · ${m.viewport}${m.error ? ' — FAILED' : ''}</figcaption>` +
				(m.file ? `<a href="${m.file}"><img loading="lazy" src="${m.file}" alt="${m.page} ${m.viewport}"></a>` : `<p>${m.error}</p>`) +
				`</figure>`
		)
		.join('\n');
	return `<!doctype html><meta charset="utf8"><title>Screenshots</title><style>body{font:14px system-ui;margin:2rem}figure{display:inline-block;width:320px;margin:0 1rem 2rem 0;vertical-align:top}img{width:100%;border:1px solid #ccc}figcaption{font-weight:600;margin-bottom:.4rem}</style><h1>Screenshots</h1>${cards}`;
}

export async function run(ctx) {
	const { pages, runDir, config } = ctx;
	const chromium = await loadChromium();
	if (!chromium) return { module: 'screenshots', status: 'unavailable', reason: 'playwright not resolvable from the project' };

	const viewports = config.viewports?.length ? config.viewports : DEFAULT_VIEWPORTS;
	const outDir = join(runDir, 'screenshots');
	mkdirSync(outDir, { recursive: true });

	const meta = [];
	let ok = 0;
	let fail = 0;
	let browser;
	try {
		browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	} catch (err) {
		return { module: 'screenshots', status: 'failed', reason: `chromium launch failed: ${err.message}` };
	}
	try {
		for (const page of pages) {
			for (const vp of viewports) {
				const rel = `${page.name}-${vp.name}.png`;
				const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
				const p = await context.newPage();
				try {
					await p.goto(page.url, { waitUntil: 'load', timeout: 20000 });
					await p.screenshot({ path: join(outDir, rel), fullPage: true });
					meta.push({ page: page.name, viewport: vp.name, url: page.url, width: vp.width, height: vp.height, file: rel, date: new Date().toISOString() });
					ok++;
				} catch (err) {
					meta.push({ page: page.name, viewport: vp.name, url: page.url, error: String(err.message || err) });
					fail++;
				} finally {
					await context.close();
				}
			}
		}
	} finally {
		await browser.close();
	}

	writeFileSync(join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
	writeFileSync(join(outDir, 'gallery.html'), gallery(meta), 'utf8');

	const status = ok === 0 ? 'failed' : fail ? 'complete_with_warnings' : 'complete';
	return { module: 'screenshots', status, evidence_path: 'screenshots/', tool: 'playwright', tool_version: pkgVersion('playwright'), headline: { captured: ok, failed: fail } };
}
