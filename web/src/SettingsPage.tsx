import { DisplayPanel } from "./DisplayPanel";
import { UserMenu } from "./UserMenu";
import type { DisplayConfig } from "./config";
import { SOURCE_NAME } from "./source";
import type { BoardType, ItemType, Me, Source } from "./types";

interface Props {
  config: DisplayConfig;
  counts: Record<ItemType, number>;
  me: Me | null;
  source: Source | null;
  boardType: BoardType;
  estimate: boolean;
  onChange: (next: DisplayConfig) => void;
  onEstimate: (on: boolean) => void;
  onReset: () => void;
}

const BOARD_TEXT: Record<BoardType, string> = {
  scrum: "Scrum (has sprints)",
  kanban: "Kanban (no sprints)",
  unknown: "Not detected",
};

export function SettingsPage({ config, counts, me, source, boardType, estimate, onChange, onEstimate, onReset }: Props) {
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

      <DisplayPanel
        config={config}
        counts={counts}
        boardType={boardType}
        estimate={estimate}
        onChange={onChange}
        onEstimate={onEstimate}
        onReset={onReset}
      />

      <section className="panel" aria-label="Account">
        <div className="panel-head"><h2>Account</h2></div>
        <dl className="facts">
          <dt>Signed in as</dt>
          <dd>{me ? me.name : "Guest"}</dd>
          <dt>Email</dt>
          <dd>{me?.email ?? "Not available"}</dd>
          <dt>Data source</dt>
          <dd>{source && source !== "sample" ? `${SOURCE_NAME[source]} (read-only)` : "Sample data"}</dd>
          <dt>Board type</dt>
          <dd>{BOARD_TEXT[boardType]}</dd>
        </dl>
      </section>
    </div>
  );
}
