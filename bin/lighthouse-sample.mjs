#!/usr/bin/env node
/* eslint-disable no-console -- This file is a command-line reporter. */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire( import.meta.url );
const PROJECT_ROOT = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );

export const THRESHOLDS = Object.freeze( {
	mobileMedianPerformance: 95,
	mobileMinimumPerformance: 90,
	desktopMinimumPerformance: 98,
	lcpMs: 2500,
	cls: 0.02,
	tbtMs: 200,
	totalBytes: 900 * 1024,
} );

export const DEFAULT_CONFIG = Object.freeze( {
	mobileRuns: 5,
	desktopRuns: 3,
	retries: 1,
	thresholds: THRESHOLDS,
} );

const CONFIG_KEYS = new Set( [
	'mobileRuns',
	'desktopRuns',
	'retries',
	'thresholds',
] );
const THRESHOLD_KEYS = new Set( Object.keys( THRESHOLDS ) );

function assertKnownKeys( value, allowed, label ) {
	for ( const key of Object.keys( value ) ) {
		if ( ! allowed.has( key ) ) {
			throw new Error( `${ label } contains unknown key "${ key }".` );
		}
	}
}

function finiteNumber( value, label, { min = 0, max = Infinity } = {} ) {
	if ( ! Number.isFinite( value ) || value < min || value > max ) {
		throw new Error( `${ label } must be a number from ${ min } to ${ max }.` );
	}
	return value;
}

function integer( value, label, { min = 0, max = Infinity } = {} ) {
	if ( ! Number.isInteger( value ) || value < min || value > max ) {
		throw new Error( `${ label } must be an integer from ${ min } to ${ max }.` );
	}
	return value;
}

export function mergeConfig( local = {}, cli = {} ) {
	if ( ! local || typeof local !== 'object' || Array.isArray( local ) ) {
		throw new Error( 'Lighthouse sample config must be a JSON object.' );
	}
	assertKnownKeys( local, CONFIG_KEYS, 'Lighthouse sample config' );
	const localThresholds = local.thresholds ?? {};
	if (
		! localThresholds ||
		typeof localThresholds !== 'object' ||
		Array.isArray( localThresholds )
	) {
		throw new Error( 'thresholds must be a JSON object.' );
	}
	assertKnownKeys( localThresholds, THRESHOLD_KEYS, 'thresholds' );

	const merged = {
		mobileRuns: cli.mobileRuns ?? local.mobileRuns ?? DEFAULT_CONFIG.mobileRuns,
		desktopRuns:
			cli.desktopRuns ?? local.desktopRuns ?? DEFAULT_CONFIG.desktopRuns,
		retries: cli.retries ?? local.retries ?? DEFAULT_CONFIG.retries,
		thresholds: { ...THRESHOLDS, ...localThresholds },
	};
	integer( merged.mobileRuns, 'mobileRuns', { min: 1, max: 20 } );
	integer( merged.desktopRuns, 'desktopRuns', { min: 1, max: 20 } );
	integer( merged.retries, 'retries', { min: 0, max: 1 } );
	for ( const key of [
		'mobileMedianPerformance',
		'mobileMinimumPerformance',
		'desktopMinimumPerformance',
	] ) {
		finiteNumber( merged.thresholds[ key ], `thresholds.${ key }`, {
			min: 0,
			max: 100,
		} );
	}
	for ( const key of [ 'lcpMs', 'cls', 'tbtMs', 'totalBytes' ] ) {
		finiteNumber( merged.thresholds[ key ], `thresholds.${ key }`, {
			min: Number.EPSILON,
		} );
	}
	if (
		merged.thresholds.mobileMedianPerformance <
		merged.thresholds.mobileMinimumPerformance
	) {
		throw new Error(
			'thresholds.mobileMedianPerformance must be greater than or equal to thresholds.mobileMinimumPerformance.'
		);
	}
	return merged;
}

export function median( values ) {
	if ( values.length === 0 ) {
		return null;
	}

	const sorted = [ ...values ].sort( ( a, b ) => a - b );
	const middle = Math.floor( sorted.length / 2 );

	return sorted.length % 2 === 0
		? ( sorted[ middle - 1 ] + sorted[ middle ] ) / 2
		: sorted[ middle ];
}

