// modules/wordpress.mjs — WordPress inventory via WP-CLI (requires access).
//
// The WP-CLI invocation is configurable so it works against a direct `wp`, a
// wp-env container, or an SSH alias:
//   - config.wordpress.cli  (e.g. "wp"  or  "npx wp-env run cli wp")
//   - env FUTUREBASE_WP_CLI
//   - default: "wp"
// Read-only commands only. If the base command is unreachable the module
// reports "unavailable" without failing the run.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../lib/proc.mjs';

function wpRunner(config) {
	const cli = (config.wordpress?.cli || process.env.FUTUREBASE_WP_CLI || process.env.WP_STARTER_WP_CLI || 'wp').trim().split(/\s+/);
	const cwd = config.wordpress?.cwd || undefined;
	return (args) => run(cli[0], [...cli.slice(1), ...args], { cwd });
}

// Every failed or unparsable query used to collapse to the same empty fallback
// as a genuinely empty result, and the module reported `complete` either way. A
// wrapper that exits 0 without output — `wordpress.cli: "true"` is the minimal
// case, but a broken SSH alias behaves the same — produced an inventory of zero
// plugins, zero post types and zero content, indistinguishable from a real
// reading of a bare site. Record what could not be answered instead.
function json(res, label, problems, fallback = null) {
	if (!res.ok) {
		problems.push(`${label}: command failed (${(res.stderr || res.error?.message || 'no output').slice(0, 80)})`);
		return fallback;
	}
	try {
		return JSON.parse(res.stdout);
	} catch {
		problems.push(`${label}: output was not JSON`);
		return fallback;
	}
}

// `wp core version` on a working CLI prints a version. A wrapper that exits 0
// with nothing to say is not WP-CLI, and treating it as reachable is what let
// every subsequent query fail quietly.
const VERSION_SHAPE = /^\d+\.\d+/;

export async function run_(ctx) {
	const { runDir, config } = ctx;
	const wp = wpRunner(config);

	// Reachability probe.
	const version = wp(['core', 'version']);
	if (!version.ok) {
		return { module: 'wordpress', status: 'unavailable', reason: `WP-CLI not reachable (${(version.stderr || version.error?.message || 'no output').slice(0, 120)})` };
	}
	if (!VERSION_SHAPE.test(version.stdout.trim())) {
		return {
			module: 'wordpress',
			status: 'unavailable',
			reason: `WP-CLI responded but did not report a version (${JSON.stringify(version.stdout.trim().slice(0, 60))}) — check wordpress.cli`,
		};
	}

	const problems = [];

	const outDir = join(runDir, 'wordpress');
	mkdirSync(outDir, { recursive: true });

	const php = wp(['eval', 'echo PHP_VERSION;']);
	const multisite = wp(['eval', 'echo is_multisite() ? 1 : 0;']);
	const themes = json(wp(['theme', 'list', '--format=json', '--fields=name,status,version']), 'themes', problems, []);
	const plugins = json(wp(['plugin', 'list', '--format=json', '--fields=name,status,version']), 'plugins', problems, []);
	const postTypes = json(wp(['post-type', 'list', '--format=json', '--fields=name,label,public']), 'post types', problems, []);
	const taxonomies = json(wp(['taxonomy', 'list', '--format=json', '--fields=name,label']), 'taxonomies', problems, []);
	const adminCount = wp(['user', 'list', '--role=administrator', '--format=count']);

	// Content counts per registered post type (best-effort).
	const counts = {};
	for (const pt of postTypes || []) {
		const c = wp(['post', 'list', `--post_type=${pt.name}`, '--format=count']);
		counts[pt.name] = c.ok ? Number(c.stdout.trim()) || 0 : null;
	}

	const activeTheme = (themes || []).find((t) => t.status === 'active')?.name || null;
	const pluginState = (status) => (plugins || []).filter((p) => p.status === status).length;

	const inventory = {
		core_version: version.stdout.trim(),
		php_version: php.ok ? php.stdout.trim() : null,
		multisite: multisite.ok ? multisite.stdout.trim() === '1' : null,
		active_theme: activeTheme,
		themes,
		plugins,
		plugin_summary: { active: pluginState('active'), inactive: pluginState('inactive'), must_use: pluginState('must-use') },
		post_types: postTypes,
		taxonomies,
		content_counts: counts,
		admin_users: adminCount.ok ? Number(adminCount.stdout.trim()) || 0 : null,
	};
	writeFileSync(join(outDir, 'wordpress.json'), JSON.stringify(inventory, null, 2) + '\n', 'utf8');

	// An inventory that could not read themes, plugins AND post types is not a
	// thin reading of a bare site — it is a reading that did not happen, and
	// reporting it as evidence is how a comparison later quotes numbers nobody
	// measured.
	const core = ['themes', 'plugins', 'post types'];
	const coreFailed = core.filter((label) => problems.some((p) => p.startsWith(`${label}:`)));
	if (coreFailed.length === core.length) {
		return { module: 'wordpress', status: 'failed', reason: `no inventory could be read: ${problems.join('; ')}` };
	}

	return {
		module: 'wordpress',
		status: problems.length ? 'complete_with_warnings' : 'complete',
		...(problems.length ? { reason: problems.join('; ') } : {}),
		evidence_path: 'wordpress/',
		tool: 'wp-cli',
		tool_version: null,
		headline: {
			core: inventory.core_version,
			php: inventory.php_version,
			theme: activeTheme,
			plugins_active: inventory.plugin_summary.active,
			post_types: (postTypes || []).length,
		},
	};
}

export { run_ as run };
