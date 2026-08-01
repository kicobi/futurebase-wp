// test/run-evidence.test.mjs — can the record be trusted to say what happened?
//
// Two failures of the same kind: evidence that could be destroyed without a
// word, and evidence that reported success it had not earned. Every case here
// failed before the commit that added it.
//
// Run: npm test --prefix tools/project-system

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	assertRunId,
	checkModuleEvidence,
	enforceModuleEvidence,
	evidenceVerdict,
	latestRunId,
	makeRunDir,
	newRunId,
	overallStatus,
	readRunSummary,
	runDirFor,
} from '../lib/baseline.mjs';
import { classifyRuns, listRuns } from '../lib/record.mjs';
import { validateBaselineRun } from '../lib/validate.mjs';
import { EXIT } from '../lib/output.mjs';
import { captureExitCode } from '../commands/capture.mjs';

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'futurebase-runs-'));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const summaryFor = (runId, status, modules = [{ module: 'crawl', status: 'complete' }]) => ({
	schema_version: 1,
	run_id: runId,
	project_type: 'new',
	kind: 'baseline',
	status,
	started_at: '2026-07-30T10:00:00.000Z',
	finished_at: '2026-07-30T10:04:00.000Z',
	modules,
});

// Modules consistent with the status, because the verdict is now computed from
// them. A fixture declaring `partial` while carrying a complete module is not a
// run any capture could produce, and testing against one proves nothing.
const MODULES_FOR = {
	completed: [{ module: 'crawl', status: 'complete' }],
	completed_with_warnings: [
		{ module: 'crawl', status: 'complete' },
		{ module: 'wordpress', status: 'unavailable' },
	],
	partial: [{ module: 'crawl', status: 'skipped' }],
	failed: [{ module: 'crawl', status: 'failed' }],
};

function writeRun(baselineDir, runId, status) {
	const dir = join(baselineDir, runId);
	mkdirSync(dir, { recursive: true });
	if (MODULES_FOR[status].some((module) => module.module === 'crawl' && ['complete', 'complete_with_warnings'].includes(module.status))) {
		mkdirSync(join(dir, 'crawl'), { recursive: true });
		writeFileSync(join(dir, 'crawl', 'crawl.json'), '{}\n', 'utf8');
	}
	writeFileSync(join(dir, 'summary.json'), JSON.stringify(summaryFor(runId, status, MODULES_FOR[status]), null, 2), 'utf8');
	return dir;
}

// --- run identity ------------------------------------------------------------

test('run ids are second-resolution, so collisions are reachable', () => {
	const at = new Date('2026-07-30T16:30:00.500Z');
	const alsoAt = new Date('2026-07-30T16:30:00.900Z');
	assert.equal(newRunId(at), newRunId(alsoAt), 'ids within one second are identical by design');
});

test('two runs in the same second get separate directories', () => {
	const { dir, cleanup } = sandbox();
	try {
		const id = newRunId(new Date('2026-07-30T16:30:00.000Z'));
		const first = makeRunDir(dir, id);
		const second = makeRunDir(dir, id);

		assert.equal(first.runId, id);
		assert.equal(second.runId, `${id}-02`, 'the collision must be disambiguated, not adopted');
		assert.notEqual(first.dir, second.dir);
		assert.ok(existsSync(first.dir) && existsSync(second.dir));
	} finally {
		cleanup();
	}
});

test("a second run cannot overwrite the first's evidence", () => {
	const { dir, cleanup } = sandbox();
	try {
		const id = newRunId(new Date('2026-07-30T16:30:00.000Z'));
		const first = makeRunDir(dir, id);
		writeFileSync(join(first.dir, 'summary.json'), '{"first":true}', 'utf8');

		const second = makeRunDir(dir, id);
		writeFileSync(join(second.dir, 'summary.json'), '{"second":true}', 'utf8');

		assert.equal(readFileSync(join(first.dir, 'summary.json'), 'utf8'), '{"first":true}');
	} finally {
		cleanup();
	}
});