export function normalizeUploadImageUrl( value ) {
	let url;
	try {
		url = new URL( value );
	} catch {
		return null;
	}

	if ( ! url.pathname.includes( '/wp-content/uploads/' ) ) {
		return null;
	}

	const match = url.pathname.match(
		/^(.*?)(\.(?:avif|gif|jpe?g|png|webp))$/i
	);
	if ( ! match ) {
		return null;
	}

	const stem = match[ 1 ]
		.replace( /-\d+x\d+$/i, '' )
		.replace( /-scaled$/i, '' );

	return `${
		url.origin
	}${ stem.toLowerCase() }${ match[ 2 ].toLowerCase() }`;
}

export function findDuplicateImageDownloads( requests = [] ) {
	const groups = new Map();

	for ( const request of requests ) {
		const key = normalizeUploadImageUrl( request?.url || '' );
		if ( ! key ) {
			continue;
		}

		const urls = groups.get( key ) || new Set();
		urls.add( request.url );
		groups.set( key, urls );
	}

	return [ ...groups.entries() ]
		.filter( ( [ , urls ] ) => urls.size > 1 )
		.map( ( [ attachment, urls ] ) => ( {
			attachment,
			urls: [ ...urls ].sort(),
		} ) );
}

function auditNumber( lhr, id ) {
	const value = lhr?.audits?.[ id ]?.numericValue;

	return Number.isFinite( value ) ? value : null;
}

export function extractRun( lhr, mode, run ) {
	const performance = lhr?.categories?.performance?.score;
	const lazyAudit = lhr?.audits?.[ 'lcp-lazy-loaded' ];
	const requests = lhr?.audits?.[ 'network-requests' ]?.details?.items || [];

	return {
		mode,
		run,
		requestedUrl: lhr?.requestedUrl || null,
		finalUrl: lhr?.finalDisplayedUrl || lhr?.finalUrl || null,
		performance: Number.isFinite( performance )
			? Math.round( performance * 100 )
			: null,
		lcpMs: auditNumber( lhr, 'largest-contentful-paint' ),
		cls: auditNumber( lhr, 'cumulative-layout-shift' ),
		tbtMs: auditNumber( lhr, 'total-blocking-time' ),
		totalBytes: auditNumber( lhr, 'total-byte-weight' ),
		lcpLazyLoadedPass:
			lazyAudit?.score === 1 ||
			lazyAudit?.scoreDisplayMode === 'notApplicable',
		duplicateImageDownloads: findDuplicateImageDownloads( requests ),
	};
}

function below( value, limit ) {
	return Number.isFinite( value ) && value < limit;
}

export function evaluateSlot( result, thresholds = THRESHOLDS ) {
	const failures = [];
	const label = `${ result.mode } ${ result.run }`;
	if ( result.runtimeError ) {
		failures.push( `${ label }: ${ result.runtimeError }` );
		return failures;
	}
	const minimum =
		result.mode === 'desktop'
			? thresholds.desktopMinimumPerformance
			: thresholds.mobileMinimumPerformance;
	if (
		! Number.isFinite( result.performance ) ||
		result.performance < minimum
	) {
		failures.push(
			`${ label }: performance ${
				result.performance ?? 'missing'
			} is below ${ minimum }.`
		);
	}
	if ( ! below( result.lcpMs, thresholds.lcpMs ) ) {
		failures.push(
			`${ label }: LCP ${ result.lcpMs ?? 'missing' } ms is not below ${
				thresholds.lcpMs
			} ms.`
		);
	}
	if ( ! below( result.cls, thresholds.cls ) ) {
		failures.push(
			`${ label }: CLS ${ result.cls ?? 'missing' } is not below ${
				thresholds.cls
			}.`
		);
	}
	if ( ! below( result.tbtMs, thresholds.tbtMs ) ) {
		failures.push(
			`${ label }: TBT ${ result.tbtMs ?? 'missing' } ms is not below ${
				thresholds.tbtMs
			} ms.`
		);
	}
	if ( ! below( result.totalBytes, thresholds.totalBytes ) ) {
		failures.push(
			`${ label }: transfer ${
				result.totalBytes ?? 'missing'
			} bytes is not below ${ thresholds.totalBytes } bytes.`
		);
	}
	if ( ! result.lcpLazyLoadedPass ) {
		failures.push(
			`${ label }: Lighthouse reports a lazy-loaded LCP candidate.`
		);
	}
	if ( ! Array.isArray( result.duplicateImageDownloads ) ) {
		failures.push( `${ label }: duplicate image download evidence is missing.` );
	} else if ( result.duplicateImageDownloads.length > 0 ) {
		failures.push(
			`${ label }: ${ result.duplicateImageDownloads.length } attachment(s) were fetched at multiple widths.`
		);
	}
	return failures;
}

