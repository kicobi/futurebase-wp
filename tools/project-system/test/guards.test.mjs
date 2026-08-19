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
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { scanText, scanFiles } from '../lib/secret-scan.mjs';
import { ManagedPathError, isInside, requirePath, symlinkFreePath } from '../lib/paths.mjs';
import { projectPaths } from '../lib/baseline.mjs';
import { applyEntry } from '../lib/sync.mjs';
import { classify } from '../commands/lead/promote.mjs';

function sandbox() {
	const dir = mkdtempSync(join(tmpdir(), 'futurebase-guards-'));
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
	assert.equal(scanText('password: $DEPLOY_PASSWORD').length, 0);
	assert.equal(scanText('password: process.env.DEPLOY_PASSWORD').length, 0);
	assert.equal(scanText('secret: <REPLACE_WITH_REAL_VALUE>').length, 0);
	assert.equal(scanText('secret: [REPLACE_WITH_REAL_VALUE]').length, 0);
	assert.equal(scanText('secret: ****').length, 0);
});

test('a placeholder word inside the MATCH does not disarm the scanner either', () => {
	// Round two. Moving suppression from the line to the match closed the
	// trailing-comment case and opened two more: the whole match includes the
	// username of a basic-auth URL, and for structured tokens it is the token
	// itself, whose 36 random characters can contain anything.
	assert.equal(scanText('https://example-user:ActualPassword987654321@prod.example').length, 1, 'a username must not suppress a password');
	assert.equal(scanText(`ghp_${'example'.padEnd(36, 'z')}`).length, 1, "a token's own body must not suppress it");
	assert.equal(scanText('AKIAIOSFODNN7EXAMPLB used by example-service').length, 1);
});

test('placeholders are still honoured where a human would write one', () => {
	// The narrowing must not cost the suppression that keeps this usable.
	assert.equal(scanText('https://admin:changeme-please@host').length, 0, 'a placeholder PASSWORD still suppresses');
	assert.equal(scanText('Bearer ${DEPLOY_TOKEN_VALUE_GOES_HERE}').length, 0);
});

test('a placeholder word elsewhere on the line does not disarm the scanner', () => {
	// The original bug: IGNORE_VALUE was tested against the whole line, so any
	// annotation containing "example" or "redacted" suppressed a real hit.
	assert.equal(scanText('api_key: AbcdEFGHijklMNOP123456789 # example production key').length, 1);
	assert.equal(scanText(`ghp_${'a'.repeat(36)} (redacted below)`).length, 1);
	assert.equal(scanText('# for example, the key below is live\npassword: Zx9QwErTyUiOpAsDfGh').length, 1);
});

test('placeholder-looking substrings inside literals do not suppress secrets', () => {
	for (const value of [
		'live-example-password-987654',
		'production-changeme-token-876543',
		'abc-your-api-key-def-7654321',
		'real-redacted-secret-654321',
	]) {
		assert.equal(scanText(`secret: ${value}`).length, 1, value);
	}
});

test('common special characters in literal assigned secrets are scanned', () => {
	for (const value of ['A!b@C#d$E%f^G&h*9', 'prod.token/value+with=salt', 'p@ss word with spaces 987!']) {
		assert.equal(scanText(`password: "${value}"`).length, 1, value);
	}
});

test('recognised configuration, path, URL, and hash references stay silent', () => {
	for (const value of [
		'config.production.settings.value',
		'../secrets/deployment-password.txt',
		'https://vault.example.test/secret/path',
		`sha256:${'a'.repeat(64)}`,
		'refs/heads/deploy-production',
	]) {
		assert.equal(scanText(`api_key: ${value}`).length, 0, value);
	}
});

