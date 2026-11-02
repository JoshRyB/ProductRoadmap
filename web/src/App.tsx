import { useCallback, useEffect, useMemo, useState } from "react";
import { DisplayPanel } from "./DisplayPanel";
import { Gantt } from "./Gantt";
import { LAYERS, loadConfig, saveConfig } from "./config";
import type { DisplayConfig } from "./config";
import type { ItemType, RoadmapResponse } from "./types";

export function App() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DisplayConfig>(loadConfig);
  const [panelOpen, setPanelOpen] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/roadmap${refresh ? "?refresh=1" : ""}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body as RoadmapResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (next: DisplayConfig) => {
    setConfig(next);
    saveConfig(next);
  };

  const counts = useMemo(() => {
    const c: Record<ItemType, number> = { version: 0, sprint: 0, epic: 0, feature: 0 };
    for (const i of data?.items ?? []) c[i.type]++;
    return c;
  }, [data]);

  const shownLayers = LAYERS.filter((l) => config[l.type].show);

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Product roadmap</h1>
          <div className="sub">
            {data ? (
              <>
                <span className={`badge ${data.source}`}>{data.source === "jira" ? "Live from Jira" : "Sample data"}</span>{" "}
                {shownLayers.length === 0
                  ? "Nothing selected"
                  : shownLayers.map((l) => `${counts[l.type]} ${l.plural}`).join(" · ")}
                {" · "}updated {new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </>
            ) : (
              "Loading…"
            )}
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn"
            aria-expanded={panelOpen}
            aria-controls="display-panel"
            onClick={() => setPanelOpen((o) => !o)}
          >
            Display options
          </button>
          <button type="button" className="btn" onClick={() => load(true)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh from Jira"}
          </button>
        </div>
      </header>

      <div id="display-panel" hidden={!panelOpen}>
        <DisplayPanel config={config} counts={counts} onChange={update} />
      </div>

      {error && <div className="alert" role="alert">Couldn't load the roadmap. {error}</div>}
      {data?.warnings.map((w) => (
        <div className="note" key={w}>{w}</div>
      ))}
      {data && <Gantt items={data.items} config={config} />}
    </div>
  );
}
