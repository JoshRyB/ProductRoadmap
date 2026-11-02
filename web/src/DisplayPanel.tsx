import { DEFAULT_CONFIG, LAYERS } from "./config";
import type { DisplayConfig, LayerOptions } from "./config";
import type { ItemType } from "./types";

interface Props {
  config: DisplayConfig;
  counts: Record<ItemType, number>;
  onChange: (next: DisplayConfig) => void;
}

export function DisplayPanel({ config, counts, onChange }: Props) {
  const set = (type: ItemType, patch: Partial<LayerOptions>) =>
    onChange({ ...config, [type]: { ...config[type], ...patch } });

  return (
    <section className="panel" aria-label="Display options">
      <div className="panel-head">
        <h2>What to show on the roadmap</h2>
        <button type="button" className="link" onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_CONFIG)))}>
          Reset to defaults
        </button>
      </div>
      <div className="opts">
        <div className="opt-row opt-head" aria-hidden="true">
          <span>Show</span>
          <span>Names and descriptions</span>
          <span>Key dates</span>
        </div>
        {LAYERS.map(({ type, label }) => {
          const o = config[type];
          return (
            <div className="opt-row" key={type} data-type={type}>
              <label className="check main">
                <input type="checkbox" checked={o.show} onChange={(e) => set(type, { show: e.target.checked })} />
                <i className="lk" />
                <span>{label}</span>
                <span className="n">{counts[type]}</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={o.name}
                  disabled={!o.show}
                  onChange={(e) => set(type, { name: e.target.checked })}
                  aria-label={`${label}: show names and descriptions`}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={o.dates}
                  disabled={!o.show}
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
    </section>
  );
}
