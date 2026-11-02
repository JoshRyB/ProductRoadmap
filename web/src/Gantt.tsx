import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { LAYERS } from "./config";
import type { DisplayConfig } from "./config";
import { DAY, buildRows, place } from "./rows";
import type { Placement } from "./rows";
import type { ItemType, RoadmapItem } from "./types";

const MIN_PPD = 3.2; // pixels per day at the tightest
const CHAR = 6.7; // rough width of one character at the bar font size

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

function dateText(p: Placement): string {
  return p.milestone ? fmt(p.s) : `${fmt(p.s)} – ${fmt(p.e - DAY)}`;
}

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

interface Props {
  items: RoadmapItem[];
  config: DisplayConfig;
}

export function Gantt({ items, config }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const width = useWidth(chartRef);
  const labW = width && width < 640 ? 140 : 240;

  const { rows, unscheduled } = useMemo(() => buildRows(items, config), [items, config]);

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const { vs, months, totalDays } = useMemo(() => {
    const times: number[] = [today];
    for (const r of rows) {
      if (r.kind !== "item") continue;
      const p = place(r.item);
      if (p && !p.bad) times.push(p.s, p.e);
    }
    const vs = monthStart(Math.min(...times));
    let months = 0;
    while (addMonths(vs, months) <= Math.max(...times)) months++;
    months = Math.max(months + 1, 6);
    return { vs, months, totalDays: Math.round((addMonths(vs, months) - vs) / DAY) };
  }, [rows, today]);

  // Stretch the timeline to fill the chart; scroll sideways only when it needs more room.
  const avail = Math.max(width - labW - 2, 0);
  const ppd = Math.max(MIN_PPD, avail / totalDays);
  const W = Math.round(totalDays * ppd);
  const x = (t: number) => Math.round(((t - vs) / DAY) * ppd);

  const monthCells = Array.from({ length: months }, (_, i) => addMonths(vs, i));
  const visibleTypes = new Set<ItemType>(rows.flatMap((r) => (r.kind === "section" ? [r.type] : [])));
  if (rows.some((r) => r.kind === "item" && r.item.type === "feature")) visibleTypes.add("feature");

  const style = { "--labw": `${labW}px` } as CSSProperties;

  return (
    <>
      <div className="chart" ref={chartRef} style={style} role="region" aria-label="Roadmap timeline" tabIndex={0}>
        <div className="inner" style={{ width: labW + W }}>
          <div className="row strip">
            <div className="lab" />
            <div className="track" style={{ width: W }} />
          </div>
          <div className="row hdr">
            <div className="lab">Timeline</div>
            <div className="track" style={{ width: W }}>
              {monthCells.map((ms, i) => {
                const d = new Date(ms);
                const label = d.toLocaleDateString("en-GB", {
                  month: "short",
                  year: d.getUTCMonth() === 0 || i === 0 ? "numeric" : undefined,
                  timeZone: "UTC",
                });
                return (
                  <div key={ms} className="hcell" style={{ left: x(ms), width: x(addMonths(vs, i + 1)) - x(ms) }}>
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          {rows.length === 0 && (
            <div className="empty">
              {Object.values(config).every((l) => !l.show)
                ? "Nothing is switched on. Choose what to show in Display options."
                : "Nothing to draw yet. Items need dates in Jira to appear on the timeline."}
            </div>
          )}

          {rows.map((r) => {
            if (r.kind === "section") {
              return (
                <div className="row lane" key={`s-${r.type}-${r.label}`} data-type={r.type}>
                  <div className="lab">
                    <i className="lk" />
                    <span className="nm">{r.label}</span>
                    <span className="key">{r.count}</span>
                  </div>
                  <div className="track" style={{ width: W }}>
                    {monthCells.map((ms) => (
                      <div key={ms} className="gl" style={{ left: x(ms) }} />
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <ItemRow key={`${r.item.type}-${r.item.id}`} item={r.item} indent={r.indent} config={config}
                       W={W} x={x} monthCells={monthCells} />
            );
          })}
          <div className="today" style={{ left: labW + x(today) }}><span>Today</span></div>
        </div>
      </div>

      <div className="legend">
        {LAYERS.filter((l) => visibleTypes.has(l.type)).map((l) => (
          <span key={l.type} data-type={l.type}><i className="sw lk" />{l.label}</span>
        ))}
        <span className="sep">Outlined: not started</span>
        <span>Solid: in progress</span>
        <span>Faded: done</span>
      </div>

      {unscheduled.length > 0 && (
        <section className="unsched">
          <h2>Not scheduled yet</h2>
          <p>These items are missing a start or end date, so they can't be drawn.</p>
          <ul>
            {unscheduled.map((i) => (
              <li key={`${i.type}-${i.id}`}>
                <span className="tag" data-type={i.type}>{LAYERS.find((l) => l.type === i.type)?.label}</span>
                {i.key && <span className="key">{i.key}</span>}{" "}
                {i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}
                <span className="miss">{!i.start && !i.end ? "no dates" : !i.start ? "no start date" : "no end date"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

interface RowProps {
  item: RoadmapItem;
  indent: boolean;
  config: DisplayConfig;
  W: number;
  x: (t: number) => number;
  monthCells: number[];
}

function ItemRow({ item, indent, config, W, x, monthCells }: RowProps) {
  const opts = config[item.type];
  const p = place(item)!;
  const label = `${item.key ? item.key + " · " : ""}${item.title}`;
  const dates = dateText(p);
  const tip = [label, item.status, dates, item.description].filter(Boolean).join("\n");

  // Where the bar sits, and whether its text fits inside it.
  const left = x(p.s);
  const barW = p.milestone ? 14 : Math.max(x(p.e) - left, 14);
  const textW = (s: string) => s.length * CHAR;
  const parts: string[] = [];
  if (opts.name) parts.push(item.title);
  if (opts.dates) parts.push(dates);
  const fullW = 20 + parts.reduce((n, s) => n + textW(s), 0) + (parts.length > 1 ? 8 : 0);
  const nameW = opts.name ? 20 + textW(item.title) : Infinity;
  const inside: "all" | "name" | "none" =
    p.milestone || parts.length === 0 ? "none" : barW >= fullW ? "all" : barW >= nameW ? "name" : "none";

  // Whatever doesn't fit inside is written beside the bar instead.
  const outside: Array<{ text: string; cls: "t" | "d" }> = [];
  if (inside === "none") {
    if (opts.name) outside.push({ text: item.title, cls: "t" });
    if (opts.dates) outside.push({ text: dates, cls: "d" });
  } else if (inside === "name" && opts.dates) {
    outside.push({ text: dates, cls: "d" });
  }
  const outsideW = outside.reduce((n, o) => n + textW(o.text), 0) + (outside.length > 1 ? 8 : 0) + 12;
  const flip = left + barW + outsideW > W && left - outsideW > 0;

  const barStyle: CSSProperties = p.milestone
    ? { left: left + Math.round((x(p.e) - left) / 2) - 7, width: 14 }
    : { left, width: barW };
  const barProps = {
    className: `bar s-${item.statusCategory}${p.milestone ? " ms" : ""}`,
    style: barStyle,
    title: tip,
    "aria-label": `${label}, ${item.status}, ${dates}`,
  };
  const barText =
    inside === "none" ? null : (
      <>
        {opts.name && <span className="t">{item.title}</span>}
        {opts.dates && inside === "all" && <span className="d">{dates}</span>}
      </>
    );

  return (
    <div className={`row${indent ? " nested" : ""}`} data-type={item.type}>
      <div className="lab" title={tip}>
        <span className={`dot s-${item.statusCategory}`} />
        <span className="txt">
          <span className="nm">{item.title}</span>
          {opts.name && item.description && <span className="desc">{item.description}</span>}
        </span>
        {item.key && <span className="key">{item.key}</span>}
      </div>
      <div className="track" style={{ width: W }}>
        {monthCells.map((ms) => (
          <div key={ms} className="gl" style={{ left: x(ms) }} />
        ))}
        {p.bad ? (
          <span className="badrange" style={{ left: 8 }}>End date is before start date</span>
        ) : (
          <>
            {item.url ? (
              <a {...barProps} href={item.url} target="_blank" rel="noreferrer">{barText}</a>
            ) : (
              <div {...barProps} tabIndex={0}>{barText}</div>
            )}
            {outside.length > 0 && (
              <span className="out" style={flip ? { right: W - left + 8 } : { left: left + barW + 8 }}>
                {outside.map((o) => (
                  <span key={o.cls} className={o.cls}>{o.text}</span>
                ))}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
