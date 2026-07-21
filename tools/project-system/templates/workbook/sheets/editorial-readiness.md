# Editorial launch checklist — column definitions

Editorial checks completed before publication. Each row names one action and its owner.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: editorial-check.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable identifier for the checklist row."
```

### site_id

```yaml
id: editorial-check.site_id
column: site_id
label: Site id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The site the check applies to: a declared site ID, or shared / project."
```

### item

```yaml
id: editorial-check.item
column: item
label: Item
type: text
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The check, phrased as an action."
```

### owner

```yaml
id: editorial-check.owner
column: owner
label: Owner
type: text
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Who performs the check."
```

### result

```yaml
id: editorial-check.result
column: result
label: Result
type: choice
requirement: required
owner: client
phase: delivery
cms_target: project-metadata
allowed: [Open, Done, Not applicable]
client_visible: [requirement, owner, guidance]
guidance: "The outcome of the check."
```

### notes

```yaml
id: editorial-check.notes
column: notes
label: Notes
type: text
requirement: optional
owner: client
phase: delivery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Anything worth recording about the outcome."
```
