#!/usr/bin/env python3
"""Validate a Content Workbook directory (masters template, sample, or project instance).

Usage:
    python3 tools/project-system/scripts/validate-workbook.py <workbook-dir> [<workbook-dir> ...]

Checks (see docs/process/content-workbook.md):
  - every CSV decodes as UTF-8, has unique non-empty headers, consistent column
    counts, and survives a parse-and-write round trip unchanged
  - every CSV is paired with a column-definition .md; each header is defined
    exactly once and no definition lacks a header
  - identifier columns (id, site_id, asset_id, page_id) are kebab-case; row IDs
    are present and unique per file; asset_id values resolve in assets.csv
  - site_id values belong to the workbook's declared site set plus the reserved
    values `shared` and `project` (declared in the site-overview YAML block)
  - controlled columns (those with an `allowed` list) hold an allowed value, or
    blank when the column is not required
  - rows whose content/editorial status is Approved carry approved_by and
    approved_date
  - for `mode: project` workbooks: mapping/project-mapping.md covers every
    implementation field (cms_target: null in definitions, plus the guide's
    guide_fields list), names no unknown or project-metadata fields, uses only
    declared selectors, and contains no unresolved equal-specificity conflicts.
    Selector conflicts are resolved against the workbook's declared concrete
    objects: site IDs from the site overview, page IDs from the guide's page
    modules, content types from the sheets present.

Exit status: 0 when every workbook passes, 1 otherwise. Failures name the
file, row or field responsible.
"""

import csv
import io
import re
import sys
from pathlib import Path

KEBAB = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
FIELD_ID = re.compile(r"^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$")
RESERVED_SITES = {"shared", "project"}
ID_COLUMNS = {"id", "site_id", "asset_id", "page_id"}
STATUS_COLUMNS = {"content_status", "editorial_status"}
SELECTOR_KEYS = ("content_type", "page_id", "site_id")
FENCE = re.compile(r"```yaml\n(.*?)```", re.DOTALL)
# client-surface holds the setup guide and the sample, which is a separate
# workbook validated on its own; archive holds frozen snapshots.
SKIP_DIRS = {"archive", "client-surface", "node_modules", ".git"}


def parse_yaml_block(text):
    """Parse the restricted YAML subset the workbook uses: scalar `key: value`
    lines (values may be quoted or inline [a, b] lists) and block lists of
    `- item` lines under a bare `key:`."""
    data = {}
    current_list = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue
        stripped = line.strip()
        if stripped.startswith("- ") and current_list is not None:
            data[current_list].append(stripped[2:].strip())
            continue
        current_list = None
        key, sep, value = stripped.partition(":")
        if not sep:
            continue
        key = key.strip()
        value = value.strip()
        if value == "":
            data[key] = []
            current_list = key
        elif value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            data[key] = [v.strip() for v in inner.split(",") if v.strip()] if inner else []
        else:
            if len(value) >= 2 and value[0] == value[-1] == '"':
                value = value[1:-1]
            data[key] = None if value == "null" else value
    return data


def yaml_blocks(path):
    return [parse_yaml_block(m) for m in FENCE.findall(path.read_text(encoding="utf-8"))]


