// commands/project/inspect.mjs — dashboard of the .project/ record.
//
// futurebase project inspect [--project-root <p>] [--json]

import { EXIT, die, info, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { recordSummary } from '../../lib/record.mjs';

export function projectInspect(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found). Run `futurebase project init` first.', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);
	const s = recordSummary(paths);

	if (json) emitJson({ status: 'ok', root, summary: s });

	const p = s.project;
	console.log(c.bold(`${p.name ?? root.split('/').pop()}  ${c.dim(`(${p.slug ?? '?'})`)}`));
	info(root);
	console.log(`  stage ${p.stage ?? '?'} · status ${p.status ?? '?'} · type ${p.type ?? '?'}${p.platform ? ' · ' + p.platform : ''}${s.preset ? ' · preset ' + s.preset : ''}`);
	if (s.starter?.template_commit) console.log(`  from starter ${c.dim(s.starter.template_commit.slice(0, 10))}${s.starter.promoted_at ? ' · promoted ' + s.starter.promoted_at.slice(0, 10) : ''}`);
	if (s.urls?.production) console.log(`  production ${s.urls.production}`);
	console.log('');
	console.log(c.bold('Record'));
	console.log(`  brief files       ${s.brief}`);
	console.log(`  scope             ${s.scope}`);
	console.log(`  decisions         ${s.decisions}`);
	console.log(`  metrics           ${s.metrics.count}${s.metrics.count ? ` (${s.metrics.measured} with measured baseline)` : ''}`);
	console.log(`  observations      ${s.observations}`);
	console.log(`  journeys          ${s.journeys}`);
	console.log('');
	console.log(c.bold('Capture'));
	// Show captured alongside the raw count — they diverge exactly when a run
	// exists but measured nothing, which is the case worth noticing.
	const runLine = (stats) => `${stats.runs}${stats.captured !== stats.runs ? ` (${stats.captured} captured)` : ''}`;
	console.log(`  baseline runs     ${runLine(s.baseline)}${s.baseline.latest ? ` · latest ${s.baseline.latest.id} (${s.baseline.latest.status})` : ''}`);
	console.log(`  final runs        ${runLine(s.final)}${s.final.latest ? ` · latest ${s.final.latest.id} (${s.final.latest.status})` : ''}`);
	console.log(`  comparison        ${s.comparison ? 'yes' : 'no'}`);
	console.log(`  follow-up surveys ${s.followUp.length ? s.followUp.join(', ') : 'none'}`);
	console.log('');
	console.log(c.bold('Closeout'));
	if (!s.closeout.initialized) console.log('  not initialized');
	else {
		console.log(`  readiness         ${s.closeout.ready ? 'ready' : 'not ready'}`);
		console.log(`  tasks             ${s.closeout.tasks.length - s.closeout.pending}/${s.closeout.tasks.length} resolved · ${s.closeout.overdue} overdue`);
		console.log(`  reminder          ${s.closeout.reminder_date || 'not calculated'}`);
		console.log(`  retirement        ${s.closeout.retirement_date || 'not calculated'}`);
		console.log(`  lessons reviewed  ${s.closeout.lessons_reviewed_at || 'no'}`);
		for (const task of s.closeout.tasks.filter((item) => item.overdue)) console.log(`  OVERDUE           ${task.id} · due ${task.due_date}`);
		const nextDue = s.closeout.tasks.filter((item) => item.status === 'pending' && item.due_date && !item.overdue).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
		if (nextDue) console.log(`  next due          ${nextDue.id} · ${nextDue.due_date}`);
	}
	process.exit(EXIT.OK);
}