export function evaluateResults( results, thresholds = THRESHOLDS ) {
	const failures = [];
	const mobile = results.filter( ( result ) => result.mode === 'mobile' );
	const desktop = results.filter( ( result ) => result.mode === 'desktop' );
	const mobileMedian = median(
		mobile.map( ( result ) => result.performance ).filter( Number.isFinite )
	);

	if ( mobile.length === 0 ) {
		failures.push( 'No mobile Lighthouse runs were recorded.' );
	} else if (
		mobileMedian === null ||
		mobileMedian < thresholds.mobileMedianPerformance
	) {
		failures.push(
			`Mobile median performance ${
				mobileMedian ?? 'missing'
			} is below ${ thresholds.mobileMedianPerformance }.`
		);
	}

	if ( desktop.length === 0 ) {
		failures.push( 'No desktop Lighthouse runs were recorded.' );
	}

	for ( const result of results ) failures.push( ...evaluateSlot( result, thresholds ) );

	return {
		passed: failures.length === 0,
		mobileMedianPerformance: mobileMedian,
		failures,
	};
}

export function exitCodeForResults( results ) {
	return evaluateResults( results ).passed ? 0 : 1;
}

export function collectSampleSlots( config, execute ) {
	const slots = [];
	for ( const mode of [ 'mobile', 'desktop' ] ) {
		const count = mode === 'mobile' ? config.mobileRuns : config.desktopRuns;
		for ( let run = 1; run <= count; run += 1 ) {
			const attempts = [];
			for ( let attempt = 1; attempt <= config.retries + 1; attempt += 1 ) {
				let result;
				try {
					result = execute( { mode, run, attempt, count } );
				} catch ( error ) {
					result = {
						mode,
						run,
						attempt,
						performance: null,
						lcpMs: null,
						cls: null,
						tbtMs: null,
						totalBytes: null,
						lcpLazyLoadedPass: false,
						duplicateImageDownloads: [],
						runtimeError: String( error.message || error ),
					};
				}
				result = { ...result, mode, run, attempt };
				attempts.push( result );
				if ( evaluateSlot( result, config.thresholds ).length === 0 ) break;
			}
			const evaluated = attempts.at( -1 );
			slots.push( {
				mode,
				run,
				attempts,
				evaluated,
				recovered:
					attempts.length > 1 &&
					evaluateSlot( evaluated, config.thresholds ).length === 0,
			} );
		}
	}
	return slots;
}

function parsePositiveInteger( value, name ) {
	const parsed = Number.parseInt( value, 10 );
	if ( ! /^\d+$/.test( String( value ) ) || ! Number.isInteger( parsed ) || parsed < 1 ) {
		throw new Error( `${ name } must be a positive integer.` );
	}

	return parsed;
}

function parseRetries( value ) {
	if ( value !== '0' && value !== '1' ) {
		throw new Error( '--retries must be 0 or 1.' );
	}
	return Number( value );
}

function ipv4Number( value ) {
	if ( isIP( value ) !== 4 ) return null;
	return value
		.split( '.' )
		.reduce( ( total, part ) => total * 256 + Number( part ), 0 );
}

