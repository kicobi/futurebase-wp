<?php
/**
 * Companion SEO settings screen.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Registers and renders management UI independently of runtime suppression.
 */
final class Admin {
	/**
	 * Register management hooks.
	 */
	public static function register(): void {
		add_action( 'admin_init', array( self::class, 'register_setting' ) );
		add_action( 'admin_menu', array( self::class, 'register_page' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'enqueue_assets' ) );
	}

	/**
	 * Register the schema-versioned option.
	 */
	public static function register_setting(): void {
		register_setting(
			self::page_slug(),
			Identifiers::OPTION_SETTINGS,
			array(
				'type'              => 'array',
				'default'           => Settings::defaults(),
				'sanitize_callback' => array( Settings::class, 'sanitize' ),
			)
		);
	}

	/**
	 * Add Settings → SEO.
	 */
	public static function register_page(): void {
		add_options_page(
			__( 'SEO Settings', 'futurebase-seo' ),
			__( 'SEO', 'futurebase-seo' ),
			'manage_options',
			self::page_slug(),
			array( self::class, 'render' )
		);
	}

	/**
	 * Enqueue settings media controls only on this screen.
	 *
	 * @param string $hook_suffix Current admin-page hook suffix.
	 */
	public static function enqueue_assets( string $hook_suffix ): void {
		if ( 'settings_page_' . self::page_slug() !== $hook_suffix || Suppression::is_suppressed() ) {
			return;
		}

		$asset_file = dirname( FUTUREBASE_SEO_FILE ) . '/build/settings.asset.php';
		if ( ! is_readable( $asset_file ) ) {
			return;
		}

		$asset = require $asset_file;
		if ( ! is_array( $asset ) ) {
			return;
		}

		wp_enqueue_media();
		wp_enqueue_script(
			FUTUREBASE_SEO_BUILD_HANDLE . '-settings',
			plugins_url( 'build/settings.js', FUTUREBASE_SEO_FILE ),
			isset( $asset['dependencies'] ) && is_array( $asset['dependencies'] ) ? $asset['dependencies'] : array(),
			isset( $asset['version'] ) && is_string( $asset['version'] ) ? $asset['version'] : FUTUREBASE_SEO_VERSION,
			true
		);
		wp_set_script_translations( FUTUREBASE_SEO_BUILD_HANDLE . '-settings', 'futurebase-seo' );

		$style_path = dirname( FUTUREBASE_SEO_FILE ) . '/build/settings.css';
		if ( is_readable( $style_path ) ) {
			wp_enqueue_style(
				FUTUREBASE_SEO_BUILD_HANDLE . '-settings',
				plugins_url( 'build/settings.css', FUTUREBASE_SEO_FILE ),
				array(),
				(string) filemtime( $style_path )
			);
		}
	}

	/**
	 * Render the complete schema-V2 settings screen.
	 */
	public static function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings   = Settings::all();
		$entity     = $settings['entity'];
		$social     = $settings['social'];
		$verify     = $settings['verification'];
		$indexing   = $settings['indexing'];
		$suppressed = Suppression::is_suppressed();
		?>
		<div class="wrap compseo-settings">
			<h1><?php esc_html_e( 'SEO Settings', 'futurebase-seo' ); ?></h1>
			<?php settings_errors( Identifiers::OPTION_SETTINGS ); ?>

			<?php if ( $suppressed ) : ?>
				<div class="notice notice-warning inline">
					<p><?php esc_html_e( 'Another supported SEO provider is active. These saved settings are read-only and this plugin does not output them. Migrate verification and social settings to the active provider before removing this plugin.', 'futurebase-seo' ); ?></p>
				</div>
			<?php elseif ( null === Settings::entity() ) : ?>
				<div class="notice notice-info inline">
					<p><?php esc_html_e( 'Choose a site entity type and name to complete the Person or Organization schema used on the homepage.', 'futurebase-seo' ); ?></p>
				</div>
			<?php endif; ?>
			<?php if ( ! get_option( 'blog_public' ) ) : ?>
				<div class="notice notice-warning inline">
					<p><?php esc_html_e( 'WordPress search-engine visibility is disabled. That site-wide noindex, nofollow decision overrides every archive policy shown below.', 'futurebase-seo' ); ?></p>
				</div>
			<?php endif; ?>

