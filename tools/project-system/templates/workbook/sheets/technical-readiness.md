# Technical launch checklist — column definitions

Technical checks completed before publication. This sheet is the principal implementation QA record and supports milestone acceptance; it does not replace the contractual acceptance process.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: technical-check.id
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
id: technical-check.site_id
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
id: technical-check.item
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
id: technical-check.owner
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
id: technical-check.result
column: result
label: Result
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Open, Done, Not applicable]
client_visible: []
guidance: "The outcome of the check."
```

### checked_by

```yaml
id: technical-check.checked_by
column: checked_by
label: Checked by
type: text
requirement: conditional
condition: "Required when the result is Done."
owner: developer
phase: delivery
cms_target: project-metadata
client_visible: []
guidance: "Who performed the check."
```

### checked_date

```yaml
id: technical-check.checked_date
column: checked_date
label: Checked date
type: date
requirement: conditional
condition: "Required when the result is Done."
owner: developer
phase: delivery
cms_target: project-metadata
format: "YYYY-MM-DD"
client_visible: []
guidance: "When the check was performed."
```

### notes

```yaml
id: technical-check.notes
column: notes
label: Notes
type: text
requirement: optional
owner: developer
phase: delivery
cms_target: project-metadata
client_visible: []
guidance: "Anything worth recording about the outcome."
```