function ipv4InRange( value, base, bits ) {
	const number = ipv4Number( value );
	const network = ipv4Number( base );
	if ( number === null || network === null ) return false;
	const size = 2 ** ( 32 - bits );
	return Math.floor( number / size ) === Math.floor( network / size );
}

function ipv6Number( value ) {
	if ( isIP( value ) !== 6 ) return null;
	const [ leftRaw, rightRaw = '' ] = value.toLowerCase().split( '::' );
	const left = leftRaw ? leftRaw.split( ':' ) : [];
	const right = rightRaw ? rightRaw.split( ':' ) : [];
	const missing = 8 - left.length - right.length;
	const parts = [ ...left, ...Array( Math.max( 0, missing ) ).fill( '0' ), ...right ];
	if ( parts.length !== 8 ) return null;
	let number = 0n;
	for ( const part of parts ) number = ( number << 16n ) + BigInt( `0x${ part || '0' }` );
	return number;
}

export function validatePublicUrl( value ) {
	let url;
	try {
		url = new URL( value );
	} catch {
		throw new Error( '--url must be a valid absolute URL.' );
	}
	if ( ! [ 'http:', 'https:' ].includes( url.protocol ) ) {
		throw new Error( '--url must use HTTP or HTTPS.' );
	}
	if ( url.username || url.password ) {
		throw new Error( '--url must not contain credentials.' );
	}

	const hostname = url.hostname
		.replace( /^\[|\]$/g, '' )
		.replace( /\.$/, '' )
		.toLowerCase();
	if ( hostname === 'localhost' || hostname.endsWith( '.localhost' ) ) {
		throw new Error( '--url host must not be loopback.' );
	}
	for ( const suffix of [ '.local', '.test', '.internal' ] ) {
		if ( hostname === suffix.slice( 1 ) || hostname.endsWith( suffix ) ) {
			throw new Error( `--url host must be public; ${ suffix } names are reserved for local use.` );
		}
	}
	if (
		ipv4InRange( hostname, '127.0.0.0', 8 ) ||
		ipv4InRange( hostname, '10.0.0.0', 8 ) ||
		ipv4InRange( hostname, '172.16.0.0', 12 ) ||
		ipv4InRange( hostname, '192.168.0.0', 16 ) ||
		ipv4InRange( hostname, '169.254.0.0', 16 )
	) {
		throw new Error( '--url host must not be loopback, private, or link-local.' );
	}
	const ipv6 = ipv6Number( hostname );
	if ( ipv6 !== null ) {
		const ipv4MappedPrefix = ipv6 >> 32n;
		const mapped = ipv4MappedPrefix === 0xffffn
			? [ 24n, 16n, 8n, 0n ].map( ( shift ) => Number( ( ipv6 >> shift ) & 255n ) ).join( '.' )
			: null;
		if (
			ipv6 === 1n ||
			ipv6 >> 118n === 0x3fan ||
			( mapped &&
				( ipv4InRange( mapped, '127.0.0.0', 8 ) ||
					ipv4InRange( mapped, '10.0.0.0', 8 ) ||
					ipv4InRange( mapped, '172.16.0.0', 12 ) ||
					ipv4InRange( mapped, '192.168.0.0', 16 ) ||
					ipv4InRange( mapped, '169.254.0.0', 16 ) ) )
		) {
			throw new Error( '--url host must not be loopback, private, or link-local.' );
		}
	}
	return url.href;
}

function readLocalConfig( configPath, explicit ) {
	if ( ! existsSync( configPath ) ) {
		if ( explicit ) throw new Error( `Config file not found: ${ configPath }` );
		return {};
	}
	let data;
	try {
		data = JSON.parse( readFileSync( configPath, 'utf8' ) );
	} catch ( error ) {
		throw new Error( `Could not parse ${ configPath }: ${ error.message }` );
	}
	return data;
}

