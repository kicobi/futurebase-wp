// commands/project/validate.mjs — validate the whole .project/ record.
//
// wp-starter project validate [--project-root <p>] [--json]
//
// Schema-validates every structured doc, checks structural rules, and secret-
// scans the committed record. Exit 6 on a secret hit, 2 on any other issue.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { validateProject, validateBaselineConfig, validateObservations, validateJourneys, validateSurveyResults } from '../../lib/validate.mjs';
import { checkMetrics } from '../../lib/metrics.mjs';
import { scanFiles } from '../../lib/secret-scan.mjs';

const PRIVATE_DIRS = new Set(['private', 'credentials', 'auth']);
const TEXT = /\.(md|ya?ml|json|txt)$/i;

function walkText(dir, base = '', acc = []) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return acc;
	}
	for (const entry of entries.sort()) {
		const rel = base ? `${base}/${entry}` : entry;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (PRIVATE_DIRS.has(entry) || entry === 'raw-private') continue;
			walkText(full, rel, acc);
		} else if (TEXT.test(entry)) {
			acc.push(full);
		}
	}
	return acc;
}

function validateDoc(path, validator, label, issues) {
	if (!existsSync(path)) return;
	let doc;
	try {
		doc = readYaml(path);
	} catch (err) {
		issues.push(`${label}: parse error — ${err.message}`);
		return;
	}
	const { valid, errors } = validator(doc);
	if (!valid) for (const e of errors) issues.push(`${label}: ${e}`);
}

export function projectValidate(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);
	const pd = paths.projectDir;

	const issues = [];

	// project.yml is required.
	if (!existsSync(join(pd, 'project.yml'))) issues.push('project.yml: missing');
	else validateDoc(join(pd, 'project.yml'), validateProject, 'project.yml', issues);

	// structural: credentials flag must be false.
	const cfg = existsSync(join(pd, 'project.yml')) ? (() => { try { return readYaml(join(pd, 'project.yml')); } catch { return null; } })() : null;
	if (cfg?.privacy?.allow_credentials_in_project === true) issues.push('privacy.allow_credentials_in_project must be false');

	// optional structured docs.
	validateDoc(join(pd, 'metrics', 'metrics.yml'), checkMetrics, 'metrics/metrics.yml', issues);
	validateDoc(join(pd, 'metrics', 'journeys.yml'), validateJourneys, 'metrics/journeys.yml', issues);
	validateDoc(join(pd, 'observations.yml'), validateObservations, 'observations.yml', issues);
	validateDoc(join(pd, 'baseline.config.yml'), validateBaselineConfig, 'baseline.config.yml', issues);
	for (const period of ['baseline', '30-days', '90-days']) {
		validateDoc(join(pd, 'follow-up', `survey-${period}.yml`), validateSurveyResults, `follow-up/survey-${period}.yml`, issues);
	}

	// secret scan of the committed record (private classes excluded).
	const findings = scanFiles(walkText(pd));

	const hasSecrets = findings.length > 0;
	const status = hasSecrets ? 'secrets' : issues.length ? 'invalid' : 'ok';
	const exit = hasSecrets ? EXIT.PRIVACY_VIOLATION : issues.length ? EXIT.INVALID_CONFIG : EXIT.OK;

	if (json) {
		emitJson({ status, issues, secret_findings: findings.map((f) => ({ file: relative(root, f.file), line: f.line, rule: f.rule })) }, exit);
	}

	if (hasSecrets) {
		fail(`potential credentials in committed record (${findings.length}):`);
		for (const f of findings) info(`${relative(root, f.file)}:${f.line} [${f.rule}]`);
		console.log('');
		info('move these into .project/private/ (gitignored) or remove them.');
	}
	if (issues.length) {
		(hasSecrets ? warn : fail)(`${issues.length} validation issue(s):`);
		for (const i of issues) info(i);
	}
	if (!hasSecrets && !issues.length) ok(`project record valid — ${relative(root, pd)}`);
	process.exit(exit);
}
