import { test } from "node:test";
import assert from "node:assert/strict";
import { boardTypeOf, configFromEnv, fetchEpics, fetchFeatures, fetchIterations, fetchMe, fetchReleases, fetchRoadmap, htmlToText, iterationsToSprints } from "./ado.js";
import type { AdoConfig } from "./ado.js";

const cfg: AdoConfig = {
  orgUrl: "https://dev.azure.com/acme/",
  project: "Product Roadmap",
  pat: "s3cr3t-pat",
  epicTypes: ["Epic"],
  featureTypes: ["Feature"],
  releases: "iterations",
};

type Handler = (body: any, url: URL) => unknown;
interface Call { method: string; path: string; search: string; body: any; auth: string | null }

function mockAdo(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = decodeURIComponent(url.pathname);
    calls.push({ method, path, search: url.search, body, auth: init?.headers?.Authorization ?? null });
    const h = handlers[`${method} ${path}`];
    if (!h) return new Response("no", { status: 404 });
    const out = h(body, url) as any;
    if (out && typeof out === "object" && "__status" in out) {
      return new Response(out.text ?? "", { status: out.__status, headers: { "content-type": out.type ?? "text/plain" } });
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
  }) as typeof fetch;
  return calls;
}

const P = "/acme/Product Roadmap";
const epic = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  fields: {
    "System.WorkItemType": "Epic",
    "System.Title": `Epic ${id}`,
    "System.State": "Active",
    "System.Description": "<div>Fewer steps <b>from basket</b> to paid.&nbsp;</div><p>Second &amp; last.</p>",
    "System.CreatedDate": "2026-08-20T09:15:00Z",
    "Microsoft.VSTS.Common.StateChangeDate": "2026-09-28T10:00:00Z",
    "Microsoft.VSTS.Scheduling.StartDate": "2026-10-28T00:00:00Z",
    "Microsoft.VSTS.Scheduling.TargetDate": "2026-12-31T00:00:00Z",
    ...over,
  },
});
const feature = (id: number, parent: number | null, over: Record<string, unknown> = {}) => ({
  id,
  fields: { "System.WorkItemType": "Feature", "System.Title": `Feature ${id}`, "System.State": "New", ...(parent ? { "System.Parent": parent } : {}), ...over },
});
const states = (list: Array<[string, string]>) => ({ value: list.map(([name, category]) => ({ name, category })) });

test("epics: query, auth, dates, state category, description and link", async () => {
  const calls = mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: [{ id: 101 }] }),
    "POST /acme/_apis/wit/workitemsbatch": () => ({ value: [epic(101)] }),
    [`GET ${P}/_apis/wit/workitemtypes/Epic/states`]: () => states([["New", "Proposed"], ["Active", "InProgress"], ["Closed", "Completed"]]),
  });
  const items = await fetchEpics(cfg);
  assert.equal(items.length, 1);
  const e = items[0];
  assert.deepEqual(
    { key: e.key, type: e.type, start: e.start, end: e.end, cat: e.statusCategory, status: e.status, parent: e.parentKey, source: e.source },
    { key: "ADO-101", type: "epic", start: "2026-10-28", end: "2026-12-31", cat: "inprogress", status: "Active", parent: null, source: "ado" }
  );
  assert.equal(e.description, "Fewer steps from basket to paid. Second & last.");
  assert.equal(e.url, "https://dev.azure.com/acme/Product%20Roadmap/_workitems/edit/101");
  assert.deepEqual(e.activity, { created: "2026-08-20", statusChanged: "2026-09-28", resolved: null });
  // the token is sent as Basic auth with an empty user name, and the query asks for what we need
  const expected = "Basic " + Buffer.from(":s3cr3t-pat").toString("base64");
  assert.ok(calls.every((c) => c.auth === expected));
  const wiql = calls.find((c) => c.path.endsWith("/wiql"))!;
  assert.match(wiql.body.query, /\[System\.WorkItemType\] IN \('Epic'\)/);
  assert.match(wiql.body.query, /@project/);
  assert.match(wiql.search, /api-version=7\.1/);
  const batch = calls.find((c) => c.path.endsWith("/workitemsbatch"))!;
  assert.deepEqual(batch.body.ids, [101]);
  assert.ok(batch.body.fields.includes("Microsoft.VSTS.Scheduling.TargetDate"));
});

