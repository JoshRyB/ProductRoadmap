import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  RateLimiter, clearedCookie, clientIp, cookieName, hostAllowed, isSameOrigin, parseCookies, safeEqual, securityHeaders,
  sessionCookie, signSession, verifySession,
} from "./security.js";
import { readSettings } from "./settings.js";

const SECRET = "a".repeat(40);

test("a session is accepted until it expires", () => {
  const t = signSession(SECRET, 1000, 10_000);
  assert.equal(verifySession(SECRET, t, 10_500), true);
  assert.equal(verifySession(SECRET, t, 10_999), true);
  assert.equal(verifySession(SECRET, t, 11_001), false);
});

test("a session made with another secret, or tampered with, is rejected", () => {
  const t = signSession(SECRET, 60_000, 0);
  assert.equal(verifySession("b".repeat(40), t, 1), false);
  const [payload, sig] = t.split(".");
  // change the expiry inside the payload but keep the old signature
  const forged = Buffer.from(JSON.stringify({ exp: 9e15, n: "x" })).toString("base64url");
  assert.equal(verifySession(SECRET, `${forged}.${sig}`, 1), false);
  assert.equal(verifySession(SECRET, `${payload}.${sig.slice(0, -2)}AA`, 1), false);
  assert.equal(verifySession(SECRET, `${payload}.${sig}.extra`, 1), false);
});

test("rubbish tokens never pass or crash", () => {
  for (const t of [undefined, "", ".", "a.", ".b", "not-a-token", "a.b.c", "x".repeat(500), "%%%.%%%", "{}"]) {
    assert.equal(verifySession(SECRET, t as string | undefined, 1), false, String(t));
  }
  // correctly signed, but the payload isn't what we issue
  const bad = Buffer.from("not json").toString("base64url");
  const sig = createHmac("sha256", SECRET).update(bad).digest("base64url");
  assert.equal(verifySession(SECRET, `${bad}.${sig}`, 1), false);
  const noExp = Buffer.from(JSON.stringify({ n: 1 })).toString("base64url");
  assert.equal(verifySession(SECRET, `${noExp}.${createHmac("sha256", SECRET).update(noExp).digest("base64url")}`, 1), false);
});

test("two sessions are never the same", () => {
  assert.notEqual(signSession(SECRET, 1000, 5), signSession(SECRET, 1000, 5));
});

test("password comparison", () => {
  assert.equal(safeEqual("correct horse battery", "correct horse battery"), true);
  assert.equal(safeEqual("correct horse battery", "correct horse batterY"), false);
  assert.equal(safeEqual("short", "a much longer one"), false);
  assert.equal(safeEqual("", ""), true);
});

test("cookies: read safely, first wins, junk ignored", () => {
  assert.deepEqual(parseCookies("a=1; b=two%20words; a=2"), { a: "1", b: "two words" });
  assert.deepEqual(parseCookies("=x; ; noequals; bad=%E0%A4%A"), {});
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies("a=" + "x".repeat(5000)), {});
});

test("the session cookie is locked down, and Secure when hosted", () => {
  const dev = sessionCookie(cookieName(false), "v", 60, false);
  assert.match(dev, /^roadmap_session=v; Path=\/; HttpOnly; SameSite=Strict; Max-Age=60$/);
  const prod = sessionCookie(cookieName(true), "v", 60, true);
  assert.match(prod, /^__Host-roadmap_session=v; Path=\/; HttpOnly; SameSite=Strict; Max-Age=60; Secure$/);
  assert.ok(!/Domain=/i.test(prod), "the __Host- prefix forbids a Domain");
  assert.match(clearedCookie("x", true), /Max-Age=0; Secure$/);
});

test("rate limiter allows a few attempts, then blocks, then recovers", () => {
  const rl = new RateLimiter(3, 1000);
  assert.deepEqual([1, 2, 3].map(() => rl.consume("ip", 0).ok), [true, true, true]);
  const blocked = rl.consume("ip", 10);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(rl.consume("other", 10).ok, true, "other callers are unaffected");
  assert.equal(rl.consume("ip", 1500).ok, true, "the window passes");
  rl.consume("ip", 1500); rl.consume("ip", 1500);
  assert.equal(rl.consume("ip", 1500).ok, false);
  rl.reset("ip");
  assert.equal(rl.consume("ip", 1500).ok, true);
});

test("client address: a forwarded header is only believed behind a trusted proxy", () => {
  assert.equal(clientIp("1.2.3.4", "9.9.9.9", false), "9.9.9.9");
  assert.equal(clientIp("6.6.6.6, 1.2.3.4", "9.9.9.9", true), "1.2.3.4", "the last entry is the one the proxy added");
  assert.equal(clientIp("not an ip!", "9.9.9.9", true), "9.9.9.9");
  assert.equal(clientIp(undefined, undefined, false), "unknown");
});

