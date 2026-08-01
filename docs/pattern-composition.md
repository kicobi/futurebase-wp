# Pattern composition

The rule: **templates wire, patterns compose, section patterns hold content.**

A block-theme homepage is three layers deep. Flattening the layers — putting content into `templates/front-page.html`, or referencing six section patterns directly from the template — is what makes homepages hard to reuse and hard to rebrand.

## The three layers

```
templates/front-page.html         ← wiring (header part, main, one pattern, footer part)
  └─ patterns/home.php            ← composition (references the sections in order)
       ├─ patterns/_section-hero.php
       ├─ patterns/_section-cards.php
       ├─ patterns/_section-writing.php
       └─ patterns/_section-cta.php
```

### Why three layers

- **Template (`front-page.html`)** — structural contract: header, main landmark, footer. Never changes as content changes.
- **Page pattern (`home.php`)** — the homepage's *composition*: which sections appear, in what order. Swapping sections, reordering, or forking a homepage variant happens here.
- **Section patterns (`_section-*.php`)** — self-contained editorial units. Each one owns its own copy, imagery, and internal block structure. A section pattern should drop cleanly into a different page (about, landing, campaign) without editing.

### Why the `_` prefix

Section patterns start with an underscore so they sort together in the file listing, and so they're visually distinct from page-level patterns (`home.php`, `cta.php`) and utility patterns (`page-not-found.php`). The underscore has no functional meaning in the pattern slug — the registered slug is still `futurebase/section-hero`.

## Worked example

### `templates/front-page.html`

```html
<!-- wp:template-part {"slug":"header","tagName":"header","className":"site-header"} /-->

<!-- wp:group {"tagName":"main"} -->
<main class="wp-block-group">
    <!-- wp:pattern {"slug":"futurebase/home"} /-->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer","tagName":"footer","className":"site-footer"} /-->
```

That's the whole template. It never grows.

### `patterns/home.php`

```php
<?php
/**
 * Title: Home
 * Slug: futurebase/home
 * Inserter: no
 * Description: Composite homepage — references the section patterns in order.
 *
 * @package futurebase
 */
?>
<!-- wp:pattern {"slug":"futurebase/section-hero"} /-->
<!-- wp:pattern {"slug":"futurebase/section-cards"} /-->
<!-- wp:pattern {"slug":"futurebase/section-writing"} /-->
<!-- wp:pattern {"slug":"futurebase/section-cta"} /-->
```

`Inserter: no` hides it from the block inserter — it's not meant to be dropped into a post; it's the homepage's wiring.

### `patterns/_section-hero.php` (representative section)

```php
<?php
/**
 * Title: Section — Hero
 * Slug: futurebase/section-hero
 * Categories: featured, banner
 * Description: Homepage hero section.
 *
 * @package futurebase
 */
?>
<!-- wp:cover {"isUserOverlayColor":true,"customOverlayColor":"var:preset|color|primary","align":"full"} -->
<div class="wp-block-cover alignfull">
    <!-- … heading, paragraph, buttons, all using tokens … -->
</div>
<!-- /wp:cover -->
```

## How to extend

- **Adding a new homepage section:** create `patterns/_section-<name>.php`, then add one line to `patterns/home.php`. Do not touch `front-page.html`.
- **Reordering sections:** edit `patterns/home.php`. Only that file.
- **Forking a homepage variant (e.g. a campaign page):** copy `home.php` to `campaign.php`, reuse the same `_section-*` patterns. Zero duplication.
- **Reusing a section on another page:** reference its slug from another page-level pattern. Do not copy the markup.

## Anti-patterns

- Content in `front-page.html`. The template should never change unless you're adding a landmark.
- Referencing `_section-*` patterns directly from a template. The intermediate page pattern is what makes forking cheap.
- A section pattern that hardcodes assumptions about what comes before or after it (e.g. "this only works right after the hero"). Sections must be position-independent.
- Page patterns with `Inserter: yes`. Page patterns are wiring, not insertable content.
