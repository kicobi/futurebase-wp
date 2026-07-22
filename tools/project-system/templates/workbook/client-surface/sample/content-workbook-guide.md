# Content Workbook — Aurora Community Choir (sample)

A minimal end-to-end sample instance, used as a workflow test for the workbook
system. The project is fictional: a community choir with a main website and a
seasonal campaign microsite. It is deliberately small — one complete page
module and four sheets — and deliberately awkward where real projects are
awkward.

The rules from the master introduction apply: only Approved content is
implemented; the workbook is the authoritative source for launch content;
credentials are never entered here.

## Site overview

```yaml
workbook: content-workbook
mode: project
site_ids: [main-site, campaign-site]
```

| site_id | Site name | Domain | Purpose |
| --- | --- | --- | --- |
| main-site | Aurora Community Choir | aurorachoir.example | The choir's main website |
| campaign-site | Winter Concert Campaign | winter.aurorachoir.example | Seasonal campaign microsite |

- **Content lead:** Astrid Ćirić
- **Decision-maker:** Astrid Ćirić
- **Developer contact:** Colin Lewis
- **Workbook completion date:** 2026-06-30
- **Target launch date:** 2026-08-15

## Guide fields

```yaml
guide_fields:
  - page.title
  - page.nav_label
  - page.slug
  - section.heading
  - section.body
  - section.asset
  - cta.label
  - cta.url
  - page.seo_title
  - page.meta_description
```

## Page: Home (main site)

```yaml
page_id: main-site-home
site_id: main-site
```

- **Page title** (required): Aurora Community Choir
- **Navigation label** (optional): Home
- **Page address** (developer proposes): /
- **Page goal** (prefilled from discovery — confirm): Welcome visitors and
  invite them to the next concert.
- **Page audience** (prefilled from discovery — confirm): Local residents and
  prospective members.

### section-01

- **Section heading** (optional): Singing together since 1998
- **Section text** (required): We are an open community choir — no auditions,
  no fees, and a warm welcome in three languages: svenska, Deutsch, English.
- **Section image** (optional, asset ID): asset-001

### cta-01

- **Button label** (required): Join our next rehearsal
- **Button destination** (required): /rehearsals

- **Search title** (optional): Aurora Community Choir — sing with us
- **Search description** (optional): An open community choir in Berlin.
  No auditions, no fees — everyone is welcome.

- **Content status:** Approved
- **Approved by:** Astrid Ćirić
- **Approval date:** 2026-07-01

## Sheets

The tabular content lives in the adjacent CSVs, one tab each: events, assets,
integrations, technical-readiness. Their column definitions are the paired
`.md` files.

## Sign-off

The two checkpoints and the archive convention follow the master (section 90).
Versions are recorded in [workbook-version.md](workbook-version.md).
