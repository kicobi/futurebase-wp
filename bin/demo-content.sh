#!/usr/bin/env bash
#
# bin/demo-content.sh — reset the active wp-env site and import demo content.
#
# DESTRUCTIVE: runs `wp site empty --uploads --yes` before importing, so every
# run converges to the same deterministic state (what makes the scorecard
# reproducible). Guards:
#   - requires --force unless $CI is set
#   - refuses any resolved URL that is not localhost (wp-env only)
#
# Usage:  npm run demo:import -- --force
#         bin/demo-content.sh --force

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE=0
for arg in "$@"; do
	case "$arg" in
		--force) FORCE=1 ;;
		*) echo "error: unknown argument: $arg" >&2; exit 2 ;;
	esac
done

if ! command -v npx > /dev/null 2>&1; then
	echo "error: npx not found on PATH" >&2
	exit 1
fi

wp() {
	npx --silent wp-env run cli wp "$@"
}

WP_URL=$(
	wp option get home --skip-themes --skip-plugins 2>/dev/null \
		| grep -oE '^https?://[^[:space:]]+$' \
		| head -1 \
		|| true
)
if [ -z "$WP_URL" ]; then
	echo "error: wp-env is not reachable; start it with 'npm run env:start'" >&2
	exit 1
fi
WP_URL="${WP_URL%/}"

# Parse the host with a real URL parser, not string surgery. The previous
# version stripped everything after the first colon, which reads the USERINFO
# field as the host: `http://localhost:pw@production.example` parsed as
# "localhost" and was accepted, while the documented `http://[::1]:8888` parsed
# as "[" and was refused. A guard in front of `wp site empty` has to be exact in
# both directions. Node is already required here (npx above), so use its parser.
host=$(
	printf "%s" "$WP_URL" | node -e '
		let s = "";
		process.stdin.on("data", (d) => (s += d));
		process.stdin.on("end", () => {
			try {
				// hostname (not host) drops the port and never includes userinfo.
				process.stdout.write(new URL(s.trim()).hostname);
			} catch {
				process.exit(1);
			}
		});
	' 2>/dev/null || true
)
case "$host" in
	# Bracketed form is what URL.hostname returns for IPv6 literals.
	localhost|127.0.0.1|'[::1]') ;;
	*)
		echo "error: refusing to wipe non-localhost site: $WP_URL (host: ${host:-unparseable})" >&2
		exit 3
		;;
esac

site_title=$(wp option get blogname 2>/dev/null | head -1 || true)
echo "target: $WP_URL ($site_title)"

if [ "$FORCE" -ne 1 ] && [ -z "${CI:-}" ]; then
	echo "error: this wipes all content on the site above. Re-run with --force." >&2
	exit 4
fi

# wp-env mounts the `"themes": [ "." ]` source at wp-content/themes/<repo-dir>
# but never activates it, so a fresh environment boots on core's bundled default
# theme. Activate explicitly — otherwise every path below resolves against the
# wrong theme directory. Idempotent, and survives `npm run rename`.
theme_slug="$(basename "$ROOT")"
echo "activating theme: $theme_slug ..."
if ! wp theme activate "$theme_slug" > /dev/null 2>&1; then
	echo "error: could not activate theme '$theme_slug'" >&2
	echo "       wp-env mounts this repo at wp-content/themes/$theme_slug" >&2
	exit 1
fi

theme_dir=$(
	wp eval 'echo get_stylesheet_directory();' 2>/dev/null \
		| grep -E '^/' \
		| head -1 \
		|| true
)
if [ -z "$theme_dir" ]; then
	echo "error: could not resolve the container-side theme directory" >&2
	exit 1
fi
helper="$theme_dir/fixtures/import-demo.php"

echo "emptying site ..."
wp site empty --uploads --yes

echo "importing demo content ..."
wp eval-file "$helper"

echo "demo content: OK ($WP_URL)"
