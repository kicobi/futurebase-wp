<?php
/**
 * SEO document resolution.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Resolves titles, descriptions, canonicals, and social images.
 */
final class Document {
	/**
	 * Final filtered document for the current frontend request.
	 *
	 * @var array{title: string, description: string, canonical: string|null, social_image_id: int}|null
	 */
	private static ?array $resolved = null;

	/**
	 * Resolve the document after WordPress has parsed the main query.
	 *
	 * Core's title resolver runs before the companion installs its short-circuit,
	 * so existing core and project title filters run once. The cached final value
	 * then controls both the rendered title tag and the later metadata output.
	 */
	public static function prepare(): void {
		$context = Context::current();
		if ( ! Context::supports_output( $context ) ) {
			return;
		}

		self::resolve( $context );
		add_filter( 'pre_get_document_title', array( self::class, 'filter_title' ), PHP_INT_MAX );
	}

	/**
	 * Return the already resolved complete title before core adds separators or
	 * suffixes.
	 *
	 * @param string $title Short-circuit title; normally empty.
	 */
	public static function filter_title( string $title ): string {
		return null !== self::$resolved && '' !== self::$resolved['title'] ? self::$resolved['title'] : $title;
	}

	/**
	 * Resolve the current document and apply its permanent filter.
	 *
	 * @param array<string, mixed>|null $context Optional request context.
	 * @return array{title: string, description: string, canonical: string|null, social_image_id: int}
	 */
	public static function resolve( ?array $context = null ): array {
		if ( null !== self::$resolved ) {
			return self::$resolved;
		}

		$context ??= Context::current();
		$decision = Decision::resolve( $context );

		$document = array(
			'title'           => self::title( $context ),
			'description'     => self::description( $context ),
			'canonical'       => $decision['canonical'],
			'social_image_id' => self::social_image_id( $context ),
		);

		$document              = Contracts::document( $document, $context );
		$document['canonical'] = Canonical::cohere( $document['canonical'], $decision, $context );
		self::$resolved        = $document;
		return self::$resolved;
	}

	/**
	 * Return the prepared document without triggering resolution.
	 *
	 * @return array{title: string, description: string, canonical: string|null, social_image_id: int}|null
	 */
	public static function prepared(): ?array {
		return self::$resolved;
	}

	/**
	 * Extract the first two textual sentences from block content.
	 *
	 * This parses at render time and relies on normal full-page caching. It does
	 * not persist derived metadata or execute dynamic blocks.
	 *
	 * @param string $content Serialized post content.
	 */
	public static function content_sentences( string $content ): string {
		if ( '' === trim( $content ) ) {
			return '';
		}

		$chunks = self::block_text_chunks( parse_blocks( $content ) );
		$taken  = array();

		foreach ( $chunks as $chunk ) {
			$sentences = preg_split( '/(?<=[.!?])\s+/u', $chunk );
			if ( false === $sentences ) {
				$sentences = array( $chunk );
			}

			foreach ( $sentences as $sentence ) {
				$sentence = self::plain_text( $sentence );
				if ( '' === $sentence ) {
					continue;
				}
				$taken[] = $sentence;
				if ( 2 === count( $taken ) ) {
					break 2;
				}
			}
		}

		return implode( ' ', $taken );
	}

	/**
	 * Resolve the current title.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	private static function title( array $context ): string {
		$authored = self::authored_string( self::post_id( $context ), Identifiers::META_TITLE );
		if ( '' !== $authored ) {
			return $authored;
		}

		return self::plain_text( wp_get_document_title() );
	}

	/**
	 * Resolve a privacy-safe description.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	private static function description( array $context ): string {
		$kind    = isset( $context['kind'] ) && is_string( $context['kind'] ) ? $context['kind'] : 'unknown';
		$post_id = self::post_id( $context );

		if ( 'home' === $kind ) {
			if ( $post_id > 0 ) {
				$description = self::post_description( $post_id, ! empty( $context['password_protected'] ) );
				if ( '' !== $description ) {
					return $description;
				}
			}

			return self::site_description();
		}

		if ( 'singular' === $kind && $post_id > 0 ) {
			$is_password_protected = ! empty( $context['password_protected'] );
			return self::post_description( $post_id, $is_password_protected );
		}

		if ( 'archive' === $kind && 1 === (int) ( $context['paged'] ?? 1 ) ) {
			$description = self::plain_text( get_the_archive_description() );
			return '' !== $description ? $description : self::site_description();
		}

		return '';
	}

	/**
	 * Resolve an authored or derived post description.
	 *
	 * @param int  $post_id                Post ID.
	 * @param bool $is_password_protected Whether stored password protection is active.
	 */
	private static function post_description( int $post_id, bool $is_password_protected ): string {
		$authored = self::authored_string( $post_id, Identifiers::META_DESCRIPTION );
		if ( '' !== $authored ) {
			return $authored;
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof \WP_Post ) {
			return self::site_description();
		}

		if ( $is_password_protected ) {
			return self::factual_post_description( $post );
		}

		$excerpt = self::plain_text( $post->post_excerpt );
		if ( '' !== $excerpt ) {
			return $excerpt;
		}

		$content = self::content_sentences( $post->post_content );
		return '' !== $content ? $content : self::factual_post_description( $post );
	}

