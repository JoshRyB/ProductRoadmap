# Product Roadmap

A free roadmap tool for product managers. It pulls your project's timeline from Jira and draws it on a Gantt-style roadmap.

## What it shows

Open the menu under your name (top right) and choose **Settings** to pick one or more of these. For each one you can also switch names/descriptions and key dates on or off. Your choices are saved in the browser.

Sprints are drawn side by side in a single compact lane that stays pinned under the timeline header while the rest scrolls.

| Layer | Jira source | Dates used |
| --- | --- | --- |
| Release versions | Project Releases (versions) | Start date and Release date. A version with only a release date is drawn as a diamond. |
| Sprints | Scrum board sprints | Sprint start and end |
| Epics | Epic issues | Start date and Due date |
| Features and stories | Non-Epic, non-subtask issues | Start date and Due date |

**Scrum and Kanban.** On a Scrum project, Sprints appear in a pinned lane. If the app detects a Kanban project (boards but no Scrum board), Settings says so, Sprints is switched off, and Release versions take the pinned lane instead. A setting, **Estimate missing dates from activity**, draws Epics and features that have no dates from when they actually started (or were created) until today (or until resolved). Those bars are hatched so they aren't mistaken for a plan, and work that hasn't started stays under "Not scheduled yet". On Kanban projects this is on and Release versions are shown until you choose otherwise; **Reset to defaults** returns to that.

To see the Kanban view on sample data, run the server with `SAMPLE_BOARD=kanban`.

With Epics and Features both on, each Feature sits under its Epic. Use the arrow next to an Epic to collapse it to just the Epic bar (a badge shows how many Features are hidden), or the arrow on the section header to collapse or expand them all. Anything missing a date is listed under "Not scheduled yet" instead of being hidden.

The name in the top right is the Jira account the API token belongs to ("Sample user" when running on sample data). There is no separate sign-in yet.

## Keeping the roadmap honest without maintaining it

- **Needs attention** (panel above the timeline): lists overdue work, work that should have started, Features that run past their Epic, in-progress work with no due date (not on Kanban), end dates before start dates, and Epics whose Features are all done. Flags also appear on the affected rows.
- **Progress on Epic bars**: a darker fill shows how many of the Epic's Features are done.
- **Rolled-up dates**: an Epic with no dates of its own takes the span of its dated Features. It has a dotted outline so you can tell the dates weren't set by a person.

These only use planned dates a person set. Estimated and rolled-up dates are never reported as overdue.

Read-only for now. Next: Azure DevOps connector, then the mobile app.

## Run it

You need Node.js 20 or later.

```bash
npm install
npm run dev        # server on :3001, web on :5173
```

Open http://localhost:5173. With no Jira details it shows sample data.

## Connect your Jira

1. In Jira, open your Atlassian account's Security settings and create an API token.
2. `cp server/.env.example server/.env` and fill in `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_PROJECT_KEY`.
3. Restart `npm run dev`. The badge changes to "Live from Jira".

The token stays on the server and is never sent to the browser. `.env` is git-ignored.

The "Start date" field id differs between Jira projects. The server finds it by name; set `JIRA_START_DATE_FIELD` (for example `customfield_10015`) if it can't.

## Test

```bash
npm test           # connector tests (mocked Jira), layout rules and the attention/roll-up logic
npm run typecheck
```

## Layout

- `server/src/jira.ts`: Jira connector (versions, sprints, Epics, features; field discovery; normalising to `RoadmapItem`)
- `server/src/model.ts`: tool-agnostic item shape (Azure DevOps will map into the same shape)
- `web/src/config.ts`: display options and how they are saved
- `web/src/rows.ts`: decides which rows appear and how Features nest under Epics
- `web/src/derive.ts`: estimated and rolled-up dates, progress and the needs-attention rules
- `web/src/AttentionPanel.tsx`: the needs-attention panel
- `web/src/Gantt.tsx`: timeline view
- `web/src/DisplayPanel.tsx`: the display options panel (shown on the Settings screen)
- `web/src/SettingsPage.tsx`, `web/src/UserMenu.tsx`: the Settings screen and the top-right user menu (the screen is at `#/settings`)

If one kind of item can't be loaded (for example a project with no Scrum board has no sprints), the rest still shows and a note explains what's missing.
