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
	mapReviewPath,
	missingWorkflowScripts,
	planDeps,
	planFiles,
	PORTABLE_BIN,
	PORTABLE_CONFIG,
	PRODUCT_ONLY,
	reverseNormalizePluginReviewIdentity,
	reverseNormalizeReviewIdentity,
	safeFiles,
	VERIFIER_CLOSURE,
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

test('scheduled starter canaries never sync into client repositories', () => {
	assert.equal(classifyPath('.github/workflows/scorecard.yml'), CLASS.NEVER);
	assert.equal(classifyPath('.github/workflows/wordpress-compatibility.yml'), CLASS.NEVER);
});

test('companion plugins are review-only and map onto the promoted identity', () => {
	assert.equal(classifyPath('plugins/futurebase-seo/futurebase-seo.php'), CLASS.REVIEW);
	const starter = { slug: 'futurebase-seo' };
	const project = { slug: 'acme-client-seo' };
	assert.equal(mapReviewPath('plugins/futurebase-seo/futurebase-seo.php', project, starter), 'plugins/acme-client-seo/acme-client-seo.php');
	assert.equal(mapReviewPath('docs/seo.md', project, starter), 'docs/seo.md');
});

test('review comparison removes only known technical rename identity', () => {
	const starterIdentity = { slug: 'futurebase', snake: 'futurebase', upper: 'FUTUREBASE' };
	const projectIdentity = { slug: 'acme-client', snake: 'acme_client', upper: 'ACME_CLIENT' };
	const project = [
		"'acme-client' \"acme-client\" `acme-client`",
		'acme_client_register ACME_CLIENT_VERSION acme-client/home /acme-client"',
		'acme-client-style acme-client-main acme-client-script',
		' * @package acme-client',
		'Text Domain: acme-client',
		'<property name="prefixes"><element value="acme_client"/></property>',
		'<property name="text_domain"><element value="acme-client"/></property>',
		'Acme Client prose and an arbitrary acme-client mention stay client-owned.',
	].join('\n');
	const normalized = reverseNormalizeReviewIdentity(project, projectIdentity, starterIdentity);

	assert.match(normalized, /'futurebase' "futurebase" `futurebase`/);
	assert.match(normalized, /futurebase_register FUTUREBASE_VERSION futurebase\/home \/futurebase"/);
	assert.match(normalized, /futurebase-style futurebase-main futurebase-script/);
	assert.match(normalized, /@package futurebase/);
	assert.match(normalized, /Text Domain: futurebase/);
	assert.match(normalized, /name="prefixes"><element value="futurebase"/);
	assert.match(normalized, /name="text_domain"><element value="futurebase"/);
	assert.match(normalized, /Acme Client prose and an arbitrary acme-client mention stay client-owned/);
});

test('plugin review comparison normalizes structural identity but preserves permanent contracts and prose', () => {
	const starter = {
		slug: 'futurebase-seo',
		snake: 'futurebase_seo',
		upper: 'FUTUREBASE_SEO',
		display: 'Futurebase SEO',
		namespace: 'Futurebase\\SEO',
	};
	const project = {
		slug: 'acme-client-seo',
		snake: 'acme_client_seo',
		upper: 'ACME_CLIENT_SEO',
		display: 'Acme Client SEO',
		namespace: 'AcmeClient\\SEO',
	};
	const content = [
		' * Plugin Name:       Acme Client SEO',
		' * Text Domain:       acme-client-seo',
		' * @package acme-client-seo',
		'namespace AcmeClient\\SEO;',
		"define('ACME_CLIENT_SEO_VERSION', '1.0.0');",
		"define('ACME_CLIENT_SEO_HANDLE', 'acme-client-seo-editor');",
		'"./plugins/acme-client-seo"',
		"'_compseo_title' 'compseo_document'",
		'Acme Client SEO is arbitrary client prose here and must remain.',
	].join('\n');
	const normalized = reverseNormalizePluginReviewIdentity(content, project, starter);

	assert.match(normalized, /Plugin Name:\s+Futurebase SEO/);
	assert.match(normalized, /Text Domain:\s+futurebase-seo/);
	assert.match(normalized, /@package futurebase-seo/);
	assert.match(normalized, /namespace Futurebase\\SEO;/);
	assert.match(normalized, /FUTUREBASE_SEO_VERSION/);
	assert.match(normalized, /futurebase-seo-editor/);
	assert.match(normalized, /plugins\/futurebase-seo/);
	assert.match(normalized, /'_compseo_title' 'compseo_document'/);
	assert.match(normalized, /Acme Client SEO is arbitrary client prose here and must remain/);
});

test('identity-only review drift is omitted while prose, real drift, and safe files remain', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'style.css', '/*\nTheme Name: Futurebase WP\nText Domain: futurebase\n*/\n');
		write(starter, 'docs/technical.md', "`futurebase` futurebase_register FUTUREBASE_VERSION futurebase/home futurebase-main @package futurebase\n");
		write(starter, 'docs/prose.md', 'The futurebase project has deliberate prose.\n');
		write(starter, 'docs/changed.md', '`futurebase` original behavior.\n');
		write(starter, 'docs/neutral.md', 'Identity-neutral review content.\n');
		write(starter, 'tools/project-system/portable.txt', '`futurebase`\n');
		const ref = commitAll(starter, 'starter identity');

		write(projectRoot, 'style.css', '/*\nTheme Name: Acme Client\nText Domain: acme-client\n*/\n');
		write(projectRoot, 'docs/technical.md', "`acme-client` acme_client_register ACME_CLIENT_VERSION acme-client/home acme-client-main @package acme-client\n");
		write(projectRoot, 'docs/prose.md', 'The acme-client project has deliberate prose.\n');
		write(projectRoot, 'docs/changed.md', '`acme-client` materially different behavior.\n');
		write(projectRoot, 'docs/neutral.md', 'Identity-neutral review content.\n');
		write(projectRoot, 'tools/project-system/portable.txt', '`acme-client`\n');

		const byPath = new Map(planFiles({ projectRoot, starter, ref }).map((entry) => [entry.rel, entry]));
		assert.equal(byPath.get('docs/technical.md').state, 'up-to-date');
		assert.notEqual(byPath.get('docs/prose.md').state, 'up-to-date', 'unquoted client prose is never normalized');
		assert.notEqual(byPath.get('docs/changed.md').state, 'up-to-date', 'real review drift remains visible');
		assert.equal(byPath.get('docs/neutral.md').state, 'up-to-date', 'identity-free review bytes still compare directly');
		assert.notEqual(byPath.get('tools/project-system/portable.txt').state, 'up-to-date', 'safe files retain byte comparison');

		write(projectRoot, 'docs/technical.md', "`futurebase` futurebase_register FUTUREBASE_VERSION futurebase/home futurebase-main @package futurebase\n");
		const rawStarter = new Map(planFiles({ projectRoot, starter, ref }).map((entry) => [entry.rel, entry]));
		assert.equal(rawStarter.get('docs/technical.md').state, 'conflict', 'raw starter identity at a promoted review path stays visible');
	} finally {
		cleanup();
	}
});

