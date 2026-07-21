# Events — column definitions

One row per event report published at launch.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: event.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable row identifier (for example event-001). Never changed or reused once assigned."
```

### site_id

```yaml
id: event.site_id
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

### title

```yaml
id: event.title
column: title
label: Title
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The event title as it should appear on the website."
```

### event_date

```yaml
id: event.event_date
column: event_date
label: Event date
type: date
requirement: required
owner: client
phase: content
cms_target: null
format: "YYYY-MM-DD"
client_visible: [requirement, owner, guidance]
guidance: "The date of the event."
```

### location

```yaml
id: event.location
column: location
label: Location
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "Where the event took place, if shown."
```

### description

```yaml
id: event.description
column: description
label: Description
type: long-text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "A short description of the event (two to five sentences)."
```

### asset_id

```yaml
id: event.asset_id
column: asset_id
label: Asset id
type: id
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The asset ID of the event image from the asset register, if any."
```

### link_url

```yaml
id: event.link_url
column: link_url
label: Link url
type: url
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "An external link with more information, if any."
```

### content_status

```yaml
id: event.content_status
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
id: event.approved_by
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
id: event.approved_date
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
id: event.revision_note
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
id: event.delivery_status
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
