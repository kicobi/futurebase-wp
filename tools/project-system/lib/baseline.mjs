// lib/baseline.mjs — baseline run scaffolding: project detection, dated runs,
// latest pointer, page resolution, and summary I/O. Modules and report
// generation build on top of this.

import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
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
		finalDir: join(projectDir, 'final'),
		reportsDir: join(projectDir, 'reports'),
	};
}

// The one definition of what a run directory is called. It lived here as an
// inline literal AND again in record.mjs, and when collision suffixes were
// added only one of them was updated — so `latestRunId()`'s fallback could not
// see a `-02` run and returned the older base run as the newest. Restating a
// pattern is how the two drift; this is exported so nothing has to.
export const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T\d{6}Z(-\d{2})?$/;

export function isRunId(value) {
	return typeof value === 'string' && RUN_ID_RE.test(value);
}

export function assertRunId(value, label = 'run id') {
	if (!isRunId(value)) throw new Error(`invalid ${label}: ${String(value)}`);
	return value;
}

// A run id is the only variable path component accepted here. Keeping this
// boundary shared prevents commands from joining an unchecked CLI flag or
// latest.json value onto a project path.
export function runDirFor(parentDir, runId) {
	const id = assertRunId(runId);
	const parent = resolve(parentDir);
	const dir = resolve(parent, id);
	const rel = relative(parent, dir);
	if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`run id escapes its parent directory: ${id}`);
	return dir;
}

