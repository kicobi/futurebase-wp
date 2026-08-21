// lib/sync.mjs — reconcile an active project with the starter it came from.
//
// A promoted project shares NO git history with the starter: `lead promote`
// uses the GitHub template flow, which squashes to a fresh initial commit. So
// starter fixes cannot reach a project through merge, rebase, or cherry-pick,
// and a wholesale copy would reintroduce `futurebase` literals across every
// renamed file. This module plans that flow one path at a time.
//
// Classification IS the safety model. The project has deliberately diverged —
// the theme slug is rewritten and the content belongs to the client — so only
// paths the rename contract guarantees are slug-free may be copied verbatim.
//
// Staleness is decided by CONTENT, never by the recorded provenance.
// `starter.template_commit` has been observed to be wrong (it records the local
// starter HEAD, which may sit on an unmerged branch, while GitHub templates the
// remote default branch), so nothing here depends on it being right.

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { managedRoot, symlinkFreePath } from './paths.mjs';
import { run } from './proc.mjs';

export const CLASS = {
	SAFE: 'safe', // starter-owned, slug-free by contract — copy verbatim
	DEPS: 'deps', // dependency layer — merged structurally, name fields preserved
	REVIEW: 'review', // slug-bearing or project-tuned — report the drift, never write
	NEVER: 'never', // the client's work — not even reported
};

// Workflows that test the STARTER itself rather than the project. Being
// slug-free is not sufficient for a file to be portable: the scorecard harness
// renders the starter's demo fixture and depends on its section-library
// patterns, which are never-class theme content — a client project has its own
// patterns, so the workflow fails on the next push. It is a regression gate for
// the starter's published numbers and has no meaning downstream.
const STARTER_ONLY = ['.github/workflows/scorecard.yml'];

// Futurebase WP's own product material. bin/rename-theme.sh DELETES these from a
// client during promotion, so reporting them as drift told the operator to port
// the product narrative — and the branded screenshot — back into a client theme.
// screenshot.png is the one that bites: it is what wp-admin shows under
// Appearance → Themes.
//
// Mirrors FUTUREBASE_PRODUCT_EXCLUSIONS in the shared rename contract;
// bin/test-rename.sh asserts the two lists are identical.
export const PRODUCT_ONLY = [
	'docs/futurebase-wp.md',
	'docs/futurebase-company-site.md',
	'docs/assets/futurebase-wp-social.png',
	'screenshot.png',
];

// The portable exceptions inside bin/. Everything else there is slug-bearing —
// rename rewrites the prefix and text domain into it — but these derive
// the theme slug at runtime from the pattern registry or style.css, and
// bin/test-rename.sh ASSERTS they contain no slug literal after a rename.
//
// Keeping them in the review class meant starter fixes never propagated: a
// project ran a stale demo-content.sh for weeks, missing the fix that activates
// the theme before resolving the fixture path, and its Scorecard had never once
// passed. Slug-bearing is a per-file property, not a per-directory one.
//
// bin/test-rename.sh imports this list and probes every entry, so the two
// cannot drift: adding a file here without its slug-free property holding fails
// the rename test. That assertion is what makes the claim true rather than
// merely intended — do not inline a copy of this list anywhere.
// The verifier is one executable closure. Shipping only the checker left an
// older client runner that never called it; shipping only the runner left it
// invoking absent support scripts. Keep the runner, checker, executable
// negative tests, and every script the runner directly invokes together.
export const VERIFIER_CLOSURE = [
	'bin/verify-theme.sh',
	'bin/_pm-detect.sh',
	'bin/audit-identity.sh',
	'bin/verify-version-surfaces.mjs',
	'bin/test-rename.sh',
	'bin/a11y-wp-env.sh',
	'bin/verify-contract.mjs',
	'bin/verify-contract.test.mjs',
];

export const PORTABLE_BIN = [
	'bin/_page-set.sh',
	'bin/_seo-plugin.sh',
	'bin/build-seo-plugin.sh',
	'bin/demo-content.sh',
	'bin/package-seo-plugin.sh',
	'bin/scorecard.sh',
	'bin/smoke-render.sh',
	'bin/smoke-render.php',
	'bin/test-seo-install.sh',
	'bin/test-seo-package.sh',
	...VERIFIER_CLOSURE,
];

// Configuration the portable scripts cannot run without. bin/scorecard.sh is
// CLASS.SAFE and copies verbatim, but the Lighthouse configs it passes to
// --config were review-class, so a client could receive a newer scorecard
// script without the files it invokes. Slug-free by inspection and asserted so
// by bin/test-rename.sh, exactly as PORTABLE_BIN is.
export const PORTABLE_CONFIG = ['lighthouserc-desktop.json', 'lighthouserc-mobile.json'];

