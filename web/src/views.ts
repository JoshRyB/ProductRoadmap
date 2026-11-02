import { DEFAULT_CONFIG, LAYERS } from "./config";
import type { DisplayConfig } from "./config";
import type { ItemType } from "./types";

/** Everything that makes one screen different from another. */
export interface ViewState {
  layers: DisplayConfig;
  /** undefined leaves the "estimate missing dates" setting as it is */
  estimate?: boolean;
  /** "all" or "none" of the Epics collapsed, or exactly these Epic keys */
  collapsed: "all" | "none" | string[];
}

export interface NamedView {
  id: string;
  name: string;
  description: string;
  state: ViewState;
}

export interface SavedView {
  id: string;
  name: string;
  state: ViewState;
}

const layersWith = (show: ItemType[]): DisplayConfig => {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DisplayConfig;
  for (const { type } of LAYERS) c[type] = { show: show.includes(type), name: true, dates: true };
  return c;
};

export const BUILTIN_VIEWS: NamedView[] = [
  {
    id: "executive",
    name: "Executive summary",
    description: "Releases and Epics. No detail.",
    state: { layers: layersWith(["version", "epic"]), collapsed: "none" },
  },
  {
    id: "delivery",
    name: "Delivery detail",
    description: "Sprints, Epics and all their Features.",
    state: { layers: layersWith(["sprint", "epic", "feature"]), collapsed: "none" },
  },
  {
    id: "epics-collapsed",
    name: "Epics, expandable",
    description: "Epics and Features, with the Features tucked away.",
    state: { layers: layersWith(["epic", "feature"]), collapsed: "all" },
  },
];

/* ---------- checking input ---------- */

const KEY_RE = /^[A-Za-z0-9_.-]{1,40}$/;

/** Accepts only a well-formed view and rebuilds it, so nothing unexpected gets through. */
export function parseViewState(raw: unknown): ViewState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const layersIn = r.layers as Record<string, unknown> | undefined;
  if (!layersIn || typeof layersIn !== "object") return null;
  const layers = {} as DisplayConfig;
  for (const { type } of LAYERS) {
    const l = layersIn[type] as Record<string, unknown> | undefined;
    if (!l || typeof l.show !== "boolean" || typeof l.name !== "boolean" || typeof l.dates !== "boolean") return null;
    layers[type] = { show: l.show, name: l.name, dates: l.dates };
  }
  let collapsed: ViewState["collapsed"] = "none";
  if (r.collapsed === "all" || r.collapsed === "none") collapsed = r.collapsed;
  else if (Array.isArray(r.collapsed)) {
    collapsed = r.collapsed.filter((k): k is string => typeof k === "string" && KEY_RE.test(k)).slice(0, 200);
  } else if (r.collapsed !== undefined) return null;
  const state: ViewState = { layers, collapsed };
  if (typeof r.estimate === "boolean") state.estimate = r.estimate;
  return state;
}

/* ---------- links ---------- */

const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
};

/** A link can carry the screen setup, but only "all" or "none" for collapsed Epics. */
export function encodeView(state: ViewState): string {
  const collapsed = state.collapsed === "all" ? "all" : "none";
  return toB64(JSON.stringify({ layers: state.layers, estimate: state.estimate, collapsed }));
}

export function decodeView(text: string): ViewState | null {
  try {
    if (text.length > 4000) return null;
    return parseViewState(JSON.parse(fromB64(text)));
  } catch {
    return null;
  }
}

/** Reads `#/?view=...` and returns the view it carries, if any. */
export function viewFromHash(hash: string): ViewState | null {
  const q = hash.indexOf("?");
  if (q === -1) return null;
  const v = new URLSearchParams(hash.slice(q + 1)).get("view");
  return v ? decodeView(v) : null;
}

/* ---------- saved views in the browser ---------- */

const KEY = "roadmap-views-v1";
export const MAX_SAVED_VIEWS = 12;

export function loadSavedViews(): SavedView[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const out: SavedView[] = [];
    for (const v of list) {
      const state = parseViewState(v?.state);
      if (state && typeof v.id === "string" && typeof v.name === "string" && v.name.trim()) {
        out.push({ id: v.id.slice(0, 40), name: v.name.trim().slice(0, 40), state });
      }
    }
    return out.slice(0, MAX_SAVED_VIEWS);
  } catch {
    return [];
  }
}

export function storeSavedViews(views: SavedView[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(views));
  } catch {
    // Storage blocked: views last for this visit only.
  }
}

/** Adds a view, or replaces the one with the same name. Returns null when the name is empty or the list is full. */
export function upsertView(list: SavedView[], name: string, state: ViewState, newId: () => string): SavedView[] | null {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const i = list.findIndex((v) => v.name.toLowerCase() === clean.toLowerCase());
  if (i >= 0) return list.map((v, j) => (j === i ? { ...v, name: clean, state } : v));
  if (list.length >= MAX_SAVED_VIEWS) return null;
  return [...list, { id: newId(), name: clean, state }];
}

/* ---------- which view is on screen ---------- */

export function sameLayers(a: DisplayConfig, b: DisplayConfig): boolean {
  return LAYERS.every(({ type }) => a[type].show === b[type].show && a[type].name === b[type].name && a[type].dates === b[type].dates);
}

/** What the current collapse state amounts to, given the Epics that could be collapsed. */
export function collapsedMode(collapsed: Set<string>, collapsible: string[]): ViewState["collapsed"] {
  if (collapsible.length === 0 || collapsible.every((k) => !collapsed.has(k))) return "none";
  if (collapsible.every((k) => collapsed.has(k))) return "all";
  return collapsible.filter((k) => collapsed.has(k));
}

/**
 * Returns the first view whose setup matches the screen. On Kanban projects Sprints can't be shown,
 * so that layer is ignored. Collapsing only matters while Features are shown.
 */
export function matchView<T extends { state: ViewState }>(
  current: ViewState,
  candidates: T[],
  kanban: boolean
): T | null {
  const norm = (c: DisplayConfig): DisplayConfig => (kanban ? { ...c, sprint: { ...c.sprint, show: false } } : c);
  for (const cand of candidates) {
    if (!sameLayers(norm(current.layers), norm(cand.state.layers))) continue;
    if (cand.state.estimate !== undefined && current.estimate !== undefined && cand.state.estimate !== current.estimate) continue;
    if (current.layers.feature.show) {
      const a = current.collapsed;
      const b = cand.state.collapsed;
      const same = typeof a === "string" || typeof b === "string" ? a === b : a.length === b.length && a.every((k) => b.includes(k));
      if (!same) continue;
    }
    return cand;
  }
  return null;
}
