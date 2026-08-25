// lib/closeout.mjs — closeout record rules, dates, evidence qualification,
// summaries, and derived reports. Commands perform no operational side effects:
// they only record evidence supplied by the operator.

import { readYaml } from './yaml.mjs';
import { templatesDir } from './paths.mjs';
import { join } from 'node:path';
import { evidenceVerdict, readRunSummary } from './baseline.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REUSABLE = new Set(['starter-improvement', 'plugin-capability', 'process-documentation']);
export const REQUIRED_TASK_IDS = Object.freeze([
	'final-measurements',
	'written-acceptance',
	'backup-integrity',
	'restore-drill',
	'credential-reset',
	'final-backup',
	'credential-revocation',
	'expiry-warning',
	'offsite-deletion',
	'staging-retirement',
	'rollback-deletion',
	'billing-closure',
]);
const REQUIRED_TASK_ANCHORS = Object.freeze({
	'final-measurements': 'manual',
	'written-acceptance': 'acceptance',
	'backup-integrity': 'acceptance',
	'restore-drill': 'acceptance',
	'credential-reset': 'acceptance',
	'final-backup': 'acceptance',
	'credential-revocation': 'acceptance',
	'expiry-warning': 'reminder',
	'offsite-deletion': 'retirement',
	'staging-retirement': 'retirement',
	'rollback-deletion': 'retirement',
	'billing-closure': 'retirement',
});