			<form action="options.php" method="post">
				<?php settings_fields( self::page_slug() ); ?>
				<div class="compseo-settings__stack">
					<fieldset <?php disabled( $suppressed ); ?>>
						<legend class="compseo-settings__heading"><?php esc_html_e( 'Site entity', 'futurebase-seo' ); ?></legend>
						<p class="description"><?php esc_html_e( 'Identify the real person or organization represented by this website.', 'futurebase-seo' ); ?></p>
						<?php
						self::select_field(
							'entity-type',
							'entity[type]',
							__( 'Entity type', 'futurebase-seo' ),
							(string) $entity['type'],
							array(
								''             => __( 'Not configured', 'futurebase-seo' ),
								'person'       => __( 'Person', 'futurebase-seo' ),
								'organization' => __( 'Organization', 'futurebase-seo' ),
							),
							$suppressed
						);
						?>
						<?php self::text_field( 'entity-name', 'entity[name]', __( 'Name', 'futurebase-seo' ), (string) $entity['name'], $suppressed ); ?>
						<?php self::text_field( 'entity-url', 'entity[url]', __( 'Canonical entity URL', 'futurebase-seo' ), (string) $entity['url'], $suppressed, 'url', __( 'Leave empty to use the site homepage.', 'futurebase-seo' ) ); ?>
						<?php self::media_field( 'entity[logo_id]', __( 'Entity logo or portrait', 'futurebase-seo' ), (int) $entity['logo_id'], $suppressed, false ); ?>
					</fieldset>

					<fieldset <?php disabled( $suppressed ); ?>>
						<legend class="compseo-settings__heading"><?php esc_html_e( 'Social sharing defaults', 'futurebase-seo' ); ?></legend>
						<?php self::media_field( 'social[default_image_id]', __( 'Default social image', 'futurebase-seo' ), (int) $social['default_image_id'], $suppressed, true ); ?>
						<div class="compseo-settings__field">
							<label for="compseo-social-profiles"><?php esc_html_e( 'Social profile URLs', 'futurebase-seo' ); ?></label>
							<textarea id="compseo-social-profiles" name="<?php echo esc_attr( self::field_name( 'social[profiles]' ) ); ?>" rows="5" class="large-text" <?php disabled( $suppressed ); ?>><?php echo esc_textarea( implode( "\n", $social['profiles'] ) ); ?></textarea>
							<p class="description"><?php esc_html_e( 'Enter one public HTTP or HTTPS profile URL per line.', 'futurebase-seo' ); ?></p>
						</div>
						<?php self::text_field( 'x-handle', 'social[x_handle]', __( 'X handle', 'futurebase-seo' ), (string) $social['x_handle'], $suppressed, 'text', __( 'The leading @ is optional.', 'futurebase-seo' ) ); ?>
					</fieldset>

					<fieldset <?php disabled( $suppressed ); ?>>
						<legend class="compseo-settings__heading"><?php esc_html_e( 'Site verification', 'futurebase-seo' ); ?></legend>
						<p class="description"><?php esc_html_e( 'Paste a bare token or the complete verification meta tag. Only the token is stored, and output appears only on the canonical homepage.', 'futurebase-seo' ); ?></p>
						<?php self::text_field( 'google-verification', 'verification[google]', __( 'Google Search Console', 'futurebase-seo' ), (string) $verify['google'], $suppressed, 'text', __( 'Supports URL-prefix properties. Use DNS verification for domain properties.', 'futurebase-seo' ) ); ?>
						<?php self::text_field( 'bing-verification', 'verification[bing]', __( 'Bing Webmaster Tools', 'futurebase-seo' ), (string) $verify['bing'], $suppressed ); ?>
					</fieldset>

					<fieldset <?php disabled( $suppressed ); ?>>
						<legend class="compseo-settings__heading"><?php esc_html_e( 'Archive indexing policies', 'futurebase-seo' ); ?></legend>
						<p class="description"><?php esc_html_e( 'Choose whether each archive surface should appear in search results. Noindex does not make content private.', 'futurebase-seo' ); ?></p>
						<?php self::policy_field( 'blog', 'indexing[blog]', __( 'Blog index', 'futurebase-seo' ), (string) $indexing['blog'], $suppressed ); ?>

