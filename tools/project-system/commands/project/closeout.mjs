// commands/project/closeout.mjs — evidence-backed project closeout.
//
// This records what an operator did. It never performs backups, changes
// credentials, sends reminders, deletes data, retires staging, or copies work
// upstream.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { EXIT, die, ok, info, warn, emitJson, c } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { readYaml, writeYaml } from '../../lib/yaml.mjs';
import { validateCloseout, validateProject } from '../../lib/validate.mjs';
import {
	acceptProject,
	closeoutReadiness,
	closeoutSemanticIssues,
	closeoutSummary,
	linkFinalRun,
	newCloseoutRecord,
	qualifyFinalRun,
	renderCloseoutReport,
	renderLessonsReport,
	reviewLessons,
	setCloseoutTask,
} from '../../lib/closeout.mjs';
import { inspectProjectRecord } from './validate.mjs';

function context(flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);
	return { json, root, paths, file: paths.at('closeout', 'closeout.yml') };
}

function load(ctx) {
	if (!existsSync(ctx.file)) die('closeout is not initialized. Run `futurebase project closeout init`.', EXIT.ACCESS_FAILURE, { json: ctx.json });
	let record;
	try {
		record = readYaml(ctx.file);
	} catch (err) {
		die(`closeout record failed to parse: ${err.message}`, EXIT.INVALID_CONFIG, { json: ctx.json });
	}
	const schema = validateCloseout(record);
	if (!schema.valid) die(`closeout record is invalid:\n  ${schema.errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json: ctx.json });
	return record;
}

function persist(ctx, record) {
	const schema = validateCloseout(record);
	const semantic = closeoutSemanticIssues(record);
	if (!schema.valid || semantic.length) {
		const issues = [...schema.errors, ...semantic];
		die(`refusing to write an invalid closeout record:\n  ${issues.join('\n  ')}`, EXIT.INVALID_CONFIG, { json: ctx.json });
	}
	writeYaml(ctx.file, record);
}

function finalQualification(ctx, record) {
	if (!record.final_run?.run_id) return null;
	try {
		return qualifyFinalRun(ctx.paths.finalDir, record.final_run.run_id);
	} catch (err) {
		return { qualified: false, reason: err.message };
	}
}

function projectName(ctx) {
	try {
		return readYaml(ctx.paths.at('project.yml'))?.project?.name || ctx.root.split('/').pop();
	} catch {
		return ctx.root.split('/').pop();
	}
}

function writeReports(ctx, record) {
	mkdirSync(ctx.paths.reportsDir, { recursive: true });
	const qualification = finalQualification(ctx, record);
	const closeoutPath = ctx.paths.at('reports', 'closeout.md');
	const lessonsPath = ctx.paths.at('reports', 'lessons-upstream.md');
	writeFileSync(closeoutPath, renderCloseoutReport(record, projectName(ctx), { finalQualification: qualification }), 'utf8');
	writeFileSync(lessonsPath, renderLessonsReport(record, projectName(ctx), { upstreamOnly: true }), 'utf8');
	return { closeoutPath, lessonsPath };
}

function commandInit(ctx) {
	mkdirSync(ctx.paths.at('closeout'), { recursive: true });
	if (existsSync(ctx.file)) {
		const record = load(ctx);
		if (ctx.json) emitJson({ status: 'present', path: ctx.file, record });
		ok(`closeout already initialized: ${ctx.file}`);
		process.exit(EXIT.OK);
	}
	const record = newCloseoutRecord();
	persist(ctx, record);
	if (ctx.json) emitJson({ status: 'created', path: ctx.file, record });
	ok(`closeout initialized: ${ctx.file}`);
	info('next: futurebase project closeout set-final --run-id <id>');
	process.exit(EXIT.OK);
}

function commandSetFinal(ctx, flags) {
	if (!flags['run-id']) die('set-final requires --run-id <id>', EXIT.INVALID_CONFIG, { json: ctx.json });
	const record = load(ctx);
	try {
		linkFinalRun(record, ctx.paths.finalDir, flags['run-id']);
	} catch (err) {
		die(err.message, EXIT.INVALID_CONFIG, { json: ctx.json });
	}
	persist(ctx, record);
	if (ctx.json) emitJson({ status: 'updated', final_run: record.final_run });
	ok(`final evidence linked: ${record.final_run.run_id}`);
	process.exit(EXIT.OK);
}

function commandAccept(ctx, flags) {
	if (!flags.date) die('accept requires --date YYYY-MM-DD', EXIT.INVALID_CONFIG, { json: ctx.json });
	const record = load(ctx);
	try {
		acceptProject(record, { date: flags.date, evidence: flags.evidence, force: flags.force, confirm: flags.confirm });
	} catch (err) {
		die(err.message, EXIT.INVALID_CONFIG, { json: ctx.json });
	}
	persist(ctx, record);
	if (ctx.json) emitJson({ status: 'accepted', acceptance: record.acceptance, retention: record.retention });
	ok(`acceptance recorded: ${record.acceptance.date}`);
	info(`reminder ${record.retention.reminder_date} · retirement ${record.retention.retirement_date}`);
	process.exit(EXIT.OK);
}

function commandSet(ctx, flags) {
	if (!flags.id || !flags.status) die('set requires --id <task> --status pending|complete|not-applicable', EXIT.INVALID_CONFIG, { json: ctx.json });
	const record = load(ctx);
	let task;
	try {
		task = setCloseoutTask(record, { id: flags.id, status: flags.status, date: flags.date, evidence: flags.evidence, notes: flags.notes });
	} catch (err) {
		die(err.message, EXIT.INVALID_CONFIG, { json: ctx.json });
	}
	persist(ctx, record);
	if (ctx.json) emitJson({ status: 'updated', task });
	ok(`${task.id}: ${task.status}`);
	process.exit(EXIT.OK);
}

function commandReviewLessons(ctx, flags) {
	const record = load(ctx);
	try {
		reviewLessons(record, flags.date);
	} catch (err) {
		die(err.message, EXIT.INVALID_CONFIG, { json: ctx.json });
	}
	persist(ctx, record);
	if (ctx.json) emitJson({ status: 'reviewed', reviewed_at: record.lessons.reviewed_at, count: record.lessons.items.length });
	ok(`lessons reviewed: ${record.lessons.reviewed_at} (${record.lessons.items.length} recorded)`);
	process.exit(EXIT.OK);
}

function commandStatus(ctx) {
	const record = load(ctx);
	const summary = closeoutSummary(record, { finalQualification: finalQualification(ctx, record) });
	if (ctx.json) emitJson({ status: 'ok', closeout: summary });
	console.log(c.bold(`Closeout — ${projectName(ctx)}`));
	console.log(`  ${summary.ready ? c.green('ready to close') : c.yellow('not ready')} · ${summary.pending} pending · ${summary.overdue} overdue`);
	console.log(`  acceptance ${summary.acceptance_date || 'not recorded'} · reminder ${summary.reminder_date || '—'} · retirement ${summary.retirement_date || '—'}`);
	console.log('');
	for (const task of summary.tasks) {
		const due = task.due_date ? ` · due ${task.due_date}${task.overdue ? ' OVERDUE' : ''}` : '';
		console.log(`  ${task.status === 'complete' ? c.green('✓') : task.status === 'not-applicable' ? '—' : c.dim('○')} ${task.title}${due}`);
	}
	if (summary.blockers.length) {
		console.log('');
		warn('closure blockers:');
		for (const blocker of summary.blockers) info(blocker);
	}
	process.exit(EXIT.OK);
}

function commandReport(ctx) {
	const record = load(ctx);
	const out = writeReports(ctx, record);
	if (ctx.json) emitJson({ status: 'ok', closeout: out.closeoutPath, lessons_upstream: out.lessonsPath });
	ok(`closeout report written: ${relative(ctx.root, out.closeoutPath)}`);
	ok(`upstream lessons written: ${relative(ctx.root, out.lessonsPath)}`);
	process.exit(EXIT.OK);
}

function commandComplete(ctx, flags) {
	if (!flags.confirm) die('closure changes project status. Re-run with --confirm.', EXIT.INVALID_CONFIG, { json: ctx.json });
	const record = load(ctx);
	const qualification = finalQualification(ctx, record);
	const readiness = closeoutReadiness(record, qualification);
	if (!readiness.ready) die(`closeout is not ready:\n  ${readiness.blockers.join('\n  ')}`, EXIT.INVALID_CONFIG, { json: ctx.json });

	// Generate the derived reports before validation so secret scanning covers
	// exactly what closure is about to leave in the committed project record.
	const reports = writeReports(ctx, record);
	const audit = inspectProjectRecord(ctx.root);
	if (audit.findings.length) die(`project record contains ${audit.findings.length} potential secret(s); run project validate for details`, EXIT.PRIVACY_VIOLATION, { json: ctx.json });
	if (audit.issues.length) die(`project record has validation issues:\n  ${audit.issues.join('\n  ')}`, EXIT.INVALID_CONFIG, { json: ctx.json });

	const projectPath = ctx.paths.at('project.yml');
	const project = readYaml(projectPath);
	project.project.status = 'closed';
	project.project.closed_at = new Date().toISOString();
	const checked = validateProject(project);
	if (!checked.valid) die(`closing would make project.yml invalid:\n  ${checked.errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json: ctx.json });
	writeYaml(projectPath, project);

	if (ctx.json) emitJson({ status: 'closed', closed_at: project.project.closed_at, reports });
	ok(`project closed: ${project.project.closed_at}`);
	info('the command recorded evidence only; it performed no operational task or deletion.');
	process.exit(EXIT.OK);
}

export function projectCloseout(positional, flags) {
	const ctx = context(flags);
	switch (positional[0]) {
		case 'init': return commandInit(ctx);
		case 'set-final': return commandSetFinal(ctx, flags);
		case 'accept': return commandAccept(ctx, flags);
		case 'set': return commandSet(ctx, flags);
		case 'review-lessons': return commandReviewLessons(ctx, flags);
		case 'status': return commandStatus(ctx);
		case 'report': return commandReport(ctx);
		case 'complete': return commandComplete(ctx, flags);
		default: die('usage: futurebase project closeout init|set-final|accept|set|review-lessons|status|report|complete', EXIT.INVALID_CONFIG, { json: ctx.json });
	}
}
