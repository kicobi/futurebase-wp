<?php
/**
 * Verify that the real PHPStan configuration rejects newer runtime APIs.
 *
 * @package bin
 */

call_user_func(
	static function () {
		$root    = dirname( __DIR__ );
		$command = escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( $root . '/vendor/bin/phpstan' )
		. ' analyse --debug --no-progress --error-format=json --configuration='
		. escapeshellarg( $root . '/phpstan.neon.dist' ) . ' ' . escapeshellarg( __DIR__ . '/fixtures/minimum-api-negative.php' );
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec -- This CLI-only test deliberately invokes the installed analyser.
		exec( $command, $lines, $status );
		$report   = json_decode( (string) end( $lines ), true );
		$messages = array();
		foreach ( $report['files'] ?? array() as $file ) {
			foreach ( $file['messages'] as $message ) {
				if ( 'function.notFound' === ( $message['identifier'] ?? '' ) ) {
					$messages[] = $message['message'];
				}
			}
		}
		$joined = implode( "\n", $messages );
		if ( 1 !== $status || 2 !== count( $messages ) || ! str_contains( $joined, 'bcround' ) || ! str_contains( $joined, 'wp_get_view_transitions_admin_css' ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- CLI diagnostics, not a WordPress filesystem operation.
			fwrite( STDERR, "Minimum API canaries failed: PHPStan must reject both newer functions.\n" . implode( "\n", $lines ) . "\n" );
			exit( 1 );
		}
		echo "Minimum API canaries: PHP 8.4 and WordPress 7.0 functions rejected.\n";
	}
);
