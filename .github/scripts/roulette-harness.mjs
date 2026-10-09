#!/usr/bin/env node
// roulette-harness.mjs — DOM-stub verification of bar/roulette/index.html's script.
//
// Boots the page's own JS in a vm sandbox against the real bar/ files (the
// same bytes Pages serves), with a pinned fake clock, then asserts: the wheel
// renders and lands on the right slot, the pour card is byte-identical to
// what curl gets, minute rollovers advance wheel + ledger, the ledger caps,
// a dead shelf fails honestly, and the page keeps its structural disciplines.
//
// Run: node .github/scripts/roulette-harness.mjs   (exit 1 on any failure)

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pageSrc = readFileSync(join(ROOT, "bar", "roulette", "index.html"), "utf8");

const scriptMatch = pageSrc.match(/<script>\n([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error("no <script> block found in the page");
const script = scriptMatch[1];

/* ---- fake clock: pinned, advanceable, UTC-acting -------------------------- */
let fakeNow = Date.UTC(2026, 9, 4, 21, 39, 24, 0); // minute 1299 → wheel 08
class FakeDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(fakeNow);
    else super(args[0]);
  }
  getHours() { return this.getUTCHours(); }
  getMinutes() { return this.getUTCMinutes(); }
}
const advance = (ms) => { fakeNow += ms; };

/* ---- minimal DOM ------------------------------------------------------------ */
class MiniEl {
  constructor(id) {
    this.id = id;
    this._classes = new Set();
    this.textContent = "";
    this._innerHTML = "";
    this.attrs = new Map();
    this.style = {};
  }
  get classList() {
    const self = this;
    return {
      add: (c) => self._classes.add(c),
      remove: (c) => self._classes.delete(c),
      toggle: (c, force) => {
        const want = force === undefined ? !self._classes.has(c) : !!force;
        if (want) self._classes.add(c); else self._classes.delete(c);
        return want;
      },
      contains: (c) => self._classes.has(c),
    };
  }
  set innerHTML(html) { this._innerHTML = String(html); }
  get innerHTML() { return this._innerHTML; }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  setAttribute(k, v) { this.attrs.set(k, v); }
  get parentNode() { return { getBoundingClientRect: () => ({ width: 840 }) }; }
  get offsetWidth() { return 168; }
}

/* fresh environment per boot; returns {els, store, timers, fetchCalls, setFail} */
function makeEnv() {
  const slots = Array.from({ length: 23 }, (_, i) => new MiniEl("slot" + i));
  const track = {
    _classes: new Set(), style: {}, _innerHTML: "",
    parentNode: { getBoundingClientRect: () => ({ width: 840 }) },
    get children() { return slots; },
    set innerHTML(html) {
      this._innerHTML = String(html);
      if ((String(html).match(/class="wheel-slot"/g) || []).length !== 23) {
        throw new Error("track innerHTML must render 23 slots");
      }
    },
    get innerHTML() { return this._innerHTML; },
  };
  const els = new Map([
    ["#br-track", track],
    ["#br-verdict", new MiniEl("br-verdict")],
    ["#br-clocklocal", new MiniEl("br-clocklocal")],
    ["#br-nextpeer", new MiniEl("br-nextpeer")],
    ["#br-regulars", new MiniEl("br-regulars")],
    ["#br-card", new MiniEl("br-card")],
    ["#br-curl", new MiniEl("br-curl")],
    ["#br-poured", new MiniEl("br-poured")],
  ]);
  const store = new Map();
  const timers = [];
  const fetchCalls = [];
  let failFetch = false;
  const setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const fetch = async (url) => {
    fetchCalls.push(String(url));
    if (failFetch) throw new Error("shelf unreachable");
    const u = new URL(String(url));
    const name = u.pathname.replace(/^\/bar\//, "").replace(/^\//, "");
    return { ok: true, status: 200, text: async () => readFileSync(join(ROOT, "bar", name), "utf8") };
  };
  return {
    els, store, timers, fetchCalls,
    setFail: (v) => { failFetch = v; },
    env: {
      document: { querySelector: (sel) => els.get(sel) ?? null },
      fetch, setTimeout,
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
      },
      Date: FakeDate,
      console, Promise, URL, String, Number, JSON, Array, Math, Error,
      location: { href: "https://clive.kieranajp.uk/bar/roulette/" },
      window: { matchMedia: () => ({ matches: false }) },
    },
  };
}

/* microtask pump: let pending promise chains flush on the REAL event loop,
   then fire the vm's queued (stub) timers once per round. Stub timers are
   fired regardless of their nominal delay — the fake clock controls time. */
const realTick = () => new Promise((r) => setTimeout(r, 0));
async function settle(env) {
  for (let i = 0; i < 60; i++) {
    await realTick();
    env.timers.splice(0).forEach((t) => t.fn());
  }
}

/* ---- assert kit -------------------------------------------------------------- */
let pass = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) pass++;
  else failures.push(name + (detail ? ` — ${detail}` : ""));
}

