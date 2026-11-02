import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHandler } from "./app.js";
import type { AppOptions } from "./app.js";
import type { Provider } from "./providers.js";
import type { Settings } from "./settings.js";
import type { RoadmapItem } from "./model.js";

let dir = "";
let webRoot = "";
before(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "roadmap-app-"));
  webRoot = path.join(dir, "web");
  mkdirSync(path.join(webRoot, "assets"), { recursive: true });
  writeFileSync(path.join(webRoot, "index.html"), "<html>ROADMAP APP</html>");
  writeFileSync(path.join(webRoot, "assets", "app.js"), "console.log('APP CODE')");
  writeFileSync(path.join(dir, "secret.txt"), "TOP SECRET");
});
after(() => rmSync(dir, { recursive: true, force: true }));

const PASSWORD = "correct-horse-battery";
const SECRET = "s".repeat(40);
const item: RoadmapItem = {
  id: "1", key: "ADO-1", title: "Private Epic", description: null, type: "epic", status: "Active", statusCategory: "inprogress",
  start: "2026-11-01", end: "2026-12-01", parentKey: null, activity: null, url: null, source: "ado",
};

function fakeProvider(over: Partial<Provider> = {}): Provider & { calls: number } {
  const p = {
    calls: 0,
    source: "ado" as const,
    name: "Azure DevOps",
    fetchRoadmap: async () => { p.calls++; return { items: [item], warnings: [], boardType: "scrum" as const }; },
    fetchMe: async () => ({ name: "Josh Bell", email: "josh@example.com", source: "ado" as const }),
    ...over,
  };
  return p;
}

const baseSettings = (over: Partial<Settings> = {}): Settings => ({
  production: false, host: "127.0.0.1", port: 0, trustProxy: false, allowedHosts: [], password: null,
  sessionSecret: SECRET, sessionTtlMs: 3_600_000, webRoot, ...over,
});

interface Reply { status: number; headers: http.IncomingHttpHeaders; body: string }

async function start(over: { provider?: Provider | null; settings?: Partial<Settings>; now?: () => number; sampleBoard?: string } = {}) {
  const provider = over.provider === undefined ? fakeProvider() : over.provider;
  const opts: AppOptions = { provider, settings: baseSettings(over.settings), failDelayMs: 0, now: over.now, sampleBoard: over.sampleBoard };
  const server = http.createServer(createHandler(opts));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  const call = (method: string, p: string, o: { headers?: Record<string, string>; body?: string } = {}) =>
    new Promise<Reply>((resolve) => {
      const r = http.request({ host: "127.0.0.1", port, method, path: p, agent: false, headers: { host: `127.0.0.1:${port}`, ...o.headers } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      });
      r.on("error", () => resolve({ status: 0, headers: {}, body: "" }));
      if (o.body) r.write(o.body);
      r.end();
    });
  const form = (password: string, headers: Record<string, string> = {}) =>
    call("POST", "/login", {
      headers: { origin, "content-type": "application/x-www-form-urlencoded", ...headers },
      body: `password=${encodeURIComponent(password)}`,
    });
  const login = async (headers: Record<string, string> = {}) => {
    const r = await form(PASSWORD, headers);
    const set = r.headers["set-cookie"]?.[0] ?? "";
    return { reply: r, cookie: set.split(";")[0] };
  };
  return { call, form, login, origin, port, provider, close: () => new Promise((r) => server.close(r)) };
}

const gated = { password: PASSWORD };

test("without a password: data is served, and every response carries the security headers", async () => {
  const app = await start();
  const r = await app.call("GET", "/api/roadmap");
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.source, "ado");
  assert.equal(body.items[0].title, "Private Epic");
  assert.equal(r.headers["cache-control"], "no-store");
  for (const path of ["/api/roadmap", "/", "/assets/app.js", "/nope.png", "/api/nothing"]) {
    const x = await app.call("GET", path);
    assert.match(String(x.headers["content-security-policy"]), /default-src 'self'/, path);
    assert.equal(x.headers["x-content-type-options"], "nosniff", path);
    assert.equal(x.headers["x-powered-by"], undefined, path);
  }
  assert.equal((await app.call("GET", "/")).body, "<html>ROADMAP APP</html>");
  const me = JSON.parse((await app.call("GET", "/api/me")).body);
  assert.deepEqual([me.name, me.canSignOut], ["Josh Bell", false]);
  await app.close();
});

