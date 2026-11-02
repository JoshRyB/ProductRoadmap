import type { ItemType, RoadmapItem, StatusCategory } from "./model.js";

/** Sample data shaped like a Jira sandbox project. Used when no Jira credentials are set. */
function item(
  type: ItemType,
  id: string,
  key: string | null,
  title: string,
  statusCategory: StatusCategory,
  start: string | null,
  end: string | null,
  extra: { parentKey?: string; description?: string; status?: string } = {}
): RoadmapItem {
  return {
    id,
    key,
    title,
    description: extra.description ?? null,
    type,
    status: extra.status ?? (statusCategory === "done" ? "Done" : statusCategory === "inprogress" ? "In progress" : "To do"),
    statusCategory,
    start,
    end,
    parentKey: extra.parentKey ?? null,
    url: null,
    source: "sample",
  };
}

export const sampleItems: RoadmapItem[] = [
  item("version", "v1", null, "v0.1 Epic timeline", "todo", "2026-10-28", "2026-12-18", { status: "Unreleased", description: "First release: Epics from Jira on a timeline." }),
  item("version", "v2", null, "v0.2 Features and sprints", "todo", null, "2027-02-26", { status: "Unreleased", description: "Features nested under Epics, sprints alongside." }),

  item("sprint", "sp1", null, "Sprint 1", "inprogress", "2026-10-28", "2026-11-10", { status: "Active" }),
  item("sprint", "sp2", null, "Sprint 2", "todo", "2026-11-11", "2026-11-24", { status: "Planned" }),
  item("sprint", "sp3", null, "Sprint 3", "todo", "2026-11-25", "2026-12-08", { status: "Planned" }),
  item("sprint", "sp4", null, "Sprint 4", "todo", "2026-12-09", "2026-12-22", { status: "Planned" }),

  item("epic", "e8", "SCRUM-8", "APIs", "todo", "2026-10-29", "2026-12-31", { status: "Idea", description: "This EPIC contains features related to the Product Roadmap's API integrations" }),
  item("epic", "e6", "SCRUM-6", "User Interface", "inprogress", "2026-10-28", "2026-12-04", { description: "Roadmap views and display options." }),
  item("epic", "e9", "SCRUM-9", "Reporting", "todo", "2027-01-11", "2027-03-26", { status: "Idea" }),
  item("epic", "e10", "SCRUM-10", "Mobile app", "todo", null, null, { status: "Idea" }),

  item("feature", "f5", "SCRUM-5", "Create Gantt View", "inprogress", "2026-10-28", "2026-11-10", { parentKey: "SCRUM-6", description: "Timeline with drag-free, read-only bars." }),
  item("feature", "f11", "SCRUM-11", "Display options", "todo", "2026-11-11", "2026-11-24", { parentKey: "SCRUM-6" }),
  item("feature", "f7", "SCRUM-7", "Create API Link with Jira", "todo", "2026-11-11", "2026-11-24", { parentKey: "SCRUM-8", description: "Pull Epics, features, versions and sprints." }),
  item("feature", "f12", "SCRUM-12", "Azure DevOps connector", "todo", "2026-12-01", "2026-12-31", { parentKey: "SCRUM-8" }),
  item("feature", "f13", "SCRUM-13", "CSV export", "todo", null, null, { parentKey: "SCRUM-9" }),
];
