import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { LAYERS } from "./config";
import type { DisplayConfig } from "./config";
import { AttentionPanel } from "./AttentionPanel";
import { derive } from "./derive";
import type { Insight, Progress } from "./derive";
import { CHAR, addMonths, dateText, labelPlan, timelineRange } from "./layout";
import { DAY, buildRows, isoDay, place } from "./rows";
import type { Pinned } from "./rows";
import type { BoardType, ItemType, RoadmapItem } from "./types";

const MIN_PPD = 3.2; // pixels per day at the tightest

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
  boardType: BoardType;
  /** estimate missing dates from activity */
  estimate: boolean;
  /** Keys of Epics whose Features are hidden */
  collapsed: Set<string>;
  /** Every Epic that has Features, so "collapse all" reaches them all */
  collapsibleKeys: string[];
  onToggleEpic: (key: string) => void;
  onSetAll: (keys: string[], collapse: boolean) => void;
}

export function Gantt({ items, config, boardType, estimate, collapsed, collapsibleKeys, onToggleEpic, onSetAll }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const width = useWidth(chartRef);
  const labW = width && width < 640 ? 140 : 240;

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const derived = useMemo(() => derive(items, { estimate, today: isoDay(today), boardType }), [items, estimate, today, boardType]);
  const { rows, pinned, unscheduled } = useMemo(
    () => buildRows(derived.items, config, { boardType }),
    [derived.items, config, boardType]
  );
  // Problems only matter for what the roadmap is planning: Epics and Features.
  const showAttention = config.epic.show || config.feature.show;
  const insights = showAttention ? derived.insights : [];

  const { vs, months, totalDays } = useMemo(() => {
    const times: number[] = [today];
    const add = (i: RoadmapItem) => {
      const p = place(i);
      if (p && !p.bad) times.push(p.s, p.e);
    };
    for (const r of rows) if (r.kind === "item") add(r.item);
    pinned?.items.forEach(add);
    return timelineRange(times);
  }, [rows, pinned, today]);

  // Stretch the timeline to fill the chart; scroll sideways only when it needs more room.
  const avail = Math.max(width - labW - 2, 0);
  const ppd = Math.max(MIN_PPD, avail / totalDays);
  const W = Math.round(totalDays * ppd);
  const x = (t: number) => Math.round(((t - vs) / DAY) * ppd);

  const monthCells = Array.from({ length: months }, (_, i) => addMonths(vs, i));
  const visibleTypes = new Set<ItemType>(rows.flatMap((r) => (r.kind === "section" ? [r.type] : [])));
  if (rows.some((r) => r.kind === "item" && r.item.type === "feature")) visibleTypes.add("feature");
  if (pinned) visibleTypes.add(pinned.type);
  const anyEstimated =
    rows.some((r) => r.kind === "item" && r.item.estimated) || Boolean(pinned?.items.some((i) => i.estimated));
  const anyRolled = rows.some((r) => r.kind === "item" && r.item.rolledUp);
  const anyProgress = rows.some((r) => r.kind === "item" && r.item.key && derived.progress.has(r.item.key));

  const style = { "--labw": `${labW}px` } as CSSProperties;
  const todayLeft = x(today);

  // Which Epics have Features nested under them, and how many.
  const kids = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "item" && r.indent && r.item.parentKey) kids.set(r.item.parentKey, (kids.get(r.item.parentKey) ?? 0) + 1);
  }
  const epicsWithKids = [...kids.keys()];
  const allCollapsed = epicsWithKids.length > 0 && epicsWithKids.every((k) => collapsed.has(k));

  return (
    <>
      {showAttention && <AttentionPanel insights={insights} />}
      <div className="chart" ref={chartRef} style={style} role="region" aria-label="Roadmap timeline" tabIndex={0}>
        <div className="inner" style={{ width: labW + W }}>
          <div className="top">
            <div className="row strip">
              <div className="lab" />
              <div className="track" style={{ width: W }}>
                <div className="today-mark" style={{ left: todayLeft }}><span>Today</span></div>
              </div>
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
                <div className="today-mark" style={{ left: todayLeft }} />
              </div>
            </div>
            {pinned && (
              <PinnedLane pinned={pinned} config={config} W={W} x={x} monthCells={monthCells} todayLeft={todayLeft} />
            )}
          </div>

          {rows.length === 0 && !pinned && (
            <div className="empty">
              {Object.values(config).every((l) => !l.show)
                ? "Nothing is switched on. Choose what to show in Settings."
                : "Nothing to draw yet. Items need dates to appear on the timeline."}
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
                    {r.type === "epic" && epicsWithKids.length > 0 && (
                      <button
                        type="button"
                        className={`twisty${allCollapsed ? "" : " open"}`}
                        aria-label={allCollapsed ? "Expand all Epics" : "Collapse all Epics"}
                        title={allCollapsed ? "Expand all Epics" : "Collapse all Epics"}
                        onClick={() => onSetAll(collapsibleKeys, !allCollapsed)}
                      />
                    )}
                  </div>
                  <div className="track" style={{ width: W }}>
                    {monthCells.map((ms) => (
                      <div key={ms} className="gl" style={{ left: x(ms) }} />
                    ))}
                  </div>
                </div>
              );
            }
            if (r.indent && r.item.parentKey && collapsed.has(r.item.parentKey)) return null;
            const key = r.item.key;
            const n = key ? (kids.get(key) ?? 0) : 0;
            const toggle: ToggleProps | null =
              r.item.type === "epic" && kids.size > 0
                ? { kids: n, expanded: !(key && collapsed.has(key)), onToggle: () => key && onToggleEpic(key) }
                : null;
            return (
              <ItemRow key={`${r.item.type}-${r.item.id}`} item={r.item} indent={r.indent} config={config}
                       W={W} x={x} monthCells={monthCells} toggle={toggle}
                       progress={r.item.type === "epic" && key ? (derived.progress.get(key) ?? null) : null}
                       issues={derived.byItem.get(r.item.id) ?? []} />
            );
          })}
          <div className="today" style={{ left: labW + todayLeft }} />
        </div>
      </div>

      <div className="legend">
        {LAYERS.filter((l) => visibleTypes.has(l.type)).map((l) => (
          <span key={l.type} data-type={l.type}><i className="sw lk" />{l.label}</span>
        ))}
        <span className="sep">Outlined: not started</span>
        <span>Solid: in progress</span>
        <span>Faded: done</span>
        {anyProgress && <span><i className="sw prog" />Darker fill: Features done</span>}
        {anyEstimated && <span><i className="sw est" />Hatched: estimated from activity</span>}
        {anyRolled && <span><i className="sw rolled" />Dotted: dates rolled up from Features</span>}
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

