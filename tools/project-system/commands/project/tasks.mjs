// commands/project/tasks.mjs — generate the lifecycle task tree (spec §24).
//
// wp-starter project tasks [--format markdown|json|github] [--launch-date YYYY-MM-DD]
//     [--write] [--json] [--project-root <p>]
//
// State-aware: reads the project record and marks done tasks. Does NOT create
// issues or call any tracker — it emits Markdown, a JSON sync payload, or
// ready-to-run `gh issue create` commands for you to review and run.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { recordSummary } from '../../lib/record.mjs';
import { buildTaskTree, renderMarkdown, renderJson, renderGithub } from '../../lib/tasks.mjs';

const FORMATS = ['markdown', 'json', 'github'];

export function projectTasks(_positional, flags) {
	const jsonFlag = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json: jsonFlag });
	const paths = projectPaths(root);
	const summary = recordSummary(paths);

	const launchDate = flags['launch-date'] || null;
	if (launchDate && !/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) die('--launch-date must be YYYY-MM-DD', EXIT.INVALID_CONFIG, { json: jsonFlag });

	const format = jsonFlag ? 'json' : flags.format || 'markdown';
	if (!FORMATS.includes(format)) die(`--format must be one of: ${FORMATS.join(', ')}`, EXIT.INVALID_CONFIG, { json: jsonFlag });

	const tasks = buildTaskTree(summary, { launchDate });

	if (format === 'json') {
		emitJson(renderJson(tasks, summary.project));
	}

	const out = format === 'github' ? renderGithub(tasks) : renderMarkdown(tasks, summary.project?.name || root.split('/').pop());

	if (flags.write) {
		const file = join(paths.projectDir, format === 'github' ? 'tasks.github.sh' : 'tasks.md');
		writeFileSync(file, out, 'utf8');
		ok(`tasks written: ${file}`);
		const pending = tasks.filter((t) => t.measurement_status === 'pending').length;
		info(`${tasks.length - pending}/${tasks.length} done · ${pending} pending`);
		process.exit(EXIT.OK);
	}

	process.stdout.write(out);
	process.exit(EXIT.OK);
}