test('suffixed ids keep the lexical sort that latest-run depends on', () => {
	const { dir, cleanup } = sandbox();
	try {
		const id = newRunId(new Date('2026-07-30T16:30:00.000Z'));
		const made = [];
		for (let i = 0; i < 11; i++) made.push(makeRunDir(dir, id).runId);
		for (const runId of made) writeFileSync(join(dir, runId, 'summary.json'), '{}', 'utf8');

		const sorted = listRuns(dir);
		assert.equal(sorted.length, 11);
		assert.equal(sorted.at(-1), `${id}-11`, 'zero padding must keep -11 after -02');
		assert.equal(sorted[0], id, 'the unsuffixed base sorts first');
	} finally {
		cleanup();
	}
});

// --- run status --------------------------------------------------------------

test('only runs that captured evidence count as captured', () => {
	const { dir, cleanup } = sandbox();
	try {
		writeRun(dir, '2026-07-30T100000Z', 'completed');
		writeRun(dir, '2026-07-30T110000Z', 'completed_with_warnings');
		writeRun(dir, '2026-07-30T120000Z', 'partial');
		writeRun(dir, '2026-07-30T130000Z', 'failed');

		const { captured, incomplete } = classifyRuns(dir);
		assert.equal(captured.length, 2, 'completed, and completed_with_warnings where nothing failed');
		assert.equal(incomplete.length, 2, 'partial and failed must not count');
		// A run where nothing completed reports that directly; the
		// "N of M modules failed" wording is for runs that produced SOME
		// evidence alongside failures, which is the case worth spelling out.
		assert.deepEqual(
			incomplete.map((r) => r.reason).sort(),
			['failed', 'no module produced evidence'],
		);
	} finally {
		cleanup();
	}
});

test('one complete module beside five failures is not captured evidence', () => {
	// `completed_with_warnings` only means SOMETHING completed. Reading it as
	// captured closed the lifecycle step on a run where five of six modules
	// broke, and sent the operator on to compare against almost nothing.
	const { dir, cleanup } = sandbox();
	try {
		const id = '2026-07-30T100000Z';
		const mods = [{ module: 'crawl', status: 'complete' }, ...['lighthouse', 'axe', 'screenshots', 'wordpress', 'manual'].map((m) => ({ module: m, status: 'failed' }))];
		mkdirSync(join(dir, id), { recursive: true });
		mkdirSync(join(dir, id, 'crawl'));
		writeFileSync(join(dir, id, 'crawl', 'crawl.json'), '{}\n', 'utf8');
		writeFileSync(join(dir, id, 'summary.json'), JSON.stringify({ ...summaryFor(id, 'completed_with_warnings'), modules: mods }), 'utf8');

		const { captured, incomplete } = classifyRuns(dir);
		assert.equal(captured.length, 0);
		assert.match(incomplete[0].reason, /5 of 6 modules failed/);
	} finally {
		cleanup();
	}
});

test('modules that could not run yet do not disqualify a run', () => {
	// The baseline design is explicitly phased — access arrives gradually, so
	// skipped/unavailable is an expected state, not a failure. Tightening the
	// gate must not break that.
	const { dir, cleanup } = sandbox();
	try {
		const id = '2026-07-30T100000Z';
		const mods = [
			{ module: 'crawl', status: 'complete' },
			{ module: 'wordpress', status: 'unavailable' },
			{ module: 'manual', status: 'skipped' },
		];
		mkdirSync(join(dir, id), { recursive: true });
		mkdirSync(join(dir, id, 'crawl'));
		writeFileSync(join(dir, id, 'crawl', 'crawl.json'), '{}\n', 'utf8');
		writeFileSync(join(dir, id, 'summary.json'), JSON.stringify({ ...summaryFor(id, 'completed_with_warnings'), modules: mods }), 'utf8');

		assert.equal(classifyRuns(dir).captured.length, 1);
	} finally {
		cleanup();
	}
});

