import type { IncomingMessage, ServerResponse } from "node:http";
import { loginPage } from "./loginPage.js";
import type { Me, RoadmapResponse } from "./model.js";
import type { Provider } from "./providers.js";
import { sampleItems, sampleKanbanItems } from "./sample.js";
import {
  RateLimiter, clearedCookie, clientIp, cookieName, hostAllowed, isSameOrigin, parseCookies, safeEqual,
  securityHeaders, sessionCookie, signSession, verifySession,
} from "./security.js";
import type { Settings } from "./settings.js";
import { serveStatic } from "./static.js";

export interface AppOptions {
  provider: Provider | null;
  settings: Settings;
  /** which sample project to show when no tool is connected */
  sampleBoard?: string;
  /** milliseconds to wait after a wrong password (slows guessing down) */
  failDelayMs?: number;
  now?: () => number;
}

const CACHE_MS = 60_000;
const MAX_BODY = 2048;

export function createHandler(opts: AppOptions) {
  const { provider, settings: s } = opts;
  const now = opts.now ?? Date.now;
  const failDelay = opts.failDelayMs ?? 500;
  const headers = securityHeaders(s.production);
  const cookie = cookieName(s.production);
  const ttlSec = Math.round(s.sessionTtlMs / 1000);

  const loginLimiter = new RateLimiter(5, 15 * 60_000);
  const apiLimiter = new RateLimiter(120, 60_000);
  const refreshLimiter = new RateLimiter(6, 60_000);

  let roadmapCache: { at: number; body: RoadmapResponse } | null = null;
  let meCache: Me | null = null;

  const sendJson = (res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
    res.end(JSON.stringify(body));
  };
  const sendHtml = (res: ServerResponse, status: number, html: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra });
    res.end(html);
  };
  const redirect = (res: ServerResponse, to: string, extra: Record<string, string> = {}) => {
    res.writeHead(303, { Location: to, "Cache-Control": "no-store", ...extra });
    res.end();
  };
  const text = (res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra });
    res.end(body);
  };

  /** Reads a small form body, refusing anything large. */
  const readBody = (req: IncomingMessage): Promise<string | null> =>
    new Promise((resolve) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          resolve(null);
          req.destroy();
        } else chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", () => resolve(null));
    });

  const loadRoadmap = async (refresh: boolean): Promise<RoadmapResponse> => {
    if (roadmapCache && !refresh && now() - roadmapCache.at < CACHE_MS) return roadmapCache.body;
    let body: RoadmapResponse;
    if (provider) {
      const { items, warnings, boardType } = await provider.fetchRoadmap();
      body = { source: provider.source, boardType, fetchedAt: new Date(now()).toISOString(), items, warnings };
    } else {
      const kanban = opts.sampleBoard === "kanban";
      body = {
        source: "sample",
        boardType: kanban ? "kanban" : "scrum",
        fetchedAt: new Date(now()).toISOString(),
        items: kanban ? sampleKanbanItems : sampleItems,
        warnings: ["Showing sample data. Add Jira or Azure DevOps details to server/.env to see your own work."],
      };
    }
    roadmapCache = { at: now(), body };
    return body;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    const method = req.method ?? "GET";

    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      return text(res, 400, "Bad request");
    }
    const path = url.pathname;
    const h = req.headers;

    if (!hostAllowed(h.host, s.allowedHosts)) return text(res, 421, "This address isn't served here.");

    // Behind a host's HTTPS front door, send anyone who arrived by plain HTTP to HTTPS.
    if (s.production && s.trustProxy && h["x-forwarded-proto"] === "http" && path !== "/api/health") {
      res.writeHead(308, { Location: `https://${h.host}${req.url ?? "/"}` });
      return void res.end();
    }

    if (method !== "GET" && method !== "HEAD" && method !== "POST") {
      return text(res, 405, "Method not allowed", { Allow: "GET, HEAD, POST" });
    }

    const ip = clientIp(h["x-forwarded-for"] as string | undefined, req.socket.remoteAddress, s.trustProxy);
    const gated = s.password !== null;

    if (path === "/api/health") return sendJson(res, 200, { ok: true });

    // ----- sign in and out -----
    if (path === "/login") {
      if (!gated) return redirect(res, "/");
      if (method === "POST") {
        if (!isSameOrigin({ origin: h.origin, host: h.host, "sec-fetch-site": h["sec-fetch-site"] as string | undefined })) {
          return text(res, 403, "Forbidden");
        }
        const limit = loginLimiter.consume(ip, now());
        if (!limit.ok) {
          return sendHtml(res, 429, loginPage({ tooMany: true }), { "Retry-After": String(limit.retryAfterSec) });
        }
        const raw = await readBody(req);
        if (raw === null) return text(res, 413, "Request too large");
        const given = new URLSearchParams(raw).get("password") ?? "";
        if (safeEqual(given, s.password as string)) {
          loginLimiter.reset(ip);
          const token = signSession(s.sessionSecret, s.sessionTtlMs, now());
          return redirect(res, "/", { "Set-Cookie": sessionCookie(cookie, token, ttlSec, s.production) });
        }
        if (failDelay > 0) await new Promise((r) => setTimeout(r, failDelay));
        return redirect(res, "/login?e=1");
      }
      if (verifySession(s.sessionSecret, parseCookies(h.cookie)[cookie], now())) return redirect(res, "/");
      return sendHtml(res, 200, loginPage({ failed: url.searchParams.get("e") === "1" }));
    }

    if (path === "/logout" && method === "POST") {
      if (!isSameOrigin({ origin: h.origin, host: h.host, "sec-fetch-site": h["sec-fetch-site"] as string | undefined })) {
        return text(res, 403, "Forbidden");
      }
      return redirect(res, "/", { "Set-Cookie": clearedCookie(cookie, s.production) });
    }

    // ----- everything below needs a session when there is a password -----
    if (gated && !verifySession(s.sessionSecret, parseCookies(h.cookie)[cookie], now())) {
      if (path.startsWith("/api/")) return sendJson(res, 401, { error: "Sign in required." });
      if (method === "POST") return text(res, 401, "Sign in required");
      return sendHtml(res, 200, loginPage({}));
    }
    if (method === "POST") return text(res, 404, "Not found");

    if (path.startsWith("/api/")) {
      const limit = apiLimiter.consume(ip, now());
      if (!limit.ok) return sendJson(res, 429, { error: "Too many requests. Wait a moment." }, { "Retry-After": String(limit.retryAfterSec) });

      if (path === "/api/me") {
        try {
          meCache ??= provider ? await provider.fetchMe() : { name: "Sample user", email: null, source: "sample" };
          return sendJson(res, 200, { ...meCache, canSignOut: gated });
        } catch (e) {
          return sendJson(res, 502, { error: e instanceof Error ? e.message : "Couldn't reach the data source." });
        }
      }

      if (path === "/api/roadmap") {
        const refresh = url.searchParams.get("refresh") === "1";
        if (refresh) {
          const r = refreshLimiter.consume(ip, now());
          if (!r.ok) return sendJson(res, 429, { error: "Refreshed too often. Wait a minute." }, { "Retry-After": String(r.retryAfterSec) });
        }
        try {
          return sendJson(res, 200, await loadRoadmap(refresh));
        } catch (e) {
          return sendJson(res, 502, { error: e instanceof Error ? e.message : `Couldn't reach ${provider?.name ?? "the data source"}.` });
        }
      }
      return sendJson(res, 404, { error: "Not found." });
    }

    return serveStatic(s.webRoot, path, method, res);
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handle(req, res);
    } catch (e) {
      // Log what happened without any request details, then give the caller nothing useful.
      console.error("Unexpected error:", e instanceof Error ? e.message : "unknown");
      if (!res.headersSent) text(res, 500, "Something went wrong.");
      else res.destroy();
    }
  };
}
