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

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../../lib/output.mjs';
import { isValidSlug } from '../../lib/slug.mjs';
import { leadDir, starterRoot, templatesDir } from '../../lib/paths.mjs';
import { readYaml, writeYaml } from '../../lib/yaml.mjs';
import { validateProject } from '../../lib/validate.mjs';
import { run, have, gitHead, isGitRepo, ghRepoExists } from '../../lib/proc.mjs';
import { scanFiles } from '../../lib/secret-scan.mjs';

const DEFAULT_ORG = 'studiokicobi';
const DEFAULT_TEMPLATE = 'studiokicobi/wp-starter';
const PROJECT_DIRS = ['brief', 'analysis', 'proposal', 'decisions', 'metrics', 'baseline', 'final', 'reports', 'follow-up'];
const GITIGNORE_LINES = ['.project/private/', '.project/credentials/', '.project/auth/', '.project/**/raw-private/'];

// --- dossier manifest -------------------------------------------------------
function listFiles(root, base = '', acc = []) {
	for (const entry of readdirSync(join(root, base)).sort()) {
		const rel = base ? `${base}/${entry}` : entry;
		if (statSync(join(root, rel)).isDirectory()) listFiles(root, rel, acc);
		else acc.push(rel);
	}
	return acc;
}

function classify(rel) {
	if (rel === 'project.yml') return 'regenerated'; // we write a fresh active one
	if (['CLAUDE.md', 'AGENTS.md', 'SKELETON.md'].includes(rel)) return 'excluded'; // lead-stage instructions
	if (rel.startsWith('notes/')) return 'excluded';
	if (/(^|\/)\.env(\..*)?$/.test(rel)) return 'excluded';
	if (rel.startsWith('brief/attachments/private/') || rel.includes('/raw-private/')) return 'private';
	return 'versioned';
}

function buildManifest(leadPath) {
	const m = { versioned: [], private: [], excluded: [] };
	for (const rel of listFiles(leadPath)) {
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
			manifest: { versioned: manifest.versioned.length, private: manifest.private.length, excluded: manifest.excluded.length },
			secret_findings: findings.length,
		};
		if (json) emitJson(plan);
		console.log(c.bold(`Promotion plan for lead "${slug}" (dry-run — no changes):`));
		info(`remote:   ${remote}`);
		info(`dest:     ${dest}`);
		info(`template: ${template}  ·  source commit: ${templateCommit ?? 'unknown'}`);
		info(`create:   ${plan.create_via}`);
		console.log(`  manifest: ${manifest.versioned.length} versioned · ${manifest.private.length} private · ${manifest.excluded.length} excluded`);
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
				recover('clone', `remote ${remote} was created but cloning to ${dest} failed: ${detail}\n  Clone it manually (gh repo clone ${remote} ${dest}) and re-run with --resume, or delete the remote.`, EXIT.ACCESS_FAILURE);
			}
			recover(created.stage || 'create', `${detail}`, EXIT.ACCESS_FAILURE);
		}
	} else {
		info(`--resume: reusing existing repo at ${dest}`);
	}

	// Step 3: rename via the EXISTING implementation (reuse bin/rename-theme.sh).
	const alreadyRenamed = existsSync(join(dest, 'style.css')) && !/Text Domain:\s*wp-starter\b/.test(readFileSync(join(dest, 'style.css'), 'utf8'));
	if (!alreadyRenamed) {
		info(`Renaming theme → ${slug} …`);
		const renamed = run('npm', ['run', 'rename', '--', slug], { cwd: dest });
		if (!renamed.ok) recover('rename', `npm run rename failed:\n${renamed.stderr || renamed.stdout}`, EXIT.MODULE_FAILURE);
	} else {
		info('--resume: rename already applied, skipping');
	}

	// Step 4: scaffold .project/ and copy the dossier per the manifest.
	const projectRoot = join(dest, '.project');
	for (const d of PROJECT_DIRS) mkdirSync(join(projectRoot, d), { recursive: true });
	mkdirSync(join(projectRoot, 'private'), { recursive: true });
	for (const rel of manifest.versioned) {
		const to = join(projectRoot, rel);
		mkdirSync(dirname(to), { recursive: true });
		cpSync(join(leadPath, rel), to);
	}
	for (const rel of manifest.private) {
		const to = join(projectRoot, 'private', rel);
		mkdirSync(dirname(to), { recursive: true });
		cpSync(join(leadPath, rel), to);
	}
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
			...(templateCommit ? { template_commit: templateCommit } : {}),
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
	run('git', ['add', '-A'], { cwd: dest });
	const commit = run('git', ['commit', '-m', `chore: promote ${name} — rename to ${slug} + scaffold .project record`], { cwd: dest });
	if (!commit.ok && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
		recover('commit', `git commit failed:\n${commit.stderr || commit.stdout}`, EXIT.MODULE_FAILURE);
	}

	// Step 8: SUCCESS — update lead metadata only now (never delete/move it).
	try {
		leadCfg.project.status = 'promoted';
		leadCfg.promoted_to = remote;
		writeYaml(leadCfgPath, leadCfg);
	} catch (err) {
		warn(`project promoted, but updating lead status failed: ${err.message}`);
	}

	if (json) emitJson({ status: 'promoted', slug, remote, dest, template_commit: templateCommit, create_via: usingSeam ? 'local-clone' : 'gh' });

	ok(`promoted "${slug}" → ${dest}`);
	info(`remote: ${remote}  ·  starter commit: ${templateCommit ?? 'unknown'}`);
	console.log('');
	console.log('Next:');
	console.log(`  1. cd ${dest}`);
	console.log('  2. npm install && composer install && npm run env:start');
	console.log(usingSeam ? '  3. add your GitHub remote and push when ready' : '  3. git push   # promotion commit is local until you push');
	process.exit(EXIT.OK);
}