test('latestRunId sees collision-suffixed runs', () => {
	// The suffix was added to record.mjs's matcher and not to the copy inside
	// baseline.mjs, so the fallback returned the older base run as the newest.
	const { dir, cleanup } = sandbox();
	try {
		const id = newRunId(new Date('2026-07-30T16:30:00.000Z'));
		const a = makeRunDir(dir, id);
		const b = makeRunDir(dir, id);
		assert.equal(b.runId, `${id}-02`);
		assert.equal(latestRunId(dir), `${id}-02`, 'the newest run is the suffixed one');
		assert.notEqual(latestRunId(dir), a.runId);
	} finally {
		cleanup();
	}
});

test('a run directory with no summary is incomplete, not captured', () => {
	const { dir, cleanup } = sandbox();
	try {
		mkdirSync(join(dir, '2026-07-30T100000Z'), { recursive: true });
		const { captured, incomplete } = classifyRuns(dir);
		assert.equal(captured.length, 0);
		assert.equal(incomplete[0].reason, 'no summary.json');
	} finally {
		cleanup();
	}
});

test('a summary that fails schema validation does not count', () => {
	const { dir, cleanup } = sandbox();
	try {
		const runDir = join(dir, '2026-07-30T100000Z');
		mkdirSync(runDir, { recursive: true });
		// status is not in the enum — a hand-edited or truncated summary.
		writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ ...summaryFor('2026-07-30T100000Z', 'completed'), status: 'looks-fine' }), 'utf8');

		const { captured, incomplete } = classifyRuns(dir);
		assert.equal(captured.length, 0);
		assert.equal(incomplete[0].reason, 'summary failed schema validation');
	} finally {
		cleanup();
	}
});

test('a suffixed run id validates against the schema', () => {
	const { dir, cleanup } = sandbox();
	try {
		writeRun(dir, '2026-07-30T100000Z-02', 'completed');
		const { captured, incomplete } = classifyRuns(dir);
		assert.equal(captured.length, 1, `suffixed ids must validate (got: ${JSON.stringify(incomplete)})`);
	} finally {
		cleanup();
	}
});

test('warning-bearing modules produce evidence and determine the warning exit status', () => {
	const modules = [
		{ module: 'axe', status: 'complete_with_warnings', evidence_path: 'accessibility/' },
		{ module: 'crawl', status: 'complete_with_warnings', evidence_path: 'crawl/' },
	];
	assert.equal(overallStatus(modules), 'completed_with_warnings');
	assert.equal(evidenceVerdict({ schema_version: 2, status: 'completed_with_warnings', modules }).captured, true);
	assert.equal(overallStatus([{ module: 'crawl', status: 'complete' }]), 'completed');
	assert.equal(overallStatus([{ module: 'crawl', status: 'failed' }]), 'failed');
	assert.equal(overallStatus([{ module: 'crawl', status: 'skipped' }]), 'partial');
	assert.equal(overallStatus([{ module: 'crawl', status: 'complete' }, { module: 'axe', status: 'failed' }]), 'completed_with_warnings');
	assert.equal(captureExitCode('completed'), EXIT.OK);
	assert.equal(captureExitCode('completed_with_warnings'), EXIT.WARNINGS);
	assert.equal(captureExitCode('partial'), EXIT.WARNINGS);
	assert.equal(captureExitCode('failed'), EXIT.MODULE_FAILURE);
});

test('schema version 2 requires evidence_path for claimed success while version 1 remains valid', () => {
	const id = '2026-07-30T100000Z';
	const legacy = summaryFor(id, 'completed');
	assert.equal(validateBaselineRun(legacy).valid, true);
	assert.equal(validateBaselineRun({ ...legacy, schema_version: 2 }).valid, false);
	assert.equal(
		validateBaselineRun({
			...legacy,
			schema_version: 2,
			modules: [{ module: 'crawl', status: 'complete', evidence_path: 'crawl/' }],
		}).valid,
		true,
	);
});

