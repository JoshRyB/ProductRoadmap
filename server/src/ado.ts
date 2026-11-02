import type { BoardType, Me, RoadmapItem, StatusCategory } from "./model.js";

/** Settings for reading an Azure DevOps project. */
export interface AdoConfig {
  /** https://dev.azure.com/yourorg (or an on-premises collection URL) */
  orgUrl: string;
  project: string;
  /** Personal access token */
  pat: string;
  /** Team whose sprints (iterations) to read. Defaults to the project's default team. */
  team?: string;
  /** Work item types shown as Epics. Default: Epic */
  epicTypes: string[];
  /** Work item types shown as Features. Default: Feature. Use Issue on the Basic process. */
  featureTypes: string[];
  /** "iterations": treat a folder of sprints (Release 1 containing Sprint 1, 2, ...) as a release. "none": no releases. */
  releases: "iterations" | "none";
}

const API = "api-version=7.1";
const base = (c: AdoConfig) => c.orgUrl.replace(/\/+$/, "");
const projectUrl = (c: AdoConfig) => `${base(c)}/${encodeURIComponent(c.project)}`;

const F = {
  title: "System.Title",
  state: "System.State",
  type: "System.WorkItemType",
  parent: "System.Parent",
  description: "System.Description",
  created: "System.CreatedDate",
  stateChanged: "Microsoft.VSTS.Common.StateChangeDate",
  closed: "Microsoft.VSTS.Common.ClosedDate",
  resolved: "Microsoft.VSTS.Common.ResolvedDate",
  start: "Microsoft.VSTS.Scheduling.StartDate",
  target: "Microsoft.VSTS.Scheduling.TargetDate",
  due: "Microsoft.VSTS.Scheduling.DueDate",
  finish: "Microsoft.VSTS.Scheduling.FinishDate",
};
const FIELD_LIST = Object.values(F);

function authHeader(c: AdoConfig): string {
  return "Basic " + Buffer.from(`:${c.pat}`).toString("base64");
}

async function adoRequest(c: AdoConfig, url: string, init?: { method?: string; body?: unknown }): Promise<any> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(c),
      Accept: "application/json",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  // Never include the token or headers in errors.
  const where = new URL(url).pathname.replace(/\/+$/, "").split("/").slice(-2).join("/");
  if (!res.ok) throw new Error(`Azure DevOps returned ${res.status} for ${where}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) {
    // A wrong or expired token often gets a sign-in web page back instead of an error.
    throw new Error("Azure DevOps didn't accept the token (it returned a sign-in page). Check the token and its expiry date.");
  }
  return res.json();
}

const dateOnly = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 10) : null);

/** Azure DevOps descriptions are HTML. Flatten to short plain text. */
export function htmlToText(html: unknown, max = 240): string | null {
  if (typeof html !== "string") return null;
  const text = html
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** Used only when Azure DevOps can't tell us which category a state belongs to. */
function guessCategory(state: string): StatusCategory {
  const s = state.toLowerCase();
  if (/(^|\b)(done|closed|completed|complete|released|shipped)(\b|$)/.test(s)) return "done";
  if (/(^|\b)(new|proposed|to ?do|open|backlog|approved|ready|draft)(\b|$)/.test(s)) return "todo";
  return "inprogress";
}

/** Azure DevOps state categories: Proposed, InProgress, Resolved, Completed, Removed. */
function categoryOf(adoCategory: string | undefined, state: string): StatusCategory | "removed" {
  switch (adoCategory) {
    case "Proposed": return "todo";
    case "InProgress": return "inprogress";
    case "Resolved": return "inprogress";
    case "Completed": return "done";
    case "Removed": return "removed";
    default: return guessCategory(state);
  }
}

/** Looks up each state's category per work item type, e.g. "Epic|Active" -> InProgress. */
async function stateCategories(c: AdoConfig, types: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    types.map(async (t) => {
      try {
        const r = await adoRequest(c, `${projectUrl(c)}/_apis/wit/workitemtypes/${encodeURIComponent(t)}/states?api-version=7.1-preview.1`);
        for (const s of r.value ?? []) if (s?.name && s?.category) map.set(`${t}|${s.name}`, String(s.category));
      } catch {
        // Not fatal: we fall back to guessing from the state's name.
      }
    })
  );
  return map;
}

const safeType = (t: string) => /^[A-Za-z0-9 _.-]{1,60}$/.test(t);

async function queryIds(c: AdoConfig, types: string[]): Promise<number[]> {
  const list = types.filter(safeType).map((t) => `'${t.replace(/'/g, "''")}'`).join(", ");
  if (!list) return [];
  const query =
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
    `AND [System.WorkItemType] IN (${list}) AND [System.State] <> 'Removed' ORDER BY [System.Id]`;
  const r = await adoRequest(c, `${projectUrl(c)}/_apis/wit/wiql?${API}`, { method: "POST", body: { query } });
  return (r.workItems ?? []).map((w: any) => Number(w.id)).filter((n: number) => Number.isFinite(n));
}