export function parseArguments( argv, cwd = process.cwd() ) {
	const options = { url: '', outputDir: '', configPath: '', help: false };
	const cliConfig = {};

	for ( const argument of argv ) {
		if ( argument.startsWith( '--url=' ) ) {
			options.url = argument.slice( '--url='.length );
		} else if ( argument.startsWith( '--mobile-runs=' ) ) {
			cliConfig.mobileRuns = parsePositiveInteger(
				argument.slice( '--mobile-runs='.length ),
				'--mobile-runs'
			);
		} else if ( argument.startsWith( '--desktop-runs=' ) ) {
			cliConfig.desktopRuns = parsePositiveInteger(
				argument.slice( '--desktop-runs='.length ),
				'--desktop-runs'
			);
		} else if ( argument.startsWith( '--output-dir=' ) ) {
			options.outputDir = argument.slice( '--output-dir='.length );
		} else if ( argument.startsWith( '--retries=' ) ) {
			cliConfig.retries = parseRetries( argument.slice( '--retries='.length ) );
		} else if ( argument.startsWith( '--config=' ) ) {
			options.configPath = argument.slice( '--config='.length );
		} else if ( argument === '--help' ) {
			options.help = true;
		} else {
			throw new Error( `Unknown argument: ${ argument }` );
		}
	}

	if ( options.help ) {
		return { ...options, ...DEFAULT_CONFIG };
	}

	if ( ! options.url ) {
		throw new Error( 'Pass the homepage as --url=https://example.com/.' );
	}

	options.url = validatePublicUrl( options.url );
	const explicitConfig = !! options.configPath;
	const configPath = resolve(
		cwd,
		options.configPath || 'lighthouse-sample.config.json'
	);
	const config = mergeConfig(
		readLocalConfig( configPath, explicitConfig ),
		cliConfig
	);
	return { ...options, ...config, configPath: explicitConfig || existsSync( configPath ) ? configPath : null };
}

function resolveChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
	].filter( Boolean );

	const chrome = candidates.find( existsSync );
	if ( ! chrome ) {
		throw new Error(
			'Google Chrome was not found. Set CHROME_PATH to its executable.'
		);
	}

	return chrome;
}

export function declaredLighthouseVersion( root = PROJECT_ROOT ) {
	const manifest = JSON.parse(
		readFileSync( resolve( root, 'package.json' ), 'utf8' )
	);
	const version = manifest.devDependencies?.lighthouse;
	if ( ! /^\d+\.\d+\.\d+$/.test( version || '' ) ) {
		throw new Error(
			'package.json devDependencies.lighthouse must be an exact version.'
		);
	}
	return version;
}

function resolveLighthouse() {
	const packagePath = require.resolve( 'lighthouse/package.json' );
	const packageJson = JSON.parse( readFileSync( packagePath, 'utf8' ) );
	const expectedVersion = declaredLighthouseVersion();
	const relativeBin =
		typeof packageJson.bin === 'string'
			? packageJson.bin
			: packageJson.bin?.lighthouse;

	if ( packageJson.version !== expectedVersion ) {
		throw new Error(
			`Expected Lighthouse ${ expectedVersion } from package.json; found ${
				packageJson.version || 'unknown'
			}.`
		);
	}
	if ( ! relativeBin ) {
		throw new Error(
			'The installed Lighthouse package has no CLI entry point.'
		);
	}

	return {
		cli: resolve( dirname( packagePath ), relativeBin ),
		version: packageJson.version,
	};
}

