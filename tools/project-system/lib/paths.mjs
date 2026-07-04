// lib/paths.mjs — resolve the well-known locations the CLI works with.

import { homedir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
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
