import { test } from "node:test";
import assert from "node:assert/strict";
import { derive } from "./derive.js";
import type { Activity, ItemType, RoadmapItem, StatusCategory } from "./types.js";

let n = 0;
function mk(
  type: ItemType, title: string, start: string | null, end: string | null, key: string | null,
  extra: { parent?: string; cat?: StatusCategory; activity?: Activity } = {}
): RoadmapItem {
  return {
    id: String(++n), key, title, description: null, type, status: extra.cat === "done" ? "Done" : extra.cat === "inprogress" ? "In progress" : "To do",
    statusCategory: extra.cat ?? "todo", start, end, parentKey: extra.parent ?? null, activity: extra.activity ?? null, url: null, source: "sample",
  };
}
const TODAY = "2026-11-02";
const run = (items: RoadmapItem[], estimate = false) => derive(items, { estimate, today: TODAY });
const rules = (d: ReturnType<typeof run>) => d.insights.map((i) => `${i.id.split(":")[0]}:${i.item.title}`).sort();

test("roll-up: an Epic with no dates takes the span of its dated Features", () => {
  const d = run([
    mk("epic", "Notifications", null, null, "E-1"),
    mk("feature", "Email", "2027-01-05", "2027-01-29", "F-1", { parent: "E-1" }),
    mk("feature", "Slack", "2027-02-01", "2027-02-26", "F-2", { parent: "E-1" }),
    mk("feature", "Undated", null, null, "F-3", { parent: "E-1" }),
  ]);
  const e = d.items.find((i) => i.title === "Notifications")!;
  assert.deepEqual([e.start, e.end, e.rolledUp], ["2027-01-05", "2027-02-26", true]);
});

test("roll-up: only fills the gaps, never overrides planned dates, and needs dated children", () => {
  const d = run([
    mk("epic", "Has end", null, "2027-03-01", "E-1"),
    mk("feature", "A", "2027-01-05", "2027-01-29", "F-1", { parent: "E-1" }),
    mk("epic", "Planned", "2026-12-01", "2026-12-31", "E-2"),
    mk("feature", "B", "2027-05-01", "2027-05-30", "F-2", { parent: "E-2" }),
    mk("epic", "Lonely", null, null, "E-3"),
  ]);
  const by = (t: string) => d.items.find((i) => i.title === t)!;
  assert.deepEqual([by("Has end").start, by("Has end").end], ["2027-01-05", "2027-03-01"]);
  assert.equal(by("Planned").rolledUp, undefined);
  assert.deepEqual([by("Planned").start, by("Planned").end], ["2026-12-01", "2026-12-31"]);
  assert.deepEqual([by("Lonely").start, by("Lonely").end, by("Lonely").rolledUp], [null, null, undefined]);
});

test("progress counts every Feature of an Epic, dated or not", () => {
  const d = run([
    mk("epic", "E", "2026-11-01", "2026-12-01", "E-1"),
    mk("feature", "a", "2026-11-01", "2026-11-05", "F-1", { parent: "E-1", cat: "done" }),
    mk("feature", "b", null, null, "F-2", { parent: "E-1", cat: "inprogress" }),
    mk("feature", "c", null, null, "F-3", { parent: "E-1" }),
    mk("epic", "Empty", "2026-11-01", "2026-12-01", "E-2"),
  ]);
  assert.deepEqual(d.progress.get("E-1"), { done: 1, total: 3 });
  assert.equal(d.progress.has("E-2"), false);
});

test("attention: overdue, should have started, no due date", () => {
  const d = run([
    mk("feature", "late", "2026-10-01", "2026-10-30", "F-1", { cat: "inprogress" }),
    mk("feature", "finished late", "2026-10-01", "2026-10-30", "F-2", { cat: "done" }),
    mk("feature", "not started", "2026-10-20", "2026-12-01", "F-3", { cat: "todo" }),
    mk("feature", "open ended", "2026-10-20", null, "F-4", { cat: "inprogress" }),
    mk("feature", "future", "2026-12-01", "2026-12-20", "F-5", { cat: "todo" }),
  ]);
  assert.deepEqual(rules(d), ["late-start:not started", "no-due:open ended", "overdue:late"]);
  assert.equal(d.insights[0].severity, "high");
  assert.equal(d.insights[0].headline, "Overdue");
});

test("attention: a Feature that runs past its Epic, but not when the dates were estimated or the Feature is done", () => {
  const d = run([
    mk("epic", "UI", "2026-10-28", "2026-12-04", "E-1", { cat: "inprogress" }),
    mk("feature", "past", "2026-11-10", "2026-12-18", "F-1", { parent: "E-1", cat: "todo" }),
    mk("feature", "within", "2026-11-10", "2026-12-01", "F-2", { parent: "E-1" }),
    mk("feature", "done past", "2026-11-10", "2026-12-18", "F-3", { parent: "E-1", cat: "done" }),
  ]);
  assert.deepEqual(rules(d), ["past-epic:past"]);
  assert.match(d.insights[0].detail, /E-1 is due 4 Dec/);
});

test("attention: an Epic whose Features are all done is ready to close", () => {
  const d = run([
    mk("epic", "E", "2026-11-01", "2027-01-01", "E-1", { cat: "inprogress" }),
    mk("feature", "a", "2026-11-01", "2026-11-05", "F-1", { parent: "E-1", cat: "done" }),
    mk("feature", "b", "2026-11-01", "2026-11-05", "F-2", { parent: "E-1", cat: "done" }),
  ]);
  assert.deepEqual(rules(d), ["ready:E"]);
});

test("attention: estimated and rolled-up dates are not treated as planned", () => {
  const items = [
    mk("feature", "doing", null, null, "F-1", { cat: "inprogress", activity: { created: "2026-09-01", statusChanged: "2026-10-05", resolved: null } }),
    mk("epic", "rolled", null, null, "E-1", { cat: "inprogress" }),
    mk("feature", "child", "2026-09-01", "2026-10-10", "F-2", { parent: "E-1", cat: "done" }),
  ];
  const d = run(items, true);
  // "doing" has an estimated end of today, so it is not overdue, but it still has no planned due date
  assert.deepEqual(rules(d).filter((r) => r.startsWith("overdue")), []);
  assert.ok(rules(d).includes("no-due:doing"));
  // the rolled-up Epic ended 10 Oct but that end was never planned, so no overdue flag
  assert.ok(!rules(d).includes("overdue:rolled"));
});

test("attention: backwards dates are high severity and sorted first", () => {
  const d = run([
    mk("feature", "backwards", "2026-12-05", "2026-12-01", "F-1"),
    mk("feature", "no due", "2026-10-20", null, "F-2", { cat: "inprogress" }),
  ]);
  assert.equal(d.insights[0].item.title, "backwards");
  assert.equal(d.insights[0].severity, "high");
  assert.equal(d.byItem.get(d.insights[0].item.id)!.length, 1);
});

test("derive does not change its input", () => {
  const items = [mk("epic", "E", null, null, "E-1"), mk("feature", "a", "2027-01-01", "2027-01-10", "F-1", { parent: "E-1" })];
  run(items);
  assert.equal(items[0].start, null);
  assert.equal(items[0].rolledUp, undefined);
});

test("kanban: a missing due date is not flagged", () => {
  const items = [mk("feature", "open ended", "2026-10-20", null, "F-1", { cat: "inprogress" })];
  assert.deepEqual(rules(derive(items, { estimate: false, today: TODAY, boardType: "scrum" })), ["no-due:open ended"]);
  assert.deepEqual(rules(derive(items, { estimate: false, today: TODAY, boardType: "kanban" })), []);
});