interface PinnedLaneProps {
  pinned: Pinned;
  config: DisplayConfig;
  W: number;
  x: (t: number) => number;
  monthCells: number[];
  todayLeft: number;
}

const LANE_H = 26;

/** One compact lane (sprints, or releases on a Kanban project). Items that would collide drop to a second line. */
function PinnedLane({ pinned, config, W, x, monthCells, todayLeft }: PinnedLaneProps) {
  const opts = config[pinned.type];
  const laneEnds: number[] = [];
  const placed = pinned.items.map((item) => {
    const p = place(item)!;
    const dates = dateText(p);
    const left = x(p.s);
    const barW = p.milestone ? 14 : Math.max(x(p.e) - left, 14);
    const from = p.milestone ? left + Math.round((x(p.e) - left) / 2) - 7 : left;
    // A diamond carries its label beside it, so that space counts as taken.
    const labelW = p.milestone
      ? 8 + (opts.name ? item.title.length * CHAR : 0) + (opts.dates ? (opts.name ? 8 : 0) + dates.length * CHAR : 0)
      : 0;
    let lane = laneEnds.findIndex((end) => end <= from);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = from + barW + labelW;
    return { item, p, dates, from, barW, lane };
  });
  const height = laneEnds.length * LANE_H + 6;

  return (
    <div className="row sprint-lane" data-type={pinned.type} style={{ height }}>
      <div className="lab">
        <i className="lk" />
        <span className="nm">{pinned.label}</span>
        <span className="key">{pinned.items.length}</span>
      </div>
      <div className="track" style={{ width: W }}>
        {monthCells.map((ms) => (
          <div key={ms} className="gl" style={{ left: x(ms) }} />
        ))}
        {placed.map(({ item, p, dates, from, barW, lane }) => {
          if (p.bad) return null;
          const label = `${item.title}, ${item.status}, ${dates}`;
          const tip = [item.title, item.status, dates, item.description].filter(Boolean).join("\n");
          const top = 3 + lane * LANE_H;
          const cls = `bar s-${item.statusCategory}${p.milestone ? " ms" : ""}`;
          let content: ReactNode = null;
          if (!p.milestone) {
            const nameFits = opts.name && barW >= 20 + item.title.length * CHAR;
            const bothFit = nameFits && opts.dates && barW >= 28 + (item.title.length + dates.length) * CHAR;
            const datesOnlyFit = !opts.name && opts.dates && barW >= 20 + dates.length * CHAR;
            content = (
              <>
                {opts.name && <span className="t">{item.title}</span>}
                {(bothFit || datesOnlyFit) && <span className="d">{dates}</span>}
              </>
            );
          }
          const style: CSSProperties = p.milestone
            ? { left: from, width: 14, top: top + 4 }
            : { left: from, width: Math.max(barW - 2, 12), top, height: LANE_H - 4 };
          const props = { className: cls, style, title: tip, "aria-label": label };
          return (
            <Fragment key={item.id}>
              {item.url ? (
                <a {...props} href={item.url} target="_blank" rel="noreferrer">{content}</a>
              ) : (
                <div {...props} tabIndex={0}>{content}</div>
              )}
              {p.milestone && (opts.name || opts.dates) && (
                <span className="pin-label" style={{ left: from + 14 + 8, top: top + 2 }}>
                  {opts.name && <span className="t">{item.title}</span>}
                  {opts.dates && <span className="d">{dates}</span>}
                </span>
              )}
            </Fragment>
          );
        })}
        <div className="today-mark" style={{ left: todayLeft }} />
      </div>
    </div>
  );
}

