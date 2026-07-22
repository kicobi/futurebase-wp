# Project mapping — sample project

Where each implementation field lands in the CMS for this project. One fenced entry
per mapping. Workflow and approval fields are `project-metadata` in the column
definitions and are never restated here. A field may have one default entry and
narrower overrides selected by `content_type` (a sheet name), `page_id` or `site_id`;
the applicable entry with the most matching selectors wins.

This file is internal. It never appears in the client workspace.

```yaml
field_id: event.title
cms_target: post_title
transformation: "none"
notes: ""
```

```yaml
field_id: event.event_date
cms_target: post_meta:_event_date
transformation: "store as ISO date"
notes: ""
```

```yaml
field_id: event.location
cms_target: post_meta:_event_location
transformation: "none"
notes: ""
```

```yaml
field_id: event.description
cms_target: post_content
transformation: "paragraphs"
notes: ""
```

```yaml
field_id: event.asset_id
cms_target: featured image
transformation: "resolve asset ID to the uploaded attachment"
notes: ""
```

```yaml
field_id: event.link_url
cms_target: post_meta:_event_link
transformation: "none"
notes: ""
```

```yaml
field_id: asset.filename
cms_target: media library file
transformation: "upload; filename may be normalized on upload"
notes: ""
```

```yaml
field_id: asset.alt_text
cms_target: attachment alt text
transformation: "none"
notes: ""
```

```yaml
field_id: asset.link_label
cms_target: post_content:link-text
transformation: "none"
notes: ""
```

```yaml
field_id: asset.transcript_captions
cms_target: media captions/transcript
transformation: "attach to the uploaded media"
notes: ""
```

```yaml
field_id: page.title
cms_target: post_title
transformation: "none"
notes: ""
```

```yaml
field_id: page.nav_label
cms_target: nav_menu_item:title
transformation: "none"
notes: ""
```

```yaml
field_id: page.slug
cms_target: post_name
transformation: "none"
notes: ""
```

```yaml
field_id: section.heading
cms_target: post_content:heading
transformation: "none"
notes: ""
```

```yaml
field_id: section.body
cms_target: post_content:paragraphs
transformation: "none"
notes: ""
```

```yaml
field_id: section.asset
cms_target: post_content:image
transformation: "resolve asset ID to the uploaded attachment"
notes: ""
```

```yaml
field_id: cta.label
cms_target: post_content:button-text
transformation: "none"
notes: ""
```

```yaml
field_id: cta.url
cms_target: post_content:button-url
transformation: "none"
notes: ""
```

```yaml
field_id: page.seo_title
cms_target: post_meta:_seo_title
transformation: "none"
notes: ""
```

```yaml
field_id: page.meta_description
cms_target: post_meta:_seo_description
transformation: "none"
notes: ""
```

```yaml
field_id: section.body
page_id: main-site-home
cms_target: post_content:hero-paragraph
transformation: "none"
notes: "The home hero paragraph uses the hero pattern slot, not the default body flow."
```
