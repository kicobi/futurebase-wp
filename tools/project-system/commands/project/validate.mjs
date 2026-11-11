// commands/project/validate.mjs — validate the whole .project/ record.
//
// futurebase project validate [--project-root <p>] [--json]
//
// Schema-validates every structured doc, checks structural rules, and secret-
// scans the committed record. Exit 6 on a secret hit, 2 on any other issue.

import { existsSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXIT, die, ok, warn, info, fail, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths, readRunSummary } from '../../lib/baseline.mjs';
import { listRuns } from '../../lib/record.mjs';
import { surveyIssues } from '../../lib/survey.mjs';
import { readYaml } from '../../lib/yaml.mjs';
import { validateProject, validateBaselineConfig, validateObservations, validateJourneys, validateSurveyResults, validateCloseout } from '../../lib/validate.mjs';
import { checkMetrics } from '../../lib/metrics.mjs';
import { scanFiles } from '../../lib/secret-scan.mjs';
import { closeoutSemanticIssues } from '../../lib/closeout.mjs';

import { isPrivateProjectPath } from '../../lib/privacy-paths.mjs';

// Every committed file, not a chosen few. The scanner decides what it can read
// (and reports what it cannot) — an extension allowlist here meant a secret in
// a .csv, .pem, .env or extensionless file was never even opened, and the gate
// reported clean. Deciding by name is guessing; let the content decide.
//
// lstat, never stat: a symlinked directory under .project/ would otherwise walk
// outside the record entirely, pulling unrelated files into the scan and the
// report. Managed trees do not contain symlinks, so skipping them loses nothing.
function walkCommitted(dir, base = '', acc = []) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return acc;
	}
	for (const entry of entries.sort()) {
		const rel = base ? `${base}/${entry}` : entry;
		const full = join(dir, entry);
		let st;
		try {
			st = lstatSync(full);
		} catch {
			continue;
		}
		if (st.isSymbolicLink()) continue;
		if (st.isDirectory()) {
			walkCommitted(full, rel, acc);
		} else if (st.isFile()) {
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

export function inspectProjectRecord(root) {
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
		const surveyPath = join(pd, 'follow-up', `survey-${period}.yml`);
		validateDoc(surveyPath, validateSurveyResults, `follow-up/survey-${period}.yml`, issues);
		// Impossible values, duplicate ids, and a period disagreeing with the
		// filename all pass the schema — see surveyIssues() for why it cannot
		// express them — and all become a reported delta shown to a client.
		if (existsSync(surveyPath)) {
			try {
				for (const issue of surveyIssues(readYaml(surveyPath), period)) issues.push(`follow-up/survey-${period}.yml: ${issue}`);
			} catch {
				/* parse errors are already reported by validateDoc */
			}
		}
	}
	const closeoutPath = join(pd, 'closeout', 'closeout.yml');
	validateDoc(closeoutPath, validateCloseout, 'closeout/closeout.yml', issues);
	if (existsSync(closeoutPath)) {
		try {
			for (const issue of closeoutSemanticIssues(readYaml(closeoutPath))) issues.push(`closeout/closeout.yml: ${issue}`);
		} catch {
			/* parse errors are already reported by validateDoc */
		}
	}

	// Baseline and final runs are the evidence every client report is built from,
	// and the "whole record" validator never looked at them. A summary.json that
	// failed its schema, or whose run_id disagreed with the directory holding it,
	// passed with status ok — so a corrupted or hand-edited run sat in the record
	// looking healthy. readRunSummary already enforces both; nothing called it
	// from here.
	//
	// Evidence completeness is deliberately NOT an issue: a run still awaiting
	// human observations is legitimate work in progress, and `compare` is where
	// that has to be refused.
	for (const [label, dir] of [
		['baseline', paths.baselineDir],
		['final', paths.finalDir],
	]) {
		for (const id of listRuns(dir)) {
			try {
				readRunSummary(dir, id);
			} catch (err) {
				issues.push(`${label}/${id}: ${String(err.message).split('\n')[0]}`);
			}
		}
	}

	// A private path is excluded only while Git actually ignores that file.
	// check-ignore deliberately includes tracked/force-added files in the scan;
	// missing Git/ignore configuration fails closed by excluding nothing.
	const files = walkCommitted(pd);
	const privateFiles = files.filter((file) => isPrivateProjectPath(relative(pd, file)));
	const ignored = new Set();
	if (privateFiles.length) {
		const result = spawnSync('git', ['check-ignore', '-z', '--stdin'], {
			cwd: root, encoding: 'utf8', input: privateFiles.map((file) => relative(root, file)).join('\0') + '\0',
		});
		if (result.status === 0) {
			for (const path of result.stdout.split('\0').filter(Boolean)) ignored.add(join(root, path));
		}
	}
	const findings = scanFiles(files.filter((file) => !ignored.has(file)));
	return { paths, issues, findings };
}

export function projectValidate(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const { paths, issues, findings } = inspectProjectRecord(root);
	const pd = paths.projectDir;

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
