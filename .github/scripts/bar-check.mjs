#!/usr/bin/env node
// bar-check.mjs — CI gate for the house bar.
//
// Asserts that everything the pub ships is derived from menu.txt and that
// the three copies of the wheel formula cannot disagree:
//   1. menu.txt parses; wheel is prime-locked at 23 drinks; 12 bottles; 7 sippers.
//   2. Every bottle pours at least one drink; every drink has a character line.
//   3. Committed bar/*.txt files are byte-identical to what bar-generate.mjs
//      produces from menu.txt right now (drift = red build).
//   4. The spin formula `(t * 7) % 23` appears verbatim in menu.txt, the
//      generator, and bar/roulette/index.html; the page fetches the shelf
//      files rather than baking in copies; no extensionless bar/roulette twin.
//   5. The bar and the jukebox are the same room: bottle slugs match the
//      jukebox inventory, and every drink on the wheel is playable from some
//      bottle on the jukebox.
//
// Run locally: node .github/scripts/bar-check.mjs   (exit 1 on any failure)

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

/* ---- 1. parse the menu ---------------------------------------------------- */
const { parseMenu, WHEEL_MODULUS } = await import("./bar-generate.mjs");
const menuSrc = read("menu.txt");
const menu = parseMenu(menuSrc);

check("wheel prime-lock: exactly 23 drinks", menu.drinks.length === WHEEL_MODULUS, `menu has ${menu.drinks.length}`);
check("cabinet: 12 bottles", menu.bottles.size === 12, `menu has ${menu.bottles.size}`);
check("7 named regulars", menu.sippers.length === 7, `menu has ${menu.sippers.length}`);
check("sippers include the Cellar Guest (Edele)", menu.sippers.includes("The Cellar Guest"));

const jbIds = new Set([...menu.bottles.values()].map((b) => b.jb));
check(`JB-NNN ids unique (${jbIds.size})`, jbIds.size === menu.bottles.size);

/* ---- 2. structural sanity -------------------------------------------------- */
const pouring = new Set(menu.drinks.flatMap((d) => d.recipes.map((r) => r.bottle)));
const idle = [...menu.bottles.keys()].filter((s) => !pouring.has(s));
check("every bottle pours at least one drink", idle.length === 0, `idle: ${idle.join(", ")}`);
check("every drink has a character line", menu.drinks.every((d) => typeof d.line === "string"), menu.drinks.filter((d) => d.line == null).map((d) => d.slug).join(", "));
check("every drink pours from at least one bottle", menu.drinks.every((d) => d.recipes.length > 0));
check("celar pours marked cellar", menu.drinks.flatMap((d) => d.recipes).every((r) => ["house", "cellar"].includes(menu.bottles.get(r.bottle).where)));

/* wheel covers every slot; a lap is exactly 23 minutes */
const lap = new Set(Array.from({ length: WHEEL_MODULUS }, (_, t) => (t * 7) % WHEEL_MODULUS));
check("wheel lap covers all 23 slots in 23 minutes", lap.size === WHEEL_MODULUS, `covered ${lap.size}`);

/* ---- 3. committed bar/ matches the generator ------------------------------- */
const { renderIndex, renderCard, renderSlugList, renderRoulette } = await import("./bar-generate.mjs");
const generated = new Map([["menu.txt", renderIndex(menu)], ["drinks.txt", renderSlugList(menu)], ["roulette.txt", renderRoulette(menu)]]);
for (const d of menu.drinks) generated.set(`${d.slug}.txt`, renderCard(menu, d));

for (const [name, want] of generated) {
  const p = join("bar", name);
  let have = null;
  try { have = read(p); } catch { /* missing */ }
  if (name === "roulette.txt") {
    // The couplet tail ("Right now (to the minute this file was built)")
    // bakes the build clock into an otherwise deterministic render, so a
    // byte-compare against a fresh render only passes in the minute the
    // file was written (Oct-4's CI pass was that coincidence; every later
    // run drifted). Compare everything UP TO the couplet byte-for-byte,
    // then verify the committed couplet obeys the wheel rule on its own.
    const COUPLET = /\nRight now \(to the minute this file was built\): minute (\d+) →\nwheel (\d{2}), so (.+?) is drinking (.+?)\.\n?$/;
    check(`bar/${name} freshly rendered head still has a couplet`, COUPLET.test(want), "generator's couplet regex never matches — harness rot");
    const trimEnd = (s) => s.replace(/\n+$/, "");
    const haveHead = have == null ? "" : trimEnd(have.replace(COUPLET, ""));
    const wantHead = trimEnd(want.replace(COUPLET, ""));
    check(`bar/${name} (head) matches generator`, haveHead === wantHead, have == null ? "missing" : "drifted");
    const m = have && have.match(COUPLET);
    if (!m) {
      check(`bar/${name} couplet present + wheel-true`, false, have == null ? "missing" : "couplet not found in committed file");
    } else {
      const minute = Number(m[1]);
      const wheel = Number(m[2]);
      const sipper = m[3].trim();
      const pour = m[4].trim();
      const inRange = Number.isInteger(minute) && minute >= 0 && minute <= 1439;
      const spin = inRange ? (minute * 7) % WHEEL_MODULUS : -1;
      const spinOk = inRange && wheel === spin;
      const sipperOk = inRange && menu.sippers[minute % menu.sippers.length] === sipper;
      const pourOk = inRange && menu.drinks[spin]?.name === pour;
      check("bar/roulette.txt couplet obeys the wheel rule", spinOk && sipperOk && pourOk, !inRange ? `minute ${m[1]} out of range` : `spin says wheel ${String(spin).padStart(2, "0")} → ${menu.drinks[spin]?.name} / ${menu.sippers[minute % menu.sippers.length]}, file says wheel ${m[2]} → ${pour} / ${sipper}`);
    }
  } else {
    check(`bar/${name} matches generator`, have === want + "\n", have == null ? "missing" : "drifted");
  }
}

