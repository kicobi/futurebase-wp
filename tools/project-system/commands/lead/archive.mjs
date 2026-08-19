// commands/lead/archive.mjs — archive a lost/abandoned lead.
//
// Preserves the dossier (brief, analysis, scope, estimate, metric ideas) without
// creating any implementation scaffold. Moves the workspace under
// <leads>/_archive/<slug>/ and stamps its status. Reversible (it's a move).
//
// futurebase lead archive <slug> [--reason lost|abandoned] [--dry-run] [--json]

import { cpSync, existsSync, rmSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson, c } from '../../lib/output.mjs';
import { isValidSlug } from '../../lib/slug.mjs';
import { ManagedPathError, leadDir, leadsRoot, requirePath } from '../../lib/paths.mjs';
import { readYaml, writeYaml } from '../../lib/yaml.mjs';

const REASONS = ['lost', 'abandoned'];

export function leadArchive(positional, flags) {
	const json = !!flags.json;
	const slug = positional[0];
	if (!slug) die('lead archive requires a slug', EXIT.INVALID_CONFIG, { json });
	if (!isValidSlug(slug)) die(`invalid slug: ${slug}`, EXIT.INVALID_CONFIG, { json });

	const reason = flags.reason || 'lost';
	if (!REASONS.includes(reason)) die(`--reason must be one of: ${REASONS.join(', ')}`, EXIT.INVALID_CONFIG, { json });

	// leadDir() refuses a symlinked workspace, and every write below resolves
	// through the same rule: this command stamps a status and leaves a note
	// INSIDE the workspace before moving it, so a `<slug> -> elsewhere` link had
	// it write two files into someone else's directory and then move the link.
	const root = leadsRoot(flags['workspace-root']);
	const src = leadDir(slug, flags['workspace-root']);
	if (!existsSync(src)) die(`no lead workspace at ${src}`, EXIT.ACCESS_FAILURE, { json });

	const dest = requirePath(root, join('_archive', slug));
	if (existsSync(dest)) die(`already archived: ${dest}`, EXIT.ACCESS_FAILURE, { json });

	if (flags['dry-run']) {
		if (json) emitJson({ status: 'dry-run', slug, reason, from: src, to: dest });
		console.log(c.bold(`Archive plan (dry-run — no changes):`));
		info(`${src}  →  ${dest}`);
		info(`status → ${reason}`);
		process.exit(EXIT.OK);
	}

	// Stamp status + leave a note before moving (best-effort on the config).
	try {
		const cfgPath = requirePath(src, 'project.yml');
		const cfg = readYaml(cfgPath);
		if (cfg?.project) {
			cfg.project.status = reason;
			writeYaml(cfgPath, cfg);
		}
	} catch (err) {
		// An unreadable config shouldn't block archiving. A config that is a
		// SYMLINK is a different claim — swallowing that would turn the refusal
		// into a silent skip, which is the shape of the defect being fixed.
		if (err instanceof ManagedPathError) throw err;
	}
	writeFileSync(
		requirePath(src, 'ARCHIVE.md'),
		`# Archived (${reason})\n\nArchived on ${new Date().toISOString().slice(0, 10)}.\n\n_Reason and lessons for future proposals:_\n`,
		'utf8'
	);

	// Move under _archive/. Same filesystem in the normal case; fall back to
	// copy+remove across devices.
	mkdirSync(requirePath(root, '_archive'), { recursive: true });
	try {
		renameSync(src, dest);
	} catch (err) {
		if (err.code === 'EXDEV') {
			cpSync(src, dest, { recursive: true });
			rmSync(src, { recursive: true, force: true });
		} else {
			die(`could not archive: ${err.message}`, EXIT.ACCESS_FAILURE, { json });
		}
	}

	if (json) emitJson({ status: 'archived', slug, reason, path: dest });
	ok(`archived "${slug}" (${reason}) → ${dest}`);
	process.exit(EXIT.OK);
}
