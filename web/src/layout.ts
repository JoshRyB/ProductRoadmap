import { DAY } from "./rows";
import type { Placement } from "./rows";

/** Rough width of one character at the bar font size. Used to decide where text fits. */
export const CHAR = 6.7;

export const monthStart = (t: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

export const addMonths = (t: number, n: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};

export const fmtShort = (t: number): string =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function dateText(p: Placement): string {
  return p.milestone ? fmtShort(p.s) : `${fmtShort(p.s)} – ${fmtShort(p.e - DAY)}`;
}

/** The months the timeline covers: from the month of the earliest date, at least six months long. */
export function timelineRange(times: number[]): { vs: number; months: number; totalDays: number } {
  const vs = monthStart(Math.min(...times));
  let months = 0;
  while (addMonths(vs, months) <= Math.max(...times)) months++;
  months = Math.max(months + 1, 6);
  return { vs, months, totalDays: Math.round((addMonths(vs, months) - vs) / DAY) };
}

export interface LabelPlan {
  /** what is written on the bar itself */
  inside: "all" | "name" | "none";
  /** what is written beside the bar because it doesn't fit */
  outside: Array<{ text: string; cls: "t" | "d" }>;
  /** write the outside text to the left of the bar because there is no room on the right */
  flip: boolean;
}

/** Decides where a bar's name and dates go: inside if they fit, otherwise beside it. */
export function labelPlan(
  title: string,
  dates: string,
  opts: { name: boolean; dates: boolean },
  g: { left: number; barW: number; W: number; milestone: boolean }
): LabelPlan {
  const textW = (s: string) => s.length * CHAR;
  const parts: string[] = [];
  if (opts.name) parts.push(title);
  if (opts.dates) parts.push(dates);
  const fullW = 20 + parts.reduce((n, s) => n + textW(s), 0) + (parts.length > 1 ? 8 : 0);
  const nameW = opts.name ? 20 + textW(title) : Infinity;
  const inside: LabelPlan["inside"] =
    g.milestone || parts.length === 0 ? "none" : g.barW >= fullW ? "all" : g.barW >= nameW ? "name" : "none";

  const outside: LabelPlan["outside"] = [];
  if (inside === "none") {
    if (opts.name) outside.push({ text: title, cls: "t" });
    if (opts.dates) outside.push({ text: dates, cls: "d" });
  } else if (inside === "name" && opts.dates) {
    outside.push({ text: dates, cls: "d" });
  }
  const outsideW = outside.reduce((n, o) => n + textW(o.text), 0) + (outside.length > 1 ? 8 : 0) + 12;
  const flip = g.left + g.barW + outsideW > g.W && g.left - outsideW > 0;
  return { inside, outside, flip };
}