async function fetchWorkItems(c: AdoConfig, ids: number[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const r = await adoRequest(c, `${base(c)}/_apis/wit/workitemsbatch?${API}`, {
      method: "POST",
      body: { ids: ids.slice(i, i + 200), fields: FIELD_LIST },
    });
    out.push(...(r.value ?? []));
  }
  return out;
}

export const adoKey = (id: number | string) => `ADO-${id}`;

export function normaliseWorkItem(wi: any, c: AdoConfig, type: "epic" | "feature", cats: Map<string, string>): RoadmapItem | null {
  const f = wi.fields ?? {};
  const wiType = String(f[F.type] ?? "");
  const state = String(f[F.state] ?? "Unknown");
  const category = categoryOf(cats.get(`${wiType}|${state}`), state);
  if (category === "removed") return null;
  const parent = f[F.parent];
  return {
    id: String(wi.id),
    key: adoKey(wi.id),
    title: String(f[F.title] ?? adoKey(wi.id)),
    description: htmlToText(f[F.description]),
    type,
    status: state,
    statusCategory: category,
    start: dateOnly(f[F.start]),
    end: dateOnly(f[F.target] ?? f[F.due] ?? f[F.finish]),
    parentKey: type === "feature" && parent ? adoKey(parent) : null,
    activity: {
      created: dateOnly(f[F.created]),
      statusChanged: dateOnly(f[F.stateChanged]),
      resolved: dateOnly(f[F.closed] ?? f[F.resolved]),
    },
    url: `${projectUrl(c)}/_workitems/edit/${wi.id}`,
    source: "ado",
  };
}

async function fetchLevel(c: AdoConfig, types: string[], level: "epic" | "feature"): Promise<RoadmapItem[]> {
  const ids = await queryIds(c, types);
  if (!ids.length) return [];
  const [items, cats] = await Promise.all([fetchWorkItems(c, ids), stateCategories(c, types)]);
  return items.map((wi) => normaliseWorkItem(wi, c, level, cats)).filter((i): i is RoadmapItem => i !== null);
}

export const fetchEpics = (c: AdoConfig) => fetchLevel(c, c.epicTypes, "epic");
export const fetchFeatures = (c: AdoConfig) => fetchLevel(c, c.featureTypes, "feature");

interface Iteration {
  id: string;
  name: string;
  path: string;
  start: string | null;
  end: string | null;
  timeFrame: string;
}

/** The team's sprints. An Azure DevOps "iteration" is a sprint. */
export async function fetchIterations(c: AdoConfig): Promise<Iteration[]> {
  const team = c.team ? `/${encodeURIComponent(c.team)}` : "";
  const r = await adoRequest(c, `${projectUrl(c)}${team}/_apis/work/teamsettings/iterations?${API}`);
  return (r.value ?? []).map((i: any) => ({
    id: String(i.id),
    name: String(i.name),
    path: String(i.path ?? i.name),
    start: dateOnly(i.attributes?.startDate),
    end: dateOnly(i.attributes?.finishDate),
    timeFrame: String(i.attributes?.timeFrame ?? "future"),
  }));
}

export function iterationsToSprints(c: AdoConfig, iterations: Iteration[]): RoadmapItem[] {
  return iterations.map((i) => ({
    id: i.id,
    key: null,
    title: i.name,
    description: null,
    type: "sprint" as const,
    status: i.timeFrame === "past" ? "Past" : i.timeFrame === "current" ? "Current" : "Planned",
    statusCategory: (i.timeFrame === "past" ? "done" : i.timeFrame === "current" ? "inprogress" : "todo") as StatusCategory,
    start: i.start,
    end: i.end,
    parentKey: null,
    activity: null,
    url: `${projectUrl(c)}/_sprints`,
    source: "ado" as const,
  }));
}

/** Kanban teams don't plan in iterations. Dated iterations mean Scrum; none means Kanban. */
export function boardTypeOf(iterations: Iteration[]): BoardType {
  return iterations.some((i) => i.start && i.end) ? "scrum" : "kanban";
}

