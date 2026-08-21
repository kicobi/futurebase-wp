// test/promotion-e2e.test.mjs — exercise the real promotion command through
// its offline clone seam, including post-clone containment failures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	appendFileSync,
	existsSync,
	chmodSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = resolve(HERE, '..');
const STARTER_ROOT = resolve(TOOL_ROOT, '..', '..');
const CLI = join(TOOL_ROOT, 'bin', 'futurebase.mjs');

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'futurebase-promote-e2e-'));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runGit(cwd, args) {
	const result = spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_AUTHOR_NAME: 'Promotion Test',
			GIT_AUTHOR_EMAIL: 'promotion@example.test',
			GIT_COMMITTER_NAME: 'Promotion Test',
			GIT_COMMITTER_EMAIL: 'promotion@example.test',
		},
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
}

function makeTemplate(root, variant = 'ordinary') {
	const template = join(root, 'template');
	mkdirSync(template);
	writeFileSync(
		join(template, 'package.json'),
		JSON.stringify({ name: 'futurebase', version: '2.0.0', private: true, scripts: { rename: 'node rename.mjs' } }, null, 2) + '\n',
	);
	writeFileSync(
		join(template, 'rename.mjs'),
		[
			"import { readFileSync, writeFileSync } from 'node:fs';",
			'const slug = process.argv[2];',
			"const repositoryIndex = process.argv.indexOf('--repository');",
			"const repository = repositoryIndex >= 0 ? process.argv[repositoryIndex + 1] : `local/${slug}`;",
			"const themeUriIndex = process.argv.indexOf('--theme-uri');",
			"const themeUri = themeUriIndex >= 0 ? process.argv[themeUriIndex + 1] : '';",
			"const style = readFileSync('style.css', 'utf8').replace(/^Text Domain:.*$/m, `Text Domain: ${slug}`).replace(/^Theme URI:.*$/m, `Theme URI: ${themeUri}`);",
			"writeFileSync('style.css', style);",
			"const composer = JSON.parse(readFileSync('composer.json', 'utf8'));",
			'composer.name = repository;',
			"writeFileSync('composer.json', JSON.stringify(composer, null, 2) + '\\n');",
			'',
		].join('\n'),
	);
	writeFileSync(join(template, 'style.css'), '/*\nTheme Name: Futurebase WP\nTheme URI: https://github.com/kicobi/futurebase-wp\nText Domain: futurebase\n*/\n');
	writeFileSync(join(template, 'composer.json'), JSON.stringify({ name: 'kicobi/futurebase', require: { php: '^8.3' } }, null, 2) + '\n');
	writeFileSync(join(template, 'composer.lock'), JSON.stringify({ 'content-hash': 'template-stale', packages: [] }, null, 2) + '\n');
	writeFileSync(join(template, 'CLAUDE.md'), '# Template instructions\n');
	writeFileSync(join(template, 'AGENTS.md'), '# Template instructions\n');

	if (variant === 'root-symlink') {
		symlinkSync('../outside', join(template, '.project'));
	} else if (variant === 'nested-symlink') {
		mkdirSync(join(template, '.project'));
		symlinkSync('../../outside', join(template, '.project', 'metrics'));
	} else if (variant === 'final-symlink') {
		symlinkSync('../outside-ignore', join(template, '.gitignore'));
	} else {
		writeFileSync(join(template, '.gitignore'), 'node_modules/\n');
	}

	runGit(template, ['init', '-q']);
	runGit(template, ['add', '-A']);
	runGit(template, ['commit', '-q', '-m', 'template']);
	return template;
}

function cloneRealTemplate(root) {
	const template = join(root, 'template');
	runGit(root, ['clone', '--quiet', STARTER_ROOT, template]);
	return template;
}

