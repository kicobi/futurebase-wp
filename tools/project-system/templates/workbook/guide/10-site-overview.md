# 10 — Site overview

The project's sites, people and key dates. Every row in every sheet names the
site it belongs to, using the site IDs declared here.

## Declaration

This block is machine-read by the validator. Replace the example site IDs with
the project's own (kebab-case), and set `mode: project` when instantiating.
`shared` (belongs to more than one site) and `project` (an engagement-level
record, not site content) are reserved and always available in addition to the
declared IDs.

```yaml
workbook: content-workbook
mode: template
site_ids: [site-a, site-b]
```

## Sites

One entry per website in the project.

| site_id | Site name | Domain | Purpose |
| --- | --- | --- | --- |
| site-a | [SITE NAME] | [DOMAIN] | [ONE-LINE PURPOSE] |
| site-b | [SITE NAME] | [DOMAIN] | [ONE-LINE PURPOSE] |

## People

```yaml
id: overview.content_lead
label: Content lead
type: text
requirement: required
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The one person who coordinates completing this workbook."
```

```yaml
id: overview.decision_maker
label: Decision-maker
type: text
requirement: required
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The person (or defined approval group) whose approval makes an item final."
```

```yaml
id: overview.developer_contact
label: Developer contact
type: text
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [owner, guidance]
guidance: "The developer responsible for implementation."
```

## Key dates

```yaml
id: overview.workbook_due
label: Workbook completion date
type: date
requirement: required
owner: client
phase: content
cms_target: project-metadata
format: "YYYY-MM-DD"
client_visible: [requirement, owner, guidance]
guidance: "The agreed date by which the completed workbook is needed."
```

```yaml
id: overview.launch_date
label: Target launch date
type: date
requirement: required
owner: client
phase: content
cms_target: project-metadata
format: "YYYY-MM-DD"
client_visible: [requirement, owner, guidance]
guidance: "The agreed target date for publication."
```
