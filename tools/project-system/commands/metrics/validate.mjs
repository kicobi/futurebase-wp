// commands/metrics/validate.mjs — schema + semantic validation of the metrics doc.
//
// futurebase metrics validate [--json] [--project-root <p>]

import { existsSync } from 'node:fs';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { loadMetrics, metricsPath, checkMetrics } from '../../lib/metrics.mjs';

export function metricsValidate(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const { projectDir } = projectPaths(root);

	if (!existsSync(metricsPath(projectDir))) die('no metrics.yml — run: futurebase metrics suggest', EXIT.INVALID_CONFIG, { json });
	const doc = loadMetrics(projectDir);
	const { valid, errors } = checkMetrics(doc);

	if (json) emitJson({ status: valid ? 'ok' : 'invalid', count: (doc.items || []).length, errors }, valid ? EXIT.OK : EXIT.INVALID_CONFIG);
	if (valid) {
		ok(`metrics valid — ${(doc.items || []).length} metric(s)`);
		process.exit(EXIT.OK);
	}
	die(`metrics invalid:\n  ${errors.join('\n  ')}`, EXIT.INVALID_CONFIG);
}