function makeFakeComposer(root, { missing = false } = {}) {
	const bin = join(root, 'fake-composer-bin');
	const state = join(root, 'fake-composer-state.json');
	const log = join(root, 'fake-composer-log.jsonl');
	mkdirSync(bin, { recursive: true });
	const executable = join(bin, 'composer');
	writeFileSync(
		executable,
		missing
			? '#!/bin/sh\nexit 127\n'
			: [
					'#!/usr/bin/env node',
					"import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';",
					'const args = process.argv.slice(2);',
					"if (args[0] === '--version') { console.log('Composer version test'); process.exit(0); }",
					'const statePath = process.env.FAKE_COMPOSER_STATE;',
					'const logPath = process.env.FAKE_COMPOSER_LOG;',
					"const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { fresh: false };",
					"const style = existsSync('style.css') ? readFileSync('style.css', 'utf8') : '';",
					"const textDomain = style.match(/^Text Domain:\\s*(\\S+)/m)?.[1] ?? null;",
					"appendFileSync(logPath, JSON.stringify({ args, cwd: process.cwd(), text_domain: textDomain }) + '\\n');",
					"const update = ['update', '--lock', '--no-install', '--no-interaction', '--quiet'];",
					"const validate = ['validate', '--no-check-publish'];",
					'const exact = (expected) => JSON.stringify(args) === JSON.stringify(expected);',
					'if (exact(update)) {',
					"  if (process.env.FAKE_COMPOSER_FAIL === 'update') { console.error('simulated composer update failure'); process.exit(1); }",
					"  state.fresh = true; writeFileSync(statePath, JSON.stringify(state));",
					"  const lock = JSON.parse(readFileSync('composer.lock', 'utf8')); lock['content-hash'] = 'fresh';",
					"  writeFileSync('composer.lock', JSON.stringify(lock, null, 2) + '\\n');",
					'  process.exit(0);',
					'}',
					'if (exact(validate)) {',
					"  const pkg = JSON.parse(readFileSync('composer.json', 'utf8'));",
					"  const notice = `Composer could not detect the root package (${pkg.name}) version, defaulting to '1.0.0'.`;",
					'  console.error(notice); console.error(notice);',
					"  if (process.env.FAKE_COMPOSER_FAIL === 'validate' || !state.fresh) { console.error('composer.lock is out of date'); process.exit(2); }",
					"  console.log('./composer.json is valid'); process.exit(0);",
					'}',
					"console.error(`unsupported fake composer command: ${args.join(' ')}`);",
					'process.exit(3);',
					'',
			  ].join('\n'),
	);
	chmodSync(executable, 0o755);
	return { bin, state, log };
}

function makeFakeNpm(root, { missing = false } = {}) {
	const bin = join(root, 'fake-npm-bin');
	const log = join(root, 'fake-npm-log.jsonl');
	mkdirSync(bin, { recursive: true });
	const executable = join(bin, 'npm');
	writeFileSync(
		executable,
		missing
			? '#!/bin/sh\nexit 127\n'
			: [
					'#!/usr/bin/env node',
					"import { appendFileSync } from 'node:fs';",
					"import { spawnSync } from 'node:child_process';",
					'const args = process.argv.slice(2);',
					"if (args[0] === '--version') { console.log('npm test'); process.exit(0); }",
					"appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');",
					"const install = ['ci', '--prefix', 'tools/project-system', '--ignore-scripts'];",
					'if (JSON.stringify(args) === JSON.stringify(install)) {',
					"  if (process.env.FAKE_NPM_FAIL === 'ci') { console.error('simulated project-system install failure'); process.exit(1); }",
					'  process.exit(0);',
					'}',
					"const result = spawnSync(process.env.REAL_NPM, args, { stdio: 'inherit' });",
					'process.exit(result.status ?? 1);',
					'',
			  ].join('\n'),
	);
	chmodSync(executable, 0o755);
	return { bin, log };
}

