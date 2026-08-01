// commands/metrics/suggest.mjs — propose metrics from the project's preset.
//
// futurebase metrics suggest [--dry-run] [--json] [--project-root <p>]
// Merges preset-derived metric drafts into .project/metrics/metrics.yml without
// clobbering existing items (matched by id).

import { EXIT, die, ok, warn, info, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { loadMetrics, saveMetrics, loadProject, loadPreset, expandSuggestion, checkMetrics } from '../../lib/metrics.mjs';

export function metricsSuggest(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const { projectDir } = projectPaths(root);

	const project = loadProject(projectDir);
	const presetName = flags.preset || project?.preset;
	const preset = loadPreset(presetName);
	if (!preset) die(`no preset to suggest from (project preset: ${presetName || 'none'}). Pass --preset <name>.`, EXIT.INVALID_CONFIG, { json });

	const suggestions = preset.metric_suggestions || [];
	if (!suggestions.length) die(`preset '${presetName}' has no metric_suggestions`, EXIT.INVALID_CONFIG, { json });

	const doc = loadMetrics(projectDir);
	const existing = new Set((doc.items || []).map((m) => m.id));
	const added = [];
	for (const sug of suggestions) {
		if (existing.has(sug.id)) continue;
		added.push(expandSuggestion(sug, presetName));
	}

	if (flags['dry-run'] || !added.length) {
		if (json) emitJson({ status: added.length ? 'dry-run' : 'no-op', preset: presetName, would_add: added.map((m) => m.id), existing: [...existing] });
		if (!added.length) {
			ok(`no new suggestions — all ${suggestions.length} preset metrics already present`);
		} else {
			console.log(c.bold(`Would add ${added.length} metric(s) from preset '${presetName}':`));
			for (const m of added) info(`${m.id} — ${m.title} (${m.category})`);
			info('re-run without --dry-run to write them into .project/metrics/metrics.yml');
		}
		process.exit(EXIT.OK);
	}

	doc.items = [...(doc.items || []), ...added];
	const check = checkMetrics(doc);
	if (!check.valid) die(`internal error: suggested metrics invalid:\n  ${check.errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json });
	saveMetrics(projectDir, doc);

	if (json) emitJson({ status: 'updated', preset: presetName, added: added.map((m) => m.id), total: doc.items.length });
	ok(`added ${added.length} metric(s) from preset '${presetName}' → ${doc.items.length} total`);
	for (const m of added) info(`${m.id} — ${m.title}`);
	console.log('');
	info('review + edit them:  futurebase metrics review');
	info('record a measured baseline:  futurebase metrics baseline --id <id> --value <v> --unit <u>');
	process.exit(EXIT.OK);
}
