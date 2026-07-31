// commands/final/report.mjs — (re)generate the report for a final run.
//
// wp-starter final report [--run-id <id>] [--project-root <p>] [--json]

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths, loadConfig, latestRunId, isRunId, readRunSummary } from '../../lib/baseline.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { generateReport } from '../../lib/report.mjs';

export function finalReport(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	const runId = flags['run-id'] || (existsSync(paths.finalDir) ? latestRunId(paths.finalDir) : null);
	if (!runId) die('no final run to report on — run: wp-starter final run', EXIT.ACCESS_FAILURE, { json });
	if (!isRunId(runId)) die(`invalid run id: ${runId}`, EXIT.INVALID_CONFIG, { json });
	let runDir;
	let summary;
	try {
		({ runDir, summary } = readRunSummary(paths.finalDir, runId));
	} catch (err) {
		die(`cannot report final run ${runId}: ${err.message}`, EXIT.INVALID_CONFIG, { json });
	}
	const config = existsSync(paths.configPath) ? loadConfig(paths.configPath) : { mode: summary.project_type, base_url: null };
	let projectName = root.split('/').pop();
	try {
		projectName = readYaml(join(paths.projectDir, 'project.yml'))?.project?.name || projectName;
	} catch {
		/* ignore */
	}
	const { reportRel } = generateReport({ runDir, reportsDir: paths.reportsDir, summary, results: summary.modules, config, projectName, kind: 'final', runId });

	if (json) emitJson({ status: 'ok', run_id: runId, report: join(paths.reportsDir, `final-${runId}.html`), report_rel: reportRel });
	ok(`final report generated for ${runId}`);
	info(join(paths.reportsDir, `final-${runId}.html`));
	process.exit(EXIT.OK);
}
