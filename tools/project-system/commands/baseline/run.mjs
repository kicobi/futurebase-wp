// commands/baseline/run.mjs — capture the kickoff baseline.
//
// wp-starter baseline run [--module <m>] [--url <base>] [--dry-run] [--json] [--project-root <p>]
//
// Thin wrapper over the shared capture engine (see commands/capture.mjs), which
// baseline and final share so the two runs are captured identically.

import { runCapture } from '../capture.mjs';

export function baselineRun(_positional, flags) {
	return runCapture('baseline', flags);
}
