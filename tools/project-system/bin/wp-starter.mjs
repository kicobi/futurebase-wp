#!/usr/bin/env node
// bin/wp-starter.mjs — entry point for the project lifecycle CLI.
//
// Run directly:   node tools/project-system/bin/wp-starter.mjs lead init "Acme" --type redesign
// Or link it:     (cd tools/project-system && npm link)  ->  wp-starter lead init ...

import { main } from '../cli/dispatch.mjs';

main(process.argv.slice(2)).catch((err) => {
	console.error(`✗ ${err?.stack || err?.message || err}`);
	process.exit(5);
});