export function today(date = new Date()) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function validDate(value) {
	if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(value, days) {
	if (!validDate(value) || !Number.isInteger(days)) throw new Error('date must be YYYY-MM-DD and days must be an integer');
	const parsed = new Date(`${value}T00:00:00Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}

export function newCloseoutRecord() {
	// Round-trip through JSON so every caller receives an independent record.
	return JSON.parse(JSON.stringify(readYaml(join(templatesDir, 'active', 'closeout.yml'))));
}

export function calculateCloseoutDates(record) {
	const accepted = record?.acceptance?.date;
	if (!accepted) return { retirementDate: null, reminderDate: null };
	const retirementDate = addDays(accepted, record.retention.days);
	const reminderDate = addDays(retirementDate, -record.retention.reminder_days_before);
	return { retirementDate, reminderDate };
}

export function recalculateCloseoutDates(record) {
	const { retirementDate, reminderDate } = calculateCloseoutDates(record);
	record.retention.retirement_date = retirementDate;
	record.retention.reminder_date = reminderDate;
	for (const task of record.tasks || []) {
		task.due_date =
			task.due_anchor === 'acceptance'
				? record.acceptance.date
				: task.due_anchor === 'reminder'
					? reminderDate
					: task.due_anchor === 'retirement'
						? retirementDate
						: null;
	}
	return record;
}

export function closeoutSemanticIssues(record) {
	const issues = [];
	if (!record || typeof record !== 'object') return ['closeout record is not an object'];
	if (record.retention?.reminder_days_before >= record.retention?.days) {
		issues.push('retention.reminder_days_before must be shorter than retention.days');
	}
	const taskIds = new Set();
	for (const task of record.tasks || []) {
		if (taskIds.has(task.id)) issues.push(`duplicate closeout task id: ${task.id}`);
		taskIds.add(task.id);
		if (task.status === 'complete' && !(task.evidence || []).length) {
			issues.push(`task ${task.id}: completed tasks require evidence`);
		}
		if (task.status === 'not-applicable' && !String(task.notes || '').trim()) {
			issues.push(`task ${task.id}: not-applicable tasks require rationale in notes`);
		}
	}
	for (const id of REQUIRED_TASK_IDS) {
		const task = (record.tasks || []).find((item) => item.id === id);
		if (!task) issues.push(`required closeout task is missing: ${id}`);
		else if (task.required !== true) issues.push(`default closeout task must remain required: ${id}`);
		else if (task.due_anchor !== REQUIRED_TASK_ANCHORS[id]) issues.push(`default closeout task ${id} must keep due_anchor ${REQUIRED_TASK_ANCHORS[id]}`);
	}
	const lessonIds = new Set();
	for (const lesson of record.lessons?.items || []) {
		if (lessonIds.has(lesson.id)) issues.push(`duplicate lesson id: ${lesson.id}`);
		lessonIds.add(lesson.id);
		if (REUSABLE.has(lesson.classification)) {
			if (!String(lesson.recommended_target || '').trim()) issues.push(`lesson ${lesson.id}: reusable lessons require recommended_target`);
			if (!String(lesson.recommended_action || '').trim()) issues.push(`lesson ${lesson.id}: reusable lessons require recommended_action`);
		}
	}
	if (record.acceptance?.date) {
		try {
			const expected = calculateCloseoutDates(record);
			if (record.retention?.retirement_date !== expected.retirementDate) issues.push('retention.retirement_date does not match acceptance + retention');
			if (record.retention?.reminder_date !== expected.reminderDate) issues.push('retention.reminder_date does not match retirement - reminder lead time');
			for (const task of record.tasks || []) {
				const due = task.due_anchor === 'acceptance' ? record.acceptance.date : task.due_anchor === 'reminder' ? expected.reminderDate : task.due_anchor === 'retirement' ? expected.retirementDate : null;
				if (task.due_date !== due) issues.push(`task ${task.id}: due_date does not match its ${task.due_anchor} anchor`);
			}
		} catch (err) {
			issues.push(`acceptance date calculation failed: ${err.message}`);
		}
	}
	return issues;
}

export function acceptProject(record, { date, evidence, force = false, confirm = false }) {
	if (!validDate(date)) throw new Error('acceptance date must be YYYY-MM-DD');
	const refs = Array.isArray(evidence) ? evidence.filter(Boolean) : evidence ? [evidence] : [];
	if (!refs.length) throw new Error('written acceptance requires at least one evidence reference');
	const correction = !!record.acceptance.date;
	if (correction && !(force && confirm)) {
		throw new Error('correcting or recalculating an existing acceptance requires --force --confirm');
	}
	record.acceptance = { date, evidence: [...new Set(refs)] };
	recalculateCloseoutDates(record);
	const task = record.tasks.find((item) => item.id === 'written-acceptance');
	// Correcting the acceptance anchor must move derived dates without rewriting
	// the already-recorded completion evidence for this or any operational task.
	if (task && !correction) Object.assign(task, { status: 'complete', date, evidence: [...new Set(refs)], notes: task.notes ?? null });
	return record;
}

export function setCloseoutTask(record, { id, status, date, evidence, notes }) {
	const task = (record.tasks || []).find((item) => item.id === id);
	if (!task) throw new Error(`unknown closeout task: ${id}`);
	if (!['pending', 'complete', 'not-applicable'].includes(status)) throw new Error('task status must be pending, complete, or not-applicable');
	if (date && !validDate(date)) throw new Error('task date must be YYYY-MM-DD');
	const refs = Array.isArray(evidence) ? evidence.filter(Boolean) : evidence ? [evidence] : [];
	if (status === 'pending') {
		if (date || refs.length || notes != null) throw new Error(`task ${id}: pending only reopens the task; omit date, evidence, and notes so the audit trail is preserved`);
		task.status = 'pending';
		return task;
	}
	if (status === 'complete' && !refs.length) throw new Error(`task ${id}: completed tasks require evidence`);
	if (status === 'not-applicable' && !String(notes || '').trim()) throw new Error(`task ${id}: not-applicable tasks require rationale in --notes`);
	task.status = status;
	task.date = date || today();
	task.evidence = [...new Set(refs)];
	task.notes = notes != null ? String(notes) : task.notes ?? null;
	return task;
}

export function qualifyFinalRun(finalDir, runId) {
	const { runDir, summary } = readRunSummary(finalDir, runId);
	if (summary.kind !== 'final') return { qualified: false, reason: `run ${runId} is not marked as a final run`, runDir, summary };
	const verdict = evidenceVerdict(summary, runDir);
	return { qualified: verdict.captured, reason: verdict.reason, runDir, summary };
}

export function linkFinalRun(record, finalDir, runId) {
	const result = qualifyFinalRun(finalDir, runId);
	if (!result.qualified) throw new Error(`final run ${runId} does not qualify: ${result.reason}`);
	const evidence = `.project/final/${runId}/summary.json`;
	record.final_run = { run_id: runId, evidence };
	const task = record.tasks.find((item) => item.id === 'final-measurements');
	if (task) Object.assign(task, { status: 'complete', date: result.summary.finished_at?.slice(0, 10) || runId.slice(0, 10), evidence: [evidence], notes: task.notes ?? null });
	return result;
}

export function reviewLessons(record, date = today()) {
	if (!validDate(date)) throw new Error('lessons review date must be YYYY-MM-DD');
	const issues = closeoutSemanticIssues(record).filter((issue) => issue.startsWith('lesson ' ) || issue.startsWith('duplicate lesson'));
	if (issues.length) throw new Error(`lessons review failed:\n  ${issues.join('\n  ')}`);
	record.lessons.reviewed_at = date;
	return record;
}

export function closeoutReadiness(record, finalQualification = null) {
	const blockers = [];
	if (!record.acceptance?.date || !(record.acceptance.evidence || []).length) blockers.push('written acceptance is not evidenced');
	if (!record.final_run?.run_id) blockers.push('no final measurement run is referenced');
	else if (!finalQualification?.qualified) blockers.push(`referenced final run does not qualify${finalQualification?.reason ? `: ${finalQualification.reason}` : ''}`);
	for (const task of (record.tasks || []).filter((item) => item.required)) {
		if (task.status === 'pending') blockers.push(`required task is pending: ${task.id}`);
		if (task.status === 'complete' && !(task.evidence || []).length) blockers.push(`completed task lacks evidence: ${task.id}`);
		if (task.status === 'not-applicable' && !String(task.notes || '').trim()) blockers.push(`not-applicable task lacks rationale: ${task.id}`);
	}
	if (!record.lessons?.reviewed_at) blockers.push('lessons have not been explicitly reviewed');
	blockers.push(...closeoutSemanticIssues(record));
	return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function closeoutSummary(record, { date = today(), finalQualification = null } = {}) {
	const tasks = (record.tasks || []).map((task) => ({
		...task,
		overdue: task.status === 'pending' && !!task.due_date && task.due_date < date,
	}));
	const readiness = closeoutReadiness(record, finalQualification);
	return {
		ready: readiness.ready,
		blockers: readiness.blockers,
		acceptance_date: record.acceptance?.date || null,
		retirement_date: record.retention?.retirement_date || null,
		reminder_date: record.retention?.reminder_date || null,
		lessons_reviewed_at: record.lessons?.reviewed_at || null,
		tasks,
		pending: tasks.filter((task) => task.status === 'pending').length,
		overdue: tasks.filter((task) => task.overdue).length,
	};
}

export function renderCloseoutReport(record, projectName, options = {}) {
	const summary = closeoutSummary(record, options);
	const lines = [
		`# Project closeout — ${projectName}`,
		'',
		`Status: **${summary.ready ? 'ready to close' : 'not ready'}**`,
		'',
		`- Final run: ${record.final_run?.run_id || 'not set'}`,
		`- Acceptance: ${summary.acceptance_date || 'not recorded'}`,
		`- Retention reminder: ${summary.reminder_date || 'not calculated'}`,
		`- Retirement: ${summary.retirement_date || 'not calculated'}`,
		`- Lessons reviewed: ${summary.lessons_reviewed_at || 'no'}`,
		'',
		'## Operational checklist',
		'',
	];
	for (const task of summary.tasks) {
		const due = task.due_date ? ` — due ${task.due_date}${task.overdue ? ' (OVERDUE)' : ''}` : '';
		lines.push(`- [${task.status === 'pending' ? ' ' : 'x'}] ${task.title} — ${task.status}${due}`);
		if ((task.evidence || []).length) lines.push(`  - Evidence: ${task.evidence.join(', ')}`);
		if (String(task.notes || '').trim()) lines.push(`  - Notes: ${task.notes}`);
	}
	if (summary.blockers.length) {
		lines.push('', '## Closure blockers', '');
		for (const blocker of summary.blockers) lines.push(`- ${blocker}`);
	}
	lines.push('');
	return lines.join('\n');
}

export function renderLessonsReport(record, projectName, { upstreamOnly = false } = {}) {
	const items = (record.lessons?.items || []).filter((lesson) => !upstreamOnly || lesson.classification !== 'project-specific');
	const lines = [
		`# ${upstreamOnly ? 'Lessons upstream' : 'Closeout lessons'} — ${projectName}`,
		'',
		`Reviewed: ${record.lessons?.reviewed_at || 'not yet'}`,
		'',
	];
	if (!items.length) lines.push('_(No applicable lessons recorded.)_', '');
	for (const lesson of items) {
		lines.push(`## ${lesson.title}`, '', `- ID: \`${lesson.id}\``, `- Classification: \`${lesson.classification}\``, `- Evidence: ${(lesson.evidence || []).join(', ')}`, '', lesson.summary, '');
		if (lesson.classification !== 'project-specific') {
			lines.push(`**Recommended target:** ${lesson.recommended_target}`, '', `**Recommended action:** ${lesson.recommended_action}`, '');
		}
	}
	return lines.join('\n');
}
