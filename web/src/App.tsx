import { useCallback, useEffect, useState } from "react";
import { Gantt } from "./Gantt";
import type { RoadmapResponse } from "./types";

export function App() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Product roadmap</h1>
          <div className="sub">
            {data ? (
              <>
                <span className={`badge ${data.source}`}>{data.source === "jira" ? "Live from Jira" : "Sample data"}</span>
                {" "}
                {data.items.length} Epics · updated {new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </>
            ) : (
              "Loading…"
            )}
          </div>
        </div>
        <button className="btn" onClick={() => load(true)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh from Jira"}
        </button>
      </header>

      {error && <div className="alert" role="alert">Couldn't load the roadmap. {error}</div>}
      {data?.warnings.map((w) => (
        <div className="note" key={w}>{w}</div>
      ))}
      {data && <Gantt items={data.items} />}
    </div>
  );
}
