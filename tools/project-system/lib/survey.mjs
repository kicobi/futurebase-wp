// lib/survey.mjs — survey question sets, form generation, results I/O, deltas.
//
// The SCALE questions are asked at every period so baseline↔30/90-day deltas
// compute (e.g. editor satisfaction 2.1 → 4.4). Period-specific open questions
// capture qualitative follow-up.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readYaml, writeYaml } from './yaml.mjs';

export const PERIODS = ['baseline', '30-days', '90-days'];

// Shared 1–5 scale questions (comparable across periods).
const SCALE = [
	{ id: 'ease-of-update', text: 'How easy is it to update the site?', scale: '1 very difficult – 5 very easy' },
	{ id: 'confidence', text: 'How confident are you making changes yourself?', scale: '1 not at all – 5 very confident' },
	{ id: 'overall-satisfaction', text: 'How satisfied are you with the site / process overall?', scale: '1 very unsatisfied – 5 very satisfied' },
];

const OPEN = {
	baseline: [
		{ id: 'hardest-tasks', text: 'Which tasks are hardest today?' },
		{ id: 'what-avoid', text: 'What do you avoid doing?' },
		{ id: 'whats-missing', text: 'What is missing?' },
		{ id: 'developer-help', text: 'How often do you need developer help?' },
	],
	'30-days': [
		{ id: 'tasks-easier', text: 'Which tasks are now easier?' },
		{ id: 'tasks-still-hard', text: 'Which tasks remain difficult?' },
		{ id: 'needed-dev-support', text: 'Have you needed developer support since launch?' },
		{ id: 'errors-confusing', text: 'Any errors or confusing behavior?' },
		{ id: 'anything-missing', text: 'Is anything still missing?' },
		{ id: 'improve-next', text: 'What should be improved next?' },
		{ id: 'business-impact', text: 'Any business or user impact noticed?' },
	],
	'90-days': [
		{ id: 'sustained-adoption', text: 'Is the team still using the new workflow?' },
		{ id: 'lead-quality', text: 'Has enquiry / lead quality changed?' },
		{ id: 'publishing-frequency', text: 'Are you publishing more often?' },
		{ id: 'support-burden', text: 'Has the support burden changed?' },
		{ id: 'next-phase', text: 'What is the next opportunity?' },
	],
};

export function questionsFor(period) {
	return [...SCALE, ...(OPEN[period] || [])];
}

export const scaleIds = () => SCALE.map((q) => q.id);

export function resultsPath(followUpDir, period) {
	return join(followUpDir, `survey-${period}.yml`);
}

export function loadResults(followUpDir, period) {
	const p = resultsPath(followUpDir, period);
	return existsSync(p) ? readYaml(p) : null;
}

export function saveResults(path, doc) {
	mkdirSync(dirname(path), { recursive: true });
	writeYaml(path, doc);
}

// Empty, schema-valid results template for a period (values null until filled).
export function resultsTemplate(period) {
	return {
		schema_version: 1,
		kind: 'survey-results',
		period,
		collected_at: '',
		respondent: '',
		items: questionsFor(period).map((q) => ({ id: q.id, question: q.text, value: null })),
	};
}

// Human-readable survey form (Markdown).
export function surveyMarkdown(period, projectName, metrics) {
	const lines = [];
	lines.push(`# ${period === 'baseline' ? 'Baseline' : period} survey — ${projectName}`);
	lines.push('');
	lines.push('Scale questions: reply with a number 1–5. Open questions: a sentence or two.');
	lines.push('');
	let n = 1;
	for (const q of SCALE) {
		lines.push(`${n}. **${q.text}** _(${q.scale})_`);
		lines.push('   Answer: ');
		lines.push('');
		n++;
	}
	for (const q of OPEN[period] || []) {
		lines.push(`${n}. **${q.text}**`);
		lines.push('   Answer: ');
		lines.push('');
		n++;
	}
	if (metrics?.items?.length && period !== 'baseline') {
		lines.push('---');
		lines.push('');
		lines.push('_Agreed success measures to keep in mind:_');
		for (const m of metrics.items.filter((x) => x.category !== 'delivery')) lines.push(`- ${m.title}`);
		lines.push('');
	}
	lines.push(`_Record answers in survey-${period}.yml, then run: futurebase metrics follow-up_`);
	return lines.join('\n');
}

// Numeric deltas for shared scale questions between an earlier and later survey.
export function scaleDeltas(earlier, later) {
	const byId = (doc) => Object.fromEntries((doc?.items || []).map((i) => [i.id, i.value]));
	const a = byId(earlier);
	const b = byId(later);
	const rows = [];
	for (const q of SCALE) {
		const before = typeof a[q.id] === 'number' ? a[q.id] : null;
		const after = typeof b[q.id] === 'number' ? b[q.id] : null;
		rows.push({ id: q.id, text: q.text, before, after, delta: before != null && after != null ? Number((after - before).toFixed(2)) : null });
	}
	return rows;
}

// Rules JSON Schema cannot express, and which matter because these values
// become a reported delta in front of a client.
//
// The schema types `value` as number|string|null because open questions carry
// prose — so it cannot know which ids are 1–5 scale questions, and draft-07
// cannot require uniqueness by a property. The result was that a hand-edited
// survey containing 999 and -50, or the same question twice, validated cleanly;
// scaleDeltas() builds its lookup with Object.fromEntries, so of two entries
// sharing an id the later silently wins.
export const SCALE_IDS = new Set(SCALE.map((question) => question.id));

export function surveyIssues(doc, expectedPeriod = null) {
	const issues = [];
	const seen = new Set();

	for (const item of doc?.items || []) {
		if (seen.has(item.id)) issues.push(`duplicate item "${item.id}" — the later answer would silently replace the earlier one`);
		seen.add(item.id);

		if (SCALE_IDS.has(item.id) && typeof item.value === 'number') {
			if (!Number.isInteger(item.value) || item.value < 1 || item.value > 5) {
				issues.push(`item "${item.id}" has value ${item.value}, outside the 1–5 scale it is measured on`);
			}
		}
	}

	// A file named for one period holding another's answers attributes the
	// measurement to the wrong point in time, which is the one thing a follow-up
	// survey exists to establish.
	if (expectedPeriod && doc?.period && doc.period !== expectedPeriod) {
		issues.push(`period is "${doc.period}" but the file is named for "${expectedPeriod}"`);
	}

	return issues;
}
