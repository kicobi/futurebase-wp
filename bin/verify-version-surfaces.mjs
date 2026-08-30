#!/usr/bin/env node
//
// Version and compatibility surfaces must agree within their own groups.
//
// Nothing here compares a client project against a Futurebase constant. A
// promoted theme gets its own version during rename, and a maintained project
// may deliberately raise its WordPress floor. The local checkout is the source
// of truth: package metadata supplies product versions and .wp-env.json supplies
// the WordPress floor exercised by local development and compatibility CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function headerValue(text, label) {
	const match = String(text).match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, 'm'));
	return match?.[1]?.trim();
}

export function commentHeaderValue(text, label) {
	const match = String(text).match(new RegExp(`^\\s*\\*\\s*${escapeRegExp(label)}:\\s*(.+)$`, 'm'));
	return match?.[1]?.trim();
}

export function companionRuntimeVersion(text) {
	const matches = [...String(text || '').matchAll(/define\(\s*['"]([A-Z0-9_]+_SEO_VERSION)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g)];
	return matches.length === 1 ? matches[0][2] : null;
}

export function latestChangelogVersion(text) {
	return /^=\s*(\d+\.\d+\.\d+)\s*=$/m.exec(String(text || ''))?.[1] ?? null;
}

export function wordpressFloor(core) {
	const match = String(core || '').match(/^WordPress\/WordPress#(\d+\.\d+(?:\.\d+)?)$/);
	return match?.[1] || null;
}

export function versionParts(value) {
	const match = String(value || '').match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
	return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

export function sameMajorMinor(actual, expected) {
	const a = versionParts(actual);
	const b = versionParts(expected);
	return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

export function compareVersions(left, right) {
	const a = versionParts(left);
	const b = versionParts(right);
	if (!a || !b) return null;
	for (let index = 0; index < 3; index += 1) {
		if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
	}
	return 0;
}

function discoverSeoPlugin(root) {
	const plugins = path.join(root, 'plugins');
	let names = [];
	try {
		names = fs.readdirSync(plugins).filter((name) => name.endsWith('-seo')).sort();
	} catch {
		return null;
	}
	for (const name of names) {
		const readme = path.join(plugins, name, 'readme.txt');
		const bootstrap = path.join(plugins, name, `${name}.php`);
		if (fs.existsSync(readme) && fs.existsSync(bootstrap)) return { name, readme, bootstrap };
	}
	return null;
}

function exactGroup(failures, name, surfaces, { versionPattern = null } = {}) {
	const [referenceLabel, reference] = surfaces[0];
	if (!reference) {
		failures.push(`${name}: ${referenceLabel} is missing`);
		return;
	}
	if (versionPattern && !versionPattern.test(reference)) {
		failures.push(`${name}: ${referenceLabel} is not a version (${JSON.stringify(reference)})`);
	}
	for (const [label, actual] of surfaces.slice(1)) {
		if (actual !== reference) {
			failures.push(`${name}: ${label} is ${JSON.stringify(actual)}, but ${referenceLabel} is ${JSON.stringify(reference)}`);
		}
	}
}

export function auditVersionSurfaces(root = DEFAULT_ROOT) {
	const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
	const json = (relative) => JSON.parse(read(relative));
	const failures = [];
	const summaries = [];

	const rootPackage = json('package.json');
	const rootLock = json('package-lock.json');
	const lifecyclePackage = json('tools/project-system/package.json');
	const lifecycleLock = json('tools/project-system/package-lock.json');
	const wpEnv = json('.wp-env.json');
	const style = read('style.css');
	const themeReadme = read('readme.txt');
	const plugin = discoverSeoPlugin(root);
	const pluginReadme = plugin ? fs.readFileSync(plugin.readme, 'utf8') : null;
	const pluginBootstrap = plugin ? fs.readFileSync(plugin.bootstrap, 'utf8') : null;

	const productGroups = [
		{
			name: 'client theme',
			surfaces: [
				['style.css Version', headerValue(style, 'Version')],
				['readme.txt Stable tag', headerValue(themeReadme, 'Stable tag')],
				['package.json version', rootPackage.version],
				['package-lock.json version', rootLock.version],
				['package-lock.json root package version', rootLock.packages?.['']?.version],
			],
		},
		{
			name: 'lifecycle',
			surfaces: [
				['tools/project-system/VERSION', read('tools/project-system/VERSION').trim()],
				['tools/project-system/package.json version', lifecyclePackage.version],
				['tools/project-system/package-lock.json version', lifecycleLock.version],
				['tools/project-system/package-lock.json root package version', lifecycleLock.packages?.['']?.version],
			],
		},
	];
	if (plugin) {
		productGroups.push({
			name: 'companion SEO',
			surfaces: [
				[`${plugin.name} bootstrap Version`, commentHeaderValue(pluginBootstrap, 'Version')],
				[`${plugin.name} runtime version constant`, companionRuntimeVersion(pluginBootstrap)],
				[`${plugin.name} readme Stable tag`, headerValue(pluginReadme, 'Stable tag')],
				[`${plugin.name} newest changelog heading`, latestChangelogVersion(pluginReadme)],
			],
		});
	}
	for (const group of productGroups) {
		exactGroup(failures, group.name, group.surfaces, { versionPattern: /^\d+\.\d+\.\d+/ });
		summaries.push(`${group.name} ${group.surfaces[0][1] ?? '?'}`);
	}

	const floor = wordpressFloor(wpEnv.core);
	if (!floor) {
		failures.push(`WordPress compatibility: .wp-env.json core must be a pinned WordPress/WordPress#<major.minor> value (found ${JSON.stringify(wpEnv.core)})`);
	} else {
		const minimums = [
			['.wp-env.json core floor', floor],
			['style.css Requires at least', headerValue(style, 'Requires at least')],
			['readme.txt Requires at least', headerValue(themeReadme, 'Requires at least')],
		];
		if (plugin) {
			minimums.push(
				[`${plugin.name}/readme.txt Requires at least`, headerValue(pluginReadme, 'Requires at least')],
				[`${plugin.name}/${plugin.name}.php Requires at least`, commentHeaderValue(pluginBootstrap, 'Requires at least')],
			);
		}
		exactGroup(failures, 'WordPress minimum', minimums, { versionPattern: /^\d+\.\d+(?:\.\d+)?$/ });
		summaries.push(`WordPress floor ${floor}`);
	}

	const tested = [
		['style.css Tested up to', headerValue(style, 'Tested up to')],
		['readme.txt Tested up to', headerValue(themeReadme, 'Tested up to')],
	];
	if (plugin) tested.push([`${plugin.name}/readme.txt Tested up to`, headerValue(pluginReadme, 'Tested up to')]);
	exactGroup(failures, 'WordPress tested up to', tested, { versionPattern: /^\d+\.\d+(?:\.\d+)?$/ });
	const testedUpTo = tested[0][1] || null;
	summaries.push(`tested through ${testedUpTo ?? '?'}`);

	const lighthouse = [
		['package.json devDependencies.lighthouse', rootPackage.devDependencies?.lighthouse],
		['package-lock.json Lighthouse version', rootLock.packages?.['node_modules/lighthouse']?.version],
		['@lhci/cli Lighthouse dependency', rootLock.packages?.['node_modules/@lhci/cli']?.dependencies?.lighthouse],
	];
	exactGroup(failures, 'Lighthouse toolchain', lighthouse, { versionPattern: /^\d+\.\d+\.\d+$/ });
	summaries.push(`Lighthouse ${lighthouse[0][1] ?? '?'}`);

	return { failures, summaries, floor, testedUpTo };
}

export function main(args = process.argv.slice(2), root = DEFAULT_ROOT) {
	let assertFloor = null;
	let warnNewer = null;
	for (const arg of args) {
		if (arg.startsWith('--assert-floor=')) assertFloor = arg.slice('--assert-floor='.length);
		else if (arg.startsWith('--warn-newer=')) warnNewer = arg.slice('--warn-newer='.length);
		else throw new Error(`unknown argument: ${arg}`);
	}

	const result = auditVersionSurfaces(root);
	if (assertFloor && !sameMajorMinor(assertFloor, result.floor)) {
		result.failures.push(`WordPress floor lane resolved ${JSON.stringify(assertFloor)}, expected major.minor ${JSON.stringify(result.floor)}`);
	}
	if (warnNewer) {
		const comparison = compareVersions(warnNewer, result.testedUpTo);
		if (comparison === null) result.failures.push(`could not compare latest ${JSON.stringify(warnNewer)} with Tested up to ${JSON.stringify(result.testedUpTo)}`);
		else if (comparison > 0) {
			const message = `WordPress ${warnNewer} is newer than the declared Tested up to ${result.testedUpTo}; review compatibility and update the claim.`;
			console.log(process.env.GITHUB_ACTIONS ? `::warning title=WordPress compatibility claim is stale::${message}` : `warning: ${message}`);
		}
	}

	if (result.failures.length > 0) {
		console.error('version audit: FAIL');
		for (const failure of result.failures) console.error(`  - ${failure}`);
		return 1;
	}
	console.log(`version audit: OK (${result.summaries.join(', ')})`);
	return 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.error(`version audit: FAIL\n  - ${error.message}`);
		process.exitCode = 1;
	}
}
