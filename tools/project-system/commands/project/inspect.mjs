// commands/project/inspect.mjs — dashboard of the .project/ record.
//
// wp-starter project inspect [--project-root <p>] [--json]

import { EXIT, die, info, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { recordSummary } from '../../lib/record.mjs';

export function projectInspect(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found). Run `wp-starter project init` first.', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);
	const s = recordSummary(paths);

	if (json) emitJson({ status: 'ok', root, summary: s });

	const p = s.project;
	console.log(c.bold(`${p.name ?? root.split('/').pop()}  ${c.dim(`(${p.slug ?? '?'})`)}`));
	info(root);
	console.log(`  stage ${p.stage ?? '?'} · status ${p.status ?? '?'} · type ${p.type ?? '?'}${p.platform ? ' · ' + p.platform : ''}${s.preset ? ' · preset ' + s.preset : ''}`);
	if (s.starter?.template_commit) console.log(`  from starter ${c.dim(s.starter.template_commit.slice(0, 10))}${s.starter.promoted_at ? ' · promoted ' + s.starter.promoted_at.slice(0, 10) : ''}`);
	if (s.urls?.production) console.log(`  production ${s.urls.production}`);
	console.log('');
	console.log(c.bold('Record'));
	console.log(`  brief files       ${s.brief}`);
	console.log(`  scope             ${s.scope}`);
	console.log(`  decisions         ${s.decisions}`);
	console.log(`  metrics           ${s.metrics.count}${s.metrics.count ? ` (${s.metrics.measured} with measured baseline)` : ''}`);
	console.log(`  observations      ${s.observations}`);
	console.log(`  journeys          ${s.journeys}`);
	console.log('');
	console.log(c.bold('Capture'));
	console.log(`  baseline runs     ${s.baseline.runs}${s.baseline.latest ? ` · latest ${s.baseline.latest.id} (${s.baseline.latest.status})` : ''}`);
	console.log(`  final runs        ${s.final.runs}${s.final.latest ? ` · latest ${s.final.latest.id} (${s.final.latest.status})` : ''}`);
	console.log(`  comparison        ${s.comparison ? 'yes' : 'no'}`);
	console.log(`  follow-up surveys ${s.followUp.length ? s.followUp.join(', ') : 'none'}`);
	process.exit(EXIT.OK);
}
