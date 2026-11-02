import type { Activity, ItemType, RoadmapItem, StatusCategory } from "./model.js";

/** Sample data shaped like a Jira sandbox project. Used when no Jira credentials are set. */
function item(
  type: ItemType,
  id: string,
  key: string | null,
  title: string,
  statusCategory: StatusCategory,
  start: string | null,
  end: string | null,
  extra: { parentKey?: string; description?: string; status?: string; activity?: Activity } = {}
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
    activity: extra.activity ?? null,
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

/**
 * A Kanban-style project: no sprints, and most work has no planned dates.
 * Run the server with SAMPLE_BOARD=kanban to see it.
 */
const act = (created: string, statusChanged: string | null, resolved: string | null = null): Activity => ({ created, statusChanged, resolved });

export const sampleKanbanItems: RoadmapItem[] = [
  item("version", "kv1", null, "Release 1.0", "done", null, "2026-10-15", { status: "Released" }),
  item("version", "kv2", null, "Release 1.1", "todo", null, "2026-12-11", { status: "Unreleased", description: "Reporting and exports." }),
  item("version", "kv3", null, "Release 1.2", "todo", null, "2027-02-19", { status: "Unreleased" }),

  item("epic", "ke1", "KAN-1", "Checkout improvements", "inprogress", null, null, { description: "Fewer steps from basket to paid.", activity: act("2026-08-20", "2026-09-28") }),
  item("epic", "ke2", "KAN-2", "Customer portal", "done", null, null, { activity: act("2026-06-02", "2026-10-09", "2026-10-09") }),
  item("epic", "ke3", "KAN-3", "Reporting", "inprogress", null, "2026-12-18", { description: "Has a due date but no start.", activity: act("2026-09-10", "2026-10-19") }),
  item("epic", "ke4", "KAN-4", "Mobile app", "todo", null, null, { activity: act("2026-10-01", null) }),

  item("feature", "kf1", "KAN-5", "Guest checkout", "inprogress", null, null, { parentKey: "KAN-1", activity: act("2026-09-01", "2026-10-05") }),
  item("feature", "kf2", "KAN-6", "Saved payment methods", "todo", null, null, { parentKey: "KAN-1", activity: act("2026-09-15", null) }),
  item("feature", "kf3", "KAN-7", "Order history page", "done", null, null, { parentKey: "KAN-2", activity: act("2026-07-01", "2026-09-30", "2026-09-30") }),
  item("feature", "kf4", "KAN-8", "CSV export", "inprogress", null, null, { parentKey: "KAN-3", activity: act("2026-10-02", "2026-10-26") }),
];