const wheelOf = (t) => (t * 7) % 23;
const shelfCard = (slug) => readFileSync(join(ROOT, "bar", slug + ".txt"), "utf8");

/* ---- boot 1: healthy shelf, 21:39 UTC ---------------------------------------- */
const env1 = makeEnv();
vm.createContext(env1.env);
fakeNow = Date.UTC(2026, 9, 4, 21, 39, 24, 0); /* pin clock before/though the boot */
vm.runInContext(script, env1.env, { filename: "bar/roulette/index.html<script>" });
await settle(env1);

const track = env1.els.get("#br-track");
const kids = track.children;
const activeIdx = kids.findIndex((c) => c.classList.contains("active"));
const MANHATTAN_T = 21 * 60 + 39; /* 1299 — verified: (1299*7)%23 = 8 = Manhattan slot */

check("boot: wheel rendered 23 slots", kids.length === 23, `got ${kids.length}`);
check("boot: exactly one active slot", kids.filter((c) => c.classList.contains("active")).length === 1);
check("boot: active slot is minute 1299's wheel (08)", activeIdx === wheelOf(1299), `got ${activeIdx}`);
check("boot: verdict names Night Porter + Manhattan",
  /wheel <b>08<\/b>/.test(env1.els.get("#br-verdict").innerHTML) &&
  /The Night Porter<\/b> is drinking <b>Manhattan<\/b>/.test(env1.els.get("#br-verdict").innerHTML),
  env1.els.get("#br-verdict").innerHTML);

/* provenance: the pre IS the card */
check("provenance: pour card is byte-identical to the shelf card",
  env1.els.get("#br-card").textContent === shelfCard("manhattan"));
check("provenance: curl link targets the card route",
  env1.els.get("#br-curl").getAttribute("href") === "../manhattan.txt" &&
  env1.els.get("#br-curl").textContent === "curl https://clive.kieranajp.uk/bar/manhattan.txt");
check("provenance: 25 shelf fetches, all to /bar/",
  env1.fetchCalls.length === 25 && env1.fetchCalls.every((u) => u.startsWith("https://clive.kieranajp.uk/bar/")),
  `made ${env1.fetchCalls.length}`);
check("regulars: 7 rendered, minute 1299 lights The Night Porter (index 3)",
  (env1.els.get("#br-regulars").innerHTML.match(/<li/g) || []).length === 7 &&
  /class="active"[^>]*>The Night Porter</.test(env1.els.get("#br-regulars").innerHTML),
  env1.els.get("#br-regulars").innerHTML);
/* wheel 08 → next MINUTE 21:40 → wheel 15 = Rum Old Fashioned (slots aren't sequential) */
check("next-spin: readout shows wheel 15 → Rum Old Fashioned",
  /next spin: wheel 15, Rum Old Fashioned/.test(env1.els.get("#br-nextpeer").textContent),
  env1.els.get("#br-nextpeer").textContent);

/* ---- boot 2: rollovers — 21:40 then 21:41 ------------------------------------ */
const env2 = makeEnv();
vm.createContext(env2.env);
vm.runInContext(script, env2.env, { filename: "boot2" });
await settle(env2);

