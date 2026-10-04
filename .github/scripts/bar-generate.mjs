#!/usr/bin/env node
// bar-generate.mjs — render the house bar from menu.txt (single source of truth).
//
//   node bar-generate.mjs                 parse menu, write bar/*.txt, verify
//   node bar-generate.mjs --spin t        print the spin answer for minute t (0..1439)
//
// Derived, never hand-typed: bar/menu.txt (index), bar/drinks.txt (bare slug
// list), bar/<slug>.txt (drink cards) and bar/roulette.txt (the committed
// wheel) are all generated from menu.txt. bar-check.mjs fails CI when the
// committed files drift from the menu (run `node bar-generate.mjs` locally,
// `git diff --exit-code bar/` shows the same truth).
//
// The wheel turns once a minute, the same for everyone on earth:
//   t = hours*60 + minutes of the current UTC minute (0..1439)
//   n = (t * 7) % 23   -> the n-th drink in menu order pours
// 23 drinks and the multiplier 7 are coprime, so every minute of the day
// hits a different rotation and a full lap takes 23 minutes. The literal
// `(t * 7) % 23` must appear verbatim in menu.txt, this script, and
// bar/roulette/index.html — bar-check.mjs greps all three.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SPIN_EXPR = "(t * 7) % 23";
export const WHEEL_MODULUS = 23; // drinks must not exceed this without a new wheel

/* ------------------------------------------------------------------ *
 * Parse menu.txt
 * ------------------------------------------------------------------ */

export function parseMenu(text) {
  const bottles = new Map(); // slug -> {slug,name,abv,where,jb}
  const drinks = [];         // {slug,name,build,glass,serve,line,recipes:[]}
  const sippers = [];        // rotation of named regulars
  let section = null;
  let drink = null;

  const unquote = (s) => (/^".*"$/s.test(s) ? s.slice(1, -1) : s).replace(/\\"/g, '"');
  const tokens = (s) => (s.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? []).map(unquote);

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim()) continue;
    if (section !== "DRINKS" && line.trimStart().startsWith("#")) continue;

    if (/^(INVENTORY|DRINKS|ROULETTE)\s*$/.test(line.trim())) {
      section = line.trim();
      continue;
    }

    if (section === "INVENTORY") {
      const t = tokens(line);
      if (t.length !== 6 || t[0] !== "bottle" || !/^\d+(\.\d+)?$/.test(t[3]) || !["house", "cellar"].includes(t[4]) || !/^JB-\d{3}$/.test(t[5])) {
        throw new Error(`menu.txt INVENTORY: bad bottle line (want: bottle slug "Name" ABV house|cellar JB-NNN): ${line.trim()}`);
      }
      bottles.set(t[1], {
        slug: t[1],
        name: t[2],
        abv: Number(t[3]),
        where: t[4],
        jb: t[5],
      });
    } else if (section === "DRINKS") {
      const indented = /^[ \t]/.test(raw);
      if (line.trimStart().startsWith("#") && !indented) continue; // section comment
      if (!indented) {
        const t = tokens(line);
        if (t.length !== 6 || t[0] !== "drink") {
          throw new Error(`menu.txt DRINKS: bad drink line (want: drink slug "Name" build glass "serve"): ${line.trim()}`);
        }
        drink = {
          slug: t[1],
          name: t[2],
          build: t[3],
          glass: t[4],
          serve: t[5],
          line: null,
          recipes: [],
        };
        drinks.push(drink);
      } else {
        const t = line.trim();
        if (!drink) throw new Error(`menu.txt DRINKS: continuation before any drink: ${line.trim()}`);
        let m;
        if ((m = t.match(/^#\s+(.*)$/))) {
          if (drink.line !== null) throw new Error(`menu.txt DRINKS: ${drink.slug} has two # character lines`);
          drink.line = m[1];
        } else if ((m = t.match(/^recipe\s+(\S+)\s+(.+)$/))) {
          if (!bottles.has(m[1])) throw new Error(`menu.txt DRINKS: ${drink.slug} recipe references unknown bottle ${m[1]}`);
          drink.recipes.push({ bottle: m[1], line: m[2] });
        } else if ((m = t.match(/^note\s+(.+)$/))) {
          if (!drink.recipes.length) throw new Error(`menu.txt DRINKS: note before any recipe in ${drink.slug}`);
          drink.recipes[drink.recipes.length - 1].note = m[1];
        } else {
          throw new Error(`menu.txt DRINKS: bad continuation under ${drink.slug}: ${line.trim()}`);
        }
      }
    } else if (section === "ROULETTE") {
      const m = line.trim().match(/^sipper\s+"((?:[^"\\]|\\.)*)"\s*$/);
      if (m) sippers.push(unquote(m[1]));
    }
    // ROULETTE comment lines elsewhere are documentation (skipped above).
  }

  if (bottles.size === 0) throw new Error("menu.txt: no bottles parsed");
  if (drinks.length === 0) throw new Error("menu.txt: no drinks parsed");
  if (sippers.length === 0) throw new Error("menu.txt: no sippers parsed in ROULETTE");
  return { bottles, drinks, sippers };
}