test("with no tool connected: sample data, in Scrum or Kanban form", async () => {
  const scrum = await start({ provider: null });
  const s = JSON.parse((await scrum.call("GET", "/api/roadmap")).body);
  assert.deepEqual([s.source, s.boardType], ["sample", "scrum"]);
  assert.equal(JSON.parse((await scrum.call("GET", "/api/me")).body).name, "Sample user");
  await scrum.close();
  const kanban = await start({ provider: null, sampleBoard: "kanban" });
  assert.equal(JSON.parse((await kanban.call("GET", "/api/roadmap")).body).boardType, "kanban");
  await kanban.close();
});

test("with a password: nothing is served to someone who hasn't signed in", async () => {
  const app = await start({ settings: gated });
  for (const p of ["/api/roadmap", "/api/me", "/api/anything"]) {
    const r = await app.call("GET", p);
    assert.equal(r.status, 401, p);
    assert.ok(!r.body.includes("Private Epic"), p);
  }
  for (const p of ["/", "/settings", "/assets/app.js", "/index.html"]) {
    const r = await app.call("GET", p);
    assert.equal(r.status, 200, p);
    assert.match(r.body, /<form method="post" action="\/login">/, p);
    assert.ok(!r.body.includes("ROADMAP APP") && !r.body.includes("APP CODE"), `${p} leaked the app`);
  }
  assert.equal((await app.call("POST", "/anything", { headers: { origin: app.origin } })).status, 401);
  assert.equal((await app.call("GET", "/api/health")).status, 200, "the health check stays open");
  assert.ok(!(await app.call("GET", "/api/health")).body.includes("ado"), "and says nothing about the setup");
  await app.close();
});

test("a wrong password is turned away; the right one signs in with a locked-down cookie", async () => {
  const app = await start({ settings: gated });
  const wrong = await app.form("wrong-password");
  assert.equal(wrong.status, 303);
  assert.equal(wrong.headers.location, "/login?e=1");
  assert.equal(wrong.headers["set-cookie"], undefined);
  assert.match((await app.call("GET", "/login?e=1")).body, /That password isn't right/);

  const { reply, cookie } = await app.login();
  assert.equal(reply.status, 303);
  assert.equal(reply.headers.location, "/");
  const set = reply.headers["set-cookie"]![0];
  assert.match(set, /^roadmap_session=/);
  for (const flag of ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=3600"]) assert.ok(set.includes(flag), flag);
  assert.ok(!set.includes("Secure"), "plain http on your own computer");
  assert.ok(!set.includes(PASSWORD), "the cookie never contains the password");

  const ok = await app.call("GET", "/api/roadmap", { headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).items[0].title, "Private Epic");
  assert.equal((await app.call("GET", "/", { headers: { cookie } })).body, "<html>ROADMAP APP</html>");
  assert.equal(JSON.parse((await app.call("GET", "/api/me", { headers: { cookie } })).body).canSignOut, true);
  await app.close();
});

test("forged, tampered and borrowed cookies don't work", async () => {
  const app = await start({ settings: gated });
  const { cookie } = await app.login();
  const value = cookie.split("=")[1];
  const forged = ["roadmap_session=", "roadmap_session=abc", `roadmap_session=${value}x`, `roadmap_session=${value.slice(0, -3)}AAA`, "roadmap_session=eyJleHAiOjk5OTk5OTk5OTk5OTl9.AAAA"];
  for (const c of forged) assert.equal((await app.call("GET", "/api/roadmap", { headers: { cookie: c } })).status, 401, c);
  // a cookie signed by a different server secret
  const other = await start({ settings: { ...gated, sessionSecret: "z".repeat(40) } });
  assert.equal((await other.call("GET", "/api/roadmap", { headers: { cookie } })).status, 401);
  await other.close();
  await app.close();
});

test("sessions end on time", async () => {
  let t = 1_000_000;
  const app = await start({ settings: { ...gated, sessionTtlMs: 60_000 }, now: () => t });
  const { cookie } = await app.login();
  assert.equal((await app.call("GET", "/api/roadmap", { headers: { cookie } })).status, 200);
  t += 59_000;
  assert.equal((await app.call("GET", "/api/roadmap", { headers: { cookie } })).status, 200);
  t += 2_000;
  assert.equal((await app.call("GET", "/api/roadmap", { headers: { cookie } })).status, 401);
  await app.close();
});

test("guessing the password is limited", async () => {
  const app = await start({ settings: gated });
  const results: number[] = [];
  for (let i = 0; i < 5; i++) results.push((await app.form(`guess-${i}`)).status);
  assert.deepEqual(results, [303, 303, 303, 303, 303]);
  const sixth = await app.form("guess-5");
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.headers["retry-after"]) >= 1);
  assert.match(sixth.body, /Too many attempts/);
  assert.equal((await app.form(PASSWORD)).status, 429, "even the right password waits");
  await app.close();
});