test('binary review files retain exact byte comparison', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'style.css', '/*\nTheme Name: Futurebase WP\nText Domain: futurebase\n*/\n');
		write(starter, 'docs/evidence.bin', Buffer.from([0x00, 0x66, 0x75, 0x74, 0x75, 0x72, 0x65]));
		const ref = commitAll(starter, 'binary review evidence');

		write(projectRoot, 'style.css', '/*\nTheme Name: Acme Client\nText Domain: acme-client\n*/\n');
		write(projectRoot, 'docs/evidence.bin', Buffer.from([0x00, 0x66, 0x75, 0x74, 0x75, 0x72, 0x65]));
		let entry = planFiles({ projectRoot, starter, ref }).find((candidate) => candidate.rel === 'docs/evidence.bin');
		assert.equal(entry?.cls, CLASS.REVIEW);
		assert.equal(entry?.state, 'up-to-date');

		write(projectRoot, 'docs/evidence.bin', Buffer.from([0x00, 0x63, 0x6c, 0x69, 0x65, 0x6e, 0x74]));
		entry = planFiles({ projectRoot, starter, ref }).find((candidate) => candidate.rel === 'docs/evidence.bin');
		assert.equal(entry?.state, 'conflict');
	} finally {
		cleanup();
	}
});

test('renamed plugin identity is omitted while real plugin drift remains review-only', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'style.css', '/*\nTheme Name: Futurebase WP\nText Domain: futurebase\n*/\n');
		write(
			starter,
			'plugins/futurebase-seo/futurebase-seo.php',
			" * Plugin Name:       Futurebase SEO\n * Text Domain:       futurebase-seo\n * @package futurebase-seo\nnamespace Futurebase\\SEO;\ndefine('FUTUREBASE_SEO_VERSION', '0.1.0');\ndefine('FUTUREBASE_SEO_HANDLE', 'futurebase-seo-editor');\nconst META = '_compseo_title';\n",
		);
		write(starter, 'plugins/futurebase-seo/includes/class-plugin.php', "namespace Futurebase\\SEO;\nconst BEHAVIOR = 'starter';\n");
		write(starter, '.wp-env.json', '{"plugins":["./plugins/futurebase-seo"]}\n');
		const ref = commitAll(starter, 'starter plugin');

		write(projectRoot, 'style.css', '/*\nTheme Name: Acme Client\nText Domain: acme-client\n*/\n');
		write(
			projectRoot,
			'plugins/acme-client-seo/acme-client-seo.php',
			" * Plugin Name:       Acme Client SEO\n * Text Domain:       acme-client-seo\n * @package acme-client-seo\nnamespace AcmeClient\\SEO;\ndefine('ACME_CLIENT_SEO_VERSION', '0.1.0');\ndefine('ACME_CLIENT_SEO_HANDLE', 'acme-client-seo-editor');\nconst META = '_compseo_title';\n",
		);
		write(projectRoot, 'plugins/acme-client-seo/includes/class-plugin.php', "namespace AcmeClient\\SEO;\nconst BEHAVIOR = 'locally changed';\n");
		write(projectRoot, '.wp-env.json', '{"plugins":["./plugins/acme-client-seo"]}\n');

		const entries = planFiles({ projectRoot, starter, ref });
		const byPath = new Map(entries.map((entry) => [entry.rel, entry]));
		assert.equal(byPath.get('plugins/acme-client-seo/acme-client-seo.php').state, 'up-to-date');
		assert.equal(byPath.get('.wp-env.json').state, 'up-to-date');
		assert.equal(byPath.get('plugins/acme-client-seo/includes/class-plugin.php').cls, CLASS.REVIEW);
		assert.equal(byPath.get('plugins/acme-client-seo/includes/class-plugin.php').state, 'conflict');

		write(
			projectRoot,
			'plugins/acme-client-seo/acme-client-seo.php',
			" * Plugin Name:       Futurebase SEO\n * Text Domain:       futurebase-seo\n * @package futurebase-seo\nnamespace Futurebase\\SEO;\ndefine('FUTUREBASE_SEO_VERSION', '0.1.0');\ndefine('FUTUREBASE_SEO_HANDLE', 'futurebase-seo-editor');\nconst META = '_compseo_title';\n",
		);
		const rawStarter = new Map(planFiles({ projectRoot, starter, ref }).map((entry) => [entry.rel, entry]));
		assert.equal(rawStarter.get('plugins/acme-client-seo/acme-client-seo.php').state, 'conflict', 'raw starter plugin identity at the mapped client path is never current');
	} finally {
		cleanup();
	}
});

