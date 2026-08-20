#!/usr/bin/env node
// Futurebase 2.x compatibility entry point. Keep stdout machine-readable;
// deprecation guidance is written to stderr only.

console.error('warning: wp-starter is deprecated; use futurebase (supported through Futurebase 2.x)');
const { runCli } = await import('./bootstrap.mjs');

await runCli(process.argv.slice(2));