						<?php foreach ( Policy::post_types() as $slug => $post_type ) : ?>
							<?php
							self::policy_field(
								'post-type-' . $slug,
								'indexing[post_types][' . $slug . ']',
								sprintf(
									/* translators: %s: post-type plural label. */
									__( '%s archive', 'futurebase-seo' ),
									$post_type->labels->name
								),
								isset( $indexing['post_types'][ $slug ] ) ? (string) $indexing['post_types'][ $slug ] : Policy::INDEX,
								$suppressed
							);
							?>
						<?php endforeach; ?>

						<?php foreach ( Policy::taxonomies() as $slug => $taxonomy ) : ?>
							<?php
							self::policy_field(
								'taxonomy-' . $slug,
								'indexing[taxonomies][' . $slug . ']',
								sprintf(
									/* translators: %s: taxonomy plural label. */
									__( '%s archives', 'futurebase-seo' ),
									$taxonomy->labels->name
								),
								isset( $indexing['taxonomies'][ $slug ] ) ? (string) $indexing['taxonomies'][ $slug ] : Policy::INDEX,
								$suppressed
							);
							?>
						<?php endforeach; ?>

						<?php self::policy_field( 'author', 'indexing[author]', __( 'Author archives', 'futurebase-seo' ), (string) $indexing['author'], $suppressed ); ?>
						<?php self::policy_field( 'date', 'indexing[date]', __( 'Date archives', 'futurebase-seo' ), (string) $indexing['date'], $suppressed ); ?>
						<?php self::policy_field( 'filtered', 'indexing[filtered]', __( 'Filtered archive URLs', 'futurebase-seo' ), (string) $indexing['filtered'], $suppressed, __( 'Tracking-only parameters inherit their base archive. Project adapters can allow named public query variables.', 'futurebase-seo' ) ); ?>
					</fieldset>
				</div>

				<?php if ( ! $suppressed ) : ?>
					<?php submit_button(); ?>
				<?php endif; ?>
			</form>

