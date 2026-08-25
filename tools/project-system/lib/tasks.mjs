// lib/tasks.mjs — generate the lifecycle task tree (spec §24).
//
// State-aware: tasks are marked done from the project record so the output is a
// live checklist. Emits Markdown, a JSON sync payload (project id, task id,
// milestone, owner, due date, measurement status, result — ready for Workledger
// or another tracker), or ready-to-run `gh issue create` commands.

// doneKey resolves against recordSummary state (see resolveDone below).
const TASKS = [
	{ id: 'agree-metrics', milestone: 'Project kickoff', title: 'Agree success metrics', owner: 'shared', timing: 'kickoff', offset: null, doneKey: 'metrics' },
	{ id: 'capture-baseline', milestone: 'Before development', title: 'Capture baseline', owner: 'developer', timing: 'before_development', offset: null, doneKey: 'baseline' },
	{ id: 'final-measurements', milestone: 'Before launch', title: 'Run final measurements', owner: 'developer', timing: 'pre_launch', offset: 0, doneKey: 'final' },
	{ id: 'compare-results', milestone: 'Before launch', title: 'Compare results', owner: 'developer', timing: 'launch', offset: 0, doneKey: 'compare' },
	{ id: 'send-survey-30', milestone: '30 days after launch', title: 'Send client survey', owner: 'shared', timing: '30_days', offset: 30, doneKey: 'followup30' },
	{ id: 'review-analytics-30', milestone: '30 days after launch', title: 'Review analytics', owner: 'client', timing: '30_days', offset: 30, doneKey: null },
	{ id: 'review-support-30', milestone: '30 days after launch', title: 'Review support requests', owner: 'developer', timing: '30_days', offset: 30, doneKey: null },
	{ id: 'review-outcomes-90', milestone: '90 days after launch', title: 'Review longer-term outcomes', owner: 'shared', timing: '90_days', offset: 90, doneKey: 'followup90' },
];

function resolveDone(key, summary) {
	switch (key) {
		case 'metrics':
			return summary.metrics.count > 0;
		// `captured`, not `runs` — a run directory that measured nothing must not
		// close the task. Same reasoning as project/status.mjs; task generation
		// reads the same summary and had the same bug.
		case 'baseline':
			return summary.baseline.captured > 0;
		case 'final':
			return summary.final.captured > 0;
		case 'compare':
			return !!summary.comparison;
		case 'followup30':
			return summary.followUp.includes('30-days');
		case 'followup90':
			return summary.followUp.includes('90-days');
		default:
			return false;
	}
}

// Add whole days to a YYYY-MM-DD date, returning YYYY-MM-DD (UTC).
function addDays(dateStr, n) {
	const d = new Date(`${dateStr}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return null;
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export function buildTaskTree(summary, { launchDate } = {}) {
	const lifecycle = TASKS.map((t) => {
		const done = t.doneKey ? resolveDone(t.doneKey, summary) : false;
		const due = launchDate && t.offset != null ? addDays(launchDate, t.offset) : null;
		return { id: t.id, milestone: t.milestone, title: t.title, owner: t.owner, timing: t.timing, due_date: due, done, measurement_status: done ? 'done' : 'pending', result: null };
	});
	const closeout = summary.closeout?.initialized
		? summary.closeout.tasks.map((task) => ({
			id: `closeout:${task.id}`,
			milestone: 'Project closeout',
			title: task.title,
			owner: task.owner,
			timing: task.due_anchor,
			due_date: task.due_date,
			done: task.status !== 'pending',
			measurement_status: task.status === 'pending' ? 'pending' : 'done',
			result: task.status === 'not-applicable' ? 'not-applicable' : task.overdue ? 'overdue' : task.status,
		}))
		: [];
	return [...lifecycle, ...closeout];
}

export function renderMarkdown(tasks, projectName, closeout = null) {
	const lines = [`# Lifecycle tasks — ${projectName}`, ''];
	if (closeout?.initialized) {
		lines.push(`Closeout: **${closeout.ready ? 'ready' : 'not ready'}** · ${closeout.pending} pending · ${closeout.overdue} overdue`, '');
	}
	let milestone = null;
	for (const t of tasks) {
		if (t.milestone !== milestone) {
			milestone = t.milestone;
			if (lines[lines.length - 1] !== '') lines.push('');
			lines.push(`## ${milestone}`, '');
		}
		const due = t.due_date ? ` _(due ${t.due_date})_` : '';
		const result = t.result === 'overdue' ? ' **OVERDUE**' : t.result === 'not-applicable' ? ' _(not applicable)_' : '';
		lines.push(`- [${t.done ? 'x' : ' '}] ${t.title} — owner ${t.owner}${due}${result}`);
	}
	lines.push('');
	return lines.join('\n');
}

export function renderJson(tasks, project, closeout = null) {
	const output = {
		project_id: project?.slug || null,
		project_name: project?.name || null,
		tasks: tasks.map((t) => ({ id: t.id, milestone: t.milestone, title: t.title, owner: t.owner, timing: t.timing, due_date: t.due_date, measurement_status: t.measurement_status, result: t.result })),
	};
	if (closeout?.initialized) {
		output.closeout = {
			ready: closeout.ready,
			pending: closeout.pending,
			overdue: closeout.overdue,
			reminder_date: closeout.reminder_date,
			retirement_date: closeout.retirement_date,
		};
	}
	return output;
}

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// gh issue create commands for the PENDING tasks only.
export function renderGithub(tasks, closeout = null) {
	const lines = ['# Pending lifecycle tasks as GitHub issues — review, then run (or pipe to sh):', ''];
	if (closeout?.initialized) lines.push(`# Closeout: ${closeout.ready ? 'ready' : 'not ready'} · ${closeout.pending} pending · ${closeout.overdue} overdue`, '');
	for (const t of tasks.filter((x) => x.measurement_status === 'pending')) {
		const body = `Milestone: ${t.milestone}\nOwner: ${t.owner}\nTiming: ${t.timing}${t.due_date ? `\nDue: ${t.due_date}` : ''}${t.result === 'overdue' ? '\nStatus: OVERDUE' : ''}`;
		lines.push(`gh issue create --title ${shq(t.title)} --body ${shq(body)} --label ${shq('lifecycle')}`);
	}
	if (!tasks.some((x) => x.measurement_status === 'pending')) lines.push('# (nothing pending — all lifecycle tasks are done)');
	return lines.join('\n') + '\n';
}
