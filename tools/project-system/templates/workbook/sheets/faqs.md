# FAQs — column definitions

One row per frequently asked question.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: faq.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable row identifier (for example faq-001). Never changed or reused once assigned."
```

### site_id

```yaml
id: faq.site_id
column: site_id
label: Site id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The site this row belongs to: one of the site IDs declared in the site overview, or shared / project."
```

### question

```yaml
id: faq.question
column: question
label: Question
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The question, phrased as a visitor would ask it."
```

### answer

```yaml
id: faq.answer
column: answer
label: Answer
type: long-text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The answer, exactly as it should appear."
```

### display_order

```yaml
id: faq.display_order
column: display_order
label: Display order
type: number
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "Display position (1 = first)."
```

### content_status

```yaml
id: faq.content_status
column: content_status
label: Content status
type: choice
requirement: required
owner: client
phase: content
cms_target: project-metadata
allowed: [Not started, Draft, In review, Approved, Not required]
client_visible: [requirement, owner, guidance]
guidance: "Where this item stands in drafting and approval. Only content marked Approved is implemented."
```

### approved_by

```yaml
id: faq.approved_by
column: approved_by
label: Approved by
type: text
requirement: conditional
condition: "Required when the status is Approved."
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Who gave the final approval for this item."
```

### approved_date

```yaml
id: faq.approved_date
column: approved_date
label: Approved date
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

### revision_note

```yaml
id: faq.revision_note
column: revision_note
label: Revision note
type: text
requirement: conditional
condition: "Required when a previously approved item is reopened."
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Why a previously approved item was reopened for changes."
```

### delivery_status

```yaml
id: faq.delivery_status
column: delivery_status
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
