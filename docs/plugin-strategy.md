# Plugin strategy

Decided 2026-08-02: **three in-house plugins, built ahead of client demand,
renamed per project exactly like the theme, never published to
wordpress.org.**

Futurebase WP is a theme, and a theme is the wrong home for anything that <!-- futurebase-rename: keep-line -->
must survive a theme switch. This document records what the plugin layer is,
what belongs in it, how it reaches client sites, and why the catalogue is
deliberately small. It is the plugin counterpart to [seo.md](seo.md), which
decides one of the three in detail.

## Scope

These are in-house plugins. They are not listed on wordpress.org, not sold,
not publicly downloadable, and carry no public support obligation. They exist
to serve Futurebase WP projects and to demonstrate repeatable capability. <!-- futurebase-rename: keep-line -->

The distribution choice is not a limitation to be lifted later. Publishing
would add a review queue, a support forum, and a public quality signal that
can't be retracted — all cost, no return, given the plugins' purpose.

## Why three, and why not fifty

Agency plugin catalogues typically run to dozens of entries because they
accrete from repeated work in a vertical: one connector per client system,
kept because it was already paid for. That is a byproduct of deal flow, not a
strategy, and it is not the shape this practice wants.

The rule here is narrower and stated as a consequence rather than a
preference: **every plugin is maintained permanently on every site that runs
it, so the list stays short.** Anything specific to one project is built for
that project. The plugin layer holds only what is true on every project.

