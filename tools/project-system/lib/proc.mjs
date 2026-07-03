// lib/proc.mjs — thin, non-throwing process helpers for git / gh / npm.

import { spawnSync } from 'node:child_process';

// Run a command, capturing output. Never throws — returns a result object so
// callers can branch on status and preserve logs for recovery messages.
export function run(cmd, args, { cwd, input } = {}) {
	const r = spawnSync(cmd, args, { cwd, input, encoding: 'utf8' });
	return {
		ok: r.status === 0,
		status: r.status,
		stdout: (r.stdout || '').trim(),
		stderr: (r.stderr || '').trim(),
		error: r.error || null,
	};
}

export function have(cmd) {
	const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
	return !r.error && r.status === 0;
}

export function gitHead(cwd) {
	const r = run('git', ['rev-parse', 'HEAD'], { cwd });
	return r.ok ? r.stdout : null;
}

export function isGitRepo(cwd) {
	return run('git', ['rev-parse', '--is-inside-work-tree'], { cwd }).ok;
}

// Does a GitHub repo already exist / is it reachable? Returns true/false, or
// null if gh can't answer (not installed / not authed).
export function ghRepoExists(fullName) {
	if (!have('gh')) return null;
	const r = run('gh', ['repo', 'view', fullName, '--json', 'name']);
	if (r.ok) return true;
	if (/Could not resolve|not found|404/i.test(r.stderr)) return false;
	return null; // auth error or other — don't guess
}
