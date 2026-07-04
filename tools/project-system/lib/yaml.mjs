// lib/yaml.mjs — YAML/JSON read+write via js-yaml (a real parser, never hand-rolled).

import { readFileSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';

export function readYaml(path) {
	return yaml.load(readFileSync(path, 'utf8'));
}

export function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

// Dump YAML with stable, human-friendly formatting. `lineWidth: -1` avoids
// hard-wrapping long strings; js-yaml quotes date-like strings so they survive
// the round-trip as strings (see the schema notes on ISO-date handling).
export function writeYaml(path, data) {
	const out = yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' });
	writeFileSync(path, out, 'utf8');
	return out;
}
