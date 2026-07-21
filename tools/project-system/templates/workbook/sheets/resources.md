# Resources — column definitions

One row per downloadable or linked resource.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: resource.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable row identifier (for example resource-001). Never changed or reused once assigned."
```

### site_id

```yaml
id: resource.site_id
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
id: resource.title
column: title
label: Title
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The resource title as it should appear on the website."
```

### category

```yaml
id: resource.category
column: category
label: Category
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The resource category, if the site groups resources."
```

### asset_id

```yaml
id: resource.asset_id
column: asset_id
label: Asset id
type: id
requirement: conditional
condition: "Provide either a file asset ID or an external link."
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The asset ID of the file from the asset register."
```

### external_url

```yaml
id: resource.external_url
column: external_url
label: External url
type: url
requirement: conditional
condition: "Provide either a file asset ID or an external link."
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "An external link, when the resource is not an uploaded file."
```

### description

```yaml
id: resource.description
column: description
label: Description
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "An optional short description."
```

### content_status

```yaml
id: resource.content_status
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
id: resource.approved_by
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
id: resource.approved_date
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
id: resource.revision_note
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
id: resource.delivery_status
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
