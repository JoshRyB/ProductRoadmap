import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "./config.js";
import type { DisplayConfig } from "./config.js";
import { renderSvg } from "./exportSvg.js";
import type { ExportInput } from "./exportSvg.js";
import { printDocument, slug } from "./exportFiles.js";
import type { ItemType, RoadmapItem, StatusCategory } from "./types.js";

let n = 0;
function mk(type: ItemType, title: string, start: string | null, end: string | null, key: string | null, extra: { parent?: string; cat?: StatusCategory; description?: string } = {}): RoadmapItem {
  return { id: String(++n), key, title, description: extra.description ?? null, type, status: "To do", statusCategory: extra.cat ?? "todo", start, end, parentKey: extra.parent ?? null, activity: null, url: null, source: "sample" };
}
const cfg = (show: ItemType[]): DisplayConfig => {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DisplayConfig;
  (Object.keys(c) as ItemType[]).forEach((t) => (c[t].show = show.includes(t)));
  return c;
};
const items = [
  mk("epic", "Checkout & payments <fast>", "2026-11-10", "2026-12-20", "E-1", { cat: "inprogress", description: 'Fewer "steps"' }),
  mk("feature", "Guest checkout", "2026-11-12", "2026-12-01", "F-1", { parent: "E-1" }),
  mk("epic", "Reporting", "2027-01-11", "2027-03-26", "E-2"),
  mk("sprint", "Sprint 1", "2026-11-02", "2026-11-15", null),
  mk("version", "Release 1.0", null, "2026-12-18", null),
  mk("epic", "Undated", null, null, "E-3"),
];
const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  items, config: cfg(["epic"]), boardType: "scrum", estimate: false, collapsed: new Set(), title: "Product roadmap",
  viewName: "Executive summary", sourceLabel: "Sample data", today: Date.UTC(2026, 10, 2), ...over,
});

test("export draws a complete, sized, escaped SVG", () => {
  const r = renderSvg(input());
  assert.ok(r.svg.startsWith("<svg ") && r.svg.endsWith("</svg>"));
  assert.match(r.svg, new RegExp(`width="${r.width}" height="${r.height}"`));
  assert.ok(r.width >= 1000 && r.height > 200);
  assert.ok(r.svg.includes("Checkout &amp; payments &lt;fast&gt;"), "titles are escaped");
  assert.ok(!r.svg.includes("<fast>"));
  assert.ok(r.svg.includes("Fewer &quot;steps&quot;") || r.svg.includes("Fewer &#39;steps&#39;") || r.svg.includes("Fewer"), "description present");
  assert.ok(r.svg.includes("Executive summary") && r.svg.includes("Sample data"));
  assert.ok(r.svg.includes("Today"));
  assert.ok(r.svg.includes("Not scheduled yet (1): Undated"));
});

test("export shows only what is switched on", () => {
  const epicsOnly = renderSvg(input()).svg;
  assert.ok(!epicsOnly.includes("Guest checkout") && !epicsOnly.includes("Sprint 1") && !epicsOnly.includes("Release 1.0"));
  const all = renderSvg(input({ config: cfg(["version", "sprint", "epic", "feature"]) })).svg;
  for (const t of ["Guest checkout", "Sprint 1", "Release 1.0", "Reporting"]) assert.ok(all.includes(t), t);
});

test("collapsed Epics hide their Features in the export", () => {
  const open = renderSvg(input({ config: cfg(["epic", "feature"]) })).svg;
  const shut = renderSvg(input({ config: cfg(["epic", "feature"]), collapsed: new Set(["E-1"]) })).svg;
  assert.ok(open.includes("Guest checkout"));
  assert.ok(!shut.includes("Guest checkout"));
  assert.ok(shut.includes("Checkout &amp; payments"));
});

test("on a Kanban project releases take the pinned lane and sprints are ignored", () => {
  const svg = renderSvg(input({ boardType: "kanban", config: cfg(["version", "sprint"]) })).svg;
  assert.ok(svg.includes("Releases") && svg.includes("Release 1.0"));
  assert.ok(!svg.includes("Sprint 1"));
});

test("empty selection still produces a valid image with a message", () => {
  const r = renderSvg(input({ config: cfg([]) }));
  assert.ok(r.svg.includes("Nothing to show"));
});

test("estimated and progress marks appear in the export and legend", () => {
  const doing = mk("feature", "Doing", null, null, "F-9", { cat: "inprogress" });
  doing.activity = { created: "2026-09-01", statusChanged: "2026-10-05", resolved: null };
  const done = mk("feature", "Done one", "2026-11-01", "2026-11-05", "F-8", { parent: "E-1", cat: "done" });
  const r = renderSvg(input({ items: [...items, doing, done], config: cfg(["epic", "feature"]), estimate: true })).svg;
  assert.ok(r.includes('fill="url(#hatch)"'));
  assert.ok(r.includes("Hatched: estimated from activity"));
  assert.ok(r.includes("Darker fill: Features done"));
});

test("filenames and the print page are safe", () => {
  assert.equal(slug("Executive summary!"), "executive-summary");
  assert.equal(slug("???"), "roadmap");
  const doc = printDocument("<svg></svg>", 'My <b>"roadmap"</b>');
  assert.ok(doc.includes("<title>My broadmap/b</title>") || !doc.includes("<b>"));
  assert.ok(doc.includes("A4 landscape"));
});
