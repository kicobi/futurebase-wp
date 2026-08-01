#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(message) {
	console.error(`error: ${message}`);
	process.exit(1);
}

const args = process.argv.slice(2);
let manifestPath = null;
let lockPath = null;

for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	if (arg === '--manifest') manifestPath = args[++index] ?? null;
	else if (arg === '--lock') lockPath = args[++index] ?? null;
	else fail(`unexpected argument: ${arg}`);
}

if (!manifestPath || !lockPath) fail('usage: reconcile-package-lock.mjs --manifest <package.json> --lock <package-lock.json>');

let manifestRaw;
let lockRaw;
let manifest;
let lock;
try {
	manifestRaw = readFileSync(resolve(manifestPath), 'utf8');
	lockRaw = readFileSync(resolve(lockPath), 'utf8');
	manifest = JSON.parse(manifestRaw);
	lock = JSON.parse(lockRaw);
} catch (error) {
	fail(error.message);
}

if (typeof manifest.name !== 'string' || !manifest.name) fail('package.json must declare a non-empty name');
if (typeof manifest.version !== 'string' || !manifest.version) fail('package.json must declare a non-empty version');
if (!lock.packages || typeof lock.packages[''] !== 'object') fail('package-lock.json must contain packages[""]');

lock.name = manifest.name;
lock.version = manifest.version;
lock.packages[''].name = manifest.name;
lock.packages[''].version = manifest.version;

const indent = lockRaw.match(/\n([ \t]+)"/)?.[1] ?? '\t';
const newline = lockRaw.endsWith('\n') ? '\n' : '';
writeFileSync(resolve(lockPath), JSON.stringify(lock, null, indent) + newline, 'utf8');
