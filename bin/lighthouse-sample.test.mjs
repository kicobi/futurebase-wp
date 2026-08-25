import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
	evaluateResults,
	exitCodeForResults,
	extractRun,
	findDuplicateImageDownloads,
	collectSampleSlots,
	declaredLighthouseVersion,
	buildSummary,
	helpText,
	mergeConfig,
	markdownSummary,
	median,
	normalizeUploadImageUrl,
	parseArguments,
	validatePublicUrl,
} from './lighthouse-sample.mjs';

function passingResult(
	mode,
	run,
	performance = mode === 'desktop' ? 99 : 96
) {
	return {
		mode,
		run,
		performance,
		lcpMs: 1800,
		cls: 0.005,
		tbtMs: 40,
		totalBytes: 700 * 1024,
		lcpLazyLoadedPass: true,
		duplicateImageDownloads: [],
	};
}

function passingSample() {
	return [
		...Array.from( { length: 5 }, ( _, index ) =>
			passingResult( 'mobile', index + 1 )
		),
		...Array.from( { length: 3 }, ( _, index ) =>
			passingResult( 'desktop', index + 1 )
		),
	];
}

test( 'median handles odd and even samples', () => {
	assert.equal( median( [ 98, 91, 96, 95, 97 ] ), 96 );
	assert.equal( median( [ 91, 99, 95, 97 ] ), 96 );
	assert.equal( median( [] ), null );
} );

test( 'WordPress image derivatives normalize to one attachment key', () => {
	const original = 'https://example.com/wp-content/uploads/2026/08/work.webp';
	const derivative =
		'https://example.com/wp-content/uploads/2026/08/work-scaled-480x320.webp';

	assert.equal(
		normalizeUploadImageUrl( original ),
		normalizeUploadImageUrl( derivative )
	);
	assert.equal(
		normalizeUploadImageUrl(
			'https://example.com/wp-content/themes/site/image.webp'
		),
		null
	);
	assert.deepEqual(
		findDuplicateImageDownloads( [
			{ url: original },
			{ url: derivative },
			{ url: derivative },
		] ),
		[
			{
				attachment:
					'https://example.com/wp-content/uploads/2026/08/work.webp',
				urls: [ derivative, original ].sort(),
			},
		]
	);
} );

test( 'extractRun reads Lighthouse metrics and duplicate downloads', () => {
	const run = extractRun(
		{
			requestedUrl: 'https://example.com/',
			finalDisplayedUrl: 'https://example.com/',
			categories: { performance: { score: 0.98 } },
			audits: {
				'largest-contentful-paint': { numericValue: 1900 },
				'cumulative-layout-shift': { numericValue: 0.004 },
				'total-blocking-time': { numericValue: 30 },
				'total-byte-weight': { numericValue: 600000 },
				'lcp-lazy-loaded': { score: 1 },
				'network-requests': {
					details: {
						items: [
							{
								url: 'https://example.com/wp-content/uploads/2026/08/work-180x120.webp',
							},
							{
								url: 'https://example.com/wp-content/uploads/2026/08/work-480x320.webp',
							},
						],
					},
				},
			},
		},
		'mobile',
		1
	);

	assert.equal( run.performance, 98 );
	assert.equal( run.lcpMs, 1900 );
	assert.equal( run.lcpLazyLoadedPass, true );
	assert.equal( run.duplicateImageDownloads.length, 1 );
} );

test( 'a complete passing sample meets every acceptance threshold', () => {
	const evaluation = evaluateResults( passingSample() );

	assert.equal( evaluation.mobileMedianPerformance, 96 );
	assert.equal( evaluation.passed, true );
	assert.deepEqual( evaluation.failures, [] );
	assert.equal( exitCodeForResults( passingSample() ), 0 );
} );

test( 'mobile median and individual performance failures are reported', () => {
	const results = passingSample();
	for ( let index = 0; index < 3; index += 1 ) {
		results[ index ].performance = 94;
	}
	results[ 0 ].performance = 89;

	const evaluation = evaluateResults( results );

	assert.equal( evaluation.passed, false );
	assert.ok(
		evaluation.failures.some( ( failure ) =>
			failure.includes( 'Mobile median performance' )
		)
	);
	assert.ok(
		evaluation.failures.some( ( failure ) =>
			failure.includes( 'mobile 1: performance' )
		)
	);
	assert.equal( exitCodeForResults( results ), 1 );
} );