test("features: parent becomes the Epic's key, target date falls back to due date", async () => {
  mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: [{ id: 201 }, { id: 202 }] }),
    "POST /acme/_apis/wit/workitemsbatch": () => ({
      value: [
        feature(201, 101, { "Microsoft.VSTS.Scheduling.StartDate": "2026-11-11T00:00:00Z", "Microsoft.VSTS.Scheduling.DueDate": "2026-11-24T00:00:00Z" }),
        feature(202, null),
      ],
    }),
    [`GET ${P}/_apis/wit/workitemtypes/Feature/states`]: () => states([["New", "Proposed"]]),
  });
  const [a, b] = await fetchFeatures(cfg);
  assert.deepEqual([a.type, a.parentKey, a.start, a.end, a.statusCategory], ["feature", "ADO-101", "2026-11-11", "2026-11-24", "todo"]);
  assert.equal(b.parentKey, null);
  assert.equal(b.start, null);
  assert.equal(b.end, null);
});

test("removed items are left out, resolved counts as in progress, completed as done", async () => {
  mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }),
    "POST /acme/_apis/wit/workitemsbatch": () => ({
      value: [
        epic(1, { "System.State": "Removed" }),
        epic(2, { "System.State": "Resolved" }),
        epic(3, { "System.State": "Closed" }),
        epic(4, { "System.State": "New" }),
      ],
    }),
    [`GET ${P}/_apis/wit/workitemtypes/Epic/states`]: () => states([["New", "Proposed"], ["Resolved", "Resolved"], ["Closed", "Completed"], ["Removed", "Removed"]]),
  });
  const items = await fetchEpics(cfg);
  assert.deepEqual(items.map((i) => [i.title, i.statusCategory]), [["Epic 2", "inprogress"], ["Epic 3", "done"], ["Epic 4", "todo"]]);
});

test("states: when the state lookup is unavailable, names are used to guess", async () => {
  mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }),
    "POST /acme/_apis/wit/workitemsbatch": () => ({
      value: [epic(1, { "System.State": "New" }), epic(2, { "System.State": "Doing" }), epic(3, { "System.State": "Done" }), epic(4, { "System.State": "To Do" })],
    }),
    // no states route: 404
  });
  const items = await fetchEpics(cfg);
  assert.deepEqual(items.map((i) => i.statusCategory), ["todo", "inprogress", "done", "todo"]);
});

test("work items are fetched 200 at a time", async () => {
  const ids = Array.from({ length: 450 }, (_, i) => i + 1);
  const calls = mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: ids.map((id) => ({ id })) }),
    "POST /acme/_apis/wit/workitemsbatch": (b) => ({ value: b.ids.map((id: number) => epic(id)) }),
  });
  const items = await fetchEpics(cfg);
  assert.equal(items.length, 450);
  const sizes = calls.filter((c) => c.path.endsWith("/workitemsbatch")).map((c) => c.body.ids.length);
  assert.deepEqual(sizes, [200, 200, 50]);
});

test("only plain type names reach the query; anything with quotes or symbols is dropped", async () => {
  const calls = mockAdo({ [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: [] }) });
  await fetchEpics({ ...cfg, epicTypes: ["Epic", "Product Initiative", "O'Brien", "x'; DROP"] });
  const q = calls.find((c) => c.path.endsWith("/wiql"))!.body.query as string;
  assert.ok(q.includes("IN ('Epic', 'Product Initiative')"));
  assert.ok(!q.includes("DROP") && !q.includes("Brien"));
  // nothing left to ask for means no request at all
  const none = mockAdo({});
  assert.deepEqual(await fetchEpics({ ...cfg, epicTypes: ["x'; DROP"] }), []);
  assert.equal(none.length, 0);
});

test("iterations become sprints and decide the board type", async () => {
  mockAdo({
    [`GET ${P}/Platform Team/_apis/work/teamsettings/iterations`]: () => ({
      value: [
        { id: "a", name: "Sprint 1", path: "Product Roadmap\\Sprint 1", attributes: { startDate: "2026-10-12T00:00:00Z", finishDate: "2026-10-23T00:00:00Z", timeFrame: "past" } },
        { id: "b", name: "Sprint 2", path: "Product Roadmap\\Sprint 2", attributes: { startDate: "2026-10-26T00:00:00Z", finishDate: "2026-11-06T00:00:00Z", timeFrame: "current" } },
        { id: "c", name: "Sprint 3", path: "Product Roadmap\\Sprint 3", attributes: { timeFrame: "future" } },
      ],
    }),
  });
  const its = await fetchIterations({ ...cfg, team: "Platform Team" });
  const sprints = iterationsToSprints(cfg, its);
  assert.deepEqual(sprints.map((s) => [s.title, s.statusCategory, s.start, s.end]), [
    ["Sprint 1", "done", "2026-10-12", "2026-10-23"],
    ["Sprint 2", "inprogress", "2026-10-26", "2026-11-06"],
    ["Sprint 3", "todo", null, null],
  ]);
  assert.equal(boardTypeOf(its), "scrum");
  assert.equal(boardTypeOf([]), "kanban");
  assert.equal(boardTypeOf(its.slice(2)), "kanban");
});

test("releases: a folder of dated sprints becomes one release spanning them", async () => {
  mockAdo({
    [`GET ${P}/_apis/wit/classificationnodes/iterations`]: () => ({
      name: "Product Roadmap",
      children: [
        { identifier: "r1", name: "Release 1", children: [
          { name: "Sprint 1", attributes: { startDate: "2026-10-12T00:00:00Z", finishDate: "2026-10-23T00:00:00Z" } },
          { name: "Sprint 2", attributes: { startDate: "2026-10-26T00:00:00Z", finishDate: "2026-11-06T00:00:00Z" } },
        ] },
        { identifier: "s9", name: "Sprint 9", attributes: { startDate: "2027-01-04T00:00:00Z", finishDate: "2027-01-15T00:00:00Z" } },
        { identifier: "empty", name: "Archive", children: [{ name: "Old", attributes: {} }] },
      ],
    }),
  });
  const rel = await fetchReleases(cfg);
  assert.equal(rel.length, 1);
  assert.deepEqual([rel[0].title, rel[0].type, rel[0].start, rel[0].end], ["Release 1", "version", "2026-10-12", "2026-11-06"]);
  assert.match(rel[0].description!, /2 sprints/);
});

test("a rejected token gives a plain message and never leaks the token", async () => {
  mockAdo({ [`POST ${P}/_apis/wit/wiql`]: () => ({ __status: 401 }) });
  await assert.rejects(fetchEpics(cfg), (e: Error) => /401/.test(e.message) && !e.message.includes("s3cr3t"));
  // Azure DevOps often answers a bad token with a sign-in web page and a success code
  mockAdo({ [`POST ${P}/_apis/wit/wiql`]: () => ({ __status: 203, text: "<html>Sign in</html>", type: "text/html" }) });
  await assert.rejects(fetchEpics(cfg), (e: Error) => /sign-in page/.test(e.message) && !e.message.includes("s3cr3t"));
});

