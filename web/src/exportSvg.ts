import type { DisplayConfig } from "./config";
import { LAYERS } from "./config";
import { derive } from "./derive";
import { CHAR, addMonths, dateText, labelPlan, timelineRange } from "./layout";
import { DAY, buildRows, isoDay, place } from "./rows";
import type { BoardType, ItemType, RoadmapItem } from "./types";

export interface ExportInput {
  items: RoadmapItem[];
  config: DisplayConfig;
  boardType: BoardType;
  estimate: boolean;
  collapsed: Set<string>;
  title: string;
  viewName: string;
  sourceLabel: string;
  /** UTC midnight of today */
  today: number;
}

export interface ExportResult {
  svg: string;
  width: number;
  height: number;
}

const COLOR: Record<ItemType, string> = { version: "#7650ab", sprint: "#1b7f84", epic: "#3461b8", feature: "#2c7a58" };
const INK = "#161b1f";
const MUTED = "#5d6872";
const LINE = "#dde2e6";
const SOFT = "#eceff1";
const SECTION_BG = "#f2f4f6";
const TODAY = "#d6362d";
const AMBER = "#c27a12";
const GREY = "#6b7885";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, Menlo, Consolas, monospace";

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const trunc = (s: string, max: number): string => (s.length <= max ? s : max <= 1 ? "" : s.slice(0, max - 1).trimEnd() + "…");

