import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
	captureTargetErrors,
	normalizeBaseUrl,
	sanitizeCaptureConfig,
	sanitizeRunSummary,
} from '../lib/targets.mjs';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(TOOL_ROOT, 'bin', 'futurebase.mjs');

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'futurebase-targets-'));
	mkdirSync(join(dir, '.project'), { recursive: true });
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function run(args, cwd) {
	return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('base_url accepts only an HTTP(S) origin and normalizes its slash', () => {
	assert.equal(normalizeBaseUrl('https://example.test'), 'https://example.test/');
	assert.equal(normalizeBaseUrl('http://example.test:8080/'), 'http://example.test:8080/');
	for (const value of [
		'ftp://example.test',
		'https://user:password@example.test',
		'https://example.test/path',
		'https://example.test/?lang=sv',
		'https://example.test/#top',
	]) {
		assert.throws(() => normalizeBaseUrl(value), /HTTP\(S\) origin/);
	}
});

test('page targets preserve public queries but reject userinfo and secret parameters', () => {
	const safe = { base_url: 'https://example.test/', pages: [{ name: 'sv', url: '/about?lang=sv' }] };
	assert.deepEqual(captureTargetErrors(safe), []);
	for (const url of [
		'https://admin:password@example.test/',
		'/preview?token=do-not-print',
		'/preview?client-secret=do-not-print',
		'/preview?auth[token]=do-not-print',
	]) {
		const errors = captureTargetErrors({ ...safe, pages: [{ name: 'unsafe', url }] });
		assert.equal(errors.length, 1);
		assert.doesNotMatch(errors[0], /do-not-print|password@example/);
	}
});

test('page targets fail closed on malformed encoded credentials and session keys', () => {
	const safe = { base_url: 'https://example.test/', pages: [{ name: 'sv', url: '/about?lang=sv' }] };
	assert.deepEqual(captureTargetErrors(safe), [], 'ordinary relative pages and public queries remain valid');

	for (const url of [
		'https://admin%3AFakeEncodedPassword987%40example.test',
		'/preview?session_id=FakeSessionSecret987',
		'/preview?sessionid=FakeSessionSecret987',
		'/preview?jsessionid=FakeSessionSecret987',
		'/preview?phpsessid=FakeSessionSecret987',
		'/preview?auth[sessionid]=FakeSessionSecret987',
		'/preview?auth[token][scope]=FakeSessionSecret987',
		'/preview?auth.session_id=FakeSessionSecret987',
		'/preview?auth-sessionid=FakeSessionSecret987',
		'/preview?%73essionid=FakeSessionSecret987',
		'/preview;jsessionid=FakeSessionSecret987',
	]) {
		const errors = captureTargetErrors({ ...safe, pages: [{ name: 'unsafe', url }] });
		assert.equal(errors.length, 1, `must reject ${url.split('=')[0]}`);
		assert.doesNotMatch(errors[0], /FakeEncodedPassword987|FakeSessionSecret987/);
	}
	assert.deepEqual(captureTargetErrors({ ...safe, pages: [{ name: 'public', url: '/preview;lang=sv?lang=sv' }] }), []);
});

test('defensive sanitization strips credentials while retaining public query parameters', () => {
	const config = sanitizeCaptureConfig({
		base_url: 'https://admin:base-secret@example.test/private?token=base-secret',
		pages: [
			{ name: 'sv', url: 'https://user:page-secret@example.test/about?lang=sv&access_token=page-secret' },
			{ name: 'session', url: '/preview;jsessionid=path-secret?auth[sessionid]=query-secret&lang=sv' },
		],
	});
	assert.equal(config.base_url, 'https://example.test/');
	assert.equal(config.pages[0].url, 'https://example.test/about?lang=sv');
	assert.equal(config.pages[1].url, '/preview?lang=sv');
	assert.doesNotMatch(JSON.stringify(config), /base-secret|page-secret|path-secret|query-secret|admin|user/);

	const summary = sanitizeRunSummary({ target: config, status: 'completed' });
	assert.equal(summary.target.pages[0].url, 'https://example.test/about?lang=sv');
});

test('baseline init rejects credentials without creating config or echoing the value', () => {
	const { dir, cleanup } = sandbox();
	try {
		const sentinel = 'NeverEchoThisPassword987';
		const result = run(['baseline', 'init', '--url', `https://admin:${sentinel}@example.test`, '--force'], dir);
		assert.equal(result.status, 2);
		assert.equal(existsSync(join(dir, '.project', 'baseline.config.yml')), false);
		assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
		assert.match(result.stdout + result.stderr, /HTTP\(S\) origin/);
	} finally {
		cleanup();
	}
});

test('baseline init rejects malformed, nested, encoded, and path-form credentials without persisting or echoing them', () => {
	const sentinel = 'FakeSessionSecret987';
	for (const url of [
		`https://admin%3A${sentinel}%40example.test`,
		`/preview?auth[sessionid]=${sentinel}`,
		`/preview?auth[token][scope]=${sentinel}`,
		`/preview?auth.session_id=${sentinel}`,
		`/preview?auth-sessionid=${sentinel}`,
		`/preview?PHPSESSID=${sentinel}`,
		`/preview?%73essionid=${sentinel}`,
		`/preview;jsessionid=${sentinel}`,
	]) {
		const { dir, cleanup } = sandbox();
		try {
			const result = run([
				'baseline',
				'init',
				'--url',
				'https://example.test',
				'--page',
				`probe=${url}`,
				'--force',
				'--json',
			], dir);
			assert.equal(result.status, 2, url);
			assert.equal(existsSync(join(dir, '.project', 'baseline.config.yml')), false, url);
			assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
			assert.match(result.stdout + result.stderr, /page URL|credentials|HTTP\(S\)/i);
		} finally {
			cleanup();
		}
	}
});

test('capture rejects a secret page before creating a run and keeps JSON secret-free', () => {
	const { dir, cleanup } = sandbox();
	try {
		const sentinel = 'NeverEchoThisToken987';
		writeFileSync(join(dir, '.project', 'baseline.config.yml'), `schema_version: 1\nkind: baseline-config\nmode: redesign\nbase_url: https://example.test/\npages:\n  - name: home\n    url: /?token=${sentinel}\nmodules: [manual]\nviewports: []\n`);
		const result = run(['baseline', 'run', '--json'], dir);
		assert.equal(result.status, 2);
		assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
		assert.equal(existsSync(join(dir, '.project', 'baseline')), false);
		const payload = JSON.parse(result.stdout);
		assert.match(payload.message, /secret parameters/);
	} finally {
		cleanup();
	}
});

test('inspection and historical report regeneration redact old unsafe targets', () => {
	const { dir, cleanup } = sandbox();
	try {
		const sentinel = 'HistoricalSecret987';
		writeFileSync(join(dir, '.project', 'baseline.config.yml'), `schema_version: 1\nkind: baseline-config\nmode: redesign\nbase_url: https://admin:${sentinel}@example.test/private?password=${sentinel}\npages:\n  - name: home\n    url: /?lang=sv&token=${sentinel}\nmodules: [manual]\nviewports: []\n`);
		const runId = '2026-08-19T120000Z';
		const runDir = join(dir, '.project', 'baseline', runId);
		mkdirSync(runDir, { recursive: true });
		writeFileSync(join(runDir, 'summary.json'), JSON.stringify({
			schema_version: 1,
			run_id: runId,
			project_type: 'redesign',
			kind: 'baseline',
			status: 'partial',
			target: {
				base_url: `https://admin:${sentinel}@example.test/private`,
				pages: [{ name: 'home', url: `https://example.test/?lang=sv&token=${sentinel}` }],
				viewports: [],
				modules: ['manual'],
			},
			modules: [{ module: 'manual', status: 'skipped' }],
		}, null, 2));

		const inspect = run(['baseline', 'inspect', '--json'], dir);
		assert.equal(inspect.status, 0, inspect.stderr);
		assert.doesNotMatch(inspect.stdout + inspect.stderr, new RegExp(sentinel));
		const inspected = JSON.parse(inspect.stdout);
		assert.equal(inspected.config.base_url, 'https://example.test/');
		assert.equal(inspected.summary.target.pages[0].url, 'https://example.test/?lang=sv');

		const report = run(['baseline', 'report', '--run-id', runId, '--json'], dir);
		assert.equal(report.status, 0, report.stderr || report.stdout);
		const html = readFileSync(join(dir, '.project', 'reports', `baseline-${runId}.html`), 'utf8');
		const markdown = readFileSync(join(runDir, 'report.md'), 'utf8');
		assert.doesNotMatch(html + markdown + report.stdout + report.stderr, new RegExp(sentinel));
		assert.match(html, /https:\/\/example\.test\//);
	} finally {
		cleanup();
	}
});
