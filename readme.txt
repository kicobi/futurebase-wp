=== Futurebase ===
Contributors: colinlewis
Tags: full-site-editing, block-patterns, block-styles, style-variations, wide-blocks, template-editing, one-column, accessibility-ready, custom-colors, custom-logo, featured-images, rtl-language-support, sticky-post, threaded-comments, translation-ready
Requires at least: 6.9
Tested up to: 6.9
Requires PHP: 8.3
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A modern Full Site Editing foundation for managed/VPS WordPress hosting and current local development stacks.

== Description ==

A Full Site Editing foundation built on top of them.es/starter-fse, tuned for modern WordPress (6.9+) and PHP 8.3+. Intended as a base for client projects on managed or VPS hosting, not as a broad shared-hosting compatibility base.

* Full Site Editing (block theme) with templates, template parts, and patterns
* `theme.json` v3 as the primary source of styling and configuration
* SCSS + `@wordpress/scripts` build pipeline for `assets/main.js` and `assets/main.scss`
* Ships with AI agent skills (`.claude/`, `.codex/`) and repo-level guardrails

== Installation ==

1. Generate a new repo from this GitHub template.
2. Clone into `wp-content/themes/<your-slug>/` or mount via `wp-env`.
3. Run `npm install` and `composer install`.
4. Follow the rename checklist in `README.md` before development.

== Changelog ==

= 2.0.0 =
* Rename the foundation to Futurebase and strengthen client promotion, synchronization, and identity verification.

= 1.0.2 =
* Tighten rename, scaffold, theme.json, and verification guardrails.

= 1.0.0 =
* Initial fork of them.es/starter-fse with modern-hosting baseline, PHP tooling, wp-env, and AI agent skills.
