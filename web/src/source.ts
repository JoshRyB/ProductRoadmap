import type { Source } from "./types";

/** What to call each data source in the app's wording. */
export const SOURCE_NAME: Record<Source, string> = {
  jira: "Jira",
  ado: "Azure DevOps",
  sample: "sample data",
};
