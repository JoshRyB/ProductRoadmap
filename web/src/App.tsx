import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gantt } from "./Gantt";
import { SettingsPage } from "./SettingsPage";
import { ShareMenu } from "./ShareMenu";
import { UserMenu } from "./UserMenu";
import { ViewsMenu } from "./ViewsMenu";
import { DEFAULT_CONFIG, LAYERS, clearSavedChoices, hasSavedConfig, loadConfig, loadEstimate, saveConfig, saveEstimate } from "./config";
import type { DisplayConfig } from "./config";
import { renderSvg } from "./exportSvg";
import { downloadBlob, printSvg, slug, svgBlob, svgToPngBlob } from "./exportFiles";
import { isoDay } from "./rows";
import type { ItemType, Me, RoadmapResponse } from "./types";
import {
  BUILTIN_VIEWS, MAX_SAVED_VIEWS, collapsedMode, encodeView, loadSavedViews, matchView, storeSavedViews, upsertView, viewFromHash,
} from "./views";
import type { SavedView, ViewState } from "./views";

const routeFromHash = (): "roadmap" | "settings" => (window.location.hash.startsWith("#/settings") ? "settings" : "roadmap");
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function App() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DisplayConfig>(loadConfig);
  const [configSaved, setConfigSaved] = useState<boolean>(hasSavedConfig);
  const [estimateChoice, setEstimateChoice] = useState<boolean | null>(loadEstimate);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [pendingCollapseAll, setPendingCollapseAll] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>(loadSavedViews);
  const [view, setView] = useState<"roadmap" | "settings">(routeFromHash);

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

  const boardType = data?.boardType ?? "unknown";
  const kanban = boardType === "kanban";

  // On a Kanban project there are no sprints, and (until the person chooses) releases and
  // estimated dates are on by default because dates are often left blank there.
  const effective = useMemo<DisplayConfig>(() => {
    if (!kanban) return config;
    const c: DisplayConfig = { ...config, sprint: { ...config.sprint, show: false } };
    if (!configSaved) c.version = { ...c.version, show: true };
    return c;
  }, [config, kanban, configSaved]);
  const estimate = estimateChoice ?? kanban;

  const update = (next: DisplayConfig) => {
    // Don't save the forced "no sprints" as the person's own choice.
    const toSave: DisplayConfig = kanban ? { ...next, sprint: config.sprint } : next;
    setConfig(toSave);
    saveConfig(toSave);
    setConfigSaved(true);
  };
  const updateEstimate = (on: boolean) => {
    setEstimateChoice(on);
    saveEstimate(on);
  };
  const reset = () => {
    clearSavedChoices();
    setConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
    setConfigSaved(false);
    setEstimateChoice(null);
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

  // ----- views -----
  const collapsibleKeys = useMemo(() => {
    const withKids = new Set((data?.items ?? []).filter((i) => i.type === "feature" && i.parentKey).map((i) => i.parentKey as string));
    return (data?.items ?? []).filter((i) => i.type === "epic" && i.key && withKids.has(i.key)).map((i) => i.key as string);
  }, [data]);

  const currentState = useMemo<ViewState>(
    () => ({ layers: effective, estimate, collapsed: collapsedMode(collapsed, collapsibleKeys) }),
    [effective, estimate, collapsed, collapsibleKeys]
  );
  const matched = useMemo(
    () => matchView(currentState, [...savedViews, ...BUILTIN_VIEWS], kanban),
    [currentState, savedViews, kanban]
  );
  const viewName = matched ? matched.name : "Custom";

  const applyView = (v: ViewState) => {
    const layers: DisplayConfig = kanban ? { ...v.layers, sprint: config.sprint } : v.layers;
    setConfig(layers);
    saveConfig(layers);
    setConfigSaved(true);
    if (v.estimate !== undefined) updateEstimate(v.estimate);
    if (v.collapsed === "none") setCollapsed(new Set());
    else if (v.collapsed === "all") setPendingCollapseAll(true);
    else setCollapsed(new Set(v.collapsed));
  };
  // Collapsing "all" needs the data, which may not have arrived yet when a link is opened.
  useEffect(() => {
    if (pendingCollapseAll && data) {
      setCollapsed(new Set(collapsibleKeys));
      setPendingCollapseAll(false);
    }
  }, [pendingCollapseAll, data, collapsibleKeys]);

  const applyRef = useRef(applyView);
  applyRef.current = applyView;

  // Follow the address: the Settings screen, and links that carry a view.
  useEffect(() => {
    const onHash = () => {
      const fromLink = viewFromHash(window.location.hash);
      if (fromLink) {
        applyRef.current(fromLink);
        window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/");
      }
      setView(routeFromHash());
      window.scrollTo(0, 0);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const saveView = (name: string): string | null => {
    if (!name.trim()) return "Enter a name for the view.";
    const next = upsertView(savedViews, name, currentState, newId);
    if (!next) return `You can keep up to ${MAX_SAVED_VIEWS} views. Delete one first.`;
    setSavedViews(next);
    storeSavedViews(next);
    return null;
  };
  const deleteView = (id: string) => {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    storeSavedViews(next);
  };

  // ----- sharing -----
  const link = `${window.location.origin}${window.location.pathname}#/?view=${encodeView(currentState)}`;
  const buildExport = () => {
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const r = renderSvg({
      items: data?.items ?? [],
      config: effective,
      boardType,
      estimate,
      collapsed,
      title: "Product roadmap",
      viewName,
      sourceLabel: data?.source === "jira" ? "Source: Jira (read-only)" : "Sample data",
      today,
    });
    return { ...r, file: `roadmap-${slug(viewName)}-${isoDay(today)}` };
  };
  const exportPng = async () => {
    const r = buildExport();
    downloadBlob(await svgToPngBlob(r.svg, r.width, r.height), `${r.file}.png`);
  };
  const exportSvg = () => {
    const r = buildExport();
    downloadBlob(svgBlob(r.svg), `${r.file}.svg`);
  };
  const exportPdf = () => {
    const r = buildExport();
    printSvg(r.svg, `Product roadmap - ${viewName}`);
  };

  if (view === "settings") {
    return (
      <SettingsPage
        config={effective}
        counts={counts}
        me={me}
        source={data?.source ?? null}
        boardType={boardType}
        estimate={estimate}
        onChange={update}
        onEstimate={updateEstimate}
        onReset={reset}
      />
    );
  }

  const shownLayers = LAYERS.filter((l) => effective[l.type].show);

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
          <ViewsMenu
            saved={savedViews}
            matchedId={matched?.id ?? null}
            matchedName={matched?.name ?? null}
            onApply={applyView}
            onSave={saveView}
            onDelete={deleteView}
          />
          <ShareMenu disabled={!data} link={link} onPng={exportPng} onSvg={exportSvg} onPdf={exportPdf} />
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
        <Gantt
          items={data.items}
          config={effective}
          boardType={boardType}
          estimate={estimate}
          collapsed={collapsed}
          collapsibleKeys={collapsibleKeys}
          onToggleEpic={toggleEpic}
          onSetAll={setAllEpics}
        />
      )}
    </div>
  );
}
