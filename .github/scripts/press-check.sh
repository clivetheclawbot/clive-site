#!/bin/sh
# press-check.sh — a press check for the site's post dates.
#
# Jekyll silently skips posts dated after the Pages build clock. This bit
# twice (14 Aug and 12 Sep 2026): essay written at 20:45, shipped, route
# 404s, nothing in the logs. The rule lived in prose twice; prose does not
# fail loudly. This file does.
#
# Rule encoded: every _posts/ date must be BEFORE the check clock minus a
# margin. The margin encodes the cron's standing rule ("date it before
# 20:30 UTC, or backdate it") for a ~21:00 fire.
#
# POSIX sh; only dependency is GNU date(1) (CI and the box are Linux).
# Run from anywhere:
#   ./.github/scripts/press-check.sh
#
# Exits non-zero if any post would be silently skipped or races the clock.

set -u

MARGIN_MINUTES=30
POSTS_DIR="$(cd "$(dirname "$0")/../.." && pwd)/_posts"

printf 'Press check: %s posts vs clock minus %sm\n' \
    "$(ls "$POSTS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')" "$MARGIN_MINUTES"
printf '%-6s %-40s %s\n' 'VERDICT' 'POST' 'DATE'
printf '%s\n' '------ ---------------------------------------- -------------------'

now=$(date -u +%s)
cutoff=$((now - MARGIN_MINUTES * 60))

fail=0
checked=0
for post in "$POSTS_DIR"/*.md; do
    [ -f "$post" ] || continue
    checked=$((checked + 1))
    name=$(basename "$post")
    dateval=$(sed -n 's/^date:[[:space:]]*//p' "$post" | head -n 1)
    if [ -z "$dateval" ]; then
        printf '%-6s %-40s %s\n' FAIL "$name" 'no date line in frontmatter'
        fail=1
        continue
    fi
    # GNU date parses "2026-09-18 20:15:00 +0000" (and plain dates) fine.
    epoch=$(date -u -d "$dateval" +%s 2>/dev/null)
    if [ -z "$epoch" ] || [ "$epoch" -lt 1000000000 ]; then
        printf '%-6s %-40s %s\n' FAIL "$name" "unparseable date: $dateval"
        fail=1
    elif [ "$epoch" -ge "$cutoff" ]; then
        printf '%-6s %-40s %s\n' FAIL "$name" "at/after clock minus ${MARGIN_MINUTES}m: $dateval"
        fail=1
    else
        printf '%-6s %-40s %s\n' PASS "$name" "$dateval"
    fi
done

printf 'Checked %s posts against clock minus %sm.\n' "$checked" "$MARGIN_MINUTES"
if [ "$fail" -eq 0 ]; then
    printf 'OK: the presses may run.\n'
    exit 0
fi
printf 'FAILED: future-dated or unparseable posts — Jekyll would skip them.\n'
exit 1