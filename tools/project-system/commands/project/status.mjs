// commands/project/status.mjs — where is this project in the lifecycle?
//
// futurebase project status [--project-root <p>] [--json]

import { EXIT, die, info, warn, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { recordSummary } from '../../lib/record.mjs';

export function projectStatus(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found). Run `futurebase project init` first.', EXIT.ACCESS_FAILURE, { json });
	const s = recordSummary(projectPaths(root));

	const steps = [
		{ key: 'metrics', label: 'Success metrics agreed', done: s.metrics.count > 0, next: 'futurebase metrics suggest' },
		// `captured`, not `runs`: a directory is not evidence. A failed or
		// wholly-partial run used to tick this box and send the operator on to
		// the next step with nothing measured behind them.
		{ key: 'baseline', label: 'Baseline captured', done: s.baseline.captured > 0, next: 'futurebase baseline init && futurebase baseline run' },
		{ key: 'final', label: 'Final captured (at launch)', done: s.final.captured > 0, next: 'futurebase final run' },
		{ key: 'compare', label: 'Before/after compared', done: s.comparison, next: 'futurebase compare' },
		{ key: 'followup', label: 'Follow-up survey', done: s.followUp.length > 0, next: 'futurebase metrics survey --period 30-days --write' },
		{ key: 'closeout', label: 'Closeout ready', done: s.closeout.ready || s.project.status === 'closed', next: s.closeout.initialized ? 'futurebase project closeout status' : 'futurebase project closeout init' },
	];
	const nextStep = steps.find((st) => !st.done);

	if (json) emitJson({ status: 'ok', project: s.project, steps: steps.map(({ key, done }) => ({ key, done })), next: nextStep?.next || null });

	const p = s.project;
	console.log(c.bold(`${p.name ?? root.split('/').pop()} — ${p.stage ?? '?'}/${p.status ?? '?'}`));
	console.log('');
	for (const st of steps) console.log(`  ${st.done ? c.green('✓') : c.dim('○')} ${st.label}`);
	console.log('');

	// Runs that exist but captured nothing. Naming them is the point: the step
	// above stays open, and without this the operator sees an unticked box with
	// no hint that a run was attempted and came back empty.
	for (const [label, stats] of [
		['baseline', s.baseline],
		['final', s.final],
	]) {
		if (!stats.incomplete.length) continue;
		warn(`${stats.incomplete.length} ${label} run(s) captured no evidence and do not count:`);
		for (const r of stats.incomplete) info(`${r.id} — ${r.reason}`);
	}
	if (s.baseline.incomplete.length || s.final.incomplete.length) console.log('');
	if (s.closeout.initialized) {
		info(`closeout: ${s.closeout.pending} pending · ${s.closeout.overdue} overdue${s.closeout.retirement_date ? ` · retirement ${s.closeout.retirement_date}` : ''}`);
		for (const task of s.closeout.tasks.filter((item) => item.overdue)) warn(`OVERDUE: ${task.title} (due ${task.due_date})`);
		const nextDue = s.closeout.tasks.filter((item) => item.status === 'pending' && item.due_date && !item.overdue).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
		if (nextDue) info(`next closeout due: ${nextDue.title} · ${nextDue.due_date}`);
	}
	if (nextStep) info(`next:  ${nextStep.next}`);
	else info('lifecycle complete — consider a 90-day follow-up and a case study.');
	process.exit(EXIT.OK);
}
