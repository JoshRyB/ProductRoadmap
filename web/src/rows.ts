import type { DisplayConfig } from "./config";
import type { BoardType, ItemType, RoadmapItem } from "./types";

export const DAY = 864e5;

export const pd = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const isoDay = (t: number): string => new Date(t).toISOString().slice(0, 10);

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

/**
 * Fills in missing dates for Epics and Features from what actually happened, so work with no
 * planned dates (typical on Kanban boards) can still be drawn. Items not yet started are left alone.
 * Anything this changes is flagged `estimated` so it can be drawn differently.
 */
export function applyEstimates(items: RoadmapItem[], todayIso: string): RoadmapItem[] {
  return items.map((item) => {
    if ((item.type !== "epic" && item.type !== "feature") || (item.start && item.end) || !item.activity) return item;
    const a = item.activity;
    let start = item.start;
    let end = item.end;
    if (item.statusCategory === "inprogress") {
      start = start ?? a.statusChanged;
      end = end ?? (start ? todayIso : null);
    } else if (item.statusCategory === "done") {
      end = end ?? a.resolved ?? a.statusChanged;
      start = start ?? a.created;
    }
    if (!start || !end || end < start) return item;
    return { ...item, start, end, estimated: true };
  });
}

export type Row =
  | { kind: "section"; type: ItemType; label: string; count: number }
  | { kind: "item"; item: RoadmapItem; indent: boolean };

const sortKey = (i: RoadmapItem) => pd((i.start ?? i.end) as string);
const byDate = (a: RoadmapItem, b: RoadmapItem) => sortKey(a) - sortKey(b) || a.title.localeCompare(b.title);

export interface Pinned {
  type: ItemType;
  label: string;
  items: RoadmapItem[];
}

export interface Built {
  rows: Row[];
  /** One compact lane kept under the timeline header: sprints, or releases on a Kanban project */
  pinned: Pinned | null;
  unscheduled: RoadmapItem[];
}

export interface BuildOptions {
  boardType?: BoardType;
  /** estimate missing dates from activity */
  estimate?: boolean;
  /** YYYY-MM-DD, for estimates of work still in progress */
  today?: string;
}

export function buildRows(items: RoadmapItem[], config: DisplayConfig, opts: BuildOptions = {}): Built {
  const kanban = opts.boardType === "kanban";
  const source = opts.estimate ? applyEstimates(items, opts.today ?? isoDay(Date.now())) : items;

  const rows: Row[] = [];
  const unscheduled: RoadmapItem[] = [];
  const of = (t: ItemType) => source.filter((i) => i.type === t);
  const split = (list: RoadmapItem[]) => {
    const placed = list.filter((i) => place(i)).sort(byDate);
    for (const i of list) if (!place(i)) unscheduled.push(i);
    return placed;
  };

  let pinned: Pinned | null = null;

  if (config.version.show) {
    const v = split(of("version"));
    if (kanban) {
      // No sprints on a Kanban project, so releases take the compact pinned lane.
      if (v.length) pinned = { type: "version", label: "Releases", items: v };
    } else if (v.length) {
      rows.push({ kind: "section", type: "version", label: "Release versions", count: v.length });
      v.forEach((item) => rows.push({ kind: "item", item, indent: false }));
    }
  }

  if (config.sprint.show && !kanban) {
    const sp = split(of("sprint"));
    if (sp.length) pinned = { type: "sprint", label: "Sprints", items: sp };
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

  return { rows, pinned, unscheduled };
}
