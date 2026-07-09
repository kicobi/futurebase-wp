// lib/validate.mjs — validate documents against the project-system schemas.
//
// Reuses the same schemas the design validator (validate-design.mjs) checks, so
// runtime validation and the committed fixtures can never disagree.

import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { schemasDir } from './paths.mjs';
import { readJson } from './yaml.mjs';

const cache = new Map();

function validator(schemaFile) {
	if (cache.has(schemaFile)) return cache.get(schemaFile);
	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);
	const fn = ajv.compile(readJson(join(schemasDir, schemaFile)));
	cache.set(schemaFile, fn);
	return fn;
}

// Returns { valid: boolean, errors: string[] }.
export function validateAgainst(schemaFile, data) {
	const fn = validator(schemaFile);
	if (fn(data)) return { valid: true, errors: [] };
	const errors = (fn.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);
	return { valid: false, errors };
}

export const validateProject = (data) => validateAgainst('project.schema.json', data);
export const validateMetrics = (data) => validateAgainst('metrics.schema.json', data);
export const validateBaselineConfig = (data) => validateAgainst('baseline-config.schema.json', data);
export const validateBaselineRun = (data) => validateAgainst('baseline-run.schema.json', data);
export const validateSurveyResults = (data) => validateAgainst('survey-results.schema.json', data);
export const validateObservations = (data) => validateAgainst('observations.schema.json', data);
export const validateJourneys = (data) => validateAgainst('journeys.schema.json', data);
