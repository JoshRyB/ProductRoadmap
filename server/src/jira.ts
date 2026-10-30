import type { RoadmapItem, StatusCategory } from "./model.js";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  startDateField?: string;
}

interface JiraIssue {
  key: string;
  id: string;
  fields: Record<string, any>;
}

function authHeader(c: JiraConfig): string {
  return "Basic " + Buffer.from(`${c.email}:${c.apiToken}`).toString("base64");
}

async function jiraGet(c: JiraConfig, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(c.baseUrl.replace(/\/$/, "") + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: authHeader(c), Accept: "application/json" } });
  if (!res.ok) {
    // Never include the token or headers in errors.
    throw new Error(`Jira returned ${res.status} for ${path}`);
  }
  return res.json();
}

/** Finds the id of the "Start date" field (it differs between Jira projects). */
export async function discoverStartDateField(c: JiraConfig): Promise<string | null> {
  if (c.startDateField) return c.startDateField;
  const fields: Array<{ id: string; name: string }> = await jiraGet(c, "/rest/api/3/field");
  const hit = fields.find((f) => f.name.toLowerCase() === "start date");
  return hit?.id ?? null;
}

function statusCategory(issue: JiraIssue): StatusCategory {
  const key = issue.fields.status?.statusCategory?.key;
  return key === "done" ? "done" : key === "indeterminate" ? "inprogress" : "todo";
}

export function normalise(
  issue: JiraIssue,
  c: JiraConfig,
  startField: string | null,
  type: "epic" | "feature"
): RoadmapItem {
  const start = startField ? issue.fields[startField] : null;
  return {
    id: issue.id,
    key: issue.key,
    title: String(issue.fields.summary ?? issue.key),
    type,
    status: String(issue.fields.status?.name ?? "Unknown"),
    statusCategory: statusCategory(issue),
    start: typeof start === "string" && start ? start.slice(0, 10) : null,
    end: typeof issue.fields.duedate === "string" && issue.fields.duedate ? issue.fields.duedate : null,
    parentKey: type === "feature" ? (issue.fields.parent?.key ?? null) : null,
    url: `${c.baseUrl.replace(/\/$/, "")}/browse/${issue.key}`,
    source: "jira",
  };
}

async function search(c: JiraConfig, jql: string, fields: string[]): Promise<JiraIssue[]> {
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const params: Record<string, string> = { jql, fields: fields.join(","), maxResults: "100" };
    if (nextPageToken) params.nextPageToken = nextPageToken;
    const page = await jiraGet(c, "/rest/api/3/search/jql", params);
    out.push(...(page.issues ?? []));
    nextPageToken = page.isLast ? undefined : page.nextPageToken;
  } while (nextPageToken);
  return out;
}

const BASE_FIELDS = ["summary", "duedate", "status", "issuetype", "parent"];

export async function fetchEpics(c: JiraConfig): Promise<{ items: RoadmapItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const startField = await discoverStartDateField(c);
  if (!startField) warnings.push('Could not find a "Start date" field. Set JIRA_START_DATE_FIELD.');
  const issues = await search(
    c,
    `project = "${c.projectKey}" AND issuetype = Epic ORDER BY duedate ASC`,
    startField ? [...BASE_FIELDS, startField] : BASE_FIELDS
  );
  return { items: issues.map((i) => normalise(i, c, startField, "epic")), warnings };
}

/** Stage 2: child items of the given Epics (not yet shown in the UI). */
export async function fetchFeatures(c: JiraConfig, epicKeys: string[]): Promise<RoadmapItem[]> {
  if (!epicKeys.length) return [];
  const startField = await discoverStartDateField(c);
  const issues = await search(
    c,
    `parent in (${epicKeys.map((k) => `"${k}"`).join(",")}) ORDER BY duedate ASC`,
    startField ? [...BASE_FIELDS, startField] : BASE_FIELDS
  );
  return issues.map((i) => normalise(i, c, startField, "feature"));
}

export function configFromEnv(env: NodeJS.ProcessEnv): JiraConfig | null {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY, JIRA_START_DATE_FIELD } = env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) return null;
  return {
    baseUrl: JIRA_BASE_URL,
    email: JIRA_EMAIL,
    apiToken: JIRA_API_TOKEN,
    projectKey: JIRA_PROJECT_KEY,
    startDateField: JIRA_START_DATE_FIELD || undefined,
  };
}
