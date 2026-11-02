import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveInside, serveStatic } from "./static.js";

let dir = "";
let root = "";
let server: http.Server;
let port = 0;

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "roadmap-static-"));
  root = path.join(dir, "web");
  mkdirSync(path.join(root, "assets"), { recursive: true });
  writeFileSync(path.join(root, "index.html"), "<html>front page</html>");
  writeFileSync(path.join(root, "assets", "app-abc123.js"), "console.log('app')");
  writeFileSync(path.join(root, "assets", "style.css"), "body{}");
  writeFileSync(path.join(root, ".env"), "SECRET=1");
  writeFileSync(path.join(dir, "secret.txt"), "TOP SECRET");
  server = http.createServer((req, res) => void serveStatic(root, new URL(req.url!, "http://x").pathname, req.method!, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const get = (p: string, method = "GET") =>
  new Promise<{ status: number; type: string | undefined; cache: string | undefined; body: string }>((resolve) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, method, agent: false }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode!, type: res.headers["content-type"], cache: res.headers["cache-control"], body }));
    });
    r.end();
  });

test("normal files and the front page are served with sensible types and caching", async () => {
  const home = await get("/");
  assert.equal(home.status, 200);
  assert.match(home.type!, /text\/html/);
  assert.equal(home.cache, "no-cache");
  assert.equal(home.body, "<html>front page</html>");
  const js = await get("/assets/app-abc123.js");
  assert.match(js.type!, /text\/javascript/);
  assert.match(js.cache!, /immutable/);
  assert.match((await get("/assets/style.css")).type!, /text\/css/);
});

test("page addresses inside the app fall back to the front page; missing files do not", async () => {
  assert.equal((await get("/settings")).body, "<html>front page</html>");
  assert.equal((await get("/assets/missing.js")).status, 404);
  assert.equal((await get("/nope.png")).status, 404);
});

test("HEAD sends headers only", async () => {
  const r = await get("/assets/app-abc123.js", "HEAD");
  assert.equal(r.status, 200);
  assert.equal(r.body, "");
});

test("nothing outside the web folder can be read, however the path is written", async () => {
  const attempts = [
    "/../secret.txt", "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/%2e%2e%2fsecret.txt", "/assets/../../secret.txt",
    "/assets/..%2f..%2fsecret.txt", "/..%5csecret.txt", "/assets/%2e%2e%5c%2e%2e%5csecret.txt", "//secret.txt",
    "/%00", "/assets/app-abc123.js%00.png", "/%E0%A4%A", "/....//secret.txt",
  ];
  for (const a of attempts) {
    const r = await get(a);
    assert.ok(!r.body.includes("TOP SECRET"), `${a} leaked the secret`);
    assert.ok(!r.body.includes("SECRET=1"), `${a} leaked .env`);
  }
});

test("dot files are never served", async () => {
  for (const p of ["/.env", "/.git/config", "/assets/.hidden", "/%2eenv"]) {
    const r = await get(p);
    assert.ok(r.status === 404 && !r.body.includes("SECRET=1"), p);
  }
});

test("path checks", () => {
  assert.equal(resolveInside("/srv/web", "/assets/x.js"), path.resolve("/srv/web/assets/x.js"));
  assert.equal(resolveInside("/srv/web", "/"), path.resolve("/srv/web"));
  for (const bad of ["/../x", "/a/../../x", "/a\\b", "/a%00b", "/%zz", "/.env", "/a/.b"]) assert.equal(resolveInside("/srv/web", bad), null, bad);
});

test("a missing web folder gives a helpful message instead of a crash", async () => {
  const s = http.createServer((req, res) => void serveStatic(null, "/", "GET", res));
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const p = (s.address() as { port: number }).port;
  const body = await new Promise<string>((resolve) => http.get({ host: "127.0.0.1", port: p, agent: false }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(b)); }));
  assert.match(body, /hasn't been built/);
  await new Promise((r) => s.close(r));
});
