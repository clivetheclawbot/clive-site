#!/usr/bin/env node
// matchbox-harness.mjs — verification for /pages/matchbox/.
//
// 1. Static checks: no Jekyll frontmatter, en-GB, nothing fetched, the
//    Wikipedia link and the storage key are present.
// 2. Loads the page's CORE block (between the CORE:start / CORE:end markers)
//    verbatim into a sandbox and tests the learning logic: reinforcement
//    rules, the brain link codec, state validation, and the claim itself,
//    that the butler learns to beat a random opponent more than 90% of the
//    time after ~3000 games of practice (across many seeds, not one lucky one).
//
// Run: node .github/scripts/matchbox-harness.mjs   (exit 1 on any failure)

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(ROOT, "pages", "matchbox", "index.html"), "utf8");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.error("FAIL " + name + "\n     " + (e && e.message)); process.exitCode = 1; }
}

/* ---- 1. static ------------------------------------------------------------ */
test("no frontmatter, doctype, en-GB", () => {
  assert.ok(/^<!doctype html>/i.test(html));
  assert.ok(!/^---/.test(html));
  assert.ok(/<html lang="en-GB">/.test(html));
});
test("title style, primer link, storage key", () => {
  assert.ok(html.includes("<title>The Matchbox — clive.kieranajp.uk</title>"));
  assert.ok(html.includes('href="https://en.wikipedia.org/wiki/Matchbox_Educable_Noughts_and_Crosses_Engine"'));
  assert.ok(html.includes('KEY = "clive-matchbox-v1"'));
});
test("self-contained: no external scripts, styles or fetches", () => {
  assert.ok(!/<script[^>]+src=/i.test(html));
  assert.ok(!/<link[^>]+rel="stylesheet"/i.test(html));
  assert.ok(!/\bfetch\(|XMLHttpRequest/.test(html));
});

test("the whole page script parses", () => {
  const src = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(src, "no inline script");
  new Function(src[1]); // throws on a syntax error; does not run it
});

/* ---- 2. load CORE --------------------------------------------------------- */
const m = html.match(/\/\* CORE:start[^*]*\*\/([\s\S]*?)\/\* CORE:end \*\//);
if (!m) { console.error("FAIL could not find the CORE block"); process.exit(1); }
const C = new Function(
  m[1] + `
  return { PILE, START, FLOOR, PENALTY, CAP, WINDOW, MAXHIST, KEY, mulberry32, maxTake, newBrain, cloneBrain, boxTotal,
    drawBead, reinforce, bestMove, mastered, selfPlay, ceiling, sparkPoints, lastRate,
    encodeBrain, decodeBrain, freshState, parseState, DOTCAP, dotCount, shortHash };`
)();

/* ---- brain basics --------------------------------------------------------- */
test("newBrain: 15 boxes, 3 of each legal bead, none for impossible moves", () => {
  const b = C.newBrain();
  assert.equal(Object.keys(b).length, 15);
  assert.deepEqual(b[1], [3, 0, 0]);
  assert.deepEqual(b[2], [3, 3, 0]);
  assert.deepEqual(b[3], [3, 3, 3]);
  assert.deepEqual(b[15], [3, 3, 3]);
});

test("drawBead: only legal beads come out, in proportion", () => {
  const rng = C.mulberry32(7);
  const box = [1, 0, 3];
  const seen = [0, 0, 0, 0];
  for (let i = 0; i < 8000; i++) seen[C.drawBead(box, rng)]++;
  assert.equal(seen[2], 0, "never draws a colour that is not in the box");
  const ratio = seen[3] / seen[1];
  assert.ok(ratio > 2.5 && ratio < 3.6, "3:1 beads gives about 3:1 draws, got " + ratio.toFixed(2));
  for (let n = 1; n <= 3; n++) {
    const b = C.newBrain();
    for (let i = 0; i < 500; i++) assert.ok(C.drawBead(b[n], rng) <= n);
  }
});

test("bestMove: leaves 1 mod 4; 1, 5, 9, 13 are lost", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(C.bestMove),
    [null, 1, 2, 3, null, 1, 2, 3, null, 1, 2, 3, null, 1, 2]);
});

test("ceiling: exact chance a perfect player beats a random one", () => {
  const c = C.ceiling();
  assert.ok(Math.abs(c - 0.99382716) < 1e-6, "got " + c);
});

