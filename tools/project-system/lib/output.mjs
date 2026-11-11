// lib/output.mjs — terminal output helpers + structured exit codes.
//
// Mirrors the pass/fail/warn styling of the repo's bin/*.sh scripts and the
// exit-code contract documented in ARCHITECTURE.md.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code, s) => (useColor ? `[${code}m${s}[0m` : s);

export const c = {
	green: (s) => wrap('32', s),
	red: (s) => wrap('31', s),
	yellow: (s) => wrap('33', s),
	dim: (s) => wrap('2', s),
	bold: (s) => wrap('1', s),
};

export const EXIT = {
	OK: 0,
	WARNINGS: 1,
	INVALID_CONFIG: 2,
	MISSING_DEP: 3,
	ACCESS_FAILURE: 4,
	MODULE_FAILURE: 5,
	PRIVACY_VIOLATION: 6,
};

export const ok = (msg) => console.log(`${c.green('✓')} ${msg}`);
export const warn = (msg) => console.log(`${c.yellow('!')} ${msg}`);
export const info = (msg) => console.log(`  ${c.dim(msg)}`);
export const fail = (msg) => console.error(`${c.red('✗')} ${msg}`);

// Terminate command control flow synchronously; the CLI boundary flushes output
// asynchronously. Returning a promise here would let existing callers continue
// into mutations or human output while the pipe is still draining.
export class OutputExit extends Error {
	constructor(text, code, stream = 'stdout') {
		super('command completed');
		this.text = text;
		this.code = code;
		this.stream = stream;
	}
}

export async function finishOutput(error) {
	await new Promise((resolve, reject) => {
		process[error.stream].write(error.text, (failure) => failure ? reject(failure) : resolve());
	});
	process.exitCode = error.code;
}

// Emit a machine-readable result and terminate the command. Used for --json.
export function emitJson(obj, code = EXIT.OK) {
	throw new OutputExit(JSON.stringify(obj, null, 2) + '\n', code);
}

// Fatal error: print (or emit JSON) and exit with a structured code.
export function die(message, code = EXIT.INVALID_CONFIG, { json = false } = {}) {
	if (json) {
		emitJson({ status: 'error', code, message }, code);
	}
	throw new OutputExit(`${c.red('✗')} ${message}\n`, code, 'stderr');
}
