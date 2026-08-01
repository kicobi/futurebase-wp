#!/usr/bin/env node
// Futurebase 2.x compatibility entry point. Keep stdout machine-readable;
// deprecation guidance is written to stderr only.

console.error('warning: wp-starter is deprecated; use futurebase (supported through Futurebase 2.x)');
const { main } = await import('../cli/dispatch.mjs');

main(process.argv.slice(2)).catch((error) => {
	console.error(`✗ ${error?.stack || error?.message || error}`);
	process.exit(5);
});
