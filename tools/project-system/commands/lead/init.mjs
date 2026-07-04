// commands/lead/init.mjs — create an isolated lead workspace.
//
// wp-starter lead init "Client Name" --type new|redesign [flags]
//
// Creates ~/Sites/leads/<slug>/ with the lead-stage dossier skeleton, copies the
// lead-stage agent instructions, writes a schema-valid project.yml, and
// generates references/wp-starter-context.md from a READ-ONLY inspection of the
// starter. Local-only; git is NOT initialized unless --git is passed.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { isValidSlug, slugify } from '../../lib/slug.mjs';
import { leadDir, starterRoot, templatesDir } from '../../lib/paths.mjs';
import { writeYaml } from '../../lib/yaml.mjs';
import { validateProject } from '../../lib/validate.mjs';
import { generateStarterContext } from '../../lib/starter-context.mjs';

const TYPES = ['new', 'redesign'];
const PLATFORMS = ['codeable', 'direct', 'other'];
const PRESET_FOR = { new: 'new-marketing-site', redesign: 'redesign' };

const STUBS = {
	'brief/original-brief.md': '# Original brief\n\n_Paste the client\'s brief here, verbatim._\n',
	'brief/client-responses.md': '# Client responses\n\n_Answers to your questions. Attribute and date them._\n',
	'analysis/requirements.md': '# Requirements\n\n_Confirmed requirements only. Assumptions go in assumptions.md._\n',
	'analysis/technical-review.md': '# Technical review\n\n_Feasibility, stack fit, and reusable wp-starter capabilities._\n',
	'analysis/risks.md': '# Risks\n\n_Delivery, technical, and dependency risks._\n',
	'analysis/assumptions.md': '# Assumptions\n\n_Working guesses to confirm with the client._\n',
	'analysis/open-questions.md': '# Open questions\n\n_Unresolved questions blocking scope or estimate._\n',
	'proposal/scope.md': '# Scope\n\n_What is in scope. Be explicit about what is out._\n',
	'proposal/estimate.md': '# Estimate\n\n_Effort and cost basis. Keep pricing detail out of git if sensitive._\n',
	'proposal/milestones.md': '# Milestones\n\n_Phased delivery and payment milestones._\n',
	'metrics/proposed-success-metrics.md':
		'# Proposed success metrics\n\n_Draft the measures you will agree with the client._\n_See docs/baseline-system.md in the starter for categories and evidence types._\n',
};

async function promptType(interactive) {
	if (!interactive) return null;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const ans = (await rl.question('Project type [new|redesign]: ')).trim().toLowerCase();
		return TYPES.includes(ans) ? ans : null;
	} finally {
		rl.close();
	}
}

export async function leadInit(positional, flags) {
	const json = !!flags.json;
	const name = positional[0];
	if (!name) die('lead init requires a client name, e.g. lead init "Acme Client" --type redesign', EXIT.INVALID_CONFIG, { json });

	// Slug: explicit --slug wins, else derived from the name.
	const slug = flags.slug ? String(flags.slug) : slugify(name);
	if (!isValidSlug(slug)) {
		die(`derived slug "${slug}" is not valid (lowercase, dashes only). Pass --slug explicitly.`, EXIT.INVALID_CONFIG, { json });
	}

	// Type: flag, else interactive prompt, else error.
	let type = flags.type ? String(flags.type) : null;
	const interactive = process.stdin.isTTY && !flags['non-interactive'];
	if (!type) type = await promptType(interactive);
	if (!type || !TYPES.includes(type)) {
		die('lead init requires --type new|redesign', EXIT.INVALID_CONFIG, { json });
	}

	const platform = flags.platform ? String(flags.platform) : 'codeable';
	if (!PLATFORMS.includes(platform)) die(`--platform must be one of: ${PLATFORMS.join(', ')}`, EXIT.INVALID_CONFIG, { json });

	const dir = leadDir(slug, flags['workspace-root']);
	if (existsSync(dir)) {
		die(`lead workspace already exists: ${dir}`, EXIT.ACCESS_FAILURE, { json });
	}

	const starter = starterRoot(flags['starter-path']);
	let starterCommit = null;
	try {
		starterCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: starter, encoding: 'utf8' }).trim();
	} catch {
		// starter may not be a git repo (e.g. downloaded template) — that's fine.
	}

	// --- create the workspace -------------------------------------------------
	const dirs = ['brief', 'brief/attachments', 'analysis', 'proposal', 'metrics', 'references', 'notes'];
	mkdirSync(dir, { recursive: true });
	for (const d of dirs) mkdirSync(join(dir, d), { recursive: true });

	for (const [rel, body] of Object.entries(STUBS)) writeFileSync(join(dir, rel), body, 'utf8');

	// Lead-stage agent instructions + layout doc, copied from templates.
	for (const f of ['CLAUDE.md', 'AGENTS.md', 'SKELETON.md']) {
		cpSync(join(templatesDir, 'lead', f), join(dir, f));
	}

	// project.yml — generated from args (not the template placeholder), then validated.
	const project = {
		schema_version: 1,
		project: {
			name,
			slug,
			stage: 'lead',
			status: 'assessing',
			type,
			platform,
			created_at: new Date().toISOString().slice(0, 10),
		},
		starter: { source_path: starter },
		urls: { production: null, staging: null },
		baseline: { mode: type },
		privacy: { local_only: true, allow_git: !!flags.git, allow_credentials_in_project: false },
		preset: PRESET_FOR[type],
	};
	const { valid, errors } = validateProject(project);
	if (!valid) die(`internal error: generated project.yml is invalid:\n  ${errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json });
	writeYaml(join(dir, 'project.yml'), project);

	// Read-only starter summary — the first thing an agent reads.
	writeFileSync(
		join(dir, 'references', 'wp-starter-context.md'),
		generateStarterContext(starter, { commit: starterCommit }),
		'utf8'
	);

	// Optional git (opt-in; leads are local-only by default).
	let git = false;
	if (flags.git) {
		try {
			execFileSync('git', ['init', '-q'], { cwd: dir });
			writeFileSync(join(dir, '.gitignore'), 'brief/attachments/private/\n.env\n.env.*\nnotes/scratch/\n', 'utf8');
			git = true;
		} catch {
			// non-fatal: workspace is usable without git
		}
	}

	if (json) {
		emitJson({ status: 'created', slug, type, platform, path: dir, git, starter_commit: starterCommit });
	}

	ok(`lead workspace created: ${dir}`);
	info(`type: ${type}  ·  platform: ${platform}  ·  git: ${git ? 'yes' : 'no (local-only)'}`);
	console.log('');
	console.log('Next:');
	console.log(`  1. Paste the brief into ${slug}/brief/original-brief.md`);
	console.log(`  2. Open the workspace with Claude/Codex — read references/wp-starter-context.md first`);
	console.log(`  3. Inspect it any time:  wp-starter lead inspect ${slug}`);
	process.exit(EXIT.OK);
}
