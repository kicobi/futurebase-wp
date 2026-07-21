# Workbook version manifest

One release identifier spans every surface of the workbook — the guide, the
sheet tabs and the asset folder. A version exists when it is recorded here and
frozen as a read-only archive. The asset register is the asset inventory; no
checksums are kept.

## Versions

| Version | Date | Purpose | Surfaces |
| --- | --- | --- | --- |
| v1.0 | [YYYY-MM-DD] | Approved for implementation | Guide export; all sheet tabs as CSV; asset folder copy at [ARCHIVE PATH] |
| v1.2 | [YYYY-MM-DD] | Launch record | Guide export; all sheet tabs as CSV; asset folder copy at [ARCHIVE PATH] |

For each version record: the archived asset-folder path (or the immutable
read-only folder reference where the platform supports one), the asset-register
version it contains, the asset count, and the release purpose.

## Checkpoint confirmations

The two checkpoints may have different authorities, so each carries its own
confirmation fields.

### v1.0 — approved for implementation

- Approved for implementation by (client): [NAME]
- Date: [YYYY-MM-DD]
- Developer verified by: [NAME]
- Date: [YYYY-MM-DD]

### v1.2 — launch record

- Launch reconciled by (client): [NAME]
- Date: [YYYY-MM-DD]
- Developer verified by: [NAME]
- Date: [YYYY-MM-DD]

"Developer verified" confirms the archive is complete and matches the active
surfaces at the moment of freezing.
