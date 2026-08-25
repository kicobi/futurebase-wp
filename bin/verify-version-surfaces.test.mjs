import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
	auditVersionSurfaces,
	compareVersions,
	main,
	sameMajorMinor,
	wordpressFloor,
} from './verify-version-surfaces.mjs';

function write(root, relative, body) {
	const target = join(root, relative);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, body, 'utf8');
}

function fixture({ floor = '7.4', tested = '7.6' } = {}) {
	const root = mkdtempSync(join(tmpdir(), 'version-audit-'));
	const manifest = {
		name: 'acme-theme',
		version: '3.2.1',
	};
	const lock = {
		name: 'acme-theme',
		version: '3.2.1',
		packages: {
			'': { name: 'acme-theme', version: '3.2.1' },
		},
	};
	write(root, 'package.json', JSON.stringify(manifest));
	write(root, 'package-lock.json', JSON.stringify(lock));
	write(root, '.wp-env.json', JSON.stringify({ core: `WordPress/WordPress#${floor}` }));
	write(root, 'style.css', `Version: 3.2.1\nRequires at least: ${floor}\nTested up to: ${tested}\n`);
	write(root, 'readme.txt', `Requires at least: ${floor}\nTested up to: ${tested}\nStable tag: 3.2.1\n`);
	write(root, 'tools/project-system/VERSION', '9.8.7\n');
	write(root, 'tools/project-system/package.json', JSON.stringify({ version: '9.8.7' }));
	write(root, 'tools/project-system/package-lock.json', JSON.stringify({ version: '9.8.7', packages: { '': { version: '9.8.7' } } }));
	write(root, 'plugins/acme-theme-seo/readme.txt', `Requires at least: ${floor}\nTested up to: ${tested}\n`);
	write(root, 'plugins/acme-theme-seo/acme-theme-seo.php', `<?php\n/**\n * Requires at least: ${floor}\n */\n`);
	return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('the WordPress floor is derived rather than hardcoded', () => {
	assert.equal(wordpressFloor('WordPress/WordPress#7.4'), '7.4');
	assert.equal(wordpressFloor('WordPress/WordPress#8.1.2'), '8.1.2');
	assert.equal(wordpressFloor(null), null);
	const { root, cleanup } = fixture();
	try {
		const result = auditVersionSurfaces(root);
		assert.deepEqual(result.failures, []);
		assert.equal(result.floor, '7.4');
	} finally {
		cleanup();
	}
});

test('floor identity accepts patches and prereleases only in the same major.minor line', () => {
	assert.equal(sameMajorMinor('6.9.8-alpha-123', '6.9'), true);
	assert.equal(sameMajorMinor('6.9.7', '6.9'), true);
	assert.equal(sameMajorMinor('7.0', '6.9'), false);
});

test('version comparison detects a newer stable release', () => {
	assert.equal(compareVersions('7.2', '7.1'), 1);
	assert.equal(compareVersions('7.1.1', '7.1'), 1);
	assert.equal(compareVersions('7.1', '7.1.0'), 0);
});

test('workflow assertions gate floor identity and annotate a stale claim', () => {
	const { root, cleanup } = fixture();
	const originalLog = console.log;
	const originalError = console.error;
	const originalActions = process.env.GITHUB_ACTIONS;
	const output = [];
	console.log = (message) => output.push(String(message));
	console.error = (message) => output.push(String(message));
	process.env.GITHUB_ACTIONS = 'true';
	try {
		assert.equal(main(['--assert-floor=7.4.1-alpha-123'], root), 0);
		assert.equal(main(['--assert-floor=7.5'], root), 1);
		assert.equal(main(['--warn-newer=7.7'], root), 0);
		assert.ok(output.some((line) => line.includes('::warning title=WordPress compatibility claim is stale::')));
	} finally {
		console.log = originalLog;
		console.error = originalError;
		if (originalActions === undefined) delete process.env.GITHUB_ACTIONS;
		else process.env.GITHUB_ACTIONS = originalActions;
		cleanup();
	}
});

test('minimum and tested-up-to drift are reported', () => {
	const { root, cleanup } = fixture();
	try {
		write(root, 'plugins/acme-theme-seo/readme.txt', 'Requires at least: 7.3\nTested up to: 7.5\n');
		const failures = auditVersionSurfaces(root).failures.join('\n');
		assert.match(failures, /WordPress minimum/);
		assert.match(failures, /WordPress tested up to/);
	} finally {
		cleanup();
	}
});
