// commands/project/init.mjs — scaffold a .project/ record into an existing project.
//
// futurebase project init [--project-root <p>] [--name <n>] [--slug <s>]
//     [--type new|redesign] [--force] [--json]
//
// For retrofitting the project record onto a repo that wasn't created via
// `lead promote` (which scaffolds .project/ itself). Infers name/slug/type from
// package.json / style.css when not given.

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { isValidSlug, slugify } from '../../lib/slug.mjs';
import { projectPaths } from '../../lib/baseline.mjs';
import { templatesDir, requirePath } from '../../lib/paths.mjs';
import { writeYaml } from '../../lib/yaml.mjs';
import { validateProject } from '../../lib/validate.mjs';
import { newCloseoutRecord } from '../../lib/closeout.mjs';

const PROJECT_DIRS = ['brief', 'analysis', 'proposal', 'decisions', 'metrics', 'baseline', 'final', 'closeout', 'reports', 'follow-up', 'private'];
const GITIGNORE_LINES = ['.project/private/', '.project/credentials/', '.project/auth/', '.project/**/raw-private/'];

const titleize = (slug) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

function tryRead(p) {
	try {
		return readFileSync(p, 'utf8');
	} catch {
		return null;
	}
}

function inferSlug(root) {
	const pkg = tryRead(join(root, 'package.json'));
	if (pkg) {
		try {
			const name = JSON.parse(pkg).name;
			if (name && isValidSlug(name)) return name;
		} catch {
			/* ignore */
		}
	}
	const css = tryRead(join(root, 'style.css'));
	const td = css && (css.match(/Text Domain:\s*(\S+)/) || [])[1];
	if (td && isValidSlug(td)) return td;
	return slugify(basename(root));
}

// `.gitignore` sits beside .project, not under it, so it was the one write in
// this command that the local containment helper never covered — and a
// checkout whose .gitignore is a symlink had this append to the link's target.
// A guard that protects the directory it was written for and nothing else is
// how the next write out of the tree gets added.
function ensureGitignore(gi) {
	let body = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
	const missing = GITIGNORE_LINES.filter((l) => !body.split(/\r?\n/).includes(l));
	if (!missing.length) return;
	if (body && !body.endsWith('\n')) body += '\n';
	writeFileSync(gi, body + `\n# project-system: private project-record classes\n${missing.join('\n')}\n`, 'utf8');
}

export function projectInit(_positional, flags) {
	const json = !!flags.json;
	const root = resolve(flags['project-root'] || process.cwd());
	const paths = projectPaths(root);

	// Containment is projectPaths()' job now — it refuses a symlinked .project
	// before this command sees a path, which is what makes the check hold for
	// `--force` too. existsSync follows the link, so the "already exists" test
	// below would otherwise stop on a symlinked .project by accident rather than
	// by rule, and not stop at all with --force.
	const safePath = (rel) => requirePath(root, rel);

	// Every destination this command will use, resolved BEFORE the first write.
	// `.gitignore` is written last, and refusing it there left the .project
	// record fully scaffolded on disk under an error that named only the
	// .gitignore — a half-done command reporting a failure it had already
	// worked past. Refuse everything up front or refuse nothing.
	const gitignorePath = safePath('.gitignore');

	if (existsSync(paths.projectDir) && !flags.force) die(`project record already exists: ${paths.projectDir} (use --force to add missing pieces)`, EXIT.ACCESS_FAILURE, { json });

	const slug = flags.slug ? String(flags.slug) : inferSlug(root);
	if (!isValidSlug(slug)) die(`slug "${slug}" is invalid (lowercase, dashes only). Pass --slug.`, EXIT.INVALID_CONFIG, { json });
	const name = flags.name ? String(flags.name) : titleize(slug);
	const type = flags.type || 'redesign';
	if (!['new', 'redesign'].includes(type)) die('--type must be new|redesign', EXIT.INVALID_CONFIG, { json });

	for (const d of PROJECT_DIRS) mkdirSync(safePath(join('.project', d)), { recursive: true });

	// project.yml (don't clobber an existing one on --force)
	const cfgPath = safePath(join('.project', 'project.yml'));
	if (!existsSync(cfgPath)) {
		const config = {
			schema_version: 1,
			project: { name, slug, stage: 'active', status: 'in-progress', type, created_at: new Date().toISOString().slice(0, 10) },
			urls: { production: null, staging: null },
			baseline: { mode: type },
			privacy: { local_only: false, allow_git: true, allow_credentials_in_project: false },
		};
		const { valid, errors } = validateProject(config);
		if (!valid) die(`internal error: generated project.yml invalid:\n  ${errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json });
		writeYaml(cfgPath, config);
	}

	// seed structured docs + record docs (only if absent)
	const seed = (rel, data) => {
		const p = safePath(join('.project', rel));
		if (!existsSync(p)) writeYaml(p, data);
	};
	seed('metrics/metrics.yml', { schema_version: 1, kind: 'metrics', items: [] });
	seed('metrics/journeys.yml', { schema_version: 1, kind: 'journeys', items: [] });
	seed('observations.yml', { schema_version: 1, kind: 'observations', items: [] });
	seed('closeout/closeout.yml', newCloseoutRecord());
	const copyIfAbsent = (src, dest) => {
		if (!existsSync(dest)) cpSync(src, dest);
	};
	copyIfAbsent(join(templatesDir, 'active', 'agent-context.md'), safePath(join('.project', 'agent-context.md')));
	copyIfAbsent(join(templatesDir, 'active', 'PROJECT-RECORD.md'), safePath(join('.project', 'PROJECT-RECORD.md')));
	ensureGitignore(gitignorePath);

	if (json) emitJson({ status: 'created', slug, name, type, path: paths.projectDir });
	ok(`project record created: ${paths.projectDir}`);
	info(`${name} (${slug}) · ${type}`);
	info('next:  futurebase baseline init   ·   futurebase metrics suggest');
	process.exit(EXIT.OK);
}