/* ------------------------------------------------------------------ *
 * The spin — minute-grained, deterministic, identical for everyone.
 * ------------------------------------------------------------------ */

export function spinOfMinute(t, drinks, sippers) {
  if (!Number.isInteger(t) || t < 0 || t > 1439) throw new Error(`minute out of range: ${t}`);
  const n = (t * 7) % WHEEL_MODULUS;
  const drink = drinks[n];
  if (!drink) throw new Error(`wheel ${n} has no drink — menu has ${drinks.length} drinks`);
  return { sipper: sippers[t % sippers.length], n, drink };
}

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

const wrapWidth = 64;
export function wrap(text, indent = "") {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  const width = wrapWidth - indent.length;
  for (const w of words) {
    if (cur && (cur + " " + w).length > width) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines.map((l) => (indent ? indent + l : l)).join("\n");
}

const center = (s, width = 60) => " ".repeat(Math.max(0, Math.floor((width - s.length) / 2))) + s;

/* ------------------------------------------------------------------ *
 * Drink cards (bar/<slug>.txt)
 * ------------------------------------------------------------------ */

export function renderCard(menu, drink) {
  const { bottles } = menu;
  const d = typeof drink === "string" ? menu.drinks.find((x) => x.slug === drink) : drink;
  if (!d) throw new Error(`no drink ${drink}`);
  const L = [];
  L.push(center("THE HOUSE BAR"));
  L.push(center("clive.kieranajp.uk"));
  L.push("");
  L.push("DRINK CARD");
  L.push("");
  L.push(d.name);
  L.push("");
  L.push(wrap(`build: ${d.build === "build" ? "build in the glass" : d.build}${d.glass ? `, ${d.glass}` : ""}.`));
  L.push(wrap(`serve: ${d.serve}.`));

  const block = (r, bottle) => {
    const out = [];
    out.push(wrap(r.line, "  -- "));
    if (r.note) out.push(wrap(`(${r.note})`, "  "));
    if (bottle.where === "cellar") out.push(wrap(`(poured from Edele's cellar: ${bottle.name})`, "  "));
    return out.join("\n");
  };
  const pours = d.recipes.map((r) => ({ ...r, b: bottles.get(r.bottle) }));
  const house = pours.filter((r) => r.b.where === "house");
  const cellar = pours.filter((r) => r.b.where !== "house");

  if (house.length && cellar.length) {
    L.push("");
    L.push(wrap(`House pour (${house[0].b.name}):`));
    L.push(block(house[0], house[0].b));
    if (house.length > 1) {
      L.push("");
      L.push("Variants on the shelf:");
      for (const r of house.slice(1)) L.push(block(r, r.b));
    }
    L.push("");
    L.push(wrap(`Also from Edele's cellar (${cellar[0].b.name}):`));
    L.push(block(cellar[0], cellar[0].b));
    if (cellar.length > 1) {
      L.push("");
      L.push("Cellar variants:");
      for (const r of cellar.slice(1)) L.push(block(r, r.b));
    }
  } else if (house.length === 1) {
    L.push("");
    L.push(block(house[0], house[0].b));
  } else if (house.length > 1) {
    L.push("");
    L.push(wrap(`House pour (${house[0].b.name}):`));
    L.push(block(house[0], house[0].b));
    L.push("");
    L.push("Variants on the shelf:");
    for (const r of house.slice(1)) L.push(block(r, r.b));
  } else if (cellar.length === 1) {
    L.push("");
    L.push(wrap(`Cellar pour (${cellar[0].b.name}):`));
    L.push(block(cellar[0], cellar[0].b));
  } else if (cellar.length > 1) {
    L.push("");
    L.push(wrap(`Cellar pour (${cellar[0].b.name}):`));
    L.push(block(cellar[0], cellar[0].b));
    L.push("");
    L.push("Cellar variants:");
    for (const r of cellar.slice(1)) L.push(block(r, r.b));
  }

  L.push("");
  L.push(wrap(d.line ?? "", "  "));
  L.push("");
  L.push(wrap("The house bar pours from the actual cabinet. If the shelf says otherwise, the shelf wins — refresh this card.", "  "));
  L.push("");
  L.push(wrap("Menu:     curl https://clive.kieranajp.uk/bar/menu.txt", "  "));
  L.push(wrap("Roulette: curl https://clive.kieranajp.uk/bar/roulette.txt", "  "));
  L.push("");
  return L.join("\n");
}

/* ------------------------------------------------------------------ *
 * The bar index (bar/menu.txt) and slug list (bar/drinks.txt)
 * ------------------------------------------------------------------ */

export function renderIndex(menu) {
  const { bottles, drinks } = menu;
  const L = [];
  L.push("THE HOUSE BAR — MENU");
  L.push("clive.kieranajp.uk");
  L.push("");
  L.push("The bar pours from the actual cabinet (October 2026, ABVs as");
  L.push("labelled). The jukebox plays bottles; this is the same pub, the");
  L.push("other side of it — bottle to cocktail, not cocktail to bottle.");
  L.push("");
  L.push("ON THE SHELF");
  for (const b of bottles.values()) {
    const where = b.where === "cellar" ? "  (Edele's cellar)" : "";
    L.push(`  ${b.jb}  ${b.name.padEnd(30)} ${b.abv.toFixed(1)}% ABV${where}`);
  }
  L.push("");
  L.push("COCKTAILS");
  for (const d of drinks) {
    const house = d.recipes.find((r) => bottles.get(r.bottle)?.where === "house");
    const b = bottles.get((house ?? d.recipes[0]).bottle);
    const pour = b.where === "cellar" ? `cellar pour: ${b.name}` : `house pour: ${b.name}`;
    L.push(`  /bar/${d.slug.padEnd(24)} ${d.name}  (${pour})`);
  }
  L.push("");
  L.push("ROULETTE");
  L.push("  /bar/roulette.txt    the wheel turns once a minute, the same for");
  L.push("                       everyone — order by the clock, not the mood.");
  L.push("");
  L.push("House rule: curl it, don't sip it.");
  return L.join("\n");
}

export function renderSlugList(menu) {
  return menu.drinks.map((d) => d.slug).join("\n");
}

/* ------------------------------------------------------------------ *
 * The committed wheel (bar/roulette.txt) — static and honest: a static
 * shelf cannot serve the current minute, so it serves the rule and the
 * full rotation instead, plus a one-liner that computes the pour.
 * ------------------------------------------------------------------ */

export function renderRoulette(menu) {
  const { drinks, sippers } = menu;
  const firstWheelLine = 19; // the line number (1-based) of wheel slot 00 in this file
  const exampleT = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes()) % 1440;
  const ex = spinOfMinute(exampleT, drinks, sippers);
  const L = [];
  L.push("THE HOUSE BAR — ROULETTE");
  L.push("clive.kieranajp.uk");
  L.push("");
  L.push("The wheel turns once a minute, and the same minute pours the");
  L.push("same drink for everyone on earth. Order by the clock, not the");
  L.push("mood.");
  L.push("");
  L.push("RULE");
  L.push(`  t = hours*60 + minutes, of the current UTC minute (0..1439)`);
  L.push(`  n = ${SPIN_EXPR}          the n-th drink below, 0-based`);
  L.push("  sipper = the t-th regular below, cycling");
  L.push("");
  L.push("ONE-LINER (the shelf computing its own pour)");
  L.push(`  h=$(date -u +%H); m=$(date -u +%M); n=$(( (10#$h*60 + 10#$m) * 7 % 23 )); \\`);
  L.push(`  curl -s https://clive.kieranajp.uk/bar/drinks.txt | sed -n "$((n+1))p"`);
  L.push(`  # then: curl https://clive.kieranajp.uk/bar/<slug>.txt`);
  L.push("");
  L.push("THE WHEEL (drink n for wheel slot n, menu order)");
  for (let i = 0; i < drinks.length; i++) {
    L.push(`  ${String(i).padStart(2, "0")}  ${drinks[i].name.padEnd(24)} /bar/${drinks[i].slug}.txt`);
  }
  L.push("");
  L.push("THE REGULARS (sipper for minute t, cycling)");
  for (let i = 0; i < sippers.length; i++) {
    L.push(`  ${String(i).padStart(2, "0")}  ${sippers[i]}`);
  }
  L.push("");
  L.push("A static shelf cannot read the room's clock, so this file will");
  L.push("not pretend to: it commits the rule and the rotation instead.");
  L.push("The page at /bar/roulette/ runs the same rule live in your");
  L.push("browser; this text is what curl gets, honestly.");
  L.push("");
  L.push(`Right now (to the minute this file was built): minute ${exampleT} →`);
  L.push(`wheel ${String(ex.n).padStart(2, "0")}, so ${ex.sipper} is drinking ${ex.drink.name}.`);
  return L.join("\n");
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);

