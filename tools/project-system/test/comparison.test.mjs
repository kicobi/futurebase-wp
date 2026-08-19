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
import { compareTargets, renderComparison } from '../lib/compare.mjs';

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

test('a differing base origin is disclosed, not blocked', () => {
	// Legitimate for a redesign that moves domain — refusing would break the
	// workflow the tool exists for. It must still be said.
	const final = run({ target: {
		base_url: 'https://new-domain.com',
		pages: [
			{ name: 'home', url: 'https://new-domain.com/' },
			{ name: 'about', url: 'https://new-domain.com/about/' },
		],
	} });
	const { limitations, blocking } = compareTargets(run(), final);
	assert.deepEqual(blocking, []);
	assert.equal(limitations.length, 1);
	assert.match(limitations[0], /base URL origin differs/);
	assert.match(limitations[0], /new-domain\.com/);
});

test('scheme and port changes count as base-origin differences', () => {
	for (const baseUrl of ['http://example.com', 'https://example.com:8443']) {
		const { limitations, blocking } = compareTargets(run(), run({ target: {
			base_url: baseUrl,
			pages: [
				{ name: 'home', url: `${baseUrl}/` },
				{ name: 'about', url: `${baseUrl}/about/` },
			],
		} }));
		assert.deepEqual(blocking, []);
		assert.ok(limitations.some((reason) => reason.includes('base URL origin differs')), baseUrl);
	}
});

test('a differing page set is disclosed with both sides named', () => {
	const final = run({ target: { pages: [{ name: 'home', url: 'https://example.com/' }, { name: 'pricing', url: 'https://example.com/pricing/' }] } });
	const { limitations } = compareTargets(run(), final);
	const found = limitations.find((l) => l.includes('page set differs'));
	assert.ok(found, 'the page-set difference must be reported');
	assert.match(found, /baseline only: about/);
	assert.match(found, /final only: pricing/);
});

test('the same page name pointing at a different path blocks on the same host', () => {
	// Matching labels are not matching pages. Comparing names alone let
	// `home = /` and `home = /checkout/` through with nothing reported at all,
	// and case-study will publish that difference as an improvement.
	const final = run({ target: { pages: [{ name: 'home', url: 'https://example.com/checkout/' }, { name: 'about', url: 'https://example.com/pricing/' }] } });
	const { blocking } = compareTargets(run(), final);
	assert.equal(blocking.length, 1);
	assert.match(blocking[0], /different path/);
	assert.match(blocking[0], /a different page, not a changed one/);
});

test('a moved domain may move its paths without blocking', () => {
	// The redesign workflow this tool exists for: old site baselined, new site
	// finalled, URLs different on both counts. Blocking here would make
	// --allow-mismatch the normal case, which defeats the point of having it.
	const old = run({ target: { base_url: 'https://old.com', pages: [{ name: 'home', url: 'https://old.com/' }, { name: 'about', url: 'https://old.com/about/' }] } });
	const neu = run({ target: { base_url: 'https://new.com', pages: [{ name: 'home', url: 'https://new.com/' }, { name: 'about', url: 'https://new.com/about-us/' }] } });
	const { blocking, limitations } = compareTargets(old, neu);
	assert.deepEqual(blocking, []);
	assert.ok(limitations.some((l) => l.includes('confirm each pairing')));
});

test('off-base absolute page origins block even when the declared base is unchanged', () => {
	const baseline = run({ target: { pages: [{ name: 'home', url: 'https://one.test/preview?token=SameSecret987' }] } });
	const final = run({ target: { pages: [{ name: 'home', url: 'https://two.test/preview?token=SameSecret987' }] } });
	const { blocking } = compareTargets(baseline, final);
	assert.equal(blocking.length, 1);
	assert.match(blocking[0], /different (?:origin|page|path)/);
	assert.doesNotMatch(blocking[0], /SameSecret987/);
});

test('malformed historical base URLs block without echoing their values', () => {
	const baseline = run({ target: { base_url: 'https://admin%3ABaselineSecret987%40one.test', pages: [{ name: 'home', url: '/preview' }] } });
	const final = run({ target: { base_url: 'https://admin%3AFinalSecret987%40two.test', pages: [{ name: 'home', url: '/preview' }] } });
	const { blocking } = compareTargets(baseline, final);
	assert.equal(blocking.length, 1);
	assert.match(blocking[0], /base URL.*(?:malformed|unsafe)/i);
	assert.doesNotMatch(blocking[0], /BaselineSecret987|FinalSecret987/);
});

test('a trailing slash is not a different page', () => {
	const final = run({ target: { pages: [{ name: 'home', url: 'https://example.com' }, { name: 'about', url: 'https://example.com/about' }] } });
	assert.deepEqual(compareTargets(run(), final).blocking, []);
});

test('an exact query-string change blocks on the same host', () => {
	const baseline = run({ target: { pages: [{ name: 'home', url: 'https://example.com/?lang=sv' }] } });
	const final = run({ target: { pages: [{ name: 'home', url: 'https://example.com/?lang=en' }] } });
	const { blocking } = compareTargets(baseline, final);
	assert.equal(blocking.length, 1);
	assert.match(blocking[0], /different path, query, or origin/);
	assert.match(blocking[0], /lang=sv/);
	assert.match(blocking[0], /lang=en/);
});

test('fragments do not affect comparison identity', () => {
	const baseline = run({ target: { pages: [{ name: 'home', url: 'https://example.com/about/#team' }] } });
	const final = run({ target: { pages: [{ name: 'home', url: 'https://example.com/about/#contact' }] } });
	assert.deepEqual(compareTargets(baseline, final).blocking, []);
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
			pages: [
				{ name: 'home', url: 'https://new-domain.com/' },
				{ name: 'about', url: 'https://new-domain.com/about/' },
			],
			viewports: [{ name: 'desktop', width: 1440, height: 900 }],
			modules: ['crawl'],
		},
	});
	const { limitations, blocking } = compareTargets(run(), final);
	assert.equal(blocking.length, 1, 'viewports block');
	assert.ok(limitations.length >= 2, `host and module set both disclosed (got ${limitations.length})`);
});

test('blocking reasons render everywhere and client improvement figures are withheld', () => {
	const reason = 'viewports differ (baseline: mobile:390x844 · final: desktop:1440x900)';
	const rendered = renderComparison({
		projectName: 'Probe',
		baselineRun: 'before',
		finalRun: 'after',
		comparison: {
			rows: [{ label: 'Broken links', before: 9, after: 0, unit: '', change: 'better' }],
			limitations: [],
			blocking: [reason],
		},
		metrics: null,
	});
	assert.match(rendered.internalMd, /viewports differ/);
	assert.match(rendered.html, /viewports differ/);
	assert.match(rendered.clientMd, /viewports differ/);
	assert.match(rendered.clientMd, /figures are withheld/);
	assert.doesNotMatch(rendered.clientMd, /9 → 0/);
});
