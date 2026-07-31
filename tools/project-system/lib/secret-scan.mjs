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

// Each rule declares where the CREDENTIAL is inside its match, and whether
// placeholder suppression may apply to it at all.
//
// `suppressible: false` is for formats that are unambiguous on their own. A
// string matching `ghp_[A-Za-z0-9]{36}` is a GitHub token whatever 36
// characters it happens to contain — and one of them containing the substring
// "example" is not evidence of anything except chance. Suppressing those meant
// a real token could be waved through by its own body, and a basic-auth URL by
// its username. Only free-form values, where a human writes a placeholder on
// purpose, may be suppressed.
//
// The cost is a false positive on published sample credentials — AWS documents
// AKIAIOSFODNN7EXAMPLE, and this will flag it. That is the correct direction to
// fail for a gate standing in front of a client dossier: a false positive is
// visible and takes one edit to resolve, a false negative ships a key.
const RULES = [
	{ rule: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, group: 0, suppressible: false },
	{ rule: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/, group: 0, suppressible: false },
	{ rule: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/, group: 0, suppressible: false },
	{ rule: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/, group: 0, suppressible: false },
	{ rule: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, group: 0, suppressible: false },
	{ rule: 'google-api-key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/, group: 0, suppressible: false },
	// Group 1 is the token itself, without the `Bearer ` prefix.
	{ rule: 'bearer-token', re: /\bBearer\s+([A-Za-z0-9\-._~+/]{24,}=*)\b/, group: 1, suppressible: true },
	// Group 1 is the PASSWORD only — not the scheme, and not the username,
	// which is where `https://example-user:<real password>@host` hid.
	{ rule: 'basic-auth-url', re: /\b[a-z][a-z0-9+.\-]*:\/\/[^/\s:@]+:([^/\s:@]{3,})@/i, group: 1, suppressible: true },
	// Group 1 is the assigned value — never the key, never a trailing comment.
	{
		rule: 'assigned-secret',
		re: /\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["']?([A-Za-z0-9/+_\-]{16,})["']?/i,
		group: 1,
		suppressible: true,
	},
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
		for (const { rule, re, group, suppressible } of RULES) {
			const m = re.exec(line);
			if (!m) continue;
			// Suppress on the CREDENTIAL, and only where a placeholder is a thing
			// a human would plausibly write. Testing the whole line let a trailing
			// comment disarm the scanner; testing the whole match then let a
			// username or a token's own body do the same. What is compared now is
			// the captured value, for the rules where that is meaningful at all.
			const value = m[group] ?? m[0];
			if (suppressible && IGNORE_VALUE.test(value)) continue;
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
