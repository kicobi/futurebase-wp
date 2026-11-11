<?php
/**
 * Companion SEO WP-CLI diagnostics.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Presents suppression, configuration, and per-URL indexing decisions.
 */
final class Cli {
	private const BACKUP_ADVICE = 'Back up the current site database before deleting companion SEO data.';

	/**
	 * Register diagnostics in every suppression state.
	 */
	public static function register(): void {
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			\WP_CLI::add_command( 'compseo', self::class );
		}
	}

	/**
	 * Show non-secret plugin readiness and suppression state.
	 *
	 * ## OPTIONS
	 *
	 * [--format=<format>]
	 * : Output format. Accepts table or json.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 * ---
	 *
	 * @param array                 $args       Positional arguments.
	 * @param array<string, string> $assoc_args Named arguments.
	 * @phpstan-param list<string> $args
	 */
	public function status( array $args, array $assoc_args ): void {
		unset( $args );
		$settings = Settings::all();
		$provider = Suppression::provider();
		$data     = array(
			'version'                        => FUTUREBASE_SEO_VERSION,
			'settings_schema'                => Settings::SCHEMA_VERSION,
			'suppressed'                     => Suppression::is_suppressed(),
			'provider'                       => $provider,
			'blog_public'                    => (bool) get_option( 'blog_public' ),
			'entity_ready'                   => null !== Settings::entity(),
			'google_verification_configured' => '' !== (string) $settings['verification']['google'],
			'bing_verification_configured'   => '' !== (string) $settings['verification']['bing'],
		);

		self::display( $data, self::format( $assoc_args ) );
	}

	/**
	 * Explain the indexing decision for a same-origin URL or relative path.
	 *
	 * ## OPTIONS
	 *
	 * <url-or-path>
	 * : Same-origin HTTP(S) URL or site-relative path.
	 *
	 * [--format=<format>]
	 * : Output format. Accepts table or json.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 * ---
	 *
	 * @param array                 $args       Positional arguments.
	 * @param array<string, string> $assoc_args Named arguments.
	 * @phpstan-param list<string> $args
	 */
	public function decision( array $args, array $assoc_args ): void {
		if ( 1 !== count( $args ) ) {
			\WP_CLI::error( 'Provide exactly one same-origin URL or relative path.' );
		}

		$url = self::target_url( $args[0] );
		if ( null === $url ) {
			\WP_CLI::error( 'The decision target must be a same-origin HTTP(S) URL or relative path without credentials or a fragment.' );
		}

		$data = self::with_request(
			$url,
			static function () use ( $url ): array {
				$context  = Context::current();
				$decision = Decision::resolve( $context );
				return array(
					'url'        => $url,
					'context'    => $context,
					'index'      => $decision['index'],
					'follow'     => $decision['follow'],
					'canonical'  => $decision['canonical'],
					'reason'     => $decision['reason'],
					'suppressed' => Suppression::is_suppressed(),
					'provider'   => Suppression::provider(),
				);
			}
		);

		self::display( $data, self::format( $assoc_args ) );
	}

	/**
	 * Report or delete all companion SEO data owned by the current site.
	 *
	 * The command is a dry run unless --yes is present. It never deletes posts,
	 * media, referenced attachments, or data belonging to another site.
	 *
	 * ## OPTIONS
	 *
	 * [--yes]
	 * : Delete the reported settings option and post metadata.
	 *
	 * [--network]
	 * : Unsupported safety flag. Network-wide cleanup is always refused.
	 *
	 * [--format=<format>]
	 * : Output format. Accepts table or json.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 * ---
	 *
	 * @param array                $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named arguments.
	 * @phpstan-param list<string> $args
	 */
	public function purge( array $args, array $assoc_args ): void {
		if ( array() !== $args ) {
			\WP_CLI::error( 'The purge command does not accept positional arguments.' );
		}
		if ( array_key_exists( 'network', $assoc_args ) ) {
			\WP_CLI::error( 'Network-wide cleanup is unsupported. Target one site at a time with the WP-CLI --url global parameter.' );
		}

		$format = self::format( $assoc_args );
		try {
			$before = Cleanup::report();
		} catch ( \RuntimeException ) {
			\WP_CLI::error( 'Companion SEO cleanup could not read database counts. No cleanup was attempted.' );
		}
		$data = array(
			'action'              => 'dry-run',
			'site_id'             => get_current_blog_id(),
			'site_url'            => home_url( '/' ),
			'settings_options'    => $before['settings_options'],
			'metadata_rows'       => $before['metadata_rows'],
			'posts_with_metadata' => $before['posts_with_metadata'],
			'metadata_by_key'     => $before['metadata_by_key'],
			'posts_deleted'       => 0,
			'attachments_deleted' => 0,
			'backup_advice'       => self::BACKUP_ADVICE,
		);

		if ( ! array_key_exists( 'yes', $assoc_args ) ) {
			self::display( $data, $format );
			return;
		}

		try {
			$result = Cleanup::purge();
		} catch ( \RuntimeException ) {
			\WP_CLI::error( 'Companion SEO cleanup did not complete. No posts or media were targeted; restore from the database backup if needed.' );
		}

		$data['action']                     = 'purged';
		$data['remaining_settings_options'] = $result['after']['settings_options'];
		$data['remaining_metadata_rows']    = $result['after']['metadata_rows'];
		self::display( $data, $format );
	}

	/**
	 * Resolve a safe target against the current single site.
	 *
	 * @param string $target URL or relative path supplied to the command.
	 */
	private static function target_url( string $target ): ?string {
		$target = trim( $target );
		if ( '' === $target || str_contains( $target, "\n" ) || str_contains( $target, "\r" ) ) {
			return null;
		}

		if ( str_starts_with( $target, '/' ) || str_starts_with( $target, '?' ) ) {
			$url = home_url( '/' . ltrim( $target, '/' ) );
		} elseif ( ! preg_match( '#^[a-z][a-z0-9+.-]*://#i', $target ) ) {
			$url = home_url( '/' . ltrim( $target, '/' ) );
		} else {
			$url = $target;
		}

		$url = Url::canonical( $url );
		if ( '' === $url || ! self::same_origin( $url, home_url( '/' ) ) ) {
			return null;
		}
		return $url;
	}

	/**
	 * Compare scheme, host, and effective port.
	 *
	 * @param string $left  Candidate URL.
	 * @param string $right Site URL.
	 */
	private static function same_origin( string $left, string $right ): bool {
		$left_parts  = wp_parse_url( $left );
		$right_parts = wp_parse_url( $right );
		if ( false === $left_parts || false === $right_parts ) {
			return false;
		}

		$left_scheme  = strtolower( (string) ( $left_parts['scheme'] ?? '' ) );
		$right_scheme = strtolower( (string) ( $right_parts['scheme'] ?? '' ) );
		$left_port    = isset( $left_parts['port'] ) ? (int) $left_parts['port'] : ( 'https' === $left_scheme ? 443 : 80 );
		$right_port   = isset( $right_parts['port'] ) ? (int) $right_parts['port'] : ( 'https' === $right_scheme ? 443 : 80 );

		return $left_scheme === $right_scheme
			&& strtolower( (string) ( $left_parts['host'] ?? '' ) ) === strtolower( (string) ( $right_parts['host'] ?? '' ) )
			&& $left_port === $right_port;
	}

	/**
	 * Replay WordPress routing in memory and restore the CLI process afterward.
	 *
	 * @param string   $url      Absolute same-origin URL.
	 * @param callable $callback Decision callback.
	 * @return array<string, mixed>
	 * @phpstan-param callable(): array<string, mixed> $callback
	 */
	private static function with_request( string $url, callable $callback ): array {
		$parts = wp_parse_url( $url );
		if ( false === $parts ) {
			\WP_CLI::error( 'The decision target could not be parsed.' );
		}

		$path         = $parts['path'] ?? '/';
		$query_string = $parts['query'] ?? '';
		$request_uri  = $path . ( '' !== $query_string ? '?' . $query_string : '' );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Preserve internal CLI process state; this is not form handling.
		$original_get = $_GET;
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.MissingUnslash,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Preserve the exact internal CLI value for restoration, not request consumption.
		$original_request_uri = $_SERVER['REQUEST_URI'] ?? null;
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.MissingUnslash,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Preserve the exact internal CLI value for restoration, not request consumption.
		$original_path_info = $_SERVER['PATH_INFO'] ?? null;
		$original           = array(
			'get'          => $original_get,
			'request_uri'  => $original_request_uri,
			'path_info'    => $original_path_info,
			'wp'           => $GLOBALS['wp'] ?? null,
			'wp_query'     => $GLOBALS['wp_query'] ?? null,
			'wp_the_query' => $GLOBALS['wp_the_query'] ?? null,
			'post'         => $GLOBALS['post'] ?? null,
		);

		parse_str( $query_string, $query_args );
		$_GET                   = $query_args;
		$_SERVER['REQUEST_URI'] = $request_uri;
		unset( $_SERVER['PATH_INFO'] );

		try {
			$wp = new \WP();
			// Registered CPT/taxonomy query variables are attached during init to
			// the existing WP instance. A fresh instance otherwise loses them.
			if ( $original['wp'] instanceof \WP ) {
				$wp->public_query_vars  = $original['wp']->public_query_vars;
				$wp->private_query_vars = $original['wp']->private_query_vars;
			}
			if ( ! $wp->parse_request() ) {
				\WP_CLI::error( 'WordPress could not parse the decision target.' );
			}

			$query                   = new \WP_Query();
			$GLOBALS['wp']           = $wp; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Isolated read-only CLI request replay.
			$GLOBALS['wp_query']     = $query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Isolated read-only CLI request replay.
			$GLOBALS['wp_the_query'] = $query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Isolated read-only CLI request replay.
			$query->query( $wp->query_vars );
			$wp->handle_404();
			$GLOBALS['post'] = $query->post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Isolated read-only CLI request replay.
			if ( $query->post instanceof \WP_Post ) {
				setup_postdata( $query->post );
			}

			return $callback();
		} finally {
			wp_reset_postdata();
			$_GET = $original['get'];
			self::restore_server( 'REQUEST_URI', $original['request_uri'] );
			self::restore_server( 'PATH_INFO', $original['path_info'] );
			$GLOBALS['wp']           = $original['wp']; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Restore prior CLI globals.
			$GLOBALS['wp_query']     = $original['wp_query']; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Restore prior CLI globals.
			$GLOBALS['wp_the_query'] = $original['wp_the_query']; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Restore prior CLI globals.
			$GLOBALS['post']         = $original['post']; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Restore prior CLI globals.
		}
	}

	/**
	 * Restore one server value while preserving prior absence.
	 *
	 * @param string $key   Server-array key.
	 * @param mixed  $value Original value.
	 */
	private static function restore_server( string $key, mixed $value ): void {
		if ( null === $value ) {
			unset( $_SERVER[ $key ] );
		} else {
			$_SERVER[ $key ] = $value;
		}
	}

	/**
	 * Validate the documented output formats.
	 *
	 * @param array<string, mixed> $assoc_args Named arguments.
	 */
	private static function format( array $assoc_args ): string {
		$format = $assoc_args['format'] ?? 'table';
		if ( ! in_array( $format, array( 'table', 'json' ), true ) ) {
			\WP_CLI::error( 'Format must be table or json.' );
		}
		return $format;
	}

	/**
	 * Render one diagnostic object without exposing verification values.
	 *
	 * @param array<string, mixed> $data   Diagnostic data.
	 * @param string               $format Output format.
	 */
	private static function display( array $data, string $format ): void {
		if ( 'json' === $format ) {
			$json = wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
			\WP_CLI::line( is_string( $json ) ? $json : '{}' );
			return;
		}

		$rows = array();
		foreach ( $data as $key => $value ) {
			if ( is_array( $value ) ) {
				$value = wp_json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
			} elseif ( is_bool( $value ) ) {
				$value = $value ? 'yes' : 'no';
			} elseif ( null === $value ) {
				$value = 'none';
			}
			$rows[] = array(
				'property' => $key,
				'value'    => (string) $value,
			);
		}
		\WP_CLI\Utils\format_items( 'table', $rows, array( 'property', 'value' ) );
	}
}
