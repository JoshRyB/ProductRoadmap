import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { configFromEnv, fetchMe, fetchRoadmap } from "./jira.js";
import type { Me } from "./jira.js";
import { sampleItems } from "./sample.js";
import type { RoadmapResponse } from "./model.js";

const app = express();
const jira = configFromEnv(process.env);

let cache: { at: number; body: RoadmapResponse } | null = null;
const TTL_MS = 60_000;

app.get("/api/health", (_req, res) => res.json({ ok: true, jira: Boolean(jira) }));

let meCache: Me | null = null;
app.get("/api/me", async (_req, res) => {
  if (!jira) return res.json({ name: "Sample user", email: null, source: "sample" } satisfies Me);
  try {
    meCache ??= await fetchMe(jira);
    res.json(meCache);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Could not reach Jira" });
  }
});

app.get("/api/roadmap", async (req, res) => {
  const refresh = req.query.refresh === "1";
  if (cache && !refresh && Date.now() - cache.at < TTL_MS) return res.json(cache.body);
  try {
    let body: RoadmapResponse;
    if (jira) {
      const { items, warnings } = await fetchRoadmap(jira);
      body = { source: "jira", fetchedAt: new Date().toISOString(), items, warnings };
    } else {
      body = {
        source: "sample",
        fetchedAt: new Date().toISOString(),
        items: sampleItems,
        warnings: ["Showing sample data. Add Jira details to server/.env to see your own Epics."],
      };
    }
    cache = { at: Date.now(), body };
    res.json(body);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Could not reach Jira" });
  }
});

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Roadmap server on :${port} (${jira ? "Jira" : "sample data"})`));
