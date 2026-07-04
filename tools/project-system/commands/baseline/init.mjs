// commands/baseline/init.mjs — write .project/baseline.config.yml.
//
// wp-starter baseline init [--type new|redesign] [--url <base>] [--page name=url]... [--force]

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { readYaml, writeYaml } from '../../lib/yaml.mjs';
import { validateBaselineConfig } from '../../lib/validate.mjs';

const DEFAULT_PAGES = {
	redesign: [
		{ name: 'home', url: '/', critical: true },
		{ name: 'contact', url: '/contact' },
	],
	new: [],
};
const DEFAULT_VIEWPORTS = [
	{ name: 'desktop', width: 1280, height: 800 },
	{ name: 'mobile', width: 390, height: 844 },
];

function parsePages(flags) {
	const raw = flags.page ? (Array.isArray(flags.page) ? flags.page : [flags.page]) : [];
	return raw.map((entry) => {
		const i = String(entry).indexOf('=');
		if (i < 0) return { name: String(entry), url: String(entry) };
		return { name: entry.slice(0, i), url: entry.slice(i + 1) };
	});
}

export function baselineInit(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found). Run from a promoted project or pass --project-root.', EXIT.ACCESS_FAILURE, { json });
	const paths = projectPaths(root);

	// Infer mode/type from project.yml when present.
	let type = flags.type;
	if (!type && existsSync(join(paths.projectDir, 'project.yml'))) {
		try {
			type = readYaml(join(paths.projectDir, 'project.yml'))?.project?.type;
		} catch {
			/* ignore */
		}
	}
	type = type || 'redesign';
	if (!['new', 'redesign'].includes(type)) die('--type must be new|redesign', EXIT.INVALID_CONFIG, { json });

	if (existsSync(paths.configPath) && !flags.force) die(`baseline config already exists: ${paths.configPath} (use --force to overwrite)`, EXIT.ACCESS_FAILURE, { json });

	const pages = parsePages(flags);
	const config = {
		schema_version: 1,
		kind: 'baseline-config',
		mode: type,
		base_url: flags.url || null,
		pages: pages.length ? pages : DEFAULT_PAGES[type],
		modules: type === 'new' ? ['manual'] : ['crawl', 'screenshots', 'lighthouse', 'axe', 'manual'],
		viewports: DEFAULT_VIEWPORTS,
	};
	// mark first page critical if none is
	if (config.pages.length && !config.pages.some((p) => p.critical)) config.pages[0].critical = true;

	const { valid, errors } = validateBaselineConfig(config);
	if (!valid) die(`internal error: generated baseline config invalid:\n  ${errors.join('\n  ')}`, EXIT.INVALID_CONFIG, { json });
	writeYaml(paths.configPath, config);

	if (json) emitJson({ status: 'created', path: paths.configPath, mode: type, modules: config.modules });
	ok(`baseline config written: ${paths.configPath}`);
	info(`mode: ${type}  ·  modules: ${config.modules.join(', ')}`);
	if (type !== 'new' && !flags.url) info('set base_url and pages in the config, then run: wp-starter baseline run');
	process.exit(EXIT.OK);
}
