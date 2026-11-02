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

With Epics and Features both on, each Feature sits under its Epic. Use the arrow next to an Epic to collapse it to just the Epic bar (a badge shows how many Features are hidden), or the arrow on the section header to collapse or expand them all. Anything missing a date is listed under "Not scheduled yet" instead of being hidden.

The name in the top right is the Jira account the API token belongs to ("Sample user" when running on sample data). There is no separate sign-in yet.

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
npm test           # connector tests (mocked Jira) and roadmap layout tests
npm run typecheck
```

## Layout

- `server/src/jira.ts`: Jira connector (versions, sprints, Epics, features; field discovery; normalising to `RoadmapItem`)
- `server/src/model.ts`: tool-agnostic item shape (Azure DevOps will map into the same shape)
- `web/src/config.ts`: display options and how they are saved
- `web/src/rows.ts`: decides which rows appear and how Features nest under Epics
- `web/src/Gantt.tsx`: timeline view
- `web/src/DisplayPanel.tsx`: the display options panel (shown on the Settings screen)
- `web/src/SettingsPage.tsx`, `web/src/UserMenu.tsx`: the Settings screen and the top-right user menu (the screen is at `#/settings`)

If one kind of item can't be loaded (for example a project with no Scrum board has no sprints), the rest still shows and a note explains what's missing.
