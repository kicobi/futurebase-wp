// commands/metrics/baseline.mjs — record a measured baseline value for a metric.
//
// wp-starter metrics baseline --id <id> --value <v> [--unit <u>] [--at <when>]
//     [--status measured|estimated_by_client|inferred|unavailable|not_applicable|establish_after_launch]

import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { loadMetrics, saveMetrics, checkMetrics } from '../../lib/metrics.mjs';

const STATUSES = ['measured', 'estimated_by_client', 'inferred', 'unavailable', 'not_applicable', 'establish_after_launch'];

export function metricsBaseline(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const { projectDir } = projectPaths(root);

	const id = flags.id;
	if (!id) die('metrics baseline requires --id <metric-id>', EXIT.INVALID_CONFIG, { json });
	const status = flags.status || 'measured';
	if (!STATUSES.includes(status)) die(`--status must be one of: ${STATUSES.join(', ')}`, EXIT.INVALID_CONFIG, { json });
	if (status === 'measured' && flags.value == null) die('--value is required when status is measured', EXIT.INVALID_CONFIG, { json });

	const doc = loadMetrics(projectDir);
	const metric = (doc.items || []).find((m) => m.id === id);
	if (!metric) die(`no metric with id '${id}' (run: wp-starter metrics review)`, EXIT.ACCESS_FAILURE, { json });

	const baseline = { status };
	if (flags.value != null) {
		const n = Number(flags.value);
		baseline.value = Number.isNaN(n) ? String(flags.value) : n;
	}
	if (flags.unit) baseline.unit = String(flags.unit);
	baseline.measured_at = flags.at || 'kickoff';
	metric.baseline = baseline;

	const check = checkMetrics(doc);
	if (!check.valid) die(`resulting metrics invalid:\n  ${check.errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json });
	saveMetrics(projectDir, doc);

	if (json) emitJson({ status: 'updated', id, baseline });
	ok(`recorded baseline for '${id}': ${status}${baseline.value != null ? ` = ${baseline.value}${baseline.unit ? ' ' + baseline.unit : ''}` : ''}`);
	process.exit(EXIT.OK);
}
