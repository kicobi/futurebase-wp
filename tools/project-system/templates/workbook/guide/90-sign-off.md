# 90 — Sign-off

Two checkpoints close the workbook. They are different from approving
individual items: item approval says "this piece of content is final";
sign-off says "the set as a whole is ready".

## Checkpoint 1 — implementation sign-off

When the launch content set is complete enough to build from, the
decision-maker signs the workbook off for implementation (for example
`v1.0 — approved for implementation`). Where the project contract requires the
completed workbook before work begins, this is that gate.

Signing off means:

- Every page and content item in the agreed launch scope is Approved or
  explicitly Not required.
- The referenced assets are in the shared folder and match the asset register.
- The websites will be built and populated from this version.

During implementation, approved corrections are still welcome — they are
recorded in the workbook and reconciled into the next version. Unapproved
edits made after sign-off are not implementation instructions.

## Checkpoint 2 — launch reconciliation

At publication, the workbook is reconciled to record what was actually
published (for example `v1.2 — launch record`) and archived. From this point
WordPress is the authoritative home of the live content; the archived workbook
is the launch record.

## How a checkpoint is recorded

Each checkpoint is recorded in the version manifest
([workbook-version.md](workbook-version.md)) with its confirmation fields, and
frozen as a read-only archive containing the guide export, each sheet tab as
CSV, the asset register, and a copy of the asset files themselves (or an
immutable read-only folder reference where the storage platform supports one):

```text
archive/
├── v1.0-approved-for-implementation/
└── v1.2-launch-record/
```

The active workbook may keep changing; the signed snapshot does not.
