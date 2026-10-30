# Product Roadmap

A free roadmap tool for product managers. It pulls Epics from Jira (Start date and Due date) and draws them as bars on a timeline.

Stage 1 (this version): Epics as bars, read-only.
Stage 2: Epics become swimlanes and their child Features become bars (the connector already has `fetchFeatures`).
Later: Azure DevOps connector, saved views, mobile app.

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
npm test           # Jira connector tests (mocked API)
npm run typecheck
```

## Layout

- `server/src/jira.ts`: Jira connector (field discovery, JQL search, normalising to `RoadmapItem`)
- `server/src/model.ts`: tool-agnostic item shape (Azure DevOps will map into the same shape)
- `web/src/Gantt.tsx`: timeline view
