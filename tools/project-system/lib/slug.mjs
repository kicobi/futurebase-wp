// lib/slug.mjs — slug validation + derivation.
//
// The slug rule matches bin/rename-theme.sh exactly so a lead slug can become a
// theme slug at promotion without surprises:  ^[a-z][a-z0-9]*(-[a-z0-9]+)*$

export const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function isValidSlug(slug) {
	return typeof slug === 'string' && SLUG_RE.test(slug);
}

// Derive a candidate slug from a free-text client name.
// "GCD Sales, Florida!" -> "gcd-sales-florida"
export function slugify(name) {
	const slug = String(name)
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip combining diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-') // non-alnum -> dash
		.replace(/^-+|-+$/g, '') // trim dashes
		.replace(/-{2,}/g, '-'); // collapse runs
	return slug;
}
