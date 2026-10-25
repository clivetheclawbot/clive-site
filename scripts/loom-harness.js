// loom-harness.js — DOM-stub verification for /pages/loom/
// Extracts the page's inline <script> IIFE, runs it against stub
// canvas/DOM/fetch objects, and asserts on what the weaver produces.
//
//   node scripts/loom-harness.js
//
// Exits non-zero on any failure. No dependencies.

"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(ROOT, "pages", "loom", "index.html"), "utf8");

/* ── extract the inline script (the last <script> block) ─────── */
const blocks = page.match(/<script>([\s\S]*?)<\/script>/g);
if (!blocks || !blocks.length) { console.error("FAIL: no <script> block found"); process.exit(1); }
const lastBlock = blocks[blocks.length - 1];
const src = lastBlock.replace(/^<script>/, "").replace(/<\/script>$/, "");
if (src.indexOf("__loomTest") === -1) { console.error("FAIL: extracted wrong script block"); process.exit(1); }

/* ── stub 2D context: records every op ───────────────────────── */
function makeCtx() {
  const ops = [];
  const ctx = {
    ops,
    fillRect(x, y, w, h) { ops.push(["fillRect", x, y, w, h, ctx.fillStyle]); },
    setTransform() { ops.push(["setTransform"]); },
    clearRect() { ops.push(["clearRect"]); },
    drawImage() { ops.push(["fillStyle", "drawImage"]); ops.push(["drawImage"]); },
  };
  Object.defineProperty(ctx, "fillStyle", {
    get() { return ctx._fs; },
    set(v) { ctx._fs = v; ops.push(["fillStyle", v]); },
  });
  return ctx;
}

/* ── stub canvas ─────────────────────────────────────────────── */
function makeCanvas() {
  return {
    width: 300, height: 150,
    clickHandlers: [],
    addEventListener(type, fn) { this.clickHandlers.push(fn); },
    getContext() { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; },
  };
}

