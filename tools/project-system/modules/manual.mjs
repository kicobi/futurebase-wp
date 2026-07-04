// modules/manual.mjs — scaffold human-observation notes for the run.
// Automation cannot capture frustrations, fragile workflows, or (for new sites)
// the current business process. This module seeds prompt templates a human
// fills in; it is always "complete" once scaffolded.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OBSERVATIONS = `# Manual observations

_Interpretations, not measurements. Move confirmed metrics into .project/metrics/._

- What currently frustrates the client / editors?
- What takes too long or requires developer help?
- What is most likely to break? What must not change?
- Visual hierarchy / navigation problems?
- Known business risks?
`;

const NEW_SITE = `# New-site baseline (current business state)

## Existing presence
_Holding page, previous site, social profiles, PDFs, Notion, booking pages…_

## Current operational process
_How are enquiries / bookings / donations / registrations handled today?_

## Content readiness
| Page | Owner | Status (ready/draft/missing/awaiting/needs-rewrite) |
|------|-------|-----------------------------------------------------|

## Audience & objectives
_Primary/secondary audiences, primary conversion, what the site must make possible._

## What becomes measurable after launch
_Enquiries, downloads, publishing time, editor independence, support requests…_
`;

export async function run(ctx) {
	const { runDir, config } = ctx;
	const notesDir = join(runDir, 'notes');
	mkdirSync(notesDir, { recursive: true });

	const write = (name, body) => {
		const p = join(notesDir, name);
		if (!existsSync(p)) writeFileSync(p, body, 'utf8');
	};
	write('observations.md', OBSERVATIONS);
	if (config.mode === 'new') write('new-site-baseline.md', NEW_SITE);

	return {
		module: 'manual',
		status: 'complete',
		evidence_path: 'notes/',
		headline: { templates: config.mode === 'new' ? 2 : 1 },
	};
}
