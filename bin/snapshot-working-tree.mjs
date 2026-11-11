// Overlay current source onto a disposable checkout without touching the caller's index.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const files = (root, extra = []) => execFileSync('git', ['ls-files', '-z', ...extra], { cwd: root }).toString().split('\0').filter(Boolean);

export function snapshotWorkingTree(source, destination) {
	if (resolve(source) === resolve(destination)) throw new Error('snapshot destination must be a disposable checkout');
	for (const path of files(destination)) rmSync(join(destination, path), { force: true });
	// Include new source files, but honor Git's ignore policy for credentials,
	// dependencies, local configuration, reports, and build caches.
	for (const path of new Set(files(source, ['--cached', '--others', '--exclude-standard']))) {
		const from = join(source, path);
		if (!existsSync(from)) continue;
		if (lstatSync(from).isDirectory()) throw new Error('submodule snapshots are unsupported');
		const to = join(destination, path);
		mkdirSync(dirname(to), { recursive: true });
		cpSync(from, to, { dereference: false, verbatimSymlinks: true });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	snapshotWorkingTree(process.argv[2], process.argv[3]);
}
