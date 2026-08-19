// lib/paths.mjs — resolve the well-known locations the CLI works with, and
// keep operations inside them.

import { lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/project-system/lib

// The tool's own root: tools/project-system/
export const TOOL_ROOT = resolve(HERE, '..');

// The futurebase checkout that hosts this tool: three levels up from lib/.
// Overridable with --starter-path for unusual layouts.
export function starterRoot(override) {
	return override ? resolve(override) : resolve(HERE, '..', '..', '..');
}

// Where lead workspaces live. Default ~/Sites/leads, overridable with
// --workspace-root or the FUTUREBASE_LEADS_ROOT env var (for tests).
export function leadsRoot(override) {
	if (override) return resolve(override);
	if (process.env.FUTUREBASE_LEADS_ROOT) return resolve(process.env.FUTUREBASE_LEADS_ROOT);
	if (process.env.WP_STARTER_LEADS_ROOT) return resolve(process.env.WP_STARTER_LEADS_ROOT);
	return join(homedir(), 'Sites', 'leads');
}

// A lead workspace is a managed tree: the leads root is where the operator
// pointed, the slug directory under it is ours. See requirePath().
export function leadDir(slug, override) {
	return requirePath(leadsRoot(override), slug);
}

// Template + schema + preset locations inside the tool.
export const templatesDir = join(TOOL_ROOT, 'templates');
export const schemasDir = join(TOOL_ROOT, 'schemas');
export const presetsDir = join(TOOL_ROOT, 'presets');

// --- containment -------------------------------------------------------------
//
// Every tree this CLI manages — a lead workspace, a project checkout — is a
// boundary, and join() cannot enforce it. A relative path with no `..` in it
// still escapes when a component along the way is a symlink, because the
// traversal happens in the filesystem rather than in the string. Both halves of
// that bite: a WALK that follows a symlinked directory pulls foreign files into
// a promotion manifest or a secret scan, and a WRITE through a symlinked
// component lands outside the root entirely.
//
// So: walks use lstat and skip symlinks; writes resolve through requirePath()
// first — one resolver, because the alternative was each command deciding, and
// each command that decided missed at least one of its own writes.

// Is `child` the same as, or inside, `root`? Both must already be real paths.
export function isInside(root, child) {
	const rel = relative(root, child);
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Lexically contained path with no symlink in any existing component, including
// the root and final target. A link that currently points somewhere harmless is
// still a configuration error in a tree this tool manages, so this does not
// resolve one just because it happens to stay inside the root.
//
// It replaced a resolver that realpath'd the deepest EXISTING ancestor and
// re-attached the tail. Two ways that was wrong, both found in the field. A
// symlinked ROOT resolved to itself and so vouched for itself — every write
// "passed" containment and landed outside the tree the caller meant, which is
// worse than no check at all. And a DANGLING final symlink has no realpath, so
// it read as a path that simply did not exist yet: the parent was inside the
// root, the write was allowed, and the create followed the link out. lstat sees
// a link whether or not it resolves; realpath cannot.
//
// Non-existent trailing components are allowed so callers can safely create a
// directory tree after this check. Existing non-directory intermediate
// components are refused as well.
export function symlinkFreePath(root, rel = '.') {
	const rootAbs = resolve(root);
	const target = resolve(rootAbs, rel);
	if (!isInside(rootAbs, target)) return null;

	let cursor = rootAbs;
	const components = ['.', ...relative(rootAbs, target).split(sep).filter(Boolean)];
	for (let index = 0; index < components.length; index++) {
		if (components[index] !== '.') cursor = join(cursor, components[index]);
		try {
			const st = lstatSync(cursor);
			if (st.isSymbolicLink()) return null;
			if (index === 0 && !st.isDirectory()) return null;
			if (index < components.length - 1 && !st.isDirectory()) return null;
		} catch (err) {
			if (err?.code !== 'ENOENT') return null;
		}
	}
	return target;
}

// --- the one resolver every managed write goes through -----------------------
//
// A write has two halves and they are not equally trusted. The ROOT is where the
// operator pointed — a cwd, a --project-root, a leads root — and it may perfectly
// well be a symlink; `~/Sites/client -> /Volumes/work/client` is an ordinary way
// to keep a checkout. Everything BELOW it is the tool's own construction, and a
// symlink there is either a mistake or someone else's idea.
//
// So resolve the root once through realpath, then require the path under it to
// be symlink-free. That distinction is the whole reason this could not be left
// to each command to get right: eleven of them built destinations with a plain
// join(), the two that did check covered `.project` and missed `.gitignore`,
// covered promotion and missed archiving — and every one of those gaps wrote
// outside the tree while reporting success.
export class ManagedPathError extends Error {
	constructor(path) {
		// Not "refusing to write": requirePath() also resolves paths a read-only
		// command opens, and telling someone running `project status` that a write
		// was refused sends them looking for a write that never happened.
		super(`refusing a path that resolves through a symlink: ${path}`);
		this.name = 'ManagedPathError';
		this.path = path;
	}
}

export function managedRoot(root) {
	const abs = resolve(root);
	try {
		return realpathSync(abs);
	} catch {
		return abs; // not created yet — there is nothing to resolve through
	}
}

// Throws rather than returning null, so a command that forgets to check cannot
// carry on with an unchecked path. cli/dispatch.mjs turns it back into the
// CLI's own vocabulary — an ACCESS_FAILURE, not a stack trace.
export function requirePath(root, rel = '.') {
	const base = managedRoot(root);
	const resolved = symlinkFreePath(base, rel);
	if (!resolved) throw new ManagedPathError(join(base, rel));
	return resolved;
}
