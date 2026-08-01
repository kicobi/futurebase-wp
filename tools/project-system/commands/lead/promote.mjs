// commands/lead/promote.mjs — promote an awarded lead into an active project.
//
// Wraps the EXISTING project-creation flow (gh template + `npm run rename`) —
// it does not introduce a second method and does not reimplement rename. The
// lead workspace is left byte-for-byte unchanged until the promotion commit
// succeeds; only then is its status metadata updated (never deleted or moved).
//
// futurebase lead promote <slug> [--org <o>] [--name <n>] [--dest <path>]
//     [--template <owner/repo>] [--dry-run] [--confirm] [--resume] [--reuse-remote]
//     [--skip-secret-scan] [--json] [--non-interactive] [--starter-path <p>]

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../../lib/output.mjs';
import { isValidSlug } from '../../lib/slug.mjs';
import { leadDir, starterRoot, symlinkFreePath, templatesDir } from '../../lib/paths.mjs';
import { readYaml, writeYaml } from '../../lib/yaml.mjs';
import { validateProject } from '../../lib/validate.mjs';
import { run, have, gitHead, isGitRepo, ghRepoExists } from '../../lib/proc.mjs';
import { scanFiles } from '../../lib/secret-scan.mjs';

const DEFAULT_ORG = 'kicobi';
const DEFAULT_TEMPLATE = 'kicobi/futurebase-wp';
const LEGACY_TEMPLATE = 'studiokicobi/wp-starter';
const DEFAULT_THEME_URI = 'https://kicobi.com';
const PROJECT_DIRS = ['brief', 'analysis', 'proposal', 'decisions', 'metrics', 'baseline', 'final', 'reports', 'follow-up'];
// The checkpoint survives until AFTER the promotion commit, so that a commit
// failure is still resumable — which makes the ignore line load-bearing rather
// than belt-and-braces: it is what keeps `git add -A` from committing the
// checkpoint into the project's first commit.
const GITIGNORE_LINES = [
	'.project/private/',
	'.project/credentials/',
	'.project/auth/',
	'.project/**/raw-private/',
	'.futurebase-promotion.json',
	'.wp-starter-promotion.json',
];

// --- dossier manifest -------------------------------------------------------
//
// lstat, never stat. This manifest decides what gets copied into a real client
// repository and what the secret scanner examines, so a symlinked directory in
// the lead workspace would pull arbitrary files from elsewhere on disk into
// both — committed to a remote, having been classified by a `rel` path that
// describes where the link sat rather than where it pointed. Symlink cycles
// would also recurse without bound. A dossier is authored content; it has no
// legitimate need for links.
// Symlinks are collected into `links` rather than dropped, so promotion can say
// what it refused to carry instead of silently shipping less than the author
// staged.
function listFiles(root, base = '', acc = [], links = []) {
	for (const entry of readdirSync(join(root, base)).sort()) {
		const rel = base ? `${base}/${entry}` : entry;
		let st;
		try {
			st = lstatSync(join(root, rel));
		} catch {
			continue;
		}
		if (st.isSymbolicLink()) {
			links.push(rel);
			continue;
		}
		if (st.isDirectory()) listFiles(root, rel, acc, links);
		else if (st.isFile()) acc.push(rel);
	}
	return acc;
}

// Filesystem and editor droppings. These were classing as `versioned` and being
// committed into every promoted client repo — invisible until the secret scan
// started failing closed on binaries and .DS_Store became the first thing it
// caught. Excluding them is the fix; the scan finding was the symptom.
const CRUFT = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\.Spotlight-V100|\.Trashes|\._[^/]+)$/;

// Exported for test/guards.test.mjs: this function decides what lands in a real
// client repository, which is not a judgement that should go unasserted.
export function classify(rel) {
	if (rel === 'project.yml') return 'regenerated'; // we write a fresh active one
	if (['CLAUDE.md', 'AGENTS.md', 'SKELETON.md'].includes(rel)) return 'excluded'; // lead-stage instructions
	if (rel.startsWith('notes/')) return 'excluded';
	if (/(^|\/)\.env(\..*)?$/.test(rel)) return 'excluded';
	if (CRUFT.test(rel)) return 'excluded';
	if (rel.startsWith('brief/attachments/private/') || rel.includes('/raw-private/')) return 'private';
	return 'versioned';
}

// --- promotion checkpoint ----------------------------------------------------
//
// `--resume` used to accept any non-empty directory that happened to be a git
// repo, and treated any text domain other than the starter's as "already
// renamed". Those two together meant a resume could adopt an UNRELATED
// repository: reuse it, skip the rename, inject .project/, and commit a
// successful promotion over someone else's project.
//
// So promotion leaves a checkpoint the moment it creates the repo, and resume
// refuses anything that does not match it. This is identity, not progress —
// the steps are already individually idempotent; what was missing was any
// assurance that the thing being resumed into is the thing we created.
export const CHECKPOINT_FILE = '.futurebase-promotion.json';
export const LEGACY_CHECKPOINT_FILE = '.wp-starter-promotion.json';

export function templateNamesEquivalent(left, right) {
	if (typeof left !== 'string' || typeof right !== 'string') return false;
	const a = left.toLowerCase();
	const b = right.toLowerCase();
	if (a === b) return true;
	return new Set([a, b]).size === 2 && [a, b].every((value) => value === DEFAULT_TEMPLATE || value === LEGACY_TEMPLATE);
}

