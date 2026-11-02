import type { DisplayConfig } from "./config";
import type { ItemType, RoadmapItem } from "./types";

export const DAY = 864e5;

export const pd = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export interface Placement {
  /** start of the bar, UTC ms */
  s: number;
  /** end of the bar (exclusive), UTC ms */
  e: number;
  /** a single date drawn as a diamond (a release with only a release date) */
  milestone: boolean;
  /** the end date is before the start date */
  bad: boolean;
}

export function place(item: RoadmapItem): Placement | null {
  if (item.start && item.end) {
    const s = pd(item.start);
    const e = pd(item.end) + DAY;
    return { s, e, milestone: false, bad: e <= s };
  }
  if (item.type === "version" && item.end) {
    const s = pd(item.end);
    return { s, e: s + DAY, milestone: true, bad: false };
  }
  return null;
}

export type Row =
  | { kind: "section"; type: ItemType; label: string; count: number }
  | { kind: "item"; item: RoadmapItem; indent: boolean };

const sortKey = (i: RoadmapItem) => pd((i.start ?? i.end) as string);
const byDate = (a: RoadmapItem, b: RoadmapItem) => sortKey(a) - sortKey(b) || a.title.localeCompare(b.title);

export function buildRows(items: RoadmapItem[], config: DisplayConfig): { rows: Row[]; unscheduled: RoadmapItem[] } {
  const rows: Row[] = [];
  const unscheduled: RoadmapItem[] = [];
  const of = (t: ItemType) => items.filter((i) => i.type === t);
  const split = (list: RoadmapItem[]) => {
    const placed = list.filter((i) => place(i)).sort(byDate);
    for (const i of list) if (!place(i)) unscheduled.push(i);
    return placed;
  };

  if (config.version.show) {
    const v = split(of("version"));
    if (v.length) {
      rows.push({ kind: "section", type: "version", label: "Release versions", count: v.length });
      v.forEach((item) => rows.push({ kind: "item", item, indent: false }));
    }
  }

  if (config.sprint.show) {
    const s = split(of("sprint"));
    if (s.length) {
      rows.push({ kind: "section", type: "sprint", label: "Sprints", count: s.length });
      s.forEach((item) => rows.push({ kind: "item", item, indent: false }));
    }
  }

  const epics = config.epic.show ? split(of("epic")) : [];
  const features = config.feature.show ? split(of("feature")) : [];

  if (epics.length && features.length) {
    // Epics as lanes, with their features nested underneath.
    rows.push({ kind: "section", type: "epic", label: "Epics and their features", count: epics.length });
    const epicKeys = new Set(epics.map((e) => e.key));
    for (const epic of epics) {
      rows.push({ kind: "item", item: epic, indent: false });
      features
        .filter((f) => f.parentKey === epic.key)
        .forEach((item) => rows.push({ kind: "item", item, indent: true }));
    }
    const loose = features.filter((f) => !f.parentKey || !epicKeys.has(f.parentKey));
    if (loose.length) {
      rows.push({ kind: "section", type: "feature", label: "Features without a scheduled Epic", count: loose.length });
      loose.forEach((item) => rows.push({ kind: "item", item, indent: false }));
    }
  } else if (epics.length) {
    rows.push({ kind: "section", type: "epic", label: "Epics", count: epics.length });
    epics.forEach((item) => rows.push({ kind: "item", item, indent: false }));
  } else if (features.length) {
    rows.push({ kind: "section", type: "feature", label: "Features and stories", count: features.length });
    features.forEach((item) => rows.push({ kind: "item", item, indent: false }));
  }

  return { rows, unscheduled };
}
