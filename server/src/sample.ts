import type { RoadmapItem } from "./model.js";

/** Sample data shaped like a Jira sandbox project. Used when no Jira credentials are set. */
const base = { type: "epic" as const, parentKey: null, url: null, source: "sample" as const };

export const sampleItems: RoadmapItem[] = [
  { ...base, id: "s1", key: "SCRUM-8", title: "APIs", status: "Idea", statusCategory: "todo", start: "2026-10-29", end: "2026-12-31" },
  { ...base, id: "s2", key: "SCRUM-6", title: "User Interface", status: "In progress", statusCategory: "inprogress", start: "2026-10-28", end: "2026-12-04" },
  { ...base, id: "s3", key: "SCRUM-9", title: "Reporting", status: "Idea", statusCategory: "todo", start: "2027-01-11", end: "2027-03-26" },
  { ...base, id: "s4", key: "SCRUM-10", title: "Mobile app", status: "Idea", statusCategory: "todo", start: null, end: null },
];
