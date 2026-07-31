# Navigation-region migration v2

The starter now migrates navigation menus through a versioned, retry-bounded
routine in `inc/navigation-migration.php`. This change is intentionally not
copied into existing promoted projects by `wp-starter sync`: `functions.php`
and `inc/` are client-owned theme code. The sync report surfaces this guide as
a manual-port item instead.

## Why this needs a hand-port

The former one-shot seeder marked itself complete before inserting either
menu. It could also replace the menu that WordPress had been rendering with
starter About/Services/Blog links, leaving the client's older menu published
but orphaned.

Version 2:

- adopts the newest existing WordPress navigation post instead of inventing a
  primary menu;
- preserves the client's title and content when that is unambiguous;
- repairs the obsolete seeder state only when the generated seed is provably
  untouched;
- scans stored `core/navigation` references before choosing which post ID must
  survive;
- keeps the unused post as a recoverable draft;
- stops technical retries after three attempts and shows an administrator
  notice when human review is safer than an automatic write.

## Porting to an existing promoted project

Do this on staging first and take a database backup.

1. Port `inc/navigation-migration.php`, replacing the starter prefix
   `wp_starter_` and text domain `wp-starter` with the project's existing
   renamed values. Do not overwrite unrelated client code in `inc/`.
2. Remove the old `wp_starter_seed_navigation_menus()` implementation from the
   project's `functions.php`. Require the migrated file in its place:

   ```php
   require_once __DIR__ . '/inc/navigation-migration.php';
   ```

3. Load one administrator request, then inspect both Navigation screens in the
   Site Editor and the front end.
4. Confirm that `primary-navigation` and `footer-navigation` are distinct,
   published navigation posts and that each region renders the intended links.
5. If WordPress shows the migration notice, make no automated database edits.
   Choose the intended primary menu in the Site Editor, retain it under the
   `primary-navigation` slug, and save the unused candidate as a draft. The
   next administrator request performs a read-only completion check and clears
   the notice.

The migration state lives in the renamed equivalent of
`wp_starter_navigation_migration` and contains `version`, `status`, `attempts`,
and `last_error`. The obsolete `wp_starter_navigation_seeded` option is removed
only after both regions are valid.

## Reference-scan boundary

Before repairing the broken-seeder state, the migration parses stored block
content recursively with `parse_blocks()` and inspects numeric
`core/navigation` `ref` attributes in:

- database-backed `wp_template` and `wp_template_part` posts;
- reusable `wp_block` posts;
- published or private post types that support the editor, including custom
  post types.

File-based theme templates and parts are excluded because this starter's
patterns resolve navigation posts by slug at render time; they do not store a
numeric navigation ID.
