# Asset register — column definitions

One row per file the websites need: images, logos, documents, video and audio. Pages and sheet rows refer to assets by their asset ID; filenames may change, IDs never do. Place each file in the shared asset folder using the filename recorded here.

Each column of the matching CSV is defined below in the shared field-metadata convention.

### id

```yaml
id: asset.id
column: id
label: Id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Stable asset identifier (for example asset-001). One numbering series for all asset types."
```

### site_id

```yaml
id: asset.site_id
column: site_id
label: Site id
type: id
requirement: required
owner: developer
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The site this asset belongs to: a declared site ID, or shared / project."
```

### asset_type

```yaml
id: asset.asset_type
column: asset_type
label: Asset type
type: choice
requirement: required
owner: client
phase: content
cms_target: project-metadata
allowed: [image, document, video, audio, logo, other]
client_visible: [requirement, owner, guidance]
guidance: "What kind of file this is."
```

### filename

```yaml
id: asset.filename
column: filename
label: Filename
type: text
requirement: required
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The exact filename of the file in the shared asset folder."
```

### purpose

```yaml
id: asset.purpose
column: purpose
label: Purpose
type: text
requirement: required
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Where and how the asset is used (for example: home page hero image)."
```

### alt_text

```yaml
id: asset.alt_text
column: alt_text
label: Alt text
type: text
requirement: conditional
condition: "Required when the asset type is image or logo."
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "A short description of the image for people using screen readers."
```

### crop_notes

```yaml
id: asset.crop_notes
column: crop_notes
label: Crop notes
type: text
requirement: optional
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Any cropping or focal-point guidance for the image."
```

### link_label

```yaml
id: asset.link_label
column: link_label
label: Link label
type: text
requirement: conditional
condition: "Required for documents linked from a page."
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The link text shown for the document on the website."
```

### accessible_document_status

```yaml
id: asset.accessible_document_status
column: accessible_document_status
label: Accessible document status
type: choice
requirement: optional
owner: client
phase: content
cms_target: project-metadata
allowed: [Accessible, Needs review, Not accessible, Not applicable]
client_visible: [requirement, owner, guidance]
guidance: "For documents: whether an accessible version exists or is needed."
```

### transcript_captions

```yaml
id: asset.transcript_captions
column: transcript_captions
label: Transcript captions
type: text
requirement: conditional
condition: "Required for video or audio assets."
owner: client
phase: content
cms_target: null
client_visible: [requirement, owner, guidance]
guidance: "The transcript or captions file for the recording (an asset ID or filename)."
```

### language

```yaml
id: asset.language
column: language
label: Language
type: text
requirement: optional
owner: client
phase: content
cms_target: project-metadata
format: "ISO 639-1 code, for example en"
client_visible: [requirement, owner, guidance]
guidance: "The language of the asset's text content, if not the site's main language."
```

### rights_source

```yaml
id: asset.rights_source
column: rights_source
label: Rights source
type: text
requirement: required
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Where the asset comes from and the basis for using it (owned, licensed, permission granted)."
```

### editorial_status

```yaml
id: asset.editorial_status
column: editorial_status
label: Editorial status
type: choice
requirement: required
owner: client
phase: content
cms_target: project-metadata
allowed: [Needed, Proposed, In review, Approved, Not required]
client_visible: [requirement, owner, guidance]
guidance: "Where this asset stands: Needed (not yet provided), Proposed, In review, Approved, or Not required."
```

### approved_by

```yaml
id: asset.approved_by
column: approved_by
label: Approved by
type: text
requirement: conditional
condition: "Required when the status is Approved."
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Who approved this asset for use."
```

### approved_date

```yaml
id: asset.approved_date
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
id: asset.revision_note
column: revision_note
label: Revision note
type: text
requirement: conditional
condition: "Required when a previously approved item is reopened."
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Why a previously approved asset was reopened for changes."
```

### delivery_status

```yaml
id: asset.delivery_status
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

### file_received

```yaml
id: asset.file_received
column: file_received
label: File received
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Yes, No, Not applicable]
client_visible: []
guidance: "Developer check: the file has been received."
```

### technical_suitability

```yaml
id: asset.technical_suitability
column: technical_suitability
label: Technical suitability
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Yes, No, Not applicable]
client_visible: []
guidance: "Developer check: resolution, format and quality are suitable for the intended use."
```

### optimized

```yaml
id: asset.optimized
column: optimized
label: Optimized
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Yes, No, Not applicable]
client_visible: []
guidance: "Developer check: the asset has been optimized for the web."
```

### uploaded

```yaml
id: asset.uploaded
column: uploaded
label: Uploaded
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Yes, No, Not applicable]
client_visible: []
guidance: "Developer check: the asset has been uploaded to the website."
```

### verified

```yaml
id: asset.verified
column: verified
label: Verified
type: choice
requirement: required
owner: developer
phase: delivery
cms_target: project-metadata
allowed: [Yes, No, Not applicable]
client_visible: []
guidance: "Developer check: the asset displays correctly in place."
```
