import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "./config.js";
import type { DisplayConfig } from "./config.js";
import {
  BUILTIN_VIEWS, MAX_SAVED_VIEWS, collapsedMode, decodeView, encodeView, matchView, parseViewState, upsertView, viewFromHash,
} from "./views.js";
import type { SavedView, ViewState } from "./views.js";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const exec = BUILTIN_VIEWS.find((v) => v.id === "executive")!;
const delivery = BUILTIN_VIEWS.find((v) => v.id === "delivery")!;
const tucked = BUILTIN_VIEWS.find((v) => v.id === "epics-collapsed")!;

test("built-in views show what they say", () => {
  const shown = (v: ViewState) => (Object.keys(v.layers) as Array<keyof DisplayConfig>).filter((t) => v.layers[t].show).sort();
  assert.deepEqual(shown(exec.state), ["epic", "version"]);
  assert.deepEqual(shown(delivery.state), ["epic", "feature", "sprint"]);
  assert.equal(tucked.state.collapsed, "all");
});

test("a link round-trips, keeping only all-or-none for collapsed Epics", () => {
  const state: ViewState = { layers: clone(delivery.state.layers), estimate: true, collapsed: ["E-1", "E-2"] };
  const back = decodeView(encodeView(state))!;
  assert.deepEqual(back.layers, state.layers);
  assert.equal(back.estimate, true);
  assert.equal(back.collapsed, "none");
  assert.equal(decodeView(encodeView({ ...state, collapsed: "all" }))!.collapsed, "all");
});

test("links with rubbish in them are rejected rather than trusted", () => {
  assert.equal(decodeView("not base64 at all!!"), null);
  assert.equal(decodeView(btoa("{}")), null);
  assert.equal(decodeView(btoa(JSON.stringify({ layers: { epic: { show: "yes" } } }))), null);
  assert.equal(decodeView("a".repeat(5000)), null);
  assert.equal(viewFromHash("#/"), null);
  assert.equal(viewFromHash("#/?view=%%%"), null);
  const ok = encodeView(exec.state);
  assert.deepEqual(viewFromHash(`#/?view=${ok}`)!.layers, exec.state.layers);
});

test("parseViewState drops unexpected fields and bad Epic keys", () => {
  const raw = { layers: clone(exec.state.layers), collapsed: ["E-1", "<script>", 5, "x".repeat(60)], estimate: "yes", extra: { a: 1 } };
  (raw.layers as any).epic.extra = "x";
  const s = parseViewState(raw)!;
  assert.deepEqual(s.collapsed, ["E-1"]);
  assert.equal(s.estimate, undefined);
  assert.equal("extra" in s, false);
  assert.equal("extra" in s.layers.epic, false);
  assert.equal(parseViewState({ layers: exec.state.layers, collapsed: 7 }), null);
});

test("saving a view: trims, replaces same name, caps the list, rejects empty names", () => {
  let n = 0;
  const id = () => `id${++n}`;
  let list: SavedView[] = [];
  list = upsertView(list, "  Board pack  ", exec.state, id)!;
  assert.deepEqual(list.map((v) => v.name), ["Board pack"]);
  list = upsertView(list, "board PACK", delivery.state, id)!;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "board PACK");
  assert.equal(list[0].id, "id1");
  assert.equal(upsertView(list, "   ", exec.state, id), null);
  for (let i = 0; i < MAX_SAVED_VIEWS; i++) list = upsertView(list, `v${i}`, exec.state, id) ?? list;
  assert.equal(list.length, MAX_SAVED_VIEWS);
  assert.equal(upsertView(list, "one too many", exec.state, id), null);
  assert.ok(upsertView(list, "v3", delivery.state, id), "replacing still works when full");
});

test("collapsedMode", () => {
  assert.equal(collapsedMode(new Set(), ["A", "B"]), "none");
  assert.equal(collapsedMode(new Set(["A", "B"]), ["A", "B"]), "all");
  assert.deepEqual(collapsedMode(new Set(["A"]), ["A", "B"]), ["A"]);
  assert.equal(collapsedMode(new Set(["A"]), []), "none");
});

test("matching the screen to a view", () => {
  const views = BUILTIN_VIEWS;
  const cur = (v: ViewState, over: Partial<ViewState> = {}): ViewState => ({ ...clone(v), ...over });
  assert.equal(matchView(cur(exec.state), views, false)?.id, "executive");
  assert.equal(matchView(cur(delivery.state), views, false)?.id, "delivery");
  assert.equal(matchView(cur(tucked.state), views, false)?.id, "epics-collapsed");
  // collapsing one Epic in the delivery view makes it custom
  assert.equal(matchView(cur(delivery.state, { collapsed: ["E-1"] }), views, false), null);
  // collapse state is irrelevant when Features are hidden
  assert.equal(matchView(cur(exec.state, { collapsed: ["E-1"] }), views, false)?.id, "executive");
  // a changed option makes it custom
  const edited = cur(exec.state);
  edited.layers.epic.dates = false;
  assert.equal(matchView(edited, views, false), null);
});

test("matching on Kanban ignores Sprints, which can't be shown there", () => {
  const onKanban = clone(delivery.state);
  onKanban.layers.sprint.show = false;
  assert.equal(matchView(onKanban, BUILTIN_VIEWS, true)?.id, "delivery");
  assert.equal(matchView(onKanban, BUILTIN_VIEWS, false), null);
});

test("a view that sets the estimate only matches when the estimate agrees", () => {
  const withEst: SavedView = { id: "1", name: "x", state: { ...clone(exec.state), estimate: true } };
  assert.equal(matchView({ ...clone(exec.state), estimate: false }, [withEst], false), null);
  assert.equal(matchView({ ...clone(exec.state), estimate: true }, [withEst], false)?.id, "1");
  assert.equal(matchView({ ...clone(exec.state), estimate: undefined }, [withEst], false)?.id, "1");
});

test("defaults are not mutated by building views", () => {
  const before = JSON.stringify(DEFAULT_CONFIG);
  void BUILTIN_VIEWS;
  assert.equal(JSON.stringify(DEFAULT_CONFIG), before);
});