advance(36_000); // 21:39:24 → 21:40:00 — one pending timer fires into the new minute
await settle(env2);
const t1 = 21 * 60 + 40; /* 1280 → wheel (1280*7)%23 = 15 = rum-old-fashioned */
const led1 = JSON.parse(env2.store.get("br-poured-v1") || "[]");
check("rollover 21:40: wheel → 15, Rum Old Fashioned pours",
  env2.els.get("#br-track").children.findIndex((c) => c.classList.contains("active")) === wheelOf(t1) &&
  /Rum Old Fashioned/.test(env2.els.get("#br-verdict").innerHTML) &&
  env2.els.get("#br-card").textContent === shelfCard("rum-old-fashioned"),
  env2.els.get("#br-verdict").innerHTML);
check("rollover: ledger recorded minute 1280 rum-old-fashioned",
  led1.length === 1 && led1[0].m === t1 && led1[0].s === "rum-old-fashioned", JSON.stringify(led1));

advance(60_000); // → 21:41
await settle(env2);
const t2 = 21 * 60 + 41; /* 1281 → wheel 22 = highball */
const led2 = JSON.parse(env2.store.get("br-poured-v1") || "[]");
check("rollover 21:41: wheel → 22, ledger holds both minutes newest-first",
  env2.els.get("#br-track").children.findIndex((c) => c.classList.contains("active")) === wheelOf(t2) &&
  led2.length === 2 && led2[0].m === t2 && led2[0].s === "highball" && led2[1].m === t1,
  JSON.stringify(led2));

/* ledger cap: seed 8 stale rows, next rollover must keep exactly 8 */
env2.store.set("br-poured-v1", JSON.stringify(
  Array.from({ length: 8 }, (_, i) => ({ m: 900 - i, s: "daiquiri" }))
));
advance(60_000); // → 21:42
await settle(env2);
const led3 = JSON.parse(env2.store.get("br-poured-v1"));
check("ledger: capped at 8 rows after rollover", led3.length === 8, `got ${led3.length}`);
check("ledger: newest minute present after cap",
  led3[0].m === 21 * 60 + 42, JSON.stringify(led3[0]));

/* same-minute tick must not double-pour or double-log */
const ledBefore = env2.store.get("br-poured-v1");
advance(30_000); // still 21:42
await settle(env2);
check("same-minute tick: ledger untouched", env2.store.get("br-poured-v1") === ledBefore);

/* ---- boot 3: dead shelf — fail honestly --------------------------------------- */
const env3 = makeEnv();
env3.setFail(true);
vm.createContext(env3.env);
let threw = false;
try { vm.runInContext(script, env3.env, { filename: "boot3" }); } catch (e) { threw = true; }
check("dead shelf: boot does not crash the page", threw === false);
await settle(env3);
check("dead shelf: verdict says the shelf is out of reach",
  /out of reach/.test(env3.els.get("#br-verdict").textContent),
  env3.els.get("#br-verdict").textContent);
check("dead shelf: card pre explains and offers retry",
  /No shelf, no pour/.test(env3.els.get("#br-card").textContent));

/* ---- cross-machine: the page's wheel == the generator's wheel ------------------ */
const spin1299 = execFileSync("node", [join(ROOT, ".github/scripts/bar-generate.mjs"), "--spin", "1299"], { encoding: "utf8" });
check("agreement: generator CLI says wheel 08 Manhattan for t=1299",
  /wheel\s+08/.test(spin1299) && /The Manhattan/.test(spin1299), spin1299);

/* ---- page structure disciplines ------------------------------------------------- */
check("page: no Jekyll frontmatter", !pageSrc.startsWith("---"));
check("page: namespaced CSS only (--br-*)",
  !/--(jb|sp|gb|tw)-/.test(pageSrc.match(/<style>[\s\S]*?<\/style>/)[0].replace(/--br-/g, "")));
check("page: Jekyll template tags absent", !/\{\{|\{%/.test(pageSrc));
check("page: WHEEL_N locked at 23", /WHEEL_N\s*=\s*23/.test(pageSrc));
check("page: reduced-motion honoured", pageSrc.includes("prefers-reduced-motion"));
check("page: ledger is localStorage-only",
  pageSrc.includes("localStorage") && !/XMLHttpRequest|sendBeacon/.test(pageSrc));

console.log(`\nroulette-harness: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log("  FAIL  " + f);
process.exit(failures.length ? 1 : 0);