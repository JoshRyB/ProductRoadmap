export type StatusCategory = "todo" | "inprogress" | "done";

export interface RoadmapItem {
  id: string;
  key: string;
  title: string;
  type: "epic" | "feature";
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
