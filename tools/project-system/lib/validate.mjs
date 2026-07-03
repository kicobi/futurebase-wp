// lib/validate.mjs — validate a project config against project.schema.json.
//
// Reuses the same schemas the design validator (validate-design.mjs) checks, so
// runtime validation and the committed fixtures can never disagree.

import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { schemasDir } from './paths.mjs';
import { readJson } from './yaml.mjs';

let _project = null;

function projectValidator() {
	if (_project) return _project;
	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);
	const schema = readJson(join(schemasDir, 'project.schema.json'));
	_project = ajv.compile(schema);
	return _project;
}

// Returns { valid: boolean, errors: string[] }.
export function validateProject(data) {
	const validate = projectValidator();
	if (validate(data)) return { valid: true, errors: [] };
	const errors = (validate.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);
	return { valid: false, errors };
}
