// commands/baseline/report.mjs — (re)generate the report for a run.
//
// wp-starter baseline report [--run-id <id>] [--project-root <p>] [--json]

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths, loadConfig, latestRunId } from '../../lib/baseline.mjs';
import { readJson, readYaml } from '../../lib/yaml.mjs';
import { generateReport } from '../../lib/report.mjs';

export function baselineReport(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	const runId = flags['run-id'] || (existsSync(paths.baselineDir) ? latestRunId(paths.baselineDir) : null);
	if (!runId) die('no baseline run to report on', EXIT.ACCESS_FAILURE, { json });
	const runDir = join(paths.baselineDir, runId);
	const summaryPath = join(runDir, 'summary.json');
	if (!existsSync(summaryPath)) die(`no summary.json for run ${runId}`, EXIT.ACCESS_FAILURE, { json });

	const summary = readJson(summaryPath);
	const config = existsSync(paths.configPath) ? loadConfig(paths.configPath) : { mode: summary.project_type, base_url: null };
	let projectName = root.split('/').pop();
	try {
		projectName = readYaml(join(paths.projectDir, 'project.yml'))?.project?.name || projectName;
	} catch {
		/* ignore */
	}

	// results carry per-module headline; on regeneration we only have summary
	// modules, so headlines are rebuilt from evidence on disk.
	const { reportRel } = generateReport({ runDir, reportsDir: paths.reportsDir, summary, results: summary.modules, config, projectName });
	const reportPath = join(paths.reportsDir, `baseline-${runId}.html`);

	if (json) emitJson({ status: 'ok', run_id: runId, report: reportPath, report_rel: reportRel });
	ok(`report generated for ${runId}`);
	info(reportPath);
	process.exit(EXIT.OK);
}
