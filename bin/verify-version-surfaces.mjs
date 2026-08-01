#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = '2.0.0';
const failures = [];

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const record = (label, actual) => {
	if (actual !== expected) failures.push(`${label}: expected ${expected}, found ${JSON.stringify(actual)}`);
};

const headerValue = (relative, label) => {
	const match = read(relative).match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
	return match?.[1]?.trim();
};

const rootPackage = json('package.json');
const rootLock = json('package-lock.json');
const lifecyclePackage = json('tools/project-system/package.json');
const lifecycleLock = json('tools/project-system/package-lock.json');

record('style.css Version', headerValue('style.css', 'Version'));
record('readme.txt Stable tag', headerValue('readme.txt', 'Stable tag'));
record('package.json version', rootPackage.version);
record('package-lock.json version', rootLock.version);
record('package-lock.json root package version', rootLock.packages?.['']?.version);
record('tools/project-system/package.json version', lifecyclePackage.version);
record('tools/project-system/package-lock.json version', lifecycleLock.version);
record('tools/project-system/package-lock.json root package version', lifecycleLock.packages?.['']?.version);
record('tools/project-system/VERSION', read('tools/project-system/VERSION').trim());

if (failures.length > 0) {
	console.error('Futurebase version audit: FAIL');
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('Futurebase version audit: OK');
