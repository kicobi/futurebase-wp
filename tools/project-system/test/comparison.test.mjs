// test/comparison.test.mjs — a before/after that refuses to mislead.
//
// compare.mjs used to assert that the shared capture engine guaranteed both
// runs used the same config. It did not: the config is a mutable file, and a
// base_url or viewport edited between the baseline (months before launch) and
// the final (at cutover) produced two runs that were never comparable — with
// arrows pointing at improvements and an empty limitations list.
//
// Run: npm test --prefix tools/project-system

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTargets } from '../lib/compare.mjs';

const run = (over = {}) => ({
	run_id: '2026-07-30T100000Z',
	modules: [{ module: 'lighthouse', status: 'complete', tool: 'lighthouse', tool_version: '12.0.0' }],
	target: {
		base_url: 'https://example.com',
		pages: [
			{ name: 'home', url: 'https://example.com/' },
			{ name: 'about', url: 'https://example.com/about/' },
		],
		viewports: [{ name: 'mobile', width: 390, height: 844 }],
		modules: ['crawl', 'lighthouse'],
		...over.target,
	},
	...(over.modules ? { modules: over.modules } : {}),
});

test('identical targets compare cleanly', () => {
	const { limitations, blocking } = compareTargets(run(), run());
	assert.deepEqual(blocking, []);
	assert.deepEqual(limitations, []);
});

test('differing viewports block the comparison', () => {
	// Codex's probe: different domains at 375px and 1440px reported three
	// improvements and zero limitations. The viewport half is the one that
	// makes every performance row meaningless, so it blocks rather than warns.
	const final = run({ target: { viewports: [{ name: 'desktop', width: 1440, height: 900 }] } });
	const { blocking } = compareTargets(run(), final);
	assert.equal(blocking.length, 1);
	assert.match(blocking[0], /viewports differ/);
	assert.match(blocking[0], /390x844/);
	assert.match(blocking[0], /1440x900/);
});

test('a differing host is disclosed, not blocked', () => {
	// Legitimate for a redesign that moves domain — refusing would break the
	// workflow the tool exists for. It must still be said.
	const final = run({ target: { base_url: 'https://new-domain.com' } });
	const { limitations, blocking } = compareTargets(run(), final);
	assert.deepEqual(blocking, []);
	assert.equal(limitations.length, 1);
	assert.match(limitations[0], /base URL host differs/);
	assert.match(limitations[0], /new-domain\.com/);
});

test('a differing page set is disclosed with both sides named', () => {
	const final = run({ target: { pages: [{ name: 'home', url: 'https://example.com/' }, { name: 'pricing', url: 'https://example.com/pricing/' }] } });
	const { limitations } = compareTargets(run(), final);
	const found = limitations.find((l) => l.includes('page set differs'));
	assert.ok(found, 'the page-set difference must be reported');
	assert.match(found, /baseline only: about/);
	assert.match(found, /final only: pricing/);
});

test('a differing module set is disclosed', () => {
	const final = run({ target: { modules: ['crawl'] } });
	const { limitations } = compareTargets(run(), final);
	assert.ok(limitations.some((l) => l.includes('module set differs')));
});

test('a differing tool version is disclosed', () => {
	const final = run({ modules: [{ module: 'lighthouse', status: 'complete', tool: 'lighthouse', tool_version: '13.1.0' }] });
	const { limitations } = compareTargets(run(), final);
	const found = limitations.find((l) => l.includes('tool versions'));
	assert.ok(found, 'a version change must be reported');
	assert.match(found, /12\.0\.0/);
	assert.match(found, /13\.1\.0/);
});

test('runs without a snapshot say so rather than claiming comparability', () => {
	// Every run captured before this field existed. Silence would read as "no
	// problems found", which is exactly the failure being fixed.
	const legacy = { run_id: 'old', modules: [] };
	const { limitations, blocking } = compareTargets(legacy, run());
	assert.deepEqual(blocking, [], 'legacy runs are not blocked, only qualified');
	assert.equal(limitations.length, 1);
	assert.match(limitations[0], /predate target snapshots/);
});

test('several differences are reported together, not just the first', () => {
	const final = run({
		target: {
			base_url: 'https://new-domain.com',
			viewports: [{ name: 'desktop', width: 1440, height: 900 }],
			modules: ['crawl'],
		},
	});
	const { limitations, blocking } = compareTargets(run(), final);
	assert.equal(blocking.length, 1, 'viewports block');
	assert.ok(limitations.length >= 2, `host and module set both disclosed (got ${limitations.length})`);
});
