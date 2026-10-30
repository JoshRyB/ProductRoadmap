import { useMemo } from "react";
import type { RoadmapItem } from "./types";

const DAY = 864e5;
const PPD = 3.2; // pixels per day

const pd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const monthStart = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const addMonths = (t: number, n: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};
const fmt = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function Gantt({ items }: { items: RoadmapItem[] }) {
  const { scheduled, unscheduled, vs, months, W } = useMemo(() => {
    const scheduled = items
      .filter((i) => i.start && i.end)
      .sort((a, b) => pd(a.start!) - pd(b.start!));
    const unscheduled = items.filter((i) => !i.start || !i.end);
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const starts = scheduled.map((i) => pd(i.start!)).concat(today);
    const ends = scheduled.map((i) => pd(i.end!)).concat(today);
    const vs = monthStart(Math.min(...starts));
    let months = 0;
    while (addMonths(vs, months) <= Math.max(...ends)) months++;
    months = Math.max(months + 1, 6);
    const W = Math.round((addMonths(vs, months) - vs) / DAY * PPD);
    return { scheduled, unscheduled, vs, months, W };
  }, [items]);

  const x = (t: number) => Math.round(((t - vs) / DAY) * PPD);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <>
      <div className="chart" role="region" aria-label="Roadmap timeline" tabIndex={0}>
        <div className="inner" style={{ width: `calc(var(--labw) + ${W}px)` }}>
          <div className="row hdr">
            <div className="lab">Epic</div>
            <div className="track" style={{ width: W }}>
              {Array.from({ length: months }, (_, i) => {
                const ms = addMonths(vs, i);
                const d = new Date(ms);
                const label = d.toLocaleDateString("en-GB", { month: "short", year: d.getUTCMonth() === 0 || i === 0 ? "numeric" : undefined, timeZone: "UTC" });
                return (
                  <div key={i} className="hcell" style={{ left: x(ms), width: x(addMonths(vs, i + 1)) - x(ms) }}>{label}</div>
                );
              })}
            </div>
          </div>

          {scheduled.map((it) => {
            const s = pd(it.start!);
            const e = pd(it.end!) + DAY;
            const bad = e <= s;
            return (
              <div className="row" key={it.id}>
                <div className="lab" title={`${it.key} · ${it.title}`}>
                  <span className={`dot s-${it.statusCategory}`} />
                  <span className="nm">{it.title}</span>
                  <span className="key">{it.key}</span>
                </div>
                <div className="track" style={{ width: W }}>
                  {Array.from({ length: months }, (_, i) => (
                    <div key={i} className="gl" style={{ left: x(addMonths(vs, i)) }} />
                  ))}
                  {!bad && (
                    <a
                      className={`bar s-${it.statusCategory}`}
                      style={{ left: x(s), width: Math.max(x(e) - x(s), 14) }}
                      href={it.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      title={`${it.key} · ${it.title}\n${it.status}\n${fmt(s)} to ${fmt(e - DAY)}`}
                    >
                      <span className="t">{it.title}</span>
                      <span className="d">{fmt(s)} – {fmt(e - DAY)}</span>
                    </a>
                  )}
                  {bad && <span className="badrange">Due date is before start date</span>}
                </div>
              </div>
            );
          })}
          <div className="today" style={{ left: `calc(var(--labw) + ${x(today)}px)` }}><span>Today</span></div>
        </div>
      </div>

      <div className="legend">
        <span><i className="sw s-todo" />To do</span>
        <span><i className="sw s-inprogress" />In progress</span>
        <span><i className="sw s-done" />Done</span>
      </div>

      {unscheduled.length > 0 && (
        <section className="unsched">
          <h2>Not scheduled yet</h2>
          <p>These Epics are missing a Start date or Due date in Jira, so they can't be drawn.</p>
          <ul>
            {unscheduled.map((i) => (
              <li key={i.id}>
                <span className="key">{i.key}</span> {i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}
                <span className="miss">{!i.start && !i.end ? "no dates" : !i.start ? "no start date" : "no due date"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