test("the limit is per caller when behind a trusted proxy", async () => {
  const app = await start({ settings: { ...gated, trustProxy: true } });
  for (let i = 0; i < 6; i++) await app.form(`guess-${i}`, { "x-forwarded-for": "9.9.9.9" });
  assert.equal((await app.form("again", { "x-forwarded-for": "9.9.9.9" })).status, 429);
  assert.equal((await app.form(PASSWORD, { "x-forwarded-for": "1.1.1.1" })).status, 303, "someone else is fine");
  // a faked first entry doesn't help: the proxy's own entry (last) is what counts
  assert.equal((await app.form("x", { "x-forwarded-for": "1.1.1.1, 9.9.9.9" })).status, 429);
  await app.close();
});

test("sign-in and sign-out only work from this same site", async () => {
  const app = await start({ settings: gated });
  const body = `password=${PASSWORD}`;
  const form = { "content-type": "application/x-www-form-urlencoded" };
  assert.equal((await app.call("POST", "/login", { headers: { ...form, origin: "https://evil.example" }, body })).status, 403);
  assert.equal((await app.call("POST", "/login", { headers: { ...form, origin: "null" }, body })).status, 403);
  assert.equal((await app.call("POST", "/login", { headers: form, body })).status, 403, "no origin at all");
  assert.equal((await app.call("POST", "/login", { headers: { ...form, "sec-fetch-site": "same-origin" }, body })).status, 303);
  // what Chrome sends for a genuine same-site form post when the referrer policy is strict
  assert.equal((await app.call("POST", "/login", { headers: { ...form, origin: "null", "sec-fetch-site": "same-origin" }, body })).status, 303);
  assert.equal((await app.call("POST", "/login", { headers: { ...form, origin: "null", "sec-fetch-site": "cross-site" }, body })).status, 403);
  const { cookie } = await app.login();
  assert.equal((await app.call("POST", "/logout", { headers: { cookie, origin: "https://evil.example" } })).status, 403);
  const out = await app.call("POST", "/logout", { headers: { cookie, origin: app.origin } });
  assert.equal(out.status, 303);
  assert.match(out.headers["set-cookie"]![0], /Max-Age=0/);
  await app.close();
});

