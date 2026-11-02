import { useState } from "react";
import { LAYERS } from "./config";
import type { Insight, Severity } from "./derive";

const LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

export function AttentionPanel({ insights }: { insights: Insight[] }) {
  const [open, setOpen] = useState(false);
  const count = (s: Severity) => insights.filter((i) => i.severity === s).length;

  if (insights.length === 0) {
    return (
      <div className="attn ok" role="status">
        <span className="attn-dot" aria-hidden="true" />
        Nothing needs attention. Dates look consistent.
      </div>
    );
  }

  const parts = (["high", "medium", "low"] as Severity[]).filter((s) => count(s) > 0).map((s) => `${count(s)} ${s}`);

  return (
    <section className="attn" aria-label="Needs attention">
      <button type="button" className="attn-head" aria-expanded={open} aria-controls="attn-list" onClick={() => setOpen((o) => !o)}>
        <span className={`attn-dot ${count("high") ? "high" : count("medium") ? "medium" : "low"}`} aria-hidden="true" />
        <strong>{insights.length} {insights.length === 1 ? "thing needs" : "things need"} attention</strong>
        <span className="attn-parts">{parts.join(" · ")}</span>
        <span className={`twisty-icon${open ? " open" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul id="attn-list" className="attn-list">
          {insights.map((n) => (
            <li key={n.id}>
              <span className={`sev ${n.severity}`}>{LABEL[n.severity]}</span>
              <span className="tag" data-type={n.item.type}>{LAYERS.find((l) => l.type === n.item.type)?.label}</span>
              <span className="what">
                {n.item.key && <span className="key">{n.item.key}</span>}{" "}
                {n.item.url ? <a href={n.item.url} target="_blank" rel="noreferrer">{n.item.title}</a> : n.item.title}
                <span className="why"><strong>{n.headline}.</strong> {n.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
