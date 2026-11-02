import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Turns a request path into a file inside the web folder, or null when it isn't allowed.
 * Refuses anything that climbs out of the folder, dot files, and odd characters.
 */
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((s) => s === ".." || s === "." || s.startsWith("."))) return null;
  const file = path.resolve(root, ...segments);
  const base = path.resolve(root);
  return file === base || file.startsWith(base + path.sep) ? file : null;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

function send(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

/** Serves the built web app. Anything that isn't a file and looks like a page address gets the app's front page. */
export async function serveStatic(root: string | null, urlPath: string, method: string, res: ServerResponse): Promise<void> {
  if (!root) return send(res, 404, "The web app hasn't been built. Run npm run build.");
  const wanted = resolveInside(root, urlPath);
  if (!wanted) return send(res, 404, "Not found");

  let file = wanted;
  const looksLikeFile = path.extname(urlPath) !== "";
  if (!(await isFile(file))) {
    if (looksLikeFile) return send(res, 404, "Not found");
    file = path.join(root, "index.html");
    if (!(await isFile(file))) return send(res, 404, "The web app hasn't been built. Run npm run build.");
  }

  const size = (await stat(file)).size;
  const hashed = urlPath.startsWith("/assets/");
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": size,
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
  });
  if (method === "HEAD") return void res.end();
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
}