This is a positioning asset, not a gap to grow out of. See
[Promoting before build](#promoting-before-build).

### The test for a fourth

The foundation layer is knowable in advance — it follows from the theme's
architecture, not from any client's request. That is why all three are built
before demand exists, the same way the theme itself was.

Beyond the foundation, that reasoning stops applying. A consent banner, a CRM
connector, or a form add-on is a guess about demand, not a consequence of
architecture. So:

> A fourth plugin needs an architectural justification, not a client request
> and not a hunch. If it can't be derived from how the stack is built, it
> belongs in the project that needs it.

## The three

### Futurebase SEO

Fully specified in [seo.md](seo.md). Provides meta description, OpenGraph and
Twitter tags, and `schema.org` essentials as a fallback baseline, and yields
entirely when a blessed premium SEO plugin (Yoast, RankMath) is active.

Closes the measured SEO gap in [scorecard.md](scorecard.md) without coupling
the theme to a third-party product.

### Futurebase Core

The theme-swap survivors:

- custom post type and taxonomy registration (the destination
  [post-types.md](post-types.md) already points scaffolded CPTs toward)
- block bindings helpers
- editor curation — allowed blocks, template locking
- admin and login treatment

Built second, and partly extracted from what Futurebase SEO turns out to
need. Designing it up front would produce the vaguest of the three.

### Futurebase Blocks

Bounded by the escalation ladder in [block-authoring.md](block-authoring.md).
If a pattern, a block style variation, or an ACF binding can carry the
requirement, it is not a block. What remains is interactivity-bearing and
server-rendered components — which maps closely onto the accessible
component set the house style already commits to: collapsible sections,
tabbed interfaces, content slider, live-region notifications, sortable data
table, modal dialog.

Accessible implementations of those are worth owning regardless of which
client asks first. The name is already reserved in the family information
architecture — see [futurebase-company-site.md](futurebase-company-site.md).

Theme-bound blocks stay in `src/blocks/`. The rule that decides which home a
block gets does not change; this plugin is simply the other side of it.

## Delivery

### Renamed at promotion, exactly like the theme

Each project's plugins are renamed to that project's slug in the same pass
that renames the theme — see [conventions.md](conventions.md) for the slug
substitution grammar. A client's site runs `<slug>-core`, not
`futurebase-core`, and carries the client's identity throughout.

The sources live under `plugins/` in this repository so the theme and plugins
share CI, promotion, and sync tooling. They remain separate WordPress products:
each plugin has its own build and ZIP, `wp-env` mounts it independently, and the
theme package excludes the entire `plugins/` tree.

This is one model for everything a client receives, rather than two. It also
means nothing of ours sits on a site under our name, which removes the
offboarding and disclosure questions entirely instead of leaving them to be
managed.

Promotion is the only safe moment for this. A rename changes the plugin
directory, so WordPress deactivates the old plugin and sees a new one;
anything keyed to the previous slug is orphaned. At promotion no content
exists yet, so there is nothing to orphan. The same rename attempted at
separation, on a site with years of content, could break registered post
types and stored option keys — which is why it happens at the start and not
at the end.

Provenance follows the theme's existing rule in
[futurebase-company-site.md](futurebase-company-site.md): client identity
throughout, one "Built on Futurebase WP" note. <!-- futurebase-rename: keep-line -->

### What renaming costs

A renamed plugin is a fork. It cannot resolve from a shared Composer
repository, so there is no upstream dependency and no `composer update` path.
Plugins classify the same way slug-bearing paths already do in
`tools/project-system/lib/sync.mjs` — drift is reported, never written —
and a fix is a hand port into each project, as `bin/` and `docs/` are
today.

That cost is real and grows linearly with the number of live sites. It is
accepted knowingly: updates were already going to be manual and deliberate,
the fleet is small, and the same porting discipline already governs a much
larger artifact in the theme.

### No automatic updates

Plugin updates reach a client site because someone deployed them, never on
their own. That is a deliberate property, not a missing feature: updates are
an act of maintenance under an ongoing relationship. Delivery is the
project's own git push-to-deploy flow in [deployment.md](deployment.md) —
there is no update server, no `plugin-update-checker`, and no phone-home
endpoint to secure.

### Renameable by design

The rename only works if the plugins are built for it, the same way the theme
was. This is a Phase 0 requirement, cheap before any code exists and
expensive afterwards:

- client-facing and structural identity is renamed, but durable stored state
  and developer APIs use a neutral, permanent owner prefix. Futurebase SEO uses
  `compseo` (“companion SEO”) for option/meta keys and hooks; promotion never
  rewrites it. When an existing identifier cannot follow this rule, a migration
  must ship with the rename
- `bin/rename-theme.sh` grows the plugin paths as scan roots, and
  `bin/test-rename.sh` asserts no slug literal survives, as it already does
  for the theme
- Futurebase Core is the sharp case: post type and taxonomy names are durable
  stored identifiers too, so they must use a neutral permanent prefix. A
  careless client slug in `register_post_type()` is content loss on rename,
  not a cosmetic leftover

### Ownership

The client owns their copy, under their own name. GPL guarantees the
ownership already — it is not a concession being made, it is how the
ecosystem works, stated plainly. A client who leaves keeps the installed code
and can hire anyone to maintain it; what they lose is future updates.

This resolves what would otherwise be a contradiction with the no-lock-in
claim in [futurebase-wp.md](futurebase-wp.md). The plugin layer is not
proprietary in any sense that traps a site.

Ownership cuts both ways, and the second half is the support boundary:

> **Maintenance follows the relationship.** A client with no active
> relationship owns their copy and is responsible for it. There is no
> obligation to patch, notify, or support code running on a site we are no
> longer engaged to look after.

This is not a hedge added on top of the licence — GPL disclaims warranty and
liability outright, so it is what the code already ships under. Stating it
here makes the boundary explicit rather than implied, which is the point:
"you own this and can take it anywhere" and "you own this, including when it
needs attention" are the same sentence.

Renaming at promotion is what makes that boundary clean rather than merely
stated. A departed client's site runs code under their own name, so there is
no Futurebase-branded plugin in the wild to disclose against, and no
notification practice to maintain.

## Sequencing

Part-time alongside client work. Futurebase SEO goes first because it is the
most sharply specified and closes a measured gap; Futurebase Blocks goes last
because each block is edit UI plus Interactivity API plus manual
accessibility testing.

| Phase | Work | Estimate |
| --- | --- | --- |
| 0 | Shared scaffold, CI reuse, rename + sync wiring | ~1½ weeks |
| 1 | Futurebase SEO | 2–3 weeks |
| 2 | Futurebase Core, partly extracted from Phase 1 | ~2 weeks |
| 3 | Futurebase Blocks, initial 4–5 components | 4–6 weeks |

Roughly a quarter in elapsed time. Phase 0 is the leverage step — three
plugins inherit whatever it establishes, so it is worth doing properly before
Phase 1 rather than retrofitting. It carries the renameability contract, and
retrofitting that after Futurebase Core registers post types is the expensive
version of this work.

## Promoting before build

The plugin layer will be promoted on the company site before it is built.
That is compatible with the editorial boundaries in
[futurebase-company-site.md](futurebase-company-site.md), but only under the
conditions that document already sets.

**Permitted:** describing the plugins, their scope, and the reasoning behind
a deliberately small catalogue. Marking each clearly as in development.

**Not permitted, until true:**

- presenting an unbuilt plugin as available, installable, or shipping
- implying it runs on client sites
- any capability or performance claim about it

Capability claims follow the same evidence standard as
[scorecard.md](scorecard.md): a plugin earns a claim once it runs on the
public demo site, not before.

The messages that hold while the plugin remains an inert foundation:

- The catalogue is short because each entry is maintained permanently on
  every site that runs it.
- Project-specific work is built for the project; the plugin layer holds only
  what is true everywhere.
- You own your copy and can take it to another developer.
- Nothing updates itself into your site.

## Operational consequences

Three, all downstream of the model rather than objections to it.

1. **Porting, not updating.** Because each project's plugins are renamed,
   every fix is a hand port into a divergent copy rather than an update
   applied to an identical one. `futurebase sync` maps the starter plugin path
   onto the promoted path, removes bounded technical identity noise, and
   reports genuine plugin drift for hand-porting without ever overwriting the
   client copy.

2. **Manual security patching.** A vulnerability in one of these has to be
   carried to every site by hand, and the porting cost above applies to
   each one. Real work, scaling linearly with active clients. Under an
   ongoing relationship that is the relationship doing its job. Sites with
   no active relationship are out of scope — see [Ownership](#ownership) —
   and after a rename they are not running anything under our name in any
   case.

3. **Opportunity cost.** Futurebase SEO currently sits at Tier 2 on the
   theme's own roadmap. Phase 1 is a reprioritisation, not an addition.

## Status

The shared Phase 0 foundation now lives under `plugins/`: separate packaging,
promotion identity, review-only sync mapping, and CI/install gates. The SEO
plugin itself is intentionally inert until its focused output and management
phases land. This document keeps the theme from absorbing work that belongs in
a plugin in the meantime — the same role [seo.md](seo.md) plays for SEO output
specifically.
