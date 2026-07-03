// cli/dispatch.mjs — top-level command router.
//
// Usage: wp-starter <group> <command> [args] [flags]
// Phase 1 implements: lead init, lead inspect (and bare `lead` = list).
// Other groups/commands are designed (see README) but not yet implemented.

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die } from '../lib/output.mjs';
import { TOOL_ROOT } from '../lib/paths.mjs';
import { leadInit } from '../commands/lead/init.mjs';
import { leadInspect } from '../commands/lead/inspect.mjs';
import { leadPromote } from '../commands/lead/promote.mjs';
import { leadArchive } from '../commands/lead/archive.mjs';
import { baselineInit } from '../commands/baseline/init.mjs';
import { baselineRun } from '../commands/baseline/run.mjs';
import { baselineInspect } from '../commands/baseline/inspect.mjs';
import { baselineReport } from '../commands/baseline/report.mjs';

const OPTIONS = {
	type: { type: 'string' },
	platform: { type: 'string' },
	slug: { type: 'string' },
	'workspace-root': { type: 'string' },
	'starter-path': { type: 'string' },
	// promote / archive
	org: { type: 'string' },
	name: { type: 'string' },
	dest: { type: 'string' },
	template: { type: 'string' },
	reason: { type: 'string' },
	// baseline
	'project-root': { type: 'string' },
	url: { type: 'string' },
	page: { type: 'string', multiple: true },
	module: { type: 'string', multiple: true },
	'run-id': { type: 'string' },
	'dry-run': { type: 'boolean', default: false },
	confirm: { type: 'boolean', default: false },
	resume: { type: 'boolean', default: false },
	'skip-secret-scan': { type: 'boolean', default: false },
	// shared
	git: { type: 'boolean', default: false },
	'no-git': { type: 'boolean', default: false },
	json: { type: 'boolean', default: false },
	'non-interactive': { type: 'boolean', default: false },
	force: { type: 'boolean', default: false },
	help: { type: 'boolean', short: 'h', default: false },
	version: { type: 'boolean', default: false },
};

const HELP = `wp-starter — project lifecycle CLI

Usage:
  wp-starter lead init "<Client Name>" --type new|redesign [flags]
  wp-starter lead inspect [<slug>]
  wp-starter lead                       # list lead workspaces
  wp-starter lead promote <slug> [--dry-run] [--confirm]
  wp-starter lead archive <slug> [--reason lost|abandoned]

  wp-starter baseline init [--type new|redesign] [--url <base>] [--page name=url]
  wp-starter baseline run [--module crawl|screenshots|lighthouse|axe|manual]
  wp-starter baseline inspect
  wp-starter baseline report [--run-id <id>]

Flags:
  --type new|redesign            project type (required for init)
  --platform codeable|direct|other   default: codeable
  --slug <slug>                  override the slug derived from the name
  --workspace-root <path>        leads root (default: ~/Sites/leads)
  --starter-path <path>          wp-starter checkout (default: auto-detected)
  --git / --no-git               initialize git in the lead (default: no-git)
  --json                         machine-readable output
  --non-interactive              never prompt; fail if a required value is missing

  promote:  --org <o> --name <n> --dest <path> --template <owner/repo>
            --dry-run --confirm --resume --skip-secret-scan
  archive:  --reason lost|abandoned --dry-run
  baseline: --project-root <path> --url <base> --page name=url --module <m>
            --run-id <id> --dry-run

  -h, --help                     show this help
  --version                      print the system version

Designed but not yet implemented: project *, metrics *, final *, compare,
case-study. See README.md.
`;

export async function main(argv) {
	let parsed;
	try {
		parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
	} catch (err) {
		die(`${err.message}\n\n${HELP}`, EXIT.INVALID_CONFIG);
	}

	const flags = parsed.values;
	const positionals = parsed.positionals;
	// git is opt-in; --no-git wins over --git.
	flags.git = flags.git && !flags['no-git'];

	if (flags.version) {
		const v = readFileSync(join(TOOL_ROOT, 'VERSION'), 'utf8').trim();
		console.log(v);
		process.exit(EXIT.OK);
	}

	const [group, command, ...rest] = positionals;

	if (flags.help || !group) {
		console.log(HELP);
		process.exit(EXIT.OK);
	}

	if (group === 'lead') {
		switch (command) {
			case 'init':
				return leadInit(rest, flags);
			case 'inspect':
				return leadInspect(rest, flags);
			case 'promote':
				return leadPromote(rest, flags);
			case 'archive':
				return leadArchive(rest, flags);
			case undefined:
				// bare `lead` lists workspaces
				return leadInspect([], flags);
			default:
				die(`unknown 'lead' command: ${command}\n\n${HELP}`, EXIT.INVALID_CONFIG);
		}
	}

	if (group === 'baseline') {
		switch (command) {
			case 'init':
				return baselineInit(rest, flags);
			case 'run':
				return baselineRun(rest, flags);
			case 'inspect':
				return baselineInspect(rest, flags);
			case 'report':
				return baselineReport(rest, flags);
			default:
				die(`unknown 'baseline' command: ${command}\n\n${HELP}`, EXIT.INVALID_CONFIG);
		}
	}

	die(`command group not yet implemented: ${group}\n\n${HELP}`, EXIT.INVALID_CONFIG);
}
