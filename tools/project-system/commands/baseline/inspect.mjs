// commands/baseline/inspect.mjs — show baseline config + latest run status.
//
// wp-starter baseline inspect [--project-root <p>] [--json]

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, warn, info, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths, loadConfig, latestRunId } from '../../lib/baseline.mjs';
import { readJson } from '../../lib/yaml.mjs';

export function baselineInspect(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	const hasConfig = existsSync(paths.configPath);
	const config = hasConfig ? loadConfig(paths.configPath) : null;
	const runId = existsSync(paths.baselineDir) ? latestRunId(paths.baselineDir) : null;
	let summary = null;
	if (runId) {
		try {
			summary = readJson(join(paths.baselineDir, runId, 'summary.json'));
		} catch {
			/* ignore */
		}
	}

	if (json) emitJson({ status: 'ok', project_root: root, has_config: hasConfig, config, latest_run: runId, summary });

	console.log(c.bold(`Baseline — ${root}`));
	if (!hasConfig) {
		warn('no baseline config yet — run: wp-starter baseline init');
	} else {
		info(`config: mode ${config.mode} · modules ${(config.modules || []).join(', ')} · ${(config.pages || []).length} pages · base_url ${config.base_url || '(none)'}`);
	}
	if (!runId) {
		warn('no runs yet — run: wp-starter baseline run');
	} else {
		console.log('');
		console.log(c.bold(`Latest run: ${runId}  (${summary?.status ?? '?'})`));
		for (const m of summary?.modules || []) console.log(`  ${m.module.padEnd(12)} ${m.status}${m.reason ? c.dim(` (${m.reason})`) : ''}`);
	}
	process.exit(EXIT.OK);
}
