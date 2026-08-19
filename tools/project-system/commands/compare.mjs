// commands/compare.mjs — diff the latest baseline against the latest final run.
//
// futurebase compare [--baseline-run <id>] [--final-run <id>] [--allow-mismatch]
//                    [--json] [--project-root <p>]
//
// Writes an internal + client-safe comparison report into .project/reports/.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../lib/output.mjs';
import { findProjectRoot, projectPaths, latestRunId, isRunId, readRunSummary, evidenceVerdict } from '../lib/baseline.mjs';
import { readYaml } from '../lib/yaml.mjs';
import { loadMetrics } from '../lib/metrics.mjs';
import { buildComparison, renderComparison } from '../lib/compare.mjs';
import { requirePath } from '../lib/paths.mjs';

export function compare(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	const baseId = flags['baseline-run'] || (existsSync(paths.baselineDir) ? latestRunId(paths.baselineDir) : null);
	const finalId = flags['final-run'] || (existsSync(paths.finalDir) ? latestRunId(paths.finalDir) : null);
	if (!baseId) die('no baseline run to compare — run: futurebase baseline run', EXIT.ACCESS_FAILURE, { json });
	if (!finalId) die('no final run to compare — run: futurebase final run', EXIT.ACCESS_FAILURE, { json });
	if (!isRunId(baseId)) die(`invalid baseline run id: ${baseId}`, EXIT.INVALID_CONFIG, { json });
	if (!isRunId(finalId)) die(`invalid final run id: ${finalId}`, EXIT.INVALID_CONFIG, { json });

	let baselineRunDir;
	let finalRunDir;
	let baselineSummary;
	let finalSummary;
	try {
		({ runDir: baselineRunDir, summary: baselineSummary } = readRunSummary(paths.baselineDir, baseId));
		({ runDir: finalRunDir, summary: finalSummary } = readRunSummary(paths.finalDir, finalId));
	} catch (err) {
		die(`cannot compare the selected runs: ${err.message}`, EXIT.INVALID_CONFIG, { json });
	}

	// A comparison is a claim made to a client about what changed, so both sides
	// have to be evidence worth standing behind.
	//
	// readRunSummary only proves the summary parses and matches its directory. A
	// run whose modules FAILED satisfies that too, and the partial artifacts it
	// left behind still contain numbers — so comparing them produced reports like
	// "broken links 9 → 0" from a baseline that had crashed part-way through the
	// crawl, and exited 0 while saying it.
	//
	// evidenceVerdict() already encodes the rule: something succeeded, nothing
	// failed, and every artifact a module claims is actually on disk. It was
	// applied when writing the record and not when reading it back.
	for (const [label, summary, runDir, id] of [
		['baseline', baselineSummary, baselineRunDir, baseId],
		['final', finalSummary, finalRunDir, finalId],
	]) {
		const verdict = evidenceVerdict(summary, runDir);
		if (verdict.captured) continue;
		const blocking = `${label} run ${id} did not capture usable evidence: ${verdict.reason}`;
		if (json) emitJson({ status: 'not-comparable', baseline_run: baseId, final_run: finalId, blocking: [blocking] }, EXIT.INVALID_CONFIG);
		fail(blocking);
		info('A comparison built on it would report movement that was never measured.');
		info(`Re-run the ${label} capture, or choose another run with --${label}-run.`);
		process.exit(EXIT.INVALID_CONFIG);
	}

	let projectName = root.split('/').pop();
	try {
		projectName = readYaml(join(paths.projectDir, 'project.yml'))?.project?.name || projectName;
	} catch {
		/* ignore */
	}
	const metrics = loadMetrics(paths.projectDir);

	const comparison = buildComparison(baselineRunDir, finalRunDir);

	// A method mismatch invalidates every row, so stop before writing reports
	// that would be quoted. --allow-mismatch exists because the operator may
	// genuinely know better, but it has to be said out loud: the mismatch is
	// then carried into the reports themselves rather than waved through.
	if (comparison.blocking.length && !flags['allow-mismatch']) {
		if (json) emitJson({ status: 'not-comparable', baseline_run: baseId, final_run: finalId, blocking: comparison.blocking }, EXIT.INVALID_CONFIG);
		fail(`runs ${baseId} and ${finalId} are not comparable:`);
		for (const b of comparison.blocking) info(`- ${b}`);
		console.log('');
		info('Re-run the final capture against the same configuration, or pass --allow-mismatch');
		info('to write the comparison anyway (the mismatch is recorded in the report).');
		process.exit(EXIT.INVALID_CONFIG);
	}

	const { internalMd, clientMd, html } = renderComparison({ projectName, baselineRun: baseId, finalRun: finalId, comparison, metrics });

	mkdirSync(paths.reportsDir, { recursive: true });
	const stamp = finalId;
	const htmlPath = requirePath(paths.reportsDir, `comparison-${stamp}.html`);
	writeFileSync(htmlPath, html, 'utf8');
	writeFileSync(requirePath(paths.reportsDir, `comparison-${stamp}.md`), internalMd, 'utf8');
	writeFileSync(requirePath(paths.reportsDir, `comparison-${stamp}-client.md`), clientMd, 'utf8');

	const improved = comparison.rows.filter((r) => r.change === 'better').length;
	const regressed = comparison.rows.filter((r) => r.change === 'worse').length;

	if (json) emitJson({
		status: 'ok',
		baseline_run: baseId,
		final_run: finalId,
		improved,
		regressed,
		rows: comparison.rows,
		limitations: comparison.limitations,
		blocking: comparison.blocking,
		mismatch_allowed: comparison.blocking.length > 0 && !!flags['allow-mismatch'],
		report: htmlPath,
	});

	ok(`compared ${baseId} → ${finalId}`);
	if (comparison.blocking.length) {
		warn('blocking mismatches were explicitly allowed:');
		for (const b of comparison.blocking) info(`- ${b}`);
		info('Client-facing improvement figures were withheld.');
		console.log('');
	}
	info(`${improved} improved · ${regressed} regressed · ${comparison.rows.length} measures`);
	for (const r of comparison.rows) {
		const mark = r.change === 'better' ? c.green('▲') : r.change === 'worse' ? c.red('▼') : c.dim('–');
		console.log(`  ${mark} ${r.label.padEnd(28)} ${r.before ?? '—'} → ${r.after ?? '—'}${r.unit ? ' ' + r.unit : ''}`);
	}
	if (comparison.limitations.length) {
		console.log('');
		info('limitations:');
		for (const l of comparison.limitations) info(`- ${l}`);
	}
	console.log('');
	info(`report:  ${htmlPath}`);
	info(`client:  ${join(paths.reportsDir, `comparison-${stamp}-client.md`)}`);
	process.exit(EXIT.OK);
}
