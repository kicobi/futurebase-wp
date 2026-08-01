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

export function leadDir(slug, override) {
	return join(leadsRoot(override), slug);
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
// So: walks use lstat and skip symlinks; writes resolve through
// containedPath() first.

// Is `child` the same as, or inside, `root`? Both must already be real paths.
export function isInside(root, child) {
	const rel = relative(root, child);
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Deepest ancestor of `abs` that exists on disk, with its real path. Needed
// because the target of a write usually does not exist yet, so realpath() on
// the full path would fail and tell us nothing about the components that do.
function deepestExisting(abs) {
	let cur = abs;
	for (;;) {
		try {
			return { virtual: cur, real: realpathSync(cur) };
		} catch {
			const parent = dirname(cur);
			if (parent === cur) return null;
			cur = parent;
		}
	}
}

// Absolute path for writing `rel` under `root`, or null when it would escape.
//
// `boundary` is the tree the write must stay inside, and it defaults to `root`
// only because that is right when the caller was HANDED the root. It is wrong
// whenever the caller CONSTRUCTED the root from something else: promotion
// builds `<dest>/.project`, and resolving that through realpath made a
// symlinked `.project` its own boundary — every write then landed outside the
// destination while satisfying a containment check, which is a worse failure
// than no check at all. Pass the tree you actually mean.
//
// Checks the string first (cheap, catches `..`), then resolves the existing
// prefix through symlinks and re-attaches the not-yet-created tail.
export function containedPath(root, rel, { boundary = root } = {}) {
	let boundaryReal;
	let rootReal;
	try {
		boundaryReal = realpathSync(resolve(boundary));
		rootReal = realpathSync(resolve(root));
	} catch {
		return null;
	}
	// The root itself must be inside the boundary. This is the check that a
	// symlinked managed directory defeats when the boundary is taken from it.
	if (!isInside(boundaryReal, rootReal)) return null;

	const abs = resolve(rootReal, rel);
	if (!isInside(boundaryReal, abs)) return null;

	const anc = deepestExisting(abs);
	if (!anc || !isInside(boundaryReal, anc.real)) return null;

	const tail = relative(anc.virtual, abs);
	const resolved = tail ? join(anc.real, tail) : anc.real;
	return isInside(boundaryReal, resolved) ? resolved : null;
}

// Lexically contained path with no symlink in any existing component,
// including the root and final target. Unlike containedPath(), this does not
// resolve a symlink that happens to stay inside the boundary: promotion writes
// are building an immutable project record, and an accidental link is a
// configuration error even when it currently points somewhere harmless.
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
