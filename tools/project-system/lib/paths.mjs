// lib/paths.mjs — resolve the well-known locations the CLI works with, and
// keep operations inside them.

import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/project-system/lib

// The tool's own root: tools/project-system/
export const TOOL_ROOT = resolve(HERE, '..');

// The wp-starter checkout that hosts this tool: three levels up from lib/.
// Overridable with --starter-path for unusual layouts.
export function starterRoot(override) {
	return override ? resolve(override) : resolve(HERE, '..', '..', '..');
}

// Where lead workspaces live. Default ~/Sites/leads, overridable with
// --workspace-root or the WP_STARTER_LEADS_ROOT env var (for tests).
export function leadsRoot(override) {
	if (override) return resolve(override);
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
// Checks the string first (cheap, catches `..`), then resolves the existing
// prefix through symlinks and re-attaches the not-yet-created tail.
export function containedPath(root, rel) {
	let rootReal;
	try {
		rootReal = realpathSync(resolve(root));
	} catch {
		return null;
	}
	const abs = resolve(rootReal, rel);
	if (!isInside(rootReal, abs)) return null;

	const anc = deepestExisting(abs);
	if (!anc || !isInside(rootReal, anc.real)) return null;

	const tail = relative(anc.virtual, abs);
	const resolved = tail ? join(anc.real, tail) : anc.real;
	return isInside(rootReal, resolved) ? resolved : null;
}
