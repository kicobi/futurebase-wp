# 30 — Page module

One copy of this module per page, per site. Duplicate it for every page in the
project and delete the field definitions below once the instance guide is
assembled — in a project instance, each page appears as a compact filled
module (see "Instantiating" at the end).

## Module header

Every page module opens with a machine-readable header:

```yaml
page_id: site-a-example
site_id: site-a
```

`page_id` is a stable kebab-case ID, prefixed with the site (for example
`site-a-about`). It never changes once assigned, even if the page is renamed.

## Page fields

```yaml
id: page.title
label: Page title
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The main public title displayed on the page."
```

```yaml
id: page.nav_label
label: Navigation label
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The shorter label used in the menu, if different from the page title."
```

```yaml
id: page.slug
label: Page address
type: text
requirement: optional
owner: developer
phase: content
cms_target: null
client_visible: [owner, guidance]
guidance: "The page's address path (for example /about). The developer proposes this; confirm or adjust."
```

```yaml
id: page.goal
label: Page goal
type: text
requirement: required
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "What this page should achieve for its visitor. Prefilled from discovery — confirm it."
```

```yaml
id: page.audience
label: Page audience
type: text
requirement: required
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Who this page mainly speaks to. Prefilled from discovery — confirm it."
```

## Content blocks

The body of a page is a sequence of blocks. Repeatable or independently mapped
blocks carry a local block ID scoped to the page (`section-01`, `section-02`,
`cta-01`); individual paragraphs inside a block need no IDs. Choose the block
structure that fits the project — a content-before-design project may use
loose sections, a design-before-content project mirrors the approved layout.

### Section block (`section-NN`)

```yaml
id: section.heading
label: Section heading
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The heading of this section, if it has one."
```

```yaml
id: section.body
label: Section text
type: long-text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The section's text, exactly as it should appear on the website."
```

```yaml
id: section.asset
label: Section image or file
type: id
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The asset ID from the asset register, if this section shows an image or links a file."
```

### Call-to-action block (`cta-NN`)

```yaml
id: cta.label
label: Button label
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The text on the button or link."
```

```yaml
id: cta.url
label: Button destination
type: url
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "Where the button or link leads."
```

## Search snippet

```yaml
id: page.seo_title
label: Search title
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The title normally shown in browser tabs and search results; the developer may provide a fallback based on the page title."
```

```yaml
id: page.meta_description
label: Search description
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "One or two sentences shown under the title in search results; the developer may provide a fallback."
```

## Workflow

```yaml
id: page.content_status
label: Content status
type: choice
requirement: required
owner: client
phase: content
cms_target: project-metadata
allowed: [Not started, Draft, In review, Approved, Not required]
client_visible: [requirement, owner, guidance]
guidance: "Where this page stands in drafting and approval. Only content marked Approved is implemented."
```

```yaml
id: page.approved_by
label: Approved by
type: text
requirement: conditional
condition: "Required when the status is Approved."
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Who gave the final approval for this page."
```

```yaml
id: page.approved_date
label: Approval date
type: date
requirement: conditional
condition: "Required when the status is Approved."
owner: client
phase: content
cms_target: project-metadata
format: "YYYY-MM-DD"
client_visible: [requirement, owner, guidance]
guidance: "When the approval was given."
```

```yaml
id: page.revision_note
label: Revision note
type: text
requirement: conditional
condition: "Required when a previously approved page is reopened."
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Why a previously approved page was reopened for changes."
```

```yaml
id: page.delivery_status
label: Delivery status
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Not implemented, Implemented, QA verified, Published]
client_visible: []
guidance: "Developer delivery state. Maintained by the developer."
```

## Instantiating

In a project instance guide, pages appear as compact filled modules: the
module-header YAML block, then the fields as bold labels with their values and
short client-facing hints — the full metadata above stays here in the master.
The instance guide declares which implementation field IDs it uses in a single
machine-readable block, so the validator can check mapping coverage:

```text
guide_fields:
  - page.title
  - page.nav_label
  - ...
```

(In the instance, that list is a real fenced YAML block; it is shown as plain
text here so this master is not itself read as an instance.)
