// lib/sync.mjs — reconcile an active project with the starter it came from.
//
// A promoted project shares NO git history with the starter: `lead promote`
// uses the GitHub template flow, which squashes to a fresh initial commit. So
// starter fixes cannot reach a project through merge, rebase, or cherry-pick,
// and a wholesale copy would reintroduce `wp-starter` literals across every
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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { run } from './proc.mjs';

export const CLASS = {
	SAFE: 'safe', // starter-owned, slug-free by contract — copy verbatim
	DEPS: 'deps', // dependency layer — merged structurally, name fields preserved
	REVIEW: 'review', // slug-bearing or project-tuned — report the drift, never write
	NEVER: 'never', // the client's work — not even reported
};

// Ordered; first match wins.
const RULES = [
	// Starter-owned infrastructure. rename-theme.sh never scans tools/, and
	// test-rename.sh actively asserts that fixtures/ carry no slug literal
	// (they derive it at runtime). These are slug-free by contract, not by
	// inspection — which is what makes copying them verbatim safe.
	[CLASS.SAFE, (r) => r.startsWith('tools/')],
	[CLASS.SAFE, (r) => r.startsWith('.github/workflows/')],
	[CLASS.SAFE, (r) => r.startsWith('fixtures/')],

	// Dependency layer. Slug-bearing only in name fields, so it is merged
	// field-by-field rather than copied.
	[CLASS.DEPS, (r) => ['package.json', 'package-lock.json', 'composer.json', 'composer.lock'].includes(r)],

	// The client's work, and generated output. Never touched, never reported.
	[CLASS.NEVER, (r) => r.startsWith('.project/')],
	[CLASS.NEVER, (r) => /^(patterns|templates|parts|inc|src|assets|languages|build|styles)\//.test(r)],
	[CLASS.NEVER, (r) => ['theme.json', 'style.css', 'functions.php'].includes(r)],
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

export function filesAt(starter, ref) {
	const r = git(starter, ['ls-tree', '-r', '--name-only', ref]);
	return r.ok && r.stdout ? r.stdout.split('\n').filter(Boolean) : [];
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

// --- plan -------------------------------------------------------------------

// States: up-to-date | add | update | conflict | upstream-deleted
export function planFiles({ projectRoot, starter, ref, only }) {
	const entries = [];
	const upstream = filesAt(starter, ref);
	const upstreamSet = new Set(upstream);

	for (const rel of upstream) {
		const cls = classifyPath(rel);
		if (cls === CLASS.NEVER || cls === CLASS.DEPS) continue;
		if (only && cls !== only) continue;

		const abs = join(projectRoot, rel);
		const starterBlob = blobAt(starter, ref, rel);

		if (!existsSync(abs)) {
			entries.push({ rel, cls, state: 'add', starterBlob });
			continue;
		}
		const projectBlob = hashFile(abs);
		if (projectBlob && projectBlob === starterBlob) {
			entries.push({ rel, cls, state: 'up-to-date' });
			continue;
		}
		const stale = isKnownUpstreamVersion(starter, ref, rel, projectBlob);
		entries.push({ rel, cls, state: stale ? 'update' : 'conflict', starterBlob, projectBlob });
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
// inventory cheap instead of crawling the whole checkout.
export const SAFE_ROOTS = ['tools', '.github/workflows', 'fixtures'];

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
				st = statSync(join(root, rel));
			} catch {
				continue;
			}
			if (st.isDirectory()) walk(rel);
			else if (classifyPath(rel) === CLASS.SAFE) acc.push(rel);
		}
	};
	for (const r of SAFE_ROOTS) if (existsSync(join(root, r))) walk(r);
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
function unionKeys(target, source, keys) {
	for (const k of keys) {
		if (!source || !Object.prototype.hasOwnProperty.call(source, k)) continue;
		target[k] = { ...(target[k] || {}), ...source[k] };
	}
	return target;
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
	let npmExtra = [];
	if (pkgRaw && upPkgRaw) {
		const pkg = JSON.parse(pkgRaw);
		const up = JSON.parse(upPkgRaw);
		projectPkgName = pkg.name;
		npmExtra = projectOnlyDeps(pkg, up, NPM_KEYS);
		propose('package.json', serialize(unionKeys({ ...pkg }, up, NPM_KEYS), detectIndent(pkgRaw)));
	}

	// package-lock.json — adopt upstream wholesale, then restore the project's
	// own package name. Bumping the manifest alone is not enough: an
	// incremental install keeps previously pinned transitive versions, so the
	// advisories the starter already fixed survive. Only two fields are
	// slug-bearing.
	//
	// Guarded: if the project declares a dependency upstream does not have, the
	// starter's lock cannot describe this project, and adopting it would drop
	// that package on the next clean install.
	const upLockRaw = textAt(starter, ref, 'package-lock.json');
	if (upLockRaw && projectPkgName) {
		if (npmExtra.length) {
			entries.push({ rel: 'package-lock.json', cls: CLASS.DEPS, state: 'blocked', note: `project-only dependencies (${npmExtra.join(', ')}) — run npm install after the manifest merge` });
		} else {
			const lock = JSON.parse(upLockRaw);
			lock.name = projectPkgName;
			if (lock.packages && lock.packages['']) lock.packages[''].name = projectPkgName;
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
	const abs = join(projectRoot, entry.rel);
	mkdirSync(dirname(abs), { recursive: true });

	if (entry.cls === CLASS.DEPS) {
		writeFileSync(abs, entry.next, 'utf8');
		return true;
	}
	const bytes = blobBytes(starter, entry.starterBlob);
	if (bytes == null) return false;
	writeFileSync(abs, bytes);
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
		// Default ls-tree format: "<mode> <type> <object>\t<path>" — parsed
		// rather than --format=, which needs a newer git than we can assume.
		const r = git(starter, ['ls-tree', '-r', commit, '--', ...SAFE_ROOTS]);
		if (!r.ok) continue;
		const theirs = new Map();
		for (const line of r.stdout.split('\n').filter(Boolean)) {
			const tab = line.indexOf('\t');
			if (tab < 0) continue;
			theirs.set(line.slice(tab + 1), line.slice(0, tab).split(' ')[2]);
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
