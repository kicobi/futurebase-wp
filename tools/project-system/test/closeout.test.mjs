import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
	acceptProject,
	closeoutReadiness,
	closeoutSemanticIssues,
	closeoutSummary,
	linkFinalRun,
	newCloseoutRecord,
	renderLessonsReport,
	reviewLessons,
	setCloseoutTask,
	today,
} from '../lib/closeout.mjs';
import { validateCloseout } from '../lib/validate.mjs';
import { readYaml, writeYaml } from '../lib/yaml.mjs';
import { inspectProjectRecord } from '../commands/project/validate.mjs';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(TOOL_ROOT, 'bin', 'futurebase.mjs');

const makeSandbox = () => {
	const root = mkdtempSync(join(tmpdir(), 'futurebase-closeout-'));
	return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

function writeFinalRun(finalDir, { id = '2026-08-19T120000Z', failed = false } = {}) {
	const runDir = join(finalDir, id);
	mkdirSync(join(runDir, 'manual'), { recursive: true });
	writeFileSync(join(runDir, 'manual', 'observations.md'), 'captured\n');
	const modules = failed
		? [
			{ module: 'manual', status: 'complete', evidence_path: 'manual/' },
			{ module: 'crawl', status: 'failed', reason: 'runtime failure' },
		]
		: [{ module: 'manual', status: 'complete', evidence_path: 'manual/' }];
	writeFileSync(join(runDir, 'summary.json'), JSON.stringify({
		schema_version: 2,
		run_id: id,
		project_type: 'redesign',
		kind: 'final',
		status: failed ? 'completed_with_warnings' : 'completed',
		started_at: '2026-08-19T12:00:00.000Z',
		finished_at: '2026-08-19T12:05:00.000Z',
		modules,
	}, null, 2));
	return id;
}

test('the seeded closeout record is schema-valid and carries the full checklist', () => {
	const record = newCloseoutRecord();
	assert.equal(validateCloseout(record).valid, true);
	assert.equal(closeoutSemanticIssues(record).length, 0);
	assert.deepEqual(record.tasks.map((task) => task.id), [
		'final-measurements',
		'written-acceptance',
		'backup-integrity',
		'restore-drill',
		'credential-reset',
		'final-backup',
		'credential-revocation',
		'expiry-warning',
		'offsite-deletion',
		'staging-retirement',
		'rollback-deletion',
		'billing-closure',
	]);
});

test('acceptance derives retirement and reminder dates from one retention window', () => {
	const record = newCloseoutRecord();
	acceptProject(record, { date: '2026-08-19', evidence: ['email:acceptance'] });
	assert.equal(record.retention.retirement_date, '2026-09-18');
	assert.equal(record.retention.reminder_date, '2026-09-11');
	assert.equal(record.tasks.find((task) => task.id === 'expiry-warning').due_date, '2026-09-11');
	assert.equal(record.tasks.find((task) => task.id === 'staging-retirement').due_date, '2026-09-18');
});

test('acceptance corrections require both flags and preserve completion evidence', () => {
	const record = newCloseoutRecord();
	acceptProject(record, { date: '2026-08-19', evidence: ['email:first'] });
	const task = record.tasks.find((item) => item.id === 'written-acceptance');
	assert.throws(() => acceptProject(record, { date: '2026-08-19', evidence: ['slack:replacement'] }), /--force --confirm/);
	assert.deepEqual(record.acceptance.evidence, ['email:first']);
	assert.throws(() => acceptProject(record, { date: '2026-08-20', evidence: ['email:correction'] }), /--force --confirm/);
	acceptProject(record, { date: '2026-08-20', evidence: ['email:correction'], force: true, confirm: true });
	assert.deepEqual(task.evidence, ['email:first']);
	assert.equal(task.date, '2026-08-19');
	assert.equal(record.retention.retirement_date, '2026-09-19');
	record.retention.days = 45;
	acceptProject(record, { date: '2026-08-20', evidence: ['email:correction'], force: true, confirm: true });
	assert.equal(record.retention.retirement_date, '2026-10-04');
});

test('default task dates use the local calendar day', () => {
	assert.equal(today(new Date(2026, 7, 19, 0, 30)), '2026-08-19');
});

test('retention and task evidence rules fail closed', () => {
	const record = newCloseoutRecord();
	record.retention.reminder_days_before = 30;
	assert.match(closeoutSemanticIssues(record).join('\n'), /must be shorter/);
	assert.throws(() => setCloseoutTask(record, { id: 'restore-drill', status: 'complete' }), /require evidence/);
	assert.throws(() => setCloseoutTask(record, { id: 'restore-drill', status: 'not-applicable' }), /require rationale/);
	setCloseoutTask(record, { id: 'restore-drill', status: 'complete', date: '2026-08-20', evidence: ['report:restore'], notes: 'Restored cleanly.' });
	setCloseoutTask(record, { id: 'restore-drill', status: 'pending' });
	const reopened = record.tasks.find((task) => task.id === 'restore-drill');
	assert.equal(reopened.status, 'pending');
	assert.equal(reopened.date, '2026-08-20');
	assert.deepEqual(reopened.evidence, ['report:restore']);
	assert.equal(reopened.notes, 'Restored cleanly.');
	assert.throws(() => setCloseoutTask(record, { id: 'restore-drill', status: 'pending', notes: 'replace' }), /audit trail is preserved/);
	record.tasks = record.tasks.filter((task) => task.id !== 'billing-closure');
	assert.match(closeoutSemanticIssues(record).join('\n'), /required closeout task is missing: billing-closure/);
});

test('set-final accepts captured final evidence and refuses any failed module', () => {
	const { root, cleanup } = makeSandbox();
	try {
		const finalDir = join(root, 'final');
		const good = writeFinalRun(finalDir);
		const bad = writeFinalRun(finalDir, { id: '2026-08-19T130000Z', failed: true });
		const record = newCloseoutRecord();
		linkFinalRun(record, finalDir, good);
		assert.equal(record.final_run.run_id, good);
		assert.deepEqual(record.tasks.find((task) => task.id === 'final-measurements').evidence, [`.project/final/${good}/summary.json`]);
		assert.throws(() => linkFinalRun(record, finalDir, bad), /1 of 2 modules failed/);
	} finally {
		cleanup();
	}
});

test('explicit lesson review allows empty lessons and reusable lessons require an action target', () => {
	const record = newCloseoutRecord();
	reviewLessons(record, '2026-08-21');
	assert.equal(record.lessons.reviewed_at, '2026-08-21');
	record.lessons.items.push({ id: 'sampler', title: 'Sampler', summary: 'Reuse the production gate.', classification: 'starter-improvement', evidence: ['report:1'] });
	assert.match(closeoutSemanticIssues(record).join('\n'), /recommended_target/);
});

test('upstream lesson reports exclude project-specific entries', () => {
	const record = newCloseoutRecord();
	record.lessons.reviewed_at = '2026-08-21';
	record.lessons.items = [
		{ id: 'local-copy', title: 'Local wording', summary: 'Client-only.', classification: 'project-specific', evidence: ['decision:1'] },
		{ id: 'starter-gate', title: 'Starter gate', summary: 'Reusable.', classification: 'starter-improvement', evidence: ['report:2'], recommended_target: 'futurebase', recommended_action: 'Add the gate' },
	];
	const report = renderLessonsReport(record, 'Client', { upstreamOnly: true });
	assert.doesNotMatch(report, /Local wording/);
	assert.match(report, /Starter gate/);
});

test('readiness includes overdue dates and opens only after every gate is evidenced', () => {
	const { root, cleanup } = makeSandbox();
	try {
		const finalDir = join(root, 'final');
		const id = writeFinalRun(finalDir);
		const record = newCloseoutRecord();
		const qualification = linkFinalRun(record, finalDir, id);
		acceptProject(record, { date: '2026-08-19', evidence: ['email:acceptance'] });
		assert.ok(closeoutSummary(record, { date: '2026-09-12', finalQualification: qualification }).overdue > 0);
		for (const task of record.tasks.filter((item) => item.status === 'pending')) {
			setCloseoutTask(record, { id: task.id, status: 'not-applicable', notes: 'Confirmed outside the project record.' });
		}
		reviewLessons(record, '2026-08-21');
		assert.equal(closeoutReadiness(record, qualification).ready, true);
		assert.equal(closeoutSummary(record, { date: '2026-09-19', finalQualification: qualification }).overdue, 0);
	} finally {
		cleanup();
	}
});

test('whole-record validation secret-scans closeout free text', () => {
	const { root, cleanup } = makeSandbox();
	try {
		mkdirSync(join(root, '.project', 'closeout'), { recursive: true });
		writeYaml(join(root, '.project', 'project.yml'), {
			schema_version: 1,
			project: { name: 'Client', slug: 'client', stage: 'active', status: 'in-progress', type: 'redesign', created_at: '2026-08-01' },
			privacy: { local_only: false, allow_git: true, allow_credentials_in_project: false },
		});
		const record = newCloseoutRecord();
		record.tasks.find((task) => task.id === 'restore-drill').notes = 'api_key: AbcdEFGHijklMNOP123456789';
		writeYaml(join(root, '.project', 'closeout', 'closeout.yml'), record);
		const audit = inspectProjectRecord(root);
		assert.equal(audit.findings.some((finding) => finding.rule === 'assigned-secret'), true);
	} finally {
		cleanup();
	}
});

test('the public closeout CLI seeds records, derives dates, and surfaces tasks', () => {
	const { root, cleanup } = makeSandbox();
	try {
		const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--project-root', root, '--json'], { encoding: 'utf8' });
		const init = run('project', 'init', '--name', 'CLI Client', '--slug', 'cli-client', '--type', 'redesign');
		assert.equal(init.status, 0, init.stderr || init.stdout);
		assert.equal(existsSync(join(root, '.project', 'closeout', 'closeout.yml')), true);

		const accepted = run('project', 'closeout', 'accept', '--date', '2026-08-19', '--evidence', 'email:acceptance');
		assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
		assert.equal(JSON.parse(accepted.stdout).retention.retirement_date, '2026-09-18');

		const status = run('project', 'closeout', 'status');
		assert.equal(status.status, 0, status.stderr || status.stdout);
		assert.ok(JSON.parse(status.stdout).closeout.pending > 0);

		const tasks = run('project', 'tasks');
		assert.equal(tasks.status, 0, tasks.stderr || tasks.stdout);
		const taskJson = JSON.parse(tasks.stdout);
		assert.ok(taskJson.tasks.some((task) => task.id === 'closeout:expiry-warning'));
		assert.equal(taskJson.closeout.retirement_date, '2026-09-18');

		const markdown = spawnSync(process.execPath, [CLI, 'project', 'tasks', '--project-root', root, '--format', 'markdown'], { encoding: 'utf8' });
		assert.equal(markdown.status, 0, markdown.stderr);
		assert.match(markdown.stdout, /Closeout: \*\*not ready\*\*/);
		assert.match(markdown.stdout, /due 2026-09-11/);

		const github = spawnSync(process.execPath, [CLI, 'project', 'tasks', '--project-root', root, '--format', 'github'], { encoding: 'utf8' });
		assert.equal(github.status, 0, github.stderr);
		assert.match(github.stdout, /# Closeout: not ready/);
		assert.match(github.stdout, /Due: 2026-09-11/);
	} finally {
		cleanup();
	}
});

test('inspect, status, and tasks tolerate an invalid hand-edited task without a stack trace', () => {
	const { root, cleanup } = makeSandbox();
	try {
		const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--project-root', root, '--json'], { encoding: 'utf8' });
		assert.equal(run('project', 'init', '--name', 'Edited Client', '--slug', 'edited-client', '--type', 'redesign').status, 0);
		const closeoutPath = join(root, '.project', 'closeout', 'closeout.yml');
		const record = readYaml(closeoutPath);
		const task = record.tasks.find((item) => item.id === 'restore-drill');
		task.status = 'complete';
		delete task.evidence;
		writeYaml(closeoutPath, record);

		for (const args of [
			['project', 'inspect'],
			['project', 'status'],
			['project', 'tasks'],
		]) {
			const result = run(...args);
			assert.equal(result.status, 0, result.stderr || result.stdout);
			assert.doesNotMatch(result.stderr, /TypeError|at closeoutReadiness/);
		}

		const strict = run('project', 'closeout', 'status');
		assert.equal(strict.status, 2);
		assert.match(JSON.parse(strict.stdout).message, /closeout record is invalid/);
		assert.doesNotMatch(strict.stderr, /TypeError|at closeoutReadiness/);
	} finally {
		cleanup();
	}
});

test('complete requires confirmation and readiness and refuses a secret-bearing record', () => {
	const { root, cleanup } = makeSandbox();
	try {
		const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--project-root', root, '--json'], { encoding: 'utf8' });
		assert.equal(run('project', 'init', '--name', 'Guarded Client', '--slug', 'guarded-client', '--type', 'redesign').status, 0);

		const unconfirmed = run('project', 'closeout', 'complete');
		assert.equal(unconfirmed.status, 2);
		assert.match(JSON.parse(unconfirmed.stdout).message, /--confirm/);
		const notReady = run('project', 'closeout', 'complete', '--confirm');
		assert.equal(notReady.status, 2);
		assert.match(JSON.parse(notReady.stdout).message, /closeout is not ready/);

		const id = writeFinalRun(join(root, '.project', 'final'));
		assert.equal(run('project', 'closeout', 'set-final', '--run-id', id).status, 0);
		assert.equal(run('project', 'closeout', 'accept', '--date', '2026-08-19', '--evidence', 'email:acceptance').status, 0);
		const closeoutPath = join(root, '.project', 'closeout', 'closeout.yml');
		const record = readYaml(closeoutPath);
		for (const task of record.tasks.filter((item) => item.status === 'pending')) {
			setCloseoutTask(record, { id: task.id, status: 'not-applicable', date: '2026-08-21', notes: 'Client confirmed this task is outside scope.' });
		}
		record.tasks.find((task) => task.id === 'restore-drill').notes += ' api_key: AbcdEFGHijklMNOP123456789';
		reviewLessons(record, '2026-08-21');
		writeYaml(closeoutPath, record);

		const blocked = run('project', 'closeout', 'complete', '--confirm');
		assert.equal(blocked.status, 6, blocked.stderr || blocked.stdout);
		assert.match(JSON.parse(blocked.stdout).message, /potential secret/);
		assert.equal(readYaml(join(root, '.project', 'project.yml')).project.status, 'in-progress');
	} finally {
		cleanup();
	}
});

test('closure writes reports, closes project.yml, and feeds lessons to the editable case study', () => {
	const { root, cleanup } = makeSandbox();
	try {
		const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--project-root', root, '--json'], { encoding: 'utf8' });
		assert.equal(run('project', 'init', '--name', 'Closed Client', '--slug', 'closed-client', '--type', 'redesign').status, 0);
		const id = writeFinalRun(join(root, '.project', 'final'));
		assert.equal(run('project', 'closeout', 'set-final', '--run-id', id).status, 0);
		assert.equal(run('project', 'closeout', 'accept', '--date', '2026-08-19', '--evidence', 'email:acceptance').status, 0);

		const closeoutPath = join(root, '.project', 'closeout', 'closeout.yml');
		const record = readYaml(closeoutPath);
		for (const task of record.tasks.filter((item) => item.status === 'pending')) {
			setCloseoutTask(record, { id: task.id, status: 'not-applicable', date: '2026-08-21', notes: 'Client confirmed this task is outside scope.' });
		}
		record.lessons.items = [
			{ id: 'client-copy', title: 'Client wording', summary: 'Keep this with the project.', classification: 'project-specific', evidence: ['decision:1'] },
			{ id: 'starter-check', title: 'Starter check', summary: 'Reuse this validation.', classification: 'starter-improvement', evidence: ['report:1'], recommended_target: 'futurebase', recommended_action: 'Add the validation' },
		];
		reviewLessons(record, '2026-08-21');
		writeYaml(closeoutPath, record);

		const complete = run('project', 'closeout', 'complete', '--confirm');
		assert.equal(complete.status, 0, complete.stderr || complete.stdout);
		const project = readYaml(join(root, '.project', 'project.yml'));
		assert.equal(project.project.status, 'closed');
		assert.match(project.project.closed_at, /^\d{4}-\d{2}-\d{2}T/);
		assert.equal(existsSync(join(root, '.project', 'reports', 'closeout.md')), true);
		const upstream = readFileSync(join(root, '.project', 'reports', 'lessons-upstream.md'), 'utf8');
		assert.match(upstream, /Starter check/);
		assert.doesNotMatch(upstream, /Client wording/);

		const caseStudy = run('project', 'case-study');
		assert.equal(caseStudy.status, 0, caseStudy.stderr || caseStudy.stdout);
		const draft = readFileSync(join(root, '.project', 'reports', 'case-study.md'), 'utf8');
		assert.match(draft, /Internal delivery lessons \(editable — do not publish\)/);
		assert.match(draft, /Starter check/);
	} finally {
		cleanup();
	}
});