/* ---- reinforcement -------------------------------------------------------- */
test("win adds one bead of the colour played to each box used", () => {
  const b = C.newBrain();
  const ev = C.reinforce(b, [{ pile: 15, move: 2 }, { pile: 11, move: 2 }], true);
  assert.deepEqual(b[15], [3, 4, 3]);
  assert.deepEqual(b[11], [3, 4, 3]);
  assert.equal(ev.length, 2);
  assert.ok(ev.every((e) => e.delta === 1));
});

test("loss removes beads of the colour played from each box used, down to the floor", () => {
  const b = C.newBrain();
  const ev = C.reinforce(b, [{ pile: 14, move: 3 }, { pile: 6, move: 1 }], false);
  assert.deepEqual(b[14], [3, 3, 1]);
  assert.deepEqual(b[6], [1, 3, 3]);
  assert.ok(ev.every((e) => e.delta === -2 && !e.protectedBead && !e.flat));
  // a colour that has grown loses at most PENALTY at once
  const g = C.newBrain(); g[15][1] = 20;
  C.reinforce(g, [{ pile: 15, move: 2 }], false);
  assert.equal(g[15][1], 20 - C.PENALTY);
});

test("no colour ever drops below one bead, so no box can empty", () => {
  const b = C.newBrain();
  for (let i = 0; i < 20; i++) C.reinforce(b, [{ pile: 1, move: 1 }, { pile: 2, move: 2 }, { pile: 7, move: 3 }], false);
  assert.deepEqual(b[1], [1, 0, 0]);
  assert.deepEqual(b[2], [3, 1, 0]);
  assert.deepEqual(b[7], [3, 3, 1]);
  const ev = C.reinforce(b, [{ pile: 1, move: 1 }], false);
  assert.equal(ev[0].delta, 0);
  assert.ok(ev[0].protectedBead);
  for (let n = 1; n <= 15; n++) assert.ok(C.boxTotal(b[n]) >= 1);
});

test("a loss that leaves one bead of every colour reports the box as flat, once", () => {
  const b = C.newBrain();
  assert.equal(C.reinforce(b, [{ pile: 1, move: 1 }], false)[0].flat, true, "box 1 has one colour only");
  assert.equal(C.reinforce(b, [{ pile: 1, move: 1 }], false)[0].flat, false, "already flat: no news");
  const c = C.newBrain();
  assert.equal(C.reinforce(c, [{ pile: 3, move: 1 }], false)[0].flat, false);
  assert.equal(C.reinforce(c, [{ pile: 3, move: 2 }], false)[0].flat, false);
  assert.equal(C.reinforce(c, [{ pile: 3, move: 3 }], false)[0].flat, true);
  assert.deepEqual(c[3], [1, 1, 1]);
});

test("bead counts never pass the cap: a full colour halves the box, keeping proportions", () => {
  const b = C.newBrain();
  b[15] = [10, C.CAP, 30];
  C.reinforce(b, [{ pile: 15, move: 2 }], true);
  assert.deepEqual(b[15], [5, 129, 15]);
  for (let i = 0; i < 2000; i++) {
    C.reinforce(b, [{ pile: 15, move: 2 }], true);
    assert.ok(b[15].every((v) => v >= 1 && v <= C.CAP));
  }
  assert.ok(b[15][1] > b[15][0] * 5, "the favoured colour stays favoured");
  assert.doesNotThrow(() => C.encodeBrain(b));
});

/* ---- codec & persistence -------------------------------------------------- */
test("brain link round-trips and is 60 url-safe characters", () => {
  const rng = C.mulberry32(11);
  const b = C.newBrain();
  for (let i = 0; i < 500; i++) C.selfPlay(b, rng, i % 2 === 0);
  const s = C.encodeBrain(b);
  assert.match(s, /^[A-Za-z0-9_-]{60}$/);
  assert.deepEqual(C.decodeBrain(s), b);
});

