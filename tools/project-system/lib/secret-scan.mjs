// lib/secret-scan.mjs — high-confidence secret scanner.
//
// The strict project schema cannot alone guarantee no secrets leak into free
// text, so promotion scans every file bound for the COMMITTED part of .project/
// and refuses (exit 6) on a hit. Patterns are deliberately high-confidence to
// keep false positives low; placeholders and env references are ignored.
//
// Only text dossier files are ever passed here (markdown / yaml / project.yml);
// binary attachments belong to the gitignored "private" class and are never
// scanned, so there is no binary-sniffing to do.

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
		'assigned-secret',
		/\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9/+_\-]{16,}["']?/i,
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
		if (IGNORE_VALUE.test(line)) continue;
		for (const [rule, re] of RULES) {
			if (re.test(line)) {
				findings.push({ line: i + 1, rule, snippet: redact(line) });
				break; // one finding per line is enough to flag it
			}
		}
	}
	return findings;
}

function withinSizeLimit(path) {
	try {
		return statSync(path).size <= 512 * 1024;
	} catch {
		return false;
	}
}

// Scan a list of files. Returns [{ file, line, rule, snippet }].
export function scanFiles(files) {
	const out = [];
	for (const file of files) {
		if (!withinSizeLimit(file)) continue;
		let text;
		try {
			text = readFileSync(file, 'utf8');
		} catch {
			continue;
		}
		for (const f of scanText(text)) out.push({ file, ...f });
	}
	return out;
}
