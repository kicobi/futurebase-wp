// commands/lead/promote.mjs — promote an awarded lead into an active project.
//
// Wraps the EXISTING project-creation flow (gh template + `npm run rename`) —
// it does not introduce a second method and does not reimplement rename. The
// lead workspace is left byte-for-byte unchanged until the promotion commit
// succeeds; only then is its status metadata updated (never deleted or moved).
//
// wp-starter lead promote <slug> [--org <o>] [--name <n>] [--dest <path>]
//     [--template <owner/repo>] [--dry-run] [--confirm] [--resume]
//     [--skip-secret-scan] [--json] [--non-interactive] [--starter-path <p>]

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../../lib/output.mjs';
import { isValidSlug } from '../../lib/slug.mjs';
import { containedPath, leadDir, starterRoot, templatesDir } from '../../lib/paths.mjs';
import { readYaml, writeYaml } from '../../lib/yaml.mjs';
import { validateProject } from '../../lib/validate.mjs';
import { run, have, gitHead, isGitRepo, ghRepoExists } from '../../lib/proc.mjs';
import { scanFiles } from '../../lib/secret-scan.mjs';

const DEFAULT_ORG = 'studiokicobi';
const DEFAULT_TEMPLATE = 'studiokicobi/wp-starter';
const PROJECT_DIRS = ['brief', 'analysis', 'proposal', 'decisions', 'metrics', 'baseline', 'final', 'reports', 'follow-up'];
// The checkpoint survives until AFTER the promotion commit, so that a commit
// failure is still resumable — which makes the ignore line load-bearing rather
// than belt-and-braces: it is what keeps `git add -A` from committing the
// checkpoint into the project's first commit.
const GITIGNORE_LINES = ['.project/private/', '.project/credentials/', '.project/auth/', '.project/**/raw-private/', '.wp-starter-promotion.json'];

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
export const CHECKPOINT_FILE = '.wp-starter-promotion.json';

