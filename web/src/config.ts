import type { ItemType } from "./types";

export interface LayerOptions {
  /** Draw this kind of item on the roadmap */
  show: boolean;
  /** Show names (and short descriptions) */
  name: boolean;
  /** Show key dates on the bars */
  dates: boolean;
}

export type DisplayConfig = Record<ItemType, LayerOptions>;

export const LAYERS: Array<{ type: ItemType; label: string; plural: string }> = [
  { type: "version", label: "Release versions", plural: "release versions" },
  { type: "sprint", label: "Sprints", plural: "sprints" },
  { type: "epic", label: "Epics", plural: "Epics" },
  { type: "feature", label: "Features and stories", plural: "features and stories" },
];

export const DEFAULT_CONFIG: DisplayConfig = {
  version: { show: false, name: true, dates: true },
  sprint: { show: false, name: true, dates: true },
  epic: { show: true, name: true, dates: true },
  feature: { show: false, name: true, dates: true },
};

const KEY = "roadmap-display-v1";

export function loadConfig(): DisplayConfig {
  const out: DisplayConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return out;
    const saved = JSON.parse(raw);
    for (const { type } of LAYERS) {
      const s = saved?.[type];
      if (!s || typeof s !== "object") continue;
      if (typeof s.show === "boolean") out[type].show = s.show;
      if (typeof s.name === "boolean") out[type].name = s.name;
      if (typeof s.dates === "boolean") out[type].dates = s.dates;
    }
  } catch {
    // Storage blocked or unreadable: use the defaults.
  }
  return out;
}

export function saveConfig(config: DisplayConfig): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}