class Workbook:
    def __init__(self, root):
        self.root = Path(root)
        self.errors = []

    def err(self, path, msg):
        rel = path.relative_to(self.root) if isinstance(path, Path) else path
        self.errors.append(f"{rel}: {msg}")

    def files(self, pattern):
        return sorted(p for p in self.root.rglob(pattern)
                      if not (set(p.relative_to(self.root).parts[:-1]) & SKIP_DIRS))

    def run(self):
        csvs = self.files("*.csv")
        def_files = {c.with_suffix(".md") for c in csvs}
        guide_mds = [m for m in self.files("*.md") if m not in def_files
                     and "mapping" not in m.relative_to(self.root).parts]

        # --- declaration, pages, guide_fields from the guide surfaces
        self.mode, self.sites = None, None
        self.pages = {}          # page_id -> site_id
        self.guide_fields = []
        for md in guide_mds:
            for block in yaml_blocks(md):
                if "site_ids" in block:
                    if self.sites is not None:
                        self.err(md, "second site declaration found; a workbook declares its sites once")
                    self.sites = list(block["site_ids"])
                    self.mode = block.get("mode") or "project"
                    for s in self.sites:
                        if not KEBAB.match(s):
                            self.err(md, f"declared site_id '{s}' is not kebab-case")
                if "page_id" in block and "column" not in block:
                    pid = block["page_id"]
                    if not KEBAB.match(pid or ""):
                        self.err(md, f"page_id '{pid}' is not kebab-case")
                    if pid in self.pages:
                        self.err(md, f"duplicate page_id '{pid}'")
                    self.pages[pid] = block.get("site_id")
                if "guide_fields" in block:
                    self.guide_fields.extend(block["guide_fields"])
        if self.sites is None:
            self.err(self.root, "no site declaration found (a fenced YAML block with site_ids in the guide)")
            self.sites, self.mode = [], "template"
        self.valid_sites = set(self.sites) | RESERVED_SITES

        # --- sheets
        self.def_ids = {}        # field_id -> cms_target (from definition blocks)
        self.sheet_stems = [c.stem for c in csvs]
        asset_ids = self.collect_asset_ids(csvs)
        for c in csvs:
            self.check_csv(c, asset_ids)

        # --- mapping
        mapping = self.root / "mapping" / "project-mapping.md"
        if mapping.exists():
            self.check_mapping(mapping)
        elif self.mode == "project":
            self.err(self.root, "mapping/project-mapping.md is missing (required for mode: project)")

        return self.errors

    # ------------------------------------------------------------------ csv

    @staticmethod
    def read_rows(path):
        raw = path.read_bytes().decode("utf-8")  # strict: raises on bad bytes
        return raw, list(csv.reader(io.StringIO(raw)))

    def collect_asset_ids(self, csvs):
        for c in csvs:
            if c.stem == "assets":
                try:
                    _, rows = self.read_rows(c)
                except UnicodeDecodeError:
                    return None
                if len(rows) > 1 and "id" in rows[0]:
                    i = rows[0].index("id")
                    return {r[i] for r in rows[1:] if len(r) > i}
                return set()
        return None

    def check_csv(self, path, asset_ids):
        try:
            raw, rows = self.read_rows(path)
        except UnicodeDecodeError as e:
            self.err(path, f"not valid UTF-8: {e}")
            return
        if not rows:
            self.err(path, "empty file (a header row is required)")
            return
        header = rows[0]
        if len(set(header)) != len(header):
            self.err(path, "duplicate column headers")
        if any(not h.strip() for h in header):
            self.err(path, "blank column header")

        # round trip: parse -> write -> parse must be lossless
        buf = io.StringIO()
        csv.writer(buf, lineterminator="\n").writerows(rows)
        if list(csv.reader(io.StringIO(buf.getvalue()))) != rows:
            self.err(path, "CSV parse-and-write round trip altered the data")

        # column definitions
        defs = {}
        def_path = path.with_suffix(".md")
        if not def_path.exists():
            self.err(path, f"missing column-definition file {def_path.name}")
        else:
            for block in yaml_blocks(def_path):
                colname = block.get("column")
                if not colname:
                    continue
                if colname in defs:
                    self.err(def_path, f"column '{colname}' defined more than once")
                defs[colname] = block
                fid = block.get("id")
                if not fid or not FIELD_ID.match(fid):
                    self.err(def_path, f"column '{colname}' has a missing or malformed field id: {fid!r}")
                else:
                    self.def_ids[fid] = block.get("cms_target")
            for colname in defs:
                if colname not in header:
                    self.err(def_path, f"definition for '{colname}' has no matching CSV header")
            for h in header:
                if h not in defs and def_path.exists():
                    self.err(def_path, f"CSV header '{h}' has no column definition")

        idx = {h: i for i, h in enumerate(header)}
        seen_ids = set()
        for n, row in enumerate(rows[1:], start=2):
            if len(row) != len(header):
                self.err(path, f"row {n}: {len(row)} cells, header has {len(header)}")
                continue
            cell = lambda col: row[idx[col]].strip() if col in idx else ""

            for col in ID_COLUMNS & set(idx):
                v = cell(col)
                if v and not KEBAB.match(v):
                    self.err(path, f"row {n}: {col} '{v}' is not kebab-case")
            if "id" in idx:
                v = cell("id")
                if not v:
                    self.err(path, f"row {n}: id is empty")
                elif v in seen_ids:
                    self.err(path, f"row {n}: duplicate id '{v}'")
                seen_ids.add(v)
            if "site_id" in idx:
                v = cell("site_id")
                if not v:
                    self.err(path, f"row {n}: site_id is empty")
                elif v not in self.valid_sites:
                    self.err(path, f"row {n}: site_id '{v}' is not a declared site or reserved value")
            if "asset_id" in idx and asset_ids is not None:
                v = cell("asset_id")
                if v and v not in asset_ids:
                    self.err(path, f"row {n}: asset_id '{v}' not found in assets.csv")

            for colname, block in defs.items():
                allowed = block.get("allowed")
                if not allowed or colname not in idx:
                    continue
                v = cell(colname)
                if v == "" and block.get("requirement") != "required":
                    continue
                if v not in allowed:
                    self.err(path, f"row {n}: {colname} '{v}' not in allowed values {allowed}")

            for status_col in STATUS_COLUMNS & set(idx):
                if cell(status_col) == "Approved":
                    for req in ("approved_by", "approved_date"):
                        if req in idx and not cell(req):
                            self.err(path, f"row {n}: status is Approved but {req} is empty")

    # -------------------------------------------------------------- mapping

    def check_mapping(self, path):
        entries = [b for b in yaml_blocks(path) if "field_id" in b]
        for e in entries:
            fid = e.get("field_id") or ""
            if not FIELD_ID.match(fid):
                self.err(path, f"malformed field_id: {fid!r}")
            if not e.get("cms_target"):
                self.err(path, f"{fid}: cms_target is missing")
        if self.mode != "project":
            return

        implementation = {f for f, t in self.def_ids.items() if t is None} | set(self.guide_fields)
        metadata = {f for f, t in self.def_ids.items() if t == "project-metadata"}
        known = implementation | metadata
        mapped = {e.get("field_id") for e in entries}

        for fid in sorted(implementation - mapped):
            self.err(path, f"implementation field '{fid}' has no mapping entry")
        for e in entries:
            fid = e.get("field_id")
            if fid in metadata:
                self.err(path, f"'{fid}' is project-metadata; workflow fields are never restated in the mapping")
            elif fid not in known and FIELD_ID.match(fid or ""):
                self.err(path, f"'{fid}' is not a known field (not in any column definition or guide_fields)")
            ct = e.get("content_type")
            if ct and ct not in self.sheet_stems:
                self.err(path, f"{fid}: content_type '{ct}' is not a sheet in this workbook")
            pid = e.get("page_id")
            if pid and pid not in self.pages:
                self.err(path, f"{fid}: page_id '{pid}' is not a declared page module")
            sid = e.get("site_id")
            if sid and sid not in self.sites:
                self.err(path, f"{fid}: site_id '{sid}' is not a declared site")

        self.check_conflicts(path, entries)

    def check_conflicts(self, path, entries):
        # Concrete objects the mapping can address: the guide's page modules,
        # and each content type on each site a row could belong to.
        objects = [{"page_id": p, "site_id": s, "content_type": None}
                   for p, s in self.pages.items()]
        for stem in self.sheet_stems:
            for site in list(self.sites) + list(RESERVED_SITES):
                objects.append({"page_id": None, "site_id": site, "content_type": stem})

        def matches(entry, obj):
            for k in SELECTOR_KEYS:
                v = entry.get(k)
                if v and obj.get(k) != v:
                    return False
            # a page-scoped entry only addresses page objects; a type-scoped
            # entry only addresses row objects
            if entry.get("page_id") and obj["page_id"] is None:
                return False
            if entry.get("content_type") and obj["content_type"] is None:
                return False
            return True

        def specificity(entry):
            return sum(1 for k in SELECTOR_KEYS if entry.get(k))

        by_field = {}
        for e in entries:
            by_field.setdefault(e.get("field_id"), []).append(e)
        for fid, group in by_field.items():
            for i, a in enumerate(group):
                for b in group[i + 1:]:
                    if specificity(a) != specificity(b):
                        continue
                    if (a.get("cms_target"), a.get("transformation")) == \
                       (b.get("cms_target"), b.get("transformation")):
                        continue
                    for obj in objects:
                        if matches(a, obj) and matches(b, obj):
                            resolver = any(
                                matches(c, obj) and specificity(c) > specificity(a)
                                for c in group)
                            if not resolver:
                                desc = {k: obj[k] for k in SELECTOR_KEYS if obj[k]}
                                self.err(path,
                                         f"'{fid}': two equal-specificity mappings both apply to {desc} "
                                         "with different destinations; add one combined override naming "
                                         "the conflicting selectors together")
                            break


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    failed = False
    for arg in argv[1:]:
        root = Path(arg)
        if not root.is_dir():
            print(f"{arg}: not a directory")
            failed = True
            continue
        errors = Workbook(root).run()
        if errors:
            failed = True
            print(f"FAIL {root} — {len(errors)} problem(s):")
            for e in errors:
                print(f"  {e}")
        else:
            print(f"OK   {root}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
