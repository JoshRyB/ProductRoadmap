import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "./config.js";
import type { DisplayConfig } from "./config.js";
import { applyEstimates, buildRows, place } from "./rows.js";
import type { Activity, ItemType, RoadmapItem, StatusCategory } from "./types.js";

let n = 0;
function mk(
  type: ItemType,
  title: string,
  start: string | null,
  end: string | null,
  parentKey: string | null = null,
  key: string | null = null,
  extra: { cat?: StatusCategory; activity?: Activity | null } = {}
): RoadmapItem {
  return {
    id: String(++n), key, title, description: null, type, status: "To do", statusCategory: extra.cat ?? "todo",
    start, end, parentKey, activity: extra.activity ?? null, url: null, source: "sample",
  };
}

const items: RoadmapItem[] = [
  mk("version", "v1", "2026-10-28", "2026-12-18"),
  mk("version", "v2 milestone", null, "2027-02-26"),
  mk("version", "v3 nothing", null, null),
  mk("sprint", "Sprint 1", "2026-10-28", "2026-11-10"),
  mk("epic", "APIs", "2026-10-29", "2026-12-31", null, "E-8"),
  mk("epic", "UI", "2026-10-28", "2026-12-04", null, "E-6"),
  mk("epic", "Mobile", null, null, null, "E-10"),
  mk("feature", "Link", "2026-11-11", "2026-11-24", "E-8", "F-7"),
  mk("feature", "Gantt", "2026-10-28", "2026-11-10", "E-6", "F-5"),
  mk("feature", "Orphan", "2026-11-01", "2026-11-05", null, "F-9"),
  mk("feature", "Under mobile", "2026-11-01", "2026-11-05", "E-10", "F-10"),
  mk("feature", "Undated", null, "2026-11-05", "E-8", "F-11"),
];

const cfg = (show: Partial<Record<ItemType, boolean>>): DisplayConfig => {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DisplayConfig;
  (Object.keys(c) as ItemType[]).forEach((t) => (c[t].show = Boolean(show[t])));
  return c;
};
const titles = (rows: ReturnType<typeof buildRows>["rows"]) =>
  rows.map((r) => (r.kind === "section" ? `# ${r.label}` : `${r.indent ? "  " : ""}${r.item.title}`));

test("place: bar, milestone for versions only, and nothing for one-sided dates", () => {
  assert.equal(place(items[0])!.milestone, false);
  assert.equal(place(items[1])!.milestone, true);
  assert.equal(place(items[2]), null);
  assert.equal(place(mk("epic", "x", null, "2026-12-01")), null);
  assert.equal(place(mk("epic", "x", "2026-12-05", "2026-12-01"))!.bad, true);
});

test("nothing selected draws nothing", () => {
  const r = buildRows(items, cfg({}));
  assert.deepEqual(r.rows, []);
  assert.equal(r.pinned, null);
  assert.deepEqual(r.unscheduled, []);
});

test("epics only: sorted by start, unscheduled epic listed separately", () => {
  const r = buildRows(items, cfg({ epic: true }));
  assert.deepEqual(titles(r.rows), ["# Epics", "UI", "APIs"]);
  assert.deepEqual(r.unscheduled.map((i) => i.title), ["Mobile"]);
});

test("versions on a scrum project: rows, milestone drawn, undated one unscheduled", () => {
  const r = buildRows(items, cfg({ version: true }), { boardType: "scrum" });
  assert.deepEqual(titles(r.rows), ["# Release versions", "v1", "v2 milestone"]);
  assert.equal(r.pinned, null);
  assert.deepEqual(r.unscheduled.map((i) => i.title), ["v3 nothing"]);
});

test("epics and features: features nest under their epic, strays get their own group", () => {
  const r = buildRows(items, cfg({ epic: true, feature: true }));
  assert.deepEqual(titles(r.rows), [
    "# Epics and their features",
    "UI", "  Gantt",
    "APIs", "  Link",
    "# Features without a scheduled Epic",
    "Orphan", "Under mobile",
  ]);
  assert.deepEqual(r.unscheduled.map((i) => i.title).sort(), ["Mobile", "Undated"]);
});

test("features only: flat list", () => {
  const r = buildRows(items, cfg({ feature: true }));
  assert.deepEqual(titles(r.rows), ["# Features and stories", "Gantt", "Orphan", "Under mobile", "Link"]);
});