test('invalid claimed evidence is converted to a failed module before status calculation', () => {
	const { dir, cleanup } = sandbox();
	try {
		const runDir = join(dir, '2026-07-30T100000Z');
		mkdirSync(runDir);
		const missing = enforceModuleEvidence(runDir, {
			module: 'crawl',
			status: 'complete',
			evidence_path: 'crawl/',
		});
		assert.equal(missing.status, 'failed');
		assert.match(missing.reason, /invalid claimed evidence.*does not exist/);
		assert.equal(overallStatus([missing]), 'failed');
	} finally {
		cleanup();
	}
});

test('evidence must be contained, non-symlinked, and include a regular artifact', () => {
	const { dir, cleanup } = sandbox();
	try {
		const runDir = join(dir, '2026-07-30T100000Z');
		const outside = join(dir, 'outside');
		mkdirSync(runDir);
		mkdirSync(outside);
		writeFileSync(join(outside, 'artifact.json'), '{}\n');

		const module = { module: 'crawl', status: 'complete' };
		assert.equal(checkModuleEvidence(runDir, { ...module, evidence_path: '../outside/' }).valid, false);

		mkdirSync(join(runDir, 'empty'));
		assert.equal(checkModuleEvidence(runDir, { ...module, evidence_path: 'empty/' }).valid, false);

		symlinkSync(outside, join(runDir, 'linked'));
		assert.equal(checkModuleEvidence(runDir, { ...module, evidence_path: 'linked/' }).valid, false);

		mkdirSync(join(runDir, 'crawl'));
		writeFileSync(join(runDir, 'crawl', 'crawl.json'), '{}\n');
		assert.equal(checkModuleEvidence(runDir, { ...module, evidence_path: 'crawl/' }).valid, true);
	} finally {
		cleanup();
	}
});

test('legacy runs infer and verify their conventional evidence directory', () => {
	const { dir, cleanup } = sandbox();
	try {
		const id = '2026-07-30T100000Z';
		const runDir = writeRun(dir, id, 'completed');
		const summary = summaryFor(id, 'completed');
		assert.equal(evidenceVerdict(summary, runDir).captured, true);
		rmSync(join(runDir, 'crawl'), { recursive: true });
		const verdict = evidenceVerdict(summary, runDir);
		assert.equal(verdict.captured, false);
		assert.match(verdict.reason, /predates evidence-path validation|does not exist/);
	} finally {
		cleanup();
	}
});

test('run IDs, pointers, directories, and summary identities share one validator', () => {
	const { dir, cleanup } = sandbox();
	try {
		assert.throws(() => assertRunId('../outside'), /invalid run id/);
		assert.throws(() => runDirFor(dir, '2026-07-30T100000Z.json'), /invalid run id/);

		const first = '2026-07-30T100000Z';
		const second = '2026-07-30T110000Z';
		writeRun(dir, first, 'completed');
		writeRun(dir, second, 'completed');
		writeFileSync(join(dir, 'latest.json'), JSON.stringify({ run_id: '../../escape' }));
		assert.equal(latestRunId(dir), second, 'a corrupt pointer falls back to the newest valid contained run');

		const wrong = summaryFor(first, 'completed');
		writeFileSync(join(dir, second, 'summary.json'), JSON.stringify(wrong));
		assert.throws(() => readRunSummary(dir, second), /does not match directory/);
	} finally {
		cleanup();
	}
});

test('symlinked run directories are never selected', () => {
	const { dir, cleanup } = sandbox();
	try {
		const outside = join(dir, 'outside');
		mkdirSync(outside);
		const linkedId = '2026-07-30T120000Z';
		symlinkSync(outside, join(dir, linkedId));
		assert.deepEqual(listRuns(dir), []);
		assert.equal(latestRunId(dir), null);
	} finally {
		cleanup();
	}
});