/**
 * Azure DevOps has no planned "release" object. A common habit is a folder of sprints
 * (Release 1 containing Sprint 1 to Sprint 4). Such a folder becomes a release spanning its sprints.
 */
export async function fetchReleases(c: AdoConfig): Promise<RoadmapItem[]> {
  const r = await adoRequest(c, `${projectUrl(c)}/_apis/wit/classificationnodes/iterations?$depth=3&${API}`);
  const out: RoadmapItem[] = [];
  const dates = (n: any): Array<{ s: string; e: string }> => {
    const own = n.attributes?.startDate && n.attributes?.finishDate ? [{ s: dateOnly(n.attributes.startDate)!, e: dateOnly(n.attributes.finishDate)! }] : [];
    return [...own, ...(n.children ?? []).flatMap(dates)];
  };
  for (const node of r.children ?? []) {
    const kids = (node.children ?? []).filter((k: any) => k.attributes?.startDate && k.attributes?.finishDate);
    if (!kids.length) continue;
    const all = dates(node);
    const start = all.reduce((m, d) => (d.s < m ? d.s : m), all[0].s);
    const end = all.reduce((m, d) => (d.e > m ? d.e : m), all[0].e);
    out.push({
      id: `iter-${node.identifier ?? node.id ?? node.name}`,
      key: null,
      title: String(node.name),
      description: `Iteration group with ${kids.length} ${kids.length === 1 ? "sprint" : "sprints"}.`,
      type: "version",
      status: "Planned",
      statusCategory: "todo",
      start,
      end,
      parentKey: null,
      activity: null,
      url: `${projectUrl(c)}/_sprints`,
      source: "ado",
    });
  }
  return out;
}

export async function fetchRoadmap(c: AdoConfig): Promise<{ items: RoadmapItem[]; warnings: string[]; boardType: BoardType }> {
  const warnings: string[] = [];
  const iterationsP = fetchIterations(c);
  const jobs: Array<[string, Promise<RoadmapItem[]>]> = [
    ["Epics", fetchEpics(c)],
    ["Features", fetchFeatures(c)],
    ["Sprints", iterationsP.then((it) => iterationsToSprints(c, it))],
  ];
  if (c.releases === "iterations") jobs.push(["Releases", fetchReleases(c)]);
  const boardType = await iterationsP.then(boardTypeOf, (): BoardType => "unknown");
  const settled = await Promise.allSettled(jobs.map((j) => j[1]));
  const items: RoadmapItem[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else warnings.push(`${jobs[i][0]} couldn't be loaded. ${r.reason instanceof Error ? r.reason.message : ""}`.trim());
  });
  if (settled.every((r) => r.status === "rejected")) {
    const first = settled.find((r): r is PromiseRejectedResult => r.status === "rejected")!.reason;
    const why = first instanceof Error ? first.message.replace(/\.?$/, ".") + " " : "";
    throw new Error(`Azure DevOps returned an error for every request. ${why}${/Check/.test(why) ? "" : "Check the organisation URL, project name and token."}`.trim());
  }
  return { items, warnings, boardType };
}

export async function fetchMe(c: AdoConfig): Promise<Me> {
  const r = await adoRequest(c, `${base(c)}/_apis/connectionData?api-version=7.1-preview.1`);
  const u = r.authenticatedUser ?? {};
  const email = u.properties?.Account?.$value;
  return {
    name: String(u.providerDisplayName ?? u.customDisplayName ?? email ?? "Azure DevOps user"),
    email: typeof email === "string" && email ? email : null,
    source: "ado",
  };
}

const list = (v: string | undefined, fallback: string[]): string[] => {
  const parts = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : fallback;
};

export function configFromEnv(env: Record<string, string | undefined>): AdoConfig | null {
  const { ADO_ORG_URL, ADO_PROJECT, ADO_PAT, ADO_TEAM, ADO_EPIC_TYPES, ADO_FEATURE_TYPES, ADO_RELEASES } = env;
  if (!ADO_ORG_URL || !ADO_PROJECT || !ADO_PAT) return null;
  return {
    orgUrl: ADO_ORG_URL,
    project: ADO_PROJECT,
    pat: ADO_PAT,
    team: ADO_TEAM || undefined,
    epicTypes: list(ADO_EPIC_TYPES, ["Epic"]),
    featureTypes: list(ADO_FEATURE_TYPES, ["Feature"]),
    releases: ADO_RELEASES === "none" ? "none" : "iterations",
  };
}
