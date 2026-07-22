# People — column definitions

One row per person profile (for example governance or team profiles).

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: person.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable row identifier (for example person-001). Never changed or reused once assigned."
```

### site_id

```yaml
id: person.site_id
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

### name

```yaml
id: person.name
column: name
label: Name
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The person's name as it should appear on the website."
```

### role_title

```yaml
id: person.role_title
column: role_title
label: Role title
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The person's role or title."
```

### organization_body

```yaml
id: person.organization_body
column: organization_body
label: Organization body
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The body or unit the person belongs to (for example Board, Secretariat)."
```

### bio

```yaml
id: person.bio
column: bio
label: Bio
type: long-text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "A short biography (one to three sentences)."
```

### asset_id

```yaml
id: person.asset_id
column: asset_id
label: Asset id
type: id
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The asset ID of the person's photo from the asset register, if any."
```

### display_order

```yaml
id: person.display_order
column: display_order
label: Display order
type: number
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "Display position within the body (1 = first)."
```

### content_status

```yaml
id: person.content_status
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
id: person.approved_by
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
id: person.approved_date
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
id: person.revision_note
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
id: person.delivery_status
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
