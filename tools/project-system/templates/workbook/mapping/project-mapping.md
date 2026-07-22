# Project mapping — template

Where each implementation field lands in the CMS for this project. The
workbook's field metadata is deliberately CMS-free: column definitions and
guide fields carry `cms_target: null` (implementation field, mapping supplied
here) or `cms_target: project-metadata` (intentionally kept outside the CMS).
This file supplies the project's actual destinations — one fenced entry per
mapping. It is internal and never appears in the client workspace.

## Entry format

Each entry names a `field_id`, its `cms_target`, a `transformation` ("none"
when the value is used as-is) and optional `notes`. Optional selectors narrow
an entry to a `content_type` (a sheet name, for example `events`), a `page_id`
or a `site_id`. A field may have one default entry (no selectors) and narrower
overrides; the applicable entry with the most matching selectors wins. Two
applicable entries of equal specificity with different destinations or
transformations fail validation — resolve by adding one combined entry naming
all the conflicting selectors together.

Workflow and approval fields are `project-metadata` in the definitions and are
never restated here.

## Examples

A default mapping:

```yaml
field_id: event.start_date
cms_target: post_meta:_event_start
transformation: "convert ISO date/time to the project timezone"
notes: ""
```

A page-scoped override (wins over the default on that page):

```yaml
field_id: section.body
page_id: site-a-home
cms_target: post_content:hero-paragraph
transformation: "none"
notes: "The home hero paragraph uses the hero pattern slot."
```

A combined override, resolving two equally specific entries by naming both
selectors together:

```yaml
field_id: section.body
page_id: site-a-home
site_id: site-a
cms_target: post_content:hero-paragraph
transformation: "none"
notes: "Combined entry: page and site selectors named together."
```

Replace the examples with the project's real entries. Every implementation
field (every `cms_target: null` field in the column definitions and the
instance guide's `guide_fields` list) must be covered.
