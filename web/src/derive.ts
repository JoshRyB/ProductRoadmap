import { applyEstimates, pd } from "./rows";
import type { BoardType, RoadmapItem } from "./types";

export type Severity = "high" | "medium" | "low";

export interface Insight {
  id: string;
  severity: Severity;
  item: RoadmapItem;
  /** A few words: what is wrong */
  headline: string;
  /** One sentence with the dates involved */
  detail: string;
}

export interface Progress {
  done: number;
  total: number;
}

export interface Derived {
  /** Items with estimated and rolled-up dates filled in */
  items: RoadmapItem[];
  /** Features done out of all Features, by Epic key */
  progress: Map<string, Progress>;
  insights: Insight[];
  /** Insights by item id */
  byItem: Map<string, Insight[]>;
}

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export const fmtIso = (iso: string): string =>
  new Date(pd(iso)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Works out what the roadmap can say without anyone maintaining it:
 * - estimates dates from activity (when switched on)
 * - gives an Epic with no dates the span of its dated Features
 * - counts how many of each Epic's Features are done
 * - lists things that need a look
 */
export function derive(items: RoadmapItem[], opts: { estimate: boolean; today: string; boardType?: BoardType }): Derived {
  const { today } = opts;
  const original = new Map(items.map((i) => [i.id, i]));
  const estimated = opts.estimate ? applyEstimates(items, today) : items;

  const kids = new Map<string, RoadmapItem[]>();
  for (const i of estimated) {
    if (i.type !== "feature" || !i.parentKey) continue;
    const list = kids.get(i.parentKey);
    if (list) list.push(i);
    else kids.set(i.parentKey, [i]);
  }

  const progress = new Map<string, Progress>();
  for (const i of estimated) {
    if (i.type !== "epic" || !i.key) continue;
    const children = kids.get(i.key);
    if (children?.length) progress.set(i.key, { done: children.filter((c) => c.statusCategory === "done").length, total: children.length });
  }

  const list = estimated.map((i) => {
    if (i.type !== "epic" || !i.key || (i.start && i.end)) return i;
    const dated = (kids.get(i.key) ?? []).filter((c) => c.start && c.end && c.end >= c.start);
    if (!dated.length) return i;
    const start = dated.reduce((m, c) => (c.start! < m ? c.start! : m), dated[0].start!);
    const end = dated.reduce((m, c) => (c.end! > m ? c.end! : m), dated[0].end!);
    const s = i.start ?? start;
    const e = i.end ?? end;
    if (e < s) return i;
    return { ...i, start: s, end: e, rolledUp: true };
  });

  const epics = new Map(list.filter((i) => i.type === "epic" && i.key).map((i) => [i.key as string, i]));
  const insights: Insight[] = [];
  const add = (rule: string, severity: Severity, item: RoadmapItem, headline: string, detail: string) =>
    insights.push({ id: `${rule}:${item.id}`, severity, item, headline, detail });

  for (const item of list) {
    if (item.type !== "epic" && item.type !== "feature") continue;
    const orig = original.get(item.id) ?? item;
    const planned = !item.estimated && !item.rolledUp; // dates a person actually set
    const done = item.statusCategory === "done";

    if (item.start && item.end && item.end < item.start && planned) {
      add("inverted", "high", item, "End date is before the start date", `Starts ${fmtIso(item.start)} but ends ${fmtIso(item.end)}.`);
      continue;
    }
    if (planned && !done && item.end && item.end < today) {
      add("overdue", "high", item, "Overdue", `Was due ${fmtIso(item.end)} and is still ${item.status}.`);
    } else if (planned && item.statusCategory === "todo" && item.start && item.start < today) {
      add("late-start", "medium", item, "Should have started", `Planned to start ${fmtIso(item.start)} and is still ${item.status}.`);
    }
    // Kanban teams don't plan by due date, so a missing one is not a problem there.
    if (opts.boardType !== "kanban" && item.statusCategory === "inprogress" && !orig.end) {
      add("no-due", "medium", item, "No due date", "In progress with no planned end date, so it can't be tracked or forecast.");
    }
    if (item.type === "feature" && planned && !done && item.parentKey && item.end) {
      const epic = epics.get(item.parentKey);
      if (epic && !epic.estimated && !epic.rolledUp && epic.end && item.end > epic.end) {
        add("past-epic", "medium", item, "Runs past its Epic", `Ends ${fmtIso(item.end)}, but ${epic.key} is due ${fmtIso(epic.end)}.`);
      }
    }
    if (item.type === "epic" && !done && item.key) {
      const p = progress.get(item.key);
      if (p && p.done === p.total) {
        add("ready", "low", item, "Ready to close", `All ${p.total} ${p.total === 1 ? "feature is" : "features are"} done, but the Epic is still ${item.status}.`);
      }
    }
  }

  insights.sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || (a.item.end ?? "9999").localeCompare(b.item.end ?? "9999") || a.item.title.localeCompare(b.item.title)
  );
  const byItem = new Map<string, Insight[]>();
  for (const n of insights) {
    const arr = byItem.get(n.item.id);
    if (arr) arr.push(n);
    else byItem.set(n.item.id, [n]);
  }
  return { items: list, progress, insights, byItem };
}
