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
		case 'baseline':
			return summary.baseline.runs > 0;
		case 'final':
			return summary.final.runs > 0;
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
	return TASKS.map((t) => {
		const done = t.doneKey ? resolveDone(t.doneKey, summary) : false;
		const due = launchDate && t.offset != null ? addDays(launchDate, t.offset) : null;
		return { id: t.id, milestone: t.milestone, title: t.title, owner: t.owner, timing: t.timing, due_date: due, done, measurement_status: done ? 'done' : 'pending', result: null };
	});
}

export function renderMarkdown(tasks, projectName) {
	const lines = [`# Lifecycle tasks — ${projectName}`, ''];
	let milestone = null;
	for (const t of tasks) {
		if (t.milestone !== milestone) {
			milestone = t.milestone;
			if (lines[lines.length - 1] !== '') lines.push('');
			lines.push(`## ${milestone}`, '');
		}
		const due = t.due_date ? ` _(due ${t.due_date})_` : '';
		lines.push(`- [${t.done ? 'x' : ' '}] ${t.title} — owner ${t.owner}${due}`);
	}
	lines.push('');
	return lines.join('\n');
}

export function renderJson(tasks, project) {
	return {
		project_id: project?.slug || null,
		project_name: project?.name || null,
		tasks: tasks.map((t) => ({ id: t.id, milestone: t.milestone, title: t.title, owner: t.owner, timing: t.timing, due_date: t.due_date, measurement_status: t.measurement_status, result: t.result })),
	};
}

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// gh issue create commands for the PENDING tasks only.
export function renderGithub(tasks) {
	const lines = ['# Pending lifecycle tasks as GitHub issues — review, then run (or pipe to sh):', ''];
	for (const t of tasks.filter((x) => x.measurement_status === 'pending')) {
		const body = `Milestone: ${t.milestone}\nOwner: ${t.owner}\nTiming: ${t.timing}${t.due_date ? `\nDue: ${t.due_date}` : ''}`;
		lines.push(`gh issue create --title ${shq(t.title)} --body ${shq(body)} --label ${shq('lifecycle')}`);
	}
	if (lines.length === 2) lines.push('# (nothing pending — all lifecycle tasks are done)');
	return lines.join('\n') + '\n';
}