test('arbitrary dotted, slashed, and special-character literals are not ignored', () => {
	for (const value of ['live.prod.token.987654321', 'customer/team/token/987654', 'prod!secret:value=987654']) {
		assert.equal(scanText(`access_token: ${value}`).length, 1, value);
	}
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

test('a symlink-free path resolves; traversal and absolute paths do not', () => {
	const { dir, cleanup } = sandbox();
	try {
		assert.ok(symlinkFreePath(dir, 'tools/VERSION'));
		assert.equal(symlinkFreePath(dir, '../escape.txt'), null);
		assert.equal(symlinkFreePath(dir, '/etc/passwd'), null);
	} finally {
		cleanup();
	}
});

test('a DANGLING final symlink is refused, not read as "does not exist"', () => {
	// The hole the previous resolver left. It realpath'd the deepest EXISTING
	// ancestor, and a link pointing at something not yet created has no realpath
	// — so the target looked like an ordinary not-yet-written file inside the
	// root. The write was allowed and the create followed the link out.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
		symlinkSync(join(dir, 'not-created-yet.yml'), join(root, '.github', 'workflows', 'ci.yml'));

		assert.equal(symlinkFreePath(root, '.github/workflows/ci.yml'), null);
	} finally {
		cleanup();
	}
});

test('symlinkFreePath rejects root, nested, and final symlinks even when they stay contained', () => {
	const { dir, cleanup } = sandbox();
	try {
		const realRoot = join(dir, 'real');
		const linkedRoot = join(dir, 'linked-root');
		mkdirSync(join(realRoot, 'nested'), { recursive: true });
		symlinkSync(realRoot, linkedRoot);
		assert.equal(symlinkFreePath(linkedRoot, 'file.txt'), null, 'a symlinked root is refused');

		symlinkSync(join(realRoot, 'nested'), join(realRoot, 'linked-nested'));
		assert.equal(symlinkFreePath(realRoot, 'linked-nested/file.txt'), null, 'a nested symlink is refused');

		writeFileSync(join(realRoot, 'target.txt'), 'target');
		symlinkSync(join(realRoot, 'target.txt'), join(realRoot, 'linked-final.txt'));
		assert.equal(symlinkFreePath(realRoot, 'linked-final.txt'), null, 'a final symlink is refused');

		assert.equal(symlinkFreePath(realRoot, 'nested/new/file.txt'), join(realRoot, 'nested/new/file.txt'));
		assert.equal(symlinkFreePath(realRoot, '../escape.txt'), null);
	} finally {
		cleanup();
	}
});

// --- sync writes -------------------------------------------------------------

test('a symlinked managed directory does not become its own root', () => {
	// The gap the first containment fix left, and the reason it was worse than
	// no check: intermediate symlinks were blocked while a symlinked managed
	// root resolved to itself, so every write "passed" containment and landed
	// outside the tree the caller actually meant. A tree the tool CONSTRUCTS
	// (`<dest>/.project`) is a path under the handed root, never a root itself.
	const { dir, cleanup } = sandbox();
	try {
		const dest = join(dir, 'dest');
		const outside = join(dir, 'outside');
		mkdirSync(dest, { recursive: true });
		mkdirSync(outside, { recursive: true });
		symlinkSync(outside, join(dest, '.project'));

		assert.throws(() => requirePath(dest, join('.project', 'brief', 'discovery.md')), ManagedPathError);
		assert.equal(existsSync(join(outside, 'brief')), false);
	} finally {
		cleanup();
	}
});

test('applyEntry refuses a symlink that stays INSIDE the project', () => {
	// Containment was never the property sync needs. Its guarantee is
	// CLASSIFICATION — patterns/, templates/, inc/, src/ are never written — and
	// a resolver that only asks "is this inside the project root" cannot express
	// "and it is still the file whose class I checked". `tools -> patterns` turned
	// "copy the starter's tools/ verbatim" into a write into the client's theme.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		mkdirSync(join(root, 'patterns'), { recursive: true });
		symlinkSync(join(root, 'patterns'), join(root, 'tools'));

		const entry = { rel: 'tools/project-system/VERSION', cls: 'deps', state: 'add', next: 'PWNED\n' };
		assert.equal(applyEntry(entry, { projectRoot: root, starter: dir }), false);
		assert.equal(existsSync(join(root, 'patterns', 'project-system')), false, 'a SAFE write may not be redirected into a NEVER tree');
	} finally {
		cleanup();
	}
});

