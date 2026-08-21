<?php
/**
 * Minimal factual schema graph.
 *
 * @package futurebase-seo
 */

declare(strict_types=1);

namespace Futurebase\SEO;

/**
 * Builds WebSite, entity, and Article nodes without inventing properties.
 */
final class Schema {
	/**
	 * Resolve the filtered schema graph.
	 *
	 * @param array $context  Request context.
	 * @param array $document Resolved document.
	 * @return array
	 * @phpstan-param array<string, mixed> $context
	 * @phpstan-param array{title: string, description: string, canonical: string|null, social_image_id: int} $document
	 * @phpstan-return list<array<string, mixed>>
	 */
	public static function graph( array $context, array $document ): array {
		$graph  = array();
		$entity = self::entity_node();

		if ( 'home' === ( $context['kind'] ?? '' ) && 1 === (int) ( $context['paged'] ?? 1 ) ) {
			$website = array(
				'@type'      => 'WebSite',
				'@id'        => home_url( '/#website' ),
				'url'        => home_url( '/' ),
				'name'       => get_bloginfo( 'name' ),
				'inLanguage' => get_bloginfo( 'language' ),
			);
			if ( '' !== $document['description'] ) {
				$website['description'] = $document['description'];
			}
			if ( null !== $entity ) {
				$website['publisher'] = array( '@id' => home_url( '/#identity' ) );
			}
			$graph[] = $website;

			if ( null !== $entity ) {
				$graph[] = $entity;
			}
		}

		if ( 'singular' === ( $context['kind'] ?? '' ) && 'post' === ( $context['post_type'] ?? '' ) && empty( $context['password_protected'] ) ) {
			if ( null !== $entity ) {
				$graph[] = $entity;
			}
			$article = self::article_node( $context, $document, $entity );
			if ( null !== $article ) {
				$graph[] = $article;
			}
		}

		return Contracts::schema_graph( $graph, $context, $document );
	}

	/**
	 * Build the configured entity node when the factual minimum is complete.
	 *
	 * @return array<string, mixed>|null
	 */
	private static function entity_node(): ?array {
		$entity = Settings::entity();
		if ( null === $entity ) {
			return null;
		}

		$node = array(
			'@type' => 'person' === $entity['type'] ? 'Person' : 'Organization',
			'@id'   => home_url( '/#identity' ),
			'name'  => $entity['name'],
			'url'   => $entity['url'],
		);

		if ( ! empty( $entity['same_as'] ) ) {
			$node['sameAs'] = $entity['same_as'];
		}

		$logo_id = absint( $entity['logo_id'] ?? 0 );
		if ( 'Organization' === $node['@type'] && $logo_id > 0 ) {
			$logo = wp_get_attachment_image_src( $logo_id, 'full' );
			if ( is_array( $logo ) ) {
				$node['logo'] = array(
					'@type'  => 'ImageObject',
					'url'    => $logo[0],
					'width'  => $logo[1],
					'height' => $logo[2],
				);
			}
		}

		return $node;
	}

	/**
	 * Build an Article node for an ordinary public post.
	 *
	 * @param array      $context  Request context.
	 * @param array      $document Resolved document.
	 * @param array|null $entity   Publisher entity.
	 * @return array|null
	 * @phpstan-param array<string, mixed> $context
	 * @phpstan-param array{title: string, description: string, canonical: string|null, social_image_id: int} $document
	 * @phpstan-param array<string, mixed>|null $entity
	 * @phpstan-return array<string, mixed>|null
	 */
	private static function article_node( array $context, array $document, ?array $entity ): ?array {
		$post = get_post( absint( $context['object_id'] ?? 0 ) );
		if ( ! $post instanceof \WP_Post ) {
			return null;
		}

		$canonical = $document['canonical'];
		if ( null === $canonical ) {
			$canonical = get_permalink( $post );
		}
		if ( '' === $canonical ) {
			return null;
		}

		$article = array(
			'@type'            => 'Article',
			'@id'              => $canonical . '#article',
			'mainEntityOfPage' => array( '@id' => $canonical ),
			'headline'         => get_the_title( $post ),
			'datePublished'    => get_post_time( DATE_W3C, true, $post ),
			'dateModified'     => get_post_modified_time( DATE_W3C, true, $post ),
			'inLanguage'       => get_bloginfo( 'language' ),
		);

		if ( '' !== $document['description'] ) {
			$article['description'] = $document['description'];
		}

		$author_name = get_the_author_meta( 'display_name', (int) $post->post_author );
		if ( '' !== trim( $author_name ) ) {
			$article['author'] = array(
				'@type' => 'Person',
				'name'  => $author_name,
				'url'   => get_author_posts_url( (int) $post->post_author ),
			);
		}

		if ( null !== $entity ) {
			$article['publisher'] = array( '@id' => home_url( '/#identity' ) );
		}

		$image = Output::image_data( $document['social_image_id'] );
		if ( null !== $image ) {
			$article['image'] = array(
				'@type'  => 'ImageObject',
				'url'    => $image['url'],
				'width'  => $image['width'],
				'height' => $image['height'],
			);
		}

		return $article;
	}

	/**
	 * Prevent instantiation.
	 */
	private function __construct() {
	}
}
