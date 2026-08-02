// modules/manual.mjs — scaffold human-observation notes for the run.
// Automation cannot capture frustrations, fragile workflows, or (for new sites)
// the current business process. This module seeds prompt templates a human
// fills in.
//
// It used to report "complete" the moment it had written its own templates. A
// new-site baseline runs this module alone, so `baseline run` reported a
// captured baseline for a project where nobody had written anything down — and
// evidenceVerdict() then accepted it as the before half of a client comparison.
// Writing a question is not answering it.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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

	const templates = [['observations.md', OBSERVATIONS]];
	if (config.mode === 'new') templates.push(['new-site-baseline.md', NEW_SITE]);

	// A file identical to the prompt it was seeded from carries no observation,
	// whether it was written this run or left untouched from a previous one.
	const untouched = [];
	for (const [name, body] of templates) {
		const path = join(notesDir, name);
		if (!existsSync(path)) {
			writeFileSync(path, body, 'utf8');
			untouched.push(name);
			continue;
		}
		if (readFileSync(path, 'utf8').trim() === body.trim()) untouched.push(name);
	}

	if (untouched.length === templates.length) {
		return {
			module: 'manual',
			status: 'pending',
			reason: `awaiting human observations — ${untouched.join(', ')} still ${untouched.length === 1 ? 'holds' : 'hold'} only the scaffolded prompt`,
		};
	}

	return {
		module: 'manual',
		status: untouched.length ? 'complete_with_warnings' : 'complete',
		...(untouched.length ? { reason: `unedited: ${untouched.join(', ')}` } : {}),
		evidence_path: 'notes/',
		headline: { templates: templates.length, recorded: templates.length - untouched.length },
	};
}
