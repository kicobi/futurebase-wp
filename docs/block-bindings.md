# Block bindings

Bind a block's attribute (content, URL, alt text) to a dynamic source — a post meta value, an ACF field, a site option — without writing a custom block. The pattern's **shape** is fixed; the **data** is dynamic.

Shipped in WordPress 6.5, expanded in 6.7 and 6.9. This starter's WP 6.9+ floor means every binding API described here works natively.

## When to reach for bindings

Decision triangle, from cheapest to most expensive:

1. **Plain pattern** — editor fills in everything by hand. Best when content varies wildly across uses.
2. **Pattern with bindings** — shape fixed, specific attributes bound to dynamic sources. Best when every instance has the same *shape* but different data (author cards, pricing tiers, post meta displays).
3. **Custom block** — shape and rendering logic are non-trivial (loops, conditionals, Interactivity API). See [docs/block-authoring.md](block-authoring.md).

Bindings sit in the middle. They're the right choice when you catch yourself thinking "I need a custom block just to pull in this one field."

## Shipped binding sources

Three sources you can use in this starter without additional code:

| Source | Shipped by | Use when |
| --- | --- | --- |
| `core/post-meta` | WordPress core | Reading post meta keys registered with `show_in_rest: true` |
| `acf/field` | ACF Pro 6.3+ | Reading ACF fields (only available when ACF Pro is active — see [docs/acf-pro-setup.md](acf-pro-setup.md)) |
| `core/pattern-overrides` | WordPress core | Turning a synced pattern's inner blocks into editable slots |

Custom sources are one `register_block_bindings_source()` call away — see below.

## Worked example — author card via ACF

Assumes ACF Pro is installed (see [docs/acf-pro-setup.md](acf-pro-setup.md)) and a field group with fields `author_name`, `author_bio`, and `author_avatar` (Image, Return Format: Image ID) is attached to your post type.

`patterns/_author-card.php`:

```php
<?php
/**
 * Title: Author card
 * Slug: futurebase/_author-card
 * Inserter: no
 * Description: Binds heading / paragraph / image to ACF fields on the current post.
 *
 * @package futurebase
 */
?>
<!-- wp:group {"className":"is-style-section","layout":{"type":"constrained"}} -->
<div class="wp-block-group is-style-section">

	<!-- wp:image {
		"metadata": {
			"bindings": {
				"id":  { "source": "acf/field", "args": { "key": "author_avatar" } },
				"alt": { "source": "acf/field", "args": { "key": "author_name" } }
			}
		}
	} -->
	<figure class="wp-block-image"><img alt=""/></figure>
	<!-- /wp:image -->

	<!-- wp:heading {
		"level": 3,
		"metadata": {
			"bindings": {
				"content": { "source": "acf/field", "args": { "key": "author_name" } }
			}
		}
	} -->
	<h3>Author Name</h3>
	<!-- /wp:heading -->

	<!-- wp:paragraph {
		"metadata": {
			"bindings": {
				"content": { "source": "acf/field", "args": { "key": "author_bio" } }
			}
		}
	} -->
	<p>Author bio.</p>
	<!-- /wp:paragraph -->

</div>
<!-- /wp:group -->
```

Editors see the *default* content ("Author Name", "Author bio.") in the editor, and the site renders real data from ACF on the frontend. No custom block, no save-format drift.

## Worked example — reading post meta

Post meta works the same way, but the meta key must be registered for REST to participate in bindings:

```php
register_post_meta(
	'post',
	'reading_time',
	array(
		'type'         => 'string',
		'single'       => true,
		'show_in_rest' => true,
		'auth_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
	)
);
```

Then in a pattern:

```html
<!-- wp:paragraph {
	"metadata": {
		"bindings": {
			"content": { "source": "core/post-meta", "args": { "key": "reading_time" } }
		}
	}
} -->
<p>5 min read</p>
<!-- /wp:paragraph -->
```

## Creating a custom binding source

When a project needs data that isn't post meta or an ACF field (a transient, a remote API result, a computed value), register a custom source. Minimal worked example — a `futurebase/environment` binding that reveals the WordPress environment type:

```php
add_action( 'init', function () {
	register_block_bindings_source(
		'futurebase/environment',
		array(
			'label'              => __( 'Environment type', 'futurebase' ),
			'get_value_callback' => function () {
				return wp_get_environment_type();
			},
		)
	);
} );
```

Use in a pattern:

```html
<!-- wp:paragraph {
	"className": "env-banner",
	"metadata": {
		"bindings": {
			"content": { "source": "futurebase/environment" }
		}
	}
} -->
<p>production</p>
<!-- /wp:paragraph -->
```

Hide the banner on production via CSS (`.env-banner:has-text("production") { display: none; }`) or branch inside the callback.

Every custom source must be registered on `init` (or later), must return a string, and should check capabilities if the value is sensitive. A source that reads arbitrary user input must sanitise before returning.

## What bindings can't do

- **Replace part of an attribute.** Bindings replace the *whole* attribute value. Mixed strings like `"© 2026 Site Name. All rights reserved."` can't be "partly bound" — either bind the whole paragraph content to a source that returns the full string ([patterns/_copyright.php](../patterns/_copyright.php) is the PHP-pattern approach for this), or split into multiple blocks.
- **Bind inner blocks.** Only the named attributes on the block schema (`content`, `url`, `id`, `alt`, etc.) are bindable. The block's inner block list is structural, not attribute-bound.
- **Compute per-render on static blocks.** Bindings run through the server render path. A block using `save()` to write static HTML bypasses bindings on the frontend.

If your use case hits one of these walls, promote to a **dynamic custom block** — see [docs/block-authoring.md](block-authoring.md).

## Editing bindings in the UI

As of WordPress 6.7, the editor shows a small badge on bound attributes and a panel in the block inspector listing the binding source. Editors can't change bindings through the UI today — the binding metadata is authored in the pattern file — but they can see at a glance which attributes are dynamic.

## Related

- [docs/block-authoring.md](block-authoring.md) — when to reach for a custom block instead
- [docs/pattern-composition.md](pattern-composition.md) — where patterns sit in the three-layer model
- [docs/acf-pro-setup.md](acf-pro-setup.md) — getting ACF Pro installed so `acf/field` is available
