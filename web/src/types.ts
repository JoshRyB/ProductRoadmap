export type ItemType = "version" | "sprint" | "epic" | "feature";
export type StatusCategory = "todo" | "inprogress" | "done";
export type BoardType = "scrum" | "kanban" | "unknown";

export interface Activity {
  created: string | null;
  statusChanged: string | null;
  resolved: string | null;
}

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
  activity: Activity | null;
  url: string | null;
  source: "jira" | "sample";
  /** set by the app when the dates were estimated from activity, not planned */
  estimated?: boolean;
}

export interface RoadmapResponse {
  source: "jira" | "sample";
  boardType: BoardType;
  fetchedAt: string;
  items: RoadmapItem[];
  warnings: string[];
}

export interface Me {
  name: string;
  email: string | null;
  source: "jira" | "sample";
}
