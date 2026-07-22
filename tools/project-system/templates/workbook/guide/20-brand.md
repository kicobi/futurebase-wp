# 20 — Brand

The identity material the design and build work from. Most of this was
established during discovery and arrives prefilled — please confirm it rather
than rewrite it. Logo and font files themselves are recorded in the asset
register and placed in the shared asset folder.

```yaml
id: brand.organization_names
label: Organization name(s)
type: text
requirement: required
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The exact organization name(s) as they should appear publicly, per site if they differ."
```

```yaml
id: brand.tagline
label: Tagline
type: text
requirement: optional
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "A short tagline, if one is used."
```

```yaml
id: brand.tone
label: Tone of voice
type: text
requirement: required
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Three to five words describing how the websites should sound (for example: calm, credible, welcoming)."
```

```yaml
id: brand.color_guidance
label: Color guidance
type: text
requirement: optional
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Existing brand colors (with codes if known), or any color direction the design should respect."
```

```yaml
id: brand.typography
label: Typography and licensed fonts
type: text
requirement: optional
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Fonts the organization already uses or licenses. Font files or license references go in the asset register."
```

```yaml
id: brand.logo_assets
label: Logo assets
type: text
requirement: required
owner: client
phase: content
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "The asset IDs of the logos in the asset register (SVG or the highest quality available)."
```

```yaml
id: brand.reference_sites
label: Reference websites
type: text
requirement: optional
owner: client
phase: discovery
cms_target: project-metadata
client_visible: [requirement, owner, guidance]
guidance: "Websites whose look or feel you admire, with a note on what you like about each."
```