	/**
	 * Resolve a deliberately non-interpretive post fallback.
	 *
	 * @param \WP_Post $post Post object.
	 */
	private static function factual_post_description( \WP_Post $post ): string {
		$title    = self::plain_text( get_the_title( $post ) );
		$type     = get_post_type_object( $post->post_type );
		$label    = null !== $type ? self::plain_text( $type->labels->singular_name ) : '';
		$site     = self::plain_text( get_bloginfo( 'name' ) );
		$fallback = implode( ' — ', array_filter( array( $title, $label, $site ) ) );

		return '' !== $fallback ? $fallback . '.' : self::site_description();
	}

	/**
	 * Resolve the site tagline, then site name.
	 */
	private static function site_description(): string {
		$tagline = self::plain_text( get_bloginfo( 'description' ) );
		return '' !== $tagline ? $tagline : self::plain_text( get_bloginfo( 'name' ) );
	}

	/**
	 * Resolve an attachment ID without leaking protected featured images.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	private static function social_image_id( array $context ): int {
		$post_id  = self::post_id( $context );
		$explicit = $post_id > 0 ? Metadata::sanitize_social_image_id( get_post_meta( $post_id, Identifiers::META_SOCIAL_IMAGE_ID, true ) ) : 0;
		if ( $explicit > 0 ) {
			return $explicit;
		}

		if ( empty( $context['password_protected'] ) && $post_id > 0 ) {
			$featured = get_post_thumbnail_id( $post_id );
			if ( $featured > 0 && wp_attachment_is_image( $featured ) ) {
				return $featured;
			}
		}

		return Settings::default_social_image_id();
	}

	/**
	 * Resolve the post/page whose authored fields belong to this document.
	 *
	 * @param array<string, mixed> $context Request context.
	 */
	private static function post_id( array $context ): int {
		$kind = $context['kind'] ?? '';
		return in_array( $kind, array( 'home', 'singular' ), true ) ? absint( $context['object_id'] ?? 0 ) : 0;
	}

	/**
	 * Read one authored string.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key     Meta key.
	 */
	private static function authored_string( int $post_id, string $key ): string {
		return $post_id > 0 ? self::plain_text( get_post_meta( $post_id, $key, true ) ) : '';
	}

	/**
	 * Collect text-bearing leaf blocks without rendering dynamic callbacks.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return list<string>
	 */
	private static function block_text_chunks( array $blocks ): array {
		$allowed = array(
			null,
			'core/freeform',
			'core/heading',
			'core/list-item',
			'core/paragraph',
			'core/preformatted',
			'core/table',
			'core/verse',
		);
		$chunks  = array();

		foreach ( $blocks as $block ) {
			$inner_blocks = isset( $block['innerBlocks'] ) && is_array( $block['innerBlocks'] ) ? $block['innerBlocks'] : array();
			if ( ! empty( $inner_blocks ) ) {
				$chunks = array_merge( $chunks, self::block_text_chunks( $inner_blocks ) );
				continue;
			}

			$name = isset( $block['blockName'] ) && is_string( $block['blockName'] ) ? $block['blockName'] : null;
			if ( ! in_array( $name, $allowed, true ) ) {
				continue;
			}

			$html = isset( $block['innerHTML'] ) && is_string( $block['innerHTML'] ) ? $block['innerHTML'] : '';
			$text = self::plain_text( $html );
			if ( '' !== $text ) {
				$chunks[] = $text;
			}
		}

		return $chunks;
	}

	/**
	 * Normalize public prose for attribute and JSON output.
	 *
	 * @param mixed $value Candidate text.
	 */
	private static function plain_text( mixed $value ): string {
		if ( ! is_scalar( $value ) ) {
			return '';
		}

		$charset = get_bloginfo( 'charset' );
		$charset = '' !== $charset ? $charset : 'UTF-8';
		$text    = html_entity_decode( wp_strip_all_tags( (string) $value, true ), ENT_QUOTES | ENT_HTML5, $charset );
		$text    = preg_replace( '/\s+/u', ' ', $text );
		return is_string( $text ) ? trim( $text ) : '';
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