function writeCheckpoint(dest, data) {
	writeFileSync(join(dest, CHECKPOINT_FILE), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readCheckpoint(dest) {
	try {
		return JSON.parse(readFileSync(join(dest, CHECKPOINT_FILE), 'utf8'));
	} catch {
		return null;
	}
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
	if (template !== undefined && cp.template !== template) return `checkpoint records template ${cp.template}, not ${template}`;
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

// Create the project repo. Default = gh template flow. The env seam
// WP_STARTER_PROMOTE_CLONE_FROM clones a local repo instead — used for offline
// promotion and end-to-end tests, so the real logic runs without touching
// GitHub. It is intentionally not a documented user flag.
function createProject({ remote, dest, template }) {
	const cloneFrom = process.env.WP_STARTER_PROMOTE_CLONE_FROM;
	if (cloneFrom) {
		return { via: 'local-clone', result: run('git', ['clone', '--quiet', cloneFrom, dest]) };
	}
	const created = run('gh', ['repo', 'create', remote, '--template', template, '--private']);
	if (!created.ok) return { via: 'gh', result: created, stage: 'create' };
	let cloned = run('gh', ['repo', 'clone', remote, dest]);
	if (!cloned.ok) {
		// brief race: template generation can lag; one retry.
		cloned = run('gh', ['repo', 'clone', remote, dest]);
	}
	return { via: 'gh', result: cloned, stage: 'clone', remoteCreated: true };
}

// Which starter commit does the new project actually contain?
//
// `gh repo create --template` snapshots the template's REMOTE DEFAULT BRANCH,
// not whatever the local checkout happens to be on. Recording the local HEAD
// therefore produces provenance that is silently wrong whenever the operator
// is on a feature branch or is simply behind — which then misleads every later
// `wp-starter sync`. Ask GitHub what it actually copied, and fall back to the
// local HEAD only when it cannot answer (offline seam, no gh).
function templatedCommit({ template, starter, usingSeam }) {
	if (usingSeam) return gitHead(starter);
	if (have('gh')) {
		const branch = run('gh', ['repo', 'view', template, '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name']);
		if (branch.ok && branch.stdout) {
			const sha = run('gh', ['api', `repos/${template}/commits/${branch.stdout}`, '-q', '.sha']);
			if (sha.ok && sha.stdout) return sha.stdout;
		}
	}
	return gitHead(starter);
}

function appendManagedSection(file, sectionPath) {
	const marker = '<!-- BEGIN project-system:active -->';
	const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
	if (current.includes(marker)) return false; // idempotent
	const section = readFileSync(sectionPath, 'utf8');
	writeFileSync(file, current.replace(/\s*$/, '') + '\n\n' + section, 'utf8');
	return true;
}

function ensureGitignore(dest) {
	const gi = join(dest, '.gitignore');
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
	const leadCfgPath = join(leadPath, 'project.yml');
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
	const usingSeam = !!process.env.WP_STARTER_PROMOTE_CLONE_FROM;
	const templateCommit = templatedCommit({ template, starter, usingSeam });

	// Collision checks.
	const destExists = existsSync(dest) && readdirSync(dest).length > 0;
	if (destExists && !flags.resume) die(`destination already exists and is not empty: ${dest} (use --resume to continue an interrupted promotion)`, EXIT.ACCESS_FAILURE, { json });

	// --resume is a claim about identity, so verify it before doing anything.
	// An interrupted promotion left a checkpoint; anything else is a directory
	// we have no business writing into, whatever it happens to contain.
	let checkpoint = null;
	if (flags.resume && destExists) {
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
	if (!usingSeam) {
		const exists = ghRepoExists(remote);
		if (exists === true && !flags.resume) die(`remote already exists: ${remote}`, EXIT.ACCESS_FAILURE, { json });
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
			create_via: usingSeam ? 'local-clone (seam)' : 'gh template',
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
		const label = usingSeam ? `clone into ${dest}` : `create ${remote}`;
		const yes = await confirm(`Promote lead "${slug}" — ${label} and scaffold .project?`);
		if (!yes) {
			info('promotion cancelled — lead untouched.');
			process.exit(EXIT.OK);
		}
	}

	if (!have('git')) die('git is required for promotion', EXIT.MISSING_DEP, { json });
	if (!usingSeam && !have('gh')) die('gh (GitHub CLI) is required for promotion; install it or use --dest with a pre-created repo', EXIT.MISSING_DEP, { json });

	// --- checkpointed execution (lead untouched until the very end) ----------
	const recover = (step, msg, code) => {
		if (json) emitJson({ status: 'error', step, code, message: msg, dest }, code);
		fail(`promotion failed at step: ${step}`);
		info(msg);
		info(`Project dir (for inspection / --resume): ${dest}`);
		process.exit(code);
	};

	// Step 2: create the project repo (skip if resuming into an existing git repo).
	if (!(flags.resume && existsSync(dest) && isGitRepo(dest))) {
		info(usingSeam ? `Cloning local template into ${dest} …` : `Creating ${remote} from ${template} …`);
		mkdirSync(dirname(dest), { recursive: true });
		const created = createProject({ remote, dest, template });
		if (!created.result.ok) {
			const detail = created.result.stderr || created.result.error?.message || 'unknown error';
			if (created.remoteCreated) {
				// NOT resumable, and saying otherwise wasted the operator's time:
				// the checkpoint is written after this step, so there is nothing
				// for --resume to match and it will refuse a hand-cloned repo by
				// design. The remote exists though, which is what needs deciding.
				recover(
					'clone',
					`remote ${remote} was created but cloning to ${dest} failed: ${detail}\n` +
						`  No checkpoint was written, so --resume cannot continue this run.\n` +
						`  Either delete the remote and promote again, or keep it and re-run promotion\n` +
						`  into a clean ${dest} (promotion will reuse the existing remote).`,
					EXIT.ACCESS_FAILURE,
				);
			}
			recover(created.stage || 'create', `${detail}`, EXIT.ACCESS_FAILURE);
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
			nonce: randomUUID(),
			lead_slug: slug,
			dest,
			remote,
			template,
			template_commit: templateCommit ?? null,
			started_at: new Date().toISOString(),
		};
		writeCheckpoint(dest, checkpoint);
	}

	// Step 3: rename via the EXISTING implementation (reuse bin/rename-theme.sh).
	//
	// The test is "does the text domain equal the slug we were asked for", not
	// "is it something other than the starter's". The latter treated every
	// foreign theme as already-renamed and skipped the step entirely, leaving
	// the wrong text domain in place through a reported-successful promotion.
	const textDomain = () => {
		const p = join(dest, 'style.css');
		if (!existsSync(p)) return null;
		return readFileSync(p, 'utf8').match(/^Text Domain:\s*(\S+)\s*$/im)?.[1] ?? null;
	};
	const before = textDomain();
	if (before === slug) {
		info('--resume: rename already applied, skipping');
	} else {
		if (before !== null && before !== 'wp-starter') {
			recover('rename', `style.css declares Text Domain "${before}" — neither the starter's nor "${slug}". This is not a fresh template checkout; refusing to rename over it.`, EXIT.INVALID_CONFIG);
		}
		info(`Renaming theme → ${slug} …`);
		const renamed = run('npm', ['run', 'rename', '--', slug], { cwd: dest });
		if (!renamed.ok) recover('rename', `npm run rename failed:\n${renamed.stderr || renamed.stdout}`, EXIT.MODULE_FAILURE);
		const after = textDomain();
		if (after !== slug) recover('rename', `rename reported success but style.css declares Text Domain "${after ?? '<none>'}" instead of "${slug}"`, EXIT.MODULE_FAILURE);
	}

	// Step 4: scaffold .project/ and copy the dossier per the manifest.
	//
	// `.project` is a path we construct, not one we were handed, so refuse it
	// outright if the template ships it as a symlink. Resolving a symlinked
	// managed root through realpath makes it its own boundary, and every write
	// below then lands outside the destination while passing containment — the
	// template is a fresh clone of something we do not control byte-for-byte,
	// so this is reachable by whoever can commit to it.
	const projectRoot = join(dest, '.project');
	if (existsSync(projectRoot)) {
		const st = lstatSync(projectRoot);
		if (!st.isDirectory() || st.isSymbolicLink()) {
			recover('scaffold', `${projectRoot} exists and is not a real directory — refusing to scaffold the project record into it`, EXIT.ACCESS_FAILURE);
		}
	}
	for (const d of PROJECT_DIRS) mkdirSync(join(projectRoot, d), { recursive: true });
	mkdirSync(join(projectRoot, 'private'), { recursive: true });

	// Every target resolves against DEST, not against .project. The boundary is
	// the repository we are promoting into; .project is merely where inside it
	// these files go.
	const copyInto = (from, rel, root) => {
		const to = containedPath(root, rel, { boundary: dest });
		if (to === null) {
			recover('copy-dossier', `refusing to write outside the project: ${rel}`, EXIT.ACCESS_FAILURE);
			return;
		}
		mkdirSync(dirname(to), { recursive: true });
		cpSync(from, to);
	};
	for (const rel of manifest.versioned) copyInto(join(leadPath, rel), rel, projectRoot);
	for (const rel of manifest.private) copyInto(join(leadPath, rel), join('private', rel), projectRoot);
	// Seed structured docs if the lead didn't carry them.
	const seedIfAbsent = (rel, data) => {
		const p = join(projectRoot, rel);
		if (!existsSync(p)) writeYaml(p, data);
	};
	seedIfAbsent('metrics/metrics.yml', { schema_version: 1, kind: 'metrics', items: [] });
	seedIfAbsent('metrics/journeys.yml', { schema_version: 1, kind: 'journeys', items: [] });
	seedIfAbsent('observations.yml', { schema_version: 1, kind: 'observations', items: [] });
	cpSync(join(templatesDir, 'active', 'agent-context.md'), join(projectRoot, 'agent-context.md'));
	cpSync(join(templatesDir, 'active', 'PROJECT-RECORD.md'), join(projectRoot, 'PROJECT-RECORD.md'));

	// Step 5: wire agent instructions (append managed section; never replace root).
	appendManagedSection(join(dest, 'CLAUDE.md'), join(templatesDir, 'active', 'CLAUDE.section.md'));
	appendManagedSection(join(dest, 'AGENTS.md'), join(templatesDir, 'active', 'AGENTS.section.md'));
	ensureGitignore(dest);

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
	writeYaml(join(projectRoot, 'project.yml'), activeCfg);

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
	rmSync(join(dest, CHECKPOINT_FILE), { force: true });

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