test('applyEntry refuses a dangling final symlink', () => {
	// A managed destination that does not exist yet is the normal case for sync,
	// so "it is not there" could not be allowed to mean "it is safe to create".
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
		const outside = join(dir, 'ci.yml');
		symlinkSync(outside, join(root, '.github', 'workflows', 'ci.yml'));

		const entry = { rel: '.github/workflows/ci.yml', cls: 'deps', state: 'add', next: 'PWNED\n' };
		assert.equal(applyEntry(entry, { projectRoot: root, starter: dir }), false, 'applyEntry must refuse the write');
		assert.equal(existsSync(outside), false, 'nothing may be created outside the project');
	} finally {
		cleanup();
	}
});

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

// --- the gate must not disclose what it catches ------------------------------
//
// `snippet` used to carry the matched line, trimmed to 80 characters by a
// function named redact() that did not redact. Promotion printed it to the
// terminal and serialized it into --json, so a real credential reached CI logs
// through the check built to stop it.

test('a credential finding never carries the matched value', () => {
	const sentinel = 'S3nt1nelPassw0rdValue123456';
	for (const text of [
		`api_key: ${sentinel}`,
		`password = "${sentinel}"`,
		`url: https://admin:${sentinel}@staging.example.test`,
	]) {
		const findings = scanText(text);
		assert.ok(findings.length > 0, `expected a finding for: ${text.slice(0, 20)}…`);
		const serialized = JSON.stringify(findings);
		assert.ok(!serialized.includes(sentinel), `the finding disclosed the credential: ${serialized}`);
		assert.ok(findings[0].rule, 'the rule is what makes the refusal actionable');
		assert.equal(typeof findings[0].line, 'number');
	}
});

test('a finding never echoes any part of the source line', () => {
	// Not just the captured value — the surrounding line leaks context too.
	// The rule name legitimately appears in a finding; the value and the
	// surrounding context must not.
	const findings = scanText('api_key: AbcdEFGHijklMNOP123456789  # rotate before 2027-01');
	assert.equal(findings.length, 1);
	const serialized = JSON.stringify(findings);
	for (const fragment of ['AbcdEFGH', 'rotate', '2027-01']) {
		assert.ok(!serialized.includes(fragment), `leaked "${fragment}" from the scanned line`);
	}
});

test('operational findings still explain themselves', () => {
	// unscannable and binary describe the FILE, not its contents, so they keep a
	// message — that is what tells the operator which class to move it to.
	const findings = scanFiles([join(tmpdir(), `futurebase-absent-${Date.now()}.yml`)]);
	assert.equal(findings[0].rule, 'unscannable');
	assert.match(findings[0].snippet, /could not stat/);
});

// --- project init writes stay inside the project -----------------------------
//
// symlinkFreePath existed and was tested, and promote.mjs resolved its
// destination writes through it. `project init` built .project with a plain
// join, which follows a symlink like any other traversal — so a checkout
// containing `.project -> ../elsewhere` made init populate a directory outside
// the project it was pointed at, create six files there, and report success.

const INIT_CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'futurebase.mjs');

function initInto(root, extraArgs = []) {
	return spawnSync(process.execPath, [INIT_CLI, 'project', 'init', '--project-root', root, '--slug', 'probe', ...extraArgs], { encoding: 'utf8' });
}

test('project init refuses a symlinked .project and writes nothing outside', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'elsewhere');
		mkdirSync(root);
		mkdirSync(outside);
		symlinkSync(outside, join(root, '.project'));

		// --force is the dangerous path: without it existsSync follows the link
		// and the command stops on "already exists" by accident rather than by
		// rule, so the guard has to hold for both.
		const r = initInto(root, ['--force']);
		assert.notEqual(r.status, 0, 'a symlinked .project must be refused');
		assert.match(r.stdout + r.stderr, /refusing a path that resolves through a symlink/);
		assert.equal(existsSync(join(outside, 'project.yml')), false, 'nothing may be written outside the project root');
	} finally {
		cleanup();
	}
});