interface ToggleProps {
  kids: number;
  expanded: boolean;
  onToggle: () => void;
}

interface RowProps {
  toggle: ToggleProps | null;
  progress: Progress | null;
  issues: Insight[];
  item: RoadmapItem;
  indent: boolean;
  config: DisplayConfig;
  W: number;
  x: (t: number) => number;
  monthCells: number[];
}

function ItemRow({ item, indent, config, W, x, monthCells, toggle, progress, issues }: RowProps) {
  const opts = config[item.type];
  const p = place(item)!;
  const label = `${item.key ? item.key + " · " : ""}${item.title}`;
  const dates = dateText(p);
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const progressText = progress ? `${progress.done} of ${progress.total} features done (${pct}%)` : null;
  const tip = [
    label,
    item.status,
    dates,
    progressText,
    item.estimated ? "Estimated from activity, not planned" : null,
    item.rolledUp ? "Dates rolled up from its Features" : null,
    ...issues.map((n) => `${n.headline}: ${n.detail}`),
    item.description,
  ]
    .filter(Boolean)
    .join("\n");
  const worst = issues[0]?.severity;

  // Where the bar sits, and whether its text fits inside it.
  const left = x(p.s);
  const barW = p.milestone ? 14 : Math.max(x(p.e) - left, 14);
  const { inside, outside, flip } = labelPlan(item.title, dates, opts, { left, barW, W, milestone: p.milestone });

  const barStyle: CSSProperties = p.milestone
    ? { left: left + Math.round((x(p.e) - left) / 2) - 7, width: 14 }
    : { left, width: barW };
  const barProps = {
    className: `bar s-${item.statusCategory}${p.milestone ? " ms" : ""}${item.estimated ? " est" : ""}${item.rolledUp ? " rolled" : ""}`,
    style: barStyle,
    title: tip,
    "aria-label": `${label}, ${item.status}, ${dates}${progressText ? ", " + progressText : ""}${worst ? ", needs attention" : ""}`,
  };
  const fill = pct > 0 ? <span className="fill" style={{ width: `${pct}%` }} /> : null;
  const barText = (
    <>
      {fill}
      {inside !== "none" && opts.name && <span className="t">{item.title}</span>}
      {inside === "all" && opts.dates && <span className="d">{dates}</span>}
    </>
  );

  return (
    <div className={`row${indent ? " nested" : ""}`} data-type={item.type}>
      <div className="lab" title={tip}>
        {toggle &&
          (toggle.kids > 0 ? (
            <button
              type="button"
              className={`twisty${toggle.expanded ? " open" : ""}`}
              aria-expanded={toggle.expanded}
              aria-label={`${toggle.expanded ? "Collapse" : "Expand"} ${item.title}, ${toggle.kids} ${toggle.kids === 1 ? "feature" : "features"}`}
              onClick={toggle.onToggle}
            />
          ) : (
            <span className="twisty-gap" />
          ))}
        <span className={`dot s-${item.statusCategory}`} />
        <span className="txt">
          <span className="nm">{item.title}</span>
          {opts.name && item.description && <span className="desc">{item.description}</span>}
        </span>
        {toggle && !toggle.expanded && toggle.kids > 0 && <span className="kids">+{toggle.kids}</span>}
        {worst && (
          <span className={`flag ${worst}`} role="img" aria-label={`${issues.length} ${issues.length === 1 ? "issue" : "issues"}: ${issues.map((n) => n.headline).join(", ")}`}>
            !
          </span>
        )}
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
