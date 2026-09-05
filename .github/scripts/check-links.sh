#!/bin/sh
# check-links.sh — verify the live site: every internal href/src on the
# homepage must resolve to HTTP 200, known routes must exist, sitemap <loc>
# URLs must be live, and a bogus path must 404 (custom 404 page intact).
#
# POSIX sh; only dependency is curl. Runnable locally:
#   ./.github/scripts/check-links.sh
#
# Exits non-zero if any check fails. BASE_URL can be overridden:
#   BASE_URL=https://clive.kieranajp.uk ./.github/scripts/check-links.sh

set -u

BASE_URL=${BASE_URL:-"https://clive.kieranajp.uk"}
ORIGIN="${BASE_URL%/}"
HOME_PATH="/"
CURL="curl -sS --max-time 15"
fail=0

# ---- Known routes that must exist (AGENTS.md structure + Jekyll outputs) ----
KNOWN_ROUTES="
/
/now/
/writing/
/pages/
/pages/clive-terminal/
/pages/sinclair/
/pages/specimen/
/pages/cron-automation-map/
/feed.xml
/sitemap.xml
/robots.txt
/humans.txt
"

# ---- Output helpers -------------------------------------------------------
printf 'Link check for %s\n' "$ORIGIN"

# ---- Step 1: scrape href/src from the homepage, resolve against origin ----
scrape_homepage() {
    _sh_tmp=${TMPDIR:-/tmp}/clive-home.$$
    $CURL "$ORIGIN$HOME_PATH" >"$_sh_tmp" || { rm -f "$_sh_tmp"; return 1; }
    # Two passes so lines carrying both attributes yield both URLs.
    sed -n 's/.*href="\([^"]*\)".*/\1/p' "$_sh_tmp"
    sed -n 's/.*src="\([^"]*\)".*/\1/p' "$_sh_tmp"
    rm -f "$_sh_tmp"
}

# Resolve a scraped URL to an internal path; empty = skip (external/mail/etc).
resolve_path() {
    _rp_url=$1
    case $_rp_url in
        //*)  _rp_url="https:$_rp_url" ;;
        /*)   printf '%s' "$_rp_url" ;;
        http://*|https://*)
            case $_rp_url in
                "$ORIGIN"/*) printf '%s' "${_rp_url#"$ORIGIN"}" ;;
                "$ORIGIN")   printf '/' ;;
                *) printf '' ;;
            esac ;;
        '#'*|mailto:*|tel:*) printf '' ;;
        *) printf '' ;;
    esac
}

# ---- Step 2: build the URL list -------------------------------------------
# POSIX sh has no associative arrays; sort -u does the dedupe across sources.
build_urls() {
    _bu_tmp=${TMPDIR:-/tmp}/clive-links.$$
    : >"$_bu_tmp"

    # Homepage-scraped href/src, resolved against the site origin.
    for url in $(scrape_homepage); do
        path=$(resolve_path "$url")
        [ -n "$path" ] || continue
        printf '%s\n' "$path" >>"$_bu_tmp"
    done

    # Known routes (AGENTS.md structure) — added even if not scraped.
    for path in $KNOWN_ROUTES; do
        printf '%s\n' "$path" >>"$_bu_tmp"
    done

    # Sitemap <loc> URLs, stripped to paths so all checks hit this origin.
    $CURL "$ORIGIN/sitemap.xml" \
        | sed -n 's/.*<loc>\(.*\)<\/loc>.*/\1/p' \
        | while IFS= read -r loc; do
            path=$(resolve_path "$loc")
            [ -n "$path" ] || continue
            printf '%s\n' "$path" >>"$_bu_tmp"
        done

    # Dedupe across all three sources, in place; report the filename back.
    sort -u -o "$_bu_tmp" "$_bu_tmp"
    printf '%s\n' "$_bu_tmp"
}

tmpfile=$(build_urls)
trap 'rm -f "$tmpfile"' EXIT

# ---- Step 3: check each URL, print PASS/FAIL table -------------------------
printf '%-6s %-8s %s\n' 'STATUS' 'HTTP' 'URL'
printf '%s\n' '------ -------- ------------------------------'
checked=0
failed=0
while IFS= read -r path; do
    [ -n "$path" ] || continue
    checked=$((checked + 1))
    code=$($CURL -o /dev/null -w '%{http_code}' "$ORIGIN$path" 2>/dev/null)
    if [ "$code" = "200" ]; then
        printf '%-6s %-8s %s\n' PASS "$code" "$path"
    else
        printf '%-6s %-8s %s\n' FAIL "$code" "$path"
        failed=$((failed + 1))
        fail=1
    fi
done <"$tmpfile"

# ---- Step 4: bogus path must 404 (custom 404 page keeps working) -----------
checked=$((checked + 1))
probe_code=$($CURL -o /dev/null -w '%{http_code}' "$ORIGIN/ci-link-check-probe" 2>/dev/null)
if [ "$probe_code" = "404" ]; then
    printf '%-6s %-8s %s\n' PASS "$probe_code" "/ci-link-check-probe (must 404)"
else
    printf '%-6s %-8s %s\n' FAIL "$probe_code" "/ci-link-check-probe (must 404)"
    fail=1
fi

# ---- Result ----------------------------------------------------------------
if [ "$fail" -eq 0 ]; then
    printf 'OK: all link checks passed (%d URLs).\n' "$checked"
else
    printf 'FAILED: %d of %d link checks failed.\n' "$failed" "$checked" >&2
fi
exit "$fail"