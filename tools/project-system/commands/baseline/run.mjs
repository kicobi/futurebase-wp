// commands/baseline/run.mjs — execute baseline modules into a dated, immutable run.
//
// wp-starter baseline run [--module <m>] [--url <base>] [--dry-run] [--json] [--project-root <p>]
//
// Modules run independently; a partial run is valid and never overwrites a prior
// run. Writes summary.json (schema-validated) + latest.json + an HTML/MD report.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths, loadConfig, resolvePages, newRunId, makeRunDir, writeSummary, updateLatest, overallStatus } from '../../lib/baseline.mjs';
import { validateBaselineConfig } from '../../lib/validate.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { generateReport } from '../../lib/report.mjs';

import { run as crawl } from '../../modules/crawl.mjs';
import { run as screenshots } from '../../modules/screenshots.mjs';
import { run as lighthouse } from '../../modules/lighthouse.mjs';
import { run as axe } from '../../modules/axe.mjs';
import { run as manual } from '../../modules/manual.mjs';

const REGISTRY = { crawl, screenshots, lighthouse, axe, manual };
// Fields the baseline-run schema allows on a module entry (headline is stripped).
const pickSummary = (r) => ({ module: r.module, status: r.status, ...(r.reason ? { reason: r.reason } : {}), ...(r.evidence_path ? { evidence_path: r.evidence_path } : {}), ...(r.tool ? { tool: r.tool } : {}), ...(r.tool_version ? { tool_version: r.tool_version } : {}) });

export async function baselineRun(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);
	if (!existsSync(paths.configPath)) die(`no baseline config — run 'wp-starter baseline init' first (${paths.configPath})`, EXIT.INVALID_CONFIG, { json });

	const config = loadConfig(paths.configPath);
	if (flags.url) config.base_url = flags.url;
	const { valid, errors } = validateBaselineConfig(config);
	if (!valid) die(`baseline config invalid:\n  ${errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json });

	const requested = flags.module ? (Array.isArray(flags.module) ? flags.module : [flags.module]) : config.modules || Object.keys(REGISTRY);
	const modules = requested.filter((m) => REGISTRY[m]);
	const unknown = requested.filter((m) => !REGISTRY[m]);
	if (unknown.length) warn(`ignoring unknown module(s): ${unknown.join(', ')}`);
	if (!modules.length) die('no runnable modules selected', EXIT.INVALID_CONFIG, { json });

	const pages = resolvePages(config);

	if (flags['dry-run']) {
		const plan = { status: 'dry-run', mode: config.mode, base_url: config.base_url, modules, pages: pages.map((p) => p.name) };
		if (json) emitJson(plan);
		console.log(c.bold('Baseline run plan (dry-run — no changes):'));
		info(`mode: ${config.mode}  ·  base_url: ${config.base_url || '(none)'}`);
		info(`modules: ${modules.join(', ')}`);
		info(`pages: ${pages.map((p) => p.name).join(', ') || '(none)'}`);
		process.exit(EXIT.OK);
	}

	const runId = newRunId();
	const runDir = makeRunDir(paths.baselineDir, runId);
	const ctx = { config, pages, runDir, projectRoot: root };

	if (!json) info(`run ${runId} — modules: ${modules.join(', ')}`);
	const results = [];
	for (const name of modules) {
		const started = Date.now();
		try {
			const r = await REGISTRY[name](ctx);
			results.push(r);
			if (!json) {
				const mark = r.status === 'complete' ? c.green('✓') : r.status === 'failed' ? c.red('✗') : c.yellow('·');
				console.log(`  ${mark} ${name.padEnd(12)} ${r.status}${r.reason ? c.dim(` (${r.reason})`) : ''} ${c.dim(`${Date.now() - started}ms`)}`);
			}
		} catch (err) {
			const r = { module: name, status: 'failed', reason: String(err.message || err) };
			results.push(r);
			writeFileSync(join(runDir, `${name}.error.log`), (err.stack || String(err)) + '\n', 'utf8');
			if (!json) console.log(`  ${c.red('✗')} ${name.padEnd(12)} failed ${c.dim(`(${r.reason})`)}`);
		}
	}

	const status = overallStatus(results);
	const summary = {
		schema_version: 1,
		run_id: runId,
		project_type: config.mode,
		kind: 'baseline',
		status,
		started_at: new Date(Date.now()).toISOString(),
		finished_at: new Date().toISOString(),
		modules: results.map(pickSummary),
	};

	let projectName = paths.root.split('/').pop();
	try {
		projectName = readYaml(join(paths.projectDir, 'project.yml'))?.project?.name || projectName;
	} catch {
		/* ignore */
	}
	const { reportRel } = generateReport({ runDir, reportsDir: paths.reportsDir, summary, results, config, projectName });
	summary.report = reportRel;

	writeSummary(runDir, summary);
	updateLatest(paths.baselineDir, runId);

	const exit = status === 'completed' ? EXIT.OK : status === 'failed' ? EXIT.MODULE_FAILURE : EXIT.WARNINGS;
	if (json) emitJson({ status, run_id: runId, run_dir: runDir, report: join(paths.reportsDir, `baseline-${runId}.html`), modules: summary.modules }, exit);

	console.log('');
	(status === 'completed' ? ok : status === 'failed' ? fail : warn)(`baseline ${status} — ${runId}`);
	info(`evidence: ${runDir}`);
	info(`report:   ${join(paths.reportsDir, `baseline-${runId}.html`)}`);
	process.exit(exit);
}