function runLighthouse( {
	chrome,
	cli,
	mode,
	outputPath,
	errorPath,
	run,
	attempt,
	url,
} ) {
	const profile = mkdtempSync(
		join( tmpdir(), `lighthouse-sample-${ mode }-${ run }-${ attempt }-` )
	);
	const chromeFlags = `--headless=new --no-sandbox --disable-gpu --user-data-dir=${ profile }`;
	const argumentsList = [
		cli,
		url,
		'--quiet',
		'--output=json',
		`--output-path=${ outputPath }`,
		'--only-categories=performance',
		'--max-wait-for-load=45000',
		`--chrome-flags=${ chromeFlags }`,
	];

	if ( mode === 'desktop' ) {
		argumentsList.push( '--preset=desktop' );
	} else {
		argumentsList.push( '--form-factor=mobile' );
	}

	let result;
	try {
		result = spawnSync( process.execPath, argumentsList, {
			encoding: 'utf8',
			env: { ...process.env, CHROME_PATH: chrome },
			maxBuffer: 10 * 1024 * 1024,
			timeout: 180000,
		} );
	} finally {
		rmSync( profile, { force: true, recursive: true } );
	}

	if ( result.status !== 0 || ! existsSync( outputPath ) ) {
		const detail = (
			result.stderr ||
			result.stdout ||
			result.error?.message ||
			'unknown error'
		).trim();
		const message = `Lighthouse ${ mode } run ${ run } attempt ${ attempt } failed: ${ detail.slice( 0, 600 ) }`;
		writeFileSync( errorPath, `${ message }\n`, 'utf8' );
		throw new Error( message );
	}

	const lhr = JSON.parse( readFileSync( outputPath, 'utf8' ) );
	if ( lhr.runtimeError ) {
		const message = `Lighthouse ${ mode } run ${ run } attempt ${ attempt } reported ${ lhr.runtimeError.code }: ${ lhr.runtimeError.message }`;
		writeFileSync( errorPath, `${ message }\n`, 'utf8' );
		throw new Error( message );
	}

	return { ...extractRun( lhr, mode, run ), attempt };
}

export function markdownSummary( summary ) {
	const lines = [
		'# Lighthouse sample',
		'',
		`- URL: ${ summary.url }`,
		`- Lighthouse: ${ summary.versions.lighthouse }`,
		`- Chrome: ${ summary.versions.chrome }`,
		`- Result: ${ summary.evaluation.passed ? 'PASS' : 'FAIL' }`,
		`- Recovered retries: ${ summary.warnings.length }`,
		`- Mobile median performance: ${
			summary.evaluation.mobileMedianPerformance ?? 'missing'
		}`,
		'',
		'| Mode | Run | Attempt | Performance | LCP (ms) | CLS | TBT (ms) | Transfer (KiB) | Lazy LCP | Duplicate attachments |',
		'| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
	];

	for ( const result of summary.results ) {
		lines.push(
			`| ${ result.mode } | ${ result.run } | ${ result.attempt } | ${
				result.performance ?? '—'
			} | ${ result.lcpMs?.toFixed( 0 ) ?? '—' } | ${
				result.cls?.toFixed( 3 ) ?? '—'
			} | ${ result.tbtMs?.toFixed( 0 ) ?? '—' } | ${
				result.totalBytes
					? ( result.totalBytes / 1024 ).toFixed( 1 )
					: '—'
			} | ${ result.lcpLazyLoadedPass ? 'pass' : 'fail' } | ${
				result.duplicateImageDownloads.length
			} |`
		);
	}

	if ( summary.warnings.length > 0 ) {
		lines.push( '', '## Recovered retries', '' );
		for ( const warning of summary.warnings ) lines.push( `- ${ warning }` );
	}

	if ( summary.evaluation.failures.length > 0 ) {
		lines.push( '', '## Failures', '' );
		for ( const failure of summary.evaluation.failures ) {
			lines.push( `- ${ failure }` );
		}
	}

	return `${ lines.join( '\n' ) }\n`;
}

export function buildSummary( options, slots, versions, createdAt = new Date().toISOString() ) {
	const results = slots.map( ( slot ) => slot.evaluated );
	const warnings = slots
		.filter( ( slot ) => slot.recovered )
		.map(
			( slot ) =>
				`${ slot.mode } ${ slot.run } recovered on attempt ${ slot.evaluated.attempt }; the initial failure remains in the raw evidence.`
		);
	return {
		url: options.url,
		createdAt,
		versions,
		config: {
			mobileRuns: options.mobileRuns,
			desktopRuns: options.desktopRuns,
			retries: options.retries,
			thresholds: options.thresholds,
			configPath: options.configPath,
		},
		thresholds: options.thresholds,
		slots,
		results,
		warnings,
		evaluation: evaluateResults( results, options.thresholds ),
	};
}

