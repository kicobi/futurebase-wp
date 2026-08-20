#!/usr/bin/env node
// Canonical entry point for the Futurebase project lifecycle CLI.

import { runCli } from './bootstrap.mjs';

await runCli(process.argv.slice(2));
