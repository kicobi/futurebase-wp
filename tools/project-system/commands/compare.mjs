// commands/compare.mjs — diff the latest baseline against the latest final run.
//
// wp-starter compare [--baseline-run <id>] [--final-run <id>] [--json] [--project-root <p>]
//
// Writes an internal + client-safe comparison report into .project/reports/.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson, c } from '../lib/output.mjs';
import { findProjectRoot, projectPaths, latestRunId } from '../lib/baseline.mjs';
import { readYaml } from '../lib/yaml.mjs';
import { loadMetrics } from '../lib/metrics.mjs';
import { buildComparison, renderComparison } from '../lib/compare.mjs';

export function compare(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	const baseId = flags['baseline-run'] || (existsSync(paths.baselineDir) ? latestRunId(paths.baselineDir) : null);
	const finalId = flags['final-run'] || (existsSync(paths.finalDir) ? latestRunId(paths.finalDir) : null);
	if (!baseId) die('no baseline run to compare — run: wp-starter baseline run', EXIT.ACCESS_FAILURE, { json });
	if (!finalId) die('no final run to compare — run: wp-starter final run', EXIT.ACCESS_FAILURE, { json });

	const baselineRunDir = join(paths.baselineDir, baseId);
	const finalRunDir = join(paths.finalDir, finalId);

	let projectName = root.split('/').pop();
	try {
		projectName = readYaml(join(paths.projectDir, 'project.yml'))?.project?.name || projectName;
	} catch {
		/* ignore */
	}
	const metrics = loadMetrics(paths.projectDir);

	const comparison = buildComparison(baselineRunDir, finalRunDir);
	const { internalMd, clientMd, html } = renderComparison({ projectName, baselineRun: baseId, finalRun: finalId, comparison, metrics });

	mkdirSync(paths.reportsDir, { recursive: true });
	const stamp = finalId;
	const htmlPath = join(paths.reportsDir, `comparison-${stamp}.html`);
	writeFileSync(htmlPath, html, 'utf8');
	writeFileSync(join(paths.reportsDir, `comparison-${stamp}.md`), internalMd, 'utf8');
	writeFileSync(join(paths.reportsDir, `comparison-${stamp}-client.md`), clientMd, 'utf8');

	const improved = comparison.rows.filter((r) => r.change === 'better').length;
	const regressed = comparison.rows.filter((r) => r.change === 'worse').length;

	if (json) emitJson({ status: 'ok', baseline_run: baseId, final_run: finalId, improved, regressed, rows: comparison.rows, limitations: comparison.limitations, report: htmlPath });

	ok(`compared ${baseId} → ${finalId}`);
	info(`${improved} improved · ${regressed} regressed · ${comparison.rows.length} measures`);
	for (const r of comparison.rows) {
		const mark = r.change === 'better' ? c.green('▲') : r.change === 'worse' ? c.red('▼') : c.dim('–');
		console.log(`  ${mark} ${r.label.padEnd(28)} ${r.before ?? '—'} → ${r.after ?? '—'}${r.unit ? ' ' + r.unit : ''}`);
	}
	if (comparison.limitations.length) {
		console.log('');
		info('limitations:');
		for (const l of comparison.limitations) info(`- ${l}`);
	}
	console.log('');
	info(`report:  ${htmlPath}`);
	info(`client:  ${join(paths.reportsDir, `comparison-${stamp}-client.md`)}`);
	process.exit(EXIT.OK);
}
