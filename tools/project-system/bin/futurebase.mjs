#!/usr/bin/env node
// Canonical entry point for the Futurebase project lifecycle CLI.

import { main } from '../cli/dispatch.mjs';

main(process.argv.slice(2)).catch((error) => {
	console.error(`✗ ${error?.stack || error?.message || error}`);
	process.exit(5);
});
