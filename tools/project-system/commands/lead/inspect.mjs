// commands/lead/inspect.mjs — report on a lead workspace (or list them all).
//
// wp-starter lead inspect [<slug>] [--workspace-root <path>] [--json]

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, warn, info, emitJson, c } from '../../lib/output.mjs';
import { leadDir, leadsRoot } from '../../lib/paths.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { validateProject } from '../../lib/validate.mjs';

// Classify a dossier file: missing, still-the-stub, or filled in.
function fileState(path, stubMarker) {
	if (!existsSync(path)) return 'missing';
	const body = readFileSync(path, 'utf8');
	if (stubMarker && body.includes(stubMarker)) return 'stub';
	return body.trim().length > 0 ? 'filled' : 'stub';
}

const CHECKS = [
	['brief', 'brief/original-brief.md', '_Paste the client'],
	['scope', 'proposal/scope.md', '_What is in scope'],
	['metrics', 'metrics/proposed-success-metrics.md', '_Draft the measures'],
	['starter-context', 'references/wp-starter-context.md', null],
];

function listLeads(root, json) {
	let entries = [];
	try {
		entries = readdirSync(root).filter((f) => {
			try {
				return statSync(join(root, f)).isDirectory() && existsSync(join(root, f, 'project.yml'));
			} catch {
				return false;
			}
		});
	} catch {
		// leads root may not exist yet
	}
	entries.sort();
	if (json) emitJson({ status: 'ok', leads_root: root, leads: entries });
	if (!entries.length) {
		warn(`no lead workspaces found under ${root}`);
		info('create one with:  wp-starter lead init "Client Name" --type redesign');
		process.exit(EXIT.OK);
	}
	console.log(c.bold(`Lead workspaces (${root}):`));
	for (const slug of entries) {
		let stage = '?';
		let status = '?';
		try {
			const p = readYaml(join(root, slug, 'project.yml'));
			stage = p?.project?.stage ?? '?';
			status = p?.project?.status ?? '?';
		} catch {
			// unreadable config; still list the slug
		}
		console.log(`  ${slug}  ${c.dim(`(${stage}/${status})`)}`);
	}
	process.exit(EXIT.OK);
}

export function leadInspect(positional, flags) {
	const json = !!flags.json;
	const slug = positional[0];
	const root = leadsRoot(flags['workspace-root']);

	if (!slug) return listLeads(root, json);

	const dir = leadDir(slug, flags['workspace-root']);
	if (!existsSync(dir)) die(`no lead workspace at ${dir}`, EXIT.ACCESS_FAILURE, { json });

	const cfgPath = join(dir, 'project.yml');
	if (!existsSync(cfgPath)) die(`missing project.yml in ${dir}`, EXIT.INVALID_CONFIG, { json });

	let config;
	try {
		config = readYaml(cfgPath);
	} catch (err) {
		die(`project.yml failed to parse: ${err.message}`, EXIT.INVALID_CONFIG, { json });
	}

	const { valid, errors } = validateProject(config);
	const dossier = Object.fromEntries(CHECKS.map(([key, rel, marker]) => [key, fileState(join(dir, rel), marker)]));

	if (json) {
		emitJson(
			{ status: valid ? 'ok' : 'invalid', slug, path: dir, config, config_valid: valid, config_errors: errors, dossier },
			valid ? EXIT.OK : EXIT.INVALID_CONFIG
		);
	}

	const p = config.project || {};
	console.log(c.bold(`Lead: ${p.name ?? slug}`));
	info(`${dir}`);
	console.log(`  stage:    ${p.stage ?? '?'}`);
	console.log(`  status:   ${p.status ?? '?'}`);
	console.log(`  type:     ${p.type ?? '?'}  ·  platform: ${p.platform ?? '?'}  ·  preset: ${config.preset ?? '?'}`);
	console.log('');

	if (valid) ok('project.yml is valid');
	else {
		warn('project.yml is invalid:');
		for (const e of errors) info(e);
	}

	console.log('');
	console.log(c.bold('Dossier readiness:'));
	const mark = { filled: c.green('✓ filled'), stub: c.yellow('· stub'), missing: c.red('✗ missing') };
	for (const [key] of CHECKS) console.log(`  ${key.padEnd(16)} ${mark[dossier[key]]}`);

	process.exit(valid ? EXIT.OK : EXIT.INVALID_CONFIG);
}
