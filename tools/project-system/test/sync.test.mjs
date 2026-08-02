// test/sync.test.mjs — portable synchronization contract.
//
// These tests use real git trees because sync decisions depend on blob IDs,
// file modes, and commit ancestry. Synthetic entries would miss the exact
// properties the command has to preserve in promoted projects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	lstatSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	CLASS,
	applyEntry,
	classifyPath,
	detectBase,
	isAncestor,
	missingWorkflowScripts,
	planDeps,
	planFiles,
	PRODUCT_ONLY,
	safeFiles,
} from '../lib/sync.mjs';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(TOOL_ROOT, 'bin', 'futurebase.mjs');

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'futurebase-sync-'));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function git(cwd, ...args) {
	return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(root, rel, content, mode = null) {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, content);
	if (mode !== null) chmodSync(abs, mode);
}

function initRepo(root) {
	mkdirSync(root, { recursive: true });
	git(root, 'init', '-q');
	git(root, 'config', 'user.email', 'tests@example.test');
	git(root, 'config', 'user.name', 'Project System Tests');
}

function commitAll(root, message) {
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', message);
	return git(root, 'rev-parse', 'HEAD');
}

test('the navigation migration guide is surfaced for manual porting', () => {
	assert.equal(classifyPath('docs/navigation-migration-v2.md'), CLASS.REVIEW);
});

test('client-owned WordPress readme metadata is never surfaced by sync', () => {
	assert.equal(classifyPath('readme.txt'), CLASS.NEVER);
});

test('dependency planning preserves project identity and blocks an unsafe lock replacement', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);

		write(
			starter,
			'package.json',
			JSON.stringify({ name: 'futurebase', version: '2.0.0', dependencies: { shared: '2.0.0', upstream: '1.0.0' } }, null, '\t') + '\n',
		);
		write(
			starter,
			'package-lock.json',
			JSON.stringify({ name: 'futurebase', version: '2.0.0', lockfileVersion: 3, packages: { '': { name: 'futurebase', version: '2.0.0' } } }, null, '\t') + '\n',
		);
		write(
			starter,
			'composer.json',
			JSON.stringify({ name: 'colinlewis/futurebase', require: { shared: '2.0.0' } }, null, '\t') + '\n',
		);
		write(starter, 'composer.lock', JSON.stringify({ 'content-hash': 'upstream', packages: [] }, null, '\t') + '\n');
		const ref = commitAll(starter, 'starter dependencies');

		write(
			projectRoot,
			'package.json',
			JSON.stringify({ name: 'client/theme', version: '1.0.0', dependencies: { shared: '1.0.0', 'client-only': '1.0.0' } }, null, '\t') + '\n',
		);
		write(
			projectRoot,
			'package-lock.json',
			JSON.stringify({ name: 'client/theme', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'client/theme', version: '1.0.0' } } }, null, '\t') + '\n',
		);
		write(
			projectRoot,
			'composer.json',
			JSON.stringify({ name: 'client/theme', require: { shared: '1.0.0', 'client/only': '1.0.0' } }, null, '\t') + '\n',
		);
		write(projectRoot, 'composer.lock', JSON.stringify({ 'content-hash': 'client', packages: [] }, null, '\t') + '\n');

		const plan = planDeps({ projectRoot, starter, ref });
		const nextPackage = JSON.parse(plan.find((entry) => entry.rel === 'package.json').next);
		const nextComposer = JSON.parse(plan.find((entry) => entry.rel === 'composer.json').next);

		assert.equal(nextPackage.name, 'client/theme');
		assert.deepEqual(nextPackage.dependencies, {
			shared: '2.0.0',
			'client-only': '1.0.0',
			upstream: '1.0.0',
		});
		assert.equal(nextComposer.name, 'client/theme');
		assert.deepEqual(nextComposer.require, {
			shared: '2.0.0',
			'client/only': '1.0.0',
		});
		assert.equal(plan.find((entry) => entry.rel === 'package-lock.json').state, 'blocked');
		assert.equal(plan.find((entry) => entry.rel === 'composer.lock').state, 'blocked');
	} finally {
		cleanup();
	}
});

