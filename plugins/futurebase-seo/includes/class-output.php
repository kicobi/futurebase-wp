<?php
/**
 * Public SEO head output.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Emits one deterministic metadata and schema baseline.
 */
final class Output {
	/**
	 * Render metadata for supported public HTML documents.
	 */
	public static function render(): void {
		$context = Context::current();
		if ( ! Context::supports_output( $context ) ) {
			return;
		}

		$document = Document::resolve( $context );
		$image    = self::image_data( $document['social_image_id'] );

		if ( '' !== $document['description'] ) {
			self::meta_name( 'description', $document['description'] );
		}

		if ( Canonical::should_render( $context ) && null !== $document['canonical'] ) {
			printf( "<link rel=\"canonical\" href=\"%s\" />\n", esc_url( $document['canonical'] ) );
		}

		self::meta_property( 'og:locale', get_locale() );
		self::meta_property( 'og:type', self::open_graph_type( $context ) );
		if ( null !== $document['canonical'] ) {
			self::meta_property( 'og:url', $document['canonical'] );
		}
		self::meta_property( 'og:site_name', get_bloginfo( 'name' ) );
		self::meta_property( 'og:title', $document['title'] );
		if ( '' !== $document['description'] ) {
			self::meta_property( 'og:description', $document['description'] );
		}

		if ( 'article' === self::open_graph_type( $context ) ) {
			$post = get_post( $context['object_id'] );
			if ( $post instanceof \WP_Post ) {
				self::meta_property( 'article:published_time', get_post_time( DATE_W3C, true, $post ) );
				self::meta_property( 'article:modified_time', get_post_modified_time( DATE_W3C, true, $post ) );
			}
		}

		if ( null !== $image ) {
			self::meta_property( 'og:image', $image['url'] );
			self::meta_property( 'og:image:width', (string) $image['width'] );
			self::meta_property( 'og:image:height', (string) $image['height'] );
			if ( '' !== $image['mime'] ) {
				self::meta_property( 'og:image:type', $image['mime'] );
			}
			if ( '' !== $image['alt'] ) {
				self::meta_property( 'og:image:alt', $image['alt'] );
			}
		}

		self::meta_name( 'twitter:card', null !== $image ? 'summary_large_image' : 'summary' );
		self::meta_name( 'twitter:title', $document['title'] );
		if ( '' !== $document['description'] ) {
			self::meta_name( 'twitter:description', $document['description'] );
		}
		if ( null !== $image ) {
			self::meta_name( 'twitter:image', $image['url'] );
			if ( '' !== $image['alt'] ) {
				self::meta_name( 'twitter:image:alt', $image['alt'] );
			}
		}

		self::render_schema( Schema::graph( $context, $document ) );
	}

	/**
	 * Resolve complete public image metadata.
	 *
	 * @param int $image_id Attachment ID.
	 * @return array{url: string, width: int, height: int, mime: string, alt: string}|null
	 */
	public static function image_data( int $image_id ): ?array {
		if ( $image_id < 1 || ! wp_attachment_is_image( $image_id ) ) {
			return null;
		}

		$source = wp_get_attachment_image_src( $image_id, 'full' );
		if ( ! is_array( $source ) ) {
			return null;
		}

		$mime = get_post_mime_type( $image_id );
		$alt  = get_post_meta( $image_id, '_wp_attachment_image_alt', true );

		return array(
			'url'    => (string) $source[0],
			'width'  => absint( $source[1] ),
			'height' => absint( $source[2] ),
			'mime'   => is_string( $mime ) ? $mime : '',
			'alt'    => is_string( $alt ) ? sanitize_text_field( $alt ) : '',
		);
	}

	/**
	 * Resolve the Open Graph document type.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	private static function open_graph_type( array $context ): string {
		return 'singular' === ( $context['kind'] ?? '' ) && 'post' === ( $context['post_type'] ?? '' ) && empty( $context['password_protected'] ) ? 'article' : 'website';
	}

	/**
	 * Print a name-based meta tag.
	 *
	 * @param string $name    Meta name.
	 * @param string $content Meta content.
	 */
	private static function meta_name( string $name, string $content ): void {
		printf( "<meta name=\"%s\" content=\"%s\" />\n", esc_attr( $name ), esc_attr( $content ) );
	}

	/**
	 * Print a property-based meta tag.
	 *
	 * @param string $property Meta property.
	 * @param string $content  Meta content.
	 */
	private static function meta_property( string $property, string $content ): void {
		printf( "<meta property=\"%s\" content=\"%s\" />\n", esc_attr( $property ), esc_attr( $content ) );
	}

	/**
	 * Print the schema graph with script-safe JSON encoding.
	 *
	 * @param list<array<string, mixed>> $graph Schema nodes.
	 */
	private static function render_schema( array $graph ): void {
		if ( empty( $graph ) ) {
			return;
		}

		$json = wp_json_encode(
			array(
				'@context' => 'https://schema.org',
				'@graph'   => $graph,
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
		);

		if ( is_string( $json ) ) {
			printf( "<script type=\"application/ld+json\">%s</script>\n", $json ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wp_json_encode with JSON_HEX_* produces script-safe JSON.
		}
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