export function helpText() {
	return `Usage:
  npm run lighthouse:sample -- --url=https://example.com/ [options]
  node bin/lighthouse-sample.mjs --url=https://example.com/ [options]

Options:
  --config=<path>       Read this JSON file instead of the optional root lighthouse-sample.config.json.
  --mobile-runs=<n>     Override mobileRuns (1-20).
  --desktop-runs=<n>    Override desktopRuns (1-20).
  --retries=0|1         Disable or enable one fresh-profile retry per failed slot.
  --output-dir=<path>   Override .artifacts/lighthouse/<timestamp>/.

Configuration (every key is optional):
{
  "mobileRuns": 5,
  "desktopRuns": 3,
  "retries": 1,
  "thresholds": {
    "mobileMedianPerformance": 95,
    "mobileMinimumPerformance": 90,
    "desktopMinimumPerformance": 98,
    "lcpMs": 2500,
    "cls": 0.02,
    "tbtMs": 200,
    "totalBytes": 921600
  }
}

Precedence: CLI overrides > selected JSON config > built-in defaults.
The root config is client-owned and optional; the starter ships no config file.
URLs must be public HTTP(S) targets. Local/private hosts and credentials are refused without DNS resolution or a bypass.`;
}

export async function main( argv = process.argv.slice( 2 ) ) {
	const options = parseArguments( argv );
	if ( options.help ) {
		console.log( helpText() );
		return 0;
	}

	const chrome = resolveChrome();
	const lighthouse = resolveLighthouse();
	const chromeVersion =
		spawnSync( chrome, [ '--version' ], {
			encoding: 'utf8',
		} ).stdout.trim() || 'unknown';
	const timestamp = new Date().toISOString().replace( /[:.]/g, '-' );
	const outputDir = resolve(
		options.outputDir || join( '.artifacts', 'lighthouse', timestamp )
	);
	mkdirSync( outputDir, { recursive: true } );

	const slots = collectSampleSlots( options, ( { mode, run, attempt, count } ) => {
		const base = `${ mode }-${ String( run ).padStart( 2, '0' ) }-attempt-${ attempt }`;
		const outputPath = join( outputDir, `${ base }.json` );
		const errorPath = join( outputDir, `${ base }.error.log` );
		console.log(
			`Running Lighthouse ${ mode } ${ run }/${ count } attempt ${ attempt }/${
				options.retries + 1
			}…`
		);
		try {
			return runLighthouse( {
				chrome,
				cli: lighthouse.cli,
				mode,
				outputPath,
				errorPath,
				run,
				attempt,
				url: options.url,
			} );
		} catch ( error ) {
			// runLighthouse records Chrome/Lighthouse failures itself. This catch
			// also preserves parser and filesystem runtime errors for the attempt.
			if ( ! existsSync( errorPath ) ) {
				writeFileSync( errorPath, `${ String( error.message || error ) }\n`, 'utf8' );
			}
			throw error;
		}
	} );
	const summary = buildSummary(
		options,
		slots,
		{
			lighthouse: lighthouse.version,
			chrome: chromeVersion,
		},
		new Date().toISOString()
	);

	writeFileSync(
		join( outputDir, 'summary.json' ),
		`${ JSON.stringify( summary, null, 2 ) }\n`,
		'utf8'
	);
	writeFileSync(
		join( outputDir, 'summary.md' ),
		markdownSummary( summary ),
		'utf8'
	);
	console.log(
		`${ summary.evaluation.passed ? 'PASS' : 'FAIL' }: ${ join(
			outputDir,
			'summary.md'
		) }`
	);

	if ( ! summary.evaluation.passed ) {
		for ( const failure of summary.evaluation.failures ) {
			console.error( `- ${ failure }` );
		}
	}

	return summary.evaluation.passed ? 0 : 1;
}

const isDirectRun =
	process.argv[ 1 ] &&
	import.meta.url === pathToFileURL( resolve( process.argv[ 1 ] ) ).href;

if ( isDirectRun ) {
	main().then(
		( code ) => {
			process.exitCode = code;
		},
		( error ) => {
			console.error( error.message );
			process.exitCode = 1;
		}
	);
}
