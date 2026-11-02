import { randomBytes } from "node:crypto";

export interface Settings {
  production: boolean;
  /** Which network address to listen on. Only this computer by default. */
  host: string;
  port: number;
  /** The app sits behind a host's HTTPS front door, so addresses and "https" come from its headers */
  trustProxy: boolean;
  /** Host names the app answers to. Empty means any. */
  allowedHosts: string[];
  /** The shared password, or null when there is no password gate */
  password: string | null;
  sessionSecret: string;
  sessionTtlMs: number;
  /** Folder with the built web app, or null when there isn't one */
  webRoot: string | null;
}

export interface SettingsResult {
  settings: Settings;
  /** Things that stop the app starting */
  errors: string[];
  /** Things worth knowing */
  warnings: string[];
}

const bool = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";

/**
 * Reads the settings and checks them. The rule that matters: in production, real work data is never
 * served without a password, and the session signing secret is a proper one.
 */
export function readSettings(
  env: Record<string, string | undefined>,
  hasProvider: boolean,
  defaultWebRoot: string
): SettingsResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === "production";
  const password = env.ACCESS_PASSWORD ? env.ACCESS_PASSWORD : null;

  if (production && hasProvider && !password) {
    errors.push(
      "ACCESS_PASSWORD is not set. Online, this app would show your work data to anyone who finds the address. " +
        "Set ACCESS_PASSWORD (at least 12 characters) and SESSION_SECRET (at least 32 characters)."
    );
  }
  if (password) {
    if (production && password.length < 12) errors.push("ACCESS_PASSWORD must be at least 12 characters when hosted.");
    else if (password.length < 8) warnings.push("ACCESS_PASSWORD is short. Use at least 12 characters.");
  }

  let sessionSecret = env.SESSION_SECRET ?? "";
  if (password) {
    if (production && sessionSecret.length < 32) {
      errors.push("SESSION_SECRET must be set to a random value of at least 32 characters when hosted.");
    } else if (sessionSecret.length < 32) {
      sessionSecret = randomBytes(32).toString("hex");
      warnings.push("SESSION_SECRET is not set, so everyone is signed out whenever the server restarts.");
    }
  } else {
    sessionSecret = sessionSecret || randomBytes(32).toString("hex");
  }

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push(`PORT "${env.PORT}" is not a valid port number.`);

  const hours = Number(env.SESSION_HOURS ?? 12);
  const ttlHours = Number.isFinite(hours) && hours > 0 && hours <= 24 * 30 ? hours : 12;

  const hosts = (env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  // On your own computer, only accept requests addressed to it. That blocks a web page from reaching the app through your browser.
  const allowedHosts = hosts.length ? hosts : production ? [] : ["localhost", "127.0.0.1", "[::1]"];

  const host = env.HOST || "127.0.0.1";
  if (!production && host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && !password && hasProvider) {
    warnings.push(`HOST=${host} makes the app reachable from other computers and there is no password. Set ACCESS_PASSWORD.`);
  }

  return {
    settings: {
      production,
      host,
      port,
      trustProxy: bool(env.TRUST_PROXY),
      allowedHosts,
      password,
      sessionSecret,
      sessionTtlMs: ttlHours * 3_600_000,
      webRoot: env.WEB_ROOT || defaultWebRoot,
    },
    errors,
    warnings,
  };
}
