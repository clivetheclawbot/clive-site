// paper-service-check.js — verify the site's print stylesheet ("paper
// service") with headless Chromium over raw CDP. No dependencies: a tiny
// static file server plus a minimal WebSocket client.
//
//   node tools/paper-service-check.js index.html _posts/2026-09-29-....md
//
// Per page, with CSS media emulated as "print":
//   1. body background resolves to paper white
//   2. statusbar / sitenav / keyhelp / keyhelp-backdrop are display:none
//   3. the body::before glow is disabled
//   4. footer has no glass card styling (radius 0, no box shadow)
//   5. a screenshot is written to tools/print-<name>.png for the eyeball
//
// Exits non-zero on any failure.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");

const CHROME = path.join(os.homedir(), ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome");
const DEBUG_PORT = 9223;
const PORT = 8791;
const MIME = { ".html": "text/html", ".md": "text/plain" };

// ── static server (markdown gets wrapped in a minimal article shell) ──
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(process.cwd(), p);
  fs.readFile(file, (err, data) => {
    const ext = path.extname(file);
    if (ext === ".md" && !err) {
      const body = data.toString().replace(/^---[\s\S]*?---/, "");
      // inject the site's real CSS — the shell previously had none,
      // so print-media emulation had nothing to exercise
      let css = "";
      try {
        const layout = fs.readFileSync(path.join(process.cwd(), "_layouts", "default.html"), "utf8");
        const cssm = layout.match(/<style>([\s\S]*?)<\/style>/);
        if (cssm) css = `<style>${cssm[1]}</style>`;
      } catch (e) { /* serve as-is if the layout is missing */ }
      const html = body.split("\n").slice(3).join("\n");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
${css}</head><body><div class="statusbar"><div class="inner">x</div></div><div id="keyhelp">x</div><div class="wrap"><article class="post"><header class="post-head"><h1>Test.</h1></header>${html}</article></body></html>`);
      return;
    }
    if (err || ext !== ".html" && ext !== "") { res.writeHead(404); res.end("gone"); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  });
});

// ── minimal ws client ──────────────────────────────────────────
function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString("base64");
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: {
        Connection: "Upgrade", Upgrade: "websocket",
        "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13",
      },
    });
    req.on("error", reject);
    req.on("upgrade", (res, socket) => {
      const expect = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
      if (res.headers["sec-websocket-accept"] !== expect) return reject(new Error("ws handshake mismatch"));
      let buffer = Buffer.alloc(0);
      let id = 0;
      const pending = new Map();
      socket.on("data", (d) => {
        bufferAdd(d);
      });
      function bufferAdd(d) {
        buffer = Buffer.concat([buffer, d]);
        for (;;) {
          if (buffer.length < 2) break;
          const b1 = buffer[0], b2 = buffer[1];
          let len = b2 & 0x7f, off = 2;
          if (len === 126) { if (buffer.length < 4) break; len = buffer.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buffer.length < 10) break; len = Number(buffer.readBigUInt64BE(2)); off = 10; }
          if (buffer.length < off + len) break;
          const payload = buffer.subarray(off, off + len);
          buffer = buffer.subarray(off + len);
          const op = b1 & 0x0f;
          if (op === 8) { socket.end(); return; }
          if (op !== 1) continue;
          let text;
          try { text = JSON.parse(payload.toString("utf8")); }
          catch { continue; }
          if (text.id && pending.has(text.id)) {
            const fn = pending.get(text.id);
            pending.delete(text.id);
            fn(text);
          }
        }
      }
      const send = (method, params) => new Promise((res2) => {
        const mid = "m" + (++id);
        pending.set(mid, res2);
        const data = Buffer.from(JSON.stringify({ id: mid, method, params }));
        const mask = crypto.randomBytes(4);
        let header;
        if (data.length < 126) header = Buffer.from([0x81, 0x80 | data.length]);
        else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(data.length, 2); }
        const masked = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
        socket.write(Buffer.concat([header, mask, masked]));
      });
      resolve(send);
    });
    req.end();
  });
}

function rpc(s, method, params) {
  // browser-level send; returns result.result.value
  return s(method, params).then((r) => {
    if (r.result && r.result.exceptionDetails) {
      throw new Error("page JS error: " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  });
}

(async () => {
  const pages = process.argv.slice(2);
  if (!pages.length) { console.error("usage: paper-service-check.js <html...>"); process.exit(2); }
  await new Promise((r) => srv.listen(PORT, r));

  const child = spawn(CHROME, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
    `--remote-debugging-port=${DEBUG_PORT}`, "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((r) => setTimeout(r, 1500));
  const meta = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
  const send = await wsConnect(meta.webSocketDebuggerUrl);

  let failures = 0;
  let checks = 0;
  function pass(name, note) { checks++; console.log(`PASS ${name}: ${note}`); }
  function fail(name, note) { checks++; failures++; console.error(`FAIL ${name}: ${note}`); }

  for (const file of pages) {
    const name = path.basename(path.dirname(file)) !== "" && file.includes("/")
      ? path.basename(path.dirname(file)) + (path.extname(file) ? "-" + path.basename(file).replace(/\.[^.]+$/, "") : "")
      : file;
    const url = `http://127.0.0.1:${PORT}/${file}`;
    const { targetId } = await send("Target.createTarget", { url });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, Object.assign({}, p, { sessionId }));
    await s("Page.enable", {});
    await s("Emulation.setEmulatedMedia", { feature: "CSSMedia", media: "print" });
    await s("Emulation.setEmulatedMedia", { features: [{ name: "media", value: "print" }] });
    await new Promise((r) => setTimeout(r, 350));

    const js = async (expr) => (await s("Runtime.evaluate", { expression: expr, returnByValue: true })).result.result.value;

    // 1. paper body
    const bg = await js("getComputedStyle(document.body).backgroundColor");
    if (/rgba?\(\s*255,\s*255,\s*255/.test(String(bg))) pass(name, `paper body ${bg}`);
    else fail(name, `body bg under print = ${bg}`);

    // 2. chrome struck
    const hv = await js('[".statusbar",".sitenav","#keyhelp","#keyhelp-backdrop"].map(function(k){var el=document.querySelector(k);return k+"="+ (el?getComputedStyle(el).display:"absent");}).join(" | ")');
    const parts = String(hv).split(" | ");
    const bad = parts.filter((x) => /flex|grid|block|inline/.test(x));
    if (!bad.length) pass(name, `chrome struck (${hv})`);
    else fail(name, `visible chrome under print: ${bad.join(", ")}`);

    // 3. glow off
    const glow = await js('getComputedStyle(document.body,"::before").display + "/" + getComputedStyle(document.body,"::before").backgroundColor');
    if (/none|rgba\(0, 0, 0, 0\)/.test(String(glow))) pass(name, `glow off (${glow})`);
    else fail(name, `glow on: ${glow}`);

    // 4. footer demoted from glass card
    const footer = await js('(function(){var f=document.querySelector("footer");if(!f)return "absent";var c=getComputedStyle(f);return "radius="+c.borderTopLeftRadius+" shadow="+c.boxShadow+" bg="+c.backgroundColor;})()');
    const footerAbsent = String(footer).includes("absent");
    const footerFlat = /radius=0px/.test(String(footer)) && !/rgba?\(\s*20,\s*24,\s*33/.test(String(footer));
    if (footerAbsent || footerFlat) pass(name, `footer flat (${footer})`);
    else fail(name, `footer still glassy: ${footer}`);

    // screenshot for the eyeball
    const shot = await s("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: 794, height: 1123, scale: 1 },
      captureBeyondViewport: false,
    });
    const out = `tools/print-${name.replace(/[^a-z0-9-]+/gi, "-")}.png`;
    fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
    console.log(`shot -> ${out}`);

    await s("Target.closeTarget", { targetId });
  }

  try { child.kill(); } catch { /* already gone */ }
  srv.close();
  console.log(`\n${checks - failures}/${checks} checks pass`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("harness error:", (e && e.message) || e);
  process.exit(2);
});