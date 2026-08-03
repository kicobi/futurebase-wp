// commands/metrics/client-message.mjs — generate the client-facing "how will we
// know this succeeded?" message from the approved metrics (spec §11.1).
//
// futurebase metrics client-message [--write] [--json] [--project-root <p>]

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, die, ok, info, emitJson } from '../../lib/output.mjs';
import { findProjectRoot, projectPaths } from '../../lib/baseline.mjs';
import { loadMetrics, splitTiming } from '../../lib/metrics.mjs';
import { requirePath } from '../../lib/paths.mjs';

export function metricsClientMessage(_positional, flags) {
	const json = !!flags.json;
	const root = findProjectRoot(process.cwd(), flags['project-root']);
	if (!root) die('not inside an active project (no .project/ found).', EXIT.ACCESS_FAILURE, { json });
	const { projectDir } = projectPaths(root);
	const doc = loadMetrics(projectDir);
	const items = doc.items || [];
	if (!items.length) die('no metrics yet — run: futurebase metrics suggest', EXIT.INVALID_CONFIG, { json });

	// Client message features outcome + satisfaction measures (what improved),
	// not internal delivery checks.
	const outcomes = items.filter((m) => m.category !== 'delivery');
	const { post } = splitTiming(items);
	const bullets = (outcomes.length ? outcomes : items).map((m) => `- ${m.title}`).join('\n');

	const message = `Before I begin, I would like to agree on how we will measure whether the project has been successful.

Based on what we have discussed, I suggest measuring:
${bullets}

I will capture the current state before work begins so we can compare it with the completed version. Some measures can be checked at launch${post.length ? ', while others may be more useful 30 days later' : ''}.

Do these feel like the right measures of success?
`;

	if (flags.write) {
		const out = requirePath(projectDir, join('metrics', 'client-message.md'));
		writeFileSync(out, message, 'utf8');
		if (json) emitJson({ status: 'written', path: out });
		ok(`client message written: ${out}`);
		process.exit(EXIT.OK);
	}

	if (json) emitJson({ status: 'ok', message });
	process.stdout.write(message);
	process.exit(EXIT.OK);
}
