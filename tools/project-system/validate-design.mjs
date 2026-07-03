#!/usr/bin/env node
//
// validate-design.mjs — deterministic design validator (M0).
//
// Compiles every JSON Schema under schemas/ with Ajv and validates every
// fixture (the worked example under examples/ and every template project.yml)
// against the schema its filename maps to. No network, no lifecycle CLI —
// this exists so the design's schemas and fixtures cannot silently drift.
//
// Exit codes: 0 = all valid, 1 = one or more validation failures,
//             2 = setup error (missing dep, unreadable schema).
//
// Usage: node tools/project-system/validate-design.mjs
//        (from tools/project-system: npm install && npm run validate)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let Ajv, addFormats, yaml;
try {
	Ajv = (await import('ajv')).default;
	addFormats = (await import('ajv-formats')).default;
	yaml = (await import('js-yaml')).default;
} catch (err) {
	console.error('setup error: run `npm install` inside tools/project-system first.');
	console.error(String(err.message || err));
	process.exit(2);
}

// Map a fixture's basename to the schema $id that governs it.
const FIXTURE_SCHEMA = {
	'project.yml': 'project.schema.json',
	'metrics.yml': 'metrics.schema.json',
	'observations.yml': 'observations.schema.json',
	'journeys.yml': 'journeys.schema.json',
	'summary.json': 'baseline-run.schema.json',
};

function loadFile(path) {
	const raw = readFileSync(path, 'utf8');
	return path.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw);
}

function walk(dir, acc = []) {
	for (const entry of readdirSync(dir).sort()) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, acc);
		else acc.push(full);
	}
	return acc;
}

// --- compile schemas -------------------------------------------------------
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemaDir = join(HERE, 'schemas');
const schemasByFile = {};
for (const file of readdirSync(schemaDir).sort()) {
	if (!file.endsWith('.json')) continue;
	try {
		const schema = loadFile(join(schemaDir, file));
		ajv.addSchema(schema, file);
		schemasByFile[file] = schema;
	} catch (err) {
		console.error(`setup error: schema ${file} failed to compile`);
		console.error(String(err.message || err));
		process.exit(2);
	}
}

// --- collect fixtures ------------------------------------------------------
const fixtureRoots = [join(HERE, 'examples'), join(HERE, 'templates')];
const fixtures = [];
for (const root of fixtureRoots) {
	let files;
	try {
		files = walk(root);
	} catch {
		continue; // root may not exist yet
	}
	for (const f of files) {
		const schemaFile = FIXTURE_SCHEMA[basename(f)];
		if (schemaFile) fixtures.push({ path: f, schemaFile });
	}
}

// --- validate --------------------------------------------------------------
let failures = 0;
let checked = 0;
for (const { path, schemaFile } of fixtures.sort((a, b) => a.path.localeCompare(b.path))) {
	const rel = relative(HERE, path);
	const validate = ajv.getSchema(schemaFile);
	let data;
	try {
		data = loadFile(path);
	} catch (err) {
		console.error(`✗ ${rel}  (parse error)`);
		console.error(`    ${String(err.message || err)}`);
		failures++;
		continue;
	}
	checked++;
	if (validate(data)) {
		console.log(`✓ ${rel}  →  ${schemaFile}`);
	} else {
		failures++;
		console.error(`✗ ${rel}  →  ${schemaFile}`);
		for (const e of validate.errors) {
			console.error(`    ${e.instancePath || '/'} ${e.message}`);
		}
	}
}

console.log('');
if (checked === 0) {
	console.error('setup error: no fixtures found to validate.');
	process.exit(2);
}
if (failures > 0) {
	console.error(`FAIL — ${failures} fixture(s) invalid of ${checked} checked.`);
	process.exit(1);
}
console.log(`OK — ${checked} fixture(s) valid against ${Object.keys(schemasByFile).length} schemas.`);
