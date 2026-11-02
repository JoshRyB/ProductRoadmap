import { DisplayPanel } from "./DisplayPanel";
import { UserMenu } from "./UserMenu";
import type { DisplayConfig } from "./config";
import type { ItemType, Me } from "./types";

interface Props {
  config: DisplayConfig;
  counts: Record<ItemType, number>;
  me: Me | null;
  source: "jira" | "sample" | null;
  onChange: (next: DisplayConfig) => void;
}

export function SettingsPage({ config, counts, me, source, onChange }: Props) {
  return (
    <div className="wrap">
      <header>
        <div>
          <a className="back" href="#/">&larr; Back to roadmap</a>
          <h1>Settings</h1>
        </div>
        <div className="actions">
          <UserMenu me={me} />
        </div>
      </header>

      <DisplayPanel config={config} counts={counts} onChange={onChange} />

      <section className="panel" aria-label="Account">
        <div className="panel-head"><h2>Account</h2></div>
        <dl className="facts">
          <dt>Signed in as</dt>
          <dd>{me ? me.name : "Guest"}</dd>
          <dt>Email</dt>
          <dd>{me?.email ?? "Not available"}</dd>
          <dt>Data source</dt>
          <dd>{source === "jira" ? "Jira (read-only)" : "Sample data"}</dd>
        </dl>
      </section>
    </div>
  );
}