test('project init refuses a symlinked directory nested under .project', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'elsewhere');
		mkdirSync(join(root, '.project'), { recursive: true });
		mkdirSync(outside);
		symlinkSync(outside, join(root, '.project', 'baseline'));

		const r = initInto(root, ['--force']);
		assert.notEqual(r.status, 0);
		assert.match(r.stdout + r.stderr, /refusing a path that resolves through a symlink/);
		assert.equal(existsSync(join(outside, 'project.yml')), false);
	} finally {
		cleanup();
	}
});

test('project init still scaffolds an ordinary project', () => {
	// So the two refusals above cannot pass by refusing everything.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		mkdirSync(root);
		const r = initInto(root);
		assert.equal(r.status, 0, r.stdout + r.stderr);
		assert.ok(existsSync(join(root, '.project', 'project.yml')));
	} finally {
		cleanup();
	}
});

test('project init refuses a symlinked .gitignore and leaves it alone', () => {
	// The one write in this command that sits BESIDE .project rather than under
	// it, and so was the one the containment helper never covered.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'elsewhere.gitignore');
		mkdirSync(root);
		writeFileSync(outside, 'someone-elses-rules\n');
		symlinkSync(outside, join(root, '.gitignore'));

		const r = initInto(root);
		assert.notEqual(r.status, 0, 'a symlinked .gitignore must be refused');
		assert.match(r.stdout + r.stderr, /refusing a path that resolves through a symlink/);
		assert.equal(readFileSync(outside, 'utf8'), 'someone-elses-rules\n', 'the link target must be untouched');
	} finally {
		cleanup();
	}
});

// --- one resolver, every managed write ---------------------------------------
//
// Each of these was a separate escape found by a separate reviewer, and each had
// been "fixed" for the one command it was reported against. They are one defect:
// a destination built with a plain join.

test('a root the operator handed us may be a symlink; the path under it may not', () => {
	// ~/Sites/client -> /Volumes/work/client is an ordinary way to keep a
	// checkout. Refusing that would make the guard unusable, and unusable guards
	// get removed — so the root is realpath'd and everything below it is checked.
	const { dir, cleanup } = sandbox();
	try {
		const real = join(dir, 'real');
		const handed = join(dir, 'handed');
		mkdirSync(real);
		symlinkSync(real, handed);

		assert.equal(requirePath(handed, 'notes.md'), join(realpathSync(real), 'notes.md'), 'a symlinked root resolves rather than refusing');

		const outside = join(dir, 'outside');
		mkdirSync(outside);
		symlinkSync(outside, join(real, 'linked'));
		assert.throws(() => requirePath(handed, 'linked/notes.md'), ManagedPathError, 'a symlink below the root is refused');
	} finally {
		cleanup();
	}
});

test('projectPaths refuses a symlinked .project for every command at once', () => {
	// findProjectRoot locates .project with existsSync, which follows the link,
	// and projectPaths then joined six paths off it — so baseline configs, run
	// summaries, reports, metrics and the project record all landed outside.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'elsewhere');
		mkdirSync(root);
		mkdirSync(outside);
		symlinkSync(outside, join(root, '.project'));

		const paths = projectPaths(root);
		assert.throws(() => paths.projectDir, ManagedPathError);
		assert.throws(() => paths.configPath, ManagedPathError);
		assert.throws(() => paths.at('metrics', 'metrics.yml'), ManagedPathError);
	} finally {
		cleanup();
	}
});

test('projectPaths refuses a symlink BELOW .project too', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'elsewhere');
		mkdirSync(join(root, '.project'), { recursive: true });
		mkdirSync(outside);
		symlinkSync(outside, join(root, '.project', 'reports'));

		assert.throws(() => projectPaths(root).reportsDir, ManagedPathError);
	} finally {
		cleanup();
	}
});

test('a symlink on one path does not take the whole CLI offline', () => {
	// Resolving all five eagerly meant `.project/baseline -> /Volumes/big` —
	// a reasonable place to keep screenshots and Lighthouse JSON — refused every
	// command in the tool, read-only ones included. A guard with that much
	// collateral is a guard people route around.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const volume = join(dir, 'bigdisk');
		mkdirSync(join(root, '.project'), { recursive: true });
		mkdirSync(volume);
		symlinkSync(volume, join(root, '.project', 'baseline'));

		const paths = projectPaths(root);
		assert.ok(paths.projectDir, 'the paths that are fine still resolve');
		assert.ok(paths.reportsDir);
		assert.throws(() => paths.baselineDir, ManagedPathError, 'only the linked path is refused');
	} finally {
		cleanup();
	}
});

