import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Compares two strings without leaking, through timing, how much of them matches. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/* ---------- signed sessions ---------- */

/** A session token the server can recognise as its own: expiry plus a signature. Nothing secret inside. */
export function signSession(secret: string, ttlMs: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + ttlMs, n: randomBytes(8).toString("hex") })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(secret: string, token: string | undefined, now = Date.now()): boolean {
  if (!token || token.length > 400) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

/* ---------- cookies ---------- */

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header || header.length > 4000) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (name in out) continue; // the first one wins
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // ignore a cookie that isn't valid text
    }
  }
  return out;
}

/** The session cookie can't be read by page scripts, isn't sent from other sites, and (in production) only travels over HTTPS. */
export function sessionCookie(name: string, value: string, maxAgeSec: number, production: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${production ? "; Secure" : ""}`;
}

export function clearedCookie(name: string, production: boolean): string {
  return sessionCookie(name, "", 0, production);
}

export const cookieName = (production: boolean): string => (production ? "__Host-roadmap_session" : "roadmap_session");

/* ---------- limits ---------- */

/** Counts attempts per key in a time window. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number) {}

  /** Counts one attempt. ok is false once the limit is passed, with how long until it clears. */
  consume(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    let h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, h);
    }
    h.count++;
    return { ok: h.count <= this.max, retryAfterSec: Math.max(1, Math.ceil((h.resetAt - now) / 1000)) };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

/** The caller's address. Behind a trusted proxy that is the last entry the proxy added, never one the caller could fake. */
export function clientIp(forwardedFor: string | undefined, remote: string | undefined, trustProxy: boolean): string {
  if (trustProxy && forwardedFor) {
    const last = forwardedFor.split(",").pop()?.trim() ?? "";
    if (/^[0-9a-fA-F:.]{2,45}$/.test(last)) return last;
  }
  return remote ?? "unknown";
}

/* ---------- requests from other sites ---------- */

/** A form post is only accepted if it came from this same site. */
export function isSameOrigin(headers: { origin?: string; host?: string; "sec-fetch-site"?: string }): boolean {
  // Some browsers label a same-site post "null" (for example when the referrer policy is strict).
  // The browser's own Sec-Fetch-Site header, which a web page can't forge, settles those.
  if (headers.origin && headers.origin !== "null") {
    try {
      return !!headers.host && new URL(headers.origin).host.toLowerCase() === headers.host.toLowerCase();
    } catch {
      return false;
    }
  }
  return headers["sec-fetch-site"] === "same-origin";
}

/**
 * Guards against a web page tricking your browser into talking to the app through your own computer
 * (DNS rebinding). With no list, any host name is accepted.
 */
export function hostAllowed(hostHeader: string | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!hostHeader) return false;
  const name = hostHeader.toLowerCase().replace(/:\d+$/, "");
  return allowed.includes(name);
}

/* ---------- headers ---------- */

export function securityHeaders(production: boolean): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-src 'self' about:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (production) h["Strict-Transport-Security"] = "max-age=63072000";
  return h;
}
