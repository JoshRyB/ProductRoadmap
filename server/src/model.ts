/** Tool-agnostic roadmap item. Jira and (later) Azure DevOps both normalise into this. */
export type ItemType = "epic" | "feature";
export type StatusCategory = "todo" | "inprogress" | "done";

export interface RoadmapItem {
  id: string;
  key: string;
  title: string;
  type: ItemType;
  status: string;
  statusCategory: StatusCategory;
  /** ISO date YYYY-MM-DD, or null when the source has no value */
  start: string | null;
  end: string | null;
  /** Key of the parent Epic for features; null for epics */
  parentKey: string | null;
  url: string | null;
  source: "jira" | "sample";
}

export interface RoadmapResponse {
  source: "jira" | "sample";
  fetchedAt: string;
  items: RoadmapItem[];
  warnings: string[];
}
