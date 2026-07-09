// lib/record.mjs — read a .project/ record into a summary for inspect/status.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readYaml, readJson } from './yaml.mjs';

const RUN_RE = /^\d{4}-\d{2}-\d{2}T\d{6}Z$/;

function safe(fn, fallback) {
	try {
		return fn();
	} catch {
		return fallback;
	}
}

export function listRuns(dir) {
	return safe(() => readdirSync(dir).filter((f) => RUN_RE.test(f) && statSync(join(dir, f)).isDirectory()).sort(), []);
}

function countFiles(dir) {
	return safe(() => readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).length, 0);
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
		baseline: { runs: listRuns(paths.baselineDir).length, latest: latestRun(paths.baselineDir) },
		final: { runs: listRuns(paths.finalDir).length, latest: latestRun(paths.finalDir) },
		comparison,
		followUp,
	};
}
