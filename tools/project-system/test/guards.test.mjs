// test/guards.test.mjs — the guards that stand between this CLI and a client's
// data. Every case here failed before the commit that added it.
//
// These exist because the project-system had no behavioural tests at all: the
// only check was schema validation, and the defects that mattered were in the
// code that decides what to copy, what to scan, and where to write. A guard
// with no test is a claim, not a control.
//
// Run: npm test --prefix tools/project-system

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanText, scanFiles } from '../lib/secret-scan.mjs';
import { containedPath, isInside } from '../lib/paths.mjs';
import { applyEntry } from '../lib/sync.mjs';
import { classify } from '../commands/lead/promote.mjs';

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'wp-starter-guards-'));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// --- secret scanning ---------------------------------------------------------

test('a real credential is found', () => {
	assert.equal(scanText('api_key: AbcdEFGHijklMNOP123456789').length, 1);
	assert.equal(scanText(`ghp_${'a'.repeat(36)}`).length, 1);
	assert.equal(scanText('AKIAIOSFODNN7EXAMPLB').length, 1);
});

test('placeholder VALUES are still ignored', () => {
	assert.equal(scanText('api_key: your-key-goes-here-xxxx').length, 0);
	assert.equal(scanText('password: ${DEPLOY_PASSWORD}').length, 0);
	assert.equal(scanText('secret: <REPLACE_WITH_REAL_VALUE>').length, 0);
});

test('a placeholder word elsewhere on the line does not disarm the scanner', () => {
	// The original bug: IGNORE_VALUE was tested against the whole line, so any
	// annotation containing "example" or "redacted" suppressed a real hit.
	assert.equal(scanText('api_key: AbcdEFGHijklMNOP123456789 # example production key').length, 1);
	assert.equal(scanText(`ghp_${'a'.repeat(36)} (redacted below)`).length, 1);
	assert.equal(scanText('# for example, the key below is live\npassword: Zx9QwErTyUiOpAsDfGh').length, 1);
});

test('oversized and unreadable files fail closed', () => {
	const { dir, cleanup } = sandbox();
	try {
		const big = join(dir, 'export.md');
		writeFileSync(big, 'x'.repeat(513 * 1024));
		const found = scanFiles([big]);
		assert.equal(found.length, 1, 'an unscannable file must produce a finding');
		assert.equal(found[0].rule, 'unscannable');

		const missing = scanFiles([join(dir, 'does-not-exist.md')]);
		assert.equal(missing[0].rule, 'unscannable');
	} finally {
		cleanup();
	}
});

test('binary files in the committed record are reported, not skipped', () => {
	const { dir, cleanup } = sandbox();
	try {
		const bin = join(dir, 'attachment.pdf');
		writeFileSync(bin, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02]));
		const found = scanFiles([bin]);
		assert.equal(found.length, 1);
		assert.equal(found[0].rule, 'binary');
	} finally {
		cleanup();
	}
});

test('a secret in an unconventional extension is still found', () => {
	const { dir, cleanup } = sandbox();
	try {
		// The walk used to filter on .md/.yml/.json/.txt, so these were invisible.
		for (const name of ['contacts.csv', 'deploy.pem', 'notes', 'dump.sql']) {
			writeFileSync(join(dir, name), 'access_token: QwErTyUiOpAsDfGhJkLz\n');
			const found = scanFiles([join(dir, name)]);
			assert.equal(found.length, 1, `${name} should be scanned`);
		}
	} finally {
		cleanup();
	}
});

// --- path containment --------------------------------------------------------

test('isInside accepts the root and its descendants, rejects escapes', () => {
	assert.equal(isInside('/a/b', '/a/b'), true);
	assert.equal(isInside('/a/b', '/a/b/c/d'), true);
	assert.equal(isInside('/a/b', '/a/c'), false);
	assert.equal(isInside('/a/b', '/a'), false);
});

test('containedPath resolves ordinary paths and refuses traversal', () => {
	const { dir, cleanup } = sandbox();
	try {
		assert.ok(containedPath(dir, 'tools/VERSION'));
		assert.equal(containedPath(dir, '../escape.txt'), null);
		assert.equal(containedPath(dir, '/etc/passwd'), null);
	} finally {
		cleanup();
	}
});

test('containedPath refuses a path whose component is a symlink out of the root', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'outside');
		mkdirSync(root, { recursive: true });
		mkdirSync(outside, { recursive: true });
		symlinkSync(outside, join(root, 'tools'));

		assert.equal(containedPath(root, 'tools/project-system/VERSION'), null);
		// A sibling real directory in the same root still resolves.
		mkdirSync(join(root, 'fixtures'), { recursive: true });
		assert.ok(containedPath(root, 'fixtures/demo.json'));
	} finally {
		cleanup();
	}
});

// --- sync writes -------------------------------------------------------------

test('applyEntry refuses to write through a symlinked component', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'outside');
		mkdirSync(root, { recursive: true });
		mkdirSync(outside, { recursive: true });
		symlinkSync(outside, join(root, 'tools'));

		const entry = { rel: 'tools/project-system/VERSION', cls: 'deps', state: 'add', next: 'PWNED\n' };
		const wrote = applyEntry(entry, { projectRoot: root, starter: dir });

		assert.equal(wrote, false, 'applyEntry must refuse the write');
		assert.equal(existsSync(join(outside, 'project-system', 'VERSION')), false, 'nothing may land outside the root');
	} finally {
		cleanup();
	}
});

// --- dossier classification --------------------------------------------------

test('dossier content is carried, cruft and lead-stage files are not', () => {
	assert.equal(classify('brief/discovery.md'), 'versioned');
	assert.equal(classify('metrics/metrics.yml'), 'versioned');

	assert.equal(classify('CLAUDE.md'), 'excluded');
	assert.equal(classify('notes/call-2026-01-14.md'), 'excluded');
	assert.equal(classify('.env.local'), 'excluded');
	assert.equal(classify('project.yml'), 'regenerated');

	assert.equal(classify('brief/attachments/private/contract.pdf'), 'private');
	assert.equal(classify('analysis/raw-private/export.csv'), 'private');
});

test('OS and editor droppings never reach a client repository', () => {
	// These classed as `versioned` and were committed into every promoted repo.
	for (const rel of ['.DS_Store', 'brief/.DS_Store', 'Thumbs.db', 'analysis/desktop.ini', 'brief/._attachment.pdf']) {
		assert.equal(classify(rel), 'excluded', `${rel} must not be carried`);
	}
});

test('applyEntry still writes an ordinary contained path', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		mkdirSync(root, { recursive: true });
		const entry = { rel: 'tools/project-system/VERSION', cls: 'deps', state: 'add', next: '9.9.9\n' };

		assert.equal(applyEntry(entry, { projectRoot: root, starter: dir }), true);
		assert.equal(readFileSync(join(root, 'tools/project-system/VERSION'), 'utf8'), '9.9.9\n');
	} finally {
		cleanup();
	}
});
