// test/sync.test.mjs — portable synchronization contract.
//
// These tests use real git trees because sync decisions depend on blob IDs,
// file modes, and commit ancestry. Synthetic entries would miss the exact
// properties the command has to preserve in promoted projects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
import { dirname, join } from 'node:path';

import {
	CLASS,
	applyEntry,
	classifyPath,
	detectBase,
	isAncestor,
	planDeps,
	planFiles,
	safeFiles,
} from '../lib/sync.mjs';

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'wp-starter-sync-'));
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
			JSON.stringify({ name: 'wp-starter', dependencies: { shared: '2.0.0', upstream: '1.0.0' } }, null, '\t') + '\n',
		);
		write(
			starter,
			'package-lock.json',
			JSON.stringify({ name: 'wp-starter', lockfileVersion: 3, packages: { '': { name: 'wp-starter' } } }, null, '\t') + '\n',
		);
		write(
			starter,
			'composer.json',
			JSON.stringify({ name: 'colinlewis/wp-starter', require: { shared: '2.0.0' } }, null, '\t') + '\n',
		);
		write(starter, 'composer.lock', JSON.stringify({ 'content-hash': 'upstream', packages: [] }, null, '\t') + '\n');
		const ref = commitAll(starter, 'starter dependencies');

		write(
			projectRoot,
			'package.json',
			JSON.stringify({ name: 'client/theme', dependencies: { shared: '1.0.0', 'client-only': '1.0.0' } }, null, '\t') + '\n',
		);
		write(
			projectRoot,
			'package-lock.json',
			JSON.stringify({ name: 'client/theme', lockfileVersion: 3, packages: { '': { name: 'client/theme' } } }, null, '\t') + '\n',
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