function isRealDirectory(path) {
	try {
		const st = lstatSync(path);
		return st.isDirectory() && !st.isSymbolicLink();
	} catch {
		return false;
	}
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

// Create the run directory EXCLUSIVELY, and return the id that was actually
// used. `mkdirSync(dir, { recursive: true })` silently succeeds on a directory
// that already exists, and run ids only resolve to the second — so two captures
// in the same second shared one directory and the second overwrote the first's
// evidence, including its summary. Evidence that can be overwritten without a
// word is not evidence.
//
// Disambiguating suffixes are zero-padded so the lexical sort that
// latestRunId() and latestRun() depend on still orders them correctly (-02
// before -10, and the unsuffixed base before both).
export function makeRunDir(baselineDir, runId) {
	assertRunId(runId);
	mkdirSync(baselineDir, { recursive: true });
	for (let n = 1; n <= 99; n++) {
		const id = n === 1 ? runId : `${runId}-${String(n).padStart(2, '0')}`;
		try {
			const dir = join(baselineDir, id);
			mkdirSync(dir); // throws EEXIST rather than adopting someone else's run
			return { dir, runId: id };
		} catch (err) {
			if (err.code !== 'EEXIST') throw err;
		}
	}
	throw new Error(`could not create a unique run directory under ${baselineDir} (99 collisions on ${runId})`);
}

// Write summary.json (validated) + update the portable latest.json pointer.
export function writeSummary(runDir, summary) {
	assertRunId(summary?.run_id, 'summary run id');
	if (basename(resolve(runDir)) !== summary.run_id) {
		throw new Error(`summary run id ${summary.run_id} does not match directory ${basename(resolve(runDir))}`);
	}
	const { valid, errors } = validateBaselineRun(summary);
	if (!valid) throw new Error(`baseline summary failed schema validation:\n  ${errors.join('\n  ')}`);
	writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
}

export function updateLatest(baselineDir, runId) {
	const runDir = runDirFor(baselineDir, runId);
	if (!isRealDirectory(runDir)) throw new Error(`cannot point latest.json at a missing or symlinked run: ${runId}`);
	writeFileSync(join(baselineDir, 'latest.json'), JSON.stringify({ run_id: runId }, null, 2) + '\n', 'utf8');
}

export function latestRunId(baselineDir) {
	const ptr = join(baselineDir, 'latest.json');
	if (existsSync(ptr)) {
		try {
			const id = readJson(ptr).run_id;
			if (isRunId(id) && isRealDirectory(runDirFor(baselineDir, id))) return id;
		} catch {
			/* fall through */
		}
	}
	// fallback: newest dated dir
	try {
		const runs = readdirSync(baselineDir).filter((f) => isRunId(f) && isRealDirectory(runDirFor(baselineDir, f)));
		runs.sort();
		return runs.at(-1) || null;
	} catch {
		return null;
	}
}

export function readRunSummary(parentDir, runId) {
	const id = assertRunId(runId);
	const runDir = runDirFor(parentDir, id);
	const summary = readJson(join(runDir, 'summary.json'));
	const { valid, errors } = validateBaselineRun(summary);
	if (!valid) throw new Error(`summary failed schema validation:\n  ${errors.join('\n  ')}`);
	if (summary.run_id !== id) throw new Error(`summary run id ${summary.run_id} does not match directory ${id}`);
	return { runDir, summary };
}

const EVIDENCE_STATUSES = new Set(['complete', 'complete_with_warnings']);
const LEGACY_EVIDENCE_PATHS = {
	screenshots: 'screenshots/',
	lighthouse: 'lighthouse/',
	axe: 'accessibility/',
	crawl: 'crawl/',
	wordpress: 'wordpress/',
	hosting: 'hosting/',
	analytics: 'analytics/',
	journeys: 'journeys/',
	manual: 'notes/',
};

export function producesEvidence(module) {
	return EVIDENCE_STATUSES.has(module?.status);
}

function hasRegularArtifact(path) {
	let st;
	try {
		st = lstatSync(path);
	} catch {
		return false;
	}
	if (st.isSymbolicLink()) return false;
	if (st.isFile()) return true;
	if (!st.isDirectory()) return false;
	for (const entry of readdirSync(path)) {
		if (hasRegularArtifact(join(path, entry))) return true;
	}
	return false;
}

// Validate a module's claimed evidence without trusting its path. Version-1
// summaries may omit evidence_path, so callers can opt into the historical
// per-module directory map and still verify the artifact on disk.
export function checkModuleEvidence(runDir, module, { allowLegacy = false } = {}) {
	if (!producesEvidence(module)) return { valid: true, evidencePath: null, legacy: false };
	if (!isRealDirectory(resolve(runDir))) {
		return { valid: false, reason: `${module.module} evidence run directory is missing or symlinked` };
	}

	let evidencePath = module.evidence_path;
	let legacy = false;
	if (!evidencePath && allowLegacy) {
		evidencePath = LEGACY_EVIDENCE_PATHS[module.module];
		legacy = true;
	}
	if (!evidencePath) {
		return {
			valid: false,
			reason: allowLegacy
				? `legacy ${module.module} result predates evidence-path validation and has no conventional artifact path`
				: `${module.module} claimed ${module.status} without evidence_path`,
		};
	}
	if (
		typeof evidencePath !== 'string' ||
		isAbsolute(evidencePath) ||
		/^[A-Za-z]:[\\/]/.test(evidencePath) ||
		evidencePath.includes('\\') ||
		evidencePath.split('/').includes('..')
	) {
		return { valid: false, reason: `${module.module} evidence_path is not a safe relative path: ${String(evidencePath)}` };
	}

	const root = resolve(runDir);
	const target = resolve(root, evidencePath);
	const rel = relative(root, target);
	if (rel.startsWith('..') || isAbsolute(rel)) {
		return { valid: false, reason: `${module.module} evidence_path escapes the run directory: ${evidencePath}` };
	}

	// Refuse a symlink anywhere in the evidence path. Evidence must be an
	// artifact captured into this immutable run, not a live reference elsewhere.
	let cursor = root;
	for (const component of rel.split('/').filter(Boolean)) {
		cursor = join(cursor, component);
		try {
			if (lstatSync(cursor).isSymbolicLink()) {
				return { valid: false, reason: `${module.module} evidence_path contains a symlink: ${evidencePath}` };
			}
		} catch {
			return { valid: false, reason: `${module.module} evidence_path does not exist: ${evidencePath}` };
		}
	}
	if (!hasRegularArtifact(target)) {
		return { valid: false, reason: `${module.module} evidence_path contains no regular artifacts: ${evidencePath}` };
	}
	return { valid: true, evidencePath, legacy };
}

export function enforceModuleEvidence(runDir, module) {
	const check = checkModuleEvidence(runDir, module);
	if (check.valid) return module;
	return {
		...module,
		status: 'failed',
		reason: `invalid claimed evidence: ${check.reason}`,
	};
}

// Did this run actually capture evidence, in the sense that closes a lifecycle
// step? Deliberately NOT the same question as `status`.
//
// `status` is descriptive, and the baseline design is explicitly incremental —
// docs/baseline-system.md phases access, so modules that are `skipped`,
// `unavailable` or `pending` are an expected state and not a failure. But
// `completed_with_warnings` only means SOME module completed, and reading it as
// "captured" let one complete module alongside five FAILED ones close the step
// and send the operator on to compare against nothing.
//
// So the question asked here is narrower: did something succeed, and did
// nothing break? A module that could not run yet is tolerated. A module that
// ran and failed means this run is not the evidence anyone should build on.
export function evidenceVerdict(summary, runDir) {
	const modules = summary?.modules ?? [];
	const complete = modules.filter(producesEvidence);
	const failed = modules.filter((m) => m.status === 'failed').length;
	if (!complete.length) return { captured: false, reason: summary?.status === 'failed' ? 'failed' : 'no module produced evidence' };
	if (failed) return { captured: false, reason: `${failed} of ${modules.length} modules failed` };
	if (runDir) {
		const allowLegacy = summary?.schema_version === 1;
		for (const module of complete) {
			const check = checkModuleEvidence(runDir, module, { allowLegacy });
			if (!check.valid) return { captured: false, reason: check.reason };
		}
	}
	return { captured: true, reason: null };
}

// Roll module results into an overall run status.
export function overallStatus(modules) {
	if (!modules.length) return 'failed';
	const clean = modules.filter((m) => m.status === 'complete').length;
	const done = modules.filter(producesEvidence).length;
	const failed = modules.filter((m) => m.status === 'failed').length;
	if (clean === modules.length) return 'completed';
	if (done === 0 && failed === modules.length) return 'failed';
	if (done === 0) return 'partial';
	return 'completed_with_warnings';
}
