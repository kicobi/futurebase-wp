# `src/` — theme-bound block source

Theme-bound blocks live under `src/blocks/<slug>/`. Each directory is a single
block; the scaffold command creates one end-to-end. Full guide:
[docs/block-authoring.md](../docs/block-authoring.md).

## Scaffolding

```bash
npm run block:new -- author-card
```

Generates:

```
src/blocks/author-card/
├── block.json     # apiVersion 3, "name":"<theme-slug>/author-card", category "theme"
├── index.js       # registerBlockType + Edit import
├── edit.js        # functional Edit component using useBlockProps
└── render.php     # dynamic server render using get_block_wrapper_attributes()
```

Slug rules (enforced by `bin/new-block.sh`): lowercase, dashes only,
starts with a letter. `author-card` ✓, `AuthorCard` ✗, `author_card` ✗.

## Build

```bash
npm run build           # compiles src/blocks/ → build/blocks/ as part of the full build
npm run build:blocks    # blocks only
npm run start:blocks    # watch mode for blocks
```

Blocks auto-register via `futurebase_register_blocks()` in
[`functions.php`](../functions.php), which scans `build/blocks/*/block.json` on
`init`. No per-block PHP wiring required.

## What belongs here — and what doesn't

**Theme-bound (here):** blocks tightly coupled to this theme's design tokens,
patterns, or template parts. They disappear when the theme is swapped.

**Reusable (not here — use a companion plugin):** blocks that should outlive
the theme, travel across projects, or be installed independently. See
[WordPress's own guidance](https://developer.wordpress.org/block-editor/getting-started/fundamentals/registration-of-a-block/)
on block registration homes.

Before scaffolding a block at all, check the decision table in
[docs/block-authoring.md](../docs/block-authoring.md) — most custom-block
requests are better served by a pattern, a block style variation, or block
bindings to ACF fields.
