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
import { metricsSuggest } from '../commands/metrics/suggest.mjs';
import { metricsReview } from '../commands/metrics/review.mjs';
import { metricsValidate } from '../commands/metrics/validate.mjs';
import { metricsBaseline } from '../commands/metrics/baseline.mjs';
import { metricsClientMessage } from '../commands/metrics/client-message.mjs';
import { metricsSurvey } from '../commands/metrics/survey.mjs';
import { metricsFollowUp } from '../commands/metrics/follow-up.mjs';
import { finalRun } from '../commands/final/run.mjs';
import { finalReport } from '../commands/final/report.mjs';
import { compare } from '../commands/compare.mjs';
import { caseStudy } from '../commands/project/case-study.mjs';
import { projectInit } from '../commands/project/init.mjs';
import { projectInspect } from '../commands/project/inspect.mjs';
import { projectStatus } from '../commands/project/status.mjs';
import { projectValidate } from '../commands/project/validate.mjs';
import { projectTasks } from '../commands/project/tasks.mjs';

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
	// metrics
	id: { type: 'string' },
	value: { type: 'string' },
	unit: { type: 'string' },
	at: { type: 'string' },
	status: { type: 'string' },
	preset: { type: 'string' },
	write: { type: 'boolean', default: false },
	// compare / survey / tasks
	'baseline-run': { type: 'string' },
	'final-run': { type: 'string' },
	period: { type: 'string' },
	format: { type: 'string' },
	'launch-date': { type: 'string' },
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

  wp-starter metrics suggest [--preset <name>] [--dry-run]
  wp-starter metrics review
  wp-starter metrics validate
  wp-starter metrics baseline --id <id> --value <v> [--unit <u>] [--at <when>]
  wp-starter metrics client-message [--write]
  wp-starter metrics survey --period baseline|30-days|90-days [--write]
  wp-starter metrics follow-up               # combine survey periods + metric checklist

  wp-starter final run [--module <m>]        # capture the launch/pre-launch state
  wp-starter final report [--run-id <id>]
  wp-starter compare [--baseline-run <id>] [--final-run <id>]

  wp-starter project init [--name <n>] [--slug <s>] [--type new|redesign]
  wp-starter project inspect | status | validate
  wp-starter project tasks [--format markdown|json|github] [--launch-date <date>]
  wp-starter project case-study

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
  metrics:  --preset <name> --id <id> --value <v> --unit <u> --at <when>
            --status <s> --write --dry-run
  compare:  --baseline-run <id> --final-run <id>
  survey:   --period baseline|30-days|90-days --write
  project:  --name <n> --slug <s> --type new|redesign --force

  -h, --help                     show this help
  --version                      print the system version

Phase 8 (Workledger / analytics integrations) is out of MVP scope.
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

	if (group === 'metrics') {
		switch (command) {
			case 'suggest':
				return metricsSuggest(rest, flags);
			case 'review':
				return metricsReview(rest, flags);
			case 'validate':
				return metricsValidate(rest, flags);
			case 'baseline':
				return metricsBaseline(rest, flags);
			case 'client-message':
				return metricsClientMessage(rest, flags);
			case 'survey':
				return metricsSurvey(rest, flags);
			case 'follow-up':
				return metricsFollowUp(rest, flags);
			default:
				die(`unknown 'metrics' command: ${command}\n\n${HELP}`, EXIT.INVALID_CONFIG);
		}
	}

	if (group === 'final') {
		switch (command) {
			case 'run':
				return finalRun(rest, flags);
			case 'report':
				return finalReport(rest, flags);
			default:
				die(`unknown 'final' command: ${command}\n\n${HELP}`, EXIT.INVALID_CONFIG);
		}
	}

	if (group === 'compare') {
		return compare(rest, flags);
	}

	if (group === 'project') {
		switch (command) {
			case 'init':
				return projectInit(rest, flags);
			case 'inspect':
				return projectInspect(rest, flags);
			case 'status':
				return projectStatus(rest, flags);
			case 'validate':
				return projectValidate(rest, flags);
			case 'tasks':
				return projectTasks(rest, flags);
			case 'case-study':
				return caseStudy(rest, flags);
			default:
				die(`unknown 'project' command: ${command}\n\n${HELP}`, EXIT.INVALID_CONFIG);
		}
	}

	die(`command group not yet implemented: ${group}\n\n${HELP}`, EXIT.INVALID_CONFIG);
}
