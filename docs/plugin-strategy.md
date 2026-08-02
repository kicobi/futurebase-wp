# Plugin strategy

Decided 2026-08-02: **three in-house plugins, built ahead of client demand,
delivered by private Composer, never published to wordpress.org.**

Futurebase WP is a theme, and a theme is the wrong home for anything that
must survive a theme switch. This document records what the plugin layer is,
what belongs in it, how it reaches client sites, and why the catalogue is
deliberately small. It is the plugin counterpart to [seo.md](seo.md), which
decides one of the three in detail.

## Scope

These are in-house plugins. They are not listed on wordpress.org, not sold,
not publicly downloadable, and carry no public support obligation. They exist
to serve Futurebase WP projects and to demonstrate repeatable capability.

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

### Mechanism

A private Composer VCS repository declared in the project's
`composer.json` — the same pattern [acf-pro-setup.md](acf-pro-setup.md)
already uses for ACF Pro. Plugins resolve during a deploy or a maintenance
window, alongside the git push-to-deploy flow in
[deployment.md](deployment.md).

No Satis, no update server, no `plugin-update-checker`, no phone-home
endpoint. A self-hosted update channel is the standard supply-chain weak
point in premium WordPress plugins; not having one is both less work and a
smaller attack surface.

### No automatic updates

Plugin updates reach a client site because someone deployed them, never on
their own. That is a deliberate property, not a missing feature: updates are
an act of maintenance under an ongoing relationship.

### Plugins are the one layer that can hold a real dependency

`futurebase sync` exists because a promoted project shares no git history
with the starter, so fixes have to be copied rather than pulled — see
[project-lifecycle.md](project-lifecycle.md). The theme is renamed per client
and therefore can't carry an upstream link.

Plugins keep a stable identity across every project. They are the only part
of the stack where a genuine upstream dependency is possible, so the sync
workaround does not apply to them.

### Ownership

The client owns their copy. GPL guarantees this already — it is not a
concession being made, it is how the ecosystem works, stated plainly. A
client who leaves keeps the installed code and can hire anyone to maintain
it; what they lose is access to the repository and future updates.

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

## Sequencing

Part-time alongside client work. Futurebase SEO goes first because it is the
most sharply specified and closes a measured gap; Futurebase Blocks goes last
because each block is edit UI plus Interactivity API plus manual
accessibility testing.

| Phase | Work | Estimate |
| --- | --- | --- |
| 0 | Shared plugin scaffold, CI reuse, Composer delivery pattern | ~1 week |
| 1 | Futurebase SEO | 2–3 weeks |
| 2 | Futurebase Core, partly extracted from Phase 1 | ~2 weeks |
| 3 | Futurebase Blocks, initial 4–5 components | 4–6 weeks |

Roughly a quarter in elapsed time. Phase 0 is the leverage step — three
plugins inherit whatever it establishes, so it is worth doing properly before
Phase 1 rather than retrofitting.

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

The messages that hold today, without any plugin existing yet:

- The catalogue is short because each entry is maintained permanently on
  every site that runs it.
- Project-specific work is built for the project; the plugin layer holds only
  what is true everywhere.
- You own your copy and can take it to another developer.
- Nothing updates itself into your site.

## Operational consequences

Three, all downstream of the model rather than objections to it.

1. **Fleet version drift.** Without automatic updates, knowing which site
   runs which plugin version becomes a tracking problem. `futurebase sync`
   reports theme drift; there is no plugin equivalent. This becomes necessary
   around the third or fourth live site, not the tenth.

2. **Manual security patching.** A vulnerability in one of these has to be
   carried to every site by hand, which is real work and scales with the
   number of active clients. Under an ongoing relationship that is the
   relationship doing its job. Sites with no active relationship are out of
   scope — see [Ownership](#ownership).

3. **Opportunity cost.** Futurebase SEO currently sits at Tier 2 on the
   theme's own roadmap. Phase 1 is a reprioritisation, not an addition.

## Status

Nothing is built. Phase 0 has not started. This document records the decided
architecture so that the plugin layer is not improvised under deadline, and
so that the theme does not absorb work that belongs in a plugin in the
meantime — the same role [seo.md](seo.md) plays for SEO output specifically.
