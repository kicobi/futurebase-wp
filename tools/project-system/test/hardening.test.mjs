import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanText } from '../lib/secret-scan.mjs';
import { PROJECT_PRIVATE_IGNORES } from '../lib/privacy-paths.mjs';
import { inspectProjectRecord } from '../commands/project/validate.mjs';
import { fetchWithTimeout, run } from '../modules/crawl.mjs';

const secret = 'SyntheticCredential987654321';
const sandbox = (t) => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'futurebase-hardening-')));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
};

test('quoted keys and later assignments cannot bypass scanning or disclose values', () => {
	for (const input of [
		JSON.stringify({ password: secret }),
		`'client-secret': '${secret}'`,
		`password: changeme; password: ${secret}`,
		`password: short; password: ${secret}`,
		`Bearer placeholder; Bearer ${secret}`,
	]) {
		const findings = scanText(input);
		assert.equal(findings.length, 1);
		assert.ok(!JSON.stringify(findings).includes(secret));
	}
	assert.deepEqual(scanText('{"password":"${DEPLOY_PASSWORD}"}'), []);
});

test('scanner privacy exclusions match generated Git ignores, including nested names', (t) => {
	const dir = sandbox(t);
	assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
	writeFileSync(join(dir, '.gitignore'), PROJECT_PRIVATE_IGNORES.join('\n') + '\n');
	const paths = ['private/key.yml', 'credentials/key.yml', 'auth/key.yml', 'raw-private/key.yml', 'analysis/raw-private/key.yml', 'analysis/private/key.yml', 'analysis/auth/key.yml', 'analysis/credentials/key.yml'];
	for (const path of paths) {
		const full = join(dir, '.project', path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, `password: ${secret}`);
	}
	const findings = inspectProjectRecord(dir).findings.map((finding) => finding.file);
	for (const path of paths) {
		const ignored = spawnSync('git', ['check-ignore', '-q', `.project/${path}`], { cwd: dir }).status === 0;
		assert.equal(findings.includes(join(dir, '.project', path)), !ignored, path);
	}
});

test('private paths are scanned when tracked or no longer ignored', (t) => {
	const dir = sandbox(t);
	assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
	writeFileSync(join(dir, '.gitignore'), PROJECT_PRIVATE_IGNORES.join('\n') + '\n');
	const path = join(dir, '.project/private/key.yml');
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `password: ${secret}`);
	assert.equal(inspectProjectRecord(dir).findings.length, 0);
	assert.equal(spawnSync('git', ['add', '-f', '.project/private/key.yml'], { cwd: dir }).status, 0);
	assert.ok(inspectProjectRecord(dir).findings.some((finding) => finding.file === path));
	assert.equal(spawnSync('git', ['rm', '--cached', '-f', '.project/private/key.yml'], { cwd: dir }).status, 0);
	writeFileSync(join(dir, '.gitignore'), '');
	assert.ok(inspectProjectRecord(dir).findings.some((finding) => finding.file === path));
});

for (const fatal of [false, true]) {
	test(`large ${fatal ? 'fatal' : 'successful'} JSON flushes through a pipe and stops control flow`, () => {
		const module = new URL('../lib/output.mjs', import.meta.url).href;
		const script = `import { emitJson, die, OutputExit, finishOutput } from ${JSON.stringify(module)};
		try { ${fatal ? 'die("x".repeat(300000), 6, {json:true})' : 'emitJson({items:Array.from({length:4000},(_,i)=>({id:i,text:"x".repeat(80)}))})'}; console.log('UNREACHABLE'); }
		catch (error) { if (!(error instanceof OutputExit)) throw error; await finishOutput(error); }`;
		const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', maxBuffer: 2 ** 22 });
		assert.equal(child.status, fatal ? 6 : 0, child.stderr);
		const result = JSON.parse(child.stdout);
		assert.equal(fatal ? result.message.length : result.items.length, fatal ? 300000 : 4000);
		assert.equal(child.stderr, '');
	});
}

test('crawl follows only eligible same-origin links and sanitizes all URL evidence', async (t) => {
	const dir = sandbox(t);
	const origin = 'https://client.example';
	const unsafe = [
		`${origin}.evil.invalid/path`, 'https://elsewhere.invalid/',
		`${origin}/reset?token=${secret}`, `${origin}/page?lang=sv&amp;token=${secret}`,
		`${origin}/page;jsessionid=${secret}`, `${origin}/token/${secret}`,
		`${origin}/page#access_token=${secret}`, `https://user:${secret}@client.example/`,
		`${origin}/wp-login.php?action=logout`,
	];
	const requests = [];
	t.mock.method(globalThis, 'fetch', async (url) => {
		requests.push(url);
		if (url === `${origin}/`) return new Response(`<title>Home</title><link rel="canonical" href="${origin}/?token=${secret}&amp;lang=sv">${[...unsafe, `${origin}/public?lang=sv`, `${origin}/redirect`].map((href) => `<a href="${href}">Link</a>`).join('')}`, { headers: { 'content-type': 'text/html' } });
		if (url.endsWith('/redirect')) return new Response(null, { status: 302, headers: { location: `/reset?token=${secret}` } });
		return new Response(null, { status: 404 });
	});
	await run({ pages: [{ name: 'home', url: `${origin}/` }], runDir: dir, config: { base_url: origin } });
	assert.deepEqual(requests, [`${origin}/`, `${origin}/public?lang=sv`, `${origin}/redirect`]);
	const raw = readFileSync(join(dir, 'crawl/crawl.json'), 'utf8');
	assert.ok(!raw.includes(secret));
	const report = JSON.parse(raw);
	assert.equal(report.pages[0].internalLinks, 2);
	assert.equal(report.pages[0].canonical, `${origin}/?lang=sv`);
	assert.equal(report.brokenLinks.length, 2);
});

test('redirects are checked before crossing origins, schemes, ports, or credentials', async (t) => {
	for (const target of ['https://client.example.evil.invalid/', 'http://client.example/', 'https://client.example:444/', `https://client.example/?token=${secret}`]) {
		let calls = 0;
		const mocked = t.mock.method(globalThis, 'fetch', async () => {
			calls++;
			return new Response(null, { status: 302, headers: { location: target } });
		});
		await assert.rejects(fetchWithTimeout('https://client.example/'), /refused/);
		assert.equal(calls, 1);
		mocked.mock.restore();
	}
});

for (const phase of ['headers', 'body']) {
	test(`crawl deadline cancels stalled ${phase}`, async (t) => {
		let signal;
		t.mock.method(globalThis, 'fetch', async (_url, options) => {
			signal = options.signal;
			const stall = () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('timed out', 'AbortError')), { once: true }));
			if (phase === 'headers') return stall();
			return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), text: stall };
		});
		await assert.rejects(fetchWithTimeout('https://client.example/', { timeoutMs: 15 }), { name: 'AbortError' });
		assert.equal(signal.aborted, true);
	});
}
