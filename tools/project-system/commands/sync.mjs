// commands/sync.mjs — bring an active project back in line with the starter.
//
// futurebase sync [--ref <ref>] [--futurebase-path <p>] [--project-root <p>]
//     [--only safe|deps|review] [--fetch] [--apply] [--confirm]
//     [--repair-provenance] [--repair-source-path] [--json]
//
// Read-only by default: it prints what has drifted and stops. Writing requires
// --apply, and --apply requires confirmation, matching `lead promote`.
//
// Only the `safe` and `deps` classes are ever written. `review` entries are
// reported for a human to port by hand — they are slug-bearing, so copying them
// would drag the starter's slug back into a renamed project.

import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join, resolve } from 'node:path';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../lib/output.mjs';
import { findProjectRoot } from '../lib/baseline.mjs';
import { readYaml, writeYaml } from '../lib/yaml.mjs';
import { have, isGitRepo, run } from '../lib/proc.mjs';
import {
	CLASS,
	applyEntry,
	detectBase,
	isAncestor,
	missingWorkflowScripts,
	planDeps,
	planFiles,
	refSubject,
	resolveRef,
	textAt,
} from '../lib/sync.mjs';

const DEFAULT_REF = 'origin/main';
const WRITABLE = new Set([CLASS.SAFE, CLASS.DEPS]);

async function confirm(question) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const ans = (await rl.question(`${question} [y/N] `)).trim();
		return /^y(es)?$/i.test(ans);
	} finally {
		rl.close();
	}
}

function group(entries, state) {
	return entries.filter((e) => e.state === state);
}

