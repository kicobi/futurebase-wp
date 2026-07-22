# Client-surface setup guide

How a validated workbook instance becomes the client's working surface. The
repository masters and the project instance files are canonical; the client
surface is a skin over them. Any document tool with commenting plus any
spreadsheet tool works (Google Workspace, Microsoft 365, Notion, or plain
Markdown for technical clients) — the steps below note the Google Workspace
specifics since that is the common case.

## What goes where

- **Prose → one document** ("Content Workbook — [PROJECT]"): the guide files in
  order (introduction, site overview, brand, one module per page, legal,
  sign-off), with commenting enabled for review discussions.
- **Tabular → one spreadsheet** ("Content Workbook — sheets"): one tab per CSV,
  same tab order as the sheet filenames, headers frozen.
- **Assets → one shared folder**: filenames exactly as recorded in the asset
  register.

## Metadata visibility

The field metadata carries a `client_visible` list; it decides what the client
surface shows.

- **Becomes visible instructions:** requirement level (shown as "required" /
  "optional" / the condition text), owner, guidance, and format constraints —
  rendered as short hints next to each field or in a header note on each tab.
- **Stripped — never in the client surface:** `phase`, `cms_target`,
  implementation notes, repository paths, developer comments, and the
  `mapping/` file. Before sharing, search the assembled surfaces for
  `cms_target`, `phase:` and repo paths to confirm nothing leaked.

## Spreadsheet assembly

1. Import each CSV into its own tab (File → Import → Append/Replace per tab).
2. **Format ID columns as plain text** (`id`, `site_id`, `asset_id`) before
   entering data, so the tool never converts IDs to dates or numbers.
3. Add **dropdowns** on every controlled column from the `allowed` list in the
   column definitions (Data → Data validation).
4. **Protect the developer columns** (every column whose definition says
   `owner: developer` — delivery status, the asset check fields, technical
   checklist results) so the client can see but not edit them.
5. Freeze the header row on every tab.

## Developer-visibility default

The same on every project:

- Content and asset delivery progress may be visible to the client, but
  protected.
- Detailed technical QA lives on a developer-controlled tab
  (technical-readiness); clients see outcomes, not working notes.
- Internal CMS mappings never appear in the client workbook.

## Sharing

- Client contributors: edit access to the document and the unprotected sheet
  columns; upload access to the asset folder.
- The decision-maker: the same, plus they are the named approver.
- Credentials are never entered in any surface — access to external systems
  flows through the project's approved secure method (for Codeable projects,
  the Codeable Credential Vault).

## Freezing a checkpoint

At each sign-off checkpoint (see guide/90-sign-off.md): export the document
(PDF or docx), download every tab as CSV, copy the asset folder (IDs and
filenames preserved) — or record an immutable read-only folder reference where
the platform supports one — and place everything in a read-only
`archive/<version>/` folder named in the version manifest. Export format is
tool-dependent; the fixed copy is not optional.
