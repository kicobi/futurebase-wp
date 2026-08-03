// commands/metrics/follow-up.mjs — combine survey periods into a follow-up report.
//
// futurebase metrics follow-up [--json] [--project-root <p>]
//
// Reads .project/follow-up/survey-*.yml, computes satisfaction deltas
// (baseline → 30/90 days), lists the agreed success metrics as a status
// checklist, and links the automated before/after comparison if one exists.

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { loadMetrics } from '../../lib/metrics.mjs';
import { validateSurveyResults } from '../../lib/validate.mjs';
import { loadResults, scaleDeltas, surveyIssues } from '../../lib/survey.mjs';
import { requirePath } from '../../lib/paths.mjs';

const answered = (doc) => (doc?.items || []).some((i) => i.value != null && i.value !== '');
const fmt = (v) => (v == null ? '—' : v);

export function metricsFollowUp(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);
	const followUpDir = join(paths.projectDir, 'follow-up');

	const surveys = {};
	const invalid = [];
	for (const period of ['baseline', '30-days', '90-days']) {
		const doc = loadResults(followUpDir, period);
		if (!doc) continue;
		const { valid, errors } = validateSurveyResults(doc);
		if (!valid) {
			invalid.push(`survey-${period}.yml: ${errors[0]}`);
			continue;
		}
		// The schema cannot see an out-of-range scale value, a duplicated
		// question, or a period that disagrees with the filename — and this is
		// the command that turns these answers into a delta shown to a client.
		const semantic = surveyIssues(doc, period);
		if (semantic.length) {
			invalid.push(`survey-${period}.yml: ${semantic[0]}`);
			continue;
		}
		if (answered(doc)) surveys[period] = doc;
	}

	if (!Object.keys(surveys).length) {
		const msg = invalid.length ? `no usable survey results (${invalid.join('; ')})` : 'no filled survey results — run: futurebase metrics survey --period 30-days --write, fill the .yml, then re-run';
		die(msg, EXIT.ACCESS_FAILURE, { json });
	}

	const metrics = loadMetrics(paths.projectDir);
	let projectName = root.split('/').pop();
	try {
		projectName = readYaml(join(paths.projectDir, 'project.yml'))?.project?.name || projectName;
	} catch {
		/* ignore */
	}

	// Satisfaction deltas: baseline → later period(s).
	const deltaSets = [];
	for (const later of ['30-days', '90-days']) {
		if (surveys.baseline && surveys[later]) deltaSets.push({ later, rows: scaleDeltas(surveys.baseline, surveys[later]) });
	}

	// Automated comparison, if present.
	const comparison = existsSync(paths.reportsDir) ? readdirSync(paths.reportsDir).find((f) => /^comparison-.*\.html$/.test(f)) : null;

	// --- build report ---
	const md = [];
	md.push(`# Follow-up — ${projectName}`);
	md.push('');
	md.push(`_Survey periods with answers: ${Object.keys(surveys).join(', ')}._`);
	md.push('');

	if (deltaSets.length) {
		md.push('## Satisfaction & workflow (survey deltas)');
		md.push('');
		for (const set of deltaSets) {
			md.push(`### Baseline → ${set.later}`);
			md.push('');
			md.push('| Question | Before | After | Δ |');
			md.push('|----------|--------|-------|---|');
			for (const r of set.rows) md.push(`| ${r.text} | ${fmt(r.before)} | ${fmt(r.after)} | ${r.delta == null ? '—' : (r.delta > 0 ? '+' : '') + r.delta} |`);
			md.push('');
		}
	} else {
		md.push('_Only one survey period has answers — record a baseline and a 30-day survey to see deltas._');
		md.push('');
	}

	// Open feedback from the latest answered follow-up period.
	const latest = surveys['90-days'] || surveys['30-days'];
	if (latest) {
		const open = (latest.items || []).filter((i) => typeof i.value === 'string' && i.value.trim() && !['ease-of-update', 'confidence', 'overall-satisfaction'].includes(i.id));
		if (open.length) {
			md.push(`## Open feedback (${latest.period})`);
			md.push('');
			for (const i of open) md.push(`- **${i.question || i.id}** ${i.value}`);
			md.push('');
		}
	}

	if (metrics?.items?.length) {
		md.push('## Agreed success metrics — status checklist');
		md.push('');
		for (const m of metrics.items) {
			const b = m.baseline?.status === 'measured' ? `${m.baseline.value}${m.baseline.unit ? ' ' + m.baseline.unit : ''}` : m.baseline?.status;
			md.push(`- [ ] **${m.title}** — baseline ${b}, measured by ${m.evidence_type} (owner ${m.owner})`);
		}
		md.push('');
		md.push('_Mark each: achieved · partially achieved · not achieved · not yet measurable · unavailable._');
		md.push('');
	}

	if (comparison) {
		md.push('## Automated before/after');
		md.push('');
		md.push(`See the launch comparison: \`reports/${comparison}\`.`);
		md.push('');
	}
	if (invalid.length) {
		md.push('## Skipped (invalid survey files)');
		md.push('');
		for (const i of invalid) md.push(`- ${i}`);
		md.push('');
	}

	mkdirSync(paths.reportsDir, { recursive: true });
	const out = requirePath(paths.reportsDir, 'follow-up.md');
	writeFileSync(out, md.join('\n'), 'utf8');

	if (json) emitJson({ status: 'ok', periods: Object.keys(surveys), deltas: deltaSets, report: out, comparison: comparison || null, invalid });

	ok(`follow-up report written: ${out}`);
	for (const set of deltaSets) {
		console.log('');
		console.log(c.bold(`Baseline → ${set.later}:`));
		for (const r of set.rows) {
			const d = r.delta == null ? c.dim('n/a') : r.delta > 0 ? c.green(`+${r.delta}`) : r.delta < 0 ? c.red(`${r.delta}`) : c.dim('0');
			console.log(`  ${r.text.padEnd(48)} ${fmt(r.before)} → ${fmt(r.after)}  ${d}`);
		}
	}
	process.exit(EXIT.OK);
}