function composerCalls(harness) {
	if (!existsSync(harness.log)) return [];
	return readFileSync(harness.log, 'utf8')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function npmCalls(harness) {
	if (!existsSync(harness.log)) return [];
	return readFileSync(harness.log, 'utf8')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function makeLead(root, { staging = null, stagingYaml = null } = {}) {
	const workspace = join(root, 'leads');
	const lead = join(workspace, 'acme');
	mkdirSync(join(lead, 'brief'), { recursive: true });
	const stagingLines = stagingYaml ?? [`  staging: ${staging === null ? 'null' : JSON.stringify(staging)}`];
	writeFileSync(
		join(lead, 'project.yml'),
		[
			'schema_version: 1',
			'project:',
			'  name: Acme',
			'  slug: acme',
			'  stage: lead',
			'  status: won',
			'  type: redesign',
			'  platform: codeable',
			'  created_at: "2026-07-30"',
			'starter:',
			`  source_path: ${JSON.stringify(STARTER_ROOT)}`,
			'urls:',
			'  production: null',
			...stagingLines,
			'baseline:',
			'  mode: redesign',
			'privacy:',
			'  local_only: true',
			'  allow_git: false',
			'  allow_credentials_in_project: false',
			'',
		].join('\n'),
	);
	writeFileSync(join(lead, 'brief', 'discovery.md'), '# Client discovery\n');
	return workspace;
}

function promote({ root, template, workspace, resume = false, failCommit = false, composer = null, composerFail = null, npm = null, npmFail = null }) {
	const dest = join(root, 'dest');
	const args = [
		CLI,
		'lead',
		'promote',
		'acme',
		'--workspace-root',
		workspace,
		'--starter-path',
		STARTER_ROOT,
		'--dest',
		dest,
		'--org',
		'local',
		'--confirm',
		'--non-interactive',
	];
	if (resume) args.push('--resume');
	const composerHarness = composer || makeFakeComposer(root);
	const npmHarness = npm || makeFakeNpm(root);
	const env = {
		...process.env,
		FUTUREBASE_PROMOTE_CLONE_FROM: template,
		FAKE_COMPOSER_STATE: composerHarness.state,
		FAKE_COMPOSER_LOG: composerHarness.log,
		...(composerFail ? { FAKE_COMPOSER_FAIL: composerFail } : {}),
		FAKE_NPM_LOG: npmHarness.log,
		...(npmFail ? { FAKE_NPM_FAIL: npmFail } : {}),
		REAL_NPM: spawnSync('which', ['npm'], { encoding: 'utf8' }).stdout.trim(),
		PATH: `${npmHarness.bin}:${composerHarness.bin}:${process.env.PATH}`,
		GIT_AUTHOR_NAME: 'Promotion Test',
		GIT_AUTHOR_EMAIL: 'promotion@example.test',
		GIT_COMMITTER_NAME: 'Promotion Test',
		GIT_COMMITTER_EMAIL: 'promotion@example.test',
	};
	if (failCommit) {
		const failBin = join(root, 'fail-commit-bin');
		mkdirSync(failBin);
		const fakeGit = join(failBin, 'git');
		writeFileSync(
			fakeGit,
			[
				'#!/usr/bin/env node',
				"import { spawnSync } from 'node:child_process';",
				'const args = process.argv.slice(2);',
				"if (args[0] === 'commit') { console.error('simulated commit interruption'); process.exit(1); }",
				"const result = spawnSync(process.env.REAL_GIT, args, { stdio: 'inherit' });",
				'process.exit(result.status ?? 1);',
				'',
			].join('\n'),
		);
		chmodSync(fakeGit, 0o755);
		env.REAL_GIT = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
		env.PATH = `${failBin}:${env.PATH}`;
	}
	const result = spawnSync(
		process.execPath,
		args,
		{
			encoding: 'utf8',
			env,
		},
	);
	return { ...result, dest, output: `${result.stdout}\n${result.stderr}` };
}

function makeFakeGh(root, template) {
	const bin = join(root, 'fake-bin');
	const state = join(root, 'fake-gh-state.json');
	mkdirSync(bin);
	const templateSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: template, encoding: 'utf8' }).stdout.trim();
	const executable = join(bin, 'gh');
	writeFileSync(
		executable,
		[
			'#!/usr/bin/env node',
			"import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
			"import { spawnSync } from 'node:child_process';",
			'const args = process.argv.slice(2);',
			'const statePath = process.env.FAKE_GH_STATE;',
			"const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { created: false, clone_failures: 0 };",
			"const save = () => writeFileSync(statePath, JSON.stringify(state));",
			"if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
			"if (args[0] === 'repo' && args[1] === 'view') {",
			"  if (args[2] === 'local/template') { console.log('main'); process.exit(0); }",
			"  if (state.created) { console.log(JSON.stringify({ name: 'acme' })); process.exit(0); }",
			"  console.error('not found'); process.exit(1);",
			'}',
			"if (args[0] === 'repo' && args[1] === 'create') {",
			'  state.created = true; state.clone_failures = 1; save(); process.exit(0);',
			'}',
			"if (args[0] === 'repo' && args[1] === 'clone') {",
			"  if (state.clone_failures > 0) { state.clone_failures -= 1; save(); console.error('simulated clone interruption'); process.exit(1); }",
			"  const cloned = spawnSync('git', ['clone', '--quiet', process.env.FAKE_GH_TEMPLATE, args[3]], { stdio: 'inherit' });",
			'  process.exit(cloned.status ?? 1);',
			'}',
			"if (args[0] === 'api') {",
			"  if (args[1] === 'repos/local/template/commits/main') { console.log(process.env.FAKE_GH_TEMPLATE_SHA); process.exit(0); }",
			"  if (args[1] === 'repos/local/acme') {",
			"    console.log(JSON.stringify({ id: 123456, node_id: 'R_test', full_name: 'local/acme', created_at: '2026-07-30T10:00:05Z', default_branch: 'main', template_repository: { full_name: 'local/template' } }));",
			'    process.exit(0);',
			'  }',
			"  if (args[1] === 'repos/local/acme/commits?per_page=2') { console.log(JSON.stringify([{ sha: 'generated-commit' }])); process.exit(0); }",
			'}',
			"console.error(`unsupported fake gh command: ${args.join(' ')}`);",
			'process.exit(2);',
			'',
		].join('\n'),
	);
	chmodSync(executable, 0o755);
	return { bin, state, templateSha };
}