const expectedFiles = new Set([...generated.keys(), "sippers.txt"]);
const actualFiles = (function () {
  const out = [];
  for (const f of generated.keys()) if (f.endsWith(".txt")) out.push(f);
  out.push("sippers.txt");
  return out;
})();
let extras = null;
try {
  const { readdirSync } = await import("node:fs");
  extras = readdirSync(join(ROOT, "bar")).filter((f) => f.endsWith(".txt") && !expectedFiles.has(f));
} catch { /* no dir */ }
check("no orphaned cards in bar/", !extras || extras.length === 0, extras && extras.join(", "));

/* ---- 4. the formula, in all three homes ------------------------------------ */
const SPIN = "(t * 7) % 23";
check("formula verbatim in menu.txt", menuSrc.includes(SPIN));
const genSrc = read(".github/scripts/bar-generate.mjs");
check("formula verbatim in bar-generate.mjs", genSrc.includes(SPIN));
const pageSrc = read("bar/roulette/index.html");
check("formula verbatim in bar/roulette/index.html", pageSrc.includes(SPIN));

check("roulette page fetches drinks.txt (no baked copy)", pageSrc.includes("drinks.txt"));
check("roulette page fetches sippers.txt", pageSrc.includes("sippers.txt"));
check("roulette page locks WHEEL_N at 23", /WHEEL_N\s*=\s*23/.test(pageSrc));
check("roulette page computes pour in browser", pageSrc.includes("(t * 7) % WHEEL_N"));
check("no extensionless bar/roulette twin", !existsSync(join(ROOT, "bar", "roulette")) || !statSync(join(ROOT, "bar", "roulette")).isFile());

/* cards point back at honest routes */
check("cards advertise /bar/menu.txt", generated.get("old-fashioned.txt").includes("https://clive.kieranajp.uk/bar/menu.txt"));
check("cards advertise /bar/roulette.txt", generated.get("old-fashioned.txt").includes("https://clive.kieranajp.uk/bar/roulette.txt"));

/* ---- 5. same pub: bar ↔ jukebox -------------------------------------------- */
const jbSrc = read("pages/jukebox/index.html");
const jbSlugs = [...jbSrc.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
const jbSet = new Set(jbSlugs);
const missingBottles = [...menu.bottles.keys()].filter((s) => !jbSet.has(s));
check(`every bar bottle is a jukebox record (${jbSet.size} records)`, missingBottles.length === 0, `not on jukebox: ${missingBottles.join(", ")}`);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const jbTracks = [...jbSrc.matchAll(/name:\s*"([^"]+)",\s*ratio:/g)].map((m) => norm(m[1]).replace(/^the/, ""));
const unplayable = menu.drinks.filter((d) => {
  const n = norm(d.name).replace(/^the/, "");
  return !jbTracks.some((t) => t.includes(n) || n.includes(t));
});
check("every drink on the wheel is playable from the jukebox shelf", unplayable.length === 0, unplayable.map((d) => d.name).join(", "));

/* the jukebox's reserved slugs must all now resolve on the bar */
const reserved = [...jbSrc.matchAll(/\/bar\/([a-z0-9-]+)/g)].map((m) => m[1]);
const unresolved = reserved.filter((s) => !generated.has(`${s}.txt`));
check("jukebox's reserved /bar/ slugs all resolve", unresolved.length === 0, unresolved.join(", "));

/* ---- house etiquette -------------------------------------------------------- */
const barTexts = menuSrc + genSrc + pageSrc;
check("no cross-references to other households' repos", !/bluer[- ]?book/i.test(barTexts));

console.log(`\nbar-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);