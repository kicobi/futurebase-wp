import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');
const contract = JSON.parse(read('fixtures/seo-permanent-contract.json'));

function pluginDirectory() {
	const candidates = readdirSync(join(ROOT, 'plugins'))
		.filter((name) => name.endsWith('-seo'))
		.filter((name) => {
			try {
				readFileSync(join(ROOT, 'plugins', name, `${name}.php`));
				return true;
			} catch {
				return false;
			}
		});
	assert.equal(candidates.length, 1, 'exactly one companion SEO plugin must be discoverable');
	return `plugins/${candidates[0]}`;
}

function shellArray(source, name) {
	const match = source.match(new RegExp(`${name}=\\(\\n([\\s\\S]*?)\\n\\)`));
	assert.ok(match, `${name} must remain a readable shell array`);
	return match[1]
		.split('\n')
		.map((line) => line.trim().replace(/^['"]|['"]$/g, ''))
		.filter(Boolean);
}

function shellArrayBySuffix(source, suffix) {
	const matches = [...source.matchAll(new RegExp(`^([A-Z][A-Z0-9_]*${suffix})=\\($`, 'gm'))];
	assert.equal(matches.length, 1, `exactly one ${suffix} shell array must exist`);
	return shellArray(source, matches[0][1]);
}

function callArguments(source, callee) {
	const calls = [];
	const needle = `${callee}(`;
	let offset = 0;
	while ((offset = source.indexOf(needle, offset)) !== -1) {
		const start = offset + needle.length;
		let depth = 1;
		let quote = '';
		let escaped = false;
		for (let index = start; index < source.length; index += 1) {
			const character = source[index];
			if (quote) {
				if (escaped) escaped = false;
				else if (character === '\\') escaped = true;
				else if (character === quote) quote = '';
				continue;
			}
			if (character === "'" || character === '"') quote = character;
			else if (character === '(') depth += 1;
			else if (character === ')') {
				depth -= 1;
				if (depth === 0) {
					calls.push(source.slice(start, index));
					offset = index + 1;
					break;
				}
			}
		}
	}
	return calls;
}

function topLevelArguments(source) {
	const argumentsList = [];
	let start = 0;
	let depth = 0;
	let quote = '';
	let escaped = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (quote) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === quote) quote = '';
			continue;
		}
		if (character === "'" || character === '"') quote = character;
		else if (character === '(' || character === '[') depth += 1;
		else if (character === ')' || character === ']') depth -= 1;
		else if (character === ',' && depth === 0) {
			argumentsList.push(source.slice(start, index).trim());
			start = index + 1;
		}
	}
	argumentsList.push(source.slice(start).trim());
	return argumentsList;
}

function emittedReasonCodes(source) {
	const reasons = new Set();
	for (const callee of ['self::decision', 'self::archive', 'self::policy_decision']) {
		for (const call of callArguments(source, callee)) {
			const argumentsList = topLevelArguments(call);
			const reason = argumentsList.at(-1) || '';
			for (const match of reason.matchAll(/'([a-z][a-z0-9_]*)'/g)) reasons.add(match[1]);
		}
	}
	return [...reasons].sort();
}

test('permanent identifiers agree across code, promotion, and documentation', () => {
	const plugin = pluginDirectory();
	const identifiers = read(`${plugin}/includes/class-identifiers.php`);
	const renameContract = read('tools/project-system/config/rename-contract.sh');
	const readme = read(`${plugin}/README.md`);
	const expected = [...contract.meta_keys, contract.option, ...contract.filters.map(({ name }) => name)];
	const constants = [...identifiers.matchAll(/public const [A-Z_]+\s*=\s*'([^']+)'/g)].map((match) => match[1]);

	assert.deepEqual(constants, expected);
	assert.deepEqual(shellArrayBySuffix(renameContract, '_SEO_FROZEN_IDENTIFIERS'), expected);
	for (const identifier of expected) assert.ok(readme.includes('`' + identifier + '`'), `${identifier} is missing from the README`);
});

test('all six documented filters retain their production seams and exact signatures', () => {
	const plugin = pluginDirectory();
	const contracts = read(`${plugin}/includes/class-contracts.php`);
	const identifiers = read(`${plugin}/includes/class-identifiers.php`);
	const readme = read(`${plugin}/README.md`);
	const constants = new Map(
		[...identifiers.matchAll(/public const ([A-Z_]+)\s*=\s*'([^']+)'/g)].map((match) => [match[2], match[1]]),
	);

	assert.equal(contract.filters.length, 6);
	for (const filter of contract.filters) {
		const constant = constants.get(filter.name);
		assert.ok(constant, `${filter.name} is missing from Identifiers`);
		assert.match(contracts, new RegExp(`apply_filters\\(\\s*Identifiers::${constant}`));
		assert.ok(readme.includes('`' + filter.signature + '`'), `${filter.name} signature drifted from the README`);
	}
});

test('payload keys, tri-states, reason codes, and CLI commands remain documented and implemented', () => {
	const plugin = pluginDirectory();
	const contracts = read(`${plugin}/includes/class-contracts.php`);
	const decision = read(`${plugin}/includes/class-decision.php`);
	const cli = read(`${plugin}/includes/class-cli.php`);
	const readme = read(`${plugin}/README.md`);

	for (const [payload, keys] of Object.entries(contract.payloads)) {
		for (const key of Object.keys(keys)) {
			assert.ok(contracts.includes(`'${key}'`), `${payload}.${key} is not validated in production`);
			assert.ok(readme.includes('`' + key + '`') || readme.includes(key), `${payload}.${key} is undocumented`);
		}
	}
	for (const values of Object.values(contract.tri_states)) {
		for (const value of values) assert.ok(contracts.includes(`'${value}'`), `${value} is not accepted by the contract validator`);
	}
	assert.deepEqual(emittedReasonCodes(decision), [...contract.reason_codes].sort(), 'resolver reason codes drifted from the permanent manifest');
	for (const reason of contract.reason_codes) {
		assert.ok(readme.includes('`' + reason + '`'), `${reason} is missing from the README`);
	}
	const commands = [...cli.matchAll(/public function ([a-z][a-z0-9_]*)\s*\(/g)].map((match) => match[1]).sort();
	assert.deepEqual(commands, [...contract.cli_subcommands].sort(), 'WP-CLI subcommands drifted from the permanent manifest');
	for (const command of contract.cli_subcommands) {
		assert.ok(readme.includes(`wp compseo ${command}`), `${command} is missing from the README`);
	}
});