function promoteViaFakeGh({ root, workspace, fake, reuse = false, composer = null, json = false }) {
	const dest = join(root, 'dest');
	const args = [
		CLI,
		'lead',
		'promote',
		'acme',
		'--workspace-root',
		workspace,
		'--starter-path',
		STARTER_ROOT,
		'--dest',
		dest,
		'--org',
		'local',
		'--template',
		'local/template',
		'--confirm',
		'--non-interactive',
	];
	if (reuse) args.push('--reuse-remote');
	if (json) args.push('--json');
	const composerHarness = composer || makeFakeComposer(root);
	const npmHarness = makeFakeNpm(root);
	const result = spawnSync(process.execPath, args, {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${fake.bin}:${npmHarness.bin}:${composerHarness.bin}:${process.env.PATH}`,
			FAKE_COMPOSER_STATE: composerHarness.state,
			FAKE_COMPOSER_LOG: composerHarness.log,
			FAKE_NPM_LOG: npmHarness.log,
			REAL_NPM: spawnSync('which', ['npm'], { encoding: 'utf8' }).stdout.trim(),
			FAKE_GH_STATE: fake.state,
			FAKE_GH_TEMPLATE: join(root, 'template'),
			FAKE_GH_TEMPLATE_SHA: fake.templateSha,
			GIT_AUTHOR_NAME: 'Promotion Test',
			GIT_AUTHOR_EMAIL: 'promotion@example.test',
			GIT_COMMITTER_NAME: 'Promotion Test',
			GIT_COMMITTER_EMAIL: 'promotion@example.test',
		},
	});
	return { ...result, dest, output: `${result.stdout}\n${result.stderr}` };
}

const credentialUrlCases = [
	{
		name: 'a YAML escape continuation',
		credential: 'YamlEscapedCredential987654321',
		leadOptions: {
			stagingYaml: ['  staging: "https://admin:YamlEscapedCredential987654321\\', '    @staging.example.com"'],
		},
	},
	{
		name: 'a two-character password',
		credential: 'Q7',
		leadOptions: { staging: 'https://admin:Q7@staging.example.com' },
	},
	{
		name: 'a scheme-relative authenticated URL',
		credential: 'SchemeRelativeCredential987654321',
		leadOptions: { staging: '//admin:SchemeRelativeCredential987654321@staging.example.com' },
	},
	{
		name: 'a slashless HTTPS authenticated URL',
		credential: 'R8',
		leadOptions: { staging: 'https:admin:R8@staging.example.com' },
	},
	{
		name: 'a single-slash HTTPS authenticated URL',
		credential: 'S9',
		leadOptions: { staging: 'https:/admin:S9@staging.example.com' },
	},
	{
		name: 'a backslash HTTPS authenticated URL',
		credential: 'T6',
		leadOptions: { staging: 'https:\\admin:T6@staging.example.com' },
	},
];

for (const { name, credential, leadOptions } of credentialUrlCases) {
	for (const json of [false, true]) {
		test(`${name} aborts before GitHub creation without leaking in ${json ? 'JSON' : 'human'} output`, () => {
			const { dir, cleanup } = sandbox();
			try {
				const template = makeTemplate(dir);
				const workspace = makeLead(dir, leadOptions);
				const fake = makeFakeGh(dir, template);
				const result = promoteViaFakeGh({ root: dir, workspace, fake, json });

				assert.equal(result.status, 6, result.output);
				assert.equal(result.stdout.includes(credential), false, 'stdout must not echo the credential');
				assert.equal(result.stderr.includes(credential), false, 'stderr must not echo the credential');
				assert.equal(existsSync(result.dest), false, 'promotion must not create the destination');
				assert.equal(existsSync(fake.state), false, 'the fake GitHub remote must not be created');
				assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: won/);

				if (json) {
					const payload = JSON.parse(result.stdout);
					assert.equal(payload.code, 6);
					assert.deepEqual(payload.findings, [{ file: 'project.yml', line: 14, rule: 'url-userinfo' }]);
				} else {
					assert.match(result.output, /project\.yml:14 \[url-userinfo\]/);
				}
			} finally {
				cleanup();
			}
		});
	}
}

test('offline promotion completes, commits, and removes its checkpoint', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const composer = makeFakeComposer(dir);
		const npm = makeFakeNpm(dir);
		const result = promote({ root: dir, template, workspace, composer, npm });

		assert.equal(result.status, 0, result.output);
		assert.match(readFileSync(join(result.dest, 'style.css'), 'utf8'), /Text Domain: acme/);
		assert.match(readFileSync(join(result.dest, 'style.css'), 'utf8'), /Theme URI: https:\/\/kicobi\.com/);
		assert.equal(readFileSync(join(result.dest, '.project', 'brief', 'discovery.md'), 'utf8'), '# Client discovery\n');
		assert.equal(existsSync(join(result.dest, '.futurebase-promotion.json')), false);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: promoted/);

		const log = spawnSync('git', ['log', '-1', '--format=%s'], { cwd: result.dest, encoding: 'utf8' });
		assert.equal(log.status, 0);
		assert.match(log.stdout, /chore: promote acme/);
		assert.deepEqual(
			composerCalls(composer).map((call) => call.args),
			[
				['update', '--lock', '--no-install', '--no-interaction', '--quiet'],
				['validate', '--no-check-publish'],
			],
		);
		assert.ok(composerCalls(composer).every((call) => call.text_domain === 'acme'), 'Composer must run after rename');
		assert.deepEqual(
			npmCalls(npm).filter((call) => call.args[0] === 'ci').map((call) => call.args),
			[['ci', '--prefix', 'tools/project-system', '--ignore-scripts']],
		);
		assert.match(npmCalls(npm).find((call) => call.args[0] === 'ci')?.cwd || '', /\/dest$/, 'nested install must run inside the promoted destination');
	} finally {
		cleanup();
	}
});

test('the real starter promotes, packages, and syncs its renamed companion plugin without overwriting it', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = cloneRealTemplate(dir);
		const workspace = makeLead(dir);
		const result = promote({ root: dir, template, workspace });

		assert.equal(result.status, 0, result.output);
		const pluginDir = join(result.dest, 'plugins', 'acme-seo');
		const bootstrap = join(pluginDir, 'acme-seo.php');
		const identifiers = readFileSync(join(pluginDir, 'includes', 'class-identifiers.php'), 'utf8');
		const cli = readFileSync(join(pluginDir, 'includes', 'class-cli.php'), 'utf8');
		assert.equal(existsSync(bootstrap), true);
		assert.equal(existsSync(join(pluginDir, 'includes', 'class-cleanup.php')), true);
		assert.equal(existsSync(join(result.dest, 'plugins', 'futurebase-seo')), false);
		assert.match(readFileSync(bootstrap, 'utf8'), /Plugin Name:\s+Acme SEO/);
		assert.match(readFileSync(bootstrap, 'utf8'), /namespace Acme\\SEO;/);
		assert.match(cli, /function purge\(/);
		for (const identifier of [
			'_compseo_title',
			'_compseo_description',
			'_compseo_noindex',
			'_compseo_canonical',
			'_compseo_social_image_id',
			'compseo_settings',
			'compseo_is_suppressed',
			'compseo_supported_post_types',
			'compseo_document',
			'compseo_schema_graph',
			'compseo_indexable_query_vars',
			'compseo_indexing_decision',
		]) {
			assert.match(identifiers, new RegExp(identifier));
		}

		const packaged = spawnSync('bash', ['bin/test-seo-package.sh'], { cwd: result.dest, encoding: 'utf8' });
		assert.equal(packaged.status, 0, packaged.stderr || packaged.stdout);

		const syncArgs = [CLI, 'sync', '--project-root', result.dest, '--futurebase-path', STARTER_ROOT, '--ref', 'HEAD', '--json'];
		const preview = spawnSync(process.execPath, syncArgs, { encoding: 'utf8' });
		assert.equal(preview.status, 0, preview.stderr || preview.stdout);
		const previewPayload = JSON.parse(preview.stdout);
		assert.deepEqual(
			previewPayload.entries.filter((entry) => entry.rel.startsWith('plugins/acme-seo/')),
			[],
		);

		appendFileSync(bootstrap, "\n// Local project integration.\n");
		const locallyModified = readFileSync(bootstrap, 'utf8');
		const drift = spawnSync(process.execPath, syncArgs, { encoding: 'utf8' });
		assert.equal(drift.status, 0, drift.stderr || drift.stdout);
		const pluginDrift = JSON.parse(drift.stdout).entries.find((entry) => entry.rel === 'plugins/acme-seo/acme-seo.php');
		assert.deepEqual(pluginDrift, {
			rel: 'plugins/acme-seo/acme-seo.php',
			cls: 'review',
			state: 'conflict',
		});

		const applied = spawnSync(process.execPath, [...syncArgs.slice(0, -1), '--apply', '--confirm', '--json'], { encoding: 'utf8' });
		assert.equal(applied.status, 0, applied.stderr || applied.stdout);
		assert.equal(readFileSync(bootstrap, 'utf8'), locallyModified, 'review-class plugin code must never be overwritten');
	} finally {
		cleanup();
	}
});

test('missing npm fails before the offline clone seam creates a destination', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const npm = makeFakeNpm(dir, { missing: true });
		const result = promote({ root: dir, template, workspace, npm });

		assert.equal(result.status, 3, result.output);
		assert.match(result.output, /npm is required for promotion/);
		assert.equal(existsSync(result.dest), false);
	} finally {
		cleanup();
	}
});

test('missing Composer fails before the offline clone seam creates a destination', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const composer = makeFakeComposer(dir, { missing: true });
		const result = promote({ root: dir, template, workspace, composer });

		assert.notEqual(result.status, 0, result.output);
		assert.match(result.output, /composer is required for promotion/);
		assert.equal(existsSync(result.dest), false);
	} finally {
		cleanup();
	}
});

test('Composer update failure retains a checkpoint and skips validation', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const composer = makeFakeComposer(dir);
		const result = promote({ root: dir, template, workspace, composer, composerFail: 'update' });

		assert.notEqual(result.status, 0, result.output);
		assert.match(result.output, /promotion failed at step: composer-lock/);
		assert.equal(existsSync(join(result.dest, '.futurebase-promotion.json')), true);
		assert.deepEqual(composerCalls(composer).map((call) => call.args[0]), ['update']);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: won/);
	} finally {
		cleanup();
	}
});

test('Composer validation failure is noisy, checkpointed, and succeeds on resume', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const composer = makeFakeComposer(dir);
		const interrupted = promote({ root: dir, template, workspace, composer, composerFail: 'validate' });

		assert.notEqual(interrupted.status, 0, interrupted.output);
		assert.match(interrupted.output, /promotion failed at step: composer-lock/);
		assert.equal((interrupted.output.match(/Composer could not detect the root package/g) || []).length, 2);
		assert.equal(existsSync(join(interrupted.dest, '.futurebase-promotion.json')), true);

		const resumed = promote({ root: dir, template, workspace, composer, resume: true });
		assert.equal(resumed.status, 0, resumed.output);
		assert.deepEqual(composerCalls(composer).map((call) => call.args[0]), ['update', 'validate', 'update', 'validate']);
		assert.equal(existsSync(join(resumed.dest, '.futurebase-promotion.json')), false);
	} finally {
		cleanup();
	}
});

test('project-system dependency failure is named, checkpointed, and succeeds on resume', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const composer = makeFakeComposer(dir);
		const npm = makeFakeNpm(dir);
		const interrupted = promote({ root: dir, template, workspace, composer, npm, npmFail: 'ci' });

		assert.equal(interrupted.status, 5, interrupted.output);
		assert.match(interrupted.output, /promotion failed at step: project-system-deps/);
		assert.match(interrupted.output, /npm ci --prefix tools\/project-system --ignore-scripts failed/);
		assert.equal(existsSync(join(interrupted.dest, '.futurebase-promotion.json')), true);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: won/);
		assert.equal(npmCalls(npm).filter((call) => call.args[0] === 'ci').length, 1);

		const resumed = promote({ root: dir, template, workspace, composer, npm, resume: true });
		assert.equal(resumed.status, 0, resumed.output);
		assert.equal(npmCalls(npm).filter((call) => call.args[0] === 'ci').length, 2);
		assert.equal(existsSync(join(resumed.dest, '.futurebase-promotion.json')), false);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: promoted/);
	} finally {
		cleanup();
	}
});

test('a commit interruption retains the checkpoint and --resume completes it', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const interrupted = promote({ root: dir, template, workspace, failCommit: true });
		assert.notEqual(interrupted.status, 0, interrupted.output);
		assert.match(interrupted.output, /promotion failed at step: commit/);
		assert.equal(existsSync(join(interrupted.dest, '.futurebase-promotion.json')), true);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: won/);

		const resumed = promote({ root: dir, template, workspace, resume: true });
		assert.equal(resumed.status, 0, resumed.output);
		assert.equal(existsSync(join(resumed.dest, '.futurebase-promotion.json')), false);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: promoted/);
	} finally {
		cleanup();
	}
});

test('a clone interruption retains a receipt and --reuse-remote hands off to --resume checkpointing', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const fake = makeFakeGh(dir, template);

		const interrupted = promoteViaFakeGh({ root: dir, workspace, fake });
		assert.notEqual(interrupted.status, 0, interrupted.output);
		assert.match(interrupted.output, /promotion failed at step: clone/);
		assert.match(interrupted.output, /1\. Delete the incomplete remote/);
		assert.match(interrupted.output, /2\. Retain the remote and receipt/);
		const receipts = readdirSync(dir).filter((name) => /^\.futurebase-promotion-[a-f0-9]{20}\.json$/.test(name));
		assert.equal(receipts.length, 1, interrupted.output);
		assert.equal(existsSync(interrupted.dest), false);

		const recovered = promoteViaFakeGh({ root: dir, workspace, fake, reuse: true });
		assert.equal(recovered.status, 0, recovered.output);
		assert.equal(existsSync(join(dir, receipts[0])), false);
		assert.equal(existsSync(join(recovered.dest, '.futurebase-promotion.json')), false);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: promoted/);
	} finally {
		cleanup();
	}
});

for (const variant of ['root-symlink', 'nested-symlink', 'final-symlink']) {
	test(`promotion refuses a ${variant.replace('-', ' ')} target`, () => {
		const { dir, cleanup } = sandbox();
		try {
			const outside = join(dir, 'outside');
			const outsideIgnore = join(dir, 'outside-ignore');
			mkdirSync(outside);
			writeFileSync(outsideIgnore, 'UNCHANGED\n');

			const template = makeTemplate(dir, variant);
			const workspace = makeLead(dir);
			const result = promote({ root: dir, template, workspace });

			assert.notEqual(result.status, 0, result.output);
			assert.equal(readFileSync(outsideIgnore, 'utf8'), 'UNCHANGED\n');
			assert.equal(existsSync(join(outside, 'metrics', 'metrics.yml')), false);
			assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: won/);
			assert.ok(lstatSync(result.dest).isDirectory());
		} finally {
			cleanup();
		}
	});
}
