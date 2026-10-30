import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchEpics, fetchFeatures } from "./jira.js";

const cfg = { baseUrl: "https://example.atlassian.net", email: "a@b.c", apiToken: "tok", projectKey: "SCRUM" };

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

const epicIssue = {
  id: "10008",
  key: "SCRUM-8",
  fields: {
    summary: "APIs",
    duedate: "2026-12-31",
    customfield_10015: "2026-10-29",
    status: { name: "Idea", statusCategory: { key: "new" } },
  },
};

test("epics: discovers Start date field and maps dates", async () => {
  const calls = mockFetch({
    "/rest/api/3/field": [{ id: "duedate", name: "Due date" }, { id: "customfield_10015", name: "Start date" }],
    "/rest/api/3/search/jql": { issues: [epicIssue], isLast: true },
  });
  const { items, warnings } = await fetchEpics(cfg);
  assert.equal(warnings.length, 0);
  assert.deepEqual(
    { key: items[0].key, start: items[0].start, end: items[0].end, cat: items[0].statusCategory, type: items[0].type },
    { key: "SCRUM-8", start: "2026-10-29", end: "2026-12-31", cat: "todo", type: "epic" }
  );
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
  assert.equal(items[0].statusCategory, "done");
  assert.equal(warnings.length, 1);
});

test("features: carry parent key", async () => {
  mockFetch({
    "/rest/api/3/field": [{ id: "customfield_10015", name: "Start date" }],
    "/rest/api/3/search/jql": {
      issues: [{ id: "1", key: "SCRUM-7", fields: { summary: "Create API Link with Jira", parent: { key: "SCRUM-8" }, status: { name: "To Do", statusCategory: { key: "new" } } } }],
      isLast: true,
    },
  });
  const items = await fetchFeatures(cfg, ["SCRUM-8"]);
  assert.equal(items[0].parentKey, "SCRUM-8");
  assert.equal(items[0].type, "feature");
});

test("errors do not leak the token", async () => {
  globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
  await assert.rejects(fetchEpics(cfg), (e: Error) => !e.message.includes("tok") && /401/.test(e.message));
});
