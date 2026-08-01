// commands/final/run.mjs — capture the final (pre-launch/launch) state.
//
// futurebase final run [--module <m>] [--url <base>] [--dry-run] [--json] [--project-root <p>]
//
// Uses the SAME capture engine + config as `baseline run`, writing to
// .project/final/<run-id>/, so `futurebase compare` can diff like-for-like.

import { runCapture } from '../capture.mjs';

export function finalRun(_positional, flags) {
	return runCapture('final', flags);
}