			<?php self::render_policy_table( $indexing ); ?>
		</div>
		<?php
	}

	/**
	 * Render a text input.
	 *
	 * @param string $id          Element ID suffix.
	 * @param string $path        Nested option path.
	 * @param string $label       Visible field label.
	 * @param string $value       Current value.
	 * @param bool   $disabled    Whether the control is read-only.
	 * @param string $type        HTML input type.
	 * @param string $description Optional help text.
	 */
	private static function text_field( string $id, string $path, string $label, string $value, bool $disabled, string $type = 'text', string $description = '' ): void {
		$description_id = 'compseo-' . $id . '-description';
		?>
		<div class="compseo-settings__field">
			<label for="compseo-<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
			<input type="<?php echo esc_attr( $type ); ?>" id="compseo-<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( self::field_name( $path ) ); ?>" value="<?php echo esc_attr( $value ); ?>" class="regular-text" <?php echo '' !== $description ? 'aria-describedby="' . esc_attr( $description_id ) . '"' : ''; ?> <?php disabled( $disabled ); ?>>
			<?php if ( '' !== $description ) : ?>
				<p id="<?php echo esc_attr( $description_id ); ?>" class="description"><?php echo esc_html( $description ); ?></p>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Render a select input.
	 *
	 * @param string                $id       Element ID suffix.
	 * @param string                $path     Nested option path.
	 * @param string                $label    Visible field label.
	 * @param string                $value    Current value.
	 * @param array<string, string> $options Options keyed by stored value.
	 * @param bool                  $disabled Whether the control is read-only.
	 * @param string                $description Optional help text.
	 */
	private static function select_field( string $id, string $path, string $label, string $value, array $options, bool $disabled, string $description = '' ): void {
		$description_id = 'compseo-' . $id . '-description';
		?>
		<div class="compseo-settings__field">
			<label for="compseo-<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
			<select id="compseo-<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( self::field_name( $path ) ); ?>" <?php echo '' !== $description ? 'aria-describedby="' . esc_attr( $description_id ) . '"' : ''; ?> <?php disabled( $disabled ); ?>>
				<?php foreach ( $options as $option_value => $option_label ) : ?>
					<option value="<?php echo esc_attr( $option_value ); ?>" <?php selected( $value, $option_value ); ?>><?php echo esc_html( $option_label ); ?></option>
				<?php endforeach; ?>
			</select>
			<?php if ( '' !== $description ) : ?>
				<p id="<?php echo esc_attr( $description_id ); ?>" class="description"><?php echo esc_html( $description ); ?></p>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Render one two-state archive-policy select.
	 *
	 * @param string $id          Element ID suffix.
	 * @param string $path        Nested option path.
	 * @param string $label       Visible field label.
	 * @param string $value       Current policy.
	 * @param bool   $disabled    Whether the control is read-only.
	 * @param string $description Optional help text.
	 */
	private static function policy_field( string $id, string $path, string $label, string $value, bool $disabled, string $description = '' ): void {
		self::select_field(
			'indexing-' . $id,
			$path,
			$label,
			$value,
			array(
				Policy::INDEX   => __( 'Index', 'futurebase-seo' ),
				Policy::NOINDEX => __( 'Noindex', 'futurebase-seo' ),
			),
			$disabled,
			$description
		);
	}

	/**
	 * Render the saved effective-policy table, including inert stale entries.
	 *
	 * @param array<string, mixed> $indexing Normalized indexing settings.
	 */
	private static function render_policy_table( array $indexing ): void {
		$rows       = array();
		$post_types = Policy::post_types();
		$taxonomies = Policy::taxonomies();

		$rows[] = array( __( 'Blog index', 'futurebase-seo' ), 'blog', (string) $indexing['blog'], __( 'Available', 'futurebase-seo' ) );
		foreach ( $post_types as $slug => $post_type ) {
			$policy = isset( $indexing['post_types'][ $slug ] ) ? (string) $indexing['post_types'][ $slug ] : Policy::INDEX;
			$rows[] = array( $post_type->labels->name, $slug, $policy, __( 'Available', 'futurebase-seo' ) );
		}
		foreach ( $taxonomies as $slug => $taxonomy ) {
			$policy = isset( $indexing['taxonomies'][ $slug ] ) ? (string) $indexing['taxonomies'][ $slug ] : Policy::INDEX;
			$rows[] = array( $taxonomy->labels->name, $slug, $policy, __( 'Available', 'futurebase-seo' ) );
		}

		$stored_post_types = is_array( $indexing['post_types'] ) ? $indexing['post_types'] : array();
		foreach ( array_diff_key( $stored_post_types, $post_types ) as $slug => $policy ) {
			$rows[] = array( __( 'Post-type archive', 'futurebase-seo' ), (string) $slug, (string) $policy, __( 'Not currently registered', 'futurebase-seo' ) );
		}
		$stored_taxonomies = is_array( $indexing['taxonomies'] ) ? $indexing['taxonomies'] : array();
		foreach ( array_diff_key( $stored_taxonomies, $taxonomies ) as $slug => $policy ) {
			$rows[] = array( __( 'Taxonomy archive', 'futurebase-seo' ), (string) $slug, (string) $policy, __( 'Not currently registered', 'futurebase-seo' ) );
		}

		$rows[] = array( __( 'Author archives', 'futurebase-seo' ), 'author', (string) $indexing['author'], __( 'Available', 'futurebase-seo' ) );
		$rows[] = array( __( 'Date archives', 'futurebase-seo' ), 'date', (string) $indexing['date'], __( 'Available', 'futurebase-seo' ) );
		$rows[] = array( __( 'Filtered archive URLs', 'futurebase-seo' ), 'filtered', (string) $indexing['filtered'], __( 'Available', 'futurebase-seo' ) );
		$rows[] = array( __( 'Search results', 'futurebase-seo' ), 'search', Policy::NOINDEX, __( 'Fixed', 'futurebase-seo' ) );
		$rows[] = array( __( 'Not-found pages', 'futurebase-seo' ), 'not_found', Policy::NOINDEX, __( 'Fixed', 'futurebase-seo' ) );
		if ( get_option( 'wp_attachment_pages_enabled', true ) ) {
			$rows[] = array( __( 'Live attachment pages', 'futurebase-seo' ), 'attachment', Policy::NOINDEX, __( 'Fixed', 'futurebase-seo' ) );
		} else {
			$rows[] = array( __( 'Attachment pages', 'futurebase-seo' ), 'attachment', 'inherit', __( 'Redirected by WordPress', 'futurebase-seo' ) );
		}
		$rows[] = array( __( 'Unrecognized routes', 'futurebase-seo' ), 'unknown', Policy::NOINDEX, __( 'Fixed', 'futurebase-seo' ) );
		?>
		<div class="compseo-settings__policy-table">
			<table class="widefat striped">
				<caption><?php esc_html_e( 'Effective indexing policy', 'futurebase-seo' ); ?></caption>
				<thead>
					<tr>
						<th scope="col"><?php esc_html_e( 'Surface', 'futurebase-seo' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Identifier', 'futurebase-seo' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Policy', 'futurebase-seo' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Status', 'futurebase-seo' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ( $rows as $row ) : ?>
						<tr>
							<th scope="row"><?php echo esc_html( $row[0] ); ?></th>
							<td><code><?php echo esc_html( $row[1] ); ?></code></td>
							<td><?php echo esc_html( $row[2] ); ?></td>
							<td><?php echo esc_html( $row[3] ); ?></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
		<?php
	}

	/**
	 * Render one attachment-ID media field.
	 *
	 * @param string $path          Nested option path.
	 * @param string $label         Visible field label.
	 * @param int    $attachment_id Current attachment ID.
	 * @param bool   $disabled      Whether the control is read-only.
	 * @param bool   $warn          Whether to show social-image guidance.
	 */
	private static function media_field( string $path, string $label, int $attachment_id, bool $disabled, bool $warn ): void {
		$media = self::media_data( $attachment_id );
		?>
		<fieldset class="compseo-settings__field compseo-media" data-compseo-media data-warn="<?php echo $warn ? '1' : '0'; ?>">
			<legend class="compseo-settings__label"><?php echo esc_html( $label ); ?></legend>
			<input type="hidden" name="<?php echo esc_attr( self::field_name( $path ) ); ?>" value="<?php echo esc_attr( (string) $attachment_id ); ?>" data-compseo-media-id>
			<div data-compseo-media-preview><?php echo $media['html']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Core attachment HTML. ?></div>
			<div class="compseo-settings__cluster">
				<button type="button" class="button" data-compseo-media-select <?php disabled( $disabled ); ?>><?php echo esc_html( 0 < $attachment_id ? __( 'Replace image', 'futurebase-seo' ) : __( 'Select image', 'futurebase-seo' ) ); ?></button>
				<button type="button" class="button-link-delete" data-compseo-media-remove <?php disabled( $disabled || 0 === $attachment_id ); ?>><?php esc_html_e( 'Remove image', 'futurebase-seo' ); ?></button>
			</div>
			<p class="description" data-compseo-media-status aria-live="polite"><?php echo esc_html( $warn ? self::media_warning( $media ) : '' ); ?></p>
		</fieldset>
		<?php
	}

	/**
	 * Return presentation data for one attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array{html: string, width: int, height: int, alt: string}
	 */
	private static function media_data( int $attachment_id ): array {
		$metadata = 0 < $attachment_id ? wp_get_attachment_metadata( $attachment_id ) : array();
		return array(
			'html'   => 0 < $attachment_id ? (string) wp_get_attachment_image( $attachment_id, 'medium', false, array( 'data-compseo-media-image' => '' ) ) : '',
			'width'  => is_array( $metadata ) && isset( $metadata['width'] ) ? (int) $metadata['width'] : 0,
			'height' => is_array( $metadata ) && isset( $metadata['height'] ) ? (int) $metadata['height'] : 0,
			'alt'    => 0 < $attachment_id ? trim( (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) ) : '',
		);
	}

	/**
	 * Describe advisory social-image issues.
	 *
	 * @param array{html: string, width: int, height: int, alt: string} $media Media data.
	 */
	private static function media_warning( array $media ): string {
		$warnings = array();
		if ( ( 0 < $media['width'] && $media['width'] < 1200 ) || ( 0 < $media['height'] && $media['height'] < 630 ) ) {
			$warnings[] = __( 'This image is smaller than the recommended 1200 × 630 pixels.', 'futurebase-seo' );
		}
		if ( '' === $media['alt'] && '' !== $media['html'] ) {
			$warnings[] = __( 'This image has no alternative text.', 'futurebase-seo' );
		}
		return implode( ' ', $warnings );
	}

	/**
	 * Build a nested option field name.
	 *
	 * @param string $path Nested option path.
	 */
	private static function field_name( string $path ): string {
		$parts = preg_split( '/[\[\]]+/', $path, -1, PREG_SPLIT_NO_EMPTY );
		$parts = false === $parts ? array() : $parts;
		return Identifiers::OPTION_SETTINGS . '[' . implode( '][', $parts ) . ']';
	}

	/**
	 * Derive the page slug from the renameable plugin directory.
	 */
	private static function page_slug(): string {
		return sanitize_key( basename( dirname( FUTUREBASE_SEO_FILE ) ) ) . '-settings';
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
