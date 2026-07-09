// lib/metrics.mjs — load/save success metrics, expand preset suggestions,
// and run semantic validation beyond the JSON Schema.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { presetsDir } from './paths.mjs';
import { readYaml, writeYaml } from './yaml.mjs';
import { validateMetrics } from './validate.mjs';

export function metricsPath(projectDir) {
	return join(projectDir, 'metrics', 'metrics.yml');
}

export function loadMetrics(projectDir) {
	const p = metricsPath(projectDir);
	if (existsSync(p)) return readYaml(p);
	return { schema_version: 1, kind: 'metrics', items: [] };
}

export function saveMetrics(projectDir, doc) {
	const p = metricsPath(projectDir);
	mkdirSync(dirname(p), { recursive: true });
	writeYaml(p, doc);
}

export function loadProject(projectDir) {
	const p = join(projectDir, 'project.yml');
	return existsSync(p) ? readYaml(p) : null;
}

export function loadPreset(name) {
	if (!name) return null;
	const p = join(presetsDir, `${name}.yml`);
	return existsSync(p) ? readYaml(p) : null;
}

// Category-driven defaults so a minimal preset suggestion (id/title/category)
// still expands into a schema-valid, sensible metric. Every field is overridable
// by the preset suggestion.
const DEFAULTS = {
	delivery: { evidence_type: 'automated', owner: 'developer', baseline: { status: 'not_applicable' }, target: { type: 'pass_fail', expected: 'pass' }, measure_at: ['launch'] },
	outcome: { evidence_type: 'analytics', owner: 'shared', baseline: { status: 'establish_after_launch' }, target: { type: 'directional', direction: 'improve' }, measure_at: ['launch', '30_days'] },
	satisfaction: { evidence_type: 'survey', owner: 'client', baseline: { status: 'establish_after_launch' }, target: { type: 'directional', direction: 'improve' }, measure_at: ['30_days'] },
};

export function expandSuggestion(sug, presetName) {
	const category = sug.category || 'outcome';
	const d = DEFAULTS[category] || DEFAULTS.outcome;
	return {
		id: sug.id,
		title: sug.title,
		category,
		...(sug.rationale ? { rationale: sug.rationale } : {}),
		evidence_type: sug.evidence_type || d.evidence_type,
		owner: sug.owner || d.owner,
		baseline: sug.baseline || { ...d.baseline },
		target: sug.target || { ...d.target },
		measure_at: sug.measure_at || [...d.measure_at],
		source: sug.source || [`preset:${presetName || 'unknown'}`],
	};
}

// Semantic checks on top of the JSON Schema.
export function checkMetrics(doc) {
	const errors = [];
	const schema = validateMetrics(doc);
	if (!schema.valid) errors.push(...schema.errors.map((e) => `schema: ${e}`));

	const items = doc.items || [];
	const seen = new Set();
	for (const m of items) {
		if (seen.has(m.id)) errors.push(`duplicate metric id: ${m.id}`);
		seen.add(m.id);
		const t = m.target || {};
		if (t.type === 'numeric' && (t.operator == null || t.value == null)) errors.push(`${m.id}: numeric target needs operator + value`);
		if (t.type === 'directional' && !t.direction) errors.push(`${m.id}: directional target needs a direction`);
		if (m.baseline?.status === 'measured' && m.baseline.value == null) errors.push(`${m.id}: baseline status 'measured' but no value recorded`);
	}
	return { valid: errors.length === 0, errors };
}

// launch vs post-launch split for reporting/messaging.
const POST = new Set(['7_days', '30_days', '90_days']);
export function splitTiming(items) {
	const launch = [];
	const post = [];
	for (const m of items) {
		if ((m.measure_at || []).some((w) => POST.has(w))) post.push(m);
		else launch.push(m);
	}
	return { launch, post };
}
