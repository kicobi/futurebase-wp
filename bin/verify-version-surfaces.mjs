#!/usr/bin/env node
//
// Version surfaces must agree — within their own group.
//
// There are two independent groups, and conflating them broke every promoted
// project. `npm run rename` sets the client theme to 1.0.0 by default, but this
// audit asserted one hardcoded Futurebase version across every surface, so
// `npm run verify` failed on a normal rename: style.css, readme.txt and both
// package files all reported "wrong" for carrying the version the rename had
// just given them.
//
//   client theme     what a project ships. Whatever version it is, every surface
//                    must say the same thing — a bumped style.css beside a stale
//                    package.json is the defect actually worth catching.
//
//   lifecycle        the vendored project-system. tools/ syncs verbatim, so this
//                    stays at Futurebase's version inside every client and is
//                    deliberately free to differ from the theme's.
//
// Neither group is compared against a constant. Internal consistency is the
// property worth enforcing; the value is whatever the release set.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

const headerValue = (relative, label) => {
	const match = read(relative).match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
	return match?.[1]?.trim();
};

const rootPackage = json('package.json');
const rootLock = json('package-lock.json');
const lifecyclePackage = json('tools/project-system/package.json');
const lifecycleLock = json('tools/project-system/package-lock.json');

const groups = [
	{
		name: 'client theme',
		surfaces: [
			['style.css Version', headerValue('style.css', 'Version')],
			['readme.txt Stable tag', headerValue('readme.txt', 'Stable tag')],
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

const failures = [];
for (const group of groups) {
	const [referenceLabel, reference] = group.surfaces[0];
	if (!reference) {
		failures.push(`${group.name}: ${referenceLabel} is missing`);
		continue;
	}
	if (!/^\d+\.\d+\.\d+/.test(reference)) {
		failures.push(`${group.name}: ${referenceLabel} is not a version (${JSON.stringify(reference)})`);
	}
	for (const [label, actual] of group.surfaces.slice(1)) {
		if (actual !== reference) {
			failures.push(`${group.name}: ${label} is ${JSON.stringify(actual)}, but ${referenceLabel} is ${JSON.stringify(reference)}`);
		}
	}
}

if (failures.length > 0) {
	console.error('version audit: FAIL');
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log(`version audit: OK (${groups.map((g) => `${g.name} ${g.surfaces[0][1]}`).join(', ')})`);
