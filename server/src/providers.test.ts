import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseProvider } from "./providers.js";

const JIRA = { JIRA_BASE_URL: "https://x.atlassian.net", JIRA_EMAIL: "a@b.c", JIRA_API_TOKEN: "t", JIRA_PROJECT_KEY: "SCRUM" };
const ADO = { ADO_ORG_URL: "https://dev.azure.com/acme", ADO_PROJECT: "P", ADO_PAT: "t" };

test("nothing set up means sample data, quietly", () => {
  assert.deepEqual(chooseProvider({}), { provider: null, note: null });
});

test("one tool set up is used", () => {
  assert.equal(chooseProvider(JIRA).provider?.source, "jira");
  assert.equal(chooseProvider(ADO).provider?.source, "ado");
  assert.equal(chooseProvider(ADO).provider?.name, "Azure DevOps");
  assert.equal(chooseProvider(JIRA).note, null);
});

test("both set up: Jira by default with a note, or whichever PROVIDER names", () => {
  const both = { ...JIRA, ...ADO };
  const d = chooseProvider(both);
  assert.equal(d.provider?.source, "jira");
  assert.match(d.note!, /PROVIDER=ado/);
  assert.equal(chooseProvider({ ...both, PROVIDER: "ado" }).provider?.source, "ado");
  assert.equal(chooseProvider({ ...both, PROVIDER: " JIRA " }).provider?.source, "jira");
  assert.equal(chooseProvider({ ...both, PROVIDER: "ado" }).note, null);
});

test("a named tool that isn't fully set up falls back to sample data and says why", () => {
  const r = chooseProvider({ ...JIRA, PROVIDER: "ado" });
  assert.equal(r.provider, null);
  assert.match(r.note!, /ADO_\* settings are incomplete/);
  assert.match(chooseProvider({ ...ADO, PROVIDER: "jira" }).note!, /JIRA_\* settings are incomplete/);
});

test("an unknown PROVIDER is reported rather than guessed", () => {
  const r = chooseProvider({ ...JIRA, PROVIDER: "linear" });
  assert.equal(r.provider, null);
  assert.match(r.note!, /"jira" or "ado"/);
});
