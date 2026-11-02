import * as ado from "./ado.js";
import * as jira from "./jira.js";
import type { BoardType, Me, RoadmapItem } from "./model.js";

/** A tool the roadmap can read from. Everything it returns uses the shared item shape. */
export interface Provider {
  source: "jira" | "ado";
  /** shown in messages, e.g. "Azure DevOps" */
  name: string;
  fetchRoadmap(): Promise<{ items: RoadmapItem[]; warnings: string[]; boardType: BoardType }>;
  fetchMe(): Promise<Me>;
}

export interface Chosen {
  provider: Provider | null;
  /** something worth telling the person at start-up */
  note: string | null;
}

/**
 * Picks the tool to read from. Jira wins when both are set up, unless PROVIDER says otherwise.
 * With nothing set up (or the chosen tool half set up) the app shows sample data.
 */
export function chooseProvider(env: Record<string, string | undefined>): Chosen {
  const j = jira.configFromEnv(env);
  const a = ado.configFromEnv(env);
  const asked = env.PROVIDER?.trim().toLowerCase();
  const pref = asked === "jira" || asked === "ado" ? asked : null;

  if (asked && !pref) return { provider: null, note: `PROVIDER should be "jira" or "ado", not "${asked}". Showing sample data.` };

  const choice = pref ?? (j ? "jira" : a ? "ado" : null);
  if (choice === "jira") {
    if (!j) return { provider: null, note: "PROVIDER=jira but the JIRA_* settings are incomplete. Showing sample data." };
    return {
      provider: { source: "jira", name: "Jira", fetchRoadmap: () => jira.fetchRoadmap(j), fetchMe: () => jira.fetchMe(j) },
      note: !pref && a ? "Both Jira and Azure DevOps are set up. Using Jira. Set PROVIDER=ado to use Azure DevOps." : null,
    };
  }
  if (choice === "ado") {
    if (!a) return { provider: null, note: "PROVIDER=ado but the ADO_* settings are incomplete. Showing sample data." };
    return {
      provider: { source: "ado", name: "Azure DevOps", fetchRoadmap: () => ado.fetchRoadmap(a), fetchMe: () => ado.fetchMe(a) },
      note: null,
    };
  }
  return { provider: null, note: null };
}