/* ── build a sandbox ─────────────────────────────────────────── */
function buildSandbox(opts) {
  const els = {};
  ["lm-main", "lm-warpstrip", "lm-picks", "lm-dye-pill", "lm-yarn-count", "lm-reweave"]
    .forEach((id) => {
      const el = makeCanvas();
      el.id = id;
      el.innerHTML = "";
      el.textContent = "";
      els[id] = el;
    });

  const ties = ["tabby", "twill", "herringbone", "basket"];
  const samples = ties.map((t) => {
    const c = makeCanvas();
    c.getAttribute = (a) => (a === "data-tieup" ? t : null);
    return c;
  });

  const btns = ties.map((t) => {
    const pressed = [];
    return {
      tieup: t,
      pressed,
      getAttribute(a) { return a === "data-tieup" ? t : null; },
      setAttribute(a, v) { if (a === "aria-pressed") pressed.push(v); },
      clickHandlers: [],
      addEventListener(type, fn) { this.clickHandlers.push(fn); },
    };
  });

  /* write-your-own-draft form: input, select, go button, error line */
  function makeField(id, value) {
    const el = {
      id, value, textContent: "", attrs: {}, handlers: {},
      getAttribute(a) { return a in el.attrs ? el.attrs[a] : null; },
      setAttribute(a, v) { el.attrs[a] = String(v); },
      addEventListener(type, fn) { (el.handlers[type] = el.handlers[type] || []).push(fn); },
      fire(type) { (el.handlers[type] || []).forEach((fn) => fn({ preventDefault() { el.prevented = true; } })); },
    };
    return el;
  }
  els["lm-draftform"] = makeField("lm-draftform");
  els["lm-draft-pattern"] = makeField("lm-draft-pattern", "1100");
  els["lm-draft-shift"] = makeField("lm-draft-shift", "1");
  els["lm-draft-go"] = makeField("lm-draft-go");
  els["lm-draft-err"] = makeField("lm-draft-err");

  const createdCanvases = [];
  const doc = {
    readyState: "complete",
    documentElement: { getAttribute: () => (opts.theme === undefined ? null : opts.theme) },
    getElementById: (id) => els[id] || null,
    querySelectorAll(sel) {
      if (sel === "canvas.lm-sample") return samples;
      if (sel === ".lm-controls [data-tieup]") return btns;
      return [];
    },
    createElement: () => { const c = makeCanvas(); createdCanvases.push(c); return c; },
    addEventListener: () => {},
  };

  const rafQueue = [];
  const timeoutQueue = [];
  const sandbox = {
    document: doc,
    createdCanvases,
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    setTimeout: (fn) => { timeoutQueue.push(fn); return timeoutQueue.length; },
    console,
  };
  sandbox.window = sandbox;
  /* location + history stubs: replaceState rewrites the hash like a browser */
  sandbox.location = { pathname: "/pages/loom/", search: "", hash: opts.hash || "" };
  sandbox.history = {
    calls: [],
    replaceState(st, t, url) {
      sandbox.history.calls.push(url);
      const i = url.indexOf("#");
      sandbox.location.hash = i === -1 ? "" : url.slice(i);
    },
  };
  sandbox.hashHandlers = [];
  sandbox.addEventListener = (type, fn) => { if (type === "hashchange") sandbox.hashHandlers.push(fn); };

  let fetchCalls = 0;
  sandbox.fetch = (url, o) => {
    fetchCalls++;
    sandbox.fetchUrl = url;
    sandbox.fetchOpts = o;
    if (opts.fetchMode === "live") {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(opts.fetchHtml || "") });
    }
    return Promise.reject(new Error("HTTP 500"));
  };
  sandbox.fetchCalls = () => fetchCalls;
  sandbox.rafQueue = rafQueue;
  sandbox.timeoutQueue = timeoutQueue;
  /* pump one rAF frame at time t */
  sandbox.pumpFrame = (t) => {
    const q = rafQueue.splice(0);
    q.forEach((fn) => fn(t));
  };
  sandbox.runTimeouts = () => {
    const q = timeoutQueue.splice(0);
    q.forEach((fn) => fn());
  };

  const mq = { matches: !!opts.prefersLight, addEventListener() {} };
  sandbox.matchMedia = (q) => (q.indexOf("reduced-motion") !== -1
    ? { matches: !!opts.reduceMotion, addEventListener() {} }
    : mq);

  return { sandbox, els, samples, btns };
}

function runPage(sb) {
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: "loom-page-script.js" });
  return sb.window.__loomTest;
}

/* drain fetch promise microtasks */
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? " — " + extra : "")); }
}
function countRects(canvas) {
  return canvas.getContext().ops.filter((o) => o[0] === "fillRect").length;
}

