// lib/record.mjs — read a .project/ record into a summary for inspect/status.

import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readYaml, readJson } from './yaml.mjs';
import { validateBaselineRun } from './validate.mjs';
import { evidenceVerdict, isRunId, runDirFor } from './baseline.mjs';

function safe(fn, fallback) {
	try {
		return fn();
	} catch {
		return fallback;
	}
}

export function listRuns(dir) {
	return safe(
		() =>
			readdirSync(dir)
				.filter((f) => {
					if (!isRunId(f)) return false;
					const st = lstatSync(runDirFor(dir, f));
					return st.isDirectory() && !st.isSymbolicLink();
				})
				.sort(),
		[],
	);
}

function countFiles(dir) {
	return safe(() => readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).length, 0);
}

// Split runs into those that captured evidence and those that did not, with a
// reason for each of the latter. Both halves are reported: a silently dropped
// failure is how a broken run became an invisible one.
export function classifyRuns(dir) {
	const captured = [];
	const incomplete = [];
	for (const id of listRuns(dir)) {
		const summary = safe(() => readJson(join(dir, id, 'summary.json')), null);
		if (!summary) {
			incomplete.push({ id, reason: 'no summary.json' });
			continue;
		}
		const { valid } = validateBaselineRun(summary);
		if (!valid) {
			incomplete.push({ id, reason: 'summary failed schema validation' });
			continue;
		}
		if (summary.run_id !== id) {
			incomplete.push({ id, reason: `summary run id ${summary.run_id} does not match directory` });
			continue;
		}
		const verdict = evidenceVerdict(summary, runDirFor(dir, id));
		if (verdict.captured) captured.push(id);
		else incomplete.push({ id, reason: verdict.reason });
	}
	return { captured, incomplete };
}

// `runs` stays the raw directory count so nothing silently disappears from the
// record; `captured` is what the lifecycle may treat as done.
function runStats(dir) {
	const { captured, incomplete } = classifyRuns(dir);
	return { runs: listRuns(dir).length, captured: captured.length, incomplete, latest: latestRun(dir) };
}

function latestRun(dir) {
	const runs = listRuns(dir);
	const id = runs.at(-1);
	if (!id) return null;
	const summary = safe(() => readJson(join(dir, id, 'summary.json')), null);
	return { id, status: summary?.status ?? '?', kind: summary?.kind ?? null };
}

function fileState(path) {
	if (!existsSync(path)) return 'missing';
	const body = safe(() => readYaml(path), null);
	return body ? 'present' : 'present';
}

function docCount(path) {
	const doc = safe(() => readYaml(path), null);
	return Array.isArray(doc?.items) ? doc.items.length : 0;
}

export function recordSummary(paths) {
	const { projectDir } = paths;
	const project = safe(() => readYaml(join(projectDir, 'project.yml')), {}) || {};
	const metricsDoc = safe(() => readYaml(join(projectDir, 'metrics', 'metrics.yml')), null);
	const metricsItems = metricsDoc?.items || [];

	const followUp = ['baseline', '30-days', '90-days'].filter((p) => {
		const doc = safe(() => readYaml(join(projectDir, 'follow-up', `survey-${p}.yml`)), null);
		return doc && (doc.items || []).some((i) => i.value != null && i.value !== '');
	});

	const comparison = safe(() => readdirSync(paths.reportsDir).some((f) => /^comparison-.*\.html$/.test(f)), false);

	return {
		project: project.project || {},
		starter: project.starter || null,
		urls: project.urls || null,
		preset: project.preset || null,
		brief: countFiles(join(projectDir, 'brief')),
		scope: existsSync(join(projectDir, 'proposal', 'scope.md')) ? 'present' : 'missing',
		decisions: countFiles(join(projectDir, 'decisions')),
		metrics: { count: metricsItems.length, measured: metricsItems.filter((m) => m.baseline?.status === 'measured').length },
		observations: docCount(join(projectDir, 'observations.yml')),
		journeys: docCount(join(projectDir, 'metrics', 'journeys.yml')),
		baseline: runStats(paths.baselineDir),
		final: runStats(paths.finalDir),
		comparison,
		followUp,
	};
}
