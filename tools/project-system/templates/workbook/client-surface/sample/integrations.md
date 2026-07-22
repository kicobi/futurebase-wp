# Integrations — column definitions

One row per external system the websites depend on. Credentials are never entered in the workbook: the secure reference records where access was provided, never the secret itself.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: integration.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable identifier for the integration (for example raisenow)."
```

### site_id

```yaml
id: integration.site_id
column: site_id
label: Site id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The site this integration serves: a declared site ID, or shared / project."
```

### system

```yaml
id: integration.system
column: system
label: System
type: text
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The name of the external system."
```

### purpose

```yaml
id: integration.purpose
column: purpose
label: Purpose
type: text
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "What the system does for the project."
```

### owner

```yaml
id: integration.owner
column: owner
label: Owner
type: text
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Who leads the setup of this system."
```

### account_holder

```yaml
id: integration.account_holder
column: account_holder
label: Account holder
type: text
requirement: optional
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Which organization or person holds the account."
```

### access_method

```yaml
id: integration.access_method
column: access_method
label: Access method
type: choice
requirement: required
owner: client
phase: content
cms_target: project-metadata
allowed: [Named user invitation, Delegated account access, Secure credential sharing, Not needed]
client_visible: [requirement, owner, guidance]
guidance: "How the developer receives access, in order of preference: a named user invitation, delegated account access, or secure credential sharing only when unavoidable."
```

### secure_reference

```yaml
id: integration.secure_reference
column: secure_reference
label: Secure reference
type: text
requirement: optional
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Where access was provided (for example a vault entry name) — never the credential itself."
```

### readiness

```yaml
id: integration.readiness
column: readiness
label: Readiness
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Identified, Account pending, Access pending, Configured, Tested, Ready, Not required]
client_visible: [requirement, owner, guidance]
guidance: "How far the integration has progressed."
```

### blocked

```yaml
id: integration.blocked
column: blocked
label: Blocked
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Yes, No]
client_visible: [requirement, owner, guidance]
guidance: "Whether progress is currently impossible (as opposed to normally pending)."
```

### blocker_note

```yaml
id: integration.blocker_note
column: blocker_note
label: Blocker note
type: text
requirement: conditional
condition: "Required when blocked is Yes."
owner: developer
phase: delivery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "What is blocking progress and who can resolve it."
```

### notes

```yaml
id: integration.notes
column: notes
label: Notes
type: text
requirement: optional
owner: developer
phase: delivery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Anything else worth recording about this integration."
```
