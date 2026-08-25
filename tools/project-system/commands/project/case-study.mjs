// commands/project/case-study.mjs — export an editable case-study Markdown draft.
//
// futurebase project case-study [--json] [--project-root <p>]
//
// Pulls the story together from the project record: situation, agreed goals,
// before/after (if a comparison exists), and caveats. An editable starting
// point — NOT auto-published copy.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths, latestRunId, readRunSummary, evidenceVerdict } from '../../lib/baseline.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { loadMetrics } from '../../lib/metrics.mjs';
import { buildComparison } from '../../lib/compare.mjs';
import { requirePath } from '../../lib/paths.mjs';

const fmt = (v, unit) => (v == null ? '—' : `${v}${unit ? ' ' + unit : ''}`);

export function caseStudy(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	let project = {};
	try {
		project = readYaml(join(paths.projectDir, 'project.yml'))?.project || {};
	} catch {
		/* ignore */
	}
	const name = project.name || root.split('/').pop();
	const metrics = loadMetrics(paths.projectDir);
	let closeout = null;
	try {
		closeout = readYaml(paths.at('closeout', 'closeout.yml'));
	} catch {
		/* closeout is optional for projects created before 2.1 */
	}

	const baseId = existsSync(paths.baselineDir) ? latestRunId(paths.baselineDir) : null;
	const finalId = existsSync(paths.finalDir) ? latestRunId(paths.finalDir) : null;
	let comparison = null;
	if (baseId && finalId) {
		try {
			const { runDir: baseDir, summary: baseSummary } = readRunSummary(paths.baselineDir, baseId);
			const { runDir: finalDir, summary: finalSummary } = readRunSummary(paths.finalDir, finalId);
			for (const [label, summary, runDir, id] of [
				['baseline', baseSummary, baseDir, baseId],
				['final', finalSummary, finalDir, finalId],
			]) {
				const verdict = evidenceVerdict(summary, runDir);
				if (!verdict.captured) throw new Error(`${label} run ${id} did not capture usable evidence: ${verdict.reason}`);
			}
			comparison = buildComparison(baseDir, finalDir);
		} catch (err) {
			die(`cannot build a case study from the selected runs: ${err.message}`, EXIT.INVALID_CONFIG, { json });
		}
	}

	const md = [];
	md.push(`# Case study — ${name}`);
	md.push('');
	md.push('> Editable draft generated from the project record. Review, tighten, and add narrative before using. Not auto-published copy.');
	md.push('');
	md.push('## The starting situation');
	md.push('');
	md.push(`_${project.type === 'new' ? 'A new site' : 'A redesign'} for ${name}. Describe the problem in the client's words._`);
	md.push('');
	md.push('## Agreed goals & how we measured success');
	md.push('');
	if (metrics?.items?.length) for (const m of metrics.items) md.push(`- **${m.title}** — ${m.category}, measured by ${m.evidence_type} (owner: ${m.owner})`);
	else md.push('- _(no success metrics recorded — run `futurebase metrics suggest`)_');
	md.push('');
	md.push('## What was built');
	md.push('');
	md.push('_Summarize the work delivered._');
	md.push('');
	md.push('## What measurably improved');
	md.push('');
	if (comparison?.blocking?.length) {
		// This draft becomes client-facing copy. A table of "improvements" drawn
		// from runs that measured different things is the one output where a
		// silent mismatch does real damage, so the numbers are withheld rather
		// than footnoted.
		md.push('> **Before/after figures are withheld: the two runs are not comparable.**');
		md.push('>');
		for (const b of comparison.blocking) md.push(`> - ${b}`);
		md.push('>');
		md.push('> Re-capture the final run against the baseline configuration, then regenerate this draft.');
		md.push('');
	} else if (comparison?.rows?.length) {
		md.push('| Measure | Before | After |');
		md.push('|---------|--------|-------|');
		for (const r of comparison.rows.filter((x) => x.change === 'better')) md.push(`| ${r.label} | ${fmt(r.before, r.unit)} | ${fmt(r.after, r.unit)} |`);
		md.push('');
	} else {
		md.push('_(run `futurebase baseline run`, `futurebase final run`, then `futurebase compare` to populate before/after.)_');
		md.push('');
	}
	md.push('## What still needs to be learned');
	md.push('');
	const post = (metrics?.items || []).filter((m) => (m.measure_at || []).some((w) => /30_days|90_days/.test(w)));
	if (post.length) for (const m of post) md.push(`- ${m.title} (review post-launch)`);
	else md.push('_(no post-launch measures scheduled)_');
	md.push('');
	md.push('## Internal delivery lessons (editable — do not publish)');
	md.push('');
	md.push('> This section is project-team working material. Remove it before publishing the case study.');
	md.push('');
	if (closeout?.lessons?.items?.length) {
		for (const lesson of closeout.lessons.items) {
			md.push(`- **${lesson.title}** [${lesson.classification}] — ${lesson.summary}`);
			if (lesson.classification !== 'project-specific') md.push(`  Recommended: ${lesson.recommended_action} → ${lesson.recommended_target}`);
		}
	} else md.push('_(no closeout lessons recorded or explicitly reviewed yet)_');
	md.push('');
	if (comparison?.limitations?.length) {
		md.push('## Caveats');
		md.push('');
		for (const l of comparison.limitations) md.push(`- ${l}`);
		md.push('');
	}

	mkdirSync(paths.reportsDir, { recursive: true });
	const out = requirePath(paths.reportsDir, 'case-study.md');
	writeFileSync(out, md.join('\n'), 'utf8');

	if (json) emitJson({ status: 'ok', path: out, has_comparison: !!comparison });
	ok(`case-study draft written: ${out}`);
	info('edit it before sharing — it is a starting point, not final copy.');
	process.exit(EXIT.OK);
}