// Ordered; first match wins.
const RULES = [
	// Checked before the workflow rule below, which would otherwise claim these.
	[CLASS.NEVER, (r) => STARTER_ONLY.includes(r) || PRODUCT_ONLY.includes(r)],

	// Starter-owned infrastructure. rename-theme.sh never scans tools/, and
	// test-rename.sh actively asserts that fixtures/ carry no slug literal
	// (they derive it at runtime). These are slug-free by contract, not by
	// inspection — which is what makes copying them verbatim safe.
	[CLASS.SAFE, (r) => r.startsWith('tools/')],
	[CLASS.SAFE, (r) => r.startsWith('.github/workflows/')],
	[CLASS.SAFE, (r) => r.startsWith('fixtures/')],
	[CLASS.SAFE, (r) => PORTABLE_BIN.includes(r) || PORTABLE_CONFIG.includes(r)],

	// Dependency layer. Slug-bearing only in name fields, so it is merged
	// field-by-field rather than copied.
	[CLASS.DEPS, (r) => ['package.json', 'package-lock.json', 'composer.json', 'composer.lock'].includes(r)],

	// The client's work, and generated output. Never touched, never reported.
	[CLASS.NEVER, (r) => r.startsWith('.project/')],
	[CLASS.NEVER, (r) => /^(patterns|templates|parts|inc|src|assets|languages|build|styles)\//.test(r)],
	[CLASS.NEVER, (r) => ['theme.json', 'style.css', 'functions.php', 'readme.txt'].includes(r)],
	[CLASS.NEVER, (r) => r.startsWith('node_modules/') || r.startsWith('vendor/')],
];

export function classifyPath(rel) {
	for (const [cls, match] of RULES) if (match(rel)) return cls;
	// Everything else — bin/, docs/, CLAUDE.md, phpcs.xml.dist, dotfiles — is
	// slug-bearing or project-tuned. Surface the drift; never write it.
	return CLASS.REVIEW;
}

// --- git helpers ------------------------------------------------------------

const git = (cwd, args) => run('git', args, { cwd });

export function resolveRef(starter, ref) {
	const r = git(starter, ['rev-parse', '--verify', `${ref}^{commit}`]);
	return r.ok ? r.stdout : null;
}

export function refSubject(starter, ref) {
	const r = git(starter, ['log', '-1', '--format=%h %ci %s', ref]);
	return r.ok ? r.stdout : null;
}

// Default ls-tree format: "<mode> <type> <object>\t<path>" — parsed rather than
// --format=, which needs a newer git than we can assume.
function parseTree(stdout) {
	const out = [];
	for (const line of (stdout || '').split('\n').filter(Boolean)) {
		const tab = line.indexOf('\t');
		if (tab < 0) continue;
		const [mode, , blob] = line.slice(0, tab).split(' ');
		out.push({ rel: line.slice(tab + 1), mode, blob });
	}
	return out;
}

// Every path at a revision, with the mode and blob git records for it.
//
// The mode is carried because git tracks a real bit there — 100644 vs 100755 —
// and dropping it lands the executable scripts in bin/ unrunnable. Taking it
// from the same listing that yields the blob also saves a rev-parse per file.
export function treeAt(starter, ref) {
	const r = git(starter, ['ls-tree', '-r', ref]);
	return r.ok ? parseTree(r.stdout) : [];
}

// Does git consider this path executable? Only two blob modes are possible in
// a tree (100644, 100755), so this is the whole of what a checkout must honour.
const wantsExec = (mode) => mode === '100755';

// Is the working file executable by anyone? Compared as a boolean rather than a
// full mode because umask legitimately varies between machines and git records
// nothing finer than the one bit.
function isExec(abs) {
	try {
		return (statSync(abs).mode & 0o111) !== 0;
	} catch {
		return false;
	}
}

// Blob SHA of a path at a revision, or null when the path does not exist there.
export function blobAt(starter, rev, rel) {
	const r = git(starter, ['rev-parse', '--verify', `${rev}:${rel}`]);
	return r.ok ? r.stdout : null;
}

export function textAt(starter, rev, rel) {
	const r = git(starter, ['show', `${rev}:${rel}`]);
	return r.ok ? r.stdout : null;
}

// Read a blob as raw bytes. `run()` decodes as utf8, which would corrupt the
// binary fixtures (e.g. fixtures/media/site-icon.png), so this goes direct.
export function blobBytes(starter, sha) {
	const r = spawnSync('git', ['cat-file', 'blob', sha], {
		cwd: starter,
		encoding: 'buffer',
		maxBuffer: 64 * 1024 * 1024,
	});
	return r.status === 0 ? r.stdout : null;
}

// git's blob SHA for a working file. Works outside a repo, so the project does
// not need to be a git checkout for sync to compare content.
export function hashFile(path) {
	const r = run('git', ['hash-object', path]);
	return r.ok ? r.stdout : null;
}

function themeTechnicalIdentity(styleCss) {
	const slug = /^Text Domain:\s*([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\s*$/im.exec(String(styleCss || ''))?.[1] ?? null;
	if (!slug) return null;
	const snake = slug.replaceAll('-', '_');
	return { slug, snake, upper: snake.toUpperCase() };
}

function themeDisplayName(styleCss) {
	return /^Theme Name:\s*(.+?)\s*$/im.exec(String(styleCss || ''))?.[1] ?? null;
}

function pascalSlug(slug) {
	return String(slug || '')
		.split('-')
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
		.join('');
}

function pluginTechnicalIdentity(themeIdentity, themeDisplay) {
	if (!themeIdentity || !themeDisplay) return null;
	const displayBase = themeIdentity.slug === 'futurebase' && themeDisplay === 'Futurebase WP' ? 'Futurebase' : themeDisplay;
	return {
		slug: `${themeIdentity.slug}-seo`,
		snake: `${themeIdentity.snake}_seo`,
		upper: `${themeIdentity.upper}_SEO`,
		display: `${displayBase} SEO`,
		namespace: `${pascalSlug(themeIdentity.slug)}\\SEO`,
	};
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateTechnicalIdentity(content, fromIdentity, toIdentity) {
	if (!fromIdentity || !toIdentity || fromIdentity.slug === toIdentity.slug) return String(content);
	const from = Object.fromEntries(Object.entries(fromIdentity).map(([key, value]) => [key, escapeRegExp(value)]));
	const to = toIdentity;
	let translated = String(content);

	// PHPCS uses the same bare value shape for its prefix and text-domain
	// properties, so the owning property is the only safe discriminator.
	translated = translated.replace(
		new RegExp(`(<property\\s+name="prefixes"[\\s\\S]*?<element\\s+value=")${from.snake}("\\s*\\/>[\\s\\S]*?<\\/property>)`, 'g'),
		`$1${to.snake}$2`,
	);
	translated = translated.replace(
		new RegExp(`(<property\\s+name="text_domain"[\\s\\S]*?<element\\s+value=")${from.slug}("\\s*\\/>[\\s\\S]*?<\\/property>)`, 'g'),
		`$1${to.slug}$2`,
	);

	// PHP/global prefixes, exact quoted slug literals, pattern namespaces,
	// package annotations, the Text Domain header, and the three registered
	// frontend asset handles are the rename contract's technical identity set.
	translated = translated.replace(new RegExp(`(?<![A-Za-z0-9])${from.snake}_`, 'g'), `${to.snake}_`);
	translated = translated.replace(new RegExp(`(?<![A-Za-z0-9])${from.upper}_`, 'g'), `${to.upper}_`);
	translated = translated.replace(new RegExp(`(['"\\x60])${from.slug}\\1`, 'g'), `$1${to.slug}$1`);
	translated = translated.replace(new RegExp(`(?<!/)${from.slug}/`, 'g'), `${to.slug}/`);
	translated = translated.replace(new RegExp(`/${from.slug}"`, 'g'), `/${to.slug}"`);
	translated = translated.replace(new RegExp(`\\b${from.slug}-(style|main|script)\\b`, 'g'), `${to.slug}-$1`);
	translated = translated.replace(new RegExp(`(@package\\s+)${from.slug}\\b`, 'g'), `$1${to.slug}`);
	translated = translated.replace(new RegExp(`(Text Domain:\\s*)${from.slug}\\b`, 'g'), `$1${to.slug}`);

	return translated;
}

// REVIEW files often differ solely because promotion renamed the theme. Undo
// only the same bounded technical contexts rename-theme.sh owns; display-name
// prose and unquoted client language deliberately remain untouched.
export function reverseNormalizeReviewIdentity(content, projectIdentity, starterIdentity) {
	return translateTechnicalIdentity(content, projectIdentity, starterIdentity);
}

function translatePluginTechnicalIdentity(content, fromIdentity, toIdentity) {
	if (!fromIdentity || !toIdentity || fromIdentity.slug === toIdentity.slug) return String(content);
	const from = Object.fromEntries(Object.entries(fromIdentity).map(([key, value]) => [key, escapeRegExp(value)]));
	const to = toIdentity;
	let translated = String(content);

	translated = translated.replace(new RegExp(`(?<![A-Za-z0-9])${from.snake}_`, 'g'), `${to.snake}_`);
	translated = translated.replace(new RegExp(`(?<![A-Za-z0-9])${from.upper}_`, 'g'), `${to.upper}_`);
	translated = translated.replace(new RegExp(`(['"\\x60])${from.slug}\\1`, 'g'), `$1${to.slug}$1`);
	translated = translated.replace(new RegExp(`plugins/${from.slug}`, 'g'), `plugins/${to.slug}`);
	translated = translated.replace(new RegExp(`\\b${from.slug}-(editor|admin|settings)\\b`, 'g'), `${to.slug}-$1`);
	translated = translated.replace(new RegExp(`(@package\\s+)${from.slug}\\b`, 'g'), `$1${to.slug}`);
	translated = translated.replace(new RegExp(`(Text Domain:\\s*)${from.slug}\\b`, 'g'), `$1${to.slug}`);
	translated = translated.replace(new RegExp(`(namespace\\s+)${from.namespace}(;)`, 'g'), `$1${to.namespace}$2`);
	translated = translated.replace(new RegExp(`(use\\s+)${from.namespace}(\\\\|;)`, 'g'), `$1${to.namespace}$2`);
	translated = translated.replace(new RegExp(`(Plugin Name:\\s*)${from.display}(\\s*)$`, 'gm'), `$1${to.display}$2`);
	translated = translated.replace(new RegExp(`^=== ${from.display} ===$`, 'gm'), `=== ${to.display} ===`);
	translated = translated.replace(new RegExp(`^# ${from.display}$`, 'gm'), `# ${to.display}`);

	return translated;
}

export function reverseNormalizePluginReviewIdentity(content, projectIdentity, starterIdentity) {
	return translatePluginTechnicalIdentity(content, projectIdentity, starterIdentity);
}

export function mapReviewPath(rel, projectIdentity, starterIdentity) {
	if (!projectIdentity || !starterIdentity) return rel;
	const starterPrefix = `plugins/${starterIdentity.slug}/`;
	if (!rel.startsWith(starterPrefix)) return rel;
	const tail = rel.slice(starterPrefix.length);
	const projectTail = tail === `${starterIdentity.slug}.php` ? `${projectIdentity.slug}.php` : tail;
	return `plugins/${projectIdentity.slug}/${projectTail}`;
}

// Has this exact content ever been the upstream version of this path?
//
// This is what separates "the project is simply behind" from "someone edited a
// starter-owned file here". A stale copy always matches SOME point in upstream
// history; a local edit matches none. It avoids needing a single correct base
// commit, which is precisely the thing that cannot be trusted.
export function isKnownUpstreamVersion(starter, ref, rel, blob, limit = 80) {
	if (!blob) return false;
	const r = git(starter, ['rev-list', `--max-count=${limit}`, ref, '--', rel]);
	if (!r.ok || !r.stdout) return false;
	for (const commit of r.stdout.split('\n').filter(Boolean)) {
		if (blobAt(starter, commit, rel) === blob) return true;
	}
	return false;
}

// verify-theme.sh became SAFE only after its last rename-sensitive reference
// was removed. A client promoted from the earlier runner therefore has one
// deterministic project-prefix substitution even when nobody edited it. This
// is a one-time classification migration, not SAFE-file normalization: derive
// the exact bytes the historical promotion produced and require an exact match.
// A genuinely edited runner still matches no upstream-derived version and
// remains a conflict.
function isKnownPromotedVerifierRunner(starter, ref, rel, projectRoot, projectIdentity, limit = 80) {
	if (rel !== 'bin/verify-theme.sh' || !projectIdentity) return false;
	const projectBytes = readFileSync(join(projectRoot, rel));
	if (projectBytes.includes(0)) return false;
	const projectDisplay = themeDisplayName(readFileSync(join(projectRoot, 'style.css'), 'utf8'));
	const commits = git(starter, ['rev-list', `--max-count=${limit}`, ref, '--', rel]);
	if (!commits.ok || !commits.stdout) return false;
	for (const commit of commits.stdout.split('\n').filter(Boolean)) {
		const historical = blobBytes(starter, blobAt(starter, commit, rel));
		const historicalStyle = textAt(starter, commit, 'style.css');
		const historicalIdentity = themeTechnicalIdentity(historicalStyle);
		const historicalDisplay = themeDisplayName(historicalStyle);
		if (!historical || historical.includes(0)) continue;
		let promoted = translateTechnicalIdentity(historical.toString('utf8'), historicalIdentity, projectIdentity);
		// The historical rename also replaced the full template display name.
		// This is deliberately absent from REVIEW normalization, where prose is
		// client-owned; here it is part of reproducing one exact old promotion.
		if (historicalDisplay && projectDisplay) promoted = promoted.replaceAll(historicalDisplay, projectDisplay);
		if (promoted === projectBytes.toString('utf8')) return true;
	}
	return false;
}

// --- plan -------------------------------------------------------------------

// States: up-to-date | add | update | conflict | upstream-deleted
export function planFiles({ projectRoot, starter, ref, only }) {
	const entries = [];
	const upstream = treeAt(starter, ref);
	const upstreamSet = new Set(upstream.map((e) => e.rel));
	const projectStyle = existsSync(join(projectRoot, 'style.css')) ? readFileSync(join(projectRoot, 'style.css'), 'utf8') : null;
	const projectIdentity = themeTechnicalIdentity(projectStyle);
	const starterIdentity = themeTechnicalIdentity(textAt(starter, ref, 'style.css'));
	const projectPluginIdentity = pluginTechnicalIdentity(projectIdentity, themeDisplayName(projectStyle));
	const starterStyle = textAt(starter, ref, 'style.css');
	const starterPluginIdentity = pluginTechnicalIdentity(starterIdentity, themeDisplayName(starterStyle));

	for (const { rel, mode, blob: starterBlob } of upstream) {
		const cls = classifyPath(rel);
		if (cls === CLASS.NEVER || cls === CLASS.DEPS) continue;
		if (only && cls !== only) continue;

		const projectRel = cls === CLASS.REVIEW ? mapReviewPath(rel, projectPluginIdentity, starterPluginIdentity) : rel;
		const abs = join(projectRoot, projectRel);

		if (!existsSync(abs)) {
			entries.push({ rel: projectRel, cls, state: 'add', starterBlob, mode });
			continue;
		}
		const projectBlob = hashFile(abs);
		if (projectBlob && projectBlob === starterBlob) {
			// Content agrees; the executable bit still may not. A project synced
			// before applyEntry carried the mode has the scripts in bin/ present
			// and current but unrunnable, and comparing content alone would call
			// that in sync forever. Re-copying is how the mode gets repaired.
			if (isExec(abs) === wantsExec(mode)) {
				entries.push({ rel: projectRel, cls, state: 'up-to-date' });
			} else {
				const note = `content matches — mode only (${wantsExec(mode) ? 'not executable → executable' : 'executable → not executable'})`;
				entries.push({ rel: projectRel, cls, state: 'update', starterBlob, projectBlob, mode, note });
			}
			continue;
		}
		if (cls === CLASS.REVIEW && projectIdentity && starterIdentity && isExec(abs) === wantsExec(mode)) {
			const starterBytes = blobBytes(starter, starterBlob);
			const projectBytes = readFileSync(abs);
			// Identity-aware comparison is text-only. A NUL marks an opaque file;
			// those keep the existing byte-for-byte review behavior.
			if (starterBytes && !starterBytes.includes(0) && !projectBytes.includes(0)) {
				let normalized = reverseNormalizeReviewIdentity(projectBytes.toString('utf8'), projectIdentity, starterIdentity);
				normalized = reverseNormalizePluginReviewIdentity(normalized, projectPluginIdentity, starterPluginIdentity);
				if (normalized === starterBytes.toString('utf8')) {
					entries.push({ rel: projectRel, cls, state: 'up-to-date' });
					continue;
				}
			}
		}
		const stale =
			isKnownUpstreamVersion(starter, ref, rel, projectBlob) ||
			(cls === CLASS.SAFE && isKnownPromotedVerifierRunner(starter, ref, rel, projectRoot, projectIdentity));
		entries.push({ rel: projectRel, cls, state: stale ? 'update' : 'conflict', starterBlob, projectBlob, mode });
	}

	// Files the starter has since removed. Reported, never deleted — removing
	// files from a client project is not a call this command should make.
	for (const rel of safeFiles(projectRoot)) {
		if (upstreamSet.has(rel)) continue;
		if (only && only !== CLASS.SAFE) continue;
		entries.push({ rel, cls: CLASS.SAFE, state: 'upstream-deleted' });
	}

	return entries;
}

// The only trees SAFE paths can live in. Walking just these keeps the project
// inventory cheap instead of crawling the whole checkout. `bin` is included for
// the PORTABLE_BIN exceptions — everything else under it classifies as review
// and is filtered out on both sides of any comparison.
export const SAFE_ROOTS = ['tools', '.github/workflows', 'fixtures', 'bin'];

// Every SAFE-class file in the project, relative-path sorted.
export function safeFiles(root) {
	const SKIP = new Set(['node_modules', 'vendor', '.git', 'build']);
	const acc = [];
	const walk = (base) => {
		let entries;
		try {
			entries = readdirSync(join(root, base));
		} catch {
			return;
		}
		for (const name of entries.sort()) {
			if (SKIP.has(name)) continue;
			const rel = `${base}/${name}`;
			let st;
			try {
				// lstat, not stat: a symlinked directory here would walk outside
				// the project and report foreign files as its own SAFE
				// inventory, which then feeds provenance detection. Symlink
				// cycles would also recurse until the stack gave out.
				st = lstatSync(join(root, rel));
			} catch {
				continue;
			}
			if (st.isSymbolicLink()) continue;
			if (st.isDirectory()) walk(rel);
			else if (classifyPath(rel) === CLASS.SAFE) acc.push(rel);
		}
	};
	for (const r of SAFE_ROOTS) {
		const abs = join(root, r);
		try {
			const st = lstatSync(abs);
			if (st.isDirectory() && !st.isSymbolicLink()) walk(r);
		} catch {
			/* absent and unreadable roots contribute no portable files */
		}
	}
	return acc;
}

// --- dependency layer -------------------------------------------------------

function detectIndent(text) {
	const m = text.match(/\n([ \t]+)"/);
	return m ? m[1] : '\t';
}

function serialize(obj, indent) {
	return JSON.stringify(obj, null, indent) + '\n';
}

// Merge dependency blocks with the starter winning on shared entries, while
// preserving anything the project added.
//
// Deliberately NOT a wholesale replacement: a project may legitimately add its
// own dependency, and replacing the block would silently delete it. The cost is
// that an entry the starter has since dropped lingers here — a far cheaper
// failure than removing a dependency the client's site needs.
// Merged dependency blocks are re-sorted. `lint:pkg` (wp-scripts lint-pkg-json)
// enforces alphabetical order and runs in client CI, so a merge that appended an
// upstream dependency turned every client's build red until someone re-sorted the
// block by hand.
function unionKeys(target, source, keys) {
	for (const k of keys) {
		if (!source || !Object.prototype.hasOwnProperty.call(source, k)) continue;
		const merged = { ...(target[k] || {}), ...source[k] };
		target[k] = Object.fromEntries(Object.keys(merged).sort().map((name) => [name, merged[name]]));
	}
	return target;
}

// `.github/workflows/` is CLASS.SAFE, so a workflow copies over verbatim — but
// what it CALLS does not travel with it. The `npm run <name>` targets live in
// package.json, whose `scripts` block is never merged (only the dependency
// blocks are), and the bin/ files behind them are review-class hand-ports. A
// project promoted from an older template therefore receives CI referencing
// scripts it does not define, and finds out when the run fails.
//
// Pure so it can be tested without a repository: callers pass the upstream
// workflow texts and the project's own scripts block.
export function missingWorkflowScripts(workflowTexts, projectScripts) {
	const referenced = new Set();
	for (const text of workflowTexts) {
		for (const match of String(text || '').matchAll(/npm run ([a-z0-9][a-z0-9:_-]*)/gi)) referenced.add(match[1]);
	}
	const have = projectScripts || {};
	return [...referenced].filter((name) => !Object.prototype.hasOwnProperty.call(have, name)).sort();
}

// Dependency names the project has that upstream does not. Their presence makes
// adopting the starter's lockfile unsafe: the lock would not contain them, so a
// clean install would drop them.
export function projectOnlyDeps(projectManifest, starterManifest, keys) {
	const extra = [];
	for (const k of keys) {
		const mine = projectManifest[k] || {};
		const theirs = starterManifest[k] || {};
		for (const name of Object.keys(mine)) if (!(name in theirs)) extra.push(`${k}.${name}`);
	}
	return extra;
}

// Compute the proposed content for each dependency file. Returns entries with
// `next` (the full new text) so the caller can diff, report, and write without
// recomputing. Name/description/repository/author fields are never touched.
export function planDeps({ projectRoot, starter, ref }) {
	const entries = [];
	// `equals` lets a file define what "already in sync" means. composer.lock
	// needs it: its content-hash is derived from composer.json, which always
	// differs here (the project keeps its own package name), so a byte compare
	// would report drift forever and re-propose the same file on every run.
	const propose = (rel, next, equals) => {
		const abs = join(projectRoot, rel);
		const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
		if (next == null) return;
		const same = current != null && (equals ? equals(current, next) : current === next);
		if (same) entries.push({ rel, cls: CLASS.DEPS, state: 'up-to-date' });
		else entries.push({ rel, cls: CLASS.DEPS, state: current == null ? 'add' : 'update', next });
	};

	// Two composer locks describe the same dependency set when they agree on
	// everything except the composer.json-derived hash.
	const sameLockContent = (a, b) => {
		try {
			const strip = (t) => {
				const o = JSON.parse(t);
				delete o['content-hash'];
				return JSON.stringify(o);
			};
			return strip(a) === strip(b);
		} catch {
			return false;
		}
	};

	const NPM_KEYS = ['dependencies', 'devDependencies', 'overrides'];
	const COMPOSER_KEYS = ['require', 'require-dev'];

	// package.json — merge only the dependency-governing blocks.
	const pkgRaw = existsSync(join(projectRoot, 'package.json')) ? readFileSync(join(projectRoot, 'package.json'), 'utf8') : null;
	const upPkgRaw = textAt(starter, ref, 'package.json');
	let projectPkgName = null;
	let projectPkgVersion = null;
	let npmExtra = [];
	if (pkgRaw && upPkgRaw) {
		const pkg = JSON.parse(pkgRaw);
		const up = JSON.parse(upPkgRaw);
		projectPkgName = pkg.name;
		projectPkgVersion = pkg.version;
		npmExtra = projectOnlyDeps(pkg, up, NPM_KEYS);
		propose('package.json', serialize(unionKeys({ ...pkg }, up, NPM_KEYS), detectIndent(pkgRaw)));
	}

	// package-lock.json — adopt upstream wholesale, then restore the project's
	// own package name and version. Bumping the manifest alone is not enough: an
	// incremental install keeps previously pinned transitive versions, so the
	// advisories Futurebase already fixed survive. Four root-package fields are
	// client-owned; package.json is authoritative for all four.
	//
	// Guarded: if the project declares a dependency upstream does not have, the
	// starter's lock cannot describe this project, and adopting it would drop
	// that package on the next clean install.
	const upLockRaw = textAt(starter, ref, 'package-lock.json');
	if (upLockRaw) {
		const missingLockIdentity = [
			!projectPkgName && 'name',
			!projectPkgVersion && 'version',
		].filter(Boolean);
		if (missingLockIdentity.length) {
			entries.push({
				rel: 'package-lock.json',
				cls: CLASS.DEPS,
				state: 'blocked',
				note: `client package.json is missing lockfile identity field(s): ${missingLockIdentity.join(', ')} — add the missing field(s) and rerun sync`,
			});
		} else if (npmExtra.length) {
			entries.push({ rel: 'package-lock.json', cls: CLASS.DEPS, state: 'blocked', note: `project-only dependencies (${npmExtra.join(', ')}) — run npm install --package-lock-only after reconciling the manifest` });
		} else {
			const lock = JSON.parse(upLockRaw);
			lock.name = projectPkgName;
			lock.version = projectPkgVersion;
			if (lock.packages && lock.packages['']) {
				lock.packages[''].name = projectPkgName;
				lock.packages[''].version = projectPkgVersion;
			}
			propose('package-lock.json', serialize(lock, detectIndent(upLockRaw)));
		}
	}

	// composer.json — same treatment; the vendor/name field stays the project's.
	const compRaw = existsSync(join(projectRoot, 'composer.json')) ? readFileSync(join(projectRoot, 'composer.json'), 'utf8') : null;
	const upCompRaw = textAt(starter, ref, 'composer.json');
	let composerExtra = [];
	if (compRaw && upCompRaw) {
		const comp = JSON.parse(compRaw);
		const up = JSON.parse(upCompRaw);
		composerExtra = projectOnlyDeps(comp, up, COMPOSER_KEYS);
		propose('composer.json', serialize(unionKeys({ ...comp }, up, COMPOSER_KEYS), detectIndent(compRaw)));
	}

	// composer.lock — same subset guard. Its `content-hash` is derived from
	// composer.json including the package `name`, which is always the project's
	// own, so the adopted lock is inevitably "out of date" until composer
	// rewrites the hash. The command reconciles that after applying.
	const upCompLock = textAt(starter, ref, 'composer.lock');
	if (upCompLock != null) {
		if (composerExtra.length) {
			entries.push({ rel: 'composer.lock', cls: CLASS.DEPS, state: 'blocked', note: `project-only requirements (${composerExtra.join(', ')}) — run composer update after the manifest merge` });
		} else {
			// Carry over the project's existing content-hash so the written file
			// is stable; the command reconciles it with composer afterwards.
			let next = upCompLock.endsWith('\n') ? upCompLock : upCompLock + '\n';
			const curPath = join(projectRoot, 'composer.lock');
			if (existsSync(curPath)) {
				try {
					const cur = JSON.parse(readFileSync(curPath, 'utf8'));
					const up = JSON.parse(upCompLock);
					if (cur['content-hash']) up['content-hash'] = cur['content-hash'];
					next = serialize(up, detectIndent(upCompLock));
				} catch {
					/* fall back to the upstream text verbatim */
				}
			}
			propose('composer.lock', next, sameLockContent);
		}
	}

	return entries;
}

// --- apply ------------------------------------------------------------------

export function applyEntry(entry, { projectRoot, starter }) {
	// entry.rel is slug-free and free of `..` — it comes from a git tree or a
	// class-filtered walk — but that is not enough to keep the write inside the
	// project. If any component on the way is a symlink, join() still produces a
	// contained-looking string while the filesystem resolves it elsewhere, and
	// writeFileSync follows it out of the root. Resolve through the real path
	// and refuse rather than write blind.
	//
	// The previous resolver realpath'd the deepest EXISTING ancestor, which meant
	// a dangling final symlink — `.github/workflows/ci.yml -> ../../../../ci.yml`,
	// pointing at nothing yet — looked like a path that simply did not exist. Its
	// parent was inside the project, so the write was allowed, and writeFileSync
	// then created the file the link pointed at. lstat sees the link whether or
	// not it resolves; realpath cannot.
	//
	// Refusal is per entry rather than fatal: the caller reports it in `failed`,
	// so one odd path does not abandon the rest of the sync.
	const abs = symlinkFreePath(managedRoot(projectRoot), entry.rel);
	if (abs === null) return false;
	mkdirSync(dirname(abs), { recursive: true });

	if (entry.cls === CLASS.DEPS) {
		writeFileSync(abs, entry.next, 'utf8');
		return true;
	}
	const bytes = blobBytes(starter, entry.starterBlob);
	if (bytes == null) return false;
	writeFileSync(abs, bytes);

	// Neither write path gets the mode right on its own: writeFileSync creates a
	// new file at the umask default (never executable) and leaves an existing
	// file's mode alone. bin/ is the first SAFE class holding scripts that are
	// executed directly, so an added demo-content.sh would arrive unrunnable and
	// bin/smoke-render.sh's call into it would die on "Permission denied".
	if (entry.mode) chmodSync(abs, wantsExec(entry.mode) ? 0o755 : 0o644);
	return true;
}

// --- provenance -------------------------------------------------------------

// Is the recorded commit actually part of the ref's history? Today's promotion
// bug produces a commit that is reachable in the starter but sits on an
// unmerged branch, so this is the cheap tell.
export function isAncestor(starter, commit, ref) {
	if (!commit) return null;
	const exists = git(starter, ['cat-file', '-e', `${commit}^{commit}`]);
	if (!exists.ok) return null; // unknown object — cannot judge
	return git(starter, ['merge-base', '--is-ancestor', commit, ref]).ok;
}

// Newest upstream commit whose SAFE-class tree matches this project exactly —
// same file set, same content.
//
// Sampling a few marker files is not enough: between two commits those markers
// may be untouched, so a sampled match happily returns the newest commit even
// when the project is missing everything a later commit added. The whole point
// of repairing provenance is to name the commit the project actually contains,
// and a confidently wrong answer is worse than none — so compare the full set
// and return null when nothing matches.
export function detectBase(starter, ref, projectRoot, { limit = 300 } = {}) {
	const mine = new Map();
	for (const rel of safeFiles(projectRoot)) {
		const h = hashFile(join(projectRoot, rel));
		if (h) mine.set(rel, h);
	}
	if (!mine.size) return null;

	const commits = git(starter, ['rev-list', `--max-count=${limit}`, ref]);
	if (!commits.ok || !commits.stdout) return null;

	for (const commit of commits.stdout.split('\n').filter(Boolean)) {
		const r = git(starter, ['ls-tree', '-r', commit, '--', ...SAFE_ROOTS]);
		if (!r.ok) continue;
		const theirs = new Map();
		for (const { rel, blob } of parseTree(r.stdout)) {
			// SAFE_ROOTS is a walk hint, not a classification: `bin` holds mostly
			// review-class scripts. Filter both sides by class or the comparison
			// never matches and provenance repair silently returns null.
			if (classifyPath(rel) !== CLASS.SAFE) continue;
			theirs.set(rel, blob);
		}
		if (theirs.size !== mine.size) continue;
		let match = true;
		for (const [rel, blob] of mine) {
			if (theirs.get(rel) !== blob) {
				match = false;
				break;
			}
		}
		if (match) return commit;
	}
	return null;
}
