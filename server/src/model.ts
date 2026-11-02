/** Tool-agnostic roadmap item. Jira and Azure DevOps both normalise into this. */
export type Source = "jira" | "ado" | "sample";
export type ItemType = "version" | "sprint" | "epic" | "feature";
export type StatusCategory = "todo" | "inprogress" | "done";
export type BoardType = "scrum" | "kanban" | "unknown";

/** When work actually happened, used to estimate bars for items that have no planned dates. */
export interface Activity {
  created: string | null;
  /** when the item last moved to a new status category (for example into In progress) */
  statusChanged: string | null;
  resolved: string | null;
}

export interface RoadmapItem {
  id: string;
  /** Issue key such as SCRUM-8. Versions and sprints have none. */
  key: string | null;
  title: string;
  /** Short plain-text description, when the source has one */
  description: string | null;
  type: ItemType;
  status: string;
  statusCategory: StatusCategory;
  /** ISO date YYYY-MM-DD, or null when the source has no value */
  start: string | null;
  end: string | null;
  /** Key of the parent Epic for features; null otherwise */
  parentKey: string | null;
  /** Epics and features only */
  activity: Activity | null;
  url: string | null;
  source: Source;
}

export interface RoadmapResponse {
  source: Source;
  /** Scrum boards have sprints; Kanban boards do not */
  boardType: BoardType;
  fetchedAt: string;
  items: RoadmapItem[];
  warnings: string[];
}

/** The account the connection belongs to, shown in the top right. */
export interface Me {
  name: string;
  email: string | null;
  source: Source;
}