test('a client without the companion plugin sees mapped review additions, never writable files', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'style.css', '/*\nTheme Name: Futurebase WP\nText Domain: futurebase\n*/\n');
		write(starter, 'plugins/futurebase-seo/futurebase-seo.php', ' * Plugin Name: Futurebase SEO\n');
		const ref = commitAll(starter, 'starter plugin');
		write(projectRoot, 'style.css', '/*\nTheme Name: Acme Client\nText Domain: acme-client\n*/\n');

		const entry = planFiles({ projectRoot, starter, ref }).find((candidate) => candidate.rel === 'plugins/acme-client-seo/acme-client-seo.php');
		assert.equal(entry?.cls, CLASS.REVIEW);
		assert.equal(entry?.state, 'add');
	} finally {
		cleanup();
	}
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

// --- machine mode and refresh honesty ----------------------------------------

test('an --apply --json run emits one document and nothing else', () => {
	// The read-only early return skips the human report, but --apply does not, so
	// the whole report printed to stdout ahead of the payload and a consumer got
	// prose wrapped around its JSON.
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'futurebase');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		write(starter, 'tools/project-system/VERSION', '2.0.0\n');
		write(starter, 'fixtures/import-demo.php', '<?php // fixture\n');
		commitAll(starter, 'Futurebase');
		git(starter, 'branch', '-f', 'origin/main');
		write(projectRoot, '.project/project.yml', `project:\n  name: Client\nstarter:\n  source_path: ${starter}\n`);

		const result = spawnSync(
			process.execPath,
			[CLI, 'sync', '--project-root', projectRoot, '--futurebase-path', starter, '--ref', 'origin/main', '--apply', '--confirm', '--json'],
			{ encoding: 'utf8' },
		);
		const output = JSON.parse(result.stdout); // throws if prose leaked in
		assert.equal(output.status, 'applied');
		assert.ok('composer_lock' in output, 'the JSON must report the reconciliation it performed');
	} finally {
		cleanup();
	}
});

