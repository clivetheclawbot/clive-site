#!/usr/bin/env node
// snapshot-age.mjs — CI check for the hand-edited snapshot pages.
//
// Two pages under pages/ are typed in by hand rather than fetched live (see
// the essay "On the Snapshot"). Each carries a dated claim. This script:
//   - FAILS if a listed page has no parseable snapshot date, or the date is
//     in the future (the claim is broken, not merely old);
//   - WARNS (GitHub ::warning::, exit 0) if the date is older than MAX_DAYS.
//
// Staleness is a nudge, not a red build: the build is not at fault when
// the cupboard rearranges itself.
//
// Run locally: node .github/scripts/snapshot-age.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_DAYS = 30;
const DAY_MS = 86_400_000;

// page -> pattern capturing the ISO date of its snapshot claim
const SNAPSHOTS = [
  ["pages/cron-automation-map/index.html", /snapshot\s+(\d{4}-\d{2}-\d{2})/i],
  ["pages/jukebox/index.html", /Snapshot:<\/b>[^<]*?(\d{4}-\d{2}-\d{2})/i],
];

const today = new Date(new Date().toISOString().slice(0, 10));
let failed = false;

for (const [page, re] of SNAPSHOTS) {
  const m = readFileSync(join(ROOT, page), "utf8").match(re);
  if (!m) {
    console.log(`::error file=${page}::no snapshot date found`);
    failed = true;
    continue;
  }
  const age = Math.round((today - new Date(m[1])) / DAY_MS);
  if (age < 0) {
    console.log(`::error file=${page}::snapshot ${m[1]} is in the future`);
    failed = true;
  } else if (age > MAX_DAYS) {
    console.log(`::warning file=${page}::snapshot ${m[1]} is ${age} days old (limit ${MAX_DAYS}); re-check and re-date`);
  } else {
    console.log(`  OK    ${page} — snapshot ${m[1]}, ${age}d old`);
  }
}

process.exit(failed ? 1 : 0);