export async function sync(_positional, flags) {
	const json = !!flags.json;

	// 1. Locate the project and its record.
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found)', EXIT.ACCESS_FAILURE, { json });

	const recordPath = join(root, '.project', 'project.yml');
	if (!existsSync(recordPath)) die(`no project record at ${recordPath}`, EXIT.ACCESS_FAILURE, { json });
	let record = {};
	try {
		record = readYaml(recordPath) || {};
	} catch (err) {
		die(`.project/project.yml failed to parse: ${err.message}`, EXIT.INVALID_CONFIG, { json });
	}

	// 2. Locate Futurebase. The recorded source_path is a hint, not a promise.
	// Source-path repair intentionally happens before ref resolution and file
	// planning: it is metadata recovery, not permission to write theme files.
	const recordedSourcePath = record.starter?.source_path || null;
	const explicitSourcePath = flags['starter-path'] || null;
	const starter = explicitSourcePath ? resolve(explicitSourcePath) : recordedSourcePath;
	if (!starter) die('no Futurebase checkout known — pass --futurebase-path <path>', EXIT.INVALID_CONFIG, { json });
	if (!existsSync(starter)) {
		die(`Futurebase path does not exist: ${starter} — pass --futurebase-path <path> with --repair-source-path`, EXIT.ACCESS_FAILURE, { json });
	}
	if (!have('git')) die('git is required', EXIT.MISSING_DEP, { json });
	if (!isGitRepo(starter)) die(`not a git repository: ${starter}`, EXIT.ACCESS_FAILURE, { json });

	const sourcePathDrift = recordedSourcePath !== starter;
	let sourcePathRepaired = false;
	if (flags['repair-source-path']) {
		if (!explicitSourcePath && !recordedSourcePath) {
			die('--repair-source-path needs --futurebase-path when no source path is recorded', EXIT.INVALID_CONFIG, { json });
		}
		if (sourcePathDrift) {
			record.starter = { ...(record.starter || {}), source_path: starter };
			writeYaml(recordPath, record);
			sourcePathRepaired = true;
			if (!json) ok(`Futurebase source path repaired: ${recordedSourcePath ?? 'none'} → ${starter}`);
		} else {
			if (!json) ok(`Futurebase source path already correct: ${starter}`);
		}

		const repairOnly = !flags.apply && !flags.fetch && !flags.only && !flags.ref && !flags['repair-provenance'];
		if (repairOnly) {
			if (json) {
				emitJson({
					status: sourcePathRepaired ? 'repaired' : 'ok',
					source_path: { recorded: recordedSourcePath, resolved: starter, drifted: sourcePathDrift, repaired: sourcePathRepaired },
				});
			}
			process.exit(EXIT.OK);
		}
	}

	if (flags.fetch) {
		info('fetching starter …');
		run('git', ['fetch', '--quiet', 'origin'], { cwd: starter });
	}

	const ref = flags.ref || DEFAULT_REF;
	const refSha = resolveRef(starter, ref);
	if (!refSha) die(`cannot resolve ref '${ref}' in ${starter} (try --fetch)`, EXIT.INVALID_CONFIG, { json });

	const only = flags.only;
	if (only && !Object.values(CLASS).includes(only)) {
		die(`--only must be one of: ${Object.values(CLASS).join(', ')}`, EXIT.INVALID_CONFIG, { json });
	}

	// 3. Plan. Content-based, so a wrong template_commit cannot skew it.
	const entries = [...planFiles({ projectRoot: root, starter, ref, only })];
	if (!only || only === CLASS.DEPS) entries.push(...planDeps({ projectRoot: root, starter, ref }));

	const drifted = entries.filter((e) => e.state !== 'up-to-date');
	const writableDrift = drifted.filter((e) => WRITABLE.has(e.cls));
	const writable = writableDrift.filter((e) => e.state === 'add' || e.state === 'update');
	// A conflict only means something for a class we would otherwise write. For
	// review-class paths, differing from upstream is the NORMAL post-rename
	// state, not a conflict — grouping them together would cry wolf on every
	// promoted project.
	const conflicts = writableDrift.filter((e) => e.state === 'conflict');
	const review = drifted.filter((e) => e.cls === CLASS.REVIEW);
	const deleted = group(drifted, 'upstream-deleted');
	const blocked = group(drifted, 'blocked');

	// 4. Provenance check — reported, never trusted.
	const recorded = record.starter?.template_commit || null;
	const ancestry = isAncestor(starter, recorded, ref);
	const provenanceOk = recorded && ancestry === true;

	if (json && !flags.apply) {
		emitJson({
			status: 'ok',
			ref,
			ref_sha: refSha,
			starter,
			source_path: { recorded: recordedSourcePath, resolved: starter, drifted: sourcePathDrift, repaired: sourcePathRepaired },
			provenance: { recorded, verified: provenanceOk },
			counts: {
				writable: writable.length,
				conflicts: conflicts.length,
				review: review.length,
				upstream_deleted: deleted.length,
				up_to_date: entries.length - drifted.length,
			},
			entries: drifted.map(({ rel, cls, state, note }) => ({ rel, cls, state, ...(note ? { note } : {}) })),
		});
	}

	// 5. Report.
	console.log(c.bold(`sync — ${record.project?.name ?? root.split('/').pop()} ← ${ref}`));
	info(`starter: ${starter}`);
	info(`ref:     ${refSubject(starter, ref) ?? refSha}`);
	if (recorded && ancestry === false) {
		warn(`recorded template_commit ${recorded.slice(0, 7)} is not an ancestor of ${ref}`);
		info('promotion records the local starter HEAD, which may sit on an unmerged branch.');
		info('The plan below is content-based and unaffected. Use --repair-provenance to correct it.');
	} else if (recorded && ancestry === null) {
		warn(`recorded template_commit ${recorded.slice(0, 7)} is not present in this starter checkout`);
	}
	console.log('');

	const show = (title, list, colour) => {
		if (!list.length) return;
		console.log(c.bold(title));
		for (const e of list) {
			const mark = e.state === 'add' ? '+' : e.state === 'upstream-deleted' ? '-' : '~';
			console.log(`  ${colour(mark)} ${e.rel}  ${c.dim(e.cls)}${e.note ? c.dim(` — ${e.note}`) : ''}`);
		}
		console.log('');
	};

	show(`Will apply (${writable.length})`, writable, c.green);
	show(`Locally modified — skipped (${conflicts.length})`, conflicts, c.red);
	if (review.length) {
		show(`Drifted upstream — port by hand (${review.length})`, review, c.yellow);
		info('These carry the theme slug, so copying them would undo the rename.');
		console.log('');
	}
	if (blocked.length) {
		console.log(c.bold(`Cannot adopt safely (${blocked.length})`));
		for (const e of blocked) {
			console.log(`  ${c.red('!')} ${e.rel}  ${c.dim(e.cls)}`);
			info(e.note);
		}
		console.log('');
	}
	show(`Removed upstream — left in place (${deleted.length})`, deleted, c.dim);

	// Workflows are CLASS.SAFE and copy over verbatim, but the npm scripts and
	// bin/ files they call do not. Say so here rather than letting the client's
	// next CI run report it as `Missing script`.
	const workflowTexts = entries
		.filter((e) => e.rel.startsWith('.github/workflows/') && e.state !== 'upstream-deleted')
		.map((e) => textAt(starter, ref, e.rel));
	let projectScripts = {};
	try {
		projectScripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts || {};
	} catch {
		projectScripts = {};
	}
	const missingScripts = missingWorkflowScripts(workflowTexts, projectScripts);
	if (missingScripts.length) {
		console.log(c.bold(`Workflows call scripts this project does not define (${missingScripts.length})`));
		for (const name of missingScripts) console.log(`  ${c.yellow('!')} npm run ${name}`);
		info('Synced workflows carry these calls, but package.json scripts are never merged.');
		info('Add them — and hand-port the bin/ files behind them — or CI fails on the next push.');
		console.log('');
	}

	if (!drifted.length) ok('project is in sync with the starter');
	else info(`${entries.length - drifted.length} file(s) already up to date`);

	// 6. Repair provenance (independent of --apply).
	if (flags['repair-provenance']) {
		const base = detectBase(starter, ref, root);
		if (!base) {
			warn('could not determine the true base commit — provenance left unchanged');
		} else if (base === recorded) {
			ok(`provenance already correct (${base.slice(0, 7)})`);
		} else {
			record.starter = { ...(record.starter || {}), template_commit: base };
			writeYaml(recordPath, record);
			ok(`provenance repaired: ${recorded ? recorded.slice(0, 7) : 'none'} → ${base.slice(0, 7)}`);
		}
	}

	if (!flags.apply) {
		if (writable.length) {
			console.log('');
			info('re-run with --apply --confirm to write the entries above.');
		}
		process.exit(EXIT.OK);
	}

	// 7. Apply.
	if (!flags.confirm) {
		const interactive = process.stdin.isTTY && !flags['non-interactive'];
		if (!interactive) die('--apply writes into the project — pass --confirm to proceed non-interactively', EXIT.INVALID_CONFIG, { json });
		const yes = await confirm(`Apply ${writable.length} change(s) to ${root}?`);
		if (!yes) {
			info('sync cancelled — nothing written.');
			process.exit(EXIT.OK);
		}
	}

	const written = [];
	const failed = [];
	for (const entry of writable) {
		if (applyEntry(entry, { projectRoot: root, starter })) written.push(entry.rel);
		else failed.push(entry.rel);
	}

	// Record what we synced to. This is accurate provenance going forward,
	// regardless of what promotion recorded.
	record.starter = {
		...(record.starter || {}),
		source_path: starter,
		synced_commit: refSha,
		synced_at: new Date().toISOString(),
	};
	try {
		writeYaml(recordPath, record);
	} catch (err) {
		warn(`files written, but stamping .project/project.yml failed: ${err.message}`);
	}
	if (!writable.length) {
		if (json) emitJson({ status: 'applied', ref, ref_sha: refSha, written, failed, skipped_conflicts: [] });
		ok('nothing to apply; project record stamped');
		process.exit(EXIT.OK);
	}

	if (json) {
		emitJson({ status: 'applied', ref, ref_sha: refSha, written, failed, skipped_conflicts: conflicts.map((e) => e.rel) }, failed.length ? EXIT.WARNINGS : EXIT.OK);
	}

	console.log('');
	ok(`applied ${written.length} change(s)`);
	if (failed.length) fail(`${failed.length} could not be written: ${failed.join(', ')}`);
	if (conflicts.length) warn(`${conflicts.length} locally-modified file(s) skipped — reconcile by hand`);

	// composer.lock carries a content-hash derived from composer.json — which
	// legitimately differs here, since the project keeps its own package name.
	// An adopted lock is therefore always reported stale until composer
	// rewrites that hash. `update --lock` rewrites only the lock metadata; it
	// does not change resolved package versions.
	const touchedNpm = written.some((r) => r === 'package.json' || r === 'package-lock.json');
	const touchedComposer = written.some((r) => r === 'composer.json' || r === 'composer.lock');
	if (touchedComposer) {
		if (have('composer')) {
			const r = run('composer', ['update', '--lock', '--no-install', '--no-interaction', '--quiet'], { cwd: root });
			if (r.ok) ok('composer.lock content-hash reconciled');
			else warn(`could not reconcile composer.lock hash — run: composer update --lock\n  ${r.stderr || r.stdout}`);
		} else {
			warn('composer not found — run `composer update --lock` to reconcile the lock hash');
		}
	}
	console.log('');
	console.log('Next:');
	let step = 1;
	if (touchedNpm) console.log(`  ${step++}. npm ci            # lockfile changed`);
	if (touchedComposer) console.log(`  ${step++}. composer install  # lockfile changed`);
	console.log(`  ${step++}. npm run verify`);
	console.log(`  ${step++}. review the diff, then commit`);

	process.exit(failed.length ? EXIT.WARNINGS : EXIT.OK);
}
