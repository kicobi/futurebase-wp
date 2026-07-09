// commands/metrics/survey.mjs — generate a survey form + results template.
//
// wp-starter metrics survey --period baseline|30-days|90-days [--write] [--json]
//
// Prints the survey. With --write, writes the human form (survey-<p>.md) and an
// empty schema-valid results template (survey-<p>.yml) into .project/follow-up/.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { loadMetrics } from '../../lib/metrics.mjs';
import { PERIODS, surveyMarkdown, resultsTemplate, resultsPath, saveResults } from '../../lib/survey.mjs';

export function metricsSurvey(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	const period = flags.period || '30-days';
	if (!PERIODS.includes(period)) die(`--period must be one of: ${PERIODS.join(', ')}`, EXIT.INVALID_CONFIG, { json });

	let projectName = root.split('/').pop();
	try {
		projectName = readYaml(join(paths.projectDir, 'project.yml'))?.project?.name || projectName;
	} catch {
		/* ignore */
	}
	const metrics = loadMetrics(paths.projectDir);
	const md = surveyMarkdown(period, projectName, metrics);
	const followUpDir = join(paths.projectDir, 'follow-up');
	const ymlPath = resultsPath(followUpDir, period);

	if (flags.write) {
		mkdirSync(followUpDir, { recursive: true });
		writeFileSync(join(followUpDir, `survey-${period}.md`), md, 'utf8');
		if (!existsSync(ymlPath)) saveResults(ymlPath, resultsTemplate(period));
		if (json) emitJson({ status: 'written', period, form: join(followUpDir, `survey-${period}.md`), results_template: ymlPath });
		ok(`survey written: ${join(followUpDir, `survey-${period}.md`)}`);
		info(`fill in answers:  ${ymlPath}`);
		info('then combine periods:  wp-starter metrics follow-up');
		process.exit(EXIT.OK);
	}

	if (json) emitJson({ status: 'ok', period, markdown: md });
	process.stdout.write(md + '\n');
	process.exit(EXIT.OK);
}