test('projectPaths still resolves an ordinary project', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		mkdirSync(join(root, '.project'), { recursive: true });
		const paths = projectPaths(root);
		assert.equal(paths.projectDir, join(realpathSync(root), '.project'));
		assert.equal(paths.configPath, join(realpathSync(root), '.project', 'baseline.config.yml'));
	} finally {
		cleanup();
	}
});

test('baseline init writes nothing through a symlinked .project', () => {
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'elsewhere');
		mkdirSync(root);
		mkdirSync(outside);
		symlinkSync(outside, join(root, '.project'));

		const r = spawnSync(process.execPath, [INIT_CLI, 'baseline', 'init', '--project-root', root, '--url', 'https://example.test'], { encoding: 'utf8' });
		assert.notEqual(r.status, 0);
		assert.match(r.stdout + r.stderr, /refusing a path that resolves through a symlink/);
		assert.equal(existsSync(join(outside, 'baseline.config.yml')), false, 'the config must not land outside the project');
	} finally {
		cleanup();
	}
});

test('lead archive writes nothing through a symlinked workspace', () => {
	// It stamps a status and leaves ARCHIVE.md INSIDE the workspace before moving
	// it, so a `<slug> -> elsewhere` link had it write two files into someone
	// else's directory and then move only the link.
	const { dir, cleanup } = sandbox();
	try {
		const leads = join(dir, 'leads');
		const outside = join(dir, 'elsewhere');
		mkdirSync(leads);
		mkdirSync(outside);
		symlinkSync(outside, join(leads, 'acme'));

		const r = spawnSync(process.execPath, [INIT_CLI, 'lead', 'archive', 'acme', '--workspace-root', leads, '--reason', 'lost'], { encoding: 'utf8' });
		assert.notEqual(r.status, 0);
		assert.match(r.stdout + r.stderr, /refusing a path that resolves through a symlink/);
		assert.equal(existsSync(join(outside, 'ARCHIVE.md')), false, 'no note may be left outside the leads root');
	} finally {
		cleanup();
	}
});

// Guarding a DIRECTORY says nothing about the leaf written inside it, and
// nothing about the sibling nobody asked about. Each of these passed the
// directory guard and still wrote outside the project: four create a file
// outside the tree, two overwrite an existing one. They are one defect —
// `join(checkedDirectory, myLeaf)` — so they are tested as one table.
const PROJECT_YML = 'schema_version: 1\nproject:\n  name: Victim\n  slug: victim\n  stage: active\n  status: in-progress\n  type: redesign\n  created_at: 2026-01-01\n';

function project(dir) {
	const root = join(dir, 'proj');
	const outside = join(dir, 'OUTSIDE');
	mkdirSync(join(root, '.project'), { recursive: true });
	mkdirSync(outside);
	writeFileSync(join(root, '.project', 'project.yml'), PROJECT_YML);
	return { root, outside };
}

const LEAF_ESCAPES = [
	{ name: 'metrics suggest', link: 'metrics', args: (root) => ['metrics', 'suggest', '--project-root', root, '--preset', 'redesign', '--write'] },
	{ name: 'metrics survey', link: 'follow-up', args: (root) => ['metrics', 'survey', '--period', '30-days', '--write', '--project-root', root] },
	{ name: 'project tasks', link: 'tasks.md', file: true, args: (root) => ['project', 'tasks', '--write', '--project-root', root] },
	{ name: 'project case-study', link: join('reports', 'case-study.md'), file: true, args: (root) => ['project', 'case-study', '--write', '--project-root', root] },
];