test("form posts must come from the same site", () => {
  assert.equal(isSameOrigin({ origin: "https://roadmap.example.com", host: "roadmap.example.com" }), true);
  assert.equal(isSameOrigin({ origin: "http://localhost:3001", host: "localhost:3001" }), true);
  assert.equal(isSameOrigin({ origin: "https://evil.example", host: "roadmap.example.com" }), false);
  assert.equal(isSameOrigin({ origin: "null", host: "roadmap.example.com" }), false);
  // browsers can label a genuine same-site post "null"; the browser-set Sec-Fetch-Site decides
  assert.equal(isSameOrigin({ origin: "null", host: "roadmap.example.com", "sec-fetch-site": "same-origin" }), true);
  assert.equal(isSameOrigin({ origin: "null", host: "roadmap.example.com", "sec-fetch-site": "cross-site" }), false);
  // a stated origin that is wrong is never rescued by the other header
  assert.equal(isSameOrigin({ origin: "https://evil.example", host: "roadmap.example.com", "sec-fetch-site": "same-origin" }), false);
  assert.equal(isSameOrigin({ host: "roadmap.example.com" }), false);
  assert.equal(isSameOrigin({ host: "roadmap.example.com", "sec-fetch-site": "same-origin" }), true);
  assert.equal(isSameOrigin({ host: "roadmap.example.com", "sec-fetch-site": "cross-site" }), false);
});

test("host names: only the expected ones when a list is set", () => {
  assert.equal(hostAllowed("anything.example", []), true);
  assert.equal(hostAllowed("localhost:3001", ["localhost", "127.0.0.1"]), true);
  assert.equal(hostAllowed("LOCALHOST", ["localhost"]), true);
  assert.equal(hostAllowed("evil.example:3001", ["localhost"]), false);
  assert.equal(hostAllowed("localhost.evil.example", ["localhost"]), false);
  assert.equal(hostAllowed(undefined, ["localhost"]), false);
});

test("security headers: strict policy, and HSTS only when hosted", () => {
  const h = securityHeaders(false);
  const csp = h["Content-Security-Policy"];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/, "no inline or remote scripts");
  assert.ok(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(csp));
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["Referrer-Policy"], "same-origin");
  assert.equal(h["Strict-Transport-Security"], undefined);
  assert.match(securityHeaders(true)["Strict-Transport-Security"], /max-age=\d+/);
});

/* ---------- settings ---------- */

const read = (env: Record<string, string>, hasProvider = true) => readSettings(env, hasProvider, "/web");
const LONG = "correct-horse-battery-staple";
const SECRET_OK = "s".repeat(40);

test("hosted with real data and no password: refuses to start", () => {
  const r = read({ NODE_ENV: "production" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /ACCESS_PASSWORD is not set/);
});

test("hosted with sample data only and no password is allowed (nothing to protect)", () => {
  assert.deepEqual(read({ NODE_ENV: "production" }, false).errors, []);
});

test("hosted: password and secret must be strong", () => {
  assert.match(read({ NODE_ENV: "production", ACCESS_PASSWORD: "short" }).errors.join(" "), /at least 12/);
  assert.match(read({ NODE_ENV: "production", ACCESS_PASSWORD: LONG }).errors.join(" "), /SESSION_SECRET/);
  assert.match(read({ NODE_ENV: "production", ACCESS_PASSWORD: LONG, SESSION_SECRET: "tooshort" }).errors.join(" "), /SESSION_SECRET/);
  const ok = read({ NODE_ENV: "production", ACCESS_PASSWORD: LONG, SESSION_SECRET: SECRET_OK, TRUST_PROXY: "1", HOST: "0.0.0.0" });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.settings.trustProxy, true);
  assert.equal(ok.settings.sessionSecret, SECRET_OK);
  assert.deepEqual(ok.settings.allowedHosts, []);
});

test("on your own computer: listens only locally and only answers to local host names", () => {
  const r = read({});
  assert.deepEqual(r.errors, []);
  assert.equal(r.settings.host, "127.0.0.1");
  assert.deepEqual(r.settings.allowedHosts, ["localhost", "127.0.0.1", "[::1]"]);
  assert.equal(r.settings.password, null);
  assert.equal(r.settings.production, false);
});

test("local with a password but no secret: works, with a note about restarts", () => {
  const r = read({ ACCESS_PASSWORD: "longenough-pw" });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join(" "), /signed out whenever the server restarts/);
  assert.equal(r.settings.sessionSecret.length, 64);
});

test("exposing it to the network without a password warns", () => {
  assert.match(read({ HOST: "0.0.0.0" }).warnings.join(" "), /reachable from other computers/);
  assert.deepEqual(read({ HOST: "0.0.0.0", ACCESS_PASSWORD: LONG }).warnings.filter((w) => /reachable/.test(w)), []);
});

test("odd settings are handled", () => {
  assert.match(read({ PORT: "abc" }).errors.join(" "), /not a valid port/);
  assert.equal(read({ SESSION_HOURS: "-3" }).settings.sessionTtlMs, 12 * 3_600_000);
  assert.equal(read({ SESSION_HOURS: "2" }).settings.sessionTtlMs, 2 * 3_600_000);
  assert.deepEqual(read({ ALLOWED_HOSTS: " My.App.com , other.example " }).settings.allowedHosts, ["my.app.com", "other.example"]);
});