test('dependency sync preserves all four client npm lock identity fields across repeated applies', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'package.json', JSON.stringify({ name: 'futurebase', version: '2.0.0', dependencies: { shared: '2.0.0' } }, null, '\t') + '\n');
		write(
			starter,
			'package-lock.json',
			JSON.stringify({ name: 'futurebase', version: '2.0.0', lockfileVersion: 3, packages: { '': { name: 'futurebase', version: '2.0.0' } } }, null, '\t') + '\n',
		);
		const ref = commitAll(starter, 'Futurebase dependency layer');
		write(projectRoot, 'package.json', JSON.stringify({ name: 'client-theme', version: '1.0.0', dependencies: { shared: '1.0.0' } }, null, '\t') + '\n');
		write(
			projectRoot,
			'package-lock.json',
			JSON.stringify({ name: 'client-theme', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'client-theme', version: '1.0.0' } } }, null, '\t') + '\n',
		);

		for (let pass = 0; pass < 2; pass += 1) {
			const plan = planDeps({ projectRoot, starter, ref });
			for (const entry of plan.filter((candidate) => candidate.state === 'add' || candidate.state === 'update')) {
				assert.equal(applyEntry(entry, { projectRoot, starter }), true);
			}
			const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
			const lock = JSON.parse(readFileSync(join(projectRoot, 'package-lock.json'), 'utf8'));
			assert.equal(manifest.name, 'client-theme');
			assert.equal(manifest.version, '1.0.0');
			assert.equal(lock.name, manifest.name);
			assert.equal(lock.version, manifest.version);
			assert.equal(lock.packages[''].name, manifest.name);
			assert.equal(lock.packages[''].version, manifest.version);
		}
	} finally {
		cleanup();
	}
});

test('dependency planning blocks lock adoption when the client package version is absent', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'package.json', JSON.stringify({ name: 'futurebase', version: '2.0.0', dependencies: { shared: '2.0.0' } }, null, '\t') + '\n');
		write(
			starter,
			'package-lock.json',
			JSON.stringify({ name: 'futurebase', version: '2.0.0', lockfileVersion: 3, packages: { '': { name: 'futurebase', version: '2.0.0' } } }, null, '\t') + '\n',
		);
		const ref = commitAll(starter, 'Futurebase dependency layer');
		write(projectRoot, 'package.json', JSON.stringify({ name: 'client-theme', private: true, dependencies: { shared: '1.0.0' } }, null, '\t') + '\n');
		write(
			projectRoot,
			'package-lock.json',
			JSON.stringify({ name: 'client-theme', lockfileVersion: 3, packages: { '': { name: 'client-theme' } } }, null, '\t') + '\n',
		);

		const plan = planDeps({ projectRoot, starter, ref });
		const lockEntries = plan.filter((entry) => entry.rel === 'package-lock.json');

		assert.equal(lockEntries.length, 1);
		assert.equal(lockEntries[0].state, 'blocked');
		assert.match(lockEntries[0].note, /package\.json/);
		assert.match(lockEntries[0].note, /version/);
		assert.equal(lockEntries[0].next, undefined);
	} finally {
		cleanup();
	}
});

test('source-path repair succeeds before ref resolution and reports separate JSON metadata', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'futurebase');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		write(starter, 'tools/project-system/VERSION', '2.0.0\n');
		commitAll(starter, 'Futurebase');
		write(projectRoot, '.project/project.yml', 'project:\n  name: Client\nstarter:\n  source_path: /missing/wp-starter\n');

		const result = spawnSync(
			process.execPath,
			[CLI, 'sync', '--project-root', projectRoot, '--futurebase-path', starter, '--repair-source-path', '--json'],
			{ encoding: 'utf8' },
		);
		assert.equal(result.status, 0, result.stderr || result.stdout);
		const output = JSON.parse(result.stdout);
		assert.equal(output.source_path.drifted, true);
		assert.equal(output.source_path.repaired, true);
		assert.match(readFileSync(join(projectRoot, '.project/project.yml'), 'utf8'), new RegExp(`source_path: ${starter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
	} finally {
		cleanup();
	}
});

test('a no-drift apply still stamps the resolved Futurebase source path', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'futurebase');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		write(starter, 'tools/project-system/VERSION', '2.0.0\n');
		const ref = commitAll(starter, 'Futurebase');
		write(projectRoot, 'tools/project-system/VERSION', '2.0.0\n');
		write(projectRoot, '.project/project.yml', 'project:\n  name: Client\nstarter:\n  source_path: /old/location\n');

		const result = spawnSync(
			process.execPath,
			[CLI, 'sync', '--project-root', projectRoot, '--futurebase-path', starter, '--ref', ref, '--only', 'safe', '--apply', '--confirm'],
			{ encoding: 'utf8' },
		);
		assert.equal(result.status, 0, result.stderr || result.stdout);
		const record = readFileSync(join(projectRoot, '.project/project.yml'), 'utf8');
		assert.match(record, new RegExp(`source_path: ${starter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
		assert.match(record, new RegExp(`synced_commit: ${ref}`));
	} finally {
		cleanup();
	}
});