function writeCheckpoint(dest, data) {
	const path = symlinkFreePath(dest, CHECKPOINT_FILE);
	if (!path) throw new Error(`checkpoint path contains a symlink: ${join(dest, CHECKPOINT_FILE)}`);
	writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readCheckpoint(dest) {
	for (const filename of [CHECKPOINT_FILE, LEGACY_CHECKPOINT_FILE]) {
		try {
			const path = symlinkFreePath(dest, filename);
			if (path && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
		} catch {
			return null;
		}
	}
	return null;
}

// Why this destination may not be resumed, or null when it may. Exported so the
// rule is testable without driving a real promotion.
export function checkpointMismatch(cp, { slug, dest, remote, template }) {
	if (!cp) return `no promotion checkpoint (${CHECKPOINT_FILE}) — this directory was not created by promoting a lead`;
	if (cp.kind !== 'promotion-checkpoint') return `${CHECKPOINT_FILE} is not a promotion checkpoint`;
	if (cp.lead_slug !== slug) return `checkpoint belongs to lead "${cp.lead_slug}", not "${slug}"`;
	if (cp.dest !== dest) return `checkpoint records destination ${cp.dest}, not ${dest}`;
	if (cp.remote !== remote) return `checkpoint records remote ${cp.remote}, not ${remote}`;
	// Provenance was recorded and then not checked, so a resume could switch
	// templates mid-flight and the stamped project.yml would claim a commit
	// from a template this destination was never built from.
	if (template !== undefined && !templateNamesEquivalent(cp.template, template)) return `checkpoint records template ${cp.template}, not ${template}`;
	return null;
}

// --- clone-failure recovery receipt -----------------------------------------
//
// A destination checkpoint cannot exist until cloning has produced a
// destination. The recovery receipt covers the smaller window after GitHub
// created the remote but before the clone succeeded. It lives beside the
// destination, is keyed by canonical destination + remote, and records the
// exact repository identity returned by GitHub before cloning begins.
export function recoveryReceiptPath(dest, remote) {
	const canonicalDest = resolve(dest);
	const canonicalRemote = String(remote).toLowerCase();
	const hash = createHash('sha256').update(`${canonicalDest}\0${canonicalRemote}`).digest('hex').slice(0, 20);
	const parent = dirname(canonicalDest);
	const path = symlinkFreePath(parent, `.futurebase-promotion-${hash}.json`);
	if (!path) throw new Error(`recovery receipt path contains a symlink beside ${canonicalDest}`);
	return path;
}

function legacyRecoveryReceiptPath(dest, remote) {
	const canonicalDest = resolve(dest);
	const canonicalRemote = String(remote).toLowerCase();
	const hash = createHash('sha256').update(`${canonicalDest}\0${canonicalRemote}`).digest('hex').slice(0, 20);
	const parent = dirname(canonicalDest);
	const path = symlinkFreePath(parent, `.wp-starter-promotion-${hash}.json`);
	if (!path) throw new Error(`legacy recovery receipt path contains a symlink beside ${canonicalDest}`);
	return path;
}

function existingRecoveryReceiptPath(dest, remote) {
	for (const path of [recoveryReceiptPath(dest, remote), legacyRecoveryReceiptPath(dest, remote)]) {
		if (existsSync(path)) return path;
	}
	return null;
}

function readRecoveryReceipt(dest, remote) {
	try {
		const path = existingRecoveryReceiptPath(dest, remote);
		return path ? JSON.parse(readFileSync(path, 'utf8')) : null;
	} catch {
		return null;
	}
}

function writeRecoveryReceipt(dest, remote, receipt) {
	const path = recoveryReceiptPath(dest, remote);
	writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
	return path;
}

// `gh repo create --template` returns as soon as GitHub accepts the request,
// but the template copy is asynchronous: for the first seconds of a new
// repository's life the commits endpoint answers 409 "Git Repository is
// empty". Reading identity on the next line therefore failed every time,
// aborting promotion and orphaning the repository it had just created — for a
// real client, a repo named after them that must be deleted before retrying.
//
// Poll until the generated commit appears. Bounded: a repository that never
// populates is a genuine failure and must still surface, and every other error
// (auth, not found, rate limit) returns immediately rather than waiting out
// the whole budget.
//
// No test covers this path. Promotion's own e2e runs through the local-clone
// seam (FUTUREBASE_PROMOTE_CLONE_FROM), which never calls `gh repo create`, so
// the retry is exercised through an injected runner instead.
const EMPTY_REPOSITORY = /Git Repository is empty/i;

function sleepSync(ms) {
	if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function repositoryIdentity(remote, { waitForCommits = false, attempts = 15, delayMs = 1000, runner = run, sleep = sleepSync } = {}) {
	const repository = runner('gh', ['api', `repos/${remote}`]);
	if (!repository.ok) return { ok: false, error: repository.stderr || repository.error?.message || 'GitHub repository metadata unavailable' };

	let commits = runner('gh', ['api', `repos/${remote}/commits?per_page=2`]);
	for (let attempt = 1; !commits.ok && waitForCommits && attempt < attempts; attempt++) {
		if (!EMPTY_REPOSITORY.test(commits.stderr || '')) break;
		sleep(delayMs);
		commits = runner('gh', ['api', `repos/${remote}/commits?per_page=2`]);
	}
	if (!commits.ok) return { ok: false, error: commits.stderr || commits.error?.message || 'GitHub commit metadata unavailable' };

	try {
		const repo = JSON.parse(repository.stdout);
		const commitList = JSON.parse(commits.stdout);
		if (!Array.isArray(commitList)) return { ok: false, error: 'GitHub returned an invalid commit list' };
		return {
			ok: true,
			identity: {
				repository_id: repo.id,
				repository_node_id: repo.node_id,
				repository_full_name: repo.full_name,
				repository_created_at: repo.created_at,
				default_branch: repo.default_branch,
				initial_commit_sha: commitList[0]?.sha ?? null,
				commit_count: commitList.length,
				template_repository: repo.template_repository?.full_name ?? null,
			},
		};
	} catch (err) {
		return { ok: false, error: `could not parse GitHub repository metadata: ${err.message}` };
	}
}

function makeRecoveryReceipt({ slug, dest, remote, template, templateCommit, identity }) {
	return {
		schema_version: 1,
		kind: 'promotion-recovery-receipt',
		nonce: randomUUID(),
		receipt_created_at: new Date().toISOString(),
		lead_slug: slug,
		dest,
		remote,
		template,
		template_commit: templateCommit,
		repository_id: identity.repository_id,
		repository_node_id: identity.repository_node_id,
		repository_full_name: identity.repository_full_name,
		repository_created_at: identity.repository_created_at,
		default_branch: identity.default_branch,
		initial_commit_sha: identity.initial_commit_sha,
		initial_commit_count: identity.commit_count,
		template_repository: identity.template_repository,
	};
}

// Why a remote may not be recovered, or null when the local receipt and live
// GitHub identity describe the same untouched one-commit template repository.
export function recoveryReceiptMismatch(receipt, { slug, dest, remote, template }, live) {
	if (!receipt) return 'no matching local recovery receipt';
	if (receipt.kind !== 'promotion-recovery-receipt' || receipt.schema_version !== 1) return 'the matching file is not a supported recovery receipt';

	const required = [
		'nonce',
		'receipt_created_at',
		'lead_slug',
		'dest',
		'remote',
		'template',
		'template_commit',
		'repository_id',
		'repository_node_id',
		'repository_full_name',
		'repository_created_at',
		'default_branch',
		'initial_commit_sha',
		'initial_commit_count',
		'template_repository',
	];
	const missing = required.filter((key) => receipt[key] === null || receipt[key] === undefined || receipt[key] === '');
	if (missing.length) return `recovery receipt is incomplete (missing ${missing.join(', ')})`;
	const stringFields = [
		'nonce',
		'receipt_created_at',
		'lead_slug',
		'dest',
		'remote',
		'template',
		'template_commit',
		'repository_node_id',
		'repository_full_name',
		'repository_created_at',
		'default_branch',
		'initial_commit_sha',
		'template_repository',
	];
	const malformed = stringFields.filter((key) => typeof receipt[key] !== 'string');
	if (malformed.length) return `recovery receipt has invalid field types (${malformed.join(', ')})`;
	if (!['number', 'string'].includes(typeof receipt.repository_id)) return 'recovery receipt has an invalid repository_id';
	if (!Number.isInteger(receipt.initial_commit_count)) return 'recovery receipt has an invalid initial_commit_count';
	if (receipt.lead_slug !== slug) return `recovery receipt belongs to lead "${receipt.lead_slug}", not "${slug}"`;
	if (receipt.dest !== dest) return `recovery receipt records destination ${receipt.dest}, not ${dest}`;
	if (receipt.remote.toLowerCase() !== remote.toLowerCase()) return `recovery receipt records remote ${receipt.remote}, not ${remote}`;
	if (!templateNamesEquivalent(receipt.template, template)) return `recovery receipt records template ${receipt.template}, not ${template}`;
	if (!live) return 'live GitHub repository identity could not be verified';
	const liveStrings = ['repository_node_id', 'repository_full_name', 'repository_created_at', 'default_branch', 'initial_commit_sha', 'template_repository'];
	const malformedLive = liveStrings.filter((key) => typeof live[key] !== 'string' || !live[key]);
	if (malformedLive.length || !['number', 'string'].includes(typeof live.repository_id) || !Number.isInteger(live.commit_count)) {
		return 'live GitHub repository identity is incomplete or malformed';
	}
	if (live.commit_count !== 1 || receipt.initial_commit_count !== 1) return 'the remote no longer has exactly one generated commit';
	if (String(live.repository_id) !== String(receipt.repository_id)) return 'the GitHub repository ID changed';
	if (live.repository_node_id !== receipt.repository_node_id) return 'the GitHub repository node ID changed';
	if (live.repository_full_name?.toLowerCase() !== receipt.repository_full_name.toLowerCase()) return 'the GitHub repository name changed';
	if (live.repository_full_name?.toLowerCase() !== remote.toLowerCase()) return 'the live GitHub repository is not the requested remote';
	if (live.repository_created_at !== receipt.repository_created_at) return 'the GitHub repository creation time changed';
	if (live.default_branch !== receipt.default_branch) return 'the GitHub default branch changed';
	if (live.initial_commit_sha !== receipt.initial_commit_sha) return 'the generated initial commit changed';
	if (!templateNamesEquivalent(live.template_repository, receipt.template_repository)) return 'the GitHub template identity changed';
	if (live.template_repository?.toLowerCase() !== template.toLowerCase()) return 'the remote was not generated from the requested template';
	return null;
}

function buildManifest(leadPath) {
	const m = { versioned: [], private: [], excluded: [], links: [] };
	for (const rel of listFiles(leadPath, '', [], m.links)) {
		const klass = classify(rel);
		if (klass === 'regenerated') continue;
		m[klass].push(rel);
	}
	return m;
}

async function confirm(question) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const ans = (await rl.question(`${question} [y/N] `)).trim();
		return /^y(es)?$/i.test(ans);
	} finally {
		rl.close();
	}
}

// Which starter commit does the new project actually contain?
//
// `gh repo create --template` snapshots the template's REMOTE DEFAULT BRANCH,
// not whatever the local checkout happens to be on. Recording the local HEAD
// therefore produces provenance that is silently wrong whenever the operator
// is on a feature branch or is simply behind — which then misleads every later
// `futurebase sync`. Ask GitHub what it will copy. Live promotion refuses to
// create a remote when that identity cannot be established; only the explicit
// offline clone seam takes provenance from the local source checkout.
function templatedCommit({ template, starter, usingSeam }) {
	if (usingSeam) return gitHead(starter);
	if (have('gh')) {
		const branch = run('gh', ['repo', 'view', template, '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name']);
		if (branch.ok && branch.stdout) {
			const sha = run('gh', ['api', `repos/${template}/commits/${branch.stdout}`, '-q', '.sha']);
			if (sha.ok && sha.stdout) return sha.stdout;
		}
	}
	return null;
}

function appendManagedSection(dest, rel, sectionPath) {
	const file = symlinkFreePath(dest, rel);
	if (!file) throw new Error(`managed instruction path contains a symlink: ${rel}`);
	const marker = '<!-- BEGIN project-system:active -->';
	const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
	if (current.includes(marker)) return false; // idempotent
	const section = readFileSync(sectionPath, 'utf8');
	writeFileSync(file, current.replace(/\s*$/, '') + '\n\n' + section, 'utf8');
	return true;
}

function ensureGitignore(dest) {
	const gi = symlinkFreePath(dest, '.gitignore');
	if (!gi) throw new Error('the destination .gitignore is a symlink');
	let body = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
	const missing = GITIGNORE_LINES.filter((l) => !body.split(/\r?\n/).includes(l));
	if (!missing.length) return;
	if (body && !body.endsWith('\n')) body += '\n';
	body += `\n# project-system: private project-record classes\n${missing.join('\n')}\n`;
	writeFileSync(gi, body, 'utf8');
}

export async function leadPromote(positional, flags) {
	const json = !!flags.json;
	const slug = positional[0];
	if (!slug) die('lead promote requires a slug', EXIT.INVALID_CONFIG, { json });
	if (!isValidSlug(slug)) die(`invalid slug: ${slug}`, EXIT.INVALID_CONFIG, { json });

	const leadPath = leadDir(slug, flags['workspace-root']);
	if (!existsSync(leadPath)) die(`no lead workspace at ${leadPath}`, EXIT.ACCESS_FAILURE, { json });

	// 1. Validate the lead — abort on error, lead untouched.
	const leadCfgPath = symlinkFreePath(leadPath, 'project.yml');
	if (!leadCfgPath) die(`lead project.yml contains a symlinked path: ${join(leadPath, 'project.yml')}`, EXIT.ACCESS_FAILURE, { json });
	let leadCfg;
	try {
		leadCfg = readYaml(leadCfgPath);
	} catch (err) {
		die(`lead project.yml failed to parse: ${err.message}`, EXIT.INVALID_CONFIG, { json });
	}
	const leadCheck = validateProject(leadCfg);
	if (!leadCheck.valid) die(`lead project.yml is invalid:\n  ${leadCheck.errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json });
	if (leadCfg.project?.stage !== 'lead') die(`workspace is not a lead (stage: ${leadCfg.project?.stage})`, EXIT.INVALID_CONFIG, { json });

	// Resolve targets.
	const org = flags.org || DEFAULT_ORG;
	const name = flags.name || slug;
	const remote = `${org}/${name}`;
	const dest = flags.dest ? resolve(flags.dest) : join(homedir(), 'Sites', name);
	const template = flags.template || DEFAULT_TEMPLATE;
	const starter = starterRoot(flags['starter-path']);
	const cloneFrom = process.env.FUTUREBASE_PROMOTE_CLONE_FROM || process.env.WP_STARTER_PROMOTE_CLONE_FROM || null;
	const usingSeam = !!cloneFrom;
	let templateCommit = templatedCommit({ template, starter, usingSeam });

	// Collision checks.
	if (flags.resume && flags['reuse-remote']) die('--resume and --reuse-remote are mutually exclusive', EXIT.INVALID_CONFIG, { json });
	if (usingSeam && flags['reuse-remote']) die('--reuse-remote applies only to a GitHub remote created by promotion', EXIT.INVALID_CONFIG, { json });

	const destPresent = existsSync(dest);
	if (destPresent) {
		const st = lstatSync(dest);
		if (!st.isDirectory() || st.isSymbolicLink()) die(`destination is not a real directory: ${dest}`, EXIT.ACCESS_FAILURE, { json });
	}
	if (!symlinkFreePath(dirname(dest), '.')) die(`destination parent contains a symlink: ${dirname(dest)}`, EXIT.ACCESS_FAILURE, { json });
	const destNonEmpty = destPresent && readdirSync(dest).length > 0;
	if (destNonEmpty && !flags.resume) {
		die(
			`destination already exists and is not empty: ${dest}` +
				(flags['reuse-remote'] ? ' (--reuse-remote requires an absent or empty destination)' : ' (use --resume to continue a checkpointed promotion)'),
			EXIT.ACCESS_FAILURE,
			{ json },
		);
	}
	if (flags.resume && !destNonEmpty) {
		die(`--resume requires a non-empty destination with ${CHECKPOINT_FILE}; use --reuse-remote for a clone failure`, EXIT.ACCESS_FAILURE, { json });
	}

	// --resume is a claim about identity, so verify it before doing anything.
	// An interrupted promotion left a checkpoint; anything else is a directory
	// we have no business writing into, whatever it happens to contain.
	let checkpoint = null;
	if (flags.resume && destNonEmpty) {
		checkpoint = readCheckpoint(dest);
		const mismatch = checkpointMismatch(checkpoint, { slug, dest, remote, template });
		if (mismatch) {
			die(
				`refusing to resume into ${dest}: ${mismatch}.\n` +
					`  If an earlier promotion of "${slug}" really did create this directory, it did not get far enough to leave a checkpoint —\n` +
					`  inspect it, remove it, and promote again rather than resuming over unknown contents.`,
				EXIT.ACCESS_FAILURE,
				{ json },
			);
		}
	}

	let recoveryReceipt = null;
	let recoveryReceiptFile = null;
	if (flags['reuse-remote']) {
		if (!have('gh')) die('gh (GitHub CLI) is required to verify and reuse the remote', EXIT.MISSING_DEP, { json });
		recoveryReceiptFile = existingRecoveryReceiptPath(dest, remote);
		recoveryReceipt = readRecoveryReceipt(dest, remote);
		const identityResult = repositoryIdentity(remote);
		const mismatch = recoveryReceiptMismatch(recoveryReceipt, { slug, dest, remote, template }, identityResult.ok ? identityResult.identity : null);
		if (mismatch) {
			die(
				`refusing to reuse ${remote}: ${mismatch}.` +
					(identityResult.ok ? '' : ` GitHub verification failed: ${identityResult.error}.`) +
					' Delete the incomplete remote and run promotion again.',
				EXIT.ACCESS_FAILURE,
				{ json },
			);
		}
		templateCommit = recoveryReceipt.template_commit;
	}
	if (!usingSeam) {
		const exists = ghRepoExists(remote);
		if (flags['reuse-remote'] && exists !== true) die(`remote cannot be verified for recovery: ${remote}`, EXIT.ACCESS_FAILURE, { json });
		if (exists === true && !flags.resume && !flags['reuse-remote']) {
			die(`remote already exists: ${remote} (only a matching local receipt permits --reuse-remote)`, EXIT.ACCESS_FAILURE, { json });
		}
	}
	// Dossier manifest + secret scan (scan the would-be-committed set in the lead).
	const manifest = buildManifest(leadPath);
	const versionedFiles = manifest.versioned.map((r) => join(leadPath, r));
	const findings = flags['skip-secret-scan'] ? [] : scanFiles(versionedFiles);

	// --dry-run: print the plan, change nothing.
	if (flags['dry-run']) {
		const plan = {
			status: 'dry-run',
			slug,
			remote,
			dest,
			template,
			template_commit: templateCommit,
			create_via: usingSeam ? 'local-clone (seam)' : flags['reuse-remote'] ? 'verified retained GitHub remote' : 'gh template',
			manifest: { versioned: manifest.versioned.length, private: manifest.private.length, excluded: manifest.excluded.length, links: manifest.links.length },
			secret_findings: findings.length,
		};
		if (json) emitJson(plan);
		console.log(c.bold(`Promotion plan for lead "${slug}" (dry-run — no changes):`));
		info(`remote:   ${remote}`);
		info(`dest:     ${dest}`);
		info(`template: ${template}  ·  source commit: ${templateCommit ?? 'unknown'}`);
		info(`create:   ${plan.create_via}`);
		console.log(`  manifest: ${manifest.versioned.length} versioned · ${manifest.private.length} private · ${manifest.excluded.length} excluded`);
		if (manifest.links.length) {
			warn(`${manifest.links.length} symlink(s) will NOT be carried into the project:`);
			for (const rel of manifest.links) info(rel);
			info('A dossier is authored content — copy the real file in if you need it.');
		}
		if (findings.length) {
			fail(`secret scan: ${findings.length} finding(s) — promotion would abort (exit 6)`);
			for (const f of findings) info(`${f.file.replace(leadPath + '/', '')}:${f.line} [${f.rule}]`);
		} else {
			ok('secret scan: clean');
		}
		process.exit(EXIT.OK);
	}

	// Secret gate (real run).
	if (findings.length) {
		if (json) emitJson({ status: 'error', code: EXIT.PRIVACY_VIOLATION, message: 'secret scan found potential credentials', findings }, EXIT.PRIVACY_VIOLATION);
		fail(`secret scan found ${findings.length} potential credential(s) in files bound for git:`);
		for (const f of findings) info(`${f.file.replace(leadPath + '/', '')}:${f.line} [${f.rule}]  ${f.snippet}`);
		console.log('');
		info('Move these into a private/ location or remove them, then retry. Override with --skip-secret-scan only if you are certain.');
		process.exit(EXIT.PRIVACY_VIOLATION);
	}

	// Confirmation gate — promotion creates a real GitHub repo.
	if (!flags.confirm) {
		const interactive = process.stdin.isTTY && !flags['non-interactive'];
		if (!interactive) die('promotion creates a real GitHub repo — pass --confirm to proceed non-interactively', EXIT.INVALID_CONFIG, { json });
		const label = usingSeam ? `clone into ${dest}` : flags['reuse-remote'] ? `recover ${remote} into ${dest}` : `create ${remote}`;
		const yes = await confirm(`Promote lead "${slug}" — ${label} and scaffold .project?`);
		if (!yes) {
			info('promotion cancelled — lead untouched.');
			process.exit(EXIT.OK);
		}
	}

	if (!have('git')) die('git is required for promotion', EXIT.MISSING_DEP, { json });
	if (!usingSeam && !have('gh')) die('gh (GitHub CLI) is required for promotion', EXIT.MISSING_DEP, { json });
	// Composer reconciliation runs after rename regardless of how the clone was
	// created. Unlike the gh preflight, this must never be gated by usingSeam.
	if (!have('composer')) die('composer is required for promotion', EXIT.MISSING_DEP, { json });
	if (!usingSeam && !flags['reuse-remote'] && !templateCommit) {
		die(`could not resolve the default-branch commit for template ${template}; no remote was created`, EXIT.ACCESS_FAILURE, { json });
	}

	// --- checkpointed execution (lead untouched until the very end) ----------
	const recover = (step, msg, code, { showResume = true } = {}) => {
		if (json) emitJson({ status: 'error', step, code, message: msg, dest }, code);
		fail(`promotion failed at step: ${step}`);
		info(msg);
		if (showResume) info(`Project dir (for inspection / --resume): ${dest}`);
		process.exit(code);
	};

	// Step 2: create the project repo (skip if resuming into an existing git repo).
	if (!(flags.resume && existsSync(dest) && isGitRepo(dest))) {
		const parent = symlinkFreePath(dirname(dest), '.');
		if (!parent) recover('destination', `destination parent contains a symlink: ${dirname(dest)}`, EXIT.ACCESS_FAILURE, { showResume: false });
		mkdirSync(parent, { recursive: true });

		if (usingSeam) {
			info(`Cloning local template into ${dest} …`);
			const cloned = run('git', ['clone', '--quiet', cloneFrom, dest]);
			if (!cloned.ok) recover('clone', cloned.stderr || cloned.error?.message || 'local clone failed', EXIT.ACCESS_FAILURE, { showResume: false });
		} else {
			if (!flags['reuse-remote']) {
				info(`Creating ${remote} from ${template} …`);
				const created = run('gh', ['repo', 'create', remote, '--template', template, '--private']);
				if (!created.ok) recover('create', created.stderr || created.error?.message || 'GitHub repository creation failed', EXIT.ACCESS_FAILURE, { showResume: false });

				// Wait here only: the repository was just created, so an empty
				// one means the template copy is still in flight. The
				// --reuse-remote path below reads an established repository,
				// where empty is a real problem rather than a slow one.
				const identityResult = repositoryIdentity(remote, { waitForCommits: true });
				if (!identityResult.ok) {
					recover(
						'recovery-receipt',
						`remote ${remote} was created, but its identity could not be recorded safely: ${identityResult.error}.\nDelete the incomplete remote and run promotion again.`,
						EXIT.ACCESS_FAILURE,
						{ showResume: false },
					);
				}
				recoveryReceipt = makeRecoveryReceipt({ slug, dest, remote, template, templateCommit, identity: identityResult.identity });
				const mismatch = recoveryReceiptMismatch(recoveryReceipt, { slug, dest, remote, template }, identityResult.identity);
				if (mismatch) {
					recover(
						'recovery-receipt',
						`remote ${remote} was created, but its generated identity is not recoverable: ${mismatch}.\nDelete the incomplete remote and run promotion again.`,
						EXIT.ACCESS_FAILURE,
						{ showResume: false },
					);
				}
				try {
					recoveryReceiptFile = writeRecoveryReceipt(dest, remote, recoveryReceipt);
				} catch (err) {
					recover(
						'recovery-receipt',
						`remote ${remote} was created, but the local recovery receipt could not be written: ${err.message}.\nDelete the incomplete remote and run promotion again.`,
						EXIT.ACCESS_FAILURE,
						{ showResume: false },
					);
				}
			} else {
				info(`Recovery receipt verified; cloning retained remote ${remote} into ${dest} …`);
			}

			const cloned = run('gh', ['repo', 'clone', remote, dest]);
			if (!cloned.ok) {
				const detail = cloned.stderr || cloned.error?.message || 'unknown clone error';
				recover(
					'clone',
					`remote ${remote} is retained, but cloning to ${dest} failed: ${detail}\n` +
						`Supported recovery paths:\n` +
						`  1. Delete the incomplete remote and run promotion again.\n` +
						`  2. Retain the remote and receipt, empty ${dest}, then re-run with --reuse-remote.`,
					EXIT.ACCESS_FAILURE,
					{ showResume: false },
				);
			}
		}
	} else {
		info(`--resume: reusing existing repo at ${dest} (attempt ${checkpoint.nonce})`);
	}

	// Stamp identity as soon as the repo exists, so an interruption anywhere
	// below is resumable and anything else is not.
	if (!checkpoint) {
		checkpoint = {
			schema_version: 1,
			kind: 'promotion-checkpoint',
			nonce: recoveryReceipt?.nonce ?? randomUUID(),
			lead_slug: slug,
			dest,
			remote,
			template,
			template_commit: templateCommit ?? null,
			started_at: recoveryReceipt?.receipt_created_at ?? new Date().toISOString(),
		};
		try {
			writeCheckpoint(dest, checkpoint);
		} catch (err) {
			recover('checkpoint', `clone succeeded, but the destination checkpoint could not be written: ${err.message}`, EXIT.ACCESS_FAILURE, {
				showResume: false,
			});
		}
		if (recoveryReceiptFile) {
			try {
				rmSync(recoveryReceiptFile);
			} catch (err) {
				recover(
					'checkpoint',
					`destination checkpoint was written, but the recovery receipt could not be removed: ${err.message}. Continue with --resume.`,
					EXIT.ACCESS_FAILURE,
				);
			}
			recoveryReceiptFile = null;
		}
	} else {
		// A process may stop after writing the destination checkpoint but before
		// deleting the pre-clone receipt. The verified checkpoint is now the
		// authority; remove only a receipt carrying the same identity nonce.
		for (const staleReceiptFile of [recoveryReceiptPath(dest, remote), legacyRecoveryReceiptPath(dest, remote)]) {
			if (existsSync(staleReceiptFile)) {
				let staleReceipt = null;
				try {
					staleReceipt = JSON.parse(readFileSync(staleReceiptFile, 'utf8'));
				} catch {
					/* malformed receipts are left for manual inspection */
				}
				if (staleReceipt?.nonce === checkpoint.nonce) {
					try {
						rmSync(staleReceiptFile);
					} catch (err) {
						warn(`could not remove the superseded recovery receipt: ${err.message}`);
					}
				} else {
					warn(`a recovery-receipt file exists beside the destination but does not match this checkpoint; it was left untouched: ${staleReceiptFile}`);
				}
			}
		}
	}

	// Step 3: rename via the EXISTING implementation (reuse bin/rename-theme.sh).
	//
	// The test is "does the text domain equal the slug we were asked for", not
	// "is it something other than the starter's". The latter treated every
	// foreign theme as already-renamed and skipped the step entirely, leaving
	// the wrong text domain in place through a reported-successful promotion.
	const textDomain = () => {
		const p = symlinkFreePath(dest, 'style.css');
		if (!p) recover('rename', 'style.css is a symlink — refusing to inspect or rewrite it', EXIT.ACCESS_FAILURE);
		if (!existsSync(p)) return null;
		return readFileSync(p, 'utf8').match(/^Text Domain:\s*(\S+)\s*$/im)?.[1] ?? null;
	};
	const before = textDomain();
	if (before === slug) {
		info('--resume: rename already applied, skipping');
	} else {
		if (before !== null && before !== 'futurebase') {
			recover('rename', `style.css declares Text Domain "${before}" — neither the starter's nor "${slug}". This is not a fresh template checkout; refusing to rename over it.`, EXIT.INVALID_CONFIG);
		}
		info(`Renaming theme → ${slug} …`);
		const renamed = run(
			'npm',
			[
				'run',
				'rename',
				'--',
				slug,
				'--theme-name',
				leadCfg.project.name,
				'--theme-version',
				'1.0.0',
				'--theme-uri',
				DEFAULT_THEME_URI,
				'--repository',
				remote,
			],
			{ cwd: dest },
		);
		if (!renamed.ok) recover('rename', `npm run rename failed:\n${renamed.stderr || renamed.stdout}`, EXIT.MODULE_FAILURE);
		const after = textDomain();
		if (after !== slug) recover('rename', `rename reported success but style.css declares Text Domain "${after ?? '<none>'}" instead of "${slug}"`, EXIT.MODULE_FAILURE);
	}

	// Rename changes composer.json package identity, so the lock hash must be
	// reconciled before the first client commit. update is quiet (and therefore
	// suppresses Composer's untagged-root notice); validate is intentionally
	// non-quiet and may print that harmless notice twice.
	info('Reconciling Composer lock metadata …');
	const composerUpdate = run('composer', ['update', '--lock', '--no-install', '--no-interaction', '--quiet'], { cwd: dest });
	if (!composerUpdate.ok) {
		recover('composer-lock', `composer update --lock failed:\n${composerUpdate.stderr || composerUpdate.stdout}`, EXIT.MODULE_FAILURE);
	}
	const composerValidate = run('composer', ['validate', '--no-check-publish'], { cwd: dest });
	if (!composerValidate.ok) {
		recover('composer-lock', `composer validate failed:\n${composerValidate.stderr || composerValidate.stdout}`, EXIT.MODULE_FAILURE);
	}

	// Step 4: scaffold .project/ and copy the dossier per the manifest.
	//
	// `.project` is a path we construct, not one we were handed, so refuse it
	// outright if the template ships it as a symlink. Resolving a symlinked
	// managed root through realpath makes it its own boundary, and every write
	// below then lands outside the destination while passing containment — the
	// template is a fresh clone of something we do not control byte-for-byte,
	// so this is reachable by whoever can commit to it.
	const projectRoot = symlinkFreePath(dest, '.project');
	if (!projectRoot) recover('scaffold', `${join(dest, '.project')} contains a symlinked path`, EXIT.ACCESS_FAILURE);
	if (existsSync(projectRoot)) {
		const st = lstatSync(projectRoot);
		if (!st.isDirectory() || st.isSymbolicLink()) {
			recover('scaffold', `${projectRoot} exists and is not a real directory — refusing to scaffold the project record into it`, EXIT.ACCESS_FAILURE);
		}
	}
	for (const d of [...PROJECT_DIRS, 'private']) {
		const path = symlinkFreePath(dest, join('.project', d));
		if (!path) recover('scaffold', `refusing to create a symlinked project directory: ${d}`, EXIT.ACCESS_FAILURE);
		mkdirSync(path, { recursive: true });
	}

	// Every target resolves against DEST, not against .project. The boundary is
	// the repository we are promoting into; .project is merely where inside it
	// these files go.
	const copyInto = (from, rel) => {
		const projectRel = join('.project', rel);
		const to = symlinkFreePath(dest, projectRel);
		if (to === null) {
			recover('copy-dossier', `refusing to write through a symlinked project path: ${rel}`, EXIT.ACCESS_FAILURE);
			return;
		}
		const parent = symlinkFreePath(dest, dirname(projectRel));
		if (!parent) recover('copy-dossier', `refusing to create a symlinked project directory for: ${rel}`, EXIT.ACCESS_FAILURE);
		mkdirSync(parent, { recursive: true });
		const checked = symlinkFreePath(dest, projectRel);
		if (!checked) recover('copy-dossier', `project target became symlinked before copy: ${rel}`, EXIT.ACCESS_FAILURE);
		cpSync(from, checked);
	};
	for (const rel of manifest.versioned) copyInto(join(leadPath, rel), rel);
	for (const rel of manifest.private) copyInto(join(leadPath, rel), join('private', rel));
	// Seed structured docs if the lead didn't carry them.
	const seedIfAbsent = (rel, data) => {
		const p = symlinkFreePath(dest, join('.project', rel));
		if (!p) recover('scaffold', `refusing to seed a symlinked project path: ${rel}`, EXIT.ACCESS_FAILURE);
		if (!existsSync(p)) writeYaml(p, data);
	};
	seedIfAbsent('metrics/metrics.yml', { schema_version: 1, kind: 'metrics', items: [] });
	seedIfAbsent('metrics/journeys.yml', { schema_version: 1, kind: 'journeys', items: [] });
	seedIfAbsent('observations.yml', { schema_version: 1, kind: 'observations', items: [] });
	copyInto(join(templatesDir, 'active', 'agent-context.md'), 'agent-context.md');
	copyInto(join(templatesDir, 'active', 'PROJECT-RECORD.md'), 'PROJECT-RECORD.md');

	// Step 5: wire agent instructions (append managed section; never replace root).
	try {
		appendManagedSection(dest, 'CLAUDE.md', join(templatesDir, 'active', 'CLAUDE.section.md'));
		appendManagedSection(dest, 'AGENTS.md', join(templatesDir, 'active', 'AGENTS.section.md'));
		ensureGitignore(dest);
	} catch (err) {
		recover('agent-instructions', err.message, EXIT.ACCESS_FAILURE);
	}

	// Step 6: stamp the active project.yml.
	//
	// Provenance comes from the CHECKPOINT, which recorded what the destination
	// was actually built from. Re-deriving it here would stamp whatever the
	// template's default branch points at now — a different commit from the one
	// this project contains whenever a resume happens days later, or the
	// template has moved since.
	const stampedCommit = checkpoint?.template_commit ?? templateCommit;
	const activeCfg = {
		schema_version: 1,
		project: {
			name: leadCfg.project.name,
			slug,
			stage: 'active',
			status: 'in-progress',
			type: leadCfg.project.type,
			platform: leadCfg.project.platform,
			created_at: leadCfg.project.created_at,
		},
		starter: {
			source_path: starter,
			...(stampedCommit ? { template_commit: stampedCommit } : {}),
			promoted_at: new Date().toISOString(),
		},
		urls: leadCfg.urls ?? { production: null, staging: null },
		baseline: leadCfg.baseline ?? { mode: leadCfg.project.type },
		privacy: { local_only: false, allow_git: true, allow_credentials_in_project: false },
		...(leadCfg.preset ? { preset: leadCfg.preset } : {}),
	};
	const activeCheck = validateProject(activeCfg);
	if (!activeCheck.valid) recover('stamp', `generated active project.yml invalid:\n  ${activeCheck.errors.join('\n  ')}`, EXIT.INVALID_CONFIG);
	const activeConfigPath = symlinkFreePath(dest, join('.project', 'project.yml'));
	if (!activeConfigPath) recover('stamp', 'active project.yml path contains a symlink', EXIT.ACCESS_FAILURE);
	writeYaml(activeConfigPath, activeCfg);

	// Step 7: one promotion commit.
	//
	// The checkpoint stays in place THROUGH this. Removing it first meant a
	// commit failure — a missing git identity is enough — deleted the only
	// thing that makes --resume work, and then recover() advised --resume.
	// ensureGitignore() has already listed the checkpoint, so `git add -A`
	// leaves it alone and it never enters history.
	run('git', ['add', '-A'], { cwd: dest });
	const commit = run('git', ['commit', '-m', `chore: promote ${name} — rename to ${slug} + scaffold .project record`], { cwd: dest });
	if (!commit.ok && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
		recover('commit', `git commit failed:\n${commit.stderr || commit.stdout}`, EXIT.MODULE_FAILURE);
	}

	// Only now is there nothing left to resume.
	for (const filename of [CHECKPOINT_FILE, LEGACY_CHECKPOINT_FILE]) {
		const checkpointPath = symlinkFreePath(dest, filename);
		if (!checkpointPath) recover('checkpoint-cleanup', 'checkpoint path became a symlink', EXIT.ACCESS_FAILURE);
		rmSync(checkpointPath, { force: true });
	}

	// Step 8: SUCCESS — update lead metadata only now (never delete/move it).
	try {
		leadCfg.project.status = 'promoted';
		leadCfg.promoted_to = remote;
		writeYaml(leadCfgPath, leadCfg);
	} catch (err) {
		warn(`project promoted, but updating lead status failed: ${err.message}`);
	}

	if (json) emitJson({ status: 'promoted', slug, remote, dest, template_commit: stampedCommit, create_via: usingSeam ? 'local-clone' : 'gh' });

	ok(`promoted "${slug}" → ${dest}`);
	// Report what was STAMPED, not what was derived. On a resume those differ,
	// and printing the derived one told the operator a commit the project
	// record does not contain.
	info(`remote: ${remote}  ·  starter commit: ${stampedCommit ?? 'unknown'}`);
	console.log('');
	console.log('Next:');
	console.log(`  1. cd ${dest}`);
	console.log('  2. npm install && composer install && npm run env:start');
	console.log(usingSeam ? '  3. add your GitHub remote and push when ready' : '  3. git push   # promotion commit is local until you push');
	process.exit(EXIT.OK);
}