test('a failed --fetch stops instead of planning against the stale ref it asked to refresh', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'futurebase');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		write(starter, 'tools/project-system/VERSION', '2.0.0\n');
		commitAll(starter, 'Futurebase');
		// An origin/main that resolves, and a remote that cannot be reached — the
		// exact state in which discarding the fetch result was invisible.
		git(starter, 'branch', '-f', 'origin/main');
		git(starter, 'remote', 'add', 'origin', join(dir, 'no-such-remote.git'));
		write(projectRoot, '.project/project.yml', `project:\n  name: Client\nstarter:\n  source_path: ${starter}\n`);

		const result = spawnSync(
			process.execPath,
			[CLI, 'sync', '--project-root', projectRoot, '--futurebase-path', starter, '--fetch', '--json'],
			{ encoding: 'utf8' },
		);
		assert.notEqual(result.status, 0, 'a refresh that did not happen must not report success');
		assert.match(result.stdout + result.stderr, /fetch failed/);
	} finally {
		cleanup();
	}
});

test('portable scripts travel with the configuration they invoke', () => {
	// bin/scorecard.sh passes these to --config. It was safe while they were
	// review-class, so a client could receive a newer script without them.
	assert.equal(classifyPath('bin/scorecard.sh'), CLASS.SAFE);
	for (const rel of PORTABLE_CONFIG) assert.equal(classifyPath(rel), CLASS.SAFE, `${rel} must travel with the script that reads it`);
});

test('the production sampler travels without claiming a shared project config', () => {
	for (const rel of ['bin/lighthouse-sample.mjs', 'bin/lighthouse-sample.test.mjs']) {
		assert.ok(PORTABLE_BIN.includes(rel));
		assert.equal(classifyPath(rel), CLASS.SAFE);
	}
	assert.ok(!VERIFIER_CLOSURE.includes('bin/lighthouse-sample.mjs'));
	assert.equal(classifyPath('lighthouse-sample.config.json'), CLASS.REVIEW);
});

test('the sync-safe workflow receives the complete companion SEO runtime closure', () => {
	const root = resolve(TOOL_ROOT, '..', '..');
	const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
	assert.match(workflow, /run: bin\/test-seo-runtime\.sh/);
	for (const rel of ['bin/test-seo-runtime.sh', 'bin/test-seo-runtime.php']) {
		assert.ok(PORTABLE_BIN.includes(rel), `${rel} must be explicitly portable`);
		assert.equal(classifyPath(rel), CLASS.SAFE, `${rel} must travel with the workflow that invokes it`);
		assert.doesNotThrow(() => readFileSync(join(root, rel)), `${rel} must exist`);
	}
});

test('the verifier runner invokes theme and optional companion contract tests directly', () => {
	const runner = readFileSync(resolve(TOOL_ROOT, '..', '..', 'bin', 'verify-theme.sh'), 'utf8');
	assert.match(runner, /node bin\/verify-contract\.mjs/);
	assert.match(runner, /node --test bin\/verify-contract\.test\.mjs/);
	assert.match(runner, /node --test bin\/verify-seo-contract\.test\.mjs/);
	assert.match(runner, /seo_plugin_dir/);
	for (const rel of VERIFIER_CLOSURE) assert.equal(classifyPath(rel), CLASS.SAFE, `${rel} must travel with the verifier runner`);
});

