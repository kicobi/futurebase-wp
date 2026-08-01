# Block authoring

How to decide whether a project needs a custom block, where to put it, and how to scaffold it.

## Pattern vs. block — decide before you scaffold

Most "custom block" requests are actually **patterns**. A pattern is a prearranged block structure saved as PHP or HTML; it inherits all the editing affordances of the blocks it's made of, ships instantly, and costs nothing at runtime.

Reach for a custom block only when the behavior cannot be expressed as core blocks + `theme.json` styling. Decision table:

| Need | Use |
| --- | --- |
| A hero / cards / CTA composition that editors fill in | **Pattern** (`patterns/_section-*.php`) |
| Consistent styling for `core/group`, `core/button`, etc. | `theme.json` `styles.blocks.*` + a **block style variation** (`register_block_style`) |
| A preset palette of one block (e.g. "primary button" vs "ghost button") | **Block style variation** |
| Dynamic server-rendered content (latest team members, an SSR query with custom args) | **Custom block** (dynamic, `render.php`) |
| Structured editorial content with a rigid schema (author card, pricing tier, testimonial) | **Custom block** *or* pattern + block bindings to ACF — see below |
| Frontend interactivity inside a block (tabs, accordions, filters) | **Custom block** using the Interactivity API |

**Default to pattern.** Only promote to a custom block when a pattern demonstrably cannot carry the requirement.

## Theme-bound vs. plugin block

Two homes for a custom block, and the choice matters more than the code:

- **Theme-bound** — lives in `src/blocks/<slug>/`, ships with this theme, disappears when the theme is swapped. Right for project-specific editorial primitives ("our pricing card", "our campaign hero") that only make sense inside *this* design system.
- **Plugin** — lives in a companion plugin repo, survives theme changes. Right for reusable blocks that should outlive the theme or travel across projects.

WordPress's [official guidance](https://developer.wordpress.org/block-editor/getting-started/fundamentals/registration-of-a-block/) recommends plugin-first. This starter agrees as the *default*. Use theme-bound when:

- The block's existence only makes sense inside this theme's design tokens.
- You'd never re-use it on another project.
- The block is tightly coupled to a pattern or template part that also lives in this theme.

Everything else belongs in a plugin.

## Scaffolding a theme-bound block

```bash
npm run block:new -- author-card
```

The script (`bin/new-block.sh`) generates `src/blocks/author-card/` with four files:

```
src/blocks/author-card/
├── block.json     # apiVersion 3, name "<theme-slug>/author-card", category "theme"
├── index.js       # registerBlockType + Edit import
├── edit.js        # functional Edit component using useBlockProps
└── render.php     # server-side render using get_block_wrapper_attributes()
```

Slug rules (enforced by the script): lowercase, dashes only, starts with a letter. `author-card` ✓, `AuthorCard` ✗, `author_card` ✗.

### After scaffolding

1. `npm run build` — compiles `src/blocks/` → `build/blocks/`.
2. `futurebase_register_blocks()` in [functions.php](../functions.php) auto-registers every `build/blocks/*/block.json` on `init`. No per-block PHP wiring required.
3. Edit the block in the inserter (category: Theme).

Iterating:

```bash
npm run start:blocks   # watch src/blocks/ and recompile on save
```

(The plain `npm run start` only watches `assets/main.{js,scss}` for the theme's shared bundle. Blocks have their own watcher because they use the stock `@wordpress/scripts` webpack config, not this repo's customised one.)

## Dynamic render — the default posture

The scaffold generates a **dynamic** block: `block.json` declares `"render": "file:./render.php"` and there is no `save.js`. Editors see the React-powered `edit.js`; the frontend gets whatever `render.php` prints.

Why dynamic by default:

- No `save()` means no block-markup version drift, no deprecations to maintain.
- The PHP render re-runs every request, so data stays fresh (queries, user state, anything time-sensitive).
- Output uses `get_block_wrapper_attributes()` so block supports (spacing, align, custom class names) apply automatically.

Only swap to a static block (with `save.js`) if the content is truly static HTML that never needs recomputation — and then accept the deprecation-maintenance burden that comes with it.

## Block style variations — the lighter lever

If a project just needs a "primary button" and a "ghost button", don't scaffold a new block. Register a style variation in [functions.php](../functions.php):

```php
register_block_style(
    'core/button',
    array(
        'name'  => 'ghost',
        'label' => __( 'Ghost', 'futurebase' ),
    )
);
```

Pair it with a `styles.blocks.core/button.variations.ghost` block in [theme.json](../theme.json) and editors can pick "Ghost" from the Styles panel. Zero JS, zero PHP render, zero deprecations. The shipped `section` variation on `core/group` (see `futurebase_register_block_styles` in [functions.php](../functions.php)) is the reference implementation.

## Block bindings — ACF fields in patterns

For "structured editorial content with a rigid schema" (author card, pricing tier, testimonial), a pattern with **block bindings** to ACF fields is often simpler than a custom block. Pattern markup binds a `core/heading` or `core/paragraph` to an ACF field via the `acf/field` binding source:

```html
<!-- wp:heading {
    "metadata": {
        "bindings": {
            "content": { "source": "acf/field", "args": { "key": "author_name" } }
        }
    }
} -->
<h2>Author Name</h2>
<!-- /wp:heading -->
```

Editors configure the field group in ACF's UI, drop the pattern into a post, and the heading pulls `author_name`. No custom React, no `render.php`. Full worked examples (author card, post meta, custom sources) in [docs/block-bindings.md](block-bindings.md); ACF setup in [docs/acf-pro-setup.md](acf-pro-setup.md).

Use bindings when the **shape** is fixed (heading + paragraph + image) but the **data** is editorial. Use a custom block when the rendering logic itself is non-trivial (loops, conditional markup, Interactivity API).

## Interactivity API — the frontend story

Frontend behavior in blocks uses the [Interactivity API](https://developer.wordpress.org/block-editor/reference-guides/interactivity-api/), not bespoke jQuery or ad-hoc listeners. The skill `wp-interactivity-api` in `.claude/skills/` covers the patterns. Key principle: declare interactive state and actions in `view.js` via `@wordpress/interactivity`, mark up the server render with `data-wp-*` attributes, and let the runtime handle hydration and event delegation.

The scaffold does **not** generate `view.js` by default — add it when the block needs interactivity, and register it in `block.json` with `"viewScriptModule": "file:./view.js"`.

## Verification

`bin/verify-theme.sh` enforces **build parity** — every `src/blocks/<slug>/block.json` must have a matching `build/blocks/<slug>/block.json`. If you scaffold a new block and forget to run `npm run build`, verify fails with a pointer to the missing directory. Run `npm run build` to regenerate `build/blocks/`, then re-run `npm run verify`.

## File layout summary

```
src/blocks/                   # source — committed
└── <slug>/
    ├── block.json
    ├── index.js
    ├── edit.js
    ├── render.php            # dynamic blocks
    ├── view.js               # interactivity API (optional, add manually)
    └── style.scss            # frontend + editor styles (optional, add manually)

build/blocks/                 # compiled — committed, matches upstream starter-fse convention
└── <slug>/
    ├── block.json
    ├── index.js              # bundled React
    ├── index.asset.php       # deps + version
    └── render.php            # copied through unchanged
```

Theme-bound blocks auto-register via `futurebase_register_blocks()` scanning `build/blocks/*/block.json`. No manual `register_block_type()` call needed per block.
