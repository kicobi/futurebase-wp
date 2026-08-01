// commands/metrics/review.mjs — show the current metrics for eyeballing/editing.
//
// futurebase metrics review [--json] [--project-root <p>]

import { EXIT, die, warn, info, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { loadMetrics, splitTiming } from '../../lib/metrics.mjs';

function targetStr(t = {}) {
	if (t.type === 'numeric') return `${t.operator} ${t.value}${t.unit ? ' ' + t.unit : ''}`;
	if (t.type === 'directional') return `${t.direction}`;
	if (t.type === 'pass_fail') return `expect ${t.expected || 'pass'}`;
	return t.type || '?';
}

function line(m) {
	const b = m.baseline || {};
	const base = b.status === 'measured' ? `${b.value}${b.unit ? ' ' + b.unit : ''}` : b.status;
	return `  ${c.bold(m.id)}  ${c.dim(m.category)}\n    ${m.title}\n    owner ${m.owner} · evidence ${m.evidence_type} · baseline ${base} · target ${targetStr(m.target)} · at ${(m.measure_at || []).join(',')}`;
}

export function metricsReview(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const { projectDir } = projectPaths(root);
	const doc = loadMetrics(projectDir);
	const items = doc.items || [];

	if (json) emitJson({ status: 'ok', count: items.length, items });

	if (!items.length) {
		warn('no metrics yet — run: futurebase metrics suggest');
		process.exit(EXIT.OK);
	}
	const { launch, post } = splitTiming(items);
	console.log(c.bold(`Success metrics (${items.length})`));
	console.log('');
	console.log(c.bold('At/by launch:'));
	if (launch.length) for (const m of launch) console.log(line(m));
	else info('(none)');
	console.log('');
	console.log(c.bold('Post-launch (7/30/90 days):'));
	if (post.length) for (const m of post) console.log(line(m));
	else info('(none)');
	process.exit(EXIT.OK);
}
