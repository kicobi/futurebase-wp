// lib/baseline.mjs — baseline run scaffolding: project detection, dated runs,
// latest pointer, page resolution, and summary I/O. Modules and report
// generation build on top of this.

import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readYaml, writeYaml, readJson } from './yaml.mjs';
import { validateBaselineRun } from './validate.mjs';

// Nearest ancestor of `start` that contains a .project/ directory (or the
// explicit override). Returns null if none is found.
export function findProjectRoot(start = process.cwd(), override) {
	if (override) return resolve(override);
	let dir = resolve(start);
	for (;;) {
		if (existsSync(join(dir, '.project'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

export function projectPaths(root) {
	const projectDir = join(root, '.project');
	return {
		root,
		projectDir,
		configPath: join(projectDir, 'baseline.config.yml'),
		baselineDir: join(projectDir, 'baseline'),
		reportsDir: join(projectDir, 'reports'),
	};
}

// Sortable, filesystem-safe run id: YYYY-MM-DDTHHMMSSZ (matches the schema).
export function newRunId(date = new Date()) {
	const iso = date.toISOString();
	return `${iso.slice(0, 10)}T${iso.slice(11, 19).replace(/:/g, '')}Z`;
}

export function loadConfig(configPath) {
	return readYaml(configPath);
}

// Resolve config.pages into absolute URLs. A page url may be absolute or
// relative to base_url.
export function resolvePages(config) {
	const base = config.base_url || null;
	return (config.pages || []).map((p) => {
		let abs = p.url;
		try {
			abs = base ? new URL(p.url, base).toString() : new URL(p.url).toString();
		} catch {
			abs = p.url; // leave as-is; the module will report the failure
		}
		return { name: p.name, url: abs, critical: !!p.critical };
	});
}

export function makeRunDir(baselineDir, runId) {
	const dir = join(baselineDir, runId);
	mkdirSync(dir, { recursive: true });
	return dir;
}

// Write summary.json (validated) + update the portable latest.json pointer.
export function writeSummary(runDir, summary) {
	const { valid, errors } = validateBaselineRun(summary);
	if (!valid) throw new Error(`baseline summary failed schema validation:\n  ${errors.join('\n  ')}`);
	writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
}

export function updateLatest(baselineDir, runId) {
	writeFileSync(join(baselineDir, 'latest.json'), JSON.stringify({ run_id: runId }, null, 2) + '\n', 'utf8');
}

export function latestRunId(baselineDir) {
	const ptr = join(baselineDir, 'latest.json');
	if (existsSync(ptr)) {
		try {
			return readJson(ptr).run_id;
		} catch {
			/* fall through */
		}
	}
	// fallback: newest dated dir
	try {
		const runs = readdirSync(baselineDir).filter((f) => /^\d{4}-\d{2}-\d{2}T\d{6}Z$/.test(f) && statSync(join(baselineDir, f)).isDirectory());
		runs.sort();
		return runs.at(-1) || null;
	} catch {
		return null;
	}
}

// Roll module results into an overall run status.
export function overallStatus(modules) {
	if (!modules.length) return 'failed';
	const done = modules.filter((m) => m.status === 'complete').length;
	const failed = modules.filter((m) => m.status === 'failed').length;
	if (done === modules.length) return 'completed';
	if (done === 0 && failed === modules.length) return 'failed';
	if (done === 0) return 'partial';
	return 'completed_with_warnings';
}
