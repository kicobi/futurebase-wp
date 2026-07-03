// lib/browser.mjs — resolve Playwright / Chromium at runtime.
//
// Playwright is not a dependency of this tool; it is resolved from the host
// project's node_modules (Node walks up from here). Modules that need a browser
// call loadChromium() and degrade to "unavailable" when it returns null.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export async function loadChromium() {
	try {
		const pw = await import('playwright');
		return pw.chromium;
	} catch {
		return null;
	}
}

export function pkgVersion(name) {
	try {
		return require(`${name}/package.json`).version;
	} catch {
		return null;
	}
}

// Resolve a module's file path (walking up node_modules from this tool).
export function resolveFrom(specifier) {
	try {
		return require.resolve(specifier);
	} catch {
		return null;
	}
}

export function requireIfPresent(name) {
	try {
		return require(name);
	} catch {
		return null;
	}
}