test("sprints go in the pinned lane, not rows, and unscheduled sprints are listed", () => {
  const all = [...items, mk("sprint", "Sprint 0", "2026-10-14", "2026-10-27"), mk("sprint", "No dates", null, null)];
  const r = buildRows(all, cfg({ sprint: true }), { boardType: "scrum" });
  assert.deepEqual(r.rows, []);
  assert.equal(r.pinned!.type, "sprint");
  assert.deepEqual(r.pinned!.items.map((i) => i.title), ["Sprint 0", "Sprint 1"]);
  assert.deepEqual(r.unscheduled.map((i) => i.title), ["No dates"]);
});

test("everything on keeps the section order versions, epics, features (sprints are pinned)", () => {
  const r = buildRows(items, cfg({ version: true, sprint: true, epic: true, feature: true }), { boardType: "scrum" });
  const sections = r.rows.filter((x) => x.kind === "section").map((x) => (x as { label: string }).label);
  assert.deepEqual(sections, ["Release versions", "Epics and their features", "Features without a scheduled Epic"]);
  assert.equal(r.pinned!.items.length, 1);
});

test("kanban: releases take the pinned lane and sprints are ignored", () => {
  const r = buildRows(items, cfg({ version: true, sprint: true }), { boardType: "kanban" });
  assert.deepEqual(r.rows, []);
  assert.equal(r.pinned!.type, "version");
  assert.equal(r.pinned!.label, "Releases");
  assert.deepEqual(r.pinned!.items.map((i) => i.title), ["v1", "v2 milestone"]);
  assert.deepEqual(r.unscheduled.map((i) => i.title), ["v3 nothing"]);
});

const act = (created: string, statusChanged: string | null, resolved: string | null = null): Activity => ({ created, statusChanged, resolved });

test("estimates: in progress runs from when it started to today; done from created to resolved; to do is left alone", () => {
  const list = [
    mk("feature", "doing", null, null, null, "A", { cat: "inprogress", activity: act("2026-09-01", "2026-10-05") }),
    mk("feature", "done", null, null, null, "B", { cat: "done", activity: act("2026-07-01", "2026-09-30", "2026-09-30") }),
    mk("feature", "queued", null, null, null, "C", { cat: "todo", activity: act("2026-09-15", null) }),
    mk("epic", "due only", null, "2026-12-18", null, "D", { cat: "inprogress", activity: act("2026-09-10", "2026-10-19") }),
    mk("epic", "planned", "2026-11-01", "2026-12-01", null, "E", { cat: "inprogress", activity: act("2026-09-10", "2026-10-19") }),
  ];
  const out = applyEstimates(list, "2026-11-02");
  const by = (t: string) => out.find((i) => i.title === t)!;
  assert.deepEqual([by("doing").start, by("doing").end, by("doing").estimated], ["2026-10-05", "2026-11-02", true]);
  assert.deepEqual([by("done").start, by("done").end, by("done").estimated], ["2026-07-01", "2026-09-30", true]);
  assert.deepEqual([by("queued").start, by("queued").end, by("queued").estimated], [null, null, undefined]);
  assert.deepEqual([by("due only").start, by("due only").end], ["2026-10-19", "2026-12-18"]);
  assert.equal(by("planned").estimated, undefined);
  assert.equal(list[0].start, null, "input is not changed");
});

test("estimates: no activity, or an end before the start, is not invented", () => {
  const list = [
    mk("feature", "no activity", null, null, null, "A", { cat: "inprogress" }),
    mk("feature", "backwards", null, "2026-09-01", null, "B", { cat: "inprogress", activity: act("2026-08-01", "2026-10-05") }),
    mk("version", "release", null, null),
  ];
  const out = applyEstimates(list, "2026-11-02");
  assert.deepEqual(out.map((i) => i.estimated), [undefined, undefined, undefined]);
});

test("estimates only apply when switched on", () => {
  const list = [mk("epic", "doing", null, null, null, "A", { cat: "inprogress", activity: act("2026-09-01", "2026-10-05") })];
  const off = buildRows(list, cfg({ epic: true }), { estimate: false, today: "2026-11-02" });
  assert.deepEqual(off.unscheduled.map((i) => i.title), ["doing"]);
  const on = buildRows(list, cfg({ epic: true }), { estimate: true, today: "2026-11-02" });
  assert.deepEqual(titles(on.rows), ["# Epics", "doing"]);
  assert.deepEqual(on.unscheduled, []);
});
