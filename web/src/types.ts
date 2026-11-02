export type ItemType = "version" | "sprint" | "epic" | "feature";
export type StatusCategory = "todo" | "inprogress" | "done";

export interface RoadmapItem {
  id: string;
  key: string | null;
  title: string;
  description: string | null;
  type: ItemType;
  status: string;
  statusCategory: StatusCategory;
  start: string | null;
  end: string | null;
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