test( 'strict metric, lazy-LCP, duplicate-download, and desktop gates fail', () => {
	const results = passingSample();
	Object.assign( results[ 0 ], {
		lcpMs: 2500,
		cls: 0.02,
		tbtMs: 200,
		totalBytes: 900 * 1024,
		lcpLazyLoadedPass: false,
		duplicateImageDownloads: [
			{ attachment: 'work.webp', urls: [ '180.webp', '480.webp' ] },
		],
	} );
	results[ 5 ].performance = 97;

	const failures = evaluateResults( results ).failures.join( '\n' );

	assert.match( failures, /LCP/ );
	assert.match( failures, /CLS/ );
	assert.match( failures, /TBT/ );
	assert.match( failures, /transfer/ );
	assert.match( failures, /lazy-loaded LCP/ );
	assert.match( failures, /multiple widths/ );
	assert.match( failures, /desktop 1: performance/ );
} );

test( 'the module is import-safe and does not launch Lighthouse', () => {
	const result = spawnSync(
		process.execPath,
		[ '-e', "import('./bin/lighthouse-sample.mjs')" ],
		{ encoding: 'utf8' }
	);
	assert.equal( result.status, 0, result.stderr );
	assert.equal( result.stdout, '' );
} );

test( 'the runtime Lighthouse expectation comes from the exact manifest pin', () => {
	const dir = mkdtempSync( join( tmpdir(), 'lighthouse-version-' ) );
	try {
		writeFileSync(
			join( dir, 'package.json' ),
			JSON.stringify( { devDependencies: { lighthouse: '13.2.4' } } )
		);
		assert.equal( declaredLighthouseVersion( dir ), '13.2.4' );
		writeFileSync(
			join( dir, 'package.json' ),
			JSON.stringify( { devDependencies: { lighthouse: '^13.2.4' } } )
		);
		assert.throws(
			() => declaredLighthouseVersion( dir ),
			/exact version/
		);
	} finally {
		rmSync( dir, { recursive: true, force: true } );
	}
} );

test( 'local config is strict and CLI run counts take precedence', () => {
	assert.throws(
		() => mergeConfig( { thresholds: { lcpMS: 2000 } } ),
		/unknown key "lcpMS"/
	);
	assert.throws( () => mergeConfig( { retries: 2 } ), /retries/ );
	assert.throws(
		() =>
			mergeConfig( {
				thresholds: {
					mobileMedianPerformance: 89,
					mobileMinimumPerformance: 90,
				},
			} ),
		/greater than or equal/
	);

	const dir = mkdtempSync( join( tmpdir(), 'lighthouse-config-' ) );
	try {
		writeFileSync(
			join( dir, 'lighthouse-sample.config.json' ),
			JSON.stringify( {
				mobileRuns: 4,
				desktopRuns: 2,
				retries: 0,
				thresholds: { lcpMs: 2200 },
			} )
		);
		const parsed = parseArguments(
			[ '--url=https://example.com/', '--mobile-runs=6' ],
			dir
		);
		assert.equal( parsed.mobileRuns, 6 );
		assert.equal( parsed.desktopRuns, 2 );
		assert.equal( parsed.retries, 0 );
		assert.equal( parsed.thresholds.lcpMs, 2200 );
		assert.equal( parsed.thresholds.cls, 0.02 );
	} finally {
		rmSync( dir, { recursive: true, force: true } );
	}
} );

test( 'absent configuration uses built-ins and explicit missing files fail', () => {
	const dir = mkdtempSync( join( tmpdir(), 'lighthouse-no-config-' ) );
	try {
		const parsed = parseArguments( [ '--url=https://example.com/' ], dir );
		assert.equal( parsed.mobileRuns, 5 );
		assert.equal( parsed.desktopRuns, 3 );
		assert.equal( parsed.retries, 1 );
		assert.equal( parsed.configPath, null );
		assert.throws(
			() =>
				parseArguments(
					[ '--url=https://example.com/', '--config=missing.json' ],
					dir
				),
			/Config file not found/
		);
	} finally {
		rmSync( dir, { recursive: true, force: true } );
	}
} );

test( 'the documented complete config example remains valid', () => {
	const match = helpText().match( /Configuration \(every key is optional\):\n([\s\S]*?)\n\nPrecedence:/ );
	assert.ok( match, 'documented JSON example was not found' );
	const config = JSON.parse( match[ 1 ] );
	assert.deepEqual( mergeConfig( config ), config );
	for ( const key of Object.keys( config.thresholds ) ) {
		assert.match( helpText(), new RegExp( key ) );
	}
	assert.match( helpText(), /CLI overrides > selected JSON config > built-in defaults/ );
} );

