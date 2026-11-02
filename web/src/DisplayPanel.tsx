import { LAYERS } from "./config";
import type { DisplayConfig, LayerOptions } from "./config";
import type { BoardType, ItemType } from "./types";

interface Props {
  config: DisplayConfig;
  counts: Record<ItemType, number>;
  boardType: BoardType;
  estimate: boolean;
  onChange: (next: DisplayConfig) => void;
  onEstimate: (on: boolean) => void;
  onReset: () => void;
}

export function DisplayPanel({ config, counts, boardType, estimate, onChange, onEstimate, onReset }: Props) {
  const kanban = boardType === "kanban";
  const set = (type: ItemType, patch: Partial<LayerOptions>) =>
    onChange({ ...config, [type]: { ...config[type], ...patch } });

  return (
    <section className="panel" aria-label="Display options">
      <div className="panel-head">
        <h2>What to show on the roadmap</h2>
        <button type="button" className="link" onClick={onReset}>
          Reset to defaults
        </button>
      </div>

      {kanban && (
        <div className="callout" role="note">
          <strong>This project uses Kanban boards.</strong> Kanban has no sprints, so Sprints isn't available.
          Release versions are shown in the pinned lane under the timeline instead, and you can estimate dates
          for work that doesn't have any (see below).
        </div>
      )}

      <div className="opts">
        <div className="opt-row opt-head" aria-hidden="true">
          <span>Show</span>
          <span>Names and descriptions</span>
          <span>Key dates</span>
        </div>
        {LAYERS.map(({ type, label }) => {
          const o = config[type];
          const unavailable = kanban && type === "sprint";
          return (
            <div className={`opt-row${unavailable ? " off" : ""}`} key={type} data-type={type}>
              <label className="check main">
                <input
                  type="checkbox"
                  checked={o.show && !unavailable}
                  disabled={unavailable}
                  onChange={(e) => set(type, { show: e.target.checked })}
                />
                <i className="lk" />
                <span>{label}</span>
                <span className="n">{counts[type]}</span>
                {unavailable && <span className="sub-note">Not available on Kanban</span>}
                {kanban && type === "version" && <span className="sub-note">Shown in the pinned lane</span>}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={o.name}
                  disabled={!o.show || unavailable}
                  onChange={(e) => set(type, { name: e.target.checked })}
                  aria-label={`${label}: show names and descriptions`}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={o.dates}
                  disabled={!o.show || unavailable}
                  onChange={(e) => set(type, { dates: e.target.checked })}
                  aria-label={`${label}: show key dates`}
                />
              </label>
            </div>
          );
        })}
      </div>
      <p className="hint">
        Choose one or more. With Epics and Features both on, each Feature sits under its Epic. Your choices are saved in this browser.
      </p>

      <div className="estimate">
        <label className="check">
          <input type="checkbox" checked={estimate} onChange={(e) => onEstimate(e.target.checked)} />
          <span><strong>Estimate missing dates from activity</strong></span>
        </label>
        <p className="hint">
          For Epics and features with no dates, draw work in progress from when it started until today, and finished
          work from when it was created until it was resolved. These bars are hatched so they aren't mistaken for a
          plan. Work that hasn't started stays under "Not scheduled yet".
          {kanban && !estimate ? " Useful on Kanban boards, where dates are often left blank." : ""}
        </p>
      </div>
    </section>
  );
}