test('an older client receives the complete verifier closure together', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		for (const rel of VERIFIER_CLOSURE) write(starter, rel, `old ${rel}\n`, rel.endsWith('.sh') ? 0o755 : 0o644);
		commitAll(starter, 'older verifier closure');
		for (const rel of VERIFIER_CLOSURE) write(projectRoot, rel, `old ${rel}\n`, rel.endsWith('.sh') ? 0o755 : 0o644);
		for (const rel of VERIFIER_CLOSURE) write(starter, rel, `new ${rel}\n`, rel.endsWith('.sh') ? 0o755 : 0o644);
		const head = commitAll(starter, 'update complete verifier closure');

		const entries = planFiles({ projectRoot, starter, ref: head }).filter((entry) => VERIFIER_CLOSURE.includes(entry.rel));
		assert.deepEqual(entries.map((entry) => entry.rel).sort(), VERIFIER_CLOSURE.slice().sort());
		assert.ok(entries.every((entry) => entry.state === 'update'));
		for (const entry of entries) assert.equal(applyEntry(entry, { projectRoot, starter }), true);
		for (const rel of VERIFIER_CLOSURE) assert.equal(readFileSync(join(projectRoot, rel), 'utf8'), `new ${rel}\n`);
	} finally {
		cleanup();
	}
});

test('a runner changed only by a historical client rename upgrades with the complete verifier closure', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'style.css', '/*\nTheme Name: Futurebase WP\nText Domain: futurebase\n*/\n');
		for (const rel of VERIFIER_CLOSURE) {
			const old = rel === 'bin/verify-theme.sh' ? '# Futurebase WP calls futurebase_register_blocks()\n' : `old ${rel}\n`;
			write(starter, rel, old, rel.endsWith('.sh') ? 0o755 : 0o644);
		}
		commitAll(starter, 'historical rename-sensitive verifier');
		for (const rel of VERIFIER_CLOSURE) write(starter, rel, `new ${rel}\n`, rel.endsWith('.sh') ? 0o755 : 0o644);
		const head = commitAll(starter, 'portable verifier closure');

		write(projectRoot, 'style.css', '/*\nTheme Name: Acme Client\nText Domain: acme-client\n*/\n');
		for (const rel of VERIFIER_CLOSURE) {
			const promoted = rel === 'bin/verify-theme.sh' ? '# Acme Client calls acme_client_register_blocks()\n' : `old ${rel}\n`;
			write(projectRoot, rel, promoted, rel.endsWith('.sh') ? 0o755 : 0o644);
		}

		const entries = planFiles({ projectRoot, starter, ref: head }).filter((entry) => VERIFIER_CLOSURE.includes(entry.rel));
		assert.deepEqual(entries.map((entry) => entry.rel).sort(), VERIFIER_CLOSURE.slice().sort());
		assert.ok(entries.every((entry) => entry.state === 'update'), `the deterministic historical rename is not a local edit: ${JSON.stringify(entries)}`);
		for (const entry of entries) assert.equal(applyEntry(entry, { projectRoot, starter }), true);
		for (const rel of VERIFIER_CLOSURE) assert.equal(readFileSync(join(projectRoot, rel), 'utf8'), `new ${rel}\n`);
	} finally {
		cleanup();
	}
});

test('a locally modified verifier runner remains a conflict and is never overwritten', () => {
	const { dir, cleanup } = sandbox();
	try {
		const starter = join(dir, 'starter');
		const projectRoot = join(dir, 'project');
		initRepo(starter);
		mkdirSync(projectRoot);
		write(starter, 'bin/verify-theme.sh', 'old runner\n', 0o755);
		commitAll(starter, 'old runner');
		write(starter, 'bin/verify-theme.sh', 'new runner\n', 0o755);
		const head = commitAll(starter, 'new runner');
		write(projectRoot, 'bin/verify-theme.sh', 'client-modified runner\n', 0o755);

		const entry = planFiles({ projectRoot, starter, ref: head }).find((candidate) => candidate.rel === 'bin/verify-theme.sh');
		assert.equal(entry.state, 'conflict');
		assert.equal(readFileSync(join(projectRoot, entry.rel), 'utf8'), 'client-modified runner\n');
	} finally {
		cleanup();
	}
});

test('the documented --allow-mismatch override is actually reachable', () => {
	// Documented in the compare header and named in its own failure message, but
	// never registered — so parseArgs rejected it as an unknown option and the
	// escape hatch could not be used at all.
	const result = spawnSync(process.execPath, [CLI, 'compare', '--project-root', '/nonexistent', '--allow-mismatch', '--json'], { encoding: 'utf8' });
	assert.doesNotMatch(result.stderr + result.stdout, /unknown option/i, 'the flag must be registered');
});
