// commands/project/status.mjs — where is this project in the lifecycle?
//
// wp-starter project status [--project-root <p>] [--json]

import { EXIT, die, info, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { recordSummary } from '../../lib/record.mjs';

export function projectStatus(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found). Run `wp-starter project init` first.', EXIT.ACCESS_FAILURE, { json });
	const s = recordSummary(projectPaths(root));

	const steps = [
		{ key: 'metrics', label: 'Success metrics agreed', done: s.metrics.count > 0, next: 'wp-starter metrics suggest' },
		{ key: 'baseline', label: 'Baseline captured', done: s.baseline.runs > 0, next: 'wp-starter baseline init && wp-starter baseline run' },
		{ key: 'final', label: 'Final captured (at launch)', done: s.final.runs > 0, next: 'wp-starter final run' },
		{ key: 'compare', label: 'Before/after compared', done: s.comparison, next: 'wp-starter compare' },
		{ key: 'followup', label: 'Follow-up survey', done: s.followUp.length > 0, next: 'wp-starter metrics survey --period 30-days --write' },
	];
	const nextStep = steps.find((st) => !st.done);

	if (json) emitJson({ status: 'ok', project: s.project, steps: steps.map(({ key, done }) => ({ key, done })), next: nextStep?.next || null });

	const p = s.project;
	console.log(c.bold(`${p.name ?? root.split('/').pop()} — ${p.stage ?? '?'}/${p.status ?? '?'}`));
	console.log('');
	for (const st of steps) console.log(`  ${st.done ? c.green('✓') : c.dim('○')} ${st.label}`);
	console.log('');
	if (nextStep) info(`next:  ${nextStep.next}`);
	else info('lifecycle complete — consider a 90-day follow-up and a case study.');
	process.exit(EXIT.OK);
}