for (const esc of LEAF_ESCAPES) {
	test(`${esc.name} writes nothing through a symlinked .project/${esc.link}`, () => {
		const { dir, cleanup } = sandbox();
		try {
			const { root, outside } = project(dir);
			const target = esc.file ? join(outside, 'victim') : outside;
			if (esc.file) writeFileSync(target, 'ORIGINAL\n');
			mkdirSync(dirname(join(root, '.project', esc.link)), { recursive: true });
			symlinkSync(target, join(root, '.project', esc.link));

			const r = spawnSync(process.execPath, [INIT_CLI, ...esc.args(root)], { encoding: 'utf8' });
			assert.notEqual(r.status, 0, `${esc.name} must be refused`);
			assert.match(r.stdout + r.stderr, /refusing a path that resolves through a symlink/);
			if (esc.file) assert.equal(readFileSync(target, 'utf8'), 'ORIGINAL\n', 'the link target must be untouched');
			else assert.deepEqual(readdirSync(outside), [], 'nothing may be written outside the project');
		} finally {
			cleanup();
		}
	});
}

test('sync refuses a symlinked project record rather than following it', () => {
	// sync is one of the commands the containment work names, and its own
	// `.project/project.yml` write was still a plain join.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'OUTSIDE');
		mkdirSync(join(root, '.project'), { recursive: true });
		mkdirSync(outside);
		const stolen = join(outside, 'stolen.yml');
		writeFileSync(stolen, 'schema_version: 1\nstarter:\n  source_path: /nonexistent-old\n');
		symlinkSync(stolen, join(root, '.project', 'project.yml'));

		const r = spawnSync(
			process.execPath,
			[INIT_CLI, 'sync', '--project-root', root, '--futurebase-path', resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), '--repair-source-path'],
			{ encoding: 'utf8' },
		);
		assert.notEqual(r.status, 0);
		assert.match(r.stdout + r.stderr, /refusing a path that resolves through a symlink/);
		assert.match(readFileSync(stolen, 'utf8'), /nonexistent-old/, 'the record outside the project must be untouched');
	} finally {
		cleanup();
	}
});

test('a refusal is not swallowed by a best-effort catch', () => {
	// archive stamps project.yml inside a try/catch, because an unreadable config
	// should not block archiving. A config that is a SYMLINK is a different
	// claim, and swallowing it would turn the refusal back into a silent skip.
	const { dir, cleanup } = sandbox();
	try {
		const leads = join(dir, 'leads');
		const outside = join(dir, 'their-project.yml');
		mkdirSync(join(leads, 'acme'), { recursive: true });
		writeFileSync(outside, 'project:\n  status: won\n');
		symlinkSync(outside, join(leads, 'acme', 'project.yml'));

		const r = spawnSync(process.execPath, [INIT_CLI, 'lead', 'archive', 'acme', '--workspace-root', leads], { encoding: 'utf8' });
		assert.notEqual(r.status, 0);
		assert.equal(readFileSync(outside, 'utf8'), 'project:\n  status: won\n', 'the link target must be unchanged');
		assert.equal(existsSync(join(leads, 'acme', 'ARCHIVE.md')), false, 'the archive must not proceed past the refusal');
	} finally {
		cleanup();
	}
});

test('a refusal reports as a refusal, not as a crash', () => {
	// requirePath throws so an unchecked path cannot be used by accident. If that
	// throw reaches the entry point it prints a stack trace under exit 5, which
	// reads as a bug in the tool rather than the tool doing its job.
	const { dir, cleanup } = sandbox();
	try {
		const root = join(dir, 'proj');
		const outside = join(dir, 'elsewhere');
		mkdirSync(root);
		mkdirSync(outside);
		symlinkSync(outside, join(root, '.project'));

		const r = spawnSync(process.execPath, [INIT_CLI, 'baseline', 'init', '--project-root', root, '--json'], { encoding: 'utf8' });
		assert.equal(r.status, 4, 'an ACCESS_FAILURE, not the generic exit 5');
		assert.doesNotMatch(r.stdout + r.stderr, /\bat .*\.mjs:\d+/, 'no stack trace');
		assert.equal(JSON.parse(r.stdout).status, 'error', '--json must still get JSON');
	} finally {
		cleanup();
	}
});
