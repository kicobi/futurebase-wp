// Dependency-safe CLI bootstrap. Keep this file limited to Node built-ins so it
// can explain how to restore the nested install even when dispatch cannot load.
import { OutputExit, finishOutput } from '../lib/output.mjs';

const INSTALL_COMMAND = 'npm ci --prefix tools/project-system --ignore-scripts';

function isDependencyImportFailure(error) {
	const code = error?.code;
	const message = String(error?.message || error || '');
	return (
		['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_PACKAGE_IMPORT_NOT_DEFINED'].includes(code) ||
		/does not provide an export named|requested module .* does not provide|cannot find package|cannot find module/i.test(message)
	);
}

export async function runCli(args) {
	try {
		const { main } = await import('../cli/dispatch.mjs');
		await main(args);
	} catch (error) {
		if (error instanceof OutputExit) {
			await finishOutput(error);
			return;
		}
		if (isDependencyImportFailure(error)) {
			console.error('✗ project-system dependencies are missing or incompatible.');
			console.error(`  Run: ${INSTALL_COMMAND}`);
			process.exitCode = 3;
			return;
		}
		console.error(`✗ ${error?.stack || error?.message || error}`);
		process.exitCode = 5;
	}
}

export { INSTALL_COMMAND, isDependencyImportFailure };
