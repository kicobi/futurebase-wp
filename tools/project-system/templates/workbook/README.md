# Content Workbook — reusable masters

The canonical source of the Content Workbook: a structured content model with a
client-facing skin. The Markdown/CSV files here are authoritative; each project
copies and trims them, then converts them to whatever collaboration surface the
client uses (see [client-surface/setup-guide.md](client-surface/setup-guide.md)).
Process context lives in `docs/process/content-workbook.md`.

## Layout

```text
workbook/
├── guide/            prose surfaces: introduction, site overview, brand,
│                     page module (duplicable), legal, sign-off, version manifest
├── mapping/          project-mapping.md — CMS destinations (internal, per project)
├── sheets/           tabular surfaces: one CSV per tab, each paired with a
│                     .md column-definition file in the same metadata convention
└── client-surface/   setup-guide.md + sample/ (a minimal end-to-end example)
```

## Instantiating for a project

1. **Copy** this directory into the project workspace (for a Codeable gig:
   `gigs/<slug>/workbook/`). Templates are copied, never edited in place.
2. **Trim and duplicate.** Delete the sheets the project doesn't need; duplicate
   the page module (guide/30-page.md) once per page. Delete example rows.
3. **Declare the sites.** In the site overview, set `mode: project` and replace
   the sample `site_ids` with the project's own. `shared` and `project` are
   reserved and always available.
4. **Assign IDs.** Kebab-case, stable, never reused: pages `<site>-<page>`,
   rows `event-001`-style, assets `asset-001` (one series for all types),
   page-local blocks `section-01` / `cta-01`. IDs survive renaming; pages
   reference assets by ID — filenames are attributes.
5. **List the guide's implementation fields** in the instance guide's
   `guide_fields` block (the convention is documented in guide/30-page.md).
6. **Fill `mapping/project-mapping.md`** with the project's CMS destinations —
   every `cms_target: null` field gets an entry.
7. **Prefill from discovery.** Anything already established arrives filled in
   for confirmation; the client is never asked twice.
8. **Validate**, then convert to the client surface per the setup guide.

## Validation

```bash
python3 tools/project-system/scripts/validate-workbook.py <workbook-dir>
```

Run it against these masters, the sample, and every project instance. It
checks CSV integrity (UTF-8, column counts, unique headers, quoting round
trip), ID patterns, site IDs against the declared set, controlled status
values, the header/column-definition pairing, approval-field completeness, and
— for `mode: project` workbooks — mapping coverage and selector conflicts.
Non-zero exit on failure; failures name the file, row or field responsible.

## The sample

[client-surface/sample/](client-surface/sample/) is a deliberately small,
deliberately awkward end-to-end project: a conditional field, a blank
optional, an asset-ID reference, a shared-site item, a Not required item, a
blocked integration, an item changed after approval, developer-only statuses,
CSV text with commas, quotes, line breaks and non-ASCII characters. If a
change to the system breaks the sample, it will break a real project.
