# 60 — Legal and organizational

The legal pages and the organizational details that appear on the websites.

**Responsibility model:** your organization approves all legal wording. The
wording itself may come from your organization, your advisers, a third-party
provider, or an agreed template — whichever route you choose, approval remains
yours. The developer supplies factual implementation details where useful (in
particular a practical draft of the accessibility statement, describing how the
websites were actually built) but does not provide legal advice or certify
regulatory compliance.

## Organizational identity

Shown in the website footers and on the legal pages.

```yaml
id: legal.organization_name
label: Registered organization name(s)
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The registered name(s) exactly as they must appear publicly, per site if they differ."
```

```yaml
id: legal.registered_address
label: Registered address
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The registered address as it must appear in the website footer and legal pages."
```

```yaml
id: legal.registration_details
label: Registration details
type: text
requirement: optional
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "Registration numbers or register references that must be shown, if any."
```

## Legal documents

One entry per legal document, duplicated as needed (typical set: privacy
policy, cookie policy, refund/cancellation/complaints, accessibility
statement). Each entry records:

```yaml
id: legal.document_title
label: Document title
type: text
requirement: required
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Which legal document this entry covers."
```

```yaml
id: legal.wording_source
label: Wording source
type: choice
requirement: required
owner: client
phase: content
cms_target: project-metadata
allowed: [Organization, Adviser, Third-party provider, Agreed template]
client_visible: [requirement, owner, guidance]
guidance: "Where the wording comes from. Approval remains with the organization in every case."
```

```yaml
id: legal.wording
label: Final wording
type: long-text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The final approved wording, exactly as it should appear on the website."
```

```yaml
id: legal.content_status
label: Content status
type: choice
requirement: required
owner: client
phase: content
cms_target: project-metadata
allowed: [Not started, Draft, In review, Approved, Not required]
client_visible: [requirement, owner, guidance]
guidance: "Where this document stands. Only wording marked Approved is implemented."
```

Approval fields (approved by, approval date, revision note) follow the same
convention as every other content item — see the page module (section 30).