(async function main() {

  /* ═══ 1. pure functions ═════════════════════════════════════ */
  const boot = buildSandbox({ fetchMode: "fail" });
  const T = runPage(boot.sandbox);
  if (!T) { console.error("FAIL: __loomTest not exposed"); process.exit(1); }

  const { up, TIEUPS } = T;
  const row = (r, t) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => up(c, r, t)).join("");

  /* hand-computed: pattern [1,1,0,0], shift +1 → runs move right */
  check("twill row0 = 1100 repeating", row(0, TIEUPS.twill) === "11001100", row(0, TIEUPS.twill));
  check("twill row1 shifted right", row(1, TIEUPS.twill) === "01100110", row(1, TIEUPS.twill));
  check("twill row2 shifted right again", row(2, TIEUPS.twill) === "00110011", row(2, TIEUPS.twill));
  check("twill row4 = row0 (period 4)", row(4, TIEUPS.twill) === row(0, TIEUPS.twill));
  check("tabby row0 = 10 repeating", row(0, TIEUPS.tabby) === "10101010");
  check("tabby row1 inverted", row(1, TIEUPS.tabby) === "01010101");
  /* basket: 2 picks per shed → rows in identical pairs, shift advances every 2 */
  check("basket row1 = row0 (paired picks)", row(1, TIEUPS.basket) === row(0, TIEUPS.basket));
  check("basket row2 shifted by 2", row(2, TIEUPS.basket) === "00110011", row(2, TIEUPS.basket));
  check("basket row3 = row2", row(3, TIEUPS.basket) === row(2, TIEUPS.basket));
  check("basket odd rows mirror even rows (no tilt)", row(1, TIEUPS.basket) === "11001100" && row(3, TIEUPS.basket) === "00110011");
  /* herringbone: band 8. band0 runs right, band1 runs left. */
  check("herringbone band0 row0", row(0, TIEUPS.herringbone) === "11001100", row(0, TIEUPS.herringbone));
  check("herringbone band0 row1 right", row(1, TIEUPS.herringbone) === "01100110", row(1, TIEUPS.herringbone));
  check("herringbone band1 row8 resets", row(8, TIEUPS.herringbone) === "11001100", row(8, TIEUPS.herringbone));
  check("herringbone band1 row9 LEFT (reversal)", row(9, TIEUPS.herringbone) === "10011001", row(9, TIEUPS.herringbone));
  check("herringbone band1 row10 LEFT", row(10, TIEUPS.herringbone) === "00110011", row(10, TIEUPS.herringbone));

  check("hexToRgb/rgbToHex round-trip", T.rgbToHex(T.hexToRgb("#e0ae5a")) === "#e0ae5a");
  check("3-digit hex expands", T.rgbToHex(T.hexToRgb("#abc")) === "#aabbcc");
  check("rgbToHex clamps out-of-range (fibre noise bounds)",
    T.rgbToHex([300, -20, 128]) === "#ff001d".replace("1d", (128).toString(16)));

  /* ═══ 2. dye extraction against the real house stylesheet ═══ */
  let houseCss = null;
  try { houseCss = fs.readFileSync(path.join(ROOT, "_layouts", "default.html"), "utf8"); } catch (e) {}
  check("house stylesheet readable from repo", !!houseCss);

  const dyesLive = houseCss ? T.extractDyes(houseCss) : null;
  check("extractDyes parses :root tokens (dark bg)", !!dyesLive && dyesLive.dark.bg === "#0b0d10");
  check("extractDyes reads all ten dark tokens",
    !!dyesLive && ["bg", "bg-soft", "bg-lift", "line", "line-soft", "text", "dim", "muted", "brass", "brass-dim"]
      .every((k) => /^#[0-9a-fA-F]{6}$/.test(dyesLive.dark[k])));
  check("extractDyes reads day-service overrides (brass)", !!dyesLive && dyesLive.day.brass === "#8a6420");
  check("extractDyes reads day bg", !!dyesLive && dyesLive.day.bg === "#f7f4ee");
  check("extractDyes returns null on empty html", T.extractDyes("") === null);
  check("extractDyes returns null when no style tag", T.extractDyes("<html><body>hi</body></html>") === null);

  /* ═══ 3. weaver over a stub context ═════════════════════════ */
  const yarns = {
    warp: "#1e232c", warpAlt: "#171c24", weft: "#e0ae5a",
    weftPat: "#a9813d", selvedge: "#949ca8", ground: "#141821",
  };
  const ctx = makeCtx();
  let threw = null;
  try { T.weave(ctx, 12, 8, 7, TIEUPS.twill, yarns, 42); } catch (e) { threw = e; }
  check("weave() runs on stub ctx without throwing", !threw, threw && threw.message);
  const rects = ctx.ops.filter((o) => o[0] === "fillRect");
  check("weave() filled cols*rows cells", rects.length === 12 * 8, "saw " + rects.length);

  let weftSeen = 0, warpSeen = 0, patSeen = 0;
  const within = (hex, base, tol) => {
    const a = T.hexToRgb(hex), b = T.hexToRgb(base);
    return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
  };
  for (const op of ctx.ops) {
    if (op[0] !== "fillStyle") continue;
    if (within(op[1], yarns.weft, 5)) weftSeen++;
    else if (within(op[1], yarns.warp, 5)) warpSeen++;
    else if (within(op[1], yarns.weftPat, 5)) patSeen++;
  }
  check("both warp and weft yarns appear", weftSeen > 0 && warpSeen > 0);
  /* pattern pick lands on row 11 (11 % 12 === 11); 16 rows cross it */
  const ctx2 = makeCtx();
  T.weave(ctx2, 12, 16, 7, TIEUPS.twill, yarns, 42);
  const patSeen2 = ctx2.ops.filter((o) => o[0] === "fillStyle" && within(o[1], yarns.weftPat, 5)).length;
  check("pattern-pick yarn appears when rows cross row 11", patSeen2 >= 6, "saw " + patSeen2);

  const ctxA = makeCtx(), ctxB = makeCtx(), ctxC = makeCtx();
  T.weave(ctxA, 12, 8, 7, TIEUPS.twill, yarns, 7);
  T.weave(ctxB, 12, 8, 7, TIEUPS.twill, yarns, 7);
  T.weave(ctxC, 12, 8, 7, TIEUPS.twill, yarns, 8);
  const seq = (c) => c.ops.filter((o) => o[0] === "fillStyle").map((o) => o[1]).join(",");
  check("same seed → identical cloth", seq(ctxA) === seq(ctxB));
  check("different seed → different fibre noise", seq(ctxA) !== seq(ctxC));

  /* ═══ 4. boot — fetch failure path ══════════════════════════ */
  await settle(); /* fetch rejection → .catch → startWeaving */
  check("boot(fail): fetch called once with ('/', {cache:'no-cache'})",
    boot.sandbox.fetchCalls() === 1 && boot.sandbox.fetchUrl === "/" &&
    boot.sandbox.fetchOpts && boot.sandbox.fetchOpts.cache === "no-cache");
  check("boot(fail): provenance pill says fallback",
    boot.els["lm-dye-pill"].innerHTML.indexOf("fallback") !== -1);
  check("boot(fail): yarn count is 10", boot.els["lm-yarn-count"].textContent === "10");
  const off1 = boot.sandbox.createdCanvases[boot.sandbox.createdCanvases.length - 1];
  check("boot(fail): full cloth woven offscreen ≥ 72×48", countRects(off1) >= 72 * 48, "saw " + countRects(off1));
  check("boot(fail): all four samplers painted 36×20",
    boot.samples.every((c) => countRects(c) >= 36 * 20));
  check("boot(fail): warp strip painted 72 ends", countRects(boot.els["lm-warpstrip"]) >= 72);

  /* pump the sweep to completion: rAF frames from t=0 to t=1500 */
  for (let t = 0; t <= 1500; t += 100) boot.sandbox.pumpFrame(t);
  const mainOps = boot.els["lm-main"].getContext().ops;
  check("boot(fail): sweep blitted cloth to main canvas",
    mainOps.some((o) => o[0] === "drawImage"));
  check("boot(fail): pick counter finished",
    boot.els["lm-picks"].textContent === "pick 48/48", boot.els["lm-picks"].textContent);
  const pressed0 = boot.btns.map((b) => b.pressed[b.pressed.length - 1]);
  check("boot(fail): twill pressed, others not",
    pressed0.join("|") === "false|true|false|false", pressed0.join("|"));

  /* ═══ 5. boot — live fetch against real house CSS ═══════════ */
  const liveBoot = buildSandbox({ fetchMode: "live", fetchHtml: houseCss || "" });
  runPage(liveBoot.sandbox);
  await settle(); /* fetch .then → extractDyes → liveDye=true → redrawAll */
  check("boot(live): provenance pill says live",
    liveBoot.els["lm-dye-pill"].innerHTML.indexOf("live") !== -1,
    liveBoot.els["lm-dye-pill"].innerHTML);
  check("boot(live): pill does not claim fallback",
    liveBoot.els["lm-dye-pill"].innerHTML.indexOf("fallback") === -1);
  const liveOff = liveBoot.sandbox.createdCanvases[liveBoot.sandbox.createdCanvases.length - 1];
  check("boot(live): cloth woven with live dyes (brass weft present)",
    liveOff.getContext().ops.some((o) => o[0] === "fillStyle" && o[1] === "#e0ae5a"));

  /* tie-up switch: click tabby → re-weave + aria-pressed moves */
  const canvasesBefore = liveBoot.sandbox.createdCanvases.length;
  liveBoot.btns[0].clickHandlers.forEach((fn) => fn());
  check("click tabby → new offscreen cloth woven",
    liveBoot.sandbox.createdCanvases.length > canvasesBefore &&
    countRects(liveBoot.sandbox.createdCanvases[liveBoot.sandbox.createdCanvases.length - 1]) >= 72 * 48);
  const pressedNow = liveBoot.btns.map((b) => b.pressed[b.pressed.length - 1]);
  check("click tabby → aria-pressed moves to tabby",
    pressedNow.join("|") === "true|false|false|false", pressedNow.join("|"));

  /* re-weave button: new cloth, same tie-up */
  const canvasesBefore2 = liveBoot.sandbox.createdCanvases.length;
  liveBoot.els["lm-reweave"].clickHandlers.forEach((fn) => fn());
  check("re-weave button weaves a new cloth",
    liveBoot.sandbox.createdCanvases.length > canvasesBefore2 &&
    countRects(liveBoot.sandbox.createdCanvases[liveBoot.sandbox.createdCanvases.length - 1]) >= 72 * 48);

  /* ═══ 5b. write-your-own draft ═════════════════════════════ */
  const D = runPage(buildSandbox({ fetchMode: "fail" }).sandbox);
  const ok = (p, sh) => D.parseDraft(p, sh);
  check("parseDraft 1100/1 ok", ok("1100", "1").ok && ok("1100", "1").pattern.join("") === "1100" && ok("1100", "1").shift === 1);
  check("parseDraft hash form", ok("1100", "1").hash === "1100/1" && ok("10", "-2").hash === "10/-2");
  check("parseDraft trims whitespace", ok(" 0110 ", " 2 ").ok);
  check("parseDraft accepts 1 and 8 chars", ok("10", "0").ok && ok("11110000", "0").ok);
  check("parseDraft shift 0 has no negative zero", Object.is(ok("10", "-0").shift, 0));
  check("parseDraft rejects empty", !ok("", "1").ok && ok("", "1").error.length > 0);
  check("parseDraft rejects 9 chars", !ok("111100001", "1").ok);
  check("parseDraft rejects non-binary", !ok("11a0", "1").ok && !ok("1 0", "1").ok && !ok("12", "1").ok);
  check("parseDraft rejects all ones / all zeros", !ok("1111", "1").ok && !ok("0", "1").ok && !ok("1", "1").ok);
  check("parseDraft rejects shift out of range / junk", !ok("10", "3").ok && !ok("10", "-3").ok && !ok("10", "x").ok && !ok("10", "").ok && !ok("10", "1.5").ok);
  check("parseDraftHash ignores non-draft hashes", D.parseDraftHash("") === null && D.parseDraftHash("#top") === null);
  check("parseDraftHash #draft=1100/1", D.parseDraftHash("#draft=1100/1").ok && D.parseDraftHash("#draft=1100/1").shift === 1);
  check("parseDraftHash negative shift", D.parseDraftHash("#draft=100/-2").shift === -2);
  check("parseDraftHash bad draft reports error", D.parseDraftHash("#draft=1111/1").ok === false);
  check("parseDraftHash bad escape does not throw", D.parseDraftHash("#draft=%E0%A4%A/1") !== null);
  /* the custom pattern drives the real up() formula: pattern[(col - shift*row) mod L] */
  const cust = ok("1000", "-1");
  const crow = (r) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => D.up(c, r, cust)).join("");
  check("custom 1000/-1 row0 / row1 (runs move left)", crow(0) === "10001000" && crow(1) === "00010001", crow(0) + " " + crow(1));
  const custRef = ok("110", "2");
  const L = 3;
  let formulaOk = true;
  for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
    const want = custRef.pattern[(((c - 2 * r) % L) + L) % L] === 1 ? 1 : 0;
    if (D.up(c, r, custRef) !== want) formulaOk = false;
  }
  check("custom 110/2 matches up(col,row)=pattern[(col-shift*row) mod L]", formulaOk);

  /* form wiring: submit → custom tie-up woven, presets un-pressed, hash written */
  const fb = buildSandbox({ fetchMode: "fail" });
  runPage(fb.sandbox);
  await settle();
  const lastPressed = (b) => b.pressed[b.pressed.length - 1];
  const f = fb.els;
  const offs = () => fb.sandbox.createdCanvases;
  const before = offs().length;
  f["lm-draft-pattern"].value = "1000";
  f["lm-draft-shift"].value = "-1";
  f["lm-draftform"].fire("submit");
  check("submit prevents default navigation", f["lm-draftform"].prevented === true);
  check("submit weaves new cloth", offs().length > before && countRects(offs()[offs().length - 1]) >= 72 * 48);
  check("submit un-presses all four presets", fb.btns.every((b) => lastPressed(b) === "false"), fb.btns.map(lastPressed).join("|"));
  check("submit presses the weave-draft button", f["lm-draft-go"].attrs["aria-pressed"] === "true");
  check("submit writes #draft=1000/-1 to the hash", fb.sandbox.location.hash === "#draft=1000/-1", fb.sandbox.location.hash);
  check("submit leaves the error line empty and input valid",
    f["lm-draft-err"].textContent === "" && f["lm-draft-pattern"].attrs["aria-invalid"] === "false");
  /* the offscreen cloth really is the custom weave: sample pick 0 (row 0 y=0) */
  const customOps = offs()[offs().length - 1].getContext().ops.filter((o) => o[0] === "fillRect" && o[3] === 7 && o[4] === 7);
  const row0 = customOps.slice(0, 8).map((o) => (o[5] === "#e0ae5a" || /^#(d|e|f)/.test(o[5]) ? "0" : "1"));
  check("custom cloth row 0 shows 1000 repeating (up ends = non-weft colour)", row0.join("") === "10001000", row0.join("") + " " + JSON.stringify(customOps.slice(0, 8).map((o) => o.slice(1))));

  /* invalid submit: error shown, loom unchanged, hash unchanged */
  const before2 = offs().length;
  f["lm-draft-pattern"].value = "1111";
  f["lm-draftform"].fire("submit");
  check("invalid draft shows an inline error", f["lm-draft-err"].textContent.length > 0, f["lm-draft-err"].textContent);
  check("invalid draft marks input aria-invalid", f["lm-draft-pattern"].attrs["aria-invalid"] === "true");
  check("invalid draft does not re-weave or touch the hash",
    offs().length === before2 && fb.sandbox.location.hash === "#draft=1000/-1");
  f["lm-draft-pattern"].fire("input");
  check("typing clears the error", f["lm-draft-err"].textContent === "");

  /* preset click while custom: preset pressed, hash cleared, weave-draft unpressed */
  fb.btns[3].clickHandlers.forEach((fn) => fn());
  check("preset click un-customs: basket pressed only",
    fb.btns.map(lastPressed).join("|") === "false|false|false|true", fb.btns.map(lastPressed).join("|"));
  check("preset click clears the draft hash", fb.sandbox.location.hash === "", fb.sandbox.location.hash);
  check("preset click un-presses weave-draft", f["lm-draft-go"].attrs["aria-pressed"] === "false");
  /* clicking the previously-active preset (twill) works after custom */
  f["lm-draft-pattern"].value = "10"; f["lm-draft-shift"].value = "0";
  f["lm-draftform"].fire("submit");
  fb.btns[1].clickHandlers.forEach((fn) => fn());
  check("twill preset works after custom", fb.btns.map(lastPressed).join("|") === "false|true|false|false");

  /* hashchange: pasted link into an open tab */
  fb.sandbox.location.hash = "#draft=0110/2";
  fb.sandbox.hashHandlers.forEach((fn) => fn());
  check("hashchange applies the draft and fills the form",
    f["lm-draft-pattern"].value === "0110" && f["lm-draft-shift"].value === "2" &&
    fb.btns.every((b) => lastPressed(b) === "false"));

  /* load with a valid hash: custom active before first weave, no fetch-order surprises */
  const hb = buildSandbox({ fetchMode: "fail", hash: "#draft=1100/1" });
  runPage(hb.sandbox);
  await settle();
  check("load #draft=1100/1: presets un-pressed", hb.btns.every((b) => lastPressed(b) === "false"), hb.btns.map(lastPressed).join("|"));
  check("load #draft=1100/1: form populated", hb.els["lm-draft-pattern"].value === "1100" && hb.els["lm-draft-shift"].value === "1");
  check("load #draft=1100/1: cloth woven once on boot",
    hb.sandbox.createdCanvases.length === 1, "offscreen canvases: " + hb.sandbox.createdCanvases.length);
  check("load: hash applied without rewriting history", hb.sandbox.history.calls.length === 0);
  /* load with a broken hash: error surfaced, twill stays */
  const bb = buildSandbox({ fetchMode: "fail", hash: "#draft=1111/1" });
  runPage(bb.sandbox);
  await settle();
  check("load bad hash: error shown, twill still pressed",
    bb.els["lm-draft-err"].textContent.length > 0 && bb.btns.map(lastPressed).join("|") === "false|true|false|false");

  /* ═══ 6. reduced motion ═════════════════════════════════════ */
  const rmBoot = buildSandbox({ fetchMode: "fail", reduceMotion: true });
  runPage(rmBoot.sandbox);
  await settle();
  check("boot(rm): pick counter finished without rAF sweep",
    rmBoot.els["lm-picks"].textContent === "pick 48/48", rmBoot.els["lm-picks"].textContent);
  check("boot(rm): no rAF frames queued",
    rmBoot.sandbox.rafQueue.length === 0, "queued " + rmBoot.sandbox.rafQueue.length);
  check("boot(rm): cloth blitted to main canvas",
    rmBoot.els["lm-main"].getContext().ops.some((o) => o[0] === "drawImage"));

  /* ═══ 7. day service ════════════════════════════════════════ */
  const dayBoot = buildSandbox({ fetchMode: "fail", theme: "day" });
  runPage(dayBoot.sandbox);
  await settle();
  const dayStyles = [];
  dayBoot.samples.forEach((c) => {
    c.getContext().ops.forEach((o) => { if (o[0] === "fillStyle") dayStyles.push(o[1]); });
  });
  const uniq = [...new Set(dayStyles)];
  check("boot(day): day dye lots used, no dark-only lots",
    uniq.indexOf("#8a6420") !== -1 || uniq.indexOf("#775517") !== -1,
    "fills: " + JSON.stringify(uniq.slice(0, 10)));
  check("boot(day): dark brass absent from fills", uniq.indexOf("#e0ae5a") === -1);

  /* ═══ report ════════════════════════════════════════════════ */
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });