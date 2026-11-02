import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToText, boardTypeOf, fetchEpics, fetchFeatures, fetchMe, fetchRoadmap, fetchSprints, fetchVersions } from "./jira.js";

const cfg = { baseUrl: "https://example.atlassian.net", email: "a@b.c", apiToken: "s3cr3t-value", projectKey: "SCRUM" };

function mockFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    assert.match(init.headers.Authorization, /^Basic /);
    const body = routes[url.pathname];
    if (body === undefined) return new Response("no", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return calls;
}

const adf = {
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text: "This EPIC contains features related to the Product Roadmap's API integrations" }] }],
};

const epicIssue = {
  id: "10008",
  key: "SCRUM-8",
  fields: {
    summary: "APIs",
    description: adf,
    duedate: "2026-12-31",
    customfield_10015: "2026-10-29",
    status: { name: "Idea", statusCategory: { key: "new" } },
  },
};

const fields = [{ id: "duedate", name: "Due date" }, { id: "customfield_10015", name: "Start date" }];

test("epics: discovers Start date field, maps dates and description", async () => {
  const calls = mockFetch({
    "/rest/api/3/field": fields,
    "/rest/api/3/search/jql": { issues: [epicIssue], isLast: true },
  });
  const { items, warnings } = await fetchEpics(cfg);
  assert.equal(warnings.length, 0);
  assert.deepEqual(
    { key: items[0].key, start: items[0].start, end: items[0].end, cat: items[0].statusCategory, type: items[0].type },
    { key: "SCRUM-8", start: "2026-10-29", end: "2026-12-31", cat: "todo", type: "epic" }
  );
  assert.equal(items[0].description, "This EPIC contains features related to the Product Roadmap's API integrations");
  assert.equal(items[0].url, "https://example.atlassian.net/browse/SCRUM-8");
  assert.ok(calls.some((c) => c.includes("customfield_10015")));
});

test("epics: missing dates become null and a missing field warns", async () => {
  mockFetch({
    "/rest/api/3/field": [{ id: "duedate", name: "Due date" }],
    "/rest/api/3/search/jql": { issues: [{ ...epicIssue, fields: { summary: "X", status: { name: "Done", statusCategory: { key: "done" } } } }], isLast: true },
  });
  const { items, warnings } = await fetchEpics(cfg);
  assert.equal(items[0].start, null);
  assert.equal(items[0].end, null);
  assert.equal(items[0].description, null);
  assert.equal(items[0].statusCategory, "done");
  assert.equal(warnings.length, 1);
});

test("features: query excludes epics and subtasks, and carries the parent key", async () => {
  const calls = mockFetch({
    "/rest/api/3/field": fields,
    "/rest/api/3/search/jql": {
      issues: [{ id: "1", key: "SCRUM-7", fields: { summary: "Create API Link with Jira", parent: { key: "SCRUM-8" }, customfield_10015: "2026-11-11", duedate: "2026-11-24", status: { name: "To Do", statusCategory: { key: "new" } } } }],
      isLast: true,
    },
  });
  const items = await fetchFeatures(cfg);
  assert.equal(items[0].parentKey, "SCRUM-8");
  assert.equal(items[0].type, "feature");
  assert.equal(items[0].start, "2026-11-11");
  const jql = decodeURIComponent(calls.find((c) => c.includes("search/jql"))!.replace(/\+/g, " "));
  assert.match(jql, /issuetype != Epic/);
  assert.match(jql, /subTaskIssueTypes/);
});

test("versions: bar, milestone, unreleased and archived", async () => {
  mockFetch({
    "/rest/api/3/project/SCRUM/version": {
      isLast: true,
      values: [
        { id: "1", name: "v0.1", description: "First", startDate: "2026-10-28", releaseDate: "2026-12-18", released: false },
        { id: "2", name: "v0.2", releaseDate: "2027-02-26", released: false },
        { id: "3", name: "v0.0", releaseDate: "2026-09-01", released: true },
        { id: "4", name: "old", releaseDate: "2025-01-01", archived: true },
      ],
    },
  });
  const items = await fetchVersions(cfg);
  assert.deepEqual(items.map((i) => i.title), ["v0.1", "v0.2", "v0.0"]);
  assert.equal(items[0].start, "2026-10-28");
  assert.equal(items[1].start, null);
  assert.equal(items[1].end, "2027-02-26");
  assert.equal(items[2].statusCategory, "done");
  assert.equal(items[0].url, "https://example.atlassian.net/projects/SCRUM/versions/1");
});

test("sprints: only scrum boards, dates trimmed, states mapped, no duplicates", async () => {
  mockFetch({
    "/rest/agile/1.0/board": { values: [{ id: 1, type: "scrum" }, { id: 2, type: "kanban" }] },
    "/rest/agile/1.0/board/1/sprint": {
      isLast: true,
      values: [
        { id: 10, name: "Sprint 1", state: "active", startDate: "2026-10-28T09:00:00.000Z", endDate: "2026-11-10T17:00:00.000Z", goal: "Ship the Gantt" },
        { id: 11, name: "Sprint 2", state: "future", startDate: "2026-11-11T09:00:00.000Z", endDate: "2026-11-24T17:00:00.000Z" },
        { id: 9, name: "Sprint 0", state: "closed", startDate: "2026-10-14T09:00:00.000Z", endDate: "2026-10-27T17:00:00.000Z" },
      ],
    },
  });
  const items = await fetchSprints(cfg);
  assert.equal(items.length, 3);
  const s1 = items.find((i) => i.title === "Sprint 1")!;
  assert.deepEqual([s1.start, s1.end, s1.statusCategory, s1.description], ["2026-10-28", "2026-11-10", "inprogress", "Ship the Gantt"]);
  assert.equal(items.find((i) => i.title === "Sprint 0")!.statusCategory, "done");
  assert.equal(items.find((i) => i.title === "Sprint 2")!.statusCategory, "todo");
});

test("roadmap: one failing type warns instead of failing everything", async () => {
  mockFetch({
    "/rest/api/3/field": fields,
    "/rest/api/3/search/jql": { issues: [epicIssue], isLast: true },
    "/rest/api/3/project/SCRUM/version": { isLast: true, values: [{ id: "1", name: "v0.1", releaseDate: "2026-12-18" }] },
    // no agile routes: sprints return 404
  });
  const { items, warnings } = await fetchRoadmap(cfg);
  assert.ok(items.some((i) => i.type === "version"));
  assert.ok(items.some((i) => i.type === "epic"));
  assert.ok(warnings.some((w) => w.startsWith("Sprints couldn't be loaded")));
});

test("roadmap: every request failing throws a plain message", async () => {
  globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
  await assert.rejects(fetchRoadmap(cfg), (e: Error) => !e.message.includes("s3cr3t") && /every request/.test(e.message));
});

test("errors do not leak the token", async () => {
  globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
  await assert.rejects(fetchEpics(cfg), (e: Error) => !e.message.includes("s3cr3t") && /401/.test(e.message));
});

test("adfToText flattens, truncates and handles empty", () => {
  assert.equal(adfToText(null), null);
  assert.equal(adfToText({ type: "doc", content: [] }), null);
  const long = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(400) }] }] };
  assert.equal(adfToText(long)!.length, 240);
  const two = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "One" }] },
    { type: "paragraph", content: [{ type: "text", text: "Two" }] },
  ] };
  assert.equal(adfToText(two), "One Two");
});

test("me: returns the display name and email of the token's account", async () => {
  mockFetch({ "/rest/api/3/myself": { displayName: "Josh Bell", emailAddress: "josh@example.com", accountId: "abc" } });
  assert.deepEqual(await fetchMe(cfg), { name: "Josh Bell", email: "josh@example.com", source: "jira" });
  mockFetch({ "/rest/api/3/myself": { displayName: "No Email" } });
  assert.equal((await fetchMe(cfg)).email, null);
});

test("activity dates are read from created, status category changed and resolved", async () => {
  mockFetch({
    "/rest/api/3/field": fields,
    "/rest/api/3/search/jql": {
      issues: [{ id: "1", key: "KAN-5", fields: {
        summary: "Guest checkout", parent: { key: "KAN-1" },
        created: "2026-09-01T09:30:00.000+0100", statuscategorychangedate: "2026-10-05T14:02:11.000+0100", resolutiondate: null,
        status: { name: "In Progress", statusCategory: { key: "indeterminate" } } } }],
      isLast: true,
    },
  });
  const [f] = await fetchFeatures(cfg);
  assert.deepEqual(f.activity, { created: "2026-09-01", statusChanged: "2026-10-05", resolved: null });
  assert.equal(f.statusCategory, "inprogress");
});

test("board type: scrum wins, boards without scrum mean kanban, none is unknown", () => {
  assert.equal(boardTypeOf([{ id: 1, type: "kanban" }, { id: 2, type: "scrum" }]), "scrum");
  assert.equal(boardTypeOf([{ id: 1, type: "kanban" }]), "kanban");
  assert.equal(boardTypeOf([]), "unknown");
});

test("roadmap: a kanban project has no sprints and is reported as kanban", async () => {
  mockFetch({
    "/rest/agile/1.0/board": { values: [{ id: 7, type: "kanban" }] },
    "/rest/api/3/field": fields,
    "/rest/api/3/search/jql": { issues: [epicIssue], isLast: true },
    "/rest/api/3/project/SCRUM/version": { isLast: true, values: [{ id: "1", name: "v1", releaseDate: "2026-12-18" }] },
  });
  const r = await fetchRoadmap(cfg);
  assert.equal(r.boardType, "kanban");
  assert.equal(r.items.filter((i) => i.type === "sprint").length, 0);
  assert.equal(r.warnings.length, 0);
});

test("roadmap: board lookup failing reports unknown and still shows the rest", async () => {
  mockFetch({
    "/rest/api/3/field": fields,
    "/rest/api/3/search/jql": { issues: [epicIssue], isLast: true },
    "/rest/api/3/project/SCRUM/version": { isLast: true, values: [] },
  });
  const r = await fetchRoadmap(cfg);
  assert.equal(r.boardType, "unknown");
  assert.ok(r.items.some((i) => i.type === "epic"));
});