test( 'production URLs are checked syntactically without DNS', () => {
	assert.equal( validatePublicUrl( 'https://example.com/' ), 'https://example.com/' );
	assert.equal(
		validatePublicUrl( 'https://[2001:4860:4860::8888]/' ),
		'https://[2001:4860:4860::8888]/'
	);
	for ( const value of [
		'http://localhost/',
		'http://localhost./',
		'http://127.0.0.1/',
		'http://10.2.3.4/',
		'http://172.31.0.1/',
		'http://192.168.1.2/',
		'http://169.254.3.4/',
		'http://[::1]/',
		'http://[fe80::1]/',
		'https://site.local/',
		'https://site.local./',
		'https://site.test/',
		'https://site.internal/',
		'https://user:secret@example.com/',
	] ) {
		assert.throws( () => validatePublicUrl( value ), /must/ );
	}
} );

test( 'failed slots retry once and preserve both attempts', () => {
	const config = mergeConfig( { mobileRuns: 1, desktopRuns: 1 } );
	const calls = [];
	const slots = collectSampleSlots( config, ( { mode, run, attempt } ) => {
		calls.push( { mode, run, attempt } );
		if ( mode === 'mobile' && attempt === 1 ) {
			throw new Error( 'Chrome crashed' );
		}
		return passingResult( mode, run );
	} );
	assert.equal( calls.length, 3 );
	assert.equal( slots[ 0 ].attempts.length, 2 );
	assert.match( slots[ 0 ].attempts[ 0 ].runtimeError, /Chrome crashed/ );
	assert.equal( slots[ 0 ].recovered, true );
	assert.equal( evaluateResults( slots.map( ( slot ) => slot.evaluated ) ).passed, true );
} );

test( 'threshold failures retry and retries zero restores strict mode', () => {
	const retrying = mergeConfig( { mobileRuns: 1, desktopRuns: 1 } );
	const slots = collectSampleSlots( retrying, ( { mode, run, attempt } ) =>
		passingResult( mode, run, mode === 'mobile' && attempt === 1 ? 89 : undefined )
	);
	assert.equal( slots[ 0 ].attempts.length, 2 );
	assert.equal( slots[ 0 ].recovered, true );

	const strict = mergeConfig( { mobileRuns: 1, desktopRuns: 1, retries: 0 } );
	let calls = 0;
	const strictSlots = collectSampleSlots( strict, ( { mode, run } ) => {
		calls += 1;
		return passingResult( mode, run, mode === 'mobile' ? 89 : 99 );
	} );
	assert.equal( calls, 2 );
	assert.equal( strictSlots[ 0 ].attempts.length, 1 );
} );

test( 'missing metrics fail and summaries retain attempts plus recovered warnings', () => {
	const missing = passingSample();
	missing[ 0 ].lcpMs = null;
	assert.match( evaluateResults( missing ).failures.join( '\n' ), /LCP missing/ );

	const config = mergeConfig( { mobileRuns: 1, desktopRuns: 1 } );
	const slots = collectSampleSlots( config, ( { mode, run, attempt } ) => {
		if ( mode === 'mobile' && attempt === 1 ) throw new Error( 'transient' );
		return passingResult( mode, run );
	} );
	const summary = buildSummary(
		{ ...config, url: 'https://example.com/', configPath: null },
		slots,
		{ lighthouse: '12.6.1', chrome: 'test' },
		'2026-08-21T00:00:00.000Z'
	);
	assert.equal( summary.slots[ 0 ].attempts.length, 2 );
	assert.equal( summary.warnings.length, 1 );
	assert.match( markdownSummary( summary ), /Recovered retries/ );
} );

test( 'aggregate median failures do not trigger slot retries', () => {
	const config = mergeConfig( {
		mobileRuns: 3,
		desktopRuns: 1,
		retries: 1,
	} );
	let calls = 0;
	const slots = collectSampleSlots( config, ( { mode, run } ) => {
		calls += 1;
		return passingResult( mode, run, mode === 'mobile' ? 94 : 99 );
	} );
	assert.equal( calls, 4 );
	const evaluation = evaluateResults( slots.map( ( slot ) => slot.evaluated ) );
	assert.equal( evaluation.passed, false );
	assert.match( evaluation.failures.join( '\n' ), /Mobile median/ );
} );
