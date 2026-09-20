// Speaking clock — DOM-stub harness.
// Extracts the inline <script> from pages/speaking-clock/index.html and
// exercises the quip logic + render loop against a stubbed DOM.
"use strict";

const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "pages", "speaking-clock", "index.html"),
  "utf8"
);

// ---- extract the inline script (between <script> and </script>) ----
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: no <script> block found in page"); process.exit(1); }
const src = m[1];

// ---- minimal DOM stubs ----
const elements = {};
function makeEl(id) {
  return {
    id,
    textContent: "",
    innerHTML: "",
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
    },
    querySelector() { return null; },
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
  };
}
["clock", "date", "quip", "zone"].forEach((id) => {
  elements[id] = makeEl(id);
});
// The served HTML carries the initial zone label inline; the stub doesn't
// parse static markup, so pre-seed what a browser would have.
elements.zone.textContent = "local time · your machine's clock, not mine";

// querySelectorAll(".tztoggle button") — three fake buttons.
const fakeButtons = ["local", "utc", "canary"].map((tz) => ({
  pressed: null,
  getAttribute(k) { return k === "data-tz" ? tz : null; },
  setAttribute(k, v) { if (k === "aria-pressed") this.pressed = v; },
  addEventListener() {},
}));

global.window = {
  matchMedia: () => ({ matches: false }),
};
global.document = {
  getElementById: (id) => elements[id] || null,
  querySelectorAll: () => fakeButtons,
};
global.performance = { now: () => 0 };

// setInterval would keep the process alive — freeze it and record.
const intervals = [];
global.setInterval = (fn) => { intervals.push(fn); };

// Run the page script once (it calls render() at the end).
const sandbox = { window: global.window, document: global.document,
                  performance: global.performance, setInterval: global.setInterval,
                  Intl, Date, Math, parseInt, String, Number };
const vm = require("vm");
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log(`ok   - ${name}`); }
  else { failures++; console.log(`FAIL - ${name}${extra ? " | " + extra : ""}`); }
}

// ---- checks ----
const quip = sandbox.window.__ckQuip;
check("quip hook exposed", typeof quip === "function");

// 1. Hour lines: every hour maps to a non-empty string, distinct per hour.
const hourLines = new Set();
let hoursOk = true;
for (let h = 0; h < 24; h++) {
  const q = quip(h, 0);
  if (typeof q !== "string" || !q.length) { hoursOk = false; break; }
  hourLines.add(q);
}
check("24 hour lines, all non-empty", hoursOk);
check("hour lines all distinct", hourLines.size === 24,
      `got ${hourLines.size}`);

// 2. Quarter logic: never a "past" line at quarter-to, never "to" at past.
const pastRe = /quarter past/i;
const toRe = /quarter to/i;
let quarterOk = true;
for (let h = 0; h < 24; h++) {
  const q15 = quip(h, 15);
  const q45 = quip(h, 45);
  if (!pastRe.test(q15) || !toRe.test(q45)) quarterOk = false;
}
check("quarter-past says 'past' at every hour; quarter-to says 'to'", quarterOk);

// 3. Halves say half-past at every hour, non-empty.
check("half-past line sane at every hour",
      [...Array(24)].every((_, h) => /half past/i.test(quip(h, 30))));

// 4. Idle minutes: every other minute returns a non-empty string.
let idleOk = true;
for (let h = 0; h < 24 && idleOk; h++) {
  for (let mi = 0; mi < 60; mi++) {
    if ([0, 15, 30, 45].includes(mi)) continue;
    const q = quip(h, mi);
    if (typeof q !== "string" || !q.length) { idleOk = false; break; }
  }
}
check("idle quips non-empty for all 24*60 minutes", idleOk);

// 5. Initial render populated the clock face.
const initialClock = elements.clock.innerHTML;
check("initial render wrote digits",
      /^\d{2}<span class="sep">:<\/span>\d{2}<span class="sep">:<\/span>\d{2}$/
        .test(initialClock),
      `got: ${initialClock}`);
check("initial render populated date line", elements.date.textContent.length > 0);
check("initial render populated quip", elements.quip.textContent.length > 0);
check("initial render left zone label populated",
      elements.zone.textContent.length > 0,
      "(static HTML carries it; stub pre-seeded below)");
check("initial quip is not the loading placeholder",
      elements.quip.textContent !== "Winding the mechanism. One moment.");

// 6. The page has no Jekyll frontmatter (one-pager rule).
check("no Jekyll frontmatter",
      !/^---/.test(fs.readFileSync(
        path.join(__dirname, "..", "pages", "speaking-clock", "index.html"),
        "utf8")));

// 7. Registration sanity (the thing past runs forgot).
const sitemap = fs.readFileSync(
  path.join(__dirname, "..", "sitemap.xml"), "utf8");
check("sitemap lists speaking-clock", sitemap.includes("/pages/speaking-clock/"));

const links = fs.readFileSync(
  path.join(__dirname, "..", ".github", "scripts", "check-links.sh"), "utf8");
check("check-links.sh knows the route", links.includes("/pages/speaking-clock/"));

const pagesIdx = fs.readFileSync(
  path.join(__dirname, "..", "pages", "index.html"), "utf8");
check("pages index links the clock", pagesIdx.includes('href="speaking-clock/"'));

const status = fs.readFileSync(
  path.join(__dirname, "..", "pages", "status", "index.html"), "utf8");
check("status ROUTES array includes clock",
      status.includes('"/pages/speaking-clock/"'));
check("status route table has a row for the clock",
      status.includes('data-path="/pages/speaking-clock/"'));

console.log(failures ? `\n${failures} FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);