test('a mode-only sync update restores an executable starter script', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'tools/project-system/bin/example.sh', '#!/bin/sh\nexit 0\n', 0o755);
		const ref = commitAll(starter, 'executable helper');
		write(projectRoot, 'tools/project-system/bin/example.sh', '#!/bin/sh\nexit 0\n', 0o644);

		const entry = planFiles({ projectRoot, starter, ref }).find(
			(candidate) => candidate.rel === 'tools/project-system/bin/example.sh',
		);
		assert.equal(entry.state, 'update');
		assert.match(entry.note, /mode only/);
		assert.equal(applyEntry(entry, { projectRoot, starter }), true);
		assert.notEqual(lstatSync(join(projectRoot, entry.rel)).mode & 0o111, 0);
	} finally {
		cleanup();
	}
});

test('provenance detection identifies the exact historical safe tree', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'tools/project-system/VERSION', '1\n');
		const base = commitAll(starter, 'first portable tree');
		write(projectRoot, 'tools/project-system/VERSION', '1\n');
		write(starter, 'tools/project-system/NEW', 'later\n');
		const head = commitAll(starter, 'later portable tree');

		assert.equal(isAncestor(starter, base, head), true);
		assert.equal(detectBase(starter, head, projectRoot), base);
	} finally {
		cleanup();
	}
});

test('safe-file discovery never follows a symlinked portable root', () => {
	const { dir, cleanup } = sandbox();
	try {
		const projectRoot = join(dir, 'project');
		const outside = join(dir, 'outside');
		mkdirSync(projectRoot);
		write(outside, 'project-system/FOREIGN', 'outside\n');
		symlinkSync(outside, join(projectRoot, 'tools'));

		assert.deepEqual(safeFiles(projectRoot), []);
		assert.equal(readFileSync(join(outside, 'project-system/FOREIGN'), 'utf8'), 'outside\n');
	} finally {
		cleanup();
	}
});

// --- client fidelity --------------------------------------------------------
//
// Three ways a sync used to hand a working client project a broken one. Each was
// found by migrating a real project, not by a test, so each gets one here.

test('Futurebase product material is never offered to a client for porting', () => {
	// rename-theme.sh DELETES these during promotion. Reporting them as drift told
	// the operator to copy the product narrative — and the branded screenshot that
	// wp-admin displays — back into a client theme.
	for (const rel of PRODUCT_ONLY) {
		assert.equal(classifyPath(rel), CLASS.NEVER, `${rel} must never be surfaced to a client`);
	}
	assert.ok(PRODUCT_ONLY.includes('screenshot.png'), 'the branded theme screenshot is the one that bites');
});

test('a merged dependency block comes back alphabetically sorted', () => {
	// lint:pkg (wp-scripts lint-pkg-json) enforces alphabetical order and runs in
	// client CI, so appending an upstream dependency turned the client's build red.
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);

		const upstream = { '@lhci/cli': '1.0.0', '@wordpress/env': '1.0.0', 'pa11y-ci': '1.0.0' };
		write(starter, 'package.json', JSON.stringify({ name: 'futurebase', version: '2.0.0', devDependencies: upstream }, null, '\t') + '\n');
		const ref = commitAll(starter, 'starter adds a dependency that sorts first');

		// The client's own block is already ordered; the merge appends @lhci/cli.
		const client = { '@wordpress/env': '1.0.0', 'pa11y-ci': '1.0.0' };
		write(projectRoot, 'package.json', JSON.stringify({ name: 'client-theme', version: '1.0.2', devDependencies: client }, null, '\t') + '\n');

		const entries = planDeps({ projectRoot, starter, ref });
		const manifest = entries.find((e) => e.rel === 'package.json');
		const merged = JSON.parse(manifest.next);

		assert.deepEqual(Object.keys(merged.devDependencies), ['@lhci/cli', '@wordpress/env', 'pa11y-ci']);
		assert.equal(merged.version, '1.0.2', 'the client version is still its own');
	} finally {
		cleanup();
	}
});

test('workflow script calls the project cannot satisfy are reported', () => {
	// .github/workflows is CLASS.SAFE and copies verbatim, but the npm targets it
	// calls live in package.json's scripts block, which is never merged. A project
	// promoted from an older template got CI referencing scripts it lacked.
	const workflow = 'jobs:\n  a:\n    steps:\n      - run: npm run build\n      - run: npm run test:navigation\n      - run: npm run demo:import\n';
	const missing = missingWorkflowScripts([workflow], { build: 'wp-scripts build' });
	assert.deepEqual(missing, ['demo:import', 'test:navigation']);
});

test('a project defining every referenced script reports nothing', () => {
	const workflow = '- run: npm run build\n- run: npm run verify\n';
	assert.deepEqual(missingWorkflowScripts([workflow], { build: 'x', verify: 'y' }), []);
});

test('script detection tolerates an unreadable workflow and an absent scripts block', () => {
	assert.deepEqual(missingWorkflowScripts([null], {}), []);
	assert.deepEqual(missingWorkflowScripts(['- run: npm run build\n'], null), ['build']);
});
