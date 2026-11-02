import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { chooseProvider } from "./providers.js";
import type { Me } from "./model.js";
import { sampleItems, sampleKanbanItems } from "./sample.js";
import type { RoadmapResponse } from "./model.js";

const app = express();
const { provider, note } = chooseProvider(process.env);
if (note) console.warn(note);

let cache: { at: number; body: RoadmapResponse } | null = null;
const TTL_MS = 60_000;

app.get("/api/health", (_req, res) => res.json({ ok: true, source: provider?.source ?? "sample" }));

let meCache: Me | null = null;
app.get("/api/me", async (_req, res) => {
  if (!provider) return res.json({ name: "Sample user", email: null, source: "sample" } satisfies Me);
  try {
    meCache ??= await provider.fetchMe();
    res.json(meCache);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : `Could not reach ${provider?.name ?? "the data source"}` });
  }
});

app.get("/api/roadmap", async (req, res) => {
  const refresh = req.query.refresh === "1";
  if (cache && !refresh && Date.now() - cache.at < TTL_MS) return res.json(cache.body);
  try {
    let body: RoadmapResponse;
    if (provider) {
      const { items, warnings, boardType } = await provider.fetchRoadmap();
      body = { source: provider.source, boardType, fetchedAt: new Date().toISOString(), items, warnings };
    } else {
      const kanban = process.env.SAMPLE_BOARD === "kanban";
      body = {
        source: "sample",
        boardType: kanban ? "kanban" : "scrum",
        fetchedAt: new Date().toISOString(),
        items: kanban ? sampleKanbanItems : sampleItems,
        warnings: ["Showing sample data. Add Jira or Azure DevOps details to server/.env to see your own work."],
      };
    }
    cache = { at: Date.now(), body };
    res.json(body);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : `Could not reach ${provider?.name ?? "the data source"}` });
  }
});

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Roadmap server on :${port} (${provider ? provider.name : "sample data"})`));