/** Blend a colour towards white. a=1 keeps the colour, a=0 is white. */
function tint(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(255 - (255 - v) * a);
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const M = 24; // outer margin
const LAB = 260; // label column
const TARGET = 1400; // preferred overall width
const ROW_H = 40;
const SECTION_H = 28;
const LANE_H = 26;

export function renderSvg(input: ExportInput): ExportResult {
  const { config, boardType, collapsed, today } = input;
  const derived = derive(input.items, { estimate: input.estimate, today: isoDay(today), boardType });
  const built = buildRows(derived.items, config, { boardType });
  const rows = built.rows.filter((r) => !(r.kind === "item" && r.indent && r.item.parentKey && collapsed.has(r.item.parentKey)));
  const pinned = built.pinned;

  // ----- timeline scale -----
  const times: number[] = [today];
  const add = (i: RoadmapItem) => {
    const p = place(i);
    if (p && !p.bad) times.push(p.s, p.e);
  };
  for (const r of rows) if (r.kind === "item") add(r.item);
  pinned?.items.forEach(add);
  const { vs, months, totalDays } = timelineRange(times);
  const ppd = Math.min(6, Math.max(2.4, (TARGET - 2 * M - LAB) / totalDays));
  const W = Math.round(totalDays * ppd);
  const x0 = M + LAB;
  const width = 2 * M + LAB + W;
  const X = (t: number) => x0 + Math.round(((t - vs) / DAY) * ppd);

  // ----- vertical layout -----
  const headerY = 76;
  const headerH = 28;
  let y = headerY + headerH;

  const bg: string[] = [];
  const body: string[] = [];
  const clips: string[] = [];
  let clipN = 0;

  // pinned lane
  if (pinned) {
    const opts = config[pinned.type];
    const ends: number[] = [];
    const placed = pinned.items.map((item) => {
      const p = place(item)!;
      const dates = dateText(p);
      const left = X(p.s);
      const barW = p.milestone ? 14 : Math.max(X(p.e) - left, 14);
      const from = p.milestone ? left + Math.round((X(p.e) - left) / 2) - 7 : left;
      const labelW = p.milestone
        ? 8 + (opts.name ? item.title.length * CHAR : 0) + (opts.dates ? (opts.name ? 8 : 0) + dates.length * CHAR : 0)
        : 0;
      let lane = ends.findIndex((e) => e <= from);
      if (lane === -1) lane = ends.push(0) - 1;
      ends[lane] = from + barW + labelW;
      return { item, p, dates, from, barW, lane };
    });
    const laneH = ends.length * LANE_H + 8;
    bg.push(`<rect x="${M}" y="${y}" width="${width - 2 * M}" height="${laneH}" fill="#fafbfc"/>`);
    body.push(
      `<rect x="${M + 10}" y="${y + laneH / 2 - 5}" width="10" height="10" rx="2" fill="${COLOR[pinned.type]}"/>`,
      `<text x="${M + 28}" y="${y + laneH / 2 + 4}" font-size="13" font-weight="700" fill="${INK}">${esc(pinned.label)}</text>`,
      `<text x="${M + LAB - 10}" y="${y + laneH / 2 + 4}" font-size="10" font-family="${MONO}" fill="${MUTED}" text-anchor="end">${pinned.items.length}</text>`
    );
    for (const { item, p, dates, from, barW, lane } of placed) {
      if (p.bad) continue;
      const c = COLOR[pinned.type];
      const top = y + 4 + lane * LANE_H;
      const cy = top + (LANE_H - 4) / 2;
      const solid = item.statusCategory !== "todo";
      const group = item.statusCategory === "done" ? ' opacity="0.55"' : "";
      if (p.milestone) {
        const cx = from + 7;
        body.push(
          `<g${group}><polygon points="${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}" fill="${solid ? c : tint(c, 0.25)}" stroke="${c}" stroke-width="1.5"/></g>`
        );
        const label =
          (opts.name ? `<tspan font-weight="600" fill="${INK}">${esc(item.title)}</tspan>` : "") +
          (opts.dates ? `<tspan dx="${opts.name ? 6 : 0}" font-family="${MONO}" font-size="10" fill="${MUTED}">${esc(dates)}</tspan>` : "");
        if (label) body.push(`<text x="${cx + 14}" y="${cy + 4}" font-size="11">${label}</text>`);
      } else {
        const w = Math.max(barW - 2, 12);
        body.push(
          `<g${group}><rect x="${from}" y="${top}" width="${w}" height="${LANE_H - 4}" rx="4" fill="${solid ? c : tint(c, 0.16)}" stroke="${c}" stroke-width="1.5"/></g>`
        );
        const fg = solid ? "#ffffff" : INK;
        const nameFits = opts.name && w >= 20 + item.title.length * CHAR;
        const both = nameFits && opts.dates && w >= 28 + (item.title.length + dates.length) * CHAR;
        const chars = Math.floor((w - 12) / CHAR);
        const name = opts.name ? (nameFits ? item.title : trunc(item.title, chars)) : "";
        if (name) {
          body.push(
            `<text x="${from + 6}" y="${cy + 4}" font-size="11" font-weight="600" fill="${fg}">${esc(name)}${
              both ? `<tspan dx="6" font-family="${MONO}" font-size="10" font-weight="400" opacity="0.85">${esc(dates)}</tspan>` : ""
            }</text>`
          );
        }
      }
    }
    y += laneH;
  }
  body.push(`<line x1="${M}" y1="${y}" x2="${width - M}" y2="${y}" stroke="${LINE}"/>`);

  // rows
  if (rows.length === 0 && !pinned) {
    body.push(`<text x="${width / 2}" y="${y + 40}" font-size="14" fill="${MUTED}" text-anchor="middle">Nothing to show. Items need dates to appear on the timeline.</text>`);
    y += 80;
  }

  for (const r of rows) {
    if (r.kind === "section") {
      bg.push(`<rect x="${M}" y="${y}" width="${width - 2 * M}" height="${SECTION_H}" fill="${SECTION_BG}"/>`);
      body.push(
        `<rect x="${M + 10}" y="${y + SECTION_H / 2 - 5}" width="10" height="10" rx="2" fill="${COLOR[r.type]}"/>`,
        `<text x="${M + 28}" y="${y + SECTION_H / 2 + 4}" font-size="13" font-weight="700" fill="${INK}">${esc(r.label)}</text>`,
        `<text x="${M + LAB - 10}" y="${y + SECTION_H / 2 + 4}" font-size="10" font-family="${MONO}" fill="${MUTED}" text-anchor="end">${r.count}</text>`
      );
      y += SECTION_H;
      continue;
    }

    const it = r.item;
    const o = config[it.type];
    const p = place(it)!;
    const c = COLOR[it.type];
    const issues = derived.byItem.get(it.id) ?? [];
    const prog = it.type === "epic" && it.key ? derived.progress.get(it.key) : undefined;
    const pct = prog && prog.total > 0 ? prog.done / prog.total : 0;
    const dates = dateText(p);
    const cy = y + ROW_H / 2;
    body.push(`<line x1="${M}" y1="${y + ROW_H}" x2="${width - M}" y2="${y + ROW_H}" stroke="${SOFT}"/>`);

    // label column
    const nx = M + 10 + (r.indent ? 18 : 0);
    const dotColor = it.statusCategory === "done" ? COLOR.feature : it.statusCategory === "inprogress" ? c : GREY;
    body.push(`<circle cx="${nx + 4}" cy="${cy}" r="4" fill="${dotColor}"/>`);
    const reserve = (it.key ? it.key.length * 6.3 + 12 : 0) + (issues.length ? 22 : 0) + 8;
    const nameChars = Math.floor((LAB - (nx - M) - 16 - reserve) / 7);
    const hasDesc = o.name && it.description;
    body.push(`<text x="${nx + 16}" y="${hasDesc ? cy - 2 : cy + 4}" font-size="13" fill="${INK}">${esc(trunc(it.title, nameChars))}</text>`);
    if (hasDesc) {
      body.push(`<text x="${nx + 16}" y="${cy + 11}" font-size="10" fill="${MUTED}">${esc(trunc(it.description!, nameChars + 4))}</text>`);
    }
    let rx = M + LAB - 10;
    if (it.key) {
      body.push(`<text x="${rx}" y="${cy + 4}" font-size="10" font-family="${MONO}" fill="${MUTED}" text-anchor="end">${esc(it.key)}</text>`);
      rx -= it.key.length * 6.3 + 12;
    }
    if (issues.length) {
      const fc = issues[0].severity === "high" ? TODAY : issues[0].severity === "medium" ? AMBER : GREY;
      body.push(
        `<circle cx="${rx - 6}" cy="${cy}" r="7.5" fill="${fc}"/>`,
        `<text x="${rx - 6}" y="${cy + 4}" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">!</text>`
      );
    }

    // bar
    if (p.bad) {
      body.push(`<text x="${x0 + 8}" y="${cy + 4}" font-size="12" fill="${TODAY}">End date is before start date</text>`);
      y += ROW_H;
      continue;
    }
    const left = X(p.s);
    const barW = p.milestone ? 14 : Math.max(X(p.e) - left, 14);
    const plan = labelPlan(it.title, dates, o, { left: left - x0, barW, W, milestone: p.milestone });
    const solid = it.statusCategory !== "todo";
    const top = cy - 13;
    const group = it.statusCategory === "done" ? ' opacity="0.55"' : "";
    const dash = it.rolledUp ? ' stroke-dasharray="2 2" stroke-width="2"' : ' stroke-width="1.5"';

    if (p.milestone) {
      const mx = left + Math.round((X(p.e) - left) / 2);
      body.push(`<g${group}><polygon points="${mx},${cy - 8} ${mx + 8},${cy} ${mx},${cy + 8} ${mx - 8},${cy}" fill="${solid ? c : tint(c, 0.25)}" stroke="${c}"${dash}/></g>`);
    } else {
      let bar = `<rect x="${left}" y="${top}" width="${barW}" height="26" rx="5" fill="${solid ? c : tint(c, 0.16)}" stroke="${c}"${dash}/>`;
      if (pct > 0) {
        const id = `clip${++clipN}`;
        clips.push(`<clipPath id="${id}"><rect x="${left}" y="${top}" width="${barW}" height="26" rx="5"/></clipPath>`);
        bar += `<rect x="${left}" y="${top}" width="${Math.round(barW * pct)}" height="26" fill="${solid ? "rgba(0,0,0,0.26)" : tint(c, 0.34)}" clip-path="url(#${id})"/>`;
      }
      if (it.estimated) bar += `<rect x="${left}" y="${top}" width="${barW}" height="26" rx="5" fill="url(#hatch)"/>`;
      body.push(`<g${group}>${bar}</g>`);
      const fg = solid ? "#ffffff" : INK;
      if (plan.inside !== "none" && o.name) {
        body.push(
          `<text x="${left + 10}" y="${cy + 4}" font-size="12" font-weight="600" fill="${fg}">${esc(it.title)}${
            plan.inside === "all" && o.dates
              ? `<tspan dx="8" font-family="${MONO}" font-size="11" font-weight="400" opacity="0.85">${esc(dates)}</tspan>`
              : ""
          }</text>`
        );
      } else if (plan.inside === "all" && o.dates) {
        body.push(`<text x="${left + 10}" y="${cy + 4}" font-size="11" font-family="${MONO}" fill="${fg}">${esc(dates)}</text>`);
      }
    }
    if (plan.outside.length) {
      const tx = plan.flip ? left - 8 : left + barW + 8;
      const spans = plan.outside
        .map((s, i) =>
          s.cls === "t"
            ? `<tspan font-weight="600" fill="${INK}">${esc(s.text)}</tspan>`
            : `<tspan${i > 0 ? ' dx="8"' : ""} font-family="${MONO}" font-size="11" fill="${MUTED}">${esc(s.text)}</tspan>`
        )
        .join("");
      body.push(`<text x="${tx}" y="${cy + 4}" font-size="12"${plan.flip ? ' text-anchor="end"' : ""}>${spans}</text>`);
    }
    y += ROW_H;
  }

  const contentBottom = y;

  // ----- header: months and gridlines -----
  const grid: string[] = [];
  const head: string[] = [];
  for (let i = 0; i < months; i++) {
    const ms = addMonths(vs, i);
    const d = new Date(ms);
    const label = d.toLocaleDateString("en-GB", { month: "short", year: d.getUTCMonth() === 0 || i === 0 ? "numeric" : undefined, timeZone: "UTC" });
    grid.push(`<line x1="${X(ms)}" y1="${headerY}" x2="${X(ms)}" y2="${contentBottom}" stroke="${SOFT}"/>`);
    head.push(`<text x="${X(ms) + 7}" y="${headerY + 18}" font-size="11" font-family="${MONO}" fill="${MUTED}">${esc(label)}</text>`);
  }
  grid.push(`<line x1="${X(addMonths(vs, months))}" y1="${headerY}" x2="${X(addMonths(vs, months))}" y2="${contentBottom}" stroke="${SOFT}"/>`);
  head.push(
    `<text x="${M + 10}" y="${headerY + 18}" font-size="11" font-family="${MONO}" fill="${MUTED}" letter-spacing="0.8">TIMELINE</text>`,
    `<line x1="${M}" y1="${headerY + headerH}" x2="${width - M}" y2="${headerY + headerH}" stroke="${LINE}"/>`,
    `<line x1="${x0}" y1="${headerY}" x2="${x0}" y2="${contentBottom}" stroke="${LINE}"/>`
  );
  const tx = X(today);
  const todayEls = [
    `<line x1="${tx}" y1="${headerY - 2}" x2="${tx}" y2="${contentBottom}" stroke="${TODAY}" stroke-width="2"/>`,
    `<rect x="${tx + 3}" y="${headerY - 18}" width="42" height="15" rx="3" fill="${TODAY}"/>`,
    `<text x="${tx + 24}" y="${headerY - 7}" font-size="10" font-family="${MONO}" fill="#ffffff" text-anchor="middle">Today</text>`,
  ];

  // ----- title -----
  const titleEls: string[] = [
    `<text x="${M}" y="34" font-size="22" font-weight="700" fill="${INK}">${esc(input.title)}</text>`,
  ];
  const shown = LAYERS.filter((l) => config[l.type].show).map((l) => l.label);
  titleEls.push(`<text x="${M}" y="54" font-size="12" fill="${MUTED}">${esc([input.viewName, shown.join(", ")].filter(Boolean).join("  ·  "))}</text>`);
  if ((config.epic.show || config.feature.show) && derived.insights.length) {
    const n = (s: string) => derived.insights.filter((i) => i.severity === s).length;
    const parts = (["high", "medium", "low"] as const).filter((s) => n(s) > 0).map((s) => `${n(s)} ${s}`);
    titleEls.push(
      `<text x="${width - M}" y="34" font-size="12" font-weight="600" fill="${n("high") ? TODAY : AMBER}" text-anchor="end">${derived.insights.length} ${derived.insights.length === 1 ? "thing needs" : "things need"} attention</text>`,
      `<text x="${width - M}" y="54" font-size="11" fill="${MUTED}" text-anchor="end">${esc(parts.join(" · "))}</text>`
    );
  }

  // ----- legend and footer -----
  const foot: string[] = [];
  let fy = contentBottom + 28;
  const visible = new Set<ItemType>(rows.flatMap((r) => (r.kind === "section" ? [r.type] : [])));
  if (rows.some((r) => r.kind === "item" && r.item.type === "feature")) visible.add("feature");
  if (pinned) visible.add(pinned.type);
  const notes: string[] = ["Outlined: not started", "Solid: in progress", "Faded: done"];
  if (rows.some((r) => r.kind === "item" && r.item.key && derived.progress.has(r.item.key))) notes.push("Darker fill: Features done");
  if (rows.some((r) => r.kind === "item" && r.item.estimated) || pinned?.items.some((i) => i.estimated)) notes.push("Hatched: estimated from activity");
  if (rows.some((r) => r.kind === "item" && r.item.rolledUp)) notes.push("Dotted: dates rolled up from Features");
  let lx = M;
  const legendX = (w: number) => {
    if (lx + w > width - M) {
      lx = M;
      fy += 18;
    }
    const at = lx;
    lx += w;
    return at;
  };
  for (const l of LAYERS.filter((l) => visible.has(l.type))) {
    const w = 26 + l.label.length * 6.4 + 16;
    const at = legendX(w);
    foot.push(`<rect x="${at}" y="${fy - 9}" width="18" height="10" rx="2" fill="${COLOR[l.type]}"/>`, `<text x="${at + 24}" y="${fy}" font-size="11" fill="${MUTED}">${esc(l.label)}</text>`);
  }
  for (const nText of notes) {
    const w = nText.length * 6.2 + 20;
    const at = legendX(w);
    foot.push(`<text x="${at}" y="${fy}" font-size="11" fill="${MUTED}">${esc(nText)}</text>`);
  }
  if (built.unscheduled.length) {
    fy += 24;
    const names = built.unscheduled.map((i) => i.title).join(", ");
    const line = `Not scheduled yet (${built.unscheduled.length}): ${names}`;
    foot.push(`<text x="${M}" y="${fy}" font-size="11" fill="${MUTED}">${esc(trunc(line, Math.floor((width - 2 * M) / 6.1)))}</text>`);
  }
  fy += 26;
  const gen = new Date(today).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  foot.push(`<text x="${M}" y="${fy}" font-size="10" fill="${MUTED}">${esc(`Generated ${gen}  ·  ${input.sourceLabel}`)}</text>`);
  const height = fy + 18;

  const defs =
    `<defs><pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="9" stroke="rgba(0,0,0,0.18)" stroke-width="3"/></pattern>${clips.join("")}</defs>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}" role="img" aria-label="${esc(input.title)}">` +
    defs +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    bg.join("") + grid.join("") + todayEls.join("") + titleEls.join("") + head.join("") + body.join("") + foot.join("") +
    `</svg>`;
  return { svg, width, height };
}
