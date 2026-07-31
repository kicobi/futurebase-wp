// test/promotion.test.mjs — promotion writes into a real client repository, so
// `--resume` has to prove the destination is one WE created.
//
// Before the checkpoint, `--resume` accepted any non-empty git repo and treated
// any text domain other than the starter's as "already renamed". Together those
// let a resume adopt an unrelated repository: reuse it, skip the rename, inject
// .project/, and commit a reported-successful promotion over someone else's
// work. Verified by doing exactly that against the pre-fix code.
//
// Run: npm test --prefix tools/project-system

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkpointMismatch, CHECKPOINT_FILE } from '../commands/lead/promote.mjs';

const target = { slug: 'acme', dest: '/Users/x/Sites/acme', remote: 'studiokicobi/acme' };

const checkpointFor = (over = {}) => ({
	schema_version: 1,
	kind: 'promotion-checkpoint',
	nonce: '00000000-0000-4000-8000-000000000000',
	lead_slug: 'acme',
	dest: '/Users/x/Sites/acme',
	remote: 'studiokicobi/acme',
	template: 'studiokicobi/wp-starter',
	template_commit: 'abc1234',
	started_at: '2026-07-30T10:00:00.000Z',
	...over,
});

test('a matching checkpoint permits resume', () => {
	assert.equal(checkpointMismatch(checkpointFor(), target), null);
});

test('a destination with no checkpoint is refused', () => {
	// The reproduction: an unrelated git repo. Nothing marks it as ours.
	const why = checkpointMismatch(null, target);
	assert.match(why, /no promotion checkpoint/);
	assert.match(why, new RegExp(CHECKPOINT_FILE.replace('.', '\\.')));
});

test('a checkpoint from a different lead is refused', () => {
	const why = checkpointMismatch(checkpointFor({ lead_slug: 'other-client' }), target);
	assert.match(why, /belongs to lead "other-client"/);
});

test('a checkpoint recording a different destination is refused', () => {
	// Guards --dest being repointed between the interrupted run and the resume.
	const why = checkpointMismatch(checkpointFor({ dest: '/Users/x/Sites/somewhere-else' }), target);
	assert.match(why, /records destination/);
});

test('a checkpoint recording a different remote is refused', () => {
	// Guards --org / --name changing mid-flight.
	const why = checkpointMismatch(checkpointFor({ remote: 'someone-else/acme' }), target);
	assert.match(why, /records remote/);
});

test('an unrelated JSON file that happens to sit at that path is refused', () => {
	const why = checkpointMismatch({ kind: 'something-else', lead_slug: 'acme' }, target);
	assert.match(why, /not a promotion checkpoint/);
});

test('a checkpoint from a different template is refused', () => {
	// Provenance was recorded from the start and then never compared, so a
	// resume could switch templates and the stamped project.yml would claim a
	// commit from a template the destination was never built from.
	const why = checkpointMismatch(checkpointFor(), { ...target, template: 'someone-else/other-starter' });
	assert.match(why, /records template studiokicobi\/wp-starter/);
});

test('template is only compared when the caller supplies one', () => {
	// Keeps the rule usable from tests and any caller that has no template in
	// hand, without silently skipping the check for the real one.
	assert.equal(checkpointMismatch(checkpointFor(), target), null);
	assert.equal(checkpointMismatch(checkpointFor(), { ...target, template: 'studiokicobi/wp-starter' }), null);
});
