import { useCallback, useEffect, useMemo, useState } from "react";
import { Gantt } from "./Gantt";
import { SettingsPage } from "./SettingsPage";
import { UserMenu } from "./UserMenu";
import { LAYERS, loadConfig, saveConfig } from "./config";
import type { DisplayConfig } from "./config";
import type { ItemType, Me, RoadmapResponse } from "./types";

const viewFromHash = () => (window.location.hash === "#/settings" ? "settings" : "roadmap");

export function App() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DisplayConfig>(loadConfig);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<"roadmap" | "settings">(viewFromHash);

  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => setMe(m as Me | null))
      .catch(() => setMe(null));
  }, [load]);

  const update = (next: DisplayConfig) => {
    setConfig(next);
    saveConfig(next);
  };

  const toggleEpic = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const setAllEpics = (keys: string[], collapse: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (collapse) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const counts = useMemo(() => {
    const c: Record<ItemType, number> = { version: 0, sprint: 0, epic: 0, feature: 0 };
    for (const i of data?.items ?? []) c[i.type]++;
    return c;
  }, [data]);

  if (view === "settings") {
    return <SettingsPage config={config} counts={counts} me={me} source={data?.source ?? null} onChange={update} />;
  }

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
          <button type="button" className="btn" onClick={() => load(true)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh from Jira"}
          </button>
          <UserMenu me={me} />
        </div>
      </header>

      {error && <div className="alert" role="alert">Couldn't load the roadmap. {error}</div>}
      {data?.warnings.map((w) => (
        <div className="note" key={w}>{w}</div>
      ))}
      {data && (
        <Gantt items={data.items} config={config} collapsed={collapsed} onToggleEpic={toggleEpic} onSetAll={setAllEpics} />
      )}
    </div>
  );
}
