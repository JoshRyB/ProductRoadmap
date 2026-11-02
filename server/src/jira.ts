import type { BoardType, ItemType, RoadmapItem, StatusCategory } from "./model.js";

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

const base = (c: JiraConfig) => c.baseUrl.replace(/\/$/, "");

function authHeader(c: JiraConfig): string {
  return "Basic " + Buffer.from(`${c.email}:${c.apiToken}`).toString("base64");
}

async function jiraGet(c: JiraConfig, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(base(c) + path);
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

/** Jira descriptions are Atlassian Document Format (nested JSON). Flatten to short plain text. */
export function adfToText(node: unknown, max = 240): string | null {
  const parts: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (typeof n === "string") return void parts.push(n);
    if (n.type === "text" && typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
      if (["paragraph", "heading", "listItem"].includes(n.type)) parts.push(" ");
    }
  };
  walk(node);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

const dateOnly = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 10) : null);

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
  return {
    id: issue.id,
    key: issue.key,
    title: String(issue.fields.summary ?? issue.key),
    description: adfToText(issue.fields.description),
    type,
    status: String(issue.fields.status?.name ?? "Unknown"),
    statusCategory: statusCategory(issue),
    start: startField ? dateOnly(issue.fields[startField]) : null,
    end: dateOnly(issue.fields.duedate),
    parentKey: type === "feature" ? (issue.fields.parent?.key ?? null) : null,
    activity: {
      created: dateOnly(issue.fields.created),
      statusChanged: dateOnly(issue.fields.statuscategorychangedate),
      resolved: dateOnly(issue.fields.resolutiondate),
    },
    url: `${base(c)}/browse/${issue.key}`,
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

const ISSUE_FIELDS = [
  "summary", "description", "duedate", "status", "issuetype", "parent",
  "created", "resolutiondate", "statuscategorychangedate",
];

export async function fetchEpics(c: JiraConfig): Promise<{ items: RoadmapItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const startField = await discoverStartDateField(c);
  if (!startField) warnings.push('Could not find a "Start date" field. Set JIRA_START_DATE_FIELD.');
  const issues = await search(
    c,
    `project = "${c.projectKey}" AND issuetype = Epic ORDER BY duedate ASC`,
    startField ? [...ISSUE_FIELDS, startField] : ISSUE_FIELDS
  );
  return { items: issues.map((i) => normalise(i, c, startField, "epic")), warnings };
}

/** Features and stories: every non-Epic, non-subtask issue in the project. */
export async function fetchFeatures(c: JiraConfig): Promise<RoadmapItem[]> {
  const startField = await discoverStartDateField(c);
  const issues = await search(
    c,
    `project = "${c.projectKey}" AND issuetype != Epic AND issuetype not in subTaskIssueTypes() ORDER BY duedate ASC`,
    startField ? [...ISSUE_FIELDS, startField] : ISSUE_FIELDS
  );
  return issues.map((i) => normalise(i, c, startField, "feature"));
}

/** Release versions (Jira "Releases"). A version with only a release date is a milestone. */
export async function fetchVersions(c: JiraConfig): Promise<RoadmapItem[]> {
  const out: RoadmapItem[] = [];
  let startAt = 0;
  for (;;) {
    const page = await jiraGet(c, `/rest/api/3/project/${encodeURIComponent(c.projectKey)}/version`, {
      startAt: String(startAt),
      maxResults: "100",
    });
    const values: any[] = page.values ?? [];
    for (const v of values) {
      if (v.archived) continue;
      out.push({
        id: String(v.id),
        key: null,
        title: String(v.name),
        description: typeof v.description === "string" && v.description.trim() ? v.description.trim() : null,
        type: "version",
        status: v.released ? "Released" : "Unreleased",
        statusCategory: v.released ? "done" : "todo",
        start: dateOnly(v.startDate),
        end: dateOnly(v.releaseDate),
        parentKey: null,
        activity: null,
        url: `${base(c)}/projects/${encodeURIComponent(c.projectKey)}/versions/${v.id}`,
        source: "jira",
      });
    }
    if (page.isLast !== false || !values.length) break;
    startAt += values.length;
  }
  return out;
}

export interface Board {
  id: number;
  type: string;
}

export async function fetchBoards(c: JiraConfig): Promise<Board[]> {
  const boards = await jiraGet(c, "/rest/agile/1.0/board", {
    projectKeyOrId: c.projectKey,
    maxResults: "50",
  });
  return (boards.values ?? []).map((b: any) => ({ id: Number(b.id), type: String(b.type) }));
}

/** Scrum boards have sprints. A project with boards but none of them Scrum is a Kanban project. */
export function boardTypeOf(boards: Board[]): BoardType {
  if (boards.some((b) => b.type === "scrum")) return "scrum";
  return boards.length > 0 ? "kanban" : "unknown";
}

/** Sprints from the project's Scrum boards. */
export async function fetchSprints(c: JiraConfig, knownBoards?: Board[]): Promise<RoadmapItem[]> {
  const boards = knownBoards ?? (await fetchBoards(c));
  const scrum = boards.filter((b) => b.type === "scrum");
  const seen = new Map<string, RoadmapItem>();
  for (const board of scrum) {
    let startAt = 0;
    for (;;) {
      const page = await jiraGet(c, `/rest/agile/1.0/board/${board.id}/sprint`, {
        startAt: String(startAt),
        maxResults: "50",
      });
      const values: any[] = page.values ?? [];
      for (const s of values) {
        const id = String(s.id);
        if (seen.has(id)) continue;
        const state = String(s.state ?? "future");
        const category: StatusCategory = state === "closed" ? "done" : state === "active" ? "inprogress" : "todo";
        seen.set(id, {
          id,
          key: null,
          title: String(s.name),
          description: typeof s.goal === "string" && s.goal.trim() ? s.goal.trim() : null,
          type: "sprint",
          status: state === "closed" ? "Closed" : state === "active" ? "Active" : "Planned",
          statusCategory: category,
          start: dateOnly(s.startDate),
          end: dateOnly(s.endDate),
          parentKey: null,
          activity: null,
          url: `${base(c)}/jira/software/projects/${encodeURIComponent(c.projectKey)}/boards/${board.id}/backlog`,
          source: "jira",
        });
      }
      if (page.isLast !== false || !values.length) break;
      startAt += values.length;
    }
  }
  return [...seen.values()];
}

/** Fetches every item type. One failing type adds a warning instead of failing the whole roadmap. */
export async function fetchRoadmap(
  c: JiraConfig
): Promise<{ items: RoadmapItem[]; warnings: string[]; boardType: BoardType }> {
  const warnings: string[] = [];
  const boardsP = fetchBoards(c);
  const jobs: Array<[string, ItemType, Promise<RoadmapItem[]>]> = [
    ["Release versions", "version", fetchVersions(c)],
    ["Sprints", "sprint", boardsP.then((b) => fetchSprints(c, b))],
    ["Epics", "epic", fetchEpics(c).then((r) => (warnings.push(...r.warnings), r.items))],
    ["Features and stories", "feature", fetchFeatures(c)],
  ];
  const boardType = await boardsP.then(boardTypeOf, (): BoardType => "unknown");
  const settled = await Promise.allSettled(jobs.map((j) => j[2]));
  const items: RoadmapItem[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else warnings.push(`${jobs[i][0]} couldn't be loaded. ${r.reason instanceof Error ? r.reason.message : ""}`.trim());
  });
  if (settled.every((r) => r.status === "rejected")) {
    throw new Error("Jira returned an error for every request. Check your URL, email and API token.");
  }
  return { items, warnings, boardType };
}

export interface Me {
  name: string;
  email: string | null;
  source: "jira" | "sample";
}

/** The Jira account the API token belongs to. */
export async function fetchMe(c: JiraConfig): Promise<Me> {
  const me = await jiraGet(c, "/rest/api/3/myself");
  return {
    name: String(me.displayName ?? me.emailAddress ?? "Jira user"),
    email: typeof me.emailAddress === "string" && me.emailAddress ? me.emailAddress : null,
    source: "jira",
  };
}

export function configFromEnv(env: Record<string, string | undefined>): JiraConfig | null {
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
