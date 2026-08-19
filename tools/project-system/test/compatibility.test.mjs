import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { INSTALL_COMMAND, isDependencyImportFailure } from '../bin/bootstrap.mjs';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUTUREBASE_CLI = join(TOOL_ROOT, 'bin', 'futurebase.mjs');
const LEGACY_CLI = join(TOOL_ROOT, 'bin', 'wp-starter.mjs');

test('lifecycle manifest, lockfile, VERSION, and both CLI entrypoints agree', () => {
	const manifest = JSON.parse(readFileSync(join(TOOL_ROOT, 'package.json'), 'utf8'));
	const lock = JSON.parse(readFileSync(join(TOOL_ROOT, 'package-lock.json'), 'utf8'));
	const version = readFileSync(join(TOOL_ROOT, 'VERSION'), 'utf8').trim();

	assert.equal(manifest.version, '2.0.0');
	assert.equal(lock.version, manifest.version);
	assert.equal(lock.packages[''].version, manifest.version);
	assert.equal(version, manifest.version);

	const canonical = spawnSync(process.execPath, [FUTUREBASE_CLI, '--version'], { encoding: 'utf8' });
	const legacy = spawnSync(process.execPath, [LEGACY_CLI, '--version'], { encoding: 'utf8' });
	assert.equal(canonical.status, 0, canonical.stderr);
	assert.equal(legacy.status, canonical.status, legacy.stderr);
	assert.equal(canonical.stdout, `${version}\n`);
	assert.equal(legacy.stdout, canonical.stdout);
	assert.equal(canonical.stderr, '');
	assert.match(legacy.stderr, /wp-starter is deprecated; use futurebase/);
});

test('legacy --starter-path preserves JSON output while warning on stderr', () => {
	const dir = mkdtempSync(join(tmpdir(), 'futurebase-compat-'));
	try {
		const project = join(dir, 'project');
		mkdirSync(join(project, '.project'), { recursive: true });
		writeFileSync(join(project, '.project', 'project.yml'), `project:\n  name: Client\nstarter:\n  source_path: ${resolve(TOOL_ROOT, '..', '..')}\n`);
		const result = spawnSync(
			process.execPath,
			[
				FUTUREBASE_CLI,
				'sync',
				'--project-root',
				project,
				'--starter-path',
				resolve(TOOL_ROOT, '..', '..'),
				'--repair-source-path',
				'--json',
			],
			{ encoding: 'utf8' },
		);
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.doesNotThrow(() => JSON.parse(result.stdout));
		assert.match(result.stderr, /--starter-path is deprecated/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('dependency import failures map to the deterministic nested install command', () => {
	assert.equal(INSTALL_COMMAND, 'npm ci --prefix tools/project-system --ignore-scripts');
	assert.equal(isDependencyImportFailure({ code: 'ERR_MODULE_NOT_FOUND', message: 'missing' }), true);
	assert.equal(isDependencyImportFailure(new SyntaxError("The requested module 'js-yaml' does not provide an export named 'default'")), true);
	assert.equal(isDependencyImportFailure(new Error('ordinary command failure')), false);
});

for (const [name, dispatch] of [
	['missing', "import 'futurebase-test-package-that-does-not-exist';\n"],
	['incompatible', "import { definitelyMissingExport } from 'node:fs';\nvoid definitelyMissingExport;\n"],
]) {
	test(`CLI catches ${name} dependency imports without a module stack trace`, () => {
		const dir = mkdtempSync(join(tmpdir(), 'futurebase-bootstrap-'));
		try {
			mkdirSync(join(dir, 'bin'), { recursive: true });
			mkdirSync(join(dir, 'cli'), { recursive: true });
			writeFileSync(join(dir, 'bin', 'futurebase.mjs'), readFileSync(FUTUREBASE_CLI, 'utf8'));
			writeFileSync(join(dir, 'bin', 'bootstrap.mjs'), readFileSync(join(TOOL_ROOT, 'bin', 'bootstrap.mjs'), 'utf8'));
			writeFileSync(join(dir, 'cli', 'dispatch.mjs'), dispatch);

			const result = spawnSync(process.execPath, [join(dir, 'bin', 'futurebase.mjs'), '--version'], { encoding: 'utf8' });
			assert.equal(result.status, 3, result.stderr || result.stdout);
			assert.match(result.stderr, /project-system dependencies are missing or incompatible/);
			assert.match(result.stderr, /npm ci --prefix tools\/project-system --ignore-scripts/);
			assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError:|at async/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
}
