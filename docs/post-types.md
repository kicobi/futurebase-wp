# Custom post types

How to register a custom post type in a project built from this starter — when to reach for code vs. the ACF Pro UI, where the code lives, and what to edit after scaffolding.

## Before you scaffold: the ACF UI path

If the project uses [ACF Pro](acf-pro-setup.md) (6.1+), you can register a post type through `ACF → Post Types` with zero code. That's the right default when:

- The CPT only needs WordPress defaults (no unusual capabilities, no custom rewrite rules, no bulk actions).
- Non-developers might need to add or tweak post types later without a deploy.
- The CPT registration is genuinely site-content, not theme-content.

Reach for the code scaffold below when:

- The post type needs capabilities or rewrite rules the UI doesn't expose.
- The project values everything-in-git for audit or review.
- Multiple environments need the same post types guaranteed identical (code is the deploy unit; database isn't always).

**You can mix.** ACF UI for editorial post types (Team Member, Case Study) and code for structural ones (Redirect, API Log) is a sensible split.

## Scaffolding

```bash
npm run cpt:new -- case-study
npm run cpt:new -- person --plural people   # irregular plurals
```

Generates `inc/post-types/case-study.php` with a full `register_post_type()` call: i18n-ready labels, `show_in_rest: true`, default supports (title, editor, thumbnail, excerpt, revisions, author), dashicon menu icon, and an `init` hook.

The file auto-loads via `futurebase_load_post_types()` in [functions.php](../functions.php) — no manual `require` needed.

Slug rules: lowercase, dashes only, starts with a letter. The scaffold converts dashes to underscores for the post type key (`case-study` → `case_study`) so the key matches WordPress conventions.

### After scaffolding

1. **Edit labels.** Automated plural derivation handles `-y → -ies` and trivial cases; irregulars ("people", "children", "media") need manual correction. The generated file carries a `TODO(copy)` reminder.
2. **Edit supports.** The default set is broad. Drop `editor` for link-only post types, add `page-attributes` for hierarchical post types, add `comments` when discussions are part of the model.
3. **Edit `menu_icon`.** The default `dashicons-admin-post` is placeholder. See the [Dashicons reference](https://developer.wordpress.org/resource/dashicons/) for the full list.
4. **Flush rewrites.** New post types add new URL rules. Flush once after the first deploy:
   ```bash
   npm run env:cli -- rewrite flush        # locally
   wp rewrite flush                        # on the server
   ```
   Or visit `Settings → Permalinks` and save (no changes needed) — saving flushes.

## Theme-coupled vs. plugin placement

This template scaffolds CPTs **inside the theme** (`inc/post-types/<slug>.php`). WordPress's community guidance is that CPTs belong in plugins so they survive theme switches; this template makes a pragmatic exception for starter projects where the theme IS the site.

Move to a must-use plugin when:

- The site is long-lived and has any plausible future theme migration.
- Multiple themes (main site, campaign microsite) need to share the same post types.
- The CPTs contain permanent editorial content you'd never want orphaned.

To migrate: move `inc/post-types/<slug>.php` to `wp-content/mu-plugins/<slug>.php` on the server, delete it from the theme, and the `init` hook inside the file keeps working unchanged. No edits required — the registration code is portable.

Stay theme-coupled when:

- The project is a standard client site with one theme for its lifetime.
- The CPT only makes sense in the context of this theme's templates or patterns.
- Version-control everything together outweighs theme-swap survivability.

## Taxonomies

Custom post types usually want custom taxonomies (categories / tags specific to the CPT). There's no scaffold for taxonomies — the scaffold would be trivial and the registration is short. Put the taxonomy registration in the same `inc/post-types/<slug>.php` file as the post type it belongs to:

```php
function futurebase_register_case_study_taxonomies() {
	register_taxonomy(
		'industry',
		'case_study',
		array(
			'labels'       => array(
				'name'          => __( 'Industries', 'futurebase' ),
				'singular_name' => __( 'Industry', 'futurebase' ),
			),
			'public'       => true,
			'show_in_rest' => true,
			'hierarchical' => true,
		)
	);
}
add_action( 'init', 'futurebase_register_case_study_taxonomies' );
```

`show_in_rest: true` is required if you want the taxonomy to appear in the block editor's sidebar.

## Post meta and block bindings

The scaffold doesn't touch post meta — `register_post_meta()` is a separate concern. When you want a meta key usable in [block bindings](block-bindings.md), register it with `show_in_rest: true` and a capability-checking `auth_callback`:

```php
register_post_meta(
	'case_study',
	'client_url',
	array(
		'type'          => 'string',
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
	)
);
```

For richer editorial fields (image, repeater, relationship), ACF Pro is nearly always the better tool than hand-rolled meta. See [docs/acf-pro-setup.md](acf-pro-setup.md) and [docs/block-bindings.md](block-bindings.md).

## Common gotchas

- **404 on the archive page.** You didn't flush rewrites after adding the post type. `wp rewrite flush` or save permalinks.
- **`has_archive` vs. `rewrite` slug collision.** If you set `has_archive` to a string, it must differ from the `rewrite.slug`. The default (`has_archive: true`) reuses the post type key; most projects want `has_archive: 'case-studies'` + `rewrite.slug: 'case-study'` for clean URLs — edit both manually.
- **Post type key > 20 characters.** WordPress silently truncates. Keep keys short (`case_study`, not `detailed_case_study_article`).
- **Block bindings don't see a field.** The meta key must be registered with `show_in_rest: true`. ACF fields always expose a REST shape; native meta needs the flag.
- **CPT disappeared after a theme switch.** The registration was in the theme. See the plugin-migration note above.

## Related

- [docs/acf-pro-setup.md](acf-pro-setup.md) — the ACF Pro install recipe (enables the UI CPT registration)
- [docs/block-bindings.md](block-bindings.md) — exposing meta/ACF to patterns
- [docs/block-authoring.md](block-authoring.md) — when a CPT wants a custom block for editor tooling