test("oversized or odd sign-in requests are refused without breaking anything", async () => {
  const app = await start({ settings: gated });
  const big = await app.call("POST", "/login", { headers: { origin: app.origin, "content-type": "application/x-www-form-urlencoded" }, body: "password=" + "a".repeat(10_000) });
  assert.ok(big.status === 413 || big.status === 0, `status ${big.status}`);
  assert.equal((await app.form(PASSWORD)).status, 303, "still working afterwards");
  const empty = await app.call("POST", "/login", { headers: { origin: app.origin, "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(empty.status, 303);
  assert.equal(empty.headers.location, "/login?e=1");
  await app.close();
});

test("hosted: Secure __Host- cookie, HSTS, and plain HTTP is sent to HTTPS", async () => {
  const app = await start({ settings: { ...gated, production: true, trustProxy: true } });
  const { reply } = await app.login({ "x-forwarded-proto": "https" });
  const set = reply.headers["set-cookie"]![0];
  assert.match(set, /^__Host-roadmap_session=/);
  assert.ok(set.includes("Secure") && set.includes("HttpOnly") && !/Domain=/i.test(set));
  assert.match(String(reply.headers["strict-transport-security"]), /max-age=\d+/);
  const plain = await app.call("GET", "/", { headers: { "x-forwarded-proto": "http" } });
  assert.equal(plain.status, 308);
  assert.match(String(plain.headers.location), /^https:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal((await app.call("GET", "/api/health", { headers: { "x-forwarded-proto": "http" } })).status, 200, "the host's health check works");
  await app.close();
});

test("only the expected host names are answered", async () => {
  const app = await start({ settings: { allowedHosts: ["127.0.0.1"] } });
  assert.equal((await app.call("GET", "/api/roadmap")).status, 200);
  const rebind = await app.call("GET", "/api/roadmap", { headers: { host: "evil.example:3001" } });
  assert.equal(rebind.status, 421);
  assert.ok(!rebind.body.includes("Private Epic"));
  await app.close();
});

test("unexpected methods and routes", async () => {
  const app = await start({ settings: gated });
  const { cookie } = await app.login();
  const put = await app.call("PUT", "/api/roadmap", { headers: { cookie } });
  assert.equal(put.status, 405);
  assert.equal(put.headers.allow, "GET, HEAD, POST");
  assert.equal((await app.call("DELETE", "/", { headers: { cookie } })).status, 405);
  assert.equal((await app.call("POST", "/api/roadmap", { headers: { cookie, origin: app.origin } })).status, 404);
  assert.equal((await app.call("GET", "/api/nothing", { headers: { cookie } })).status, 404);
  await app.close();
});

test("files outside the web folder can't be reached even when signed in", async () => {
  const app = await start({ settings: gated });
  const { cookie } = await app.login();
  for (const p of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt", "/.env"]) {
    assert.ok(!(await app.call("GET", p, { headers: { cookie } })).body.includes("TOP SECRET"), p);
  }
  await app.close();
});

test("a failing data source gives a clear message and nothing sensitive", async () => {
  const provider = fakeProvider({ fetchRoadmap: async () => { throw new Error("Azure DevOps returned 401 for wiql"); } });
  const app = await start({ provider });
  const r = await app.call("GET", "/api/roadmap");
  assert.equal(r.status, 502);
  assert.equal(JSON.parse(r.body).error, "Azure DevOps returned 401 for wiql");
  assert.ok(!/at .*\.ts|node_modules|stack/i.test(r.body));
  await app.close();
});

test("data is cached for a minute, and Refresh is limited", async () => {
  let t = 0;
  const provider = fakeProvider();
  const app = await start({ provider, now: () => t });
  await app.call("GET", "/api/roadmap");
  await app.call("GET", "/api/roadmap");
  assert.equal(provider.calls, 1);
  t += 61_000;
  await app.call("GET", "/api/roadmap");
  assert.equal(provider.calls, 2);
  const statuses: number[] = [];
  for (let i = 0; i < 7; i++) statuses.push((await app.call("GET", "/api/roadmap?refresh=1")).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
  await app.close();
});

test("a bad request address doesn't crash the server", async () => {
  const app = await start();
  const r = await app.call("GET", "//");
  assert.ok(r.status > 0);
  assert.equal((await app.call("GET", "/api/health")).status, 200);
  await app.close();
});
