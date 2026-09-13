// loom-render.js — renders the loom's four tie-ups to PNG using the
// page's own weave() code, so what is checked visually is what ships.
//
//   node scripts/loom-render.js   → writes scripts/render/*.png
//
// PNG encoder: 8-bit RGB, no interlace, filter 0. zlib from node core.

"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(ROOT, "pages", "loom", "index.html"), "utf8");
const blocks = page.match(/<script>([\s\S]*?)<\/script>/g);
const src = blocks[blocks.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");

/* minimal DOM stubs, just enough to boot the IIFE */
function makeCtx() {
  return {
    fillStyle: "#000",
    fillRect() {}, setTransform() {}, clearRect() {}, drawImage() {},
  };
}
const sandbox = {
  document: {
    readyState: "complete",
    documentElement: { getAttribute: () => null },
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
    addEventListener: () => {},
  },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0,
  setTimeout: () => 0,
  console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "loom-page-script.js" });
const T = sandbox.window.__loomTest;

/* recording context for real rendering */
function recordCtx() {
  const ops = [];
  return {
    ops,
    set fillStyle(v) { ops.push(["s", v]); },
    get fillStyle() { return ops.length ? ops[ops.length - 1][1] : "#000"; },
    fillRect(x, y, w, h) { ops.push(["r", x, y, w, h]); },
    setTransform() {}, clearRect() {}, drawImage() {},
  };
}

/* run weave() into a pixel buffer */
function renderTieup(tieupName, cols, rows, cell, yarns, seed) {
  const ctx = recordCtx();
  T.weave(ctx, cols, rows, cell, TIEUPS(tieupName), yarns, seed);
  const W = cols * cell, H = rows * cell;
  const px = Buffer.alloc(W * H * 3, 0);
  /* paint in op order: latest fillRect wins per pixel (they don't overlap here) */
  let style = "#000";
  for (const op of ctx.ops) {
    if (op[0] === "s") style = op[1];
    else {
      const [, x, y, w, h] = op;
      const rgb = T.hexToRgb(style);
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const i = (yy * W + xx) * 3;
          px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
        }
      }
    }
  }
  return { W, H, px };
}
function TIEUPS(name) { return T.TIEUPS[name]; }

/* PNG encode */
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(W, H, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; /* 8-bit, truecolour */
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; /* filter none */
    rgb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* yarn lots: the house's own dark tokens (what a dark-theme visitor gets) */
const yarns = {
  warp: "#1e232c", warpAlt: "#171c24", weft: "#e0ae5a",
  weftPat: "#a9813d", selvedge: "#949ca8", ground: "#141821",
};

const outDir = path.join(__dirname, "render");
fs.mkdirSync(outDir, { recursive: true });
const seed = 20260913;
for (const name of ["tabby", "twill", "herringbone", "basket"]) {
  const { W, H, px } = renderTieup(name, 72, 48, 7, yarns, seed);
  fs.writeFileSync(path.join(outDir, name + ".png"), encodePNG(W, H, px));
  console.log("wrote", name + ".png", W + "x" + H);
}
console.log("done");