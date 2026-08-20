# Conventions

Three small grammars that everything else in this starter assumes. If you're writing code against these docs or handing the prompt to an agent, read this first.

## 1. Slug substitution

The starter ships with the slug `futurebase` hard-coded into every pattern header, every `wp:pattern` reference, every text domain, every PHP function prefix (as `futurebase_`), and every global constant (as `FUTUREBASE_`). <!-- futurebase-rename: keep-line -->

When a new project adopts the starter, all of those become the project's slug in one pass — via [bin/rename-theme.sh](../bin/rename-theme.sh):

```bash
npm run rename -- acme-client
```

**Rule:** never write a raw theme slug literal into docs, prompts, or discussion without making clear it's a *placeholder for substitution*. Two acceptable forms:

- `futurebase/home` — referring to the starter's actual shipped slug (documentation, README, agent instructions where we want the agent to read the actual files). <!-- futurebase-rename: keep-line -->
- `<slug>/home` — referring to "the slug for this project", where `<slug>` is a placeholder the reader should mentally substitute.

If you're writing a doc that will be read after rename, prefer `<slug>` so the doc still makes sense.

When a Markdown line must name the starter, product, or `futurebase` CLI after a client rename, append the exact marker `<!-- futurebase-rename: keep-line -->`. The rename script leaves that physical line unchanged; keep client-specific examples on separate, unmarked lines. <!-- futurebase-rename: keep-line -->

## 2. Placeholders

In prompt templates, spec docs, and issue templates, `[SQUARE-BRACKETED UPPERCASE]` denotes a placeholder the reader must replace before using the text.

```
Build the homepage for [PROJECT NAME].
Company: [COMPANY]
```

**Rules:**

- Placeholders are `UPPERCASE` with dashes, inside square brackets. Lowercase or braces mean something else (variable interpolation, markdown syntax).
- Placeholders must never survive into production. Grep for `\[[A-Z][A-Z-]+\]` before shipping any copy or config.
- A placeholder can carry a hint inside the brackets: `[CTA URL — absolute URL]`. The em-dash plus hint is part of the placeholder.
- An agent receiving a prompt that still contains placeholders must refuse and ask for the values, not guess.

## 3. `TODO(kind):` comments

Every `TODO` comment carries a *kind* so `grep` can group them. Five kinds cover everything we've needed so far:

| Kind | Meaning | Example |
| --- | --- | --- |
| `TODO(copy)` | Placeholder text that needs final editorial copy | `<!-- TODO(copy): replace with final hero headline --> ` |
| `TODO(design)` | A design decision still open — color, spacing, imagery | `// TODO(design): confirm secondary CTA lives here, not in footer` |
| `TODO(content)` | Structural content (sections, cards) pending sign-off | `<!-- TODO(content): 3rd card pending product-team input -->` |
| `TODO(a11y)` | Accessibility work still needed beyond what the verify script catches | `// TODO(a11y): reduced-motion variant for hero video` |
| `TODO(perf)` | Performance follow-up (image sizes, font loading) | `// TODO(perf): preload heroic image once art-direction is settled` |

**Rules:**

- Every `TODO` in the codebase must have a kind. `TODO` without parentheses is a verify-script failure (enforce via grep — one line in `bin/verify-theme.sh`).
- The kind is always lowercase, followed by `:` and one space.
- Don't assign people inside the TODO — that goes stale. Use git blame if you need to ask.
- `TODO(kind):` is the *only* form. Not `FIXME`, not `XXX`, not `HACK`. One grammar.

### Why

The goal is a single grep. Before a release:

```bash
grep -rn 'TODO(' patterns templates parts assets
```

…gives you a categorized inventory of everything unfinished, grouped by `kind`. If the list has anything under `TODO(a11y)` or `TODO(copy)`, you're not ready to ship.
