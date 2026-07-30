// test/run-evidence.test.mjs — can the record be trusted to say what happened?
//
// Two failures of the same kind: evidence that could be destroyed without a
// word, and evidence that reported success it had not earned. Every case here
// failed before the commit that added it.
//
// Run: npm test --prefix tools/project-system

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeRunDir, newRunId } from '../lib/baseline.mjs';
import { classifyRuns, listRuns } from '../lib/record.mjs';

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'wp-starter-runs-'));
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

function writeRun(baselineDir, runId, status) {
	const dir = join(baselineDir, runId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'summary.json'), JSON.stringify(summaryFor(runId, status), null, 2), 'utf8');
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
		assert.equal(captured.length, 2, 'completed and completed_with_warnings');
		assert.equal(incomplete.length, 2, 'partial and failed must not count');
		assert.deepEqual(
			incomplete.map((r) => r.reason).sort(),
			['failed', 'partial'],
		);
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