test("brain link: damaged or hostile input is refused", () => {
  const good = C.encodeBrain(C.newBrain());
  assert.equal(C.decodeBrain(""), null);
  assert.equal(C.decodeBrain(good.slice(1)), null);
  assert.equal(C.decodeBrain(good + "A"), null);
  assert.equal(C.decodeBrain("!".repeat(60)), null);
  assert.equal(C.decodeBrain(undefined), null);
  // an empty box (45 zero bytes), or a legal colour below the floor, is not a brain
  assert.equal(C.decodeBrain("A".repeat(60)), null);
  const hollow = C.newBrain(); hollow[9][1] = 0;
  assert.equal(C.decodeBrain(C.encodeBrain(hollow)), null);
  // a bead for an impossible move (3 beads in pile 1's third slot)
  const bad = C.newBrain(); bad[1][2] = 1;
  assert.equal(C.decodeBrain(C.encodeBrain(bad)), null);
});

test("state: round-trips through JSON; garbage falls back to null", () => {
  const st = C.freshState();
  st.rand = "10110"; st.practised = 5; st.human.win = 2; st.firstWin = true;
  assert.deepEqual(C.parseState(JSON.stringify(st)), st);
  assert.equal(C.parseState("not json"), null);
  assert.equal(C.parseState("null"), null);
  assert.equal(C.parseState(JSON.stringify({ v: 2 })), null);
  const bad = C.freshState(); bad.boxes[5] = [0, 0, 0];
  assert.equal(C.parseState(JSON.stringify(bad)), null, "empty box");
  const bad2 = C.freshState(); bad2.boxes[2][2] = 3;
  assert.equal(C.parseState(JSON.stringify(bad2)), null, "impossible bead");
  const bad3 = C.freshState(); bad3.rand = "10x";
  assert.equal(C.parseState(JSON.stringify(bad3)), null, "bad history");
  const long = C.freshState(); long.rand = "1".repeat(C.MAXHIST + 500);
  assert.equal(C.parseState(JSON.stringify(long)).rand.length, C.MAXHIST, "history is capped");
});

