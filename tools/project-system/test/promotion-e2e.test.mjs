// test/promotion-e2e.test.mjs — exercise the real promotion command through
// its offline clone seam, including post-clone containment failures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
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
const CLI = join(TOOL_ROOT, 'bin', 'wp-starter.mjs');

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'wp-starter-promote-e2e-'));
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
		JSON.stringify({ name: 'wp-starter', private: true, scripts: { rename: 'node rename.mjs' } }, null, 2) + '\n',
	);
	writeFileSync(
		join(template, 'rename.mjs'),
		[
			"import { readFileSync, writeFileSync } from 'node:fs';",
			'const slug = process.argv[2];',
			"const style = readFileSync('style.css', 'utf8').replace(/^Text Domain:.*$/m, `Text Domain: ${slug}`);",
			"writeFileSync('style.css', style);",
			'',
		].join('\n'),
	);
	writeFileSync(join(template, 'style.css'), '/*\nTheme Name: WP Starter\nText Domain: wp-starter\n*/\n');
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

function makeLead(root) {
	const workspace = join(root, 'leads');
	const lead = join(workspace, 'acme');
	mkdirSync(join(lead, 'brief'), { recursive: true });
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
			'  staging: null',
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

function promote({ root, template, workspace, resume = false, failCommit = false }) {
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
	const env = {
		...process.env,
		WP_STARTER_PROMOTE_CLONE_FROM: template,
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

function promoteViaFakeGh({ root, workspace, fake, reuse = false }) {
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
	const result = spawnSync(process.execPath, args, {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${fake.bin}:${process.env.PATH}`,
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

test('offline promotion completes, commits, and removes its checkpoint', () => {
	const { dir, cleanup } = sandbox();
	try {
		const template = makeTemplate(dir);
		const workspace = makeLead(dir);
		const result = promote({ root: dir, template, workspace });

		assert.equal(result.status, 0, result.output);
		assert.match(readFileSync(join(result.dest, 'style.css'), 'utf8'), /Text Domain: acme/);
		assert.equal(readFileSync(join(result.dest, '.project', 'brief', 'discovery.md'), 'utf8'), '# Client discovery\n');
		assert.equal(existsSync(join(result.dest, '.wp-starter-promotion.json')), false);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: promoted/);

		const log = spawnSync('git', ['log', '-1', '--format=%s'], { cwd: result.dest, encoding: 'utf8' });
		assert.equal(log.status, 0);
		assert.match(log.stdout, /chore: promote acme/);
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
		assert.equal(existsSync(join(interrupted.dest, '.wp-starter-promotion.json')), true);
		assert.match(readFileSync(join(workspace, 'acme', 'project.yml'), 'utf8'), /status: won/);

		const resumed = promote({ root: dir, template, workspace, resume: true });
		assert.equal(resumed.status, 0, resumed.output);
		assert.equal(existsSync(join(resumed.dest, '.wp-starter-promotion.json')), false);
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
		const receipts = readdirSync(dir).filter((name) => /^\.wp-starter-promotion-[a-f0-9]{20}\.json$/.test(name));
		assert.equal(receipts.length, 1, interrupted.output);
		assert.equal(existsSync(interrupted.dest), false);

		const recovered = promoteViaFakeGh({ root: dir, workspace, fake, reuse: true });
		assert.equal(recovered.status, 0, recovered.output);
		assert.equal(existsSync(join(dir, receipts[0])), false);
		assert.equal(existsSync(join(recovered.dest, '.wp-starter-promotion.json')), false);
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
