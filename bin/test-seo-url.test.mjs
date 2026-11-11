import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
const directory = new URL('../plugins/', import.meta.url);
const plugins = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('-seo')) : [];
const source = plugins.length === 1 ? new URL(`${plugins[0]}/src/canonical-url.mjs`, directory) : null;
if (!source || !existsSync(source)) {
	test('canonical URL acceptance', { skip: 'companion validator is not present in this client project' }, () => {});
} else {
	const { isValidCanonical } = await import(source);
	const cases = JSON.parse(readFileSync(new URL('fixtures/seo-canonical-urls.json', import.meta.url), 'utf8'));
	for (const { value, valid } of cases) {
		test(`canonical URL acceptance: ${JSON.stringify(value)}`, () => assert.equal(isValidCanonical(value), valid));
	}
}
