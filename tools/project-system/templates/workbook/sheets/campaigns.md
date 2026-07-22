# Campaigns — column definitions

One row per campaign. The campaign system distinguishes the current campaign from archived years.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: campaign.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable row identifier (for example campaign-001). Never changed or reused once assigned."
```

### site_id

```yaml
id: campaign.site_id
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
id: campaign.title
column: title
label: Title
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The campaign title as it should appear on the website."
```

### campaign_year

```yaml
id: campaign.campaign_year
column: campaign_year
label: Campaign year
type: number
requirement: required
owner: client
phase: content
cms_target: null
format: "YYYY"
client_visible: [requirement, owner, guidance]
guidance: "The campaign year."
```

### summary

```yaml
id: campaign.summary
column: summary
label: Summary
type: long-text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "A one-paragraph summary of the campaign."
```

### call_to_action_label

```yaml
id: campaign.call_to_action_label
column: call_to_action_label
label: Call to action label
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The label of the campaign's main call to action."
```

### call_to_action_url

```yaml
id: campaign.call_to_action_url
column: call_to_action_url
label: Call to action url
type: url
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "Where the main call to action leads."
```

### asset_id

```yaml
id: campaign.asset_id
column: asset_id
label: Asset id
type: id
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The asset ID of the campaign hero image from the asset register."
```

### publish_from

```yaml
id: campaign.publish_from
column: publish_from
label: Publish from
type: date
requirement: optional
owner: client
phase: content
cms_target: null
format: "YYYY-MM-DD"
client_visible: [requirement, owner, guidance]
guidance: "When the campaign should become the current campaign, if scheduled."
```

### publish_to

```yaml
id: campaign.publish_to
column: publish_to
label: Publish to
type: date
requirement: optional
owner: client
phase: content
cms_target: null
format: "YYYY-MM-DD"
client_visible: [requirement, owner, guidance]
guidance: "When the campaign returns to the archive, if scheduled."
```

### content_status

```yaml
id: campaign.content_status
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
id: campaign.approved_by
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
id: campaign.approved_date
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
id: campaign.revision_note
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
id: campaign.delivery_status
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