/* ---- the paper kit -------------------------------------------------------- */
test("dotCount: caps the drawn dots, flags the overflow, keeps the true total", () => {
  assert.equal(C.DOTCAP, 12);
  assert.deepEqual(C.dotCount(0), { dots: 0, more: false, total: 0 });
  assert.deepEqual(C.dotCount(3), { dots: 3, more: false, total: 3 });
  assert.deepEqual(C.dotCount(12), { dots: 12, more: false, total: 12 });
  assert.deepEqual(C.dotCount(13), { dots: 12, more: true, total: 13 });
  assert.deepEqual(C.dotCount(255), { dots: 12, more: true, total: 255 });
  assert.deepEqual(C.dotCount(40, 5), { dots: 5, more: true, total: 40 });
  assert.deepEqual(C.dotCount(-2), { dots: 0, more: false, total: 0 });
  assert.deepEqual(C.dotCount("x"), { dots: 0, more: false, total: 0 });
  assert.equal(C.dotCount(7.9).total, 7);
});
test("dotCount: every box in a fresh and a practised brain draws at most 12 dots per row", () => {
  const b = practise(7, 1000).brain;
  for (let n = 1; n <= 15; n++) for (let k = 0; k < 3; k++) {
    const d = C.dotCount(b[n][k]);
    assert.ok(d.dots <= 12 && d.dots === Math.min(12, b[n][k]));
  }
});
test("shortHash: short text untouched, long text trimmed to the limit with one ellipsis", () => {
  assert.equal(C.shortHash("#brain=abc", 36), "#brain=abc");
  const long = "#brain=" + C.encodeBrain(C.newBrain());
  assert.equal(long.length, 67);
  const s = C.shortHash(long, 36);
  assert.equal(s.length, 36);
  assert.equal((s.match(/\u2026/g) || []).length, 1);
  assert.ok(s.startsWith("#brain=") && long.endsWith(s.slice(-11)));
  assert.equal(C.shortHash(long, 67), long);
  assert.equal(C.shortHash("abcdefghij", 3), "abc");
});
test("the print sheet: A4 page, print-only, no network", () => {
  assert.ok(/@page\s*\{\s*size:\s*A4/.test(html));
  assert.ok(/@media print/.test(html));
  assert.ok(/#sheet\s*\{\s*display:\s*none/.test(html));
  assert.ok(/id="print"/.test(html) && html.includes("Print the brain"));
});

/* ---- the sparkline -------------------------------------------------------- */
test("sparkPoints: starts at a full window, thins to max, rates are right", () => {
  assert.deepEqual(C.sparkPoints("1".repeat(10), 50, 100), []);
  const pts = C.sparkPoints("0".repeat(50) + "1".repeat(50), 50, 200);
  assert.equal(pts.length, 51);
  assert.equal(pts[0].rate, 0);
  assert.equal(pts[pts.length - 1].rate, 1);
  const many = C.sparkPoints("10".repeat(1500), 50, 120);
  assert.equal(many.length, 120);
  assert.equal(many[many.length - 1].i, 2999);
  assert.equal(C.lastRate("", 10), null);
  assert.equal(C.lastRate("1100", 4), 0.5);
});

/* ---- the claim ------------------------------------------------------------ */
function practise(seed, games) {
  const rng = C.mulberry32(seed);
  const brain = C.newBrain();
  let hist = "";
  for (let i = 0; i < games; i++) hist += C.selfPlay(brain, rng, i % 2 === 0).won ? "1" : "0";
  return { brain, hist };
}

test("an untrained butler is no better than chance (and the harness knows it)", () => {
  const { hist } = practise(1, 200);
  const early = C.lastRate(hist.slice(0, 100), 100);
  assert.ok(early < 0.8, "first 100 games should not already be expert, got " + early);
});

test("after 3000 practice games vs random, win rate in the last 500 exceeds 90%", () => {
  const { brain, hist } = practise(2026, 3000);
  const r = C.lastRate(hist, 500);
  console.log("     seed 2026: last 500 = " + (r * 100).toFixed(1) + "%, boxes right " + JSON.stringify(C.mastered(brain)));
  assert.ok(r > 0.9, "last-500 win rate " + r);
});

test("...and not by luck: 100 seeds, every one beats 90%", () => {
  const rates = [];
  for (let seed = 1; seed <= 100; seed++) rates.push(C.lastRate(practise(seed, 3000).hist, 500));
  const min = Math.min(...rates), mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  console.log("     100 seeds: min " + (min * 100).toFixed(1) + "%, mean " + (mean * 100).toFixed(1) + "%, ceiling " + (C.ceiling() * 100).toFixed(1) + "%");
  assert.ok(min > 0.9, "worst seed " + min);
});

test("the page's claim about Michie's pay scale holds: +3 / -1 learns slower here", () => {
  // Same game, same boxes, same draws; only the reinforcement differs.
  let total = 0;
  const N = 20;
  for (let seed = 1; seed <= N; seed++) {
    const rng = C.mulberry32(seed), brain = C.newBrain();
    let hist = "";
    for (let i = 0; i < 3000; i++) {
      // play with the real selfPlay on a throwaway copy to get the moves, then pay out Michie-style
      const probe = C.cloneBrain(brain);
      const g = C.selfPlay(probe, rng, i % 2 === 0);
      g.drawn.forEach((d) => {
        const box = brain[d.pile];
        if (g.won) box[d.move - 1] = Math.min(C.CAP, box[d.move - 1] + 3);
        else if (C.boxTotal(box) > 1 && box[d.move - 1] > 0) box[d.move - 1]--;
      });
      hist += g.won ? "1" : "0";
    }
    total += C.lastRate(hist, 500);
  }
  const mean = total / N;
  console.log("     Michie's +3/-1 scale, " + N + " seeds: mean last-500 " + (mean * 100).toFixed(1) + "%");
  assert.ok(mean < 0.85, "expected the slower scale to stay under 85%, got " + mean);
});

test("learning moves the beads toward the napkin answer", () => {
  assert.equal(C.mastered(C.newBrain()).right, 0, "a fresh brain has no opinions");
  assert.equal(C.mastered(C.newBrain()).of, 11, "eleven boxes have a winning move; 1, 5, 9 and 13 do not");
  const counts = [];
  for (let seed = 1; seed <= 30; seed++) counts.push(C.mastered(practise(seed, 3000).brain).right);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  console.log("     boxes with the right bead in the lead after 3000 games: mean " + mean.toFixed(1) + " of 11, worst " + Math.min(...counts));
  assert.ok(mean >= 8.5, "mean " + mean);
  assert.ok(Math.min(...counts) >= 6, "worst " + Math.min(...counts));
});

console.log("\n" + passed + " passed" + (process.exitCode ? ", with failures" : ""));
