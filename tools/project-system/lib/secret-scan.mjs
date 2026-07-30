// lib/secret-scan.mjs — high-confidence secret scanner.
//
// The strict project schema cannot alone guarantee no secrets leak into free
// text, so promotion scans every file bound for the COMMITTED part of .project/
// and refuses (exit 6) on a hit. Patterns are deliberately high-confidence to
// keep false positives low; placeholders and env references are ignored.
//
// Binary attachments are SUPPOSED to belong to the gitignored "private" class,
// but nothing enforced that, and this module used to assume it — restricting
// itself to a handful of text extensions and silently skipping anything else.
// An assumption is not a guarantee, so the sniffing happens here now: callers
// pass every committed file and this decides, reporting what it cannot read
// instead of passing over it.

import { readFileSync, statSync } from 'node:fs';

const RULES = [
	['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
	['aws-access-key-id', /\bAKIA[0-9A-Z]{16}\b/],
	['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/],
	['github-pat', /\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
	['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
	['google-api-key', /\bAIza[0-9A-Za-z_\-]{35}\b/],
	['bearer-token', /\bBearer\s+[A-Za-z0-9\-._~+/]{24,}=*\b/],
	['basic-auth-url', /\b[a-z][a-z0-9+.\-]*:\/\/[^/\s:@]+:[^/\s:@]{3,}@/i],
	[
		// Group 1 is the VALUE. Placeholder suppression is applied to that group
		// alone, never the key or any trailing comment — see scanText.
		'assigned-secret',
		/\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["']?([A-Za-z0-9/+_\-]{16,})["']?/i,
	],
];

// Values that look like placeholders / references, not real secrets.
const IGNORE_VALUE = /example|changeme|your[-_]?|placeholder|xxxx+|\$\{|\bprocess\.env\b|<[^>]+>|\[[A-Z_]+\]|\*{4,}|redacted/i;

function redact(line) {
	const t = line.trim();
	return t.length > 80 ? t.slice(0, 77) + '…' : t;
}

export function scanText(text) {
	const findings = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		for (const [rule, re] of RULES) {
			const m = re.exec(line);
			if (!m) continue;
			// Suppress on the MATCHED VALUE, never the whole line. Testing the
			// line meant one incidental word disarmed the scanner for everything
			// on it: `api_key: <real key> # example production key` matched the
			// rule, hit `example` in the comment, and was dropped silently. A
			// credential is most likely to be annotated exactly when someone is
			// explaining what it is.
			const value = m[1] ?? m[0];
			if (IGNORE_VALUE.test(value)) continue;
			findings.push({ line: i + 1, rule, snippet: redact(line) });
			break; // one finding per line is enough to flag it
		}
	}
	return findings;
}

const SIZE_LIMIT = 512 * 1024;

// Scan a list of files. Returns [{ file, line, rule, snippet }].
//
// Fails CLOSED. A file this cannot read, or one too large to scan, yields an
// `unscannable` finding rather than being skipped — the caller treats any
// finding as a refusal, so "we did not look" can never be reported as "there
// was nothing there". Skipping was the dangerous default: a secret pasted into
// an oversized export left the gate green.
export function scanFiles(files) {
	const out = [];
	for (const file of files) {
		let size;
		try {
			size = statSync(file).size;
		} catch (err) {
			out.push({ file, line: 0, rule: 'unscannable', snippet: `could not stat: ${err.code || err.message}` });
			continue;
		}
		if (size > SIZE_LIMIT) {
			out.push({
				file,
				line: 0,
				rule: 'unscannable',
				snippet: `${Math.ceil(size / 1024)} KiB exceeds the ${SIZE_LIMIT / 1024} KiB scan limit — move it to the private (gitignored) class`,
			});
			continue;
		}

		let buf;
		try {
			buf = readFileSync(file);
		} catch (err) {
			out.push({ file, line: 0, rule: 'unscannable', snippet: `could not read: ${err.code || err.message}` });
			continue;
		}
		// A NUL byte in the first 8 KiB means binary. Those carry no scannable
		// text, and the committed record is not supposed to contain them, so
		// report rather than guess.
		if (buf.subarray(0, 8192).includes(0)) {
			out.push({ file, line: 0, rule: 'binary', snippet: 'binary file in the committed record — move it to the private (gitignored) class' });
			continue;
		}
		for (const f of scanText(buf.toString('utf8'))) out.push({ file, ...f });
	}
	return out;
}
