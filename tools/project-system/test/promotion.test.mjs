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
import {
	checkpointMismatch,
	CHECKPOINT_FILE,
	recoveryReceiptMismatch,
	recoveryReceiptPath,
	templateNamesEquivalent,
} from '../commands/lead/promote.mjs';

// The default fixtures intentionally model checkpoints and receipts written
// before the GitHub handle cutover. Current-name assertions override only the
// comparison side that must resolve to kicobi/futurebase-wp.
const target = { slug: 'acme', dest: '/Users/x/Sites/acme', remote: 'studiokicobi/acme' };

const checkpointFor = (over = {}) => ({
	schema_version: 1,
	kind: 'promotion-checkpoint',
	nonce: '00000000-0000-4000-8000-000000000000',
	lead_slug: 'acme',
	dest: '/Users/x/Sites/acme',
	remote: 'studiokicobi/acme',
	template: 'studiokicobi/futurebase-wp',
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
	assert.match(why, /records template studiokicobi\/futurebase/);
});

test('template is only compared when the caller supplies one', () => {
	// Keeps the rule usable from tests and any caller that has no template in
	// hand, without silently skipping the check for the real one.
	assert.equal(checkpointMismatch(checkpointFor(), target), null);
	assert.equal(checkpointMismatch(checkpointFor(), { ...target, template: 'studiokicobi/futurebase-wp' }), null);
});

test('a pre-cutover checkpoint accepts the renamed Futurebase WP template', () => {
	assert.equal(
		checkpointMismatch(checkpointFor({ template: 'studiokicobi/wp-starter' }), {
			...target,
			template: 'kicobi/futurebase-wp',
		}),
		null,
	);
});

test('template compatibility remains a pair across the handle cutover', () => {
	assert.equal(templateNamesEquivalent('studiokicobi/wp-starter', 'kicobi/futurebase-wp'), true);
	assert.equal(templateNamesEquivalent('studiokicobi/futurebase-wp', 'kicobi/futurebase-wp'), false);
});

const liveIdentity = (over = {}) => ({
	repository_id: 123456,
	repository_node_id: 'R_kgDOExample',
	repository_full_name: 'studiokicobi/acme',
	repository_created_at: '2026-07-30T10:00:05Z',
	default_branch: 'main',
	initial_commit_sha: 'def5678',
	commit_count: 1,
	template_repository: 'studiokicobi/futurebase-wp',
	...over,
});

const receiptFor = (over = {}) => ({
	schema_version: 1,
	kind: 'promotion-recovery-receipt',
	nonce: '11111111-1111-4111-8111-111111111111',
	receipt_created_at: '2026-07-30T10:00:06.000Z',
	lead_slug: 'acme',
	dest: '/Users/x/Sites/acme',
	remote: 'studiokicobi/acme',
	template: 'studiokicobi/futurebase-wp',
	template_commit: 'abc1234',
	repository_id: 123456,
	repository_node_id: 'R_kgDOExample',
	repository_full_name: 'studiokicobi/acme',
	repository_created_at: '2026-07-30T10:00:05Z',
	default_branch: 'main',
	initial_commit_sha: 'def5678',
	initial_commit_count: 1,
	template_repository: 'studiokicobi/futurebase-wp',
	...over,
});

const recoveryTarget = { ...target, template: 'studiokicobi/futurebase-wp' };

test('a complete receipt matching the untouched generated remote permits clone recovery', () => {
	assert.equal(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity()), null);
});

test('pre-cutover receipt names accept the renamed live template only at compatibility comparisons', () => {
	const legacy = receiptFor({
		template: 'studiokicobi/wp-starter',
		template_repository: 'studiokicobi/wp-starter',
	});
	const currentTarget = { ...recoveryTarget, template: 'kicobi/futurebase-wp' };
	const currentLive = liveIdentity({ template_repository: 'kicobi/futurebase-wp' });
	assert.equal(recoveryReceiptMismatch(legacy, currentTarget, currentLive), null);
	assert.match(
		recoveryReceiptMismatch(legacy, currentTarget, liveIdentity({ template_repository: 'studiokicobi/wp-starter' })),
		/not generated from the requested template/,
	);
});

test('clone recovery refuses an absent or incomplete receipt', () => {
	assert.match(recoveryReceiptMismatch(null, recoveryTarget, liveIdentity()), /no matching local recovery receipt/);
	assert.match(recoveryReceiptMismatch(receiptFor({ repository_node_id: null }), recoveryTarget, liveIdentity()), /incomplete.*repository_node_id/);
	assert.match(recoveryReceiptMismatch(receiptFor({ remote: 42 }), recoveryTarget, liveIdentity()), /invalid field types.*remote/);
	assert.match(recoveryReceiptMismatch(receiptFor({ initial_commit_count: '1' }), recoveryTarget, liveIdentity()), /invalid initial_commit_count/);
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ template_repository: null })), /live GitHub repository identity.*malformed/);
});

test('clone recovery binds lead, destination, remote, and template', () => {
	assert.match(recoveryReceiptMismatch(receiptFor({ lead_slug: 'other' }), recoveryTarget, liveIdentity()), /belongs to lead/);
	assert.match(recoveryReceiptMismatch(receiptFor({ dest: '/tmp/elsewhere' }), recoveryTarget, liveIdentity()), /records destination/);
	assert.match(recoveryReceiptMismatch(receiptFor({ remote: 'other/acme' }), recoveryTarget, liveIdentity()), /records remote/);
	assert.match(recoveryReceiptMismatch(receiptFor({ template: 'other/template' }), recoveryTarget, liveIdentity()), /records template/);
});

test('a deleted and recreated repository cannot reuse the old receipt', () => {
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ repository_id: 654321 })), /repository ID changed/);
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ repository_node_id: 'R_recreated' })), /node ID changed/);
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ repository_created_at: '2026-07-30T11:00:00Z' })), /creation time changed/);
});

test('a changed remote or generated commit cannot be recovered', () => {
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ initial_commit_sha: 'changed' })), /initial commit changed/);
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ commit_count: 2 })), /exactly one generated commit/);
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ default_branch: 'develop' })), /default branch changed/);
	assert.match(recoveryReceiptMismatch(receiptFor(), recoveryTarget, liveIdentity({ template_repository: 'other/template' })), /template identity changed/);
});

test('recovery receipt filenames are stable and bind destination plus remote', () => {
	const a = recoveryReceiptPath('/Users/x/Sites/acme', 'studiokicobi/acme');
	assert.equal(a, recoveryReceiptPath('/Users/x/Sites/acme', 'studiokicobi/acme'));
	assert.notEqual(a, recoveryReceiptPath('/Users/x/Sites/acme-2', 'studiokicobi/acme'));
	assert.notEqual(a, recoveryReceiptPath('/Users/x/Sites/acme', 'studiokicobi/acme-2'));
	assert.match(a, /\.futurebase-promotion-[a-f0-9]{20}\.json$/);
});