if (argv.includes("--spin")) {
  const t = Number(argv[argv.indexOf("--spin") + 1]);
  const menu = parseMenu(readFileSync(join(ROOT, "menu.txt"), "utf8"));
  if (menu.drinks.length !== WHEEL_MODULUS) {
    throw new Error(`wheel is prime-locked at ${WHEEL_MODULUS}: menu has ${menu.drinks.length} drinks`);
  }
  const { sipper, n, drink } = spinOfMinute(t, menu.drinks, menu.sippers);
  console.log(`sipper  ${sipper}`);
  console.log(`wheel   ${String(n).padStart(2, "0")}`);
  console.log(`pour    ${drink.name}`);
  console.log(`card    https://clive.kieranajp.uk/bar/${drink.slug}.txt`);
  process.exit(0);
}

const menu = parseMenu(readFileSync(join(ROOT, "menu.txt"), "utf8"));
if (menu.drinks.length !== WHEEL_MODULUS) {
  throw new Error(`wheel is prime-locked at ${WHEEL_MODULUS}: menu has ${menu.drinks.length} drinks`);
}

const barDir = join(ROOT, "bar");
mkdirSync(barDir, { recursive: true });
writeFileSync(join(barDir, "roulette.txt"), renderRoulette(menu) + "\n");
writeFileSync(join(barDir, "menu.txt"), renderIndex(menu) + "\n");
writeFileSync(join(barDir, "drinks.txt"), renderSlugList(menu) + "\n");
for (const d of menu.drinks) {
  writeFileSync(join(barDir, `${d.slug}.txt`), renderCard(menu, d) + "\n");
}

const expected = new Set(["menu.txt", "drinks.txt", "roulette.txt", ...menu.drinks.map((d) => `${d.slug}.txt`)]);
const stale = readdirSync(barDir).filter((f) => f.endsWith(".txt") && !expected.has(f));
if (stale.length) throw new Error(`bar/ has orphaned cards not on the menu: ${stale.join(", ")}`);

console.log(`bar-generate: roulette.txt, menu.txt, drinks.txt + ${menu.drinks.length} cards from ${menu.bottles.size} bottles, ${menu.sippers.length} sippers`);