test("roadmap: gathers everything, reports Scrum, and one failure only warns", async () => {
  mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: (b) => ({ workItems: [{ id: /'Epic'/.test(b.query) ? 101 : 201 }] }),
    "POST /acme/_apis/wit/workitemsbatch": (b) => ({ value: b.ids[0] === 101 ? [epic(101)] : [feature(201, 101)] }),
    [`GET ${P}/_apis/work/teamsettings/iterations`]: () => ({ value: [{ id: "a", name: "Sprint 1", attributes: { startDate: "2026-10-12T00:00:00Z", finishDate: "2026-10-23T00:00:00Z", timeFrame: "past" } }] }),
    // classification nodes: 404, so releases fail
  });
  const r = await fetchRoadmap(cfg);
  assert.equal(r.boardType, "scrum");
  assert.deepEqual(r.items.map((i) => i.type).sort(), ["epic", "feature", "sprint"]);
  assert.ok(r.warnings.some((w) => w.startsWith("Releases couldn't be loaded")));
});

test("roadmap: no iterations means Kanban, and every request failing throws", async () => {
  mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: [] }),
    [`GET ${P}/_apis/work/teamsettings/iterations`]: () => ({ value: [] }),
    [`GET ${P}/_apis/wit/classificationnodes/iterations`]: () => ({ children: [] }),
  });
  assert.equal((await fetchRoadmap(cfg)).boardType, "kanban");
  globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
  await assert.rejects(fetchRoadmap(cfg), (e: Error) => /every request/.test(e.message) && /401/.test(e.message) && !e.message.includes("s3cr3t"));
  // the sign-in-page hint survives into the combined message
  globalThis.fetch = (async () => new Response("<html>Sign in</html>", { status: 203, headers: { "content-type": "text/html" } })) as typeof fetch;
  await assert.rejects(fetchRoadmap(cfg), (e: Error) => /sign-in page/.test(e.message) && !e.message.includes("s3cr3t"));
});

test("releases can be switched off", async () => {
  const calls = mockAdo({
    [`POST ${P}/_apis/wit/wiql`]: () => ({ workItems: [] }),
    [`GET ${P}/_apis/work/teamsettings/iterations`]: () => ({ value: [] }),
  });
  await fetchRoadmap({ ...cfg, releases: "none" });
  assert.ok(!calls.some((c) => c.path.includes("classificationnodes")));
});

test("me: the signed-in account", async () => {
  mockAdo({
    "GET /acme/_apis/connectionData": () => ({ authenticatedUser: { providerDisplayName: "Josh Bell", properties: { Account: { $value: "josh@example.com" } } } }),
  });
  assert.deepEqual(await fetchMe(cfg), { name: "Josh Bell", email: "josh@example.com", source: "ado" });
  mockAdo({ "GET /acme/_apis/connectionData": () => ({ authenticatedUser: {} }) });
  assert.deepEqual(await fetchMe(cfg), { name: "Azure DevOps user", email: null, source: "ado" });
});

test("settings come from the environment, with sensible defaults", () => {
  assert.equal(configFromEnv({}), null);
  assert.equal(configFromEnv({ ADO_ORG_URL: "https://dev.azure.com/acme", ADO_PROJECT: "P" }), null);
  const c = configFromEnv({ ADO_ORG_URL: "https://dev.azure.com/acme", ADO_PROJECT: "P", ADO_PAT: "t" })!;
  assert.deepEqual([c.epicTypes, c.featureTypes, c.releases, c.team], [["Epic"], ["Feature"], "iterations", undefined]);
  const d = configFromEnv({ ADO_ORG_URL: "u", ADO_PROJECT: "P", ADO_PAT: "t", ADO_TEAM: "Core", ADO_EPIC_TYPES: "Epic, Initiative", ADO_FEATURE_TYPES: "Issue", ADO_RELEASES: "none" })!;
  assert.deepEqual([d.epicTypes, d.featureTypes, d.releases, d.team], [["Epic", "Initiative"], ["Issue"], "none", "Core"]);
});

test("htmlToText", () => {
  assert.equal(htmlToText(null), null);
  assert.equal(htmlToText("<div><br></div>"), null);
  assert.equal(htmlToText("a<br>b &lt;c&gt;"), "a b <c>");
  assert.equal(htmlToText("x".repeat(400))!.length, 240);
